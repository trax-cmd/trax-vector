// sim.js — THE WORLD. Pure: no DOM, no clock of its own, no randomness but its seed. Fixed ticks,
// commands applied at tick boundaries, every body in flat typed arrays. The same file runs in the
// browser and in Node, which is what lets a captain play it, a tool balance it and a replay reproduce it.
//
// v0.6 THE BREACH: three lanes between two sides' gates (src/sim/lanes.js is the one geometry source).
// A battalion musters at its lane's gate and MARCHES checkpoint by checkpoint; the fronts move as the
// points turn; kills fill a SURGE that fires one super per shape into a lane; a gate at 0 hp SHATTERS
// with a shockwave and breaks its lane open; the captain's waves are announced by name; a side's last
// stronghold falling sends a DOOM wave across the field, and the result follows it.
// The march as measured against §0's line (SIM's rulings of 2026-09-25, each at its rule): a column leaves a
// PICKET at every point it passes and marches on; a body SEES the enemy vanguard of its lane a point and a
// half away and closes on it; an unopposed march goes at double time; the column WAITS at the lane's end
// for its points; THE WALL turns small arms off the strongholds until a side's gates are down, and a surge is the breach.
import { rng32 } from './rng.js';
import { Grid } from './grid.js';
import { compileAll } from './units.js';
import { LIBRARY, BATTALIONS, WAVE_NAMES, battalionCost, draft } from './library.js';
import { W, H, LANE_Y, HALF, RUN, GATE_X, KEEP_X, KEEP_Y, CP_X, CENTRE, GATE_HP, KEEP_HP, GATE_R, KEEP_R, CP_REACH, RALLY_R, DROP_MIN, DROP_MAX, MUSTER_AHEAD, laneOf, inRun, clampY, cp, gate, keep, towerLane, slotsToward, frontX } from './lanes.js';

export const TICK = 1 / 30;
// THE TEMPERS: what the captain earns, how often it looks, how much it musters a look and how often (seconds) it announces a wave. incomeM is set by tools/tempers.js so a person following the coach wins about half at NORMAL.
// The yardstick of 2026-09-25 on the lane field, the judge's table baked (8 seeds, the coached player's record): EASY 8-0 at 0.55 (at 0.6 it
// read 6-2, too hard for EASY), NORMAL 4-4 at 0.95, HARD 1-7 at 1.05. NORMAL read 4-4 at 0.85 too, but the captain is NORMAL in both of
// tools/timeline.js's modes and at 0.85 the proof line missed three rows by a seed each (coached wins before 240 s, the captains' meters
// late for the first gate hit, a quiet gap); of NORMAL's fair values, 0.95 is the one that holds the whole line (0.90 and 1.00 miss rows).
/* HARD re-seated 2026-09-25 after round four (THE FLOCK and the open keeps took the stacked crowds' free firepower from the biggest army):
   1.05 read 3-5, 1.10 4-4, 1.12 3-5, 1.13 1-7, 1.14 0-8, 1.15 0-8 - a knife edge, one step of income flipping whole matches; that edge is the
   rout the next version answers with a comeback. EASY 8-0 and NORMAL 5-3 held untouched. */
export const TEMPERS = { easy: { incomeM: 0.55, every: 120, burst: 2, wave: 55 }, normal: { incomeM: 0.95, every: 75, burst: 3, wave: 40 }, hard: { incomeM: 1.13, every: 45, burst: 4, wave: 30 } };
// THE SURGE LEVER: meter per energy of enemy bodies killed - 1,667 energy of kills at mult 1 fills the meter. The one number tools/timeline.js moves (3.5 → 6) until the meter is full on both sides before the first gate hit in six matches of eight; it rides in as DEFAULTS.surgePerEnergy.
// Seated at the walk's top on the measure of 2026-09-25: with the columns marching (below) the first gate hit lands at 17-95 s, and at 4 the captains' meters were full before it in four matches of eight, at 6 in six to eight.
export const SURGE_PER_ENERGY = 6;
export const DEFAULTS = {
  W, H,                                        // the field, from lanes.js
  energy0: 800, incomePerTower: 6,             // a shared pool a side; each living stronghold pays into it every second
  cpIncome: 6, centreIncome: 12,               // a held checkpoint pays 6/s, THE CENTRE 12/s: a full board is 108/s against 30/s from strongholds
  captureNeutral: 0.25, captureStrip: 0.5,     // prog per second toward a lone side's sign: 0.5 while the point carries the enemy's sign, 0.25 otherwise (an enemy point turns in 6 s, a neutral in 4)
  holdS: 20, defendS: 45, quietS: 8,           // the march: a battalion holds where it was sent 20 s (45 on a DEFEND or a PICKET) and leaves when the point is its own or nothing has come for 8 s
  // THE SIGHT and THE PACE (SIM's ruling 2026-09-25, on the measure): §3.6 gives the march its stages and its holds and says nothing of what a body does
  // between them, and the line of §0 could not hold on the stages alone - bodies holding a point stood 400 wu from an enemy holding the next while
  // their aggro rings reach 220-420, so the middle of a match went silent 9-13 s at a time; and a square walks the 6,800-wu run in 72 s, so two
  // openings dropped at POINT 1 on each side met after 20 s where the line wants a first death by 15. In the run a body with nothing in its aggro ring
  // sees the enemy vanguard of its lane `sight` wu away (a point and a half) and closes on it at its fighting pace; with nothing to fight and nothing in
  // sight it marches at `march` times its speed. The yards keep the fighting pace: the walk through a dead gate to a keep is the peak's 9-20 s.
  sight: 1400, march: 1.5,
  clock: 480,                                  // seconds; at the bell the side with more stronghold hp wins, tie by checkpoints held, tie by kills
  escalate: 1 / 240,                           // THE WAR GROWS: income, muster size and price scale with the clock - doubled at four minutes, tripled at the bell
  surgeMax: 10000, surgeS: 8, surgePerEnergy: SURGE_PER_ENERGY,   // the meter's top, the seconds a surge lasts, the fill per energy killed
  shockR: 700, shockV: 400, shockS: 0.6, shockStun: 1.5,          // a shattered stronghold's shockwave: the loser's bodies within 700 thrown out at 400 wu/s for 0.6 s and stunned 1.5 s
  // THE WALL (SIM's ruling 2026-09-25, on the measure; the spec is silent on what a stronghold takes from whom). A GATE takes a tenth of every shot but two:
  // ⬢ SIEGE's long guns land whole, and so does a surging lane on the gate it surges at - the breach itself, §0's peak: the arc drains from 40 % to 0 in
  // seconds under the surge, and a shatter follows a surge in every match. A KEEP is the last stand: the long guns land at half; small arms at a
  // five-hundredth while a gate of its side stands (at a flat 0.35 a massed lane razed a keep in 10 s from its first hit and the loser's counter-push had
  // no minutes), and at keepOpen once none does - THE OPEN KEEPS: with every gate down the war is decided, and at the five-hundredth the winner's mass
  // circled keeps whose arcs did not move for two and a half minutes while the loser had no one left to push with (seed 3 of the captains: its last gate
  // fell at 83 s, its keeps at 216 and 234 s). At a fiftieth a siege of about three hundred razes a keep in 30-60 s and the doom follows the fight.
  wall: 0.1, keepWall: 0.002, keepOpen: 0.02, keepSiege: 0.5,
  doomV: 1500, doomTail: 2.5,                  // the doom wave's speed and the seconds after it passes the far corner before the result
  capUnits: 30000, capShots: 80000, capMines: 6000, cell: 96,
  seed: 1, deck: 8,
  temper: 'normal',                            // the east captain's temper (its income multiplier); the west is the person
};
const KILL_SPAN = 90;   // the kills ring remembers three seconds of ticks per lane
const CLOAK_R2 = 120 * 120;   // a cloaked body is unseen beyond 120 wu
// the ways a body walks, as the tick switches on them ('march' and 'hold' walk alike: to the post and stand)
const MARCH = 0, ZIGZAG = 1, ORBIT = 2, SWARM = 3, HOP = 4, PHASE = 5;
const MOVE_CODE = { march: MARCH, hold: MARCH, zigzag: ZIGZAG, orbit: ORBIT, swarm: SWARM, hop: HOP, phase: PHASE };
// THE EYE of a kind (retarget): 0 takes the nearest, 1 the weakest in reach, 2 the biggest outside its minimum range
const NEAREST = 0, WEAKEST = 1, BIGGEST = 2;

