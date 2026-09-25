// rng.js — one seeded stream, so a match replays byte for byte from its seed and its commands.
// mulberry32: 32-bit state, good spread, no allocations. The sim owns one; nothing else may touch it.
export function rng32(seed) {
  let a = (seed >>> 0) || 1;
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  next.int = (n) => (next() * n) | 0;
  next.pick = (arr) => arr[(next() * arr.length) | 0];
  next.range = (lo, hi) => lo + next() * (hi - lo);
  next.sign = () => (next() < 0.5 ? -1 : 1);
  return next;
}
