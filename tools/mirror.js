// mirror.js — the same deck on both sides, several seeds: a fair field wins each side about half the time.
//   node tools/mirror.js [--seeds 6] [--ticks 18000]
import { createSim } from '../src/sim/sim.js';
import { createBot } from '../src/ai/bot.js';
import { draft } from '../src/sim/library.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SEEDS = +arg('seeds', 6), TICKS = +arg('ticks', 18000);
const wins = [0, 0, 0];
for (let s = 1; s <= SEEDS; s++) {
  const deck = draft(s * 977 + 3, 8);
  const sim = createSim({ seed: s, decks: [deck, deck] });
  const bots = [createBot(sim, 0, { seed: s }), createBot(sim, 1, { seed: s })];
  for (let t = 0; t < TICKS && !sim.result; t++) { for (const b of bots) b.tick(); sim.step(); }
  const r = sim.result; const w = r ? r.winner : -1;
  wins[w < 0 ? 2 : w]++;
  console.log(`seed ${s}: ${w < 0 ? 'draw' : w === 0 ? 'WEST' : 'EAST'} ${r ? 'by ' + r.why + ' at ' + r.time.toFixed(0) + 's' : ''} · kills ${sim.S.stats.kills} · spent ${sim.S.stats.spent} · wells taken ${sim.S.stats.wellsTaken}`);
}
console.log(`west ${wins[0]} · east ${wins[1]} · draw ${wins[2]}`);
