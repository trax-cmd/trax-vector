// tempers.js — THE YARDSTICK. The coached player (a person following the coach line at a person's pace,
// dropping by lane where the coach points) against the captain at each temper, over several seeds. A temper
// is right when the coached player wins about half at NORMAL (3-5 to 5-3 of 8), most at EASY (7-8), few at
// HARD (1-2). A temper is four numbers in sim.js TEMPERS - incomeM (the captain's income), every (ticks a
// look), burst (cards a look) and wave (seconds between its announced waves) - and this tool is how they are
// re-set: try a value with the flags, or let --tune walk incomeM until the record lands; then seat what it
// found in sim.js. It prints surges and shatters per match so the epic shows in the numbers too.
//   node tools/tempers.js [--seeds 8] [--ticks 14400] [--every 90] [--temper normal] [--income 0.85] [--look 75] [--burst 3] [--wave 40] [--tune]
import { createSim, TEMPERS } from '../src/sim/sim.js';
import { createBot } from '../src/ai/bot.js';
import { createCoached } from '../src/ai/coached.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const SEEDS = +arg('seeds', 8), TICKS = +arg('ticks', 14400), EVERY = +arg('every', 90), ONLY = arg('temper', ''), TUNE = has('tune');
// the coached player's share of wins each temper is right at (the spec's 4-4 ± 1 of 8, 7-8 of 8, 1-2 of 8)
const TARGET = { easy: [7 / 8, 1], normal: [3 / 8, 5 / 8], hard: [0, 2 / 8] };
const TUNE_ROUNDS = 5, TUNE_LO = 0.3, TUNE_HI = 2.0;   // the walk on incomeM: a bisection, five rounds

// a trial's values ride in through the flags: --income / --look / --burst / --wave re-set the named temper (all when none is named)
const trial = {};
if (has('income')) trial.incomeM = +arg('income');
if (has('look')) trial.every = +arg('look');
if (has('burst')) trial.burst = +arg('burst');
if (has('wave')) trial.wave = +arg('wave');

// one match: the coached west against the captain east at the temper; the sim scales the east's income by the temper's incomeM
function match(name, s) {
  const sim = createSim({ seed: s * 13 + 7, temper: name });
  const bots = [createCoached(sim, 0, { every: EVERY }), createBot(sim, 1, { seed: s + 100, temper: name })];
  for (let t = 0; t < TICKS && !sim.result; t++) { for (const b of bots) b.tick(); sim.step(); }
  const r = sim.result, st = sim.S.stats;
  return { win: r ? r.winner : -1, why: r ? r.why : 'no result', time: r ? r.time : TICKS / 30, kills: st.kills, surges: st.surges, shatters: st.shatters, captures: st.captures };
}
// the record over the seeds at the temper as it stands now
function record(name) {
  const out = { w: 0, l: 0, d: 0, len: 0, surges: [0, 0], shatters: [0, 0], lines: [] };
  for (let s = 1; s <= SEEDS; s++) {
    const m = match(name, s);
    if (m.win === 0) out.w++; else if (m.win === 1) out.l++; else out.d++;
    out.len += m.time; out.surges[0] += m.surges[0]; out.surges[1] += m.surges[1]; out.shatters[0] += m.shatters[0]; out.shatters[1] += m.shatters[1];
    out.lines.push(`  seed ${s}: ${m.win === 0 ? 'the player' : m.win === 1 ? 'the captain' : 'draw'} by ${m.why} at ${m.time.toFixed(0)}s · kills ${m.kills} · captures ${m.captures} · surges ${m.surges} · shatters ${m.shatters}`);
  }
  return out;
}
const temperLine = (tp) => `{ incomeM: ${tp.incomeM}, every: ${tp.every}, burst: ${tp.burst}, wave: ${tp.wave} }`;
// where the player's wins fall against the target: 'HOLDS', 'too many wins' (the captain wants more), 'too few wins'
function verdict(name, w) {
  const [lo, hi] = TARGET[name], share = w / SEEDS;
  return share < lo - 1e-9 ? 'too few wins' : share > hi + 1e-9 ? 'too many wins' : 'HOLDS';
}
function report(name, rec) {
  const tp = TEMPERS[name], v = verdict(name, rec.w);
  console.log(`${name.toUpperCase().padEnd(7)} TEMPERS.${name} = ${temperLine(tp)}: the player wins ${rec.w}, loses ${rec.l}, draws ${rec.d} of ${SEEDS} · mean ${(rec.len / SEEDS).toFixed(0)}s · surges ${rec.surges.join('/')} · shatters ${rec.shatters.join('/')} · ${v} (wants ${TARGET[name].map((q) => Math.round(q * SEEDS)).join('-')} of ${SEEDS})`);
  for (const q of rec.lines) console.log(q);
  return v;
}
// THE WALK: more captain income means fewer player wins, so incomeM is bisected until the record lands (or five rounds are spent)
function tune(name) {
  let lo = TUNE_LO, hi = TUNE_HI, best = null;
  for (let round = 0; round < TUNE_ROUNDS; round++) {
    const mid = +((lo + hi) / 2).toFixed(3);
    TEMPERS[name].incomeM = mid;
    const rec = record(name), v = verdict(name, rec.w);
    console.log(`  round ${round + 1}: incomeM ${mid} → the player wins ${rec.w} of ${SEEDS} · ${v}`);
    best = { mid, rec };
    if (v === 'HOLDS') break;
    if (v === 'too many wins') lo = mid; else hi = mid;
  }
  TEMPERS[name].incomeM = best.mid;
  return best.rec;
}

const names = ONLY ? [ONLY] : Object.keys(TEMPERS);
if (ONLY && !TEMPERS[ONLY]) { console.log('the tempers are ' + Object.keys(TEMPERS).join(', ')); process.exit(1); }
let misses = 0;
for (const name of names) {
  Object.assign(TEMPERS[name], trial);   // a trial value stands for this run only; sim.js is where it is seated for good
  if (TUNE) console.log(`${name.toUpperCase()} · walking incomeM in [${TUNE_LO}, ${TUNE_HI}] with every ${TEMPERS[name].every}, burst ${TEMPERS[name].burst}, wave ${TEMPERS[name].wave}`);
  const rec = TUNE ? tune(name) : record(name);
  if (report(name, rec) !== 'HOLDS') misses++;
}
if (SEEDS >= 8) { console.log(misses ? `${misses} temper(s) MISS` : 'THE TEMPERS HOLD'); process.exit(misses ? 1 : 0); }
console.log(`(${SEEDS} seeds is a glance; the line is judged on 8)`);
