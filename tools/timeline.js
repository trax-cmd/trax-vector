// timeline.js — THE PROOF LINE. The match every other number is built backward from (SPEC-v0.6 §0), measured:
// eight seeds at NORMAL, the captain against the coached player and captain against captain, each match told
// by its moments - the first death, the first contested checkpoint, the first front move, the first gate
// hit, the meter full and the surge fired on each side, the first shatter, the longest quiet after twenty
// seconds, the stalls, the end and its reason - and judged against the line:
//   first death ≤ 15 s in 8/8 · first contest ≤ 20 s 8/8 · first front move ≤ 30 s 8/8 · first gate hit ≤ 150 s 8/8 ·
//   surge full on both sides before the first gate hit ≥ 6/8 and fired by both 8/8 · a shatter ≥ 6/8 ·
//   no quiet gap > 8 s after 20 s · 0 stalls · a match past 240 s ≥ 6/8 · replay byte-equal
// plus §11.1's asserts, every tick: no body outside its band while in the run; a dead gate's five points belong
// to the breaker the same tick; the doom lands within far/1500 + 2.5 s of the last fall (8.57 s from the farthest
// keep) with why 'strongholds'; the captain's opening puts one battalion in each lane at tick 1. A stall is the
// spec's: a battalion whose centroid moves under 20 wu in 5 s with no target and no hold in force (IDLE counts).
// Any miss is a red line and exit 1.
// THE LEVER (§5.1): SURGE_PER_ENERGY is the one number this tool moves. The default run judges the line at the sim's own; when the
// coached line's 'surge full on both sides before the first gate hit' row misses, THE WALK 3.5 → 6 plays the coached matches at
// every other value - each cut at the first gate hit, where that row is decided - and the first value that holds it in six of eight
// is re-judged on the whole line and named for sim.js; when none holds, the report says so with the fill and gate-hit times, and
// the lever stays the sim's own. --surge N judges the line at one value and walks nothing.
//   node tools/timeline.js [--seeds 8] [--mode both|coached|bots] [--surge 4] [--quiet]
//   node tools/timeline.js --seed 3 --twice        one seed replayed twice, kills and counts compared every tick
import { createSim, TICK, SURGE_PER_ENERGY } from '../src/sim/sim.js';
import { createBot } from '../src/ai/bot.js';
import { createCoached } from '../src/ai/coached.js';
import { W, H, LANE_Y, HALF, inRun, cp } from '../src/sim/lanes.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const has = (k) => process.argv.includes('--' + k);
const SEEDS = +arg('seeds', 8), MODE = arg('mode', 'both'), QUIET = has('quiet'), CLOCK_TICKS = 480 * 30;
const MODES = MODE === 'both' ? ['coached', 'bots'] : [MODE];
const LEVERS = [3.5, 4, 4.5, 5, 5.5, 6];   // the surge lever's walk (§5.1)
const GATE_HIT_S = 150;                    // the line's limit on the first gate hit: a walk match past it has missed its own row
const STALL_S = 5, STALL_WU = 20;          // a stall: a battalion's centroid moving under 20 wu over 5 s with no target and no hold in force
const QUIET_FROM = 20, DOOM_TAIL = 2.5, DOOM_V = 1500;

// THE LINE: each row is a claim on one match and the share of the seeds it must hold in (1 = every seed, 0.75 = six of eight)
const LINE = [
  ['first death ≤ 15 s', (r) => r.firstDeath <= 15, 1],
  ['first contested checkpoint ≤ 20 s', (r) => r.firstContest <= 20, 1],
  ['first front move ≤ 30 s', (r) => r.firstFront <= 30, 1],
  ['first gate hit ≤ 150 s', (r) => r.firstGateHit <= 150, 1],
  ['surge full on both sides before the first gate hit', (r) => r.surgeFull[0] < r.firstGateHit && r.surgeFull[1] < r.firstGateHit, 0.75],
  ['surge fired by both sides', (r) => r.surgeFired[0] < Infinity && r.surgeFired[1] < Infinity, 1],
  ['a shatter', (r) => r.firstShatter < Infinity, 0.75],
  ['no quiet gap > 8 s after 20 s', (r) => r.longestQuiet <= 8, 1],
  ['0 stalls', (r) => r.stalls === 0, 1],
  ['a match past 240 s', (r) => r.time > 240, 0.75],
  ["the captain's opening: one battalion in each lane at tick 1", (r) => r.openingOk, 1],
  ['no body outside its band in the run', (r) => r.breaches === 0, 1],
  ["a gate's death flips its five points to the breaker the same tick", (r) => r.flipBad === 0, 1],
  ['the doom lands within far/1500 + 2.5 s of the last fall (≤ 8.57 s), why strongholds', (r) => r.doomOk, 1],
];

