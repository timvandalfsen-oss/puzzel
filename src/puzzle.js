// Puzzle engine v2 — vrij plaatsen + groep-snap.
//
// Kernregels:
//   - Je kunt een stukje overal op het game-area neerleggen.
//   - Daar kun je hem weer oppakken (hij gaat niet vanzelf terug naar de tray).
//   - Twee aangrenzende stukjes (in het grid) die in het veld naast elkaar liggen
//     op de juiste RELATIEVE positie (binnen snap-threshold) plakken automatisch
//     aan elkaar vast tot een groep.
//   - Een groep pak je als geheel op — alle leden schuiven mee.
//   - De puzzel is gewonnen zodra alle stukjes in één groep zitten.
//   - Drop je een (groep van) stukje(s) boven de tray, dan keren ze los terug in
//     de tray (groep wordt gesplitst).
//
// Piece-states:
//   - "in_tray" : static flex-child van #tray
//   - "free"    : absolute child van #game-area, met piece.x / piece.y
//   - "dragging": position:fixed in body
//
// Groepen: elke piece heeft een .group (Group-instance). Bij start zit elke piece
// in zijn eigen groep van 1. Bij snap worden groepen gemergd.

import { loadImageElement } from "./images.js";

export const DIFFICULTIES = {
  easy:   { cols: 3, rows: 4, label: "Makkelijk" },
  medium: { cols: 5, rows: 7, label: "Middel" },
  hard:   { cols: 8, rows: 10, label: "Moeilijk" },
};

const TRAY_HEIGHT_RATIO = 0.35;
const TRAY_MIN = 160;
const TRAY_MAX = 280;
const BOARD_MARGIN = 12;
const SNAP_THRESHOLD_RATIO = 0.4;   // 40% van piece-dimensie (per as)

// ---------- Group ----------
class Group {
  static _nextId = 1;
  constructor(piece) {
    this.id = Group._nextId++;
    this.pieces = new Set();
    this.add(piece);
  }
  add(piece) {
    this.pieces.add(piece);
    piece.group = this;
  }
  get size() { return this.pieces.size; }
}

function mergeGroups(keep, other) {
  for (const p of other.pieces) keep.add(p);
  other.pieces.clear();
}

// ---------- PuzzleGame ----------
export class PuzzleGame {
  constructor({ image, imageRef, cols, rows, gameArea, onWin, onProgress, onSave, onStreak }) {
    this.image = image;
    this.imageRef = imageRef;
    this.cols = cols;
    this.rows = rows;
    this.gameArea = gameArea;
    this.onWin = onWin || (() => {});
    this.onProgress = onProgress || (() => {});
    this.onSave = onSave || (() => {});
    this.onStreak = onStreak || (() => {});
    this.pieces = [];
    this._pieceByGridKey = new Map();
    this._done = false;
    this.streak = 0;
  }

  async init() {
    this.board = this.gameArea.querySelector("#board");
    this.trayWrap = this.gameArea.querySelector("#tray-wrap");
    this.tray = this.gameArea.querySelector("#tray");

    this._layout();
    this._buildCells();
    this._buildPieces();
    this._shuffleIntoTray(this.pieces);
    this._reportProgress();

    this._resizeHandler = () => this.resize();
    window.addEventListener("resize", this._resizeHandler);
    window.addEventListener("orientationchange", this._resizeHandler);
  }

  destroy() {
    window.removeEventListener("resize", this._resizeHandler);
    window.removeEventListener("orientationchange", this._resizeHandler);
    for (const p of this.pieces) p.el.remove();
    if (this.tray) this.tray.innerHTML = "";
    if (this.board) this.board.innerHTML = "";
  }

