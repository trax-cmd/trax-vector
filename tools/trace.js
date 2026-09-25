// trace.js — one duel, told second by second: who is alive, who fired, who fell. For tuning by eye.
//   node tools/trace.js LANCE PHALANX [--budget 400] [--seed 3]
import { createSim } from '../src/sim/sim.js';
import { BATTALIONS } from '../src/sim/library.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const A = BATTALIONS.find((b) => b.id === process.argv[2]), B = BATTALIONS.find((b) => b.id === process.argv[3]);
if (!A || !B) { console.log('name two battalions: ' + BATTALIONS.map((b) => b.id).join(', ')); process.exit(1); }
const BUDGET = +arg('budget', 1200), seed = +arg('seed', 3);
const sim = createSim({ seed, decks: [[A], [B]], energy0: 1e9 });
const S = sim.S, T = sim.T, U = sim.U, kinds = sim.kinds;
for (let t = 0; t < T.n; t++) T.hp[t] = 1e9;
const ca = sim.decks[0][0].cost, cb = sim.decks[1][0].cost;
const na = Math.max(1, Math.round(BUDGET / ca)), nb = Math.max(1, Math.round(BUDGET / cb));
console.log(`${A.id} x${na} (cost ${ca} each) vs ${B.id} x${nb} (cost ${cb} each)`);
const midW = sim.WL.x.map((x, i) => [Math.abs(x - sim.o.W * 0.29), i]).sort((p, q) => p[0] - q[0])[0][1];
const midE = sim.WL.x.map((x, i) => [Math.abs(x - sim.o.W * 0.71), i]).sort((p, q) => p[0] - q[0])[0][1];
for (let i = 0; i < na; i++) sim.apply({ op: 'deploy', team: 0, tower: 2, batt: 0, goal: 1000 + midE, free: true });
for (let i = 0; i < nb; i++) sim.apply({ op: 'deploy', team: 1, tower: 7, batt: 0, goal: 1000 + midW, free: true });
const cx = sim.o.W / 2, cy = sim.o.H / 2;
let inW = -Infinity, inE = Infinity;
for (let i = 0; i < U.hi; i++) { if (!U.alive[i]) continue; if (U.team[i] === 0) { U.x[i] = cx + (U.x[i] - T.x[2]); U.y[i] = cy + (U.y[i] - T.y[2]) * 0.5; inW = Math.max(inW, U.x[i]); } else { U.x[i] = cx + (U.x[i] - T.x[7]); U.y[i] = cy + (U.y[i] - T.y[7]) * 0.5; inE = Math.min(inE, U.x[i]); } }
for (let i = 0; i < U.hi; i++) { if (!U.alive[i]) continue; if (U.team[i] === 0) U.x[i] += (cx - 450) - inW; else U.x[i] += (cx + 450) - inE; }
const census = (team) => { const c = {}; for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === team) { const id = kinds[U.kind[i]].id; c[id] = (c[id] || 0) + 1; } return Object.entries(c).map(([k, v]) => k + ' ' + v).join(' ') || '-'; };
const spread = (team) => { let mn = Infinity, mx = -Infinity; for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === team) { mn = Math.min(mn, U.x[i]); mx = Math.max(mx, U.x[i]); } return mn === Infinity ? '-' : Math.round(mn - cx) + '..' + Math.round(mx - cx); };
let fired = [0, 0], hits = [0, 0];
for (let t = 0; t <= 60 * 30; t++) {
  sim.step();
  for (const e of sim.events) { if (e.t === 'beam' || e.t === 'arc' || e.t === 'pulse') fired[e.team]++; if (e.t === 'hit') hits[1 - e.team]++; }
  if (t % 30 === 0) console.log(`${String(t / 30).padStart(3)}s  west [${census(0)}] x ${spread(0)}   east [${census(1)}] x ${spread(1)}   fired ${fired[0]}/${fired[1]}  hits ${hits[0]}/${hits[1]}  kills ${S.stats.kills[0]}/${S.stats.kills[1]}`);
  if (U.count[0] === 0 || U.count[1] === 0) { console.log(`over at ${(t / 30).toFixed(1)}s`); break; }
}