// ---- one match, watched
// the sim's options: NORMAL, and the surge lever only when a trial names one (an undefined option would override the default with undefined)
function simOpts(seed, surgePerEnergy) { const o = { seed, temper: 'normal' }; if (surgePerEnergy !== undefined) o.surgePerEnergy = surgePerEnergy; return o; }
function bots(sim, mode, seed) {
  const east = createBot(sim, 1, { seed: seed + 1 });
  return mode === 'coached' ? [createCoached(sim, 0, { every: 90 }), east] : [createBot(sim, 0, { seed }), east];
}
function fresh(seed, mode) {
  return {
    seed, mode, firstDeath: Infinity, firstContest: Infinity, firstFront: Infinity, firstGateHit: Infinity, firstShatter: Infinity,
    surgeFull: [Infinity, Infinity], surgeFired: [Infinity, Infinity], longestQuiet: 0, quietEnd: 0, quietState: '', stalls: 0, stallS: 0, stallBy: [0, 0, 0, 0, 0, 0], stallFirst: null,
    opening: [new Set(), new Set()], openingOk: false, breaches: 0, breachFirst: null, flips: 0, flipBad: 0,
    lastFall: null, doomAt: Infinity, doomOk: true, doomLag: null, result: null, time: 0, ticks: 0, ms: 0, kills: [0, 0], peak: 0,
  };
}
const standing = (sim, team) => { for (let t = 0; t < sim.T.n; t++) if (sim.T.team[t] === team && sim.T.alive[t]) return true; return false; };

