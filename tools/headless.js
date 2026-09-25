// headless.js — the war without a screen: two captains, a seed, a clock. Prints the field every
// thirty seconds and the cost of a tick, so scale is a number and not a feeling.
//   node tools/headless.js [--seed 1] [--ticks 14400] [--every 900] [--energy 600] [--income 8] [--burst 6] [--quiet]
import { createSim, TICK } from '../src/sim/sim.js';
import { createBot } from '../src/ai/bot.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const seed = +arg('seed', 1), ticks = +arg('ticks', 14400), every = +arg('every', 900), quiet = process.argv.includes('--quiet');
const sim = createSim({ seed, energy0: +arg("energy", 600), incomePerTower: +arg("income", 8) });
const burst = +arg("burst", 6);
const bots = [createBot(sim, 0, { seed, burst }), createBot(sim, 1, { seed: seed + 1, burst })];
const t0 = performance.now();
let evN = 0, peak = 0, worst = 0;
for (let i = 0; i < ticks && !sim.result; i++) {
  for (const b of bots) b.tick();
  const a = performance.now();
  sim.step();
  const ms = performance.now() - a; if (ms > worst) worst = ms;
  evN += sim.events.length;
  const alive = sim.U.count[0] + sim.U.count[1]; if (alive > peak) peak = alive;
  if (!quiet && sim.tick % every === 0) {
    const s = sim.snapshot();
    console.log(`t ${s.time.toFixed(0).padStart(4)}s  alive ${String(s.alive[0]).padStart(5)} / ${String(s.alive[1]).padStart(5)}  energy ${s.energy[0]} / ${s.energy[1]}  towers ${s.towers.filter((t) => t.team === 0 && t.alive).length}:${s.towers.filter((t) => t.team === 1 && t.alive).length}  hp ${s.towers.filter((t) => t.team === 0).reduce((q, t) => q + t.hp, 0)} / ${s.towers.filter((t) => t.team === 1).reduce((q, t) => q + t.hp, 0)}  shots ${sim.P.hi}  ${ms.toFixed(1)} ms/tick`);
  }
}
const total = performance.now() - t0;
const s = sim.snapshot();
console.log(`RESULT ${sim.result ? (sim.result.winner < 0 ? 'draw' : 'side ' + sim.result.winner + ' (' + (sim.result.winner === 0 ? 'west' : 'east') + ')') + ' by ' + sim.result.why + ' at ' + sim.result.time.toFixed(0) + 's' : 'no result in ' + ticks + ' ticks'}  ·  deployed ${sim.S.stats.deployed} · kills ${sim.S.stats.kills} · spent ${sim.S.stats.spent}`);
console.log(`${sim.tick} ticks in ${(total / 1000).toFixed(1)} s  ·  ${(total / sim.tick).toFixed(2)} ms/tick mean · ${worst.toFixed(1)} worst  ·  peak alive ${peak}  ·  ${(evN / sim.tick).toFixed(0)} events/tick  ·  ${(sim.tick * TICK / (total / 1000)).toFixed(0)}x realtime`);