  // ---------- Layout ----------
  _layout() {
    const rect = this.gameArea.getBoundingClientRect();
    this.gameW = rect.width;
    this.gameH = rect.height;

    const trayH = Math.max(TRAY_MIN, Math.min(TRAY_MAX, Math.round(this.gameH * TRAY_HEIGHT_RATIO)));
    this.trayH = trayH;

    const boardMaxW = this.gameW - BOARD_MARGIN * 2;
    const boardMaxH = this.gameH - trayH - BOARD_MARGIN * 2;

    const imgRatio = this.image.width / this.image.height;
    const boxRatio = boardMaxW / boardMaxH;
    if (imgRatio > boxRatio) {
      this.boardW = Math.floor(boardMaxW);
      this.boardH = Math.floor(boardMaxW / imgRatio);
    } else {
      this.boardH = Math.floor(boardMaxH);
      this.boardW = Math.floor(boardMaxH * imgRatio);
    }

    this.pieceW = Math.floor(this.boardW / this.cols);
    this.pieceH = Math.floor(this.boardH / this.rows);
    this.boardW = this.pieceW * this.cols;
    this.boardH = this.pieceH * this.rows;

    this.boardX = Math.round((this.gameW - this.boardW) / 2);
    this.boardY = Math.round(((this.gameH - trayH) - this.boardH) / 2);

    Object.assign(this.board.style, {
      left: this.boardX + "px",
      top:  this.boardY + "px",
      width:  this.boardW + "px",
      height: this.boardH + "px",
    });
    Object.assign(this.trayWrap.style, { height: trayH + "px" });

    this.trayTopY = this.gameH - trayH;  // y in game-area coords waar tray begint
  }

