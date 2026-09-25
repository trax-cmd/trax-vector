// mirror.js — the same deck on both sides, several seeds: a fair field wins each side about half the time.
// The sim scales only the east's income by the match's temper (the east is the captain a person plays), so
// the mirror registers a temper of its own with income ×1 - NORMAL's look, burst and wave, no handicap - and
// both captains play it; otherwise the numbers would measure the temper, not the field.
//   node tools/mirror.js [--seeds 6] [--ticks 14400]
import { createSim, TEMPERS } from '../src/sim/sim.js';
import { createBot } from '../src/ai/bot.js';
import { draft } from '../src/sim/library.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SEEDS = +arg('seeds', 6), TICKS = +arg('ticks', 14400);
TEMPERS.mirror = { ...TEMPERS.normal, incomeM: 1 };
const wins = [0, 0, 0];
for (let s = 1; s <= SEEDS; s++) {
  const deck = draft(s * 977 + 3, 8);
  const sim = createSim({ seed: s, decks: [deck, deck], temper: 'mirror' });
  const bots = [createBot(sim, 0, { seed: s }), createBot(sim, 1, { seed: s })];
  for (let t = 0; t < TICKS && !sim.result; t++) { for (const b of bots) b.tick(); sim.step(); }
  const r = sim.result, w = r ? r.winner : -1, st = sim.S.stats;
  wins[w < 0 ? 2 : w]++;
  console.log(`seed ${s}: ${w < 0 ? 'draw' : w === 0 ? 'WEST' : 'EAST'} ${r ? 'by ' + r.why + ' at ' + r.time.toFixed(0) + 's' : ''} · kills ${st.kills} · spent ${st.spent} · captures ${st.captures} · surges ${st.surges} · shatters ${st.shatters}`);
}
console.log(`west ${wins[0]} · east ${wins[1]} · draw ${wins[2]}`);
