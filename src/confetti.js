// Kleine wrapper rond canvas-confetti, geladen van een CDN als ESM.
// Fallback naar een ingebouwde mini-confetti als CDN niet bereikbaar is (offline).

let _confettiModule = null;

async function load() {
  if (_confettiModule) return _confettiModule;
  try {
    const mod = await import("https://esm.sh/canvas-confetti@1.9.3");
    _confettiModule = mod.default;
  } catch (e) {
    console.warn("confetti CDN niet beschikbaar, fallback", e);
    _confettiModule = fallbackConfetti;
  }
  return _confettiModule;
}

export async function celebrate() {
  const confetti = await load();
  const duration = 1500;
  const end = Date.now() + duration;
  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60, spread: 55, origin: { x: 0 },
      colors: ["#efbe7d", "#aac79c", "#98b4d4", "#dfa19f"],
    });
    confetti({
      particleCount: 4,
      angle: 120, spread: 55, origin: { x: 1 },
      colors: ["#efbe7d", "#aac79c", "#98b4d4", "#dfa19f"],
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

// ---------- Mini fallback ----------
function fallbackConfetti(opts = {}) {
  const canvas = document.createElement("canvas");
  canvas.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:9999;";
  canvas.width = innerWidth; canvas.height = innerHeight;
  document.body.appendChild(canvas);
  const ctx = canvas.getContext("2d");
  const colors = opts.colors || ["#efbe7d", "#aac79c", "#98b4d4"];
  const n = opts.particleCount || 50;
  const particles = Array.from({ length: n }, () => ({
    x: (opts.origin?.x ?? 0.5) * innerWidth,
    y: (opts.origin?.y ?? 0.5) * innerHeight,
    vx: (Math.random() - 0.5) * 10,
    vy: Math.random() * -10 - 2,
    r: Math.random() * 4 + 2,
    c: colors[Math.floor(Math.random() * colors.length)],
  }));
  let frames = 0;
  (function tick() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const p of particles) {
      p.vy += 0.25;
      p.x += p.vx; p.y += p.vy;
      ctx.fillStyle = p.c;
      ctx.fillRect(p.x, p.y, p.r, p.r);
    }
    frames++;
    if (frames < 60) requestAnimationFrame(tick);
    else canvas.remove();
  })();
}