  _buildCells() {
    this.board.innerHTML = "";
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const cell = document.createElement("div");
        cell.className = "cell";
        Object.assign(cell.style, {
          left: (c * this.pieceW) + "px",
          top:  (r * this.pieceH) + "px",
          width: this.pieceW + "px",
          height: this.pieceH + "px",
        });
        this.board.appendChild(cell);
      }
    }
  }

  _buildPieces() {
    for (const p of this.pieces) p.el.remove();
    this.tray.innerHTML = "";
    this.pieces = [];
    this._pieceByGridKey.clear();

    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < this.cols; c++) {
        const id = r * this.cols + c;
        const el = document.createElement("div");
        el.className = "piece";
        el.dataset.id = String(id);
        Object.assign(el.style, {
          width: this.pieceW + "px",
          height: this.pieceH + "px",
          backgroundImage: `url("${this.image.src}")`,
          backgroundSize: `${this.boardW}px ${this.boardH}px`,
          backgroundPosition: `-${c * this.pieceW}px -${r * this.pieceH}px`,
        });
        const piece = {
          id, correctCol: c, correctRow: r, el,
          state: "in_tray", x: 0, y: 0, group: null,
        };
        new Group(piece);  // zet piece.group
        this.pieces.push(piece);
        this._pieceByGridKey.set(`${c},${r}`, piece);
        this._attachDrag(piece);
      }
    }
  }

  _shuffleIntoTray(pieces) {
    const order = pieces.slice();
    for (let i = order.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [order[i], order[j]] = [order[j], order[i]];
    }
    for (const p of order) this._putInTray(p);
  }

  shuffle() {
    // Reset: breek alle groepen en leg alles terug in tray
    for (const p of this.pieces) new Group(p);
    this.tray.innerHTML = "";
    this._shuffleIntoTray(this.pieces);
    this._done = false;
    this._reportProgress();
    this._saveAsync();
  }

  resize() {
    // Bij resize: hergebruik layout, herschaal pieces, behoud tray/free staat
    const freePieces = this.pieces.filter(p => p.state === "free");
    this._layout();
    this._buildCells();
    for (const p of this.pieces) {
      Object.assign(p.el.style, {
        width: this.pieceW + "px",
        height: this.pieceH + "px",
        backgroundSize: `${this.boardW}px ${this.boardH}px`,
        backgroundPosition: `-${p.correctCol * this.pieceW}px -${p.correctRow * this.pieceH}px`,
      });
    }
    // Free pieces clampen binnen game-area
    for (const p of freePieces) {
      p.x = Math.max(0, Math.min(this.gameW - this.pieceW, p.x));
      p.y = Math.max(0, Math.min(this.gameH - this.pieceH, p.y));
      this._applyFreePosition(p);
    }
  }

  // ---------- Piece state transitions ----------
  _putInTray(piece) {
    piece.state = "in_tray";
    piece.el.classList.remove("dragging");
    piece.el.style.position = "";
    piece.el.style.left = "";
    piece.el.style.top = "";
    piece.el.style.transform = "";
    piece.el.style.margin = "";
    this.tray.appendChild(piece.el);
    // Tray-piece krijgt eigen groep (geen koppelingen in tray)
    if (piece.group.size > 1) {
      // Uit groep halen: zet piece in nieuwe eigen groep
      piece.group.pieces.delete(piece);
      new Group(piece);
    }
  }

  _setFree(piece, x, y) {
    piece.state = "free";
    piece.x = x;
    piece.y = y;
    piece.el.classList.remove("dragging");
    piece.el.style.position = "absolute";
    piece.el.style.margin = "0";
    if (piece.el.parentElement !== this.gameArea) this.gameArea.appendChild(piece.el);
    this._applyFreePosition(piece);
  }

  _applyFreePosition(piece) {
    piece.el.style.left = piece.x + "px";
    piece.el.style.top = piece.y + "px";
  }

  // ---------- Drag ----------
  _attachDrag(piece) {
    const onDown = (e) => this._startDrag(piece, e);
    piece.el.addEventListener("pointerdown", onDown);
  }

  _startDrag(piece, e) {
    if (this._done) return;
    e.preventDefault();
    e.stopPropagation();

    // Pak hele groep op (1+ pieces)
    const group = piece.group;
    const members = Array.from(group.pieces);

    // Voor elke piece: record viewport-rect en zet position: fixed in body.
    const startRects = new Map();
    for (const p of members) {
      const r = p.el.getBoundingClientRect();
      startRects.set(p, { left: r.left, top: r.top });
      p.el.classList.add("dragging");
      p.el.style.position = "fixed";
      p.el.style.left = r.left + "px";
      p.el.style.top = r.top + "px";
      p.el.style.margin = "0";
      document.body.appendChild(p.el);
      p.state = "dragging";
    }

    // Pointer-offset t.o.v. de gepakte piece
    const anchorStart = startRects.get(piece);
    const offsetX = e.clientX - anchorStart.left;
    const offsetY = e.clientY - anchorStart.top;

    try { piece.el.setPointerCapture(e.pointerId); } catch {}

    const onMove = (ev) => {
      ev.preventDefault();
      const anchorLeft = ev.clientX - offsetX;
      const anchorTop  = ev.clientY - offsetY;
      const dx = anchorLeft - anchorStart.left;
      const dy = anchorTop  - anchorStart.top;
      for (const p of members) {
        const s = startRects.get(p);
        p.el.style.left = (s.left + dx) + "px";
        p.el.style.top  = (s.top  + dy) + "px";
      }
    };

    const onUp = (ev) => {
      piece.el.removeEventListener("pointermove", onMove);
      piece.el.removeEventListener("pointerup", onUp);
      piece.el.removeEventListener("pointercancel", onUp);
      try { piece.el.releasePointerCapture(ev.pointerId); } catch {}
      this._endDrag(piece, members, ev);
    };

    piece.el.addEventListener("pointermove", onMove);
    piece.el.addEventListener("pointerup", onUp);
    piece.el.addEventListener("pointercancel", onUp);
  }

  _endDrag(anchor, members, e) {
    const gameRect = this.gameArea.getBoundingClientRect();

    // Waar staat de gepakte piece nu in game-area coords?
    const anchorRect = anchor.el.getBoundingClientRect();
    const anchorGameY = anchorRect.top + anchorRect.height / 2 - gameRect.top;

    const droppedOnTray = anchorGameY > this.trayTopY;

    let mergedThisDrop = false;
    if (droppedOnTray) {
      // Splits groep + legt alles terug in tray → streak-reset
      for (const p of members) this._putInTray(p);
      this.streak = 0;
    } else {
      // Plaats alle leden free op hun nieuwe positie
      for (const p of members) {
        const r = p.el.getBoundingClientRect();
        const x = r.left - gameRect.left;
        const y = r.top  - gameRect.top;
        this._setFree(p, x, y);
      }
      // Probeer te mergen met buren
      mergedThisDrop = this._tryMergeGroupNeighbors(anchor.group);

      if (mergedThisDrop) {
        this.streak++;
        if (this.streak > 0 && this.streak % 3 === 0) {
          try { this.onStreak(this.streak); } catch (e) { /* ignore */ }
        }
      } else {
        this.streak = 0;
      }
    }

    this._reportProgress();
    this._saveAsync();

    // Win-check: alle pieces in één groep
    const distinctGroups = new Set(this.pieces.map(p => p.group)).size;
    if (distinctGroups === 1 && !this._done) {
      this._done = true;
      this.onWin();
    }
  }

  // ---------- Merge-logica ----------
  // Return: true als minstens één merge heeft plaatsgevonden.
  _tryMergeGroupNeighbors(group) {
    const thrX = this.pieceW * SNAP_THRESHOLD_RATIO;
    const thrY = this.pieceH * SNAP_THRESHOLD_RATIO;
    let anyMerged = false;
    let merged = true;
    let safety = 0;
    while (merged && safety++ < 20) {
      merged = false;
      const members = Array.from(group.pieces);
      for (const p of members) {
        // 4 grid-buren
        const neighbors = [
          { dc: -1, dr: 0 }, { dc: 1, dr: 0 },
          { dc: 0, dr: -1 }, { dc: 0, dr: 1 },
        ];
        for (const { dc, dr } of neighbors) {
          const nc = p.correctCol + dc;
          const nr = p.correctRow + dr;
          if (nc < 0 || nc >= this.cols || nr < 0 || nr >= this.rows) continue;
          const b = this._pieceByGridKey.get(`${nc},${nr}`);
          if (!b || b.state !== "free" || b.group === group) continue;

          const expectedBx = p.x + dc * this.pieceW;
          const expectedBy = p.y + dr * this.pieceH;
          const ddx = b.x - expectedBx;
          const ddy = b.y - expectedBy;
          if (Math.abs(ddx) >= thrX || Math.abs(ddy) >= thrY) continue;

          // Shift andere groep zodat b precies op expected ligt, merge
          const other = b.group;
          for (const op of other.pieces) {
            op.x -= ddx;
            op.y -= ddy;
            this._applyFreePosition(op);
          }
          mergeGroups(group, other);
          merged = true;
          anyMerged = true;
          break;
        }
        if (merged) break;
      }
    }
    return anyMerged;
  }

  // ---------- Progress ----------
  _reportProgress() {
    const total = this.pieces.length;
    if (total === 0) { this.onProgress(0, 0); return; }
    // Maat: pieces die in een groep van >=2 zitten
    const connected = this.pieces.filter(p => p.group.size >= 2).length;
    this.onProgress(connected, total);
  }

  // ---------- Save / restore ----------
  serialize() {
    const groupIds = new Map();
    let gid = 0;
    for (const p of this.pieces) {
      if (!groupIds.has(p.group)) groupIds.set(p.group, gid++);
    }
    return {
      imageRef: this.imageRef,
      cols: this.cols,
      rows: this.rows,
      pieces: this.pieces.map(p => ({
        id: p.id,
        state: p.state === "dragging" ? "free" : p.state,
        x: p.x, y: p.y,
        group: groupIds.get(p.group),
      })),
      trayOrder: Array.from(this.tray.children).map(el => Number(el.dataset.id)),
    };
  }

  restore(state) {
    if (!state || !Array.isArray(state.pieces)) return;
    // Eerst alle pieces resetten naar eigen groep
    for (const p of this.pieces) new Group(p);

    const byId = new Map(this.pieces.map(p => [p.id, p]));
    // Groepen opbouwen via state.group-identifier
    const groupsByGid = new Map();
    for (const rec of state.pieces) {
      const p = byId.get(rec.id);
      if (!p) continue;
      if (!groupsByGid.has(rec.group)) groupsByGid.set(rec.group, p.group);
      else {
        const keep = groupsByGid.get(rec.group);
        if (keep !== p.group) {
          mergeGroups(keep, p.group);
        }
      }
    }

    for (const rec of state.pieces) {
      const p = byId.get(rec.id);
      if (!p) continue;
      if (rec.state === "free") {
        this._setFree(p, rec.x, rec.y);
      } else {
        this._putInTray(p);
      }
    }

    // Tray-order respecteren
    if (Array.isArray(state.trayOrder)) {
      for (const id of state.trayOrder) {
        const p = byId.get(id);
        if (p && p.state === "in_tray") this.tray.appendChild(p.el);
      }
    }

    this._done = false;
    this._reportProgress();
  }

  _saveAsync() {
    try { this.onSave(this.serialize()); } catch (e) { console.warn("save failed", e); }
  }
}

export async function createGame({ imageRef, imageUrl, difficulty, gameArea, onWin, onProgress, onSave, onStreak }) {
  const { cols, rows } = DIFFICULTIES[difficulty];
  const image = await loadImageElement(imageUrl);
  const game = new PuzzleGame({
    image, imageRef, cols, rows, gameArea, onWin, onProgress, onSave, onStreak,
  });
  await game.init();
  return game;
}
