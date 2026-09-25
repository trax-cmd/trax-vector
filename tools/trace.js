// trace.js — one duel, told second by second: who is alive, where each line stands, what stage of the march
// its bodies are in, where the lane's fronts are, who fired, who fell. For tuning by eye. The placement is
// the judge's own (tools/duel.js placeDuel): both lines in band 1, 450 either side of THE CENTRE.
//   node tools/trace.js LANCE PHALANX [--budget 1200] [--seed 3] [--clock 60]
import { createSim } from '../src/sim/sim.js';
import { BATTALIONS } from '../src/sim/library.js';
import { CP_X, CENTRE } from '../src/sim/lanes.js';
import { placeDuel, LANE } from './duel.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const A = BATTALIONS.find((b) => b.id === process.argv[2]), B = BATTALIONS.find((b) => b.id === process.argv[3]);
if (!A || !B) { console.log('name two battalions: ' + BATTALIONS.map((b) => b.id).join(', ')); process.exit(1); }
const BUDGET = +arg('budget', 1200), seed = +arg('seed', 3), CLOCK = +arg('clock', 60);
const sim = createSim({ seed, decks: [[A], [B]], energy0: 1e9 });
const S = sim.S, U = sim.U, kinds = sim.kinds, cx = CP_X[CENTRE];
const { na, nb, ca, cb } = placeDuel(sim, BUDGET);
console.log(`${A.id} x${na} (cost ${ca} each) vs ${B.id} x${nb} (cost ${cb} each) · lane ${LANE}, inner edges 450 either side of x ${cx}`);

const each = (team, fn) => { for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === team) fn(i); };
const census = (team) => { const c = {}; each(team, (i) => { const id = kinds[U.kind[i]].id; c[id] = (c[id] || 0) + 1; }); return Object.entries(c).map(([k, v]) => k + ' ' + v).join(' ') || '-'; };
const spread = (team) => { let mn = Infinity, mx = -Infinity; each(team, (i) => { mn = Math.min(mn, U.x[i]); mx = Math.max(mx, U.x[i]); }); return mn === Infinity ? '-' : Math.round(mn - cx) + '..' + Math.round(mx - cx); };
const stages = (team) => { const c = [0, 0, 0, 0, 0, 0]; each(team, (i) => c[U.stage[i]]++); return c.join('/'); };   // MARCH/HOLD/ADVANCE/GATE/KEEP/IDLE
const fronts = () => `${sim.front().w[LANE]}|${sim.front().e[LANE]}`;

const fired = [0, 0], hits = [0, 0];
for (let t = 0; t <= CLOCK * 30; t++) {
  sim.step();
  for (const e of sim.events) { if (e.t === 'beam' || e.t === 'arc' || e.t === 'pulse') fired[e.team]++; if (e.t === 'hit') hits[1 - e.team]++; }
  if (t % 30 === 0) console.log(`${String(t / 30).padStart(3)}s  west [${census(0)}] x ${spread(0)} stages ${stages(0)}   east [${census(1)}] x ${spread(1)} stages ${stages(1)}   front ${fronts()}  fired ${fired[0]}/${fired[1]}  hits ${hits[0]}/${hits[1]}  kills ${S.stats.kills[0]}/${S.stats.kills[1]}`);
  if (U.count[0] === 0 || U.count[1] === 0) { console.log(`over at ${(t / 30).toFixed(1)}s`); break; }
}
