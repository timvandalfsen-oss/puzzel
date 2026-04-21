// Kleine Web Audio helper: genereert een kort "pling"-geluid zonder asset.
//
// - AudioContext wordt lazy aangemaakt (browsers vereisen een user-gesture voor audio).
// - Pling = korte sine-toon op ~880 Hz met snelle fade-out.
// - Geen dependencies, werkt offline.

let _ctx = null;

function ctx() {
  if (_ctx) return _ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  _ctx = new AC();
  return _ctx;
}

// Primaire call: speelt een kort pling-achtig geluidje.
export function playPling(streak = 1) {
  const c = ctx();
  if (!c) return;
  // Resume als hij gesuspend staat (Chrome autoplay-policy)
  if (c.state === "suspended") c.resume().catch(() => {});

  const now = c.currentTime;
  // Frequentie omhoog bij hogere streaks voor variatie
  const baseFreq = 880;                               // A5
  const freq = baseFreq * Math.pow(1.06, Math.min(streak - 3, 12) / 3);
  const duration = 0.16;

  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, now);

  // Envelope: snelle attack, lineaire fade
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(0.25, now + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);

  osc.connect(gain).connect(c.destination);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}
