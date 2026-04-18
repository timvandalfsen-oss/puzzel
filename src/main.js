// Entry point: UI-flow, screen-switching, timer, upload, manage, save/resume.

import {
  getStockImages, getOwnImages, pickRandom,
  uploadAndStore, removeUserPhoto, resolveImageUrl, getBundledImages,
} from "./images.js";
import { listPhotos, saveGameState, loadGameState, clearGameState } from "./storage.js";
import { createGame, DIFFICULTIES } from "./puzzle.js";
import { celebrate } from "./confetti.js";

// ---------- DOM refs ----------
const screens = {
  menu: document.getElementById("screen-menu"),
  game: document.getElementById("screen-game"),
  win:  document.getElementById("screen-win"),
};
const diffButtons = document.querySelectorAll(".diff-btn");
const srcButtons = document.querySelectorAll(".src-btn");
const startBtn = document.getElementById("start-btn");
const menuHint = document.getElementById("menu-hint");
const uploadInput = document.getElementById("upload-input");
const manageBtn = document.getElementById("manage-btn");
const manageDialog = document.getElementById("manage-dialog");
const manageGrid = document.getElementById("manage-grid");

const bundledCountEl = document.getElementById("bundled-count");
const uploadedCountEl = document.getElementById("uploaded-count");
const ownCountEl = document.getElementById("own-count");

const resumeBanner = document.getElementById("resume-banner");
const resumeBtn = document.getElementById("resume-btn");
const resumeDismiss = document.getElementById("resume-dismiss");

const backBtn = document.getElementById("back-btn");
const shuffleBtn = document.getElementById("shuffle-btn");
const gameTimerEl = document.getElementById("game-timer");
const gameProgressEl = document.getElementById("game-progress");
const gameArea = document.getElementById("game-area");

const winTimeEl = document.getElementById("win-time");
const winDiffEl = document.getElementById("win-difficulty");
const winPreview = document.getElementById("win-preview");
const winAgainBtn = document.getElementById("win-again");

const installBtnWrap = document.getElementById("install-btn-wrap");
const installBtn = document.getElementById("install-btn");

// ---------- State ----------
let selectedDifficulty = null;
let selectedSource = null;  // "stock" | "own" | "random"
let currentDifficulty = null;  // actieve moeilijkheid van de lopende game
let currentGame = null;
let currentImageRef = null; // voor save
let currentImageUrl = null;
let timerInterval = null;
let timerStartMs = 0;
let timerElapsedMs = 0;
let deferredInstallPrompt = null;

// ---------- Screens ----------
function showScreen(name) {
  for (const k in screens) screens[k].classList.toggle("active", k === name);
}

// ---------- Menu: selection logic ----------
diffButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    diffButtons.forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedDifficulty = btn.dataset.difficulty;
    updateStartEnabled();
  });
});

srcButtons.forEach(btn => {
  btn.addEventListener("click", () => {
    srcButtons.forEach(b => b.classList.remove("selected"));
    btn.classList.add("selected");
    selectedSource = btn.dataset.source;
    updateStartEnabled();
  });
});

function updateStartEnabled() {
  const isRandom = selectedSource === "random";
  const ready = isRandom || (selectedDifficulty && selectedSource);
  startBtn.disabled = !ready;
  if (!ready) {
    if (!selectedSource) menuHint.textContent = "Kies een foto-bron (of Random).";
    else menuHint.textContent = "Kies een moeilijkheid.";
    return;
  }
  if (isRandom) {
    menuHint.textContent = "🎲 Verrassing: willekeurige foto en moeilijkheid.";
  } else {
    const srcLabel = selectedSource === "stock" ? "stock" : "eigen";
    menuHint.textContent = `${DIFFICULTIES[selectedDifficulty].label} • willekeurige ${srcLabel} foto`;
  }
}

startBtn.addEventListener("click", startNewGame);

// ---------- Counts updaten ----------
async function refreshCounts() {
  const [bundled, user] = await Promise.all([getBundledImages(), listPhotos()]);
  bundledCountEl.textContent = bundled.length;
  uploadedCountEl.textContent = user.length;
  ownCountEl.textContent = bundled.length + user.length;
}

// ---------- Upload ----------
uploadInput.addEventListener("change", async (e) => {
  const file = e.target.files?.[0];
  if (!file) return;
  uploadInput.value = "";
  try {
    startBtn.disabled = true;
    menuHint.textContent = "Foto toevoegen…";
    await uploadAndStore(file);
    await refreshCounts();
    menuHint.textContent = "Foto toegevoegd!";
    setTimeout(updateStartEnabled, 1200);
  } catch (err) {
    console.error(err);
    menuHint.textContent = "Kon foto niet toevoegen: " + err.message;
  }
});

// ---------- Manage ----------
manageBtn.addEventListener("click", async () => {
  await renderManageGrid();
  manageDialog.showModal();
});

async function renderManageGrid() {
  manageGrid.innerHTML = "";
  const [bundled, user] = await Promise.all([getBundledImages(), listPhotos()]);
  for (const img of bundled) {
    const div = document.createElement("div");
    div.className = "manage-thumb bundled";
    const im = document.createElement("img");
    im.src = img.url;
    div.appendChild(im);
    manageGrid.appendChild(div);
  }
  for (const rec of user) {
    const div = document.createElement("div");
    div.className = "manage-thumb removable";
    const im = document.createElement("img");
    im.src = URL.createObjectURL(rec.blob);
    div.appendChild(im);
    div.addEventListener("click", async () => {
      if (!confirm("Deze foto verwijderen?")) return;
      await removeUserPhoto(rec.id);
      URL.revokeObjectURL(im.src);
      await renderManageGrid();
      await refreshCounts();
    });
    manageGrid.appendChild(div);
  }
}