export function createSim(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const rng = rng32(o.seed);
  const kinds = compileAll(o.roster || LIBRARY);
  const N = o.capUnits, M = o.capShots, MM = o.capMines;
  const kindOf = (id) => { const i = kinds.findIndex((k) => k.id === id); if (i < 0) throw new Error('unknown body ' + id); return i; };
  // THE ROSTER, FLAT: what the tick reads of a kind for every body every tick, in typed arrays by kind index. A compiled kind is an
  // object whose weapon and trait objects differ in shape from kind to kind, and a property walked into them for every body is the
  // dearest load in the loop; the loop reads these instead (the objects stay for the rare paths - a shot fired, a body born - and
  // for the tools). Doubles are kept as doubles, so every number is the one the objects hold.
  const KN = kinds.length;
  const K = {
    r: new Float64Array(KN), hp: new Float64Array(KN), speed: new Float64Array(KN), mass: new Float64Array(KN), shieldMax: new Float64Array(KN),
    range: new Float64Array(KN), minRange: new Float64Array(KN), minRange2: new Float64Array(KN), rate: new Float64Array(KN), aggro: new Float64Array(KN), aggro2: new Float64Array(KN),
    shape: new Uint8Array(KN), move: new Uint8Array(KN), eye: new Uint8Array(KN), passive: new Uint8Array(KN),
    cloak: new Uint8Array(KN), regen: new Uint8Array(KN), magnet: new Uint8Array(KN), kamikaze: new Uint8Array(KN),
  };
  kinds.forEach((k, q) => {
    K.r[q] = k.r; K.hp[q] = k.hp; K.speed[q] = k.speed; K.mass[q] = k.mass; K.shieldMax[q] = k.shieldMax;
    K.range[q] = k.w.range; K.minRange[q] = k.w.minRange || 0; K.minRange2[q] = K.minRange[q] * K.minRange[q]; K.rate[q] = k.w.rate;
    K.aggro[q] = k.aggro; K.aggro2[q] = k.aggro * k.aggro;
    K.shape[q] = k.shape; K.move[q] = MOVE_CODE[k.move]; K.eye[q] = k.shape === 2 || k.shape === 5 ? WEAKEST : k.w.minRange ? BIGGEST : NEAREST;
    K.passive[q] = k.w.type === 'aura' || k.w.type === 'spawn' || k.w.type === 'mine' ? 1 : 0;   // a passive weapon fires on its clock, at nothing
    K.cloak[q] = k.traits.cloak ? 1 : 0; K.regen[q] = k.traits.regen ? 1 : 0; K.magnet[q] = k.traits.magnet ? 1 : 0; K.kamikaze[q] = k.traits.kamikaze ? 1 : 0;
  });

  // ---- the decks: eight battalions a side, drawn from the library by the seed; a side may be handed its own
  const decks = [0, 1].map((side) => (o.decks && o.decks[side] ? o.decks[side] : draft(o.seed * 17 + side * 101 + 5, o.deck)).map((b) => ({ ...b, cost: battalionCost(b, kinds, o.rolePrice), body: b.units.map(([id, n]) => [kindOf(id), n]) })));
  const battById = new Map(BATTALIONS.map((b) => [b.id, b]));

  // ---- the bodies: struct of arrays
  const U = {
    x: new Float32Array(N), y: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N),
    hp: new Float32Array(N), sh: new Float32Array(N), cd: new Float32Array(N), age: new Float32Array(N), ph: new Float32Array(N), stun: new Float32Array(N),
    kind: new Uint16Array(N), team: new Uint8Array(N), alive: new Uint8Array(N), target: new Int32Array(N), goal: new Int32Array(N), grp: new Uint16Array(N), clutch: new Uint8Array(N),
    // the march: the lane a body belongs to for life, the x it was sent to, its slot in the formation, the hold clock, the quiet clock, the stage, the DEFEND flag
    lane: new Uint8Array(N), goalX: new Float32Array(N), slotF: new Float32Array(N), slotS: new Float32Array(N), holdUntil: new Float32Array(N), quiet: new Float32Array(N), stage: new Uint8Array(N), defend: new Uint8Array(N),
    // the epic: a shockwave's push (a velocity and the seconds left of it), BLINK's charged shots, the second the doom wave takes the body (0 = never)
    pushX: new Float32Array(N), pushY: new Float32Array(N), pushT: new Float32Array(N), charge: new Uint8Array(N), doomAt: new Float32Array(N),
    hi: 0, free: [], count: [0, 0],
  };
  const laneAlive = new Uint16Array(6);   // alive bodies of a side in a lane (team·3 + lane): a lane with none of theirs holds no target for a body in the run
  // a shot and a mine carry their shooter's lane: THE WALL (hurtTower) reads it to know whether the shot comes from a surging lane
  const P = {
    x: new Float32Array(M), y: new Float32Array(M), vx: new Float32Array(M), vy: new Float32Array(M), life: new Float32Array(M), mul: new Float32Array(M),
    kind: new Uint16Array(M), team: new Uint8Array(M), lane: new Uint8Array(M), alive: new Uint8Array(M), target: new Int32Array(M),
    hi: 0, free: [],
  };
  const MN = { x: new Float32Array(MM), y: new Float32Array(MM), kind: new Uint16Array(MM), team: new Uint8Array(MM), lane: new Uint8Array(MM), alive: new Uint8Array(MM), hi: 0, free: [] };

  // ---- the strongholds: three gates and two keeps a side. 0,1,2 west gates for lanes 0,1,2; 3,4 west keeps; 5,6,7 east gates; 8,9 east keeps.
  const T = { x: [], y: [], team: [], kind: [], lane: [], hp: [], hpMax: [], r: [], alive: [], n: 0 };
  const seat = (team, kind, lane, x, y) => { const hp = kind ? KEEP_HP : GATE_HP; T.x.push(x); T.y.push(y); T.team.push(team); T.kind.push(kind); T.lane.push(lane); T.hp.push(hp); T.hpMax.push(hp); T.r.push(kind ? KEEP_R : GATE_R); T.alive.push(1); T.n++; };
  for (let side = 0; side < 2; side++) {
    for (let l = 0; l < 3; l++) seat(side, 0, l, GATE_X[side], LANE_Y[l]);
    for (let k = 0; k < 2; k++) seat(side, 1, -1, KEEP_X[side], KEEP_Y[k]);
  }
  // ---- the checkpoints: five a lane on its centre-line, all neutral at the bell; index lane·5 + slot
  const WL = { x: [], y: [], lane: [], slot: [], owner: [], prog: [], contestedAt: [], n: 0 };
  for (let l = 0; l < 3; l++) for (let s = 0; s < 5; s++) { WL.x.push(CP_X[s]); WL.y.push(LANE_Y[l]); WL.lane.push(l); WL.slot.push(s); WL.owner.push(-1); WL.prog.push(0); WL.contestedAt.push(-99); WL.n++; }
  const presW = new Float32Array(WL.n), presE = new Float32Array(WL.n), inContest = new Uint8Array(WL.n);   // who stands on each point, as read at the last checkpoint step

  const grid = new Grid(W, H, o.cell, N);
  // THE SIDES OF THE GRID. The grid lists each cell's bodies in index order, both sides together; through that list run two chains a
  // cell - the west bodies in the grid's order, the east bodies in the grid's order - so a scan for one side (a target, a shot's mark,
  // a blast, an arc's next hop, a rally) walks that side alone and meets its bodies in the very order grid.near would hand them. What a
  // scan sees and the order it sees it in are unchanged, which is what keeps every match replaying byte for byte; only the bodies it
  // would have turned away are no longer looked at. A slot that dies and is born again to the other side before the next build (a
  // hive's or a bloom's child in a dead enemy's slot) is moved to the other chain at its own place (reseat), so a scan under way meets
  // it, or has passed it, exactly as the full walk would. A swarm's cohesion reads both sides in index order and walks the grid's list.
  // Positions are indices into grid.items; a chain ends at its cell's end (start[k+1]); prev −1 is a chain's head.
  const side = { next: new Int32Array(N), prev: new Int32Array(N), head: new Int32Array(2 * grid.n), pos: new Int32Array(N), of: new Uint8Array(N) };
  let gridHi = 0;   // how far the grid was built this tick: a slot below it that was alive at the build stands in a cell
  // THE CONTACT GRID: a fine hash that only the separation push reads, built with the main grid every tick. A 96-wu cell at a stronghold
  // holds a crowd's hundreds, and a push walked through it met the first bodies of the many beside it rather than the few it touched; at
  // 24 wu a cell holds a handful and a mote's push box touches four of them.
  const contact = new Grid(W, H, 24, N);
  // the chains of every cell that holds a body, in one walk down the grid's list (a cell's bodies are one run of it)
  function splitSides() {
    const start = grid.start, items = grid.items, cellOf = grid.cellOf, total = start[grid.n], team = U.team;
    const next = side.next, prev = side.prev, head = side.head, pos = side.pos, of = side.of;
    for (let q = 0; q < total;) {
      const k = cellOf[items[q]], end = start[k + 1];
      let lastW = -1, lastE = -1;
      head[2 * k] = end; head[2 * k + 1] = end;
      for (let p = q; p < end; p++) {
        const j = items[p], s = team[j];
        pos[j] = p; of[j] = s; next[p] = end;
        if (s === 0) { prev[p] = lastW; if (lastW < 0) head[2 * k] = p; else next[lastW] = p; lastW = p; }
        else { prev[p] = lastE; if (lastE < 0) head[2 * k + 1] = p; else next[lastE] = p; lastE = p; }
      }
      q = end;
    }
  }
  // body i, held under side of[i] in this tick's grid, now stands for the other side: out of the one chain, into the other at its place
  function reseat(i, team) {
    const p = side.pos[i], k = grid.cellOf[i], a = grid.start[k], end = grid.start[k + 1];
    const next = side.next, prev = side.prev, head = side.head, of = side.of, items = grid.items;
    if (prev[p] >= 0) next[prev[p]] = next[p]; else head[2 * k + of[i]] = next[p];
    if (next[p] < end) prev[next[p]] = prev[p];
    let u = p - 1;   // the nearest body of the new side before it in the grid's order, if any
    while (u >= a && of[items[u]] !== team) u--;
    const n = u >= a ? next[u] : head[2 * k + team];
    prev[p] = u >= a ? u : -1; next[p] = n;
    if (u >= a) next[u] = p; else head[2 * k + team] = p;
    if (n < end) prev[n] = p;
    of[i] = team;
  }
  // THE SLACK. A target scan culls cells by their rects, but the grid stands as built while move() runs body by body: a body listed in a
  // cell may have walked (or blinked) out of the cell's rect before a later body scans, and a slot born again this tick stands wherever
  // it was born. slack[k] is how far any body of cell k has gone from where the build found it (rowSlack[cy] the most in a row); a cell
  // is culled only past the ring plus its slack, so every body it lists is provably out of reach. Reset at every build.
  const slack = new Float64Array(grid.n), rowSlack = new Float64Array(grid.rows);
  const SLACK_MARGIN = 1e-3;   // a hair past the ring for the rounding of the squares: a cull never cuts a body the full walk would have taken
  function slackOf(k, d) { if (d > slack[k]) { slack[k] = d; const row = (k / grid.cols) | 0; if (d > rowSlack[row]) rowSlack[row] = d; } }
  // the cells touching the box (x ± r, y ± r), exactly as grid.near walks them, left in bx0..by1 for the loops below
  let bx0 = 0, bx1 = 0, by0 = 0, by1 = 0;
  function box(x, y, r) {
    const c = grid.cell;
    bx0 = ((x - r) / c) | 0; bx1 = ((x + r) / c) | 0; by0 = ((y - r) / c) | 0; by1 = ((y + r) / c) | 0;
    if (bx0 < 0) bx0 = 0; if (by0 < 0) by0 = 0;
    if (bx1 >= grid.cols) bx1 = grid.cols - 1; if (by1 >= grid.rows) by1 = grid.rows - 1;
  }
  // one side's bodies in the box: the bodies grid.near would hand fn of that side, in the order it would hand them; fn(j) returns true to stop
  function nearSide(x, y, r, team, fn) {
    box(x, y, r);
    const start = grid.start, items = grid.items, head = side.head, next = side.next, cols = grid.cols;
    for (let cy = by0; cy <= by1; cy++) {
      for (let cx = bx0, k = cy * cols + cx; cx <= bx1; cx++, k++) {
        const end = start[k + 1]; if (start[k] === end) continue;
        for (let p = head[2 * k + team]; p < end; p = next[p]) if (fn(items[p])) return;
      }
    }
  }
  const S = {
    o, rng, kinds, decks, U, P, MN, T, WL, grid,
    energy: [o.energy0, o.energy0], income: [0, 0],
    tick: 0, time: 0, events: [], queue: [], result: null, grpN: 1,
    surge: [0, 0], surgeLane: [-1, -1], surgeUntil: [0, 0], surgeAt: [-99, -99],
    wave: [null, null], waveN: [0, 0],
    // the fronts per lane, the x-direction each last moved in (a chevron), and the last side to advance there
    front: { w: [1500, 1500, 1500], e: [7500, 7500, 7500], chevW: [1, 1, 1], chevE: [-1, -1, -1], moved: [{ team: -1, at: 0 }, { team: -1, at: 0 }, { team: -1, at: 0 }] },
    gateHitAt: new Array(10).fill(-99), doom: null, lastHit: -99,
    killsRing: { slots: [new Uint16Array(KILL_SPAN), new Uint16Array(KILL_SPAN), new Uint16Array(KILL_SPAN)], sum: [0, 0, 0] },
    stats: { deployed: [0, 0], musters: [0, 0], kills: [0, 0], spent: [0, 0], towerDmg: [0, 0], roleKills: [new Uint32Array(36), new Uint32Array(36)], captures: [0, 0], centres: [0, 0], shatters: [0, 0], surges: [0, 0], waves: [0, 0] },
  };
  const surgeOpen = [false, false];   // a surge whose eight seconds have not yet been closed out
  const gatesUp = [3, 3];              // the gates a side still has standing: THE OPEN KEEPS (hurtTower) read it
  const EV_CAP = 2400;
  // the flood (hits, shots, sparks) is capped a tick so a big war cannot drown a frame; the moments (deaths, musters, captures, shatters, the surge, the wave, the doom, the end) always land
  const ev = (e) => { if (S.events.length < EV_CAP) S.events.push(e); };
  const evSure = (e) => { S.events.push(e); };
  const roleOf = (kind) => kinds[kind].shape;
  const mult = () => 1 + S.time * o.escalate;
  const surgeLive = (team) => S.surgeUntil[team] > S.time;
  const addSurge = (team, amt) => { S.surge[team] = Math.min(o.surgeMax, S.surge[team] + amt); };
  // THE METER HOLDS while its side's surge runs: the kills and captures a surge makes do not refill it. They did, at the full rate, and a surge
  // ended 30-100 % full - thirty surges a match, a plate up more than half the time - so the peak the match is built toward became routine. The
  // breach's +2,500 (breakLane) is the one fill that lands mid-surge: §0's peak has the meter jump at the shatter the surge made.
  const fillSurge = (team, amt) => { if (!surgeLive(team)) addSurge(team, amt); };
  // a body is surging while its side's surge runs in its lane: one branch per body in move, fire and hurt
  const surging = (i) => surgeLive(U.team[i]) && U.lane[i] === S.surgeLane[U.team[i]];

  // ---- slots
  function allocUnit() { if (U.free.length) return U.free.pop(); if (U.hi >= N) return -1; return U.hi++; }
  function allocShot() { if (P.free.length) return P.free.pop(); if (P.hi >= M) return -1; return P.hi++; }
  function allocMine() { if (MN.free.length) return MN.free.pop(); if (MN.hi >= MM) return -1; return MN.hi++; }

  function spawnUnit(team, kind, x, y, lane, grp, goalX, slotF, slotS, stage, defend) {
    const i = allocUnit(); if (i < 0) return -1;
    const k = kinds[kind];
    // born in the run, a body is born inside its band (a bloom's motes and a hive's children scatter past the edge); the band test reads the stored float32 x
    U.x[i] = x; U.y[i] = inRun(U.x[i]) ? clampY(lane, y, k.r) : y; U.vx[i] = 0; U.vy[i] = 0;
    U.hp[i] = k.hp; U.sh[i] = k.shieldMax; U.cd[i] = rng() * 0.5; U.age[i] = 0; U.ph[i] = rng() * 6.283; U.stun[i] = 0;
    U.kind[i] = kind; U.team[i] = team; U.alive[i] = 1; U.target[i] = -1; U.goal[i] = -1; U.grp[i] = grp; U.clutch[i] = k.w.type === 'spawn' ? (k.w.clutch || 24) : 0;
    U.lane[i] = lane; U.goalX[i] = goalX; U.slotF[i] = slotF; U.slotS[i] = slotS; U.holdUntil[i] = 0; U.quiet[i] = 0; U.stage[i] = stage; U.defend[i] = defend;
    U.pushX[i] = 0; U.pushY[i] = 0; U.pushT[i] = 0; U.charge[i] = 0;
    // born under the doom (a hive's child, a bloom's motes): the wave takes it when it passes
    U.doomAt[i] = S.doom && S.doom.team === team ? S.doom.at + Math.sqrt((x - S.doom.x) ** 2 + (y - S.doom.y) ** 2) / o.doomV : 0;
    U.count[team]++; laneAlive[team * 3 + lane]++;
    // a slot freed this tick and born again still stands in this tick's grid, in its old cell: that cell can no longer be culled, and
    // when the body is the other side's now the side chains re-seat it
    if (i < gridHi && grid.cellOf[i] >= 0) { slackOf(grid.cellOf[i], Infinity); if (side.of[i] !== team) reseat(i, team); }
    return i;
  }
  function killUnit(i, byTeam, byKind) {
    if (!U.alive[i]) return;
    const k = kinds[U.kind[i]], team = U.team[i], lane = U.lane[i];
    U.alive[i] = 0; U.count[team]--; laneAlive[team * 3 + lane]--; U.free.push(i); unpicket(i);
    if (byTeam >= 0 && byTeam !== team) {
      S.stats.kills[byTeam]++; if (byKind >= 0) S.stats.roleKills[byTeam][roleOf(byKind) * 6 + k.shape]++;
      fillSurge(byTeam, k.cost * o.surgePerEnergy / mult());
      S.killsRing.slots[lane][S.tick % KILL_SPAN]++; S.killsRing.sum[lane]++;
    }
    evSure({ t: 'death', x: U.x[i], y: U.y[i], team, kind: k.index, r: k.r, by: byKind, lane });
    if (k.traits.split && k.splitIndex >= 0) {   // a bloom breaks into motes that carry on its orders
      for (let j = 0; j < k.splitN; j++) {
        const a = rng() * 6.283, d = 6 + rng() * 14;
        const c = spawnUnit(team, k.splitIndex, U.x[i] + Math.cos(a) * d, U.y[i] + Math.sin(a) * d, lane, U.grp[i], U.goalX[i], U.slotF[i], U.slotS[i], U.stage[i], U.defend[i]);
        if (c >= 0) { U.vx[c] = Math.cos(a) * 120; U.vy[c] = Math.sin(a) * 120; }
      }
    }
  }

  // ---- damage, the one door
  function hurt(i, dmg, byTeam, hx, hy, byKind) {
    if (!U.alive[i] || dmg <= 0) return;
    if (kinds[U.kind[i]].shape === 1 && surging(i)) dmg *= 0.5;   // BULWARK: a surging square takes half
    if (U.sh[i] > 0) { const a = Math.min(U.sh[i], dmg); U.sh[i] -= a; dmg -= a; if (dmg <= 0) { ev({ t: 'shield', x: hx, y: hy, team: U.team[i] }); return; } }
    U.hp[i] -= dmg; S.lastHit = S.time;
    ev({ t: 'hit', x: hx, y: hy, team: U.team[i], dmg, i });
    if (U.hp[i] <= 0) killUnit(i, byTeam, byKind);
  }
  // the one door for stronghold damage; byKind and byLane are the shooter's: the SIEGE shape (3, the long guns) lands whole, and so does a surging lane on the gate
  // it surges at - the breach itself; every other shot, a surging lane's on a keep or on another lane's gate included, is scaled by THE WALL
  function hurtTower(t, dmg, byTeam, byKind, byLane) {
    if (!T.alive[t]) return;
    const breach = T.kind[t] === 0 && T.lane[t] === byLane && surgeLive(byTeam) && S.surgeLane[byTeam] === byLane;
    if (kinds[byKind].shape === 3) { if (T.kind[t]) dmg *= o.keepSiege; }
    else if (!breach) dmg *= T.kind[t] ? (gatesUp[T.team[t]] ? o.keepWall : o.keepOpen) : o.wall;
    T.hp[t] -= dmg; S.stats.towerDmg[byTeam] += dmg; S.gateHitAt[t] = S.time; S.lastHit = S.time;
    ev({ t: 'towerHit', x: T.x[t], y: T.y[t], team: T.team[t], tower: t, lane: T.lane[t], kind: T.kind[t] });   // kind: 0 a gate, 1 a keep
    if (T.hp[t] > 0) return;
    // THE SHATTER: the stronghold falls, the loser's bodies around it are blown outward, a gate takes its whole lane with it, a last keep dooms its side
    T.hp[t] = 0; T.alive[t] = 0; S.stats.shatters[byTeam]++; if (T.kind[t] === 0) gatesUp[T.team[t]]--;
    evSure({ t: 'shatter', x: T.x[t], y: T.y[t], team: T.team[t], tower: t, kind: T.kind[t], lane: T.lane[t], by: byTeam });
    shockwave(T.x[t], T.y[t], T.team[t]);
    if (T.kind[t] === 0) breakLane(T.lane[t], byTeam, T.x[t]);
    if (!standing(T.team[t])) doom(T.team[t], T.x[t], T.y[t]);
  }
  let wx0 = 0, wy0 = 0, wteam = 0;
  const shockOne = (j) => {
    if (!U.alive[j]) return false;
    const dx = U.x[j] - wx0, dy = U.y[j] - wy0, d2 = dx * dx + dy * dy;
    if (d2 > o.shockR * o.shockR) return false;
    const d = Math.sqrt(d2), on = d < 0.5;   // a body on the very centre flies toward its own side
    U.pushX[j] = (on ? (wteam === 0 ? -1 : 1) : dx / d) * o.shockV; U.pushY[j] = (on ? 0 : dy / d) * o.shockV; U.pushT[j] = o.shockS;
    U.stun[j] = Math.max(U.stun[j], o.shockStun);
    return false;
  };
  function shockwave(x, y, loser) { wx0 = x; wy0 = y; wteam = loser; nearSide(x, y, o.shockR, loser, shockOne); }
  // THE LANE BREAK: a dead gate hands every checkpoint of its lane to the breaker at once, and a quarter of a meter with them
  function breakLane(lane, breaker, deadX) {
    for (let s = 0; s < 5; s++) { const w = cp(lane, s); WL.owner[w] = breaker; WL.prog[w] = breaker === 0 ? 1 : -1; }
    addSurge(breaker, 2500);   // whole, even mid-surge (the meter's hold is fillSurge's)
    evSure({ t: 'laneBreak', lane, team: breaker, from: GATE_X[breaker], to: deadX });
    updateFront(lane);
  }
  function standing(team) { for (let t = 0; t < T.n; t++) if (T.team[t] === team && T.alive[t]) return true; return false; }
  // THE DOOM: a side with no stronghold left dies in a wave from the last one, at doomV; the result waits until the wave has crossed the far corner and a tail after
  function doom(team, x, y) {
    if (S.doom) return;
    const far = Math.sqrt(Math.max(x, W - x) ** 2 + Math.max(y, H - y) ** 2);
    S.doom = { team, x, y, at: S.time, until: S.time + far / o.doomV + o.doomTail };
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === team) U.doomAt[i] = S.time + Math.sqrt((U.x[i] - x) ** 2 + (U.y[i] - y) ** 2) / o.doomV;
    evSure({ t: 'doom', team, x, y, until: S.doom.until });
  }
  // a splash: every enemy body it reaches takes the damage less a share of its distance, then every enemy stronghold it touches takes six tenths
  function blast(x, y, r, dmg, team, byKind, byLane) {
    box(x, y, r);
    const enemy = 1 - team, start = grid.start, items = grid.items, head = side.head, next = side.next, cols = grid.cols;
    for (let cy = by0; cy <= by1; cy++) {
      for (let cx = bx0, k = cy * cols + cx; cx <= bx1; cx++, k++) {
        const end = start[k + 1]; if (start[k] === end) continue;
        for (let p = head[2 * k + enemy]; p < end; p = next[p]) {
          const j = items[p]; if (!U.alive[j]) continue;
          const dx = U.x[j] - x, dy = U.y[j] - y, d = Math.sqrt(dx * dx + dy * dy);
          if (d < r + K.r[U.kind[j]]) hurt(j, dmg * (1 - Math.max(0, d - 20) / (r + 1)), team, U.x[j], U.y[j], byKind);
        }
      }
    }
    for (let t = 0; t < T.n; t++) if (T.alive[t] && T.team[t] !== team) { const dx = T.x[t] - x, dy = T.y[t] - y, rr = r + T.r[t]; if (dx * dx + dy * dy < rr * rr) hurtTower(t, dmg * 0.6, team, byKind, byLane); }
  }

  // ---- formations: slots as [forward, side] offsets in world units; a cloud draws from the stream it is handed (the sim's at a muster, a private one for a ghost)
  function slots(n, form, sp, r, maxRad, out) {
    if (form === 'line' || form === 'column') { const cols = form === 'line' ? Math.min(n, 8) : 2; for (let i = 0; i < n; i++) { const row = (i / cols) | 0, c = i % cols; out.push([-row * sp, (c - (Math.min(n, cols) - 1) / 2) * sp]); } }
    else if (form === 'wedge') { for (let i = 0; i < n; i++) { const row = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2), k = i - row * (row + 1) / 2; out.push([-row * sp * 0.9, (k - row / 2) * sp]); } }
    else if (form === 'ring') { const rad = sp * n / 6.283 + sp; for (let i = 0; i < n; i++) { const a = i / n * 6.283; out.push([Math.cos(a) * rad, Math.sin(a) * rad]); } }
    else { const rad = Math.min(maxRad, sp * Math.sqrt(n) * 0.9); for (let i = 0; i < n; i++) { const a = r() * 6.283, d = Math.sqrt(r()) * rad; out.push([Math.cos(a) * d, Math.sin(a) * d]); } }
    return out;
  }
  // a formation is clamped to its band at the muster: a slot past the limit is pinned to it and steps back one rank
  function foldToBand(out, big, sp) {
    const lim = HALF - big - 20;
    for (const q of out) { if (q[1] > lim) { q[1] = lim; q[0] -= sp; } else if (q[1] < -lim) { q[1] = -lim; q[0] -= sp; } }
  }
  // the bodies of a battalion at the clock's mult, heavy first (the heavy bodies take the front slots), and the biggest radius among them
  function musterList(b) {
    const m = mult(), list = [];
    for (const [kind, n] of b.body) { const c = Math.max(1, Math.round(n * m)); for (let i = 0; i < c; i++) list.push(kind); }
    list.sort((a, c) => kinds[c].r - kinds[a].r);
    let big = 0; for (const [kind] of b.body) big = Math.max(big, kinds[kind].r);
    return { list, big };
  }
  const slotBuf = [];
  // what a card would muster now, for the ghost under a finger: the real slots at the current mult, a cloud from a stream of its own so the sim's is never touched
  function formation(battIndex, team) {
    const b = decks[team][battIndex | 0]; if (!b) return null;
    const { list, big } = musterList(b), sp = big * 2.6, out = [];
    slots(list.length, b.form, sp, rng32(1000 + (battIndex | 0)), HALF - big - 20, out);
    foldToBand(out, big, sp);
    return { slots: out.map((q, i) => [q[0], q[1], list[i]]), big, form: b.form };
  }

  // ---- commands
  // { op: 'deploy', team, batt: id | deck index, lane, x, free? }   a battalion into a lane, marching to x (clamped to [1300, 7700]; past the enemy gate = to the keeps, once that gate is dead)
  // { op: 'deploy', team, kind: id | index, lane, x, free? }        one body (the tools and the wire), the same march
  // { op: 'deploy', team, tower, batt | kind, goal }                 the legacy form: a goal ≥ 1000 is a checkpoint (index + 1000), a gate or a keep names its lane and x
  // { op: 'surge', team, lane }                                      a full meter into a lane: one super per shape for surgeS seconds
  // { op: 'wave', team, lane, roles, n?, name? }                     the captain announces its wave three seconds ahead (lane −1 = ALL LANES, the bell's plate); the sim only records it and tells the glass
  function apply(cmd) {
    if (S.result || !cmd) return false;
    const team = cmd.team | 0; if (team < 0 || team > 1) return false;
    if (S.doom && S.doom.team === team) return false;   // the doomed side gives no more orders
    if (cmd.op === 'surge') return fireSurge(team, cmd.lane | 0);
    if (cmd.op === 'wave') return announceWave(team, cmd);
    if (cmd.op !== 'deploy' || (cmd.batt === undefined && cmd.kind === undefined)) return false;
    const order = readOrder(team, cmd); if (!order) return false;
    const from = musterPoint(team, order.lane); if (from < 0) return false;
    const ok = cmd.batt !== undefined ? musterBattalion(team, cmd, order, from) : musterOne(team, cmd, order, from);
    const wv = S.wave[team];
    if (ok && wv && (wv.lane < 0 || wv.lane === order.lane) && S.tick >= wv.at) S.wave[team] = null;   // the announced wave has come (a plate for ALL LANES is honoured by any lane)
    return ok;
  }
  // where an order goes: its lane, the x it marches to, the stage it starts in and whether it is a DEFEND
  function readOrder(team, cmd) {
    let lane, x;
    if (cmd.lane !== undefined) { lane = cmd.lane | 0; x = +cmd.x; }
    else {   // the legacy form: the goal names the place
      const g = cmd.goal === undefined || cmd.goal === null ? -1 : cmd.goal | 0;
      if (g >= 1000) { const w = g - 1000; if (w >= WL.n) return null; lane = WL.lane[w]; x = WL.x[w]; }
      else if (g >= 0 && g < T.n) { lane = towerLane(g); x = T.x[g]; }
      else { const tw = cmd.tower | 0; lane = tw >= 0 && tw < T.n && T.team[tw] === team ? towerLane(tw) : 1; x = GATE_X[1 - team]; }
    }
    if (lane < 0 || lane > 2 || Number.isNaN(x)) return null;
    const past = team === 0 ? x > GATE_X[1] : x < GATE_X[0];
    if (past && !T.alive[gate(1 - team, lane)]) return { lane, goalX: KEEP_X[1 - team], stage: 3, defend: 0 };   // to the keeps, through the dead gate
    const goalX = Math.min(DROP_MAX, Math.max(DROP_MIN, x));
    let defend = 0;
    for (let s = 0; s < 5; s++) if (Math.abs(goalX - CP_X[s]) <= 100 && WL.owner[cp(lane, s)] === team) defend = 1;   // a drop on a point of ours is a DEFEND
    return { lane, goalX, stage: 0, defend };
  }
  // the muster stronghold: the lane's own gate; when it is dead, the side's living keep nearest the lane head; none → no muster
  function musterPoint(team, lane) {
    const g = gate(team, lane); if (T.alive[g]) return g;
    let best = -1, bd = Infinity;
    for (let k = 0; k < 2; k++) { const t = keep(team, k); if (!T.alive[t]) continue; const d = Math.abs(T.y[t] - LANE_Y[lane]); if (d < bd) { bd = d; best = t; } }
    return best;
  }
  // where a formation forms and which way it faces: MUSTER_AHEAD past the stronghold's edge - along the lane from a gate, toward the lane head from a keep
  let mx = 0, my = 0, mfx = 1, mfy = 0;
  function musterOrigin(from, team, lane) {
    if (T.kind[from] === 0) { mfx = team === 0 ? 1 : -1; mfy = 0; }
    else { const dx = GATE_X[team] - T.x[from], dy = LANE_Y[lane] - T.y[from], d = Math.sqrt(dx * dx + dy * dy) || 1; mfx = dx / d; mfy = dy / d; }
    mx = T.x[from] + mfx * (T.r[from] + MUSTER_AHEAD); my = T.y[from] + mfy * (T.r[from] + MUSTER_AHEAD);
  }
  function musterBattalion(team, cmd, order, from) {
    const deck = decks[team];
    const bi = typeof cmd.batt === 'string' ? deck.findIndex((q) => q.id === cmd.batt) : cmd.batt | 0;
    const b = deck[bi]; if (!b) return false;
    const price = Math.round(b.cost * mult());
    if (!cmd.free && S.energy[team] < price) return false;
    const { list, big } = musterList(b), sp = big * 2.6, atGate = T.kind[from] === 0;
    slotBuf.length = 0; slots(list.length, b.form, sp, rng, atGate ? HALF - big - 20 : Infinity, slotBuf);
    if (atGate) foldToBand(slotBuf, big, sp);
    musterOrigin(from, team, order.lane);
    const grp = S.grpN++ & 0xffff;
    let born = 0;
    for (let i = 0; i < list.length; i++) { const [f, s] = slotBuf[i]; if (spawnUnit(team, list[i], mx + mfx * f - mfy * s, my + mfy * f + mfx * s, order.lane, grp, order.goalX, f, s, order.stage, order.defend) >= 0) born++; }
    if (!born) return false;
    if (!cmd.free) { S.energy[team] -= price; S.stats.spent[team] += price; }
    S.stats.deployed[team] += born; S.stats.musters[team]++;
    evSure({ t: 'muster', x: mx, y: my, team, role: b.role, n: born, lane: order.lane, x2: order.goalX, batt: bi, grp, defend: order.defend });
    return true;
  }
  function musterOne(team, cmd, order, from) {
    const kind = typeof cmd.kind === 'string' ? kindOf(cmd.kind) : cmd.kind | 0;
    const k = kinds[kind]; if (!k) return false;
    const price = Math.round(k.cost * mult());   // the clock scales every price, a lone body's too
    if (!cmd.free && S.energy[team] < price) return false;
    musterOrigin(from, team, order.lane);
    const a = rng() * 6.283, d = rng() * 40;
    const i = spawnUnit(team, kind, mx + Math.cos(a) * d, my + Math.sin(a) * d, order.lane, 0, order.goalX, 0, 0, order.stage, order.defend);
    if (i < 0) return false;
    if (!cmd.free) { S.energy[team] -= price; S.stats.spent[team] += price; }
    S.stats.deployed[team]++;
    evSure({ t: 'deploy', x: U.x[i], y: U.y[i], team, kind, lane: order.lane });
    return true;
  }

  // ---- THE SURGE: a full meter into a lane. Every body of the side in that lane gets its shape's super for surgeS seconds; the first tick's effects land at once.
  // the side's top role by fielded energy in a lane, -1 when nothing of its stands there
  function topRoleIn(team, lane) {
    const f = [0, 0, 0, 0, 0, 0]; let any = false;
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === team && U.lane[i] === lane) { const k = kinds[U.kind[i]]; f[k.shape] += k.cost; any = true; }
    if (!any) return -1;
    let best = 0; for (let q = 1; q < 6; q++) if (f[q] > f[best]) best = q;
    return best;
  }
  function fireSurge(team, lane) {
    if (lane < 0 || lane > 2 || S.surge[team] < o.surgeMax) return false;
    const role = topRoleIn(team, lane); if (role < 0) return false;   // an empty lane keeps the meter: there is nothing there to surge
    S.surge[team] = 0; S.surgeLane[team] = lane; S.surgeUntil[team] = S.time + o.surgeS; S.surgeAt[team] = S.time; S.stats.surges[team]++; surgeOpen[team] = true;
    evSure({ t: 'surge', team, lane, role });
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === team && U.lane[i] === lane) superOpen(i, kinds[U.kind[i]]);
    return true;
  }
  // the first tick of each super: BULWARK's pool, BLINK's jump and charge, BARRAGE's salvo, NOVA's pulse and heal (OVERDRIVE and EXECUTE ride the branches in move, fire and retarget)
  function superOpen(i, k) {
    switch (k.shape) {
      case 1: U.sh[i] += 200; break;   // a 200 pool at once, above the shield's max for the surge; a block with no shield gets one too
      case 2: {
        U.charge[i] = 3;
        if (!targetPos(i)) break;
        const dx = tx - U.x[i], dy = ty - U.y[i], d = Math.sqrt(dx * dx + dy * dy) || 1, jump = Math.min(400, d - stopDist(k.index, gunAhead(i)));
        if (jump <= 0) break;
        const x2 = U.x[i] + dx / d * jump, y2 = U.y[i] + dy / d * jump;
        if (U.stage[i] >= 4 && inEnemyYard(U.team[i], U.x[i]) && !inEnemyYard(U.team[i], x2)) break;   // a body past the enemy's gates never blinks back into the run (see move())
        evSure({ t: 'blink', x: U.x[i], y: U.y[i], x2, y2, team: U.team[i] });
        U.x[i] = x2; U.y[i] = inRun(U.x[i]) ? clampY(U.lane[i], y2, k.r) : y2;   // the band test reads the stored float32 x
        break;
      }
      case 3: {
        if ((k.w.type !== 'missile' && k.w.type !== 'beam') || !targetPos(i)) break;
        const d = Math.sqrt((tx - U.x[i]) ** 2 + (ty - U.y[i]) ** 2);
        if (d > k.w.range + tr) break;
        for (let n = 0; n < 5; n++) fire(i, k, d, true);
        break;
      }
      case 4: nova(i, k); break;
    }
  }
  let nx0 = 0, ny0 = 0;
  const inNova = (j) => { if (!U.alive[j]) return false; const dx = U.x[j] - nx0, dy = U.y[j] - ny0; return dx * dx + dy * dy <= 300 * 300; };
  const novaHeal = (j) => { if (inNova(j)) { const hp = K.hp[U.kind[j]]; U.hp[j] = Math.min(hp, U.hp[j] + hp * 0.3); } return false; };
  const novaStun = (j) => { if (inNova(j)) U.stun[j] = Math.max(U.stun[j], 1.2); return false; };
  function nova(i, k) {
    nx0 = U.x[i]; ny0 = U.y[i];
    const team = U.team[i];
    nearSide(nx0, ny0, 300, team, novaHeal); nearSide(nx0, ny0, 300, 1 - team, novaStun);
    ev({ t: 'pulse', x: nx0, y: ny0, r: 300, team, kind: k.index, emp: true });
  }
  // the eight seconds are up: BULWARK's pools drain back to the shield's own max
  function surgeClose(team) {
    const lane = S.surgeLane[team];
    for (let i = 0; i < U.hi; i++) { if (!U.alive[i] || U.team[i] !== team || U.lane[i] !== lane) continue; const k = kinds[U.kind[i]]; if (k.shape === 1 && U.sh[i] > k.shieldMax) U.sh[i] = k.shieldMax; }
  }

  // ---- THE WAVE: the captain's announcement, recorded so replays and the coach see it; the captain musters it itself three seconds on
  function waveRole(roles) { const c = [0, 0, 0, 0, 0, 0]; for (const r of roles) if (r >= 0 && r < 6) c[r]++; let best = 0; for (let q = 1; q < 6; q++) if (c[q] > c[best]) best = q; return best; }
  function announceWave(team, cmd) {
    const lane = cmd.lane | 0; if (lane < -1 || lane > 2) return false;   // −1 is ALL LANES: the bell's WAVE 1 · THE SPEARHEAD → ALL LANES (§5.4)
    const roles = Array.isArray(cmd.roles) ? cmd.roles.map((r) => r | 0) : [];
    const n = cmd.n === undefined ? S.waveN[team] + 1 : cmd.n | 0;
    S.waveN[team] = Math.max(S.waveN[team], n);
    const name = cmd.name || WAVE_NAMES[waveRole(roles)][((n - 1) % 4 + 4) % 4];
    S.wave[team] = { n, lane, roles, name, at: S.tick + 90 }; S.stats.waves[team]++;
    evSure({ t: 'wave', team, n, lane, roles, name, inS: 3 });
    return true;
  }

  // ---- targeting: the nearest enemy body inside the aggro ring, else the stronghold the march is at
  // THE EYE OF EACH ROLE: a swarm, an armour or a field takes the nearest; a striker or a blade takes the weakest it can reach (and finishes it); a siege gun takes the biggest, and never one inside its minimum range
  // THE SCAN walks the enemy's bodies of every cell the aggro box touches, in the grid's order, and culls cells exactly: a cell (a row) whose
  // rect lies beyond the ring plus its slack - or, for an eye that takes the nearest, beyond the best body found so far plus its slack -
  // holds no body the eye would take, so it is passed over. The same bodies are weighed in the same order; far fewer are looked at.
  // A body in the run has no target at all while none of theirs stands in its lane, so it does not look.
  function retarget(i, kind) {
    const x = U.x[i], y = U.y[i], team = U.team[i], enemy = 1 - team, lane = U.lane[i], run = inRun(x), eye = K.eye[kind], min2 = K.minRange2[kind];
    let best = -1, bd = K.aggro2[kind], reach = K.aggro[kind], score = 0;   // bd, reach: the distance² and distance a body must be under to be taken - the ring, then the nearest found
    if (run ? laneAlive[enemy * 3 + lane] > 0 : U.count[enemy] > 0) {
      box(x, y, reach);
      const start = grid.start, items = grid.items, head = side.head, next = side.next, cols = grid.cols, c = grid.cell;
      for (let cy = by0; cy <= by1; cy++) {
        const ey = y < cy * c ? cy * c - y : y > (cy + 1) * c ? y - (cy + 1) * c : 0, ey2 = ey * ey, rowLim = reach + rowSlack[cy] + SLACK_MARGIN;
        if (ey2 >= rowLim * rowLim) continue;
        for (let cx = bx0, k = cy * cols + cx; cx <= bx1; cx++, k++) {
          const end = start[k + 1]; if (start[k] === end) continue;
          const ex = x < cx * c ? cx * c - x : x > (cx + 1) * c ? x - (cx + 1) * c : 0, lim = reach + slack[k] + SLACK_MARGIN;
          if (ex * ex + ey2 >= lim * lim) continue;
          for (let p = head[2 * k + enemy]; p < end; p = next[p]) {
            const j = items[p];
            if (!U.alive[j]) continue;
            if (U.lane[j] !== lane && (run || inRun(U.x[j]))) continue;   // lane-locked: a body in the run fights its own lane; only the yards are open ground
            const dx = U.x[j] - x, dy = U.y[j] - y, d = dx * dx + dy * dy;
            if (d >= bd) continue;
            const kj = U.kind[j];
            if ((K.cloak[kj] || (K.shape[kj] === 5 && surging(j))) && d > CLOAK_R2 && U.cd[j] > 0.3) continue;   // a cloaked body (or an EXECUTING diamond) is unseen beyond 120 until it has just fired
            if (eye === NEAREST) { bd = d; reach = Math.sqrt(d); best = j; }
            else if (eye === WEAKEST) { const sc = U.hp[j] + U.sh[j] + Math.sqrt(d) * 0.08; if (best >= 0 && sc >= score) continue; score = sc; best = j; }
            else { if (d < min2) continue; const sc = U.hp[j] + U.sh[j] - Math.sqrt(d) * 0.05; if (best >= 0 && sc <= score) continue; score = sc; best = j; }
          }
        }
      }
    }
    U.target[i] = best >= 0 ? best : strongholdTarget(i, kind);
  }
  // no enemy body in reach: at THE GATE, THE KEEP and THE HUNT stages the stronghold itself (the tick a gate dies its besiegers turn to the keeps;
  // the tick the last keep dies they turn to whatever of the enemy's still stands, reached through the yard); on the march, an enemy stronghold
  // inside the aggro ring - the lane's gate from the run, any of them from the yard. A keep is shot only from the yard.
  function strongholdTarget(i, kind) {
    const team = U.team[i], lane = U.lane[i], aggro = K.aggro[kind];
    if (U.stage[i] === 3) { const g = gate(1 - team, lane); if (T.alive[g]) { U.goal[i] = g; return -2 - g; } U.stage[i] = 4; U.goal[i] = -1; }
    if (U.stage[i] === 4) {
      let g = U.goal[i];
      if (g < 0 || !T.alive[g]) { const dead = gate(1 - team, lane); g = nearestStronghold(1 - team, T.x[dead], T.y[dead], 1); U.goal[i] = g; }
      if (g >= 0) return -2 - g;
      U.stage[i] = 5; U.goal[i] = -1;   // no keep left: THE HUNT
    }
    // THE HUNT (stage 5): the nearest living enemy stronghold of any lane, by straight distance from the body, reached through the yard. The spec's
    // IDLE stood still, and a side whose last gate stood in a lane the other side could no longer muster into was never reached again - a 480 s
    // stalemate with hundreds idle on both yards; a body that has broken through walks to whatever stands. Nothing standing means the enemy is doomed
    // already and the wave is on its way.
    if (U.stage[i] === 5) {
      let g = U.goal[i];
      if (g < 0 || !T.alive[g]) { g = nearestStronghold(1 - team, U.x[i], U.y[i], -1); U.goal[i] = g; }
      return g < 0 ? -1 : -2 - g;
    }
    if (inRun(U.x[i])) { const g = gate(1 - team, lane); return T.alive[g] && within(i, g, aggro) ? -2 - g : -1; }
    let best = -1, bd = Infinity;
    for (let t = 0; t < T.n; t++) { if (T.team[t] === team || !T.alive[t] || !within(i, t, aggro)) continue; const d = (T.x[t] - U.x[i]) ** 2 + (T.y[t] - U.y[i]) ** 2; if (d < bd) { bd = d; best = t; } }
    return best < 0 ? -1 : -2 - best;
  }
  const within = (i, t, reach) => { const dx = T.x[t] - U.x[i], dy = T.y[t] - U.y[i], rr = reach + T.r[t]; return dx * dx + dy * dy < rr * rr; };
  // a side's living stronghold nearest a point - of one kind (0 the gates, 1 the keeps) or of any (−1); −1 when none stands
  function nearestStronghold(team, x, y, kind) {
    let best = -1, bd = Infinity;
    for (let t = 0; t < T.n; t++) { if (T.team[t] !== team || !T.alive[t] || (kind >= 0 && T.kind[t] !== kind)) continue; const d = (T.x[t] - x) ** 2 + (T.y[t] - y) ** 2; if (d < bd) { bd = d; best = t; } }
    return best;
  }
  let tx = 0, ty = 0, tr = 0;
  function targetPos(i) {
    const t = U.target[i];
    if (t >= 0) { if (!U.alive[t] || U.team[t] === U.team[i]) return false; tx = U.x[t]; ty = U.y[t]; tr = K.r[U.kind[t]]; return true; }
    if (t <= -2) { const g = -2 - t; if (!T.alive[g]) return false; tx = T.x[g]; ty = T.y[g]; tr = T.r[g]; return true; }
    return false;
  }

  // ---- THE VANGUARDS: per lane, each side's body nearest the enemy in the run (the west's greatest x, the east's least), read once a tick;
  // a cloaked body (or an EXECUTING diamond) leads no vanguard - it is unseen, as retarget() has it
  const van = [{ i: new Int32Array(3), x: new Float32Array(3) }, { i: new Int32Array(3), x: new Float32Array(3) }];
  function readVanguards() {
    for (let l = 0; l < 3; l++) { van[0].i[l] = -1; van[0].x[l] = -Infinity; van[1].i[l] = -1; van[1].x[l] = Infinity; }
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i] || !inRun(U.x[i])) continue;
      const kind = U.kind[i]; if (K.cloak[kind] || (K.shape[kind] === 5 && surging(i))) continue;
      const v = van[U.team[i]], l = U.lane[i], x = U.x[i];
      if (U.team[i] === 0 ? x > v.x[l] : x < v.x[l]) { v.x[l] = x; v.i[l] = i; }
    }
  }
  // THE SIGHT: on the march or a plain hold in the run, the enemy vanguard of the body's lane within o.sight; −1 when none, from the gate stage on (whose
  // targets are strongholds), and for a DEFEND, a PICKET or a WAIT, which stand where they were put and fight what enters their aggro ring
  function sightOf(i) {
    if (U.stage[i] > 2 || (U.stage[i] === 1 && U.defend[i] !== PLAIN) || !inRun(U.x[i])) return -1;
    const v = van[1 - U.team[i]], l = U.lane[i];
    return v.i[l] >= 0 && Math.abs(v.x[l] - U.x[i]) <= o.sight ? v.i[l] : -1;
  }

  // ---- THE MARCH: the stages of an order, judged every tick. 0 MARCH to the point, 1 HOLD there, 2 ADVANCE to the next point not ours, 3 THE GATE, 4 THE KEEP,
  // 5 THE HUNT (the nearest living enemy stronghold of any lane, through the yard; strongholdTarget carries a body from 3 to 4 to 5 as each dies).
  // How a hold is kept (U.defend): PLAIN leaves when the point is ours, when its 20 s run out or when nothing has come for 8 s; a DEFEND stands its 45 s
  // whatever happens; a PICKET stands 45 s or until the point is its own.
  // THE PICKET (SIM's ruling 2026-09-25, on the measure): §3.6 has a battalion hold every point it comes to until the point is its own - 4 s a neutral
  // point, 6 s an enemy's - and two openings dropped at POINT 1 on each side, each stopping twice on the way to the centre, met after 20 s where the
  // line wants a first death by 15 and a contest by 20. The presence rule (§3.3) turns a point on any body within reach, so a battalion does not wait:
  // its first body to arrive at a point not its own stands as the picket and turns it, the rest march on; the ORDER RULE still turns the points one
  // after another behind the column, and the fronts follow the picket chain.
  // A WAIT is the column at the lane's end: every point ahead is its own but one behind is still turning, so it stands at the last point until the lane is
  // whole (20 s at most), then goes for the gate - a gate is reached when its lane is taken (§3.6's stage 3 'none left', the coach's BREAK).
  const PLAIN = 0, DEFEND = 1, PICKET = 2, WAIT = 3;
  const pickets = new Int32Array(65536);   // per battalion (grp), a bit per checkpoint index its picket stands on
  const slotAt = (x) => { for (let s = 0; s < 5; s++) if (Math.abs(x - CP_X[s]) <= 1) return s; return -1; };
  const laneOurs = (lane, team) => { for (let s = 0; s < 5; s++) if (WL.owner[cp(lane, s)] !== team) return false; return true; };
  function unpicket(i) {
    if (U.defend[i] !== PICKET) return;
    const s = slotAt(U.goalX[i]); if (s >= 0) pickets[U.grp[i]] &= ~(1 << cp(U.lane[i], s));
  }
  function march(i, dt, seen) {
    const stage = U.stage[i];
    if (stage === 1) {
      U.quiet[i] = U.target[i] === -1 && seen < 0 ? U.quiet[i] + dt : 0;   // quiet: nothing to fight and nothing in sight
      const d = U.defend[i];
      // a WAIT goes for the gate when the lane is whole, when its 20 s are up, or when no enemy stands in the lane and none has for half the quiet clock -
      // there is nothing to wait for (the whole clock would leave the field silent longer than the 8 s the line allows, with the walk to the gate on top)
      if (d === WAIT) { if (laneOurs(U.lane[i], U.team[i]) || S.time >= U.holdUntil[i] || (van[1 - U.team[i]].i[U.lane[i]] < 0 && U.quiet[i] >= o.quietS / 2)) toGate(i); return; }
      const s = slotAt(U.goalX[i]), ours = s >= 0 && WL.owner[cp(U.lane[i], s)] === U.team[i];
      // a plain hold has nothing to hold against once no enemy stands anywhere in its lane's run: it marches on at once, and after 8 s of quiet otherwise
      const empty = d === PLAIN && van[1 - U.team[i]].i[U.lane[i]] < 0;
      if ((d !== DEFEND && ours) || S.time >= U.holdUntil[i] || (d === PLAIN && U.quiet[i] >= o.quietS) || empty) advance(i);
      return;
    }
    if (stage === 0 || stage === 2) {
      const dx = U.goalX[i] + fwd(U.team[i]) * U.slotF[i] - U.x[i], dy = LANE_Y[U.lane[i]] + fwd(U.team[i]) * U.slotS[i] - U.y[i], near = 60 + (U.grp[i] % 5) * 12;
      if (dx * dx + dy * dy <= near * near) arrive(i);
    }
  }
  const fwd = (team) => (team === 0 ? 1 : -1);   // which way a side's formations face along the lane
  const inEnemyYard = (team, x) => (team === 0 ? x > RUN[1] : x < RUN[0]);   // past the enemy's gates, where its keeps stand and a body that broke through fights from
  // arriving where the order sent it: a DEFEND, or a place that is no checkpoint (a front, a drop between points), holds as ordered; a point of ours is
  // marched past; a point not ours takes the battalion's picket - the first body there - and the rest march on
  function arrive(i) {
    const s = slotAt(U.goalX[i]), team = U.team[i];
    if (U.defend[i] === DEFEND || s < 0) { hold(i, U.defend[i] ? o.defendS : o.holdS); return; }
    if (WL.owner[cp(U.lane[i], s)] === team) { advance(i); return; }
    const bit = 1 << cp(U.lane[i], s), grp = U.grp[i];
    if (pickets[grp] & bit) { advance(i); return; }
    pickets[grp] |= bit; U.defend[i] = PICKET; U.slotF[i] = 0; U.slotS[i] = 0;   // the picket's post is the point itself, inside its reach
    hold(i, o.defendS);
  }
  function hold(i, seconds) { U.stage[i] = 1; U.holdUntil[i] = S.time + seconds; U.quiet[i] = 0; }
  function toGate(i) { U.stage[i] = 3; U.goalX[i] = GATE_X[1 - U.team[i]]; U.defend[i] = PLAIN; }
  // ADVANCE: the next point toward the enemy that is not ours, past the point of the order (past the body's x when the order named no point);
  // none left → the gate when the lane is whole, else a WAIT at the last point
  function advance(i) {
    const team = U.team[i], lane = U.lane[i], from = slotAt(U.goalX[i]), order = slotsToward(team);
    unpicket(i); U.defend[i] = PLAIN;
    let q = 0;
    if (from >= 0) q = order.indexOf(from) + 1;
    else while (q < 5 && fwd(team) * (CP_X[order[q]] - U.x[i]) <= 0) q++;
    for (; q < 5; q++) { const s = order[q]; if (WL.owner[cp(lane, s)] !== team) { U.goalX[i] = CP_X[s]; U.stage[i] = 2; return; } }
    if (laneOurs(lane, team)) { toGate(i); return; }
    U.goalX[i] = CP_X[order[4]]; U.defend[i] = WAIT; U.stage[i] = 1; U.holdUntil[i] = S.time + o.holdS;   // the quiet clock runs on from the walk
  }

  // ---- movement
  // THE PUSH of a body (separate): off every body it overlaps, both sides, walked on the contact grid in its order, the first ten. Left in sx, sy.
  // Walked on the main grid, the ten were the first ten bodies of the box's big cells, overlapping or not, and in a crowd at a stronghold a
  // mote never met the motes it stood on: the swarm's cohesion fused them onto one bit-identical point (the captains' seed 3: 21 motes on one
  // point at 120 s and 150 s, drawn as one shape). Two bodies on the very same point have no direction between them, so they part along a
  // fixed direction drawn from their two indices, each its own way - the pair always parts, and a replay parts it the same.
  // THE FLOCK (SIM's ruling 2026-09-25, on the judge's measure): a swarm body shoulders the swarm bodies of its own battalion at FLOCK of the full
  // push, so a cloud flies tight - touching, never stacked (a coincident pair still parts whole). At the full push the parted cloud stood a third
  // wider than it did when the judge baked its table: more of the enemy reached it at once, BLOOM LINE against NULL FIELD fell from +0.76 to -0.01,
  // and ● against ◯ from +0.20 to +0.11, under the +0.15 its cards promise. At a tenth the table holds again as baked.
  let sx = 0, sy = 0, gx = 0, gy = 0, gn = 0;
  const PUSHES = 10, COINCIDENT2 = 0.01, FLOCK = 0.1;
  function separate(i, r) {
    const x = U.x[i], y = U.y[i], reach = r * 2 + 8, c = contact.cell, start = contact.start, items = contact.items, cols = contact.cols;
    const cx0 = Math.max(0, ((x - reach) / c) | 0), cx1 = Math.min(cols - 1, ((x + reach) / c) | 0);
    const cy0 = Math.max(0, ((y - reach) / c) | 0), cy1 = Math.min(contact.rows - 1, ((y + reach) / c) | 0);
    const flock = K.move[U.kind[i]] === SWARM ? U.grp[i] : -1;   // a swarm body's own cloud; −1 for every other walk, which no grp matches
    sx = 0; sy = 0;
    let pushes = 0;
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0, k = cy * cols + cx; cx <= cx1; cx++, k++) {
        for (let q = start[k], e = start[k + 1]; q < e; q++) {
          const j = items[q];
          if (j === i || !U.alive[j]) continue;
          const dx = x - U.x[j], dy = y - U.y[j], d2 = dx * dx + dy * dy, m = r + K.r[U.kind[j]];
          if (d2 >= m * m) continue;
          if (d2 <= COINCIDENT2) partCoincident(i, j, m);
          else { const d = Math.sqrt(d2), p = (m - d) / d * (U.grp[j] === flock && K.move[U.kind[j]] === SWARM ? FLOCK : 1); sx += dx * p; sy += dy * p; }
          if (++pushes >= PUSHES) return;
        }
      }
    }
  }
  // body i's share of parting from j on the same point: the full overlap m along the pair's own direction (the golden angle of the lower
  // index plus the higher), i one way and j, when it pushes, the other
  function partCoincident(i, j, m) {
    const lo = i < j ? i : j, hi = i < j ? j : i, a = (lo * 2.399963 + hi) % 6.283185, s = i < j ? m : -m;
    sx += Math.cos(a) * s; sy += Math.sin(a) * s;
  }
  // THE COHESION of a swarm: the first ten bodies of the box's cells on the main grid, both sides in its order, and the sum of the positions of
  // its own battalion's among them - the local centroid it closes on. Left in gx, gy, gn.
  function cohere(i, r) {
    const x = U.x[i], y = U.y[i], team = U.team[i], grp = U.grp[i];
    const start = grid.start, items = grid.items, cols = grid.cols;
    gx = 0; gy = 0; gn = 0;
    let seen = 0;
    box(x, y, r * 2 + 8);
    for (let cy = by0; cy <= by1; cy++) {
      for (let cx = bx0, k = cy * cols + cx; cx <= bx1; cx++, k++) {
        for (let q = start[k], e = start[k + 1]; q < e; q++) {
          const j = items[q];
          if (j === i || !U.alive[j]) continue;
          if (U.team[j] === team && U.grp[j] === grp) { gx += U.x[j]; gy += U.y[j]; gn++; }
          if (++seen >= 10) return;
        }
      }
    }
  }
  // where a body stops short of what it fights: a striker or a blade dives under artillery and otherwise fights at its reach
  const stopDist = (kind, gun) => { const mv = K.move[kind]; return K.range[kind] * (mv === HOP || mv === PHASE ? (gun ? 0.3 : 0.85) : mv === ZIGZAG ? 0.6 : 0.85); };
  const gunAhead = (i) => U.target[i] >= 0 && K.minRange[U.kind[U.target[i]]] > 0;   // the enemy in front is artillery with a blind ring
  function move(i, kind, dt, sg, seen) {
    const lane = U.lane[i], team = U.team[i], stage = U.stage[i], r = K.r[kind], shape = K.shape[kind], x0 = U.x[i], y0 = U.y[i];
    let has = targetPos(i), dx = 0, dy = 0, dist = 1;
    let stop = stopDist(kind, has && gunAhead(i));
    // THE PACE: nothing to fight and nothing in sight, the run is marched at double time (a besieger walking to its gate has a target and keeps the fighting
    // pace: the gate is hit later, after the meters have filled - measured, the hurried walk to the gate cost the line its surge row)
    const hurry = !has && seen < 0 && inRun(x0);
    // THE SIGHT: close on the enemy vanguard at the fighting pace; the aggro ring takes over from there. A body inside a gun's blind ring (artillery's
    // minRange; none under BARRAGE) is not closed on - it cannot be shot, and standing off it would hold the gun frozen beside it; the gun walks its order on
    const blind = sg && shape === 3 ? 0 : K.minRange[kind];
    if (!has && seen >= 0 && (blind === 0 || Math.hypot(U.x[seen] - U.x[i], U.y[seen] - U.y[i]) >= blind)) { tx = U.x[seen]; ty = U.y[seen]; tr = K.r[U.kind[seen]]; has = true; }
    else if (!has && stage <= 2) {   // nothing to fight: walk the order to the body's own post - from a keep, into the lane through its head first; a hold re-forms on its post
      const f = fwd(team);
      if (stage === 0 && !inRun(x0)) { tx = GATE_X[team] + f * 150; ty = LANE_Y[lane] + f * U.slotS[i]; }
      else { tx = U.goalX[i] + f * U.slotF[i]; ty = LANE_Y[lane] + f * U.slotS[i]; }
      tr = 0; has = true; stop = 20 + (U.grp[i] % 5) * 4;
    } else if (stage === 5 && U.target[i] < 0 && inRun(x0)) {   // a hunter still in the run leaves it through its own lane's dead gate first: a straight walk to a gate of another lane would crawl along the band's edge
      tx = GATE_X[1 - team] + fwd(team) * (GATE_R + 40); ty = LANE_Y[lane]; tr = 0; has = true; stop = 20;
    }
    if (has) { dx = tx - U.x[i]; dy = ty - U.y[i]; dist = Math.sqrt(dx * dx + dy * dy) || 1; dx /= dist; dy /= dist; }
    const spd = K.speed[kind] * (sg && shape === 0 ? 1.4 : 1) * (hurry ? o.march : 1), age = U.age[i], ph = U.ph[i];   // OVERDRIVE: a surging orb runs faster
    separate(i, r);   // the push and a swarm's centroid are read before the body moves: the centroid is the one it leaves
    let wx = 0, wy = 0;
    const far = has && dist > stop;
    switch (K.move[kind]) {
      case MARCH: if (far) { wx = dx * spd; wy = dy * spd; } break;   // a holder walks to its point and stands; the march machine sends it on
      case ZIGZAG: if (far) { const s = Math.sin(age * 5 + ph) * 0.7; wx = (dx - dy * s) * spd; wy = (dy + dx * s) * spd; } break;
      case ORBIT: if (has) { if (dist > stop * 1.05) { wx = dx * spd; wy = dy * spd; } else if (U.target[i] !== -1) { const s = ph > 3.14 ? 1 : -1; wx = -dy * s * spd * 0.8 + dx * (dist - stop * 0.8) * 2; wy = dx * s * spd * 0.8 + dy * (dist - stop * 0.8) * 2; } } break;
      case SWARM: if (far) { wx = dx * spd; wy = dy * spd; } cohere(i, r); if (gn) { const gx2 = gx / gn - U.x[i], gy2 = gy / gn - U.y[i]; wx += gx2 * 0.8; wy += gy2 * 0.8; } break;
      case HOP: if (far) { const g = Math.sin(age * 3.2 + ph) > 0.1 ? 2.2 : 0; wx = dx * spd * g; wy = dy * spd * g; } break;
      case PHASE: if (far) { wx = dx * spd * 0.6; wy = dy * spd * 0.6; if (U.cd[i] < -2.6 && dist > 300) { const jump = Math.min(240, dist - stop * 0.7); ev({ t: 'blink', x: U.x[i], y: U.y[i], x2: U.x[i] + dx * jump, y2: U.y[i] + dy * jump, team }); U.x[i] += dx * jump; U.y[i] += dy * jump; U.cd[i] = 0.2; } } break;
    }
    wx += sx * 40; wy += sy * 40;
    if (U.stun[i] > 0) { wx *= 0.05; wy *= 0.05; }
    if (U.pushT[i] > 0) { U.pushT[i] -= dt; U.vx[i] = U.pushX[i]; U.vy[i] = U.pushY[i]; }   // a shockwave owns the body while it lasts
    else { const ease = Math.min(1, dt * (K.mass[kind] > 3 ? 4 : 9)); U.vx[i] += (wx - U.vx[i]) * ease; U.vy[i] += (wy - U.vy[i]) * ease; }
    // the run's edge is judged on the float32 the body will carry: a float64 nx a hair short of 1100 stores as 1100.00 and would stand in the run unclamped
    let nx = Math.fround(U.x[i] + U.vx[i] * dt), ny = U.y[i] + U.vy[i] * dt;
    if (nx < 0) nx = 0; else if (nx > W) nx = W; if (ny < 0) ny = 0; else if (ny > H) ny = H;
    // past the enemy's gates a body fights from the yard and never steps back into the run, where the band clamp would throw it a lane away from what it hunts
    if (stage >= 4 && inEnemyYard(team, x0) && !inEnemyYard(team, nx)) nx = team === 0 ? RUN[1] + 0.5 : RUN[0] - 0.5;
    if (inRun(nx)) {   // in the run a body keeps to its band: a soft push inside the last two radii, a hard clamp at the edge; the yards are open
      const off = ny - LANE_Y[lane], soft = HALF - 2 * r;
      if (off > soft) ny -= 60 * dt; else if (off < -soft) ny += 60 * dt;
      ny = clampY(lane, ny, r);
    }
    U.x[i] = nx; U.y[i] = ny;
    if (i < gridHi && grid.cellOf[i] >= 0) { const mx = nx - x0, my = ny - y0; if (mx !== 0 || my !== 0) slackOf(grid.cellOf[i], Math.sqrt(mx * mx + my * my)); }   // the grid still lists it where it stood
    return U.target[i] !== -1 && targetPos(i) ? Math.sqrt((tx - U.x[i]) ** 2 + (ty - U.y[i]) ** 2) : Infinity;
  }

  // ---- weapons
  const arcHit = new Int32Array(16);
  let ax = 0, ay = 0, abest = -1, abd = 0, an = 0;
  const arcNext = (j) => {
    if (!U.alive[j]) return false;
    for (let h = 0; h < an; h++) if (arcHit[h] === j) return false;
    const dx = U.x[j] - ax, dy = U.y[j] - ay, d = dx * dx + dy * dy;
    if (d < abd) { abd = d; abest = j; }
    return false;
  };
  // EXECUTE: a surging diamond's beam deals ×4 to a body under 40 % hp
  const execMul = (sg, k, j) => (sg && k.shape === 5 && U.hp[j] < kinds[U.kind[j]].hp * 0.4 ? 4 : 1);
  function fire(i, k, dist, sg) {
    const w = k.w, team = U.team[i], lane = U.lane[i], x = U.x[i], y = U.y[i], ki = k.index;
    const aimed = w.type === 'bolt' || w.type === 'missile' || w.type === 'beam' || w.type === 'arc';
    const mul = aimed && U.charge[i] > 0 ? 3 : 1;   // BLINK: the three shots after the jump deal ×3
    if (mul > 1) U.charge[i]--;
    if (aimed && k.shape === 3) ev({ t: 'barrel', x, y, x2: tx, y2: ty, team, kind: ki, i });   // a hex shows its barrel
    switch (w.type) {
      case 'bolt': {
        const base = Math.atan2(ty - y, tx - x);
        for (let c = 0; c < w.count; c++) {
          const s = allocShot(); if (s < 0) break;
          const a = base + (w.count > 1 ? (c - (w.count - 1) / 2) * w.spread : 0) + (rng() - 0.5) * 0.04;
          P.x[s] = x; P.y[s] = y; P.vx[s] = Math.cos(a) * w.speed; P.vy[s] = Math.sin(a) * w.speed; P.life[s] = w.life; P.mul[s] = mul; P.kind[s] = ki; P.team[s] = team; P.lane[s] = lane; P.alive[s] = 1; P.target[s] = -1;
        }
        break;
      }
      case 'missile': {
        for (let c = 0; c < w.count; c++) {
          const s = allocShot(); if (s < 0) break;
          const a = Math.atan2(ty - y, tx - x) + (rng() - 0.5) * 0.8;
          P.x[s] = x; P.y[s] = y; P.vx[s] = Math.cos(a) * w.speed; P.vy[s] = Math.sin(a) * w.speed; P.life[s] = (w.range / w.speed) * 2.2; P.mul[s] = mul; P.kind[s] = ki; P.team[s] = team; P.lane[s] = lane; P.alive[s] = 1; P.target[s] = U.target[i];
        }
        break;
      }
      case 'beam': {
        ev({ t: 'beam', x, y, x2: tx, y2: ty, team, kind: ki });
        const t = U.target[i], dmg = w.dmg * mul;
        if (t >= 0) hurt(t, dmg * execMul(sg, k, t), team, tx, ty, ki); else if (t <= -2) hurtTower(-2 - t, dmg, team, ki, lane);
        if (w.pierce > 0) {
          const dx = (tx - x) / (dist || 1), dy = (ty - y) / (dist || 1); let left = w.pierce;
          nearSide((x + tx) / 2, (y + ty) / 2, w.range / 2 + 40, 1 - team, (j) => {
            if (left <= 0) return true;
            if (!U.alive[j] || j === t) return false;
            const px = U.x[j] - x, py = U.y[j] - y, along = px * dx + py * dy;
            if (along < 0 || along > w.range) return false;
            const off = Math.abs(px * dy - py * dx); if (off > kinds[U.kind[j]].r + 6) return false;
            hurt(j, dmg * 0.7 * execMul(sg, k, j), team, U.x[j], U.y[j], ki); left--; return false;
          });
        }
        break;
      }
      case 'arc': {
        const t = U.target[i]; const pts = [x, y];
        let dmg = w.dmg * mul; let lx, ly;
        if (t >= 0) { hurt(t, dmg, team, tx, ty, ki); lx = tx; ly = ty; arcHit[0] = t; an = 1; }
        else if (t <= -2) { hurtTower(-2 - t, dmg, team, ki, lane); lx = tx; ly = ty; an = 0; }
        else break;
        pts.push(lx, ly);
        for (let h = 0; h < w.hops; h++) {
          dmg *= w.decay; ax = lx; ay = ly; abest = -1; abd = w.hopRange * w.hopRange;
          nearSide(ax, ay, w.hopRange, 1 - team, arcNext);
          if (abest < 0) break;
          hurt(abest, dmg, team, U.x[abest], U.y[abest], ki); if (an < 16) arcHit[an++] = abest;
          lx = U.x[abest]; ly = U.y[abest]; pts.push(lx, ly);
        }
        ev({ t: 'arc', pts, team, kind: ki });
        break;
      }
      case 'pulse': {
        blast(x, y, w.range, w.dmg, team, ki, lane);
        if (k.traits.emp) nearSide(x, y, w.range, 1 - team, (j) => { if (U.alive[j]) { const dx = U.x[j] - x, dy = U.y[j] - y; if (dx * dx + dy * dy < w.range * w.range) U.stun[j] = Math.max(U.stun[j], 0.55); } return false; });
        ev({ t: 'pulse', x, y, r: w.range, team, kind: ki, emp: !!k.traits.emp });
        break;
      }
      case 'mine': {
        const m = allocMine(); if (m < 0) break;
        MN.x[m] = x + (rng() - 0.5) * 30; MN.y[m] = y + (rng() - 0.5) * 30; MN.kind[m] = ki; MN.team[m] = team; MN.lane[m] = lane; MN.alive[m] = 1;
        ev({ t: 'mine', x: MN.x[m], y: MN.y[m], team });
        break;
      }
      case 'spawn': {
        if (!U.clutch[i]) break;   // the clutch is spent: the carrier is a body now
        // THE BROOD: each clutch is a battalion of its own (a fresh grp), coherent with its siblings and not with the slow hive behind them - a hive walks
        // at 65 wu/s while its motes run at 330, and one grp for a hive and all its clutches reads as a battalion whose centroid never moves
        const brood = (S.grpN++ & 0xffff) || 1;
        for (let c = 0; c < w.count && U.clutch[i]; c++) {
          U.clutch[i]--;
          const a = rng() * 6.283, d = k.r + 10;
          const j = spawnUnit(team, k.childIndex, x + Math.cos(a) * d, y + Math.sin(a) * d, U.lane[i], brood, U.goalX[i], U.slotF[i], U.slotS[i], U.stage[i], U.defend[i]);
          if (j >= 0) { U.vx[j] = Math.cos(a) * 160; U.vy[j] = Math.sin(a) * 160; }
        }
        ev({ t: 'spawnout', x, y, team, kind: ki });
        break;
      }
      case 'aura': {
        const heal = w.dmg / w.rate;
        nearSide(x, y, w.range, team, (j) => { if (U.alive[j] && j !== i) { const hp = K.hp[U.kind[j]]; if (U.hp[j] < hp) U.hp[j] = Math.min(hp, U.hp[j] + heal); } return false; });
        ev({ t: 'aura', x, y, r: w.range, team, kind: ki });
        break;
      }
    }
  }

  // ---- shots
  // the first enemy body a shot's point lies in (its radius and four), in the grid's order; −1 when it flies clear
  function shotMark(x, y, enemy) {
    box(x, y, 30);
    const start = grid.start, items = grid.items, head = side.head, next = side.next, cols = grid.cols;
    for (let cy = by0; cy <= by1; cy++) {
      for (let cx = bx0, k = cy * cols + cx; cx <= bx1; cx++, k++) {
        const end = start[k + 1]; if (start[k] === end) continue;
        for (let p = head[2 * k + enemy]; p < end; p = next[p]) {
          const j = items[p]; if (!U.alive[j]) continue;
          const dx = U.x[j] - x, dy = U.y[j] - y, rr = K.r[U.kind[j]] + 4;
          if (dx * dx + dy * dy < rr * rr) return j;
        }
      }
    }
    return -1;
  }
  function stepShots(dt) {
    for (let s = 0; s < P.hi; s++) {
      if (!P.alive[s]) continue;
      const k = kinds[P.kind[s]], w = k.w, team = P.team[s];
      P.life[s] -= dt;
      if (P.life[s] <= 0) { P.alive[s] = 0; P.free.push(s); continue; }
      if (w.type === 'missile') {
        const t = P.target[s]; let gx2 = 0, gy2 = 0, have = false;
        if (t >= 0 && U.alive[t] && U.team[t] !== team) { gx2 = U.x[t]; gy2 = U.y[t]; have = true; }
        else if (t <= -2 && T.alive[-2 - t]) { gx2 = T.x[-2 - t]; gy2 = T.y[-2 - t]; have = true; }
        else if (t >= 0) { P.target[s] = -1; }
        if (have) {
          const want = Math.atan2(gy2 - P.y[s], gx2 - P.x[s]), cur = Math.atan2(P.vy[s], P.vx[s]);
          let d = want - cur; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
          const turn = Math.max(-w.turn * dt, Math.min(w.turn * dt, d)), a = cur + turn;
          P.vx[s] = Math.cos(a) * w.speed; P.vy[s] = Math.sin(a) * w.speed;
        }
      }
      const dmg = w.dmg * P.mul[s];
      // BARRAGE: a surging hex's splash is half again, read where the missile lands (a shot carries no lane of its own)
      const splash = w.type === 'missile' ? w.splash * (k.shape === 3 && surgeLive(team) && S.surgeLane[team] === laneOf(P.y[s]) ? 1.5 : 1) : 0;
      const steps = (w.speed || 0) * dt > 24 ? 2 : 1; let hit = false, hx = 0, hy = 0;
      for (let q = 0; q < steps && !hit; q++) {
        P.x[s] += P.vx[s] * dt / steps; P.y[s] += P.vy[s] * dt / steps;
        hx = P.x[s]; hy = P.y[s];
        const mark = shotMark(hx, hy, 1 - team);
        if (mark >= 0) {
          if (w.type === 'missile') blast(hx, hy, splash, dmg, team, k.index, P.lane[s]); else hurt(mark, dmg, team, hx, hy, k.index);
          hit = true;
        } else {
          for (let t = 0; t < T.n; t++) { if (!T.alive[t] || T.team[t] === team) continue; const dx = T.x[t] - hx, dy = T.y[t] - hy; if (dx * dx + dy * dy < T.r[t] * T.r[t]) { if (w.type === 'missile') blast(hx, hy, splash, dmg, team, k.index, P.lane[s]); else hurtTower(t, dmg, team, k.index, P.lane[s]); hit = true; break; } }
        }
      }
      if (hit || P.x[s] < -50 || P.x[s] > W + 50 || P.y[s] < -50 || P.y[s] > H + 50) { if (hit && w.type !== 'missile') ev({ t: 'impact', x: hx, y: hy, team, kind: k.index }); if (hit && w.type === 'missile') ev({ t: 'explode', x: hx, y: hy, r: splash, team, kind: k.index }); P.alive[s] = 0; P.free.push(s); }
    }
  }

  // ---- mines
  let mnx = 0, mny = 0, mtrig = false, mr = 0;
  const mineTrip = (j) => { if (!U.alive[j]) return false; const dx = U.x[j] - mnx, dy = U.y[j] - mny; if (dx * dx + dy * dy < mr * mr) { mtrig = true; return true; } return false; };
  function stepMines() {
    for (let m = 0; m < MN.hi; m++) {
      if (!MN.alive[m]) continue;
      const w = kinds[MN.kind[m]].w, mteam = MN.team[m];
      mnx = MN.x[m]; mny = MN.y[m]; mtrig = false; mr = w.trigger;
      nearSide(mnx, mny, mr, 1 - mteam, mineTrip);
      if (mtrig) { blast(mnx, mny, w.range, w.dmg, mteam, MN.kind[m], MN.lane[m]); ev({ t: 'explode', x: mnx, y: mny, r: w.range, team: mteam, kind: MN.kind[m] }); MN.alive[m] = 0; MN.free.push(m); }
    }
  }

  // ---- THE CHECKPOINTS: ONE CAPTURE RULE. A side alone on a point turns it toward its own sign - fast while the point carries the enemy's sign, slow otherwise; both present freezes it;
  // the owner changes only at ±1. THE ORDER RULE: a side gains on a point only when the point before it (from its own end) is already its; presence still freezes.
  let cpx = 0, cpy = 0, cpLane = 0, wa = 0, wb = 0;
  const onPoint = (j) => { if (!U.alive[j] || U.lane[j] !== cpLane) return false; const dx = U.x[j] - cpx, dy = U.y[j] - cpy; return dx * dx + dy * dy < CP_REACH * CP_REACH; };
  const presenceW = (j) => { if (onPoint(j)) wa += U.hp[j]; return false; };
  const presenceE = (j) => { if (onPoint(j)) wb += U.hp[j]; return false; };
  const mayGain = (w, team) => { const s = WL.slot[w]; return team === 0 ? (s === 0 || WL.owner[w - 1] === 0) : (s === 4 || WL.owner[w + 1] === 1); };
  let rheal = 0;
  const rallyOne = (j) => { if (!U.alive[j]) return false; const dx = U.x[j] - cpx, dy = U.y[j] - cpy; if (dx * dx + dy * dy < RALLY_R * RALLY_R) { const hp = K.hp[U.kind[j]]; if (U.hp[j] < hp) U.hp[j] = Math.min(hp, U.hp[j] + hp * rheal); } return false; };
  function stepCheckpoints(dt) {
    for (let w = 0; w < WL.n; w++) {
      cpx = WL.x[w]; cpy = WL.y[w]; cpLane = WL.lane[w]; wa = 0; wb = 0;
      nearSide(cpx, cpy, CP_REACH, 0, presenceW); nearSide(cpx, cpy, CP_REACH, 1, presenceE);
      presW[w] = wa; presE[w] = wb;
      const both = wa > 0 && wb > 0;
      if (both && !inContest[w]) { inContest[w] = 1; WL.contestedAt[w] = S.time; evSure({ t: 'contested', lane: cpLane, slot: WL.slot[w], x: cpx, y: cpy }); }
      else if (!both) inContest[w] = 0;
      let p = WL.prog[w];
      if (wa > 0 && wb === 0 && mayGain(w, 0)) p = Math.min(1, p + (p < 0 ? o.captureStrip : o.captureNeutral) * dt);
      else if (wb > 0 && wa === 0 && mayGain(w, 1)) p = Math.max(-1, p - (p > 0 ? o.captureStrip : o.captureNeutral) * dt);
      WL.prog[w] = p;
      const was = WL.owner[w];
      if (p >= 1 && was !== 0) capture(w, 0, was); else if (p <= -1 && was !== 1) capture(w, 1, was);
      if (WL.owner[w] >= 0) { rheal = 0.02 * dt; nearSide(cpx, cpy, RALLY_R, WL.owner[w], rallyOne); }   // THE RALLY: a held point heals its owner's bodies around it
    }
    for (let l = 0; l < 3; l++) updateFront(l);
  }
  function capture(w, team, from) {
    WL.owner[w] = team; S.stats.captures[team]++;
    const centre = WL.slot[w] === CENTRE; if (centre) S.stats.centres[team]++;
    fillSurge(team, centre ? 1200 : 800);
    evSure({ t: 'capture', x: WL.x[w], y: WL.y[w], team, lane: WL.lane[w], slot: WL.slot[w], from, centre });
  }
  // THE FRONT of a lane, both sides; a change is told as an advance (dir +1, toward the enemy) or a fall-back (−1)
  const ownersBuf = [-1, -1, -1, -1, -1];
  function updateFront(l) {
    for (let s = 0; s < 5; s++) ownersBuf[s] = WL.owner[cp(l, s)];
    const w = frontX(ownersBuf, 0), e = frontX(ownersBuf, 1), F = S.front;
    if (w !== F.w[l]) { const dir = w > F.w[l] ? 1 : -1; F.w[l] = w; F.chevW[l] = dir; if (dir > 0) F.moved[l] = { team: 0, at: S.time }; evSure({ t: 'front', lane: l, team: 0, dir, x: w }); }
    if (e !== F.e[l]) { const dir = e < F.e[l] ? 1 : -1; F.e[l] = e; F.chevE[l] = -dir; if (dir > 0) F.moved[l] = { team: 1, at: S.time }; evSure({ t: 'front', lane: l, team: 1, dir, x: e }); }
  }

  // ---- the tick
  function step() {
    if (S.result) return;
    const dt = TICK;
    S.events.length = 0;
    S.tick++; S.time += dt;
    gridHi = 0;   // last tick's grid is done with: a muster's bodies wait for this tick's build
    while (S.queue.length) apply(S.queue.shift());
    // income: every living stronghold, every held checkpoint, THE CENTRE double; the clock scales it, the captain's temper scales the east
    let inc0 = 0, inc1 = 0;
    for (let t = 0; t < T.n; t++) if (T.alive[t]) { if (T.team[t] === 0) inc0 += o.incomePerTower; else inc1 += o.incomePerTower; }
    for (let w = 0; w < WL.n; w++) { const pay = WL.slot[w] === CENTRE ? o.centreIncome : o.cpIncome; if (WL.owner[w] === 0) inc0 += pay; else if (WL.owner[w] === 1) inc1 += pay; }
    const esc = mult(), tm = (TEMPERS[o.temper] || TEMPERS.normal).incomeM;
    inc0 *= esc; inc1 *= esc * tm;
    S.income[0] = inc0; S.income[1] = inc1; S.energy[0] += inc0 * dt; S.energy[1] += inc1 * dt;
    for (let team = 0; team < 2; team++) {
      if (surgeOpen[team] && S.time >= S.surgeUntil[team]) { surgeOpen[team] = false; surgeClose(team); }
      const wv = S.wave[team]; if (wv && S.tick > wv.at + 180) S.wave[team] = null;   // a plate not honoured within six seconds of its hour is dropped
    }
    const slot = S.tick % KILL_SPAN;
    for (let l = 0; l < 3; l++) { const ring = S.killsRing.slots[l]; S.killsRing.sum[l] -= ring[slot]; ring[slot] = 0; }
    grid.build(U.x, U.y, U.alive, U.hi); contact.build(U.x, U.y, U.alive, U.hi); gridHi = U.hi; splitSides(); slack.fill(0); rowSlack.fill(0);
    readVanguards();
    const hi = U.hi, tick = S.tick;
    for (let i = 0; i < hi; i++) {
      if (!U.alive[i]) continue;
      if (U.doomAt[i] > 0 && S.time >= U.doomAt[i]) { killUnit(i, -1, -1); continue; }   // the doom wave passes
      const kind = U.kind[i], shape = K.shape[kind], hp = K.hp[kind], shMax = K.shieldMax[kind];
      U.age[i] += dt; U.cd[i] -= dt; if (U.stun[i] > 0) U.stun[i] -= dt;
      if (K.regen[kind] && U.hp[i] < hp) U.hp[i] = Math.min(hp, U.hp[i] + hp * 0.02 * dt);
      if (shMax && U.sh[i] < shMax) U.sh[i] = Math.min(shMax, U.sh[i] + shMax * 0.08 * dt);
      if (U.target[i] === -1 ? ((tick + i) % 6 === 0) : (((tick + i) % 6 === 0) || !targetPos(i))) retarget(i, kind);
      const sg = surging(i), seen = U.target[i] === -1 ? sightOf(i) : -1;
      march(i, dt, seen);
      const dist = move(i, kind, dt, sg, seen);
      if (K.magnet[kind]) { const range = K.range[kind], x = U.x[i], y = U.y[i]; nearSide(x, y, range, 1 - U.team[i], (j) => { if (U.alive[j]) { const dx = x - U.x[j], dy = y - U.y[j], d = Math.sqrt(dx * dx + dy * dy) || 1; if (d < range) { U.vx[j] += dx / d * 20; U.vy[j] += dy / d * 20; } } return false; }); }
      if (K.kamikaze[kind] && dist < K.r[kind] + tr + 4) { const t = U.target[i], lane = U.lane[i]; blast(U.x[i], U.y[i], 70, 30, U.team[i], kind, lane); if (t <= -2) hurtTower(-2 - t, 40, U.team[i], kind, lane); ev({ t: 'explode', x: U.x[i], y: U.y[i], r: 70, team: U.team[i], kind }); killUnit(i, -1, -1); continue; }
      const minR = sg && shape === 3 ? 0 : K.minRange[kind];   // BARRAGE: no blind ring
      if (U.cd[i] <= 0 && U.stun[i] <= 0 && (K.passive[kind] || (dist <= K.range[kind] + tr && dist >= minR))) { fire(i, kinds[kind], dist, sg); U.cd[i] = 1 / (K.rate[kind] * (sg && shape === 0 ? 2.5 : 1)); }   // OVERDRIVE: a surging orb fires 2.5× as fast
    }
    stepShots(dt);
    stepMines();
    if (tick % 5 === 0) stepCheckpoints(dt * 5);
    // the top of the table shrinks past dead slots; a slot dead at the top died this tick, so it sits near the end of the free list
    while (U.hi > 0 && !U.alive[U.hi - 1]) { U.hi--; const f = U.free.lastIndexOf(U.hi); if (f >= 0) U.free.splice(f, 1); }
    // the end: a doomed side loses when its wave has passed; at the bell, stronghold hp, then points held, then kills
    if (S.doom) { if (S.time >= S.doom.until) S.result = { winner: 1 - S.doom.team, why: 'strongholds', tick: S.tick, time: S.time }; }
    else if (S.time >= o.clock) {
      let ha = 0, hb = 0, pa = 0, pb = 0;
      for (let t = 0; t < T.n; t++) { if (T.team[t] === 0) ha += T.hp[t]; else hb += T.hp[t]; }
      for (let w = 0; w < WL.n; w++) { if (WL.owner[w] === 0) pa++; else if (WL.owner[w] === 1) pb++; }
      const ka = S.stats.kills[0], kb = S.stats.kills[1];
      const [winner, why] = ha !== hb ? [ha > hb ? 0 : 1, 'clock'] : pa !== pb ? [pa > pb ? 0 : 1, 'points'] : ka !== kb ? [ka > kb ? 0 : 1, 'kills'] : [-1, 'draw'];
      S.result = { winner, why, tick: S.tick, time: S.time };
    }
    if (S.result) evSure({ t: 'end', winner: S.result.winner });
  }

  // ---- what a commander reads: small, plain, JSON-able
  function snapshot() {
    const counts = [new Uint16Array(kinds.length), new Uint16Array(kinds.length)];
    const fielded = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];   // energy alive per role, per side
    const laneF = [0, 1, 2].map(() => [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]]);   // the same per lane
    const threat = new Float32Array(T.n), guard = new Float32Array(T.n);   // enemy and friendly hp within 700 of each stronghold
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i]) continue;
      const k = kinds[U.kind[i]], tm = U.team[i];
      counts[tm][k.index]++; fielded[tm][k.shape] += k.cost; laneF[U.lane[i]][tm][k.shape] += k.cost;
      for (let t = 0; t < T.n; t++) { if (!T.alive[t]) continue; const dx = T.x[t] - U.x[i], dy = T.y[t] - U.y[i]; if (dx * dx + dy * dy < 700 * 700) { if (T.team[t] !== tm) threat[t] += U.hp[i]; else guard[t] += U.hp[i]; } }
    }
    const ago = (t) => Math.min(99, +(S.time - S.gateHitAt[t]).toFixed(1));
    return {
      tick: S.tick, time: +S.time.toFixed(2), energy: [Math.floor(S.energy[0]), Math.floor(S.energy[1])], income: S.income.slice(), mult: +mult().toFixed(3),
      towers: T.x.map((x, t) => ({ i: t, team: T.team[t], kind: T.kind[t], lane: T.lane[t], x, y: T.y[t], hp: Math.round(T.hp[t]), hpMax: T.hpMax[t], alive: !!T.alive[t], threat: Math.round(threat[t]), guard: Math.round(guard[t]), hitAgo: ago(t) })),
      points: WL.x.map((x, w) => ({ i: w, lane: WL.lane[w], slot: WL.slot[w], x, y: WL.y[w], owner: WL.owner[w], prog: +WL.prog[w].toFixed(2), west: Math.round(presW[w]), east: Math.round(presE[w]), contested: presW[w] > 0 && presE[w] > 0 })),
      lanes: [0, 1, 2].map((l) => {
        const gw = gate(0, l), ge = gate(1, l);
        let contested = 0; for (let s = 0; s < 5; s++) { const w = cp(l, s); if (presW[w] > 0 && presE[w] > 0) contested++; }
        return {
          frontW: S.front.w[l], frontE: S.front.e[l], held: [0, 1, 2, 3, 4].map((s) => WL.owner[cp(l, s)]), contested, fielded: laneF[l], kills3s: S.killsRing.sum[l], lastAdvance: S.front.moved[l].team,
          gateHp: [Math.round(T.hp[gw]), Math.round(T.hp[ge])], gateHitAgo: [ago(gw), ago(ge)], broken: [T.alive[gw] ? 0 : 1, T.alive[ge] ? 0 : 1],
        };
      }),
      surge: [Math.round(S.surge[0]), Math.round(S.surge[1])], surgeLane: S.surgeLane.slice(), surgeLeft: [0, 1].map((t) => +Math.max(0, S.surgeUntil[t] - S.time).toFixed(1)),
      wave: S.wave.map((wv) => (wv ? { n: wv.n, lane: wv.lane, roles: wv.roles.slice(), name: wv.name, inS: +Math.max(0, (wv.at - S.tick) / 30).toFixed(1) } : null)),
      counts: [Array.from(counts[0]), Array.from(counts[1])], fielded, alive: [U.count[0], U.count[1]],
      decks: decks.map((d) => d.map((b) => ({ id: b.id, role: b.role, cost: b.cost }))),
      result: S.result,
    };
  }

  return {
    S, o, kinds, decks, U, P, MN, T, WL, grid, TICK, battById,
    step, apply, queue: (cmd) => S.queue.push(cmd), snapshot, mult, price: (b) => Math.round(b.cost * mult()), formation, laneOf, front: () => S.front,
    get result() { return S.result; },
    get events() { return S.events; },
    get energy() { return S.energy; },
    get income() { return S.income; },
    get tick() { return S.tick; },
    get time() { return S.time; },
  };
}