// the moments, read off the events of a tick
function moments(sim, r) {
  const time = sim.time;
  for (const e of sim.events) {
    switch (e.t) {
      case 'death': if (r.firstDeath === Infinity) r.firstDeath = time; break;
      case 'contested': if (r.firstContest === Infinity) r.firstContest = time; break;
      case 'front': if (r.firstFront === Infinity) r.firstFront = time; break;
      case 'towerHit': if (e.kind === 0 && r.firstGateHit === Infinity) r.firstGateHit = time; break;
      case 'surge': if (r.surgeFired[e.team] === Infinity) r.surgeFired[e.team] = time; break;
      case 'muster': if (sim.tick === 1) r.opening[e.team].add(e.lane); break;
      case 'shatter':
        if (r.firstShatter === Infinity) r.firstShatter = time;
        if (!standing(sim, e.team)) r.lastFall = { time, x: e.x, y: e.y, team: e.team };
        break;
      case 'laneBreak': {   // the same tick: every point of the lane is the breaker's
        r.flips++;
        for (let s = 0; s < 5; s++) if (sim.WL.owner[cp(e.lane, s)] !== e.team) { r.flipBad++; break; }
        break;
      }
      case 'doom': if (r.doomAt === Infinity) r.doomAt = time; break;
    }
  }
  for (let team = 0; team < 2; team++) if (r.surgeFull[team] === Infinity && sim.S.surge[team] >= sim.o.surgeMax) r.surgeFull[team] = time;
  // the quiet: seconds since the last hit anywhere, after the first 20 s and before the doom (the doom's wave is the end, not a lull)
  if (time > QUIET_FROM && !sim.S.doom) {
    const gap = time - Math.max(sim.S.lastHit, QUIET_FROM);
    if (gap > r.longestQuiet) { r.longestQuiet = gap; r.quietEnd = time; if (sim.tick % 30 === 0) r.quietState = fieldState(sim); }
  }
}
// what the field looked like while it was quiet, for whoever must wake it: who is alive, at what stage, with what purse, before what strongholds
function fieldState(sim) {
  const U = sim.U, stages = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];
  for (let i = 0; i < U.hi; i++) if (U.alive[i]) stages[U.team[i]][U.stage[i]]++;
  return `alive ${U.count.join('/')} · stages W ${stages[0].join('.')} E ${stages[1].join('.')} · energy ${sim.energy.map(Math.round).join('/')} · strongholds ${sim.T.alive.join('')} · fronts W ${sim.front().w} E ${sim.front().e}`;
}
// §11.1: no body in the run outside its band, judged every tick
function clampAssert(sim, r) {
  const U = sim.U;
  for (let i = 0; i < U.hi; i++) {
    if (!U.alive[i] || !inRun(U.x[i]) || Math.abs(U.y[i] - LANE_Y[U.lane[i]]) <= HALF + 1e-3) continue;
    r.breaches++;
    if (!r.breachFirst) r.breachFirst = { i, kind: sim.kinds[U.kind[i]].id, x: Math.round(U.x[i]), y: Math.round(U.y[i]), lane: U.lane[i], time: +sim.time.toFixed(1) };
  }
}
// the stall watch, once a second: per battalion (grp) the centroid and whether it is idle - no body with a target, none holding a
// point (stage 1, the one hold in force), none stunned. A body at stage 5 IDLE (nothing left to reach) is idle too: the spec's stall
// is 'no target and no hold in force', and a battalion standing at a dead keep while the enemy's other gates live is exactly the
// stalemate the line must catch. Six idle samples with the centroid under 20 wu from first to last make the battalion a stall: it is
// counted once (r.stalls is battalions, not episodes, so a 480 s stalemate does not swamp a 5 s one), tallied by its stage, and every
// further idle 5 s adds to r.stallS, the idle time. Once the doom runs nothing is a stall: the war is decided, the loser is dying and
// the winner has nothing left to reach.
function stallSample(sim, r, memory) {
  if (sim.S.doom) { memory.clear(); return; }
  const U = sim.U, seen = new Map();
  for (let i = 0; i < U.hi; i++) {
    if (!U.alive[i] || U.grp[i] === 0) continue;
    const g = seen.get(U.grp[i]) || { sx: 0, sy: 0, n: 0, idle: true, i, stages: [0, 0, 0, 0, 0, 0] };
    g.sx += U.x[i]; g.sy += U.y[i]; g.n++; g.stages[U.stage[i]]++;
    if (U.target[i] !== -1 || U.stage[i] === 1 || U.stun[i] > 0) g.idle = false;
    seen.set(U.grp[i], g);
  }
  for (const grp of memory.keys()) if (!seen.has(grp)) memory.delete(grp);
  for (const [grp, g] of seen) {
    const h = memory.get(grp) || { xs: [], ys: [], idle: [] };
    h.xs.push(g.sx / g.n); h.ys.push(g.sy / g.n); h.idle.push(g.idle);
    if (h.xs.length > STALL_S + 1) { h.xs.shift(); h.ys.shift(); h.idle.shift(); }
    if (h.xs.length === STALL_S + 1 && h.idle.every(Boolean) && Math.hypot(h.xs[STALL_S] - h.xs[0], h.ys[STALL_S] - h.ys[0]) < STALL_WU) {
      r.stallS += STALL_S;
      if (!h.stalled) {
        const stage = g.stages.indexOf(Math.max(...g.stages));   // the stage most of the battalion stands in
        h.stalled = true; r.stalls++; r.stallBy[stage]++;
        if (!r.stallFirst) r.stallFirst = { grp, kind: sim.kinds[U.kind[g.i]].id, team: U.team[g.i], lane: U.lane[g.i], stages: g.stages.join('.'), x: Math.round(h.xs[STALL_S]), y: Math.round(h.ys[STALL_S]), time: +sim.time.toFixed(0) };
      }
      h.xs.length = 0; h.ys.length = 0; h.idle.length = 0;
    }
    memory.set(grp, h);
  }
}
// the doom: the same tick as the last fall, and the result why 'strongholds' within far/1500 + 2.5 s of it
function judgeDoom(sim, r) {
  if (!r.lastFall) return;
  const f = r.lastFall, far = Math.sqrt(Math.max(f.x, W - f.x) ** 2 + Math.max(f.y, H - f.y) ** 2), allowed = far / DOOM_V + DOOM_TAIL + 2 * TICK;
  r.doomLag = r.result ? +(r.result.time - f.time).toFixed(2) : null;
  r.doomOk = r.doomAt === f.time && !!r.result && r.result.why === 'strongholds' && r.result.winner === 1 - f.team && r.result.time - f.time <= allowed;
}
// the captain's opening: a bot side musters into every lane at tick 1
function judgeOpening(r) {
  const captains = r.mode === 'bots' ? [0, 1] : [1];
  r.openingOk = captains.every((team) => r.opening[team].size === 3);
}
// a match to its end - or, with a cut, to the tick the cut names (the walk stops at the first gate hit: its row is decided there)
function run(seed, mode, surgePerEnergy, twin, cut = null) {
  const sim = createSim(simOpts(seed, surgePerEnergy)), r = fresh(seed, mode), memory = new Map();
  const side = bots(sim, mode, seed), t0 = performance.now();
  for (let t = 0; t < CLOCK_TICKS && !sim.result && !(cut && cut(r, sim)); t++) {
    for (const b of side) b.tick();
    sim.step();
    moments(sim, r); clampAssert(sim, r);
    if (sim.tick % 30 === 0) stallSample(sim, r, memory);
    r.peak = Math.max(r.peak, sim.U.count[0] + sim.U.count[1]);
    if (twin) twin.step(sim);
  }
  r.result = sim.result; r.time = sim.time; r.ticks = sim.tick; r.ms = performance.now() - t0; r.kills = sim.S.stats.kills.slice();
  judgeDoom(sim, r); judgeOpening(r);
  if (twin) twin.end(sim);
  return r;
}
// THE REPLAY: a second sim from the same seed with the same captains, stepped beside the first; kills and counts compared every tick, the snapshots at the end
function replayTwin(seed, mode, surgePerEnergy) {
  const b = createSim(simOpts(seed, surgePerEnergy)), side = bots(b, mode, seed);
  const twin = {
    seed, diverged: -1, equal: null,
    step(a) {
      for (const bot of side) bot.tick();
      b.step();
      if (twin.diverged < 0 && (a.S.stats.kills[0] !== b.S.stats.kills[0] || a.S.stats.kills[1] !== b.S.stats.kills[1] || a.U.count[0] !== b.U.count[0] || a.U.count[1] !== b.U.count[1])) twin.diverged = a.tick;
    },
    end(a) { twin.equal = JSON.stringify(a.snapshot()) === JSON.stringify(b.snapshot()); },
  };
  return twin;
}

