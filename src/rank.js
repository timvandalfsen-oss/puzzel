// Ranking: ludieke exponentiële schaal van voltooide puzzels naar rangnaam.

export const RANKS = [
  { min: 0,    name: "Prutser puzzelaar" },
  { min: 10,   name: "Minder prutser puzzelaar" },
  { min: 20,   name: "Matige puzzelaar" },
  { min: 40,   name: "Stukjesschuiver" },
  { min: 80,   name: "Hoekstuk-held" },
  { min: 160,  name: "Puzzelveteraan" },
  { min: 320,  name: "Legpuzzelguru" },
  { min: 640,  name: "Master puzzelaar" },
  { min: 1000, name: "Insane goeie puzzelaar" },
];

// Geeft { index, name, min, nextName?, nextAt?, progress (0..1) }.
// Bij de hoogste rank: nextName/nextAt = null, progress = 1.
export function getRank(completedCount) {
  const n = Math.max(0, Math.floor(completedCount || 0));
  let idx = 0;
  for (let i = 0; i < RANKS.length; i++) {
    if (n >= RANKS[i].min) idx = i;
    else break;
  }
  const cur = RANKS[idx];
  const next = RANKS[idx + 1];
  if (!next) {
    return { index: idx, name: cur.name, min: cur.min, nextName: null, nextAt: null, progress: 1 };
  }
  const span = next.min - cur.min;
  const progress = Math.max(0, Math.min(1, (n - cur.min) / span));
  return { index: idx, name: cur.name, min: cur.min, nextName: next.name, nextAt: next.min, progress };
}
