// tempers.js — THE YARDSTICK. The coached player (a person following the coach line at a person's pace)
// against the captain at each temper, over several seeds. A temper is set right when the coached player
// wins about half at NORMAL, most at EASY, few at HARD.
//   node tools/tempers.js [--seeds 6] [--ticks 18000] [--every 90]
import { createSim, TEMPERS } from '../src/sim/sim.js';
import { createBot } from '../src/ai/bot.js';
import { createCoached } from '../src/ai/coached.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const SEEDS = +arg('seeds', 6), TICKS = +arg('ticks', 18000), EVERY = +arg('every', 90);
for (const name of Object.keys(TEMPERS)) {
  const tp = TEMPERS[name];
  let w = 0, l = 0, d = 0, len = 0;
  const lines = [];
  for (let s = 1; s <= SEEDS; s++) {
    const sim = createSim({ seed: s * 13 + 7, temper: name });
    const bots = [createCoached(sim, 0, { every: EVERY }), createBot(sim, 1, { seed: s + 100, every: tp.every, burst: tp.burst })];
    for (let t = 0; t < TICKS && !sim.result; t++) { for (const b of bots) b.tick(); sim.step(); }
    const r = sim.result; const win = r ? r.winner : -1;
    if (win === 0) w++; else if (win === 1) l++; else d++;
    len += r ? r.time : TICKS / 30;
    lines.push(`  seed ${s}: ${win === 0 ? 'the player' : win === 1 ? 'the captain' : 'draw'}${r ? ' by ' + r.why + ' at ' + r.time.toFixed(0) + 's' : ''} · wells ${sim.S.stats.wellsTaken} · kills ${sim.S.stats.kills}`);
  }
  console.log(`${name.toUpperCase().padEnd(7)} (captain income x${tp.incomeM}, a look every ${(tp.every / 30).toFixed(1)}s, ${tp.burst} a look): the player wins ${w}, loses ${l}, draws ${d} of ${SEEDS} · mean ${(len / SEEDS).toFixed(0)}s`);
  for (const q of lines) console.log(q);
}