// ---- the telling
const s = (v) => (v === Infinity ? '—' : v.toFixed(1));
const endOf = (r) => (r.result ? `${r.result.winner < 0 ? 'a draw' : r.result.winner === 0 ? 'west' : 'east'} by ${r.result.why} at ${r.result.time.toFixed(0)} s` : `no result at ${r.time.toFixed(0)} s`);
function tell(r) {
  console.log(`seed ${String(r.seed).padStart(2)} ${r.mode.padEnd(7)} · death ${s(r.firstDeath)} · contest ${s(r.firstContest)} · front ${s(r.firstFront)} · gate hit ${s(r.firstGateHit)} · full ${s(r.surgeFull[0])}/${s(r.surgeFull[1])} · fired ${s(r.surgeFired[0])}/${s(r.surgeFired[1])} · shatter ${s(r.firstShatter)} · quiet ${r.longestQuiet.toFixed(1)} · stalls ${r.stalls} · ${endOf(r)} · kills ${r.kills.join('/')} · peak ${r.peak} · ${r.ticks} ticks ${(r.ms / 1000).toFixed(1)} s`);
  if (r.longestQuiet > 8) console.log(`   QUIET ${r.longestQuiet.toFixed(1)} s without a hit · from ${(r.quietEnd - r.longestQuiet).toFixed(0)} s to ${r.quietEnd.toFixed(0)} s · ${r.quietState || ''}`);
  if (r.breachFirst) console.log(`   BREACH ${r.breaches}× · first ${JSON.stringify(r.breachFirst)}`);
  if (r.stallFirst) console.log(`   STALL ${r.stalls} battalion(s) stood idle ≥ 5 s (${r.stallS} battalion-seconds) · by stage MARCH.HOLD.ADVANCE.GATE.KEEP.IDLE ${r.stallBy.join('.')} · first ${JSON.stringify(r.stallFirst)}`);
  if (r.flipBad) console.log(`   LANE BREAK without the flip ${r.flipBad}× of ${r.flips}`);
  if (r.lastFall && !r.doomOk) console.log(`   DOOM · last fall ${r.lastFall.time.toFixed(1)} s · doom at ${s(r.doomAt)} · result ${r.result ? r.result.why + ' at ' + r.result.time.toFixed(1) : 'none'} · lag ${r.doomLag}`);
  if (!r.openingOk) console.log(`   OPENING · lanes at tick 1: west ${[...r.opening[0]].join(',') || '—'} · east ${[...r.opening[1]].join(',') || '—'}`);
}
// the line over a mode's records: every row counted, judged against its share; returns the misses
function judge(records, label, replay) {
  let red = 0;
  console.log(`\nTHE PROOF LINE · ${label} (${records.length} seeds)`);
  for (const [name, test, share] of LINE) {
    const n = records.filter(test).length, need = Math.ceil(share * records.length - 1e-9), ok = n >= need;
    if (!ok) red++;
    console.log(`  ${ok ? 'ok ' : 'RED'} ${name.padEnd(64)} ${n}/${records.length} need ${need}`);
  }
  if (replay) { const ok = replay.diverged < 0 && replay.equal; if (!ok) red++; console.log(`  ${ok ? 'ok ' : 'RED'} ${'replay byte-equal (seed ' + replay.seed + ')'.padEnd(64)} ${ok ? 'tick-equal, snapshots equal' : replay.diverged >= 0 ? 'diverged at tick ' + replay.diverged : 'snapshots differ'}`); }
  return red;
}

