// headless.js — the war without a screen: two captains, a seed, a clock. Every thirty seconds it prints the
// three fronts, the points each lane holds, the meters, the surges and shatters so far and the cost of a
// tick, so scale is a number and not a feeling. The east captain plays at the temper (the sim scales its
// income by the temper); the west captain looks and musters at the same pace.
//   node tools/headless.js [--seed 1] [--ticks 14400] [--every 900] [--temper normal] [--energy 800] [--income 6] [--burst N] [--quiet]
import { createSim, TICK } from '../src/sim/sim.js';
import { createBot } from '../src/ai/bot.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const seed = +arg('seed', 1), ticks = +arg('ticks', 14400), every = +arg('every', 900), temper = arg('temper', 'normal'), quiet = has('quiet');

// the economy is the sim's own unless a flag says otherwise; the captains' burst is their temper's unless --burst
const opts = { seed, temper };
if (has('energy')) opts.energy0 = +arg('energy');
if (has('income')) opts.incomePerTower = +arg('income');
const sim = createSim(opts);
const botOpts = (s) => (has('burst') ? { seed: s, burst: +arg('burst') } : { seed: s });
const bots = [createBot(sim, 0, botOpts(seed)), createBot(sim, 1, botOpts(seed + 1))];

const held = (l) => l.held.map((o) => (o < 0 ? '·' : o)).join('');
const lane = (s, l) => `${'TCB'[l]} ${s.lanes[l].frontW}|${s.lanes[l].frontE} ${held(s.lanes[l])}`;
function report(ms) {
  const s = sim.snapshot(), st = sim.S.stats;
  const gates = [0, 1].map((team) => s.towers.filter((t) => t.team === team && t.alive).length).join(':');
  console.log(`t ${s.time.toFixed(0).padStart(4)}s · ${[0, 1, 2].map((l) => lane(s, l)).join(' · ')} · alive ${s.alive[0]}/${s.alive[1]} · energy ${s.energy[0]}/${s.energy[1]} · surge ${s.surge[0]}/${s.surge[1]} · surges ${st.surges[0]}/${st.surges[1]} · shatters ${st.shatters[0]}/${st.shatters[1]} · strongholds ${gates} · ${ms.toFixed(1)} ms/tick`);
}

const t0 = performance.now();
let evN = 0, peak = 0, worst = 0;
for (let i = 0; i < ticks && !sim.result; i++) {
  for (const b of bots) b.tick();
  const a = performance.now();
  sim.step();
  const ms = performance.now() - a; if (ms > worst) worst = ms;
  evN += sim.events.length;
  const alive = sim.U.count[0] + sim.U.count[1]; if (alive > peak) peak = alive;
  if (!quiet && sim.tick % every === 0) report(ms);
}
const total = performance.now() - t0, r = sim.result, st = sim.S.stats;
const side = (w) => (w < 0 ? 'draw' : `side ${w} (${w === 0 ? 'west' : 'east'})`);
console.log(`RESULT ${r ? `${side(r.winner)} by ${r.why} at ${r.time.toFixed(0)}s` : `no result in ${ticks} ticks`}  ·  deployed ${st.deployed} · kills ${st.kills} · spent ${st.spent} · captures ${st.captures} · surges ${st.surges} · shatters ${st.shatters} · waves ${st.waves}`);
console.log(`${sim.tick} ticks in ${(total / 1000).toFixed(1)} s  ·  ${(total / sim.tick).toFixed(2)} ms/tick mean · ${worst.toFixed(1)} worst  ·  peak alive ${peak}  ·  ${(evN / sim.tick).toFixed(0)} events/tick  ·  ${(sim.tick * TICK / (total / 1000)).toFixed(0)}x realtime`);