// ---------- Start new game ----------
async function startNewGame() {
  menuHint.textContent = "Bezig met laden…";
  try {
    let pool;
    let difficulty = selectedDifficulty;
    if (selectedSource === "random") {
      // Kies willekeurig een moeilijkheid en combineer beide pools.
      const diffs = Object.keys(DIFFICULTIES);
      difficulty = diffs[Math.floor(Math.random() * diffs.length)];
      const [stock, own] = await Promise.all([getStockImages(), getOwnImages()]);
      pool = [...stock, ...own];
    } else if (selectedSource === "stock") {
      pool = await getStockImages();
    } else {
      pool = await getOwnImages();
    }
    if (!pool.length) {
      menuHint.textContent = selectedSource === "own"
        ? "Voeg eerst een eigen foto toe."
        : "Geen foto's gevonden.";
      return;
    }
    const picked = pickRandom(pool);
    await launchGame({
      difficulty,
      imageRef: { kind: picked.kind, url: picked.url, id: picked.id },
      imageUrl: picked.url,
    });
  } catch (err) {
    console.error(err);
    menuHint.textContent = "Fout: " + err.message;
  }
}

async function launchGame({ difficulty, imageRef, imageUrl }) {
  currentImageRef = imageRef;
  currentImageUrl = imageUrl;
  currentDifficulty = difficulty;
  showScreen("game");
  // Wacht tot game-area gelayout is (setTimeout i.p.v. rAF,
  // want rAF pauzeert in achtergrond-tabs / iframes zonder focus).
  await new Promise(r => setTimeout(r, 0));

  if (currentGame) { currentGame.destroy(); currentGame = null; }

  currentGame = await createGame({
    imageRef, imageUrl, difficulty, gameArea,
    onWin: onGameWin,
    onProgress: onGameProgress,
    onSave: onGameSave,
  });

  startTimer();
  onGameProgress(0, currentGame.pieces.length);
}

// ---------- Game events ----------
function onGameProgress(placed, total) {
  gameProgressEl.textContent = `${placed}/${total}`;
}

function onGameSave(serialized) {
  // Bewaar periodiek de volledige state zodat we kunnen resumen
  saveGameState({
    ...serialized,
    difficulty: currentDifficulty,
    elapsedMs: timerElapsedMs + (Date.now() - timerStartMs),
    savedAt: Date.now(),
  }).catch(e => console.warn("save mislukt:", e));
}

function onGameWin() {
  stopTimer();
  clearGameState();
  winTimeEl.textContent = formatTime(timerElapsedMs);
  winDiffEl.textContent = DIFFICULTIES[currentDifficulty].label;
  winPreview.src = currentImageUrl;
  showScreen("win");
  celebrate();
}

// ---------- Timer ----------
function startTimer() {
  timerStartMs = Date.now();
  timerElapsedMs = 0;
  gameTimerEl.textContent = "00:00";
  timerInterval = setInterval(() => {
    const total = timerElapsedMs + (Date.now() - timerStartMs);
    gameTimerEl.textContent = formatTime(total);
  }, 250);
}

function stopTimer() {
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = null;
  timerElapsedMs += (Date.now() - timerStartMs);
}

function formatTime(ms) {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const r = s % 60;
  return String(m).padStart(2, "0") + ":" + String(r).padStart(2, "0");
}

// ---------- Back / shuffle / again ----------
backBtn.addEventListener("click", () => {
  stopTimer();
  // Save state zodat we kunnen resumen
  if (currentGame) onGameSave(currentGame.serialize());
  returnToMenu();
});

shuffleBtn.addEventListener("click", () => {
  if (currentGame) currentGame.shuffle();
});

winAgainBtn.addEventListener("click", returnToMenu);

function returnToMenu() {
  if (currentGame) { currentGame.destroy(); currentGame = null; }
  showScreen("menu");
  refreshResume();
}

// ---------- Resume ----------
async function refreshResume() {
  const state = await loadGameState();
  if (state && state.placedIds && state.placedIds.length > 0) {
    resumeBanner.classList.remove("hidden");
  } else {
    resumeBanner.classList.add("hidden");
  }
}

resumeBtn.addEventListener("click", async () => {
  const state = await loadGameState();
  if (!state) return;
  selectedDifficulty = state.difficulty;
  const url = await resolveImageUrl(state.imageRef);
  if (!url) {
    alert("De bijbehorende foto is niet meer beschikbaar.");
    await clearGameState();
    await refreshResume();
    return;
  }
  await launchGame({
    difficulty: state.difficulty,
    imageRef: state.imageRef,
    imageUrl: url,
  });
  // Herstel placed pieces
  currentGame.restore(state);
  // Herstel timer-elapsed
  timerElapsedMs = state.elapsedMs || 0;
  timerStartMs = Date.now();
});

resumeDismiss.addEventListener("click", async () => {
  await clearGameState();
  await refreshResume();
});

// ---------- Install prompt ----------
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  deferredInstallPrompt = e;
  installBtnWrap.classList.remove("hidden");
});

installBtn.addEventListener("click", async () => {
  if (!deferredInstallPrompt) return;
  deferredInstallPrompt.prompt();
  const choice = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  installBtnWrap.classList.add("hidden");
  if (choice && choice.outcome) console.log("Install keuze:", choice.outcome);
});

// ---------- Init ----------
refreshCounts();
refreshResume();
updateStartEnabled();