// the whole line at one lever value (undefined = the sim's own): every mode asked for, the first seed of each replayed beside itself
function judgeLine(value) {
  let red = 0;
  const byMode = {};
  for (const mode of MODES) {
    const records = [];
    let replay = null;
    for (let seed = 1; seed <= SEEDS; seed++) {
      const twin = seed === 1 ? replayTwin(seed, mode, value) : null;
      const r = run(seed, mode, value, twin);
      records.push(r);
      if (!QUIET) tell(r);
      if (twin) replay = twin;
    }
    red += judge(records, mode === 'coached' ? 'the captain vs the coached player' : 'captain vs captain', replay);
    byMode[mode] = records;
  }
  return { red, byMode };
}

// ---- THE WALK of the lever (§5.1), on the coached line - his match
const SURGE_ROW = LINE[4], NEED = Math.ceil(0.75 * SEEDS - 1e-9);
const holdsSurgeRow = (records) => records.filter(SURGE_ROW[1]).length >= NEED;
const mean = (records, f) => { const v = records.map(f).filter(Number.isFinite); return v.length ? (v.reduce((a, b) => a + b, 0) / v.length).toFixed(0) + ' s' : '—'; };
// the seeds a side's meter was not full in before the first gate hit (— in a cut match: not by the hit)
const lateSeeds = (records, team) => records.filter((r) => !(r.surgeFull[team] < r.firstGateHit)).length;
// one value's reading: the seeds it holds in, each side's fill against the first gate hit per seed, and which side filled late
function walkRow(value, records, from) {
  console.log(`  surgePerEnergy ${String(value).padEnd(4)} ${records.filter(SURGE_ROW[1]).length}/${SEEDS} need ${NEED} · full W/E < gate hit per seed: ${records.map((r) => `${s(r.surgeFull[0])}/${s(r.surgeFull[1])}<${s(r.firstGateHit)}`).join(' ')} · mean full W ${mean(records, (r) => r.surgeFull[0])} E ${mean(records, (r) => r.surgeFull[1])} (of those full) · gate hit ${mean(records, (r) => r.firstGateHit)} · late: west ${lateSeeds(records, 0)} east ${lateSeeds(records, 1)}${from ? ' · ' + from : ''}`);
}
// every value of the walk but the sim's own (already read), the coached matches cut at the first gate hit; the first that holds the row, or
// null with the diagnosis said: which side's meter is late however the lever stands
function walk(own) {
  console.log(`\nTHE LEVER · '${SURGE_ROW[0]}' misses at the sim's own surgePerEnergy ${SURGE_PER_ENERGY} · the walk ${LEVERS[0]} → ${LEVERS[LEVERS.length - 1]} (— = not full by the hit)`);
  walkRow(SURGE_PER_ENERGY, own, 'the default run');
  const decided = (r, sim) => r.firstGateHit < Infinity || sim.time >= GATE_HIT_S;
  const late = [[lateSeeds(own, 0)], [lateSeeds(own, 1)]];
  for (const value of LEVERS) {
    if (value === SURGE_PER_ENERGY) continue;
    const records = [];
    for (let seed = 1; seed <= SEEDS; seed++) records.push(run(seed, 'coached', value, null, decided));
    walkRow(value, records);
    if (holdsSurgeRow(records)) return value;
    late[0].push(lateSeeds(records, 0)); late[1].push(lateSeeds(records, 1));
  }
  const span = (a) => (Math.min(...a) === Math.max(...a) ? `${a[0]}` : `${Math.min(...a)}-${Math.max(...a)}`);
  console.log(`  the lever does not move the row: the west (his coached side) is late in ${span(late[0])} of ${SEEDS} seeds at every value, the east in ${span(late[1])} · the first gate hit lands at a mean ${mean(own, (r) => r.firstGateHit)} · the miss is the west's fill - its kills and captures before the hit - not the fill per kill`);
  return null;
}

// ---- the modes
const lever = has('surge') ? +arg('surge') : undefined;   // the surge lever, when a trial names one; else the sim's own, and the walk when the row misses
if (has('twice')) {
  const seed = +arg('seed', 1), mode = MODES[0];
  const twin = replayTwin(seed, mode, lever);
  const r = run(seed, mode, lever, twin);
  tell(r);
  const ok = twin.diverged < 0 && twin.equal;
  console.log(ok ? `REPLAY BYTE-EQUAL · seed ${seed} ${mode} · ${r.ticks} ticks tick-equal in kills and counts, snapshots equal` : `REPLAY RED · seed ${seed} ${mode} · ${twin.diverged >= 0 ? 'kills or counts diverged at tick ' + twin.diverged : 'the final snapshots differ'}`);
  process.exit(ok ? 0 : 1);
}

const t0 = performance.now();
let { red, byMode } = judgeLine(lever);
let word = lever === undefined ? `the sim's own ${SURGE_PER_ENERGY}` : `${lever} (--surge)`;
if (lever === undefined && byMode.coached && !holdsSurgeRow(byMode.coached)) {
  const found = walk(byMode.coached);
  if (found === null) word = `stays the sim's own ${SURGE_PER_ENERGY} · NO VALUE OF THE WALK ${LEVERS[0]} → ${LEVERS[LEVERS.length - 1]} HOLDS THE SURGE ROW: the lever does not move it, the miss is in the fill and gate-hit times above`;
  else {
    console.log(`\nTHE LINE AT surgePerEnergy ${found}`);
    ({ red } = judgeLine(found));
    word = `${found} holds the surge row · SEAT SURGE_PER_ENERGY = ${found} IN sim.js (the sim's own ${SURGE_PER_ENERGY} read ${byMode.coached.filter(SURGE_ROW[1]).length}/${SEEDS})`;
  }
}
console.log(`\n${red ? `RED · ${red} line(s) miss` : 'GREEN · the line holds'} · surgePerEnergy ${word} · ${((performance.now() - t0) / 1000).toFixed(0)} s`);
process.exit(red ? 1 : 0);
