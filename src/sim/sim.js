// sim.js — THE WORLD. Pure: no DOM, no clock of its own, no randomness but its seed. Fixed ticks,
// commands applied at tick boundaries, every body in flat typed arrays. The same file runs in the
// browser and in Node, which is what lets a captain play it, a tool balance it and a replay reproduce it.
//
// v0.2 THE FIELD OF WELLS: a field twice the size, five strongholds a side and twenty-six energy wells
// to claim by standing on them; commanders deploy BATTALIONS in formation, aimed at a stronghold or a
// well; every body has a role by its shape and the kills are booked role against role.
import { rng32 } from './rng.js';
import { Grid } from './grid.js';
import { compileAll } from './units.js';
import { LIBRARY, BATTALIONS, battalionCost, draft } from './library.js';

export const TICK = 1 / 30;
// THE TEMPERS: what the captain earns and how often it looks. Set by tools/tempers.js so a person following the coach wins about half at NORMAL.
export const TEMPERS = { easy: { incomeM: 0.6, every: 120, burst: 1 }, normal: { incomeM: 0.85, every: 75, burst: 2 }, hard: { incomeM: 1.05, every: 45, burst: 3 } };   // incomeM: the captain's income; every: ticks between its looks; burst: musters a look
export const DEFAULTS = {
  W: 9000, H: 5000,                 // the field, in world units
  towersPerSide: 5, towerHp: 2500, towerR: 90,
  wellR: 70, wellIncome: 5, captureRate: 0.35,   // a well pays its owner 5 a second; a lone side turns a neutral well in ~3 s, an enemy well in ~6
  fortifyCost: 150, fortifyBonus: 3,               // THE FORT (v0.3): an owned well can be fortified - a warden ring stands on it and it pays 3 more a second; the fort falls with the well
  energy0: 800, incomePerTower: 6,  // a shared pool a side; each living stronghold pays into it every second
  clock: 600,                       // seconds; at the bell the side with more stronghold hp wins
  capUnits: 30000, capShots: 80000, capMines: 6000, cell: 96,
  seed: 1, deck: 8,
  temper: 'normal',                 // the east captain's temper (its income multiplier); the west is the person
  escalate: 1 / 300,                // THE WAR GROWS: income, and the size and price of every muster, scale with the clock - doubled at five minutes, so the late war is the big one and a tap stays a tap
};

export function createSim(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const rng = rng32(o.seed);
  const kinds = compileAll(o.roster || LIBRARY);
  const N = o.capUnits, M = o.capShots, MM = o.capMines;
  const kindOf = (id) => { const i = kinds.findIndex((k) => k.id === id); if (i < 0) throw new Error('unknown body ' + id); return i; };

  // ---- the decks: eight battalions a side, drawn from the library by the seed; a side may be handed its own
  const decks = [0, 1].map((side) => (o.decks && o.decks[side] ? o.decks[side] : draft(o.seed * 17 + side * 101 + 5, o.deck)).map((b) => ({ ...b, cost: battalionCost(b, kinds, o.rolePrice), body: b.units.map(([id, n]) => [kindOf(id), n]) })));
  const battById = new Map(BATTALIONS.map((b) => [b.id, b]));

  // ---- the bodies: struct of arrays
  const U = {
    x: new Float32Array(N), y: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N),
    hp: new Float32Array(N), sh: new Float32Array(N), cd: new Float32Array(N), age: new Float32Array(N), ph: new Float32Array(N), stun: new Float32Array(N),
    kind: new Uint16Array(N), team: new Uint8Array(N), alive: new Uint8Array(N), target: new Int32Array(N), goal: new Int32Array(N), home: new Int16Array(N), grp: new Uint16Array(N), clutch: new Uint8Array(N),
    hi: 0, free: [], count: [0, 0],
  };
  const P = {
    x: new Float32Array(M), y: new Float32Array(M), vx: new Float32Array(M), vy: new Float32Array(M), life: new Float32Array(M),
    kind: new Uint16Array(M), team: new Uint8Array(M), alive: new Uint8Array(M), target: new Int32Array(M),
    hi: 0, free: [],
  };
  const MN = { x: new Float32Array(MM), y: new Float32Array(MM), kind: new Uint16Array(MM), team: new Uint8Array(MM), alive: new Uint8Array(MM), hi: 0, free: [] };
  // ---- the strongholds: five a side in an arc, the player's on the west
  const T = { x: [], y: [], team: [], hp: [], alive: [], n: 0 };
  {
    const ys = [0.16, 0.33, 0.5, 0.67, 0.84], xs = [0.07, 0.105, 0.12, 0.105, 0.07];
    for (let side = 0; side < 2; side++) for (let i = 0; i < o.towersPerSide; i++) {
      const x = o.W * xs[i % 5], y = o.H * ys[i % 5];
      T.x.push(side ? o.W - x : x); T.y.push(y); T.team.push(side); T.hp.push(o.towerHp); T.alive.push(1); T.n++;
    }
  }
  // ---- the wells: thirteen a side, mirrored, all neutral at the bell
  const WL = { x: [], y: [], owner: [], prog: [], fort: [], n: 0 };
  {
    const cols = [[0.2, [0.14, 0.4, 0.62, 0.86]], [0.29, [0.27, 0.5, 0.73]], [0.38, [0.14, 0.4, 0.62, 0.86]], [0.46, [0.35, 0.65]]];
    for (let side = 0; side < 2; side++) for (const [fx, fys] of cols) for (const fy of fys) {
      const x = o.W * fx, y = o.H * fy;
      WL.x.push(side ? o.W - x : x); WL.y.push(y); WL.owner.push(-1); WL.prog.push(0); WL.fort.push(0); WL.n++;
    }
  }
  const grid = new Grid(o.W, o.H, o.cell, N);
  const S = {
    o, rng, kinds, decks, U, P, MN, T, WL, grid,
    energy: [o.energy0, o.energy0], income: [0, 0],
    tick: 0, time: 0, events: [], queue: [], result: null, grpN: 1,
    stats: { deployed: [0, 0], musters: [0, 0], kills: [0, 0], spent: [0, 0], towerDmg: [0, 0], roleKills: [zeros36(), zeros36()], wellsTaken: [0, 0], forts: [0, 0] },
  };
  function zeros36() { return new Uint32Array(36); }
  const EV_CAP = 2400;
  const ev = (e) => { if (S.events.length < EV_CAP) S.events.push(e); };
  const roleOf = (kind) => kinds[kind].shape;

  // ---- slots
  function allocUnit() { if (U.free.length) return U.free.pop(); if (U.hi >= N) return -1; return U.hi++; }
  function allocShot() { if (P.free.length) return P.free.pop(); if (P.hi >= M) return -1; return P.hi++; }
  function allocMine() { if (MN.free.length) return MN.free.pop(); if (MN.hi >= MM) return -1; return MN.hi++; }

  function spawnUnit(team, kind, x, y, goal, home, grp) {
    const i = allocUnit(); if (i < 0) return -1;
    const k = kinds[kind];
    U.x[i] = x; U.y[i] = y; U.vx[i] = 0; U.vy[i] = 0;
    U.hp[i] = k.hp; U.sh[i] = k.shieldMax; U.cd[i] = rng() * 0.5; U.age[i] = 0; U.ph[i] = rng() * 6.283; U.stun[i] = 0;
    U.kind[i] = kind; U.team[i] = team; U.alive[i] = 1; U.target[i] = -1; U.goal[i] = goal; U.home[i] = home; U.grp[i] = grp || 0; U.clutch[i] = k.w.type === 'spawn' ? (k.w.clutch || 24) : 0;
    U.count[team]++;
    return i;
  }
  function killUnit(i, byTeam, byKind) {
    if (!U.alive[i]) return;
    const k = kinds[U.kind[i]], team = U.team[i];
    U.alive[i] = 0; U.count[team]--; U.free.push(i);
    if (byTeam >= 0 && byTeam !== team) { S.stats.kills[byTeam]++; if (byKind >= 0) S.stats.roleKills[byTeam][roleOf(byKind) * 6 + k.shape]++; }
    ev({ t: 'death', x: U.x[i], y: U.y[i], team, kind: k.index, r: k.r });
    if (k.traits.split && k.splitIndex >= 0) {
      for (let j = 0; j < k.splitN; j++) {
        const a = rng() * 6.283, d = 6 + rng() * 14;
        const c = spawnUnit(team, k.splitIndex, U.x[i] + Math.cos(a) * d, U.y[i] + Math.sin(a) * d, U.goal[i], U.home[i], U.grp[i]);
        if (c >= 0) { U.vx[c] = Math.cos(a) * 120; U.vy[c] = Math.sin(a) * 120; }
      }
    }
  }

  // ---- damage, the one door
  function hurt(i, dmg, byTeam, hx, hy, byKind) {
    if (!U.alive[i] || dmg <= 0) return;
    if (U.sh[i] > 0) { const a = Math.min(U.sh[i], dmg); U.sh[i] -= a; dmg -= a; if (dmg <= 0) { ev({ t: 'shield', x: hx, y: hy, team: U.team[i] }); return; } }
    U.hp[i] -= dmg;
    ev({ t: 'hit', x: hx, y: hy, team: U.team[i], dmg });
    if (U.hp[i] <= 0) killUnit(i, byTeam, byKind === undefined ? -1 : byKind);
  }
  function hurtTower(t, dmg, byTeam) {
    if (!T.alive[t]) return;
    T.hp[t] -= dmg; S.stats.towerDmg[byTeam] += dmg;
    ev({ t: 'towerHit', x: T.x[t], y: T.y[t], team: T.team[t] });
    if (T.hp[t] <= 0) { T.hp[t] = 0; T.alive[t] = 0; ev({ t: 'towerDown', x: T.x[t], y: T.y[t], team: T.team[t] }); }
  }
  function blast(x, y, r, dmg, team, byKind) {
    grid.near(x, y, r, (j) => {
      if (U.team[j] === team || !U.alive[j]) return false;
      const dx = U.x[j] - x, dy = U.y[j] - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < r + kinds[U.kind[j]].r) hurt(j, dmg * (1 - Math.max(0, d - 20) / (r + 1)), team, U.x[j], U.y[j], byKind);
      return false;
    });
    for (let t = 0; t < T.n; t++) if (T.alive[t] && T.team[t] !== team) { const dx = T.x[t] - x, dy = T.y[t] - y; if (dx * dx + dy * dy < (r + o.towerR) * (r + o.towerR)) hurtTower(t, dmg * 0.6, team); }
  }

  // ---- goals: >= 0 a stronghold, >= 1000 a well (1000 + w), -1 none
  let gx = 0, gy = 0, gr = 0;
  function goalPoint(g) {
    if (g >= 1000) { const w = g - 1000; if (w >= WL.n) return false; gx = WL.x[w]; gy = WL.y[w]; gr = o.wellR; return true; }
    if (g >= 0 && g < T.n && T.alive[g]) { gx = T.x[g]; gy = T.y[g]; gr = o.towerR; return true; }
    return false;
  }
  function nearestEnemyTower(team, x, y) {
    let best = -1, bd = Infinity;
    for (let t = 0; t < T.n; t++) { if (!T.alive[t] || T.team[t] === team) continue; const dx = T.x[t] - x, dy = T.y[t] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = t; } }
    return best;
  }

  // ---- formations: slots as [forward, side] offsets in units of spacing
  function slots(n, form, sp, out) {
    if (form === 'line' || form === 'column') { const cols = form === 'line' ? Math.min(n, 8) : 2; for (let i = 0; i < n; i++) { const r = (i / cols) | 0, c = i % cols; out.push([-r * sp, (c - (Math.min(n, cols) - 1) / 2) * sp]); } }
    else if (form === 'wedge') { for (let i = 0; i < n; i++) { const r = Math.floor((Math.sqrt(8 * i + 1) - 1) / 2), k = i - r * (r + 1) / 2; out.push([-r * sp * 0.9, (k - r / 2) * sp]); } }
    else if (form === 'ring') { const rad = sp * n / 6.283 + sp; for (let i = 0; i < n; i++) { const a = i / n * 6.283; out.push([Math.cos(a) * rad, Math.sin(a) * rad]); } }
    else { const rad = sp * Math.sqrt(n) * 0.9; for (let i = 0; i < n; i++) { const a = rng() * 6.283, d = Math.sqrt(rng()) * rad; out.push([Math.cos(a) * d, Math.sin(a) * d]); } }
    return out;
  }
  const slotBuf = [];

  // ---- commands
  // { op:'deploy', team, tower, batt: id|index-in-deck, goal }   goal: a stronghold index, or 1000 + a well index; default the nearest enemy stronghold
  // { op:'deploy', team, tower, kind: id|index, goal }            one body (the tools and the wire)
  function apply(cmd) {
    if (S.result) return false;
    if (cmd.op === 'fortify') {   // THE FORT: an owned well, not yet fortified, for the price - a warden musters on it and it pays more
      const team = cmd.team | 0, w = cmd.well | 0;
      if (w < 0 || w >= WL.n || WL.owner[w] !== team || WL.fort[w]) return false;
      if (!cmd.free && S.energy[team] < o.fortifyCost) return false;
      const wk = kinds.findIndex((k) => k.id === 'WARDEN'); if (wk < 0) return false;
      let home = -1, hd = Infinity; for (let t = 0; t < T.n; t++) { if (!T.alive[t] || T.team[t] !== team) continue; const dx = T.x[t] - WL.x[w], dy = T.y[t] - WL.y[w], d = dx * dx + dy * dy; if (d < hd) { hd = d; home = t; } }
      const i = spawnUnit(team, wk, WL.x[w], WL.y[w] - o.wellR * 0.6, 1000 + w, home, 0); if (i < 0) return false;
      if (!cmd.free) { S.energy[team] -= o.fortifyCost; S.stats.spent[team] += o.fortifyCost; }
      WL.fort[w] = 1; S.stats.forts[team]++;
      ev({ t: 'fortify', x: WL.x[w], y: WL.y[w], team, well: w });
      return true;
    }
    if (cmd.op !== 'deploy') return false;
    const team = cmd.team | 0;
    const tw = cmd.tower | 0; if (tw < 0 || tw >= T.n || T.team[tw] !== team || !T.alive[tw]) return false;
    let goal = cmd.goal === undefined || cmd.goal === null ? -1 : cmd.goal | 0;
    if (!goalPoint(goal) || (goal < 1000 && goal >= 0 && T.team[goal] === team && cmd.batt === undefined)) goal = nearestEnemyTower(team, T.x[tw], T.y[tw]);
    goalPoint(goal);
    const dx = gx - T.x[tw], dy = gy - T.y[tw], dl = Math.sqrt(dx * dx + dy * dy) || 1, fx = dx / dl, fy = dy / dl;
    if (cmd.batt !== undefined) {
      const deck = decks[team];
      const b = typeof cmd.batt === 'string' ? deck.find((q) => q.id === cmd.batt) : deck[cmd.batt | 0];
      if (!b) return false;
      const mult = 1 + S.time * o.escalate, price = Math.round(b.cost * mult);
      if (!cmd.free && S.energy[team] < price) return false;
      const grp = S.grpN++ & 0xffff;
      let big = 0; for (const [kind] of b.body) big = Math.max(big, kinds[kind].r);
      const list = []; for (const [kind, n] of b.body) { const m = Math.max(1, Math.round(n * mult)); for (let i = 0; i < m; i++) list.push(kind); }
      list.sort((a, c) => kinds[c].r - kinds[a].r);   // the heavy bodies take the front slots
      slotBuf.length = 0; slots(list.length, b.form, big * 2.6, slotBuf);
      const ox = T.x[tw] + fx * (o.towerR + 120 + big * 2), oy = T.y[tw] + fy * (o.towerR + 120 + big * 2);
      let born = 0;
      for (let i = 0; i < list.length; i++) { const [f, s] = slotBuf[i]; const px = ox + fx * f - fy * s, py = oy + fy * f + fx * s; if (spawnUnit(team, list[i], px, py, goal, tw, grp) >= 0) born++; }
      if (!born) return false;
      if (!cmd.free) { S.energy[team] -= price; S.stats.spent[team] += price; }
      S.stats.deployed[team] += born; S.stats.musters[team]++;
      ev({ t: 'muster', x: ox, y: oy, team, role: b.role, n: born });
      return true;
    }
    const kind = typeof cmd.kind === 'string' ? kindOf(cmd.kind) : cmd.kind | 0;
    const k = kinds[kind]; if (!k) return false;
    if (!cmd.free && S.energy[team] < k.cost) return false;
    const a = rng() * 6.283, d = o.towerR + 30 + rng() * 60;
    const i = spawnUnit(team, kind, T.x[tw] + Math.cos(a) * d, T.y[tw] + Math.sin(a) * d, goal, tw, 0);
    if (i < 0) return false;
    if (!cmd.free) { S.energy[team] -= k.cost; S.stats.spent[team] += k.cost; }
    S.stats.deployed[team]++;
    ev({ t: 'deploy', x: U.x[i], y: U.y[i], team, kind });
    return true;
  }

  // ---- targeting: the nearest enemy body inside the aggro ring, else the enemy stronghold it was sent at
  // THE EYE OF EACH ROLE: a swarm, an armour or a field takes the nearest; a striker or a blade takes the weakest it can reach (and finishes it); a siege gun takes the biggest, and never one inside its minimum range
  let qx = 0, qy = 0, qteam = 0, qbest = -1, qbd = 0, qcloakR = 120 * 120, qmode = 0, qaggro2 = 0, qmin2 = 0, qscore = 0;
  const pickNearest = (j) => {
    if (U.team[j] === qteam || !U.alive[j]) return false;
    const dx = U.x[j] - qx, dy = U.y[j] - qy, d = dx * dx + dy * dy;
    if (d >= qaggro2) return false;
    if (kinds[U.kind[j]].traits.cloak && d > qcloakR && U.cd[j] > 0.3) return false;
    if (qmode === 0) { if (d >= qbd) return false; qbd = d; qbest = j; return false; }
    if (qmode === 1) { const sc = U.hp[j] + U.sh[j] + Math.sqrt(d) * 0.08; if (qbest >= 0 && sc >= qscore) return false; qscore = sc; qbest = j; return false; }
    if (d < qmin2) return false; const sc = U.hp[j] + U.sh[j] - Math.sqrt(d) * 0.05; if (qbest >= 0 && sc <= qscore) return false; qscore = sc; qbest = j; return false;
  };
  function retarget(i, k) {
    qx = U.x[i]; qy = U.y[i]; qteam = U.team[i]; qbest = -1; qbd = k.aggro * k.aggro; qaggro2 = qbd; qscore = 0;
    qmode = (k.shape === 2 || k.shape === 5) ? 1 : (k.w.minRange ? 2 : 0); qmin2 = (k.w.minRange || 0) * (k.w.minRange || 0);
    grid.near(qx, qy, k.aggro, pickNearest);
    if (qbest >= 0) { U.target[i] = qbest; return; }
    const g = U.goal[i];
    if (g >= 0 && g < T.n && T.alive[g] && T.team[g] !== qteam) { U.target[i] = -2 - g; return; }
    if (g >= 0 && g < T.n && !T.alive[g]) { const ng = nearestEnemyTower(qteam, qx, qy); U.goal[i] = ng; U.target[i] = ng < 0 ? -1 : -2 - ng; return; }
    U.target[i] = -1;
  }
  let tx = 0, ty = 0, tr = 0;
  function targetPos(i) {
    const t = U.target[i];
    if (t >= 0) { if (!U.alive[t] || U.team[t] === U.team[i]) return false; tx = U.x[t]; ty = U.y[t]; tr = kinds[U.kind[t]].r; return true; }
    if (t <= -2) { const g = -2 - t; if (!T.alive[g]) return false; tx = T.x[g]; ty = T.y[g]; tr = o.towerR; return true; }
    return false;
  }

  // ---- movement
  let sx = 0, sy = 0, si = 0, sr = 0, sn = 0, sgrp = 0, steam = 0, cx = 0, cy = 0, cn = 0;
  const separate = (j) => {
    if (j === si || !U.alive[j]) return false;
    const dx = U.x[si] - U.x[j], dy = U.y[si] - U.y[j], d2 = dx * dx + dy * dy, m = sr + kinds[U.kind[j]].r;
    if (U.team[j] === steam && U.grp[j] === sgrp) { cx += U.x[j]; cy += U.y[j]; cn++; }
    if (d2 < m * m && d2 > 0.01) { const d = Math.sqrt(d2), p = (m - d) / d; sx += dx * p; sy += dy * p; }
    return ++sn >= 10;
  };
  function move(i, k, dt) {
    let has = targetPos(i), dx = 0, dy = 0, dist = 1;
    const gun = has && U.target[i] >= 0 && kinds[U.kind[U.target[i]]].w.minRange > 0;   // the enemy in front is artillery with a blind ring
    let stop = k.w.range * ((k.move === 'hop' || k.move === 'phase') ? (gun ? 0.3 : 0.85) : k.move === 'zigzag' ? 0.6 : 0.85);   // a striker or a blade dives under the guns and otherwise fights at its reach
    if (!has && goalPoint(U.goal[i])) { tx = gx; ty = gy; tr = gr; has = true; stop = gr + 30 + (U.grp[i] % 5) * 12; }   // no enemy: walk to the point it was sent to and hold there
    if (has) { dx = tx - U.x[i]; dy = ty - U.y[i]; dist = Math.sqrt(dx * dx + dy * dy) || 1; dx /= dist; dy /= dist; }
    const spd = k.speed, age = U.age[i], ph = U.ph[i];
    let wx = 0, wy = 0;
    const far = has && dist > stop;
    switch (k.move) {
      case 'march': if (far) { wx = dx * spd; wy = dy * spd; } break;
      case 'zigzag': if (far) { const s = Math.sin(age * 5 + ph) * 0.7; wx = (dx - dy * s) * spd; wy = (dy + dx * s) * spd; } break;
      case 'orbit': if (has) { if (dist > stop * 1.05) { wx = dx * spd; wy = dy * spd; } else if (U.target[i] !== -1) { const s = ph > 3.14 ? 1 : -1; wx = -dy * s * spd * 0.8 + dx * (dist - stop * 0.8) * 2; wy = dx * s * spd * 0.8 + dy * (dist - stop * 0.8) * 2; } } break;
      case 'swarm': if (far) { wx = dx * spd; wy = dy * spd; } if (cn) { const gx2 = cx / cn - U.x[i], gy2 = cy / cn - U.y[i]; wx += gx2 * 0.8; wy += gy2 * 0.8; } break;
      case 'hop': if (far) { const g = Math.sin(age * 3.2 + ph) > 0.1 ? 2.2 : 0; wx = dx * spd * g; wy = dy * spd * g; } break;
      case 'hold': { const h = U.home[i]; if (far && U.target[i] >= 0) { wx = dx * spd; wy = dy * spd; } else if (far && U.target[i] === -1) { wx = dx * spd; wy = dy * spd; } if (h >= 0 && U.target[i] === -1 && !goalPoint(U.goal[i])) { const hx = T.x[h] - U.x[i], hy = T.y[h] - U.y[i], hd = Math.sqrt(hx * hx + hy * hy); if (hd > 260) { wx = hx / hd * spd; wy = hy / hd * spd; } } break; }
      case 'phase': if (far) { wx = dx * spd * 0.6; wy = dy * spd * 0.6; if (U.cd[i] < -2.6 && dist > 300) { const jump = Math.min(240, dist - stop * 0.7); ev({ t: 'blink', x: U.x[i], y: U.y[i], x2: U.x[i] + dx * jump, y2: U.y[i] + dy * jump, team: U.team[i] }); U.x[i] += dx * jump; U.y[i] += dy * jump; U.cd[i] = 0.2; } } break;
    }
    si = i; sr = k.r; sx = 0; sy = 0; sn = 0; sgrp = U.grp[i]; steam = U.team[i]; cx = 0; cy = 0; cn = 0;
    grid.near(U.x[i], U.y[i], k.r * 2 + 8, separate);
    wx += sx * 40; wy += sy * 40;
    if (U.stun[i] > 0) { wx *= 0.05; wy *= 0.05; }
    const ease = Math.min(1, dt * (k.mass > 3 ? 4 : 9));
    U.vx[i] += (wx - U.vx[i]) * ease; U.vy[i] += (wy - U.vy[i]) * ease;
    let nx = U.x[i] + U.vx[i] * dt, ny = U.y[i] + U.vy[i] * dt;
    if (nx < 0) nx = 0; else if (nx > o.W) nx = o.W; if (ny < 0) ny = 0; else if (ny > o.H) ny = o.H;
    U.x[i] = nx; U.y[i] = ny;
    return U.target[i] !== -1 && targetPos(i) ? Math.sqrt((tx - U.x[i]) ** 2 + (ty - U.y[i]) ** 2) : Infinity;
  }

  // ---- weapons
  const arcHit = new Int32Array(16);
  let ax = 0, ay = 0, ateam = 0, abest = -1, abd = 0, an = 0;
  const arcNext = (j) => {
    if (U.team[j] === ateam || !U.alive[j]) return false;
    for (let h = 0; h < an; h++) if (arcHit[h] === j) return false;
    const dx = U.x[j] - ax, dy = U.y[j] - ay, d = dx * dx + dy * dy;
    if (d < abd) { abd = d; abest = j; }
    return false;
  };
  function fire(i, k, dist) {
    const w = k.w, team = U.team[i], x = U.x[i], y = U.y[i], ki = k.index;
    switch (w.type) {
      case 'bolt': {
        const base = Math.atan2(ty - y, tx - x);
        for (let c = 0; c < w.count; c++) {
          const s = allocShot(); if (s < 0) break;
          const a = base + (w.count > 1 ? (c - (w.count - 1) / 2) * w.spread : 0) + (rng() - 0.5) * 0.04;
          P.x[s] = x; P.y[s] = y; P.vx[s] = Math.cos(a) * w.speed; P.vy[s] = Math.sin(a) * w.speed; P.life[s] = w.life; P.kind[s] = ki; P.team[s] = team; P.alive[s] = 1; P.target[s] = -1;
        }
        break;
      }
      case 'missile': {
        for (let c = 0; c < w.count; c++) {
          const s = allocShot(); if (s < 0) break;
          const a = Math.atan2(ty - y, tx - x) + (rng() - 0.5) * 0.8;
          P.x[s] = x; P.y[s] = y; P.vx[s] = Math.cos(a) * w.speed; P.vy[s] = Math.sin(a) * w.speed; P.life[s] = (w.range / w.speed) * 2.2; P.kind[s] = ki; P.team[s] = team; P.alive[s] = 1; P.target[s] = U.target[i];
        }
        break;
      }
      case 'beam': {
        ev({ t: 'beam', x, y, x2: tx, y2: ty, team, kind: ki });
        const t = U.target[i];
        if (t >= 0) hurt(t, w.dmg, team, tx, ty, ki); else if (t <= -2) hurtTower(-2 - t, w.dmg, team);
        if (w.pierce > 0) {
          const dx = (tx - x) / (dist || 1), dy = (ty - y) / (dist || 1); let left = w.pierce;
          grid.near((x + tx) / 2, (y + ty) / 2, w.range / 2 + 40, (j) => {
            if (left <= 0) return true;
            if (U.team[j] === team || !U.alive[j] || j === t) return false;
            const px = U.x[j] - x, py = U.y[j] - y, along = px * dx + py * dy;
            if (along < 0 || along > w.range) return false;
            const off = Math.abs(px * dy - py * dx); if (off > kinds[U.kind[j]].r + 6) return false;
            hurt(j, w.dmg * 0.7, team, U.x[j], U.y[j], ki); left--; return false;
          });
        }
        break;
      }
      case 'arc': {
        const t = U.target[i]; const pts = [x, y];
        let dmg = w.dmg; let lx, ly;
        if (t >= 0) { hurt(t, dmg, team, tx, ty, ki); lx = tx; ly = ty; arcHit[0] = t; an = 1; }
        else if (t <= -2) { hurtTower(-2 - t, dmg, team); lx = tx; ly = ty; an = 0; }
        else break;
        pts.push(lx, ly);
        for (let h = 0; h < w.hops; h++) {
          dmg *= w.decay; ax = lx; ay = ly; ateam = team; abest = -1; abd = w.hopRange * w.hopRange;
          grid.near(ax, ay, w.hopRange, arcNext);
          if (abest < 0) break;
          hurt(abest, dmg, team, U.x[abest], U.y[abest], ki); if (an < 16) arcHit[an++] = abest;
          lx = U.x[abest]; ly = U.y[abest]; pts.push(lx, ly);
        }
        ev({ t: 'arc', pts, team, kind: ki });
        break;
      }
      case 'pulse': {
        blast(x, y, w.range, w.dmg, team, ki);
        if (k.traits.emp) grid.near(x, y, w.range, (j) => { if (U.team[j] !== team && U.alive[j]) { const dx = U.x[j] - x, dy = U.y[j] - y; if (dx * dx + dy * dy < w.range * w.range) U.stun[j] = Math.max(U.stun[j], 0.55); } return false; });
        ev({ t: 'pulse', x, y, r: w.range, team, kind: ki, emp: !!k.traits.emp });
        break;
      }
      case 'mine': {
        const m = allocMine(); if (m < 0) break;
        MN.x[m] = x + (rng() - 0.5) * 30; MN.y[m] = y + (rng() - 0.5) * 30; MN.kind[m] = ki; MN.team[m] = team; MN.alive[m] = 1;
        ev({ t: 'mine', x: MN.x[m], y: MN.y[m], team });
        break;
      }
      case 'spawn': {
        if (!U.clutch[i]) break;   // the clutch is spent: the carrier is a body now
        for (let c = 0; c < w.count && U.clutch[i]; c++) {
          U.clutch[i]--;
          const a = rng() * 6.283, d = k.r + 10;
          const j = spawnUnit(team, k.childIndex, x + Math.cos(a) * d, y + Math.sin(a) * d, U.goal[i], U.home[i], U.grp[i]);
          if (j >= 0) { U.vx[j] = Math.cos(a) * 160; U.vy[j] = Math.sin(a) * 160; }
        }
        ev({ t: 'spawnout', x, y, team, kind: ki });
        break;
      }
      case 'aura': {
        const heal = w.dmg / w.rate;
        grid.near(x, y, w.range, (j) => { if (U.team[j] === team && U.alive[j] && j !== i) { const kk = kinds[U.kind[j]]; if (U.hp[j] < kk.hp) U.hp[j] = Math.min(kk.hp, U.hp[j] + heal); } return false; });
        ev({ t: 'aura', x, y, r: w.range, team, kind: ki });
        break;
      }
    }
  }

  // ---- shots
  let hx = 0, hy = 0, hteam = 0, hbest = -1, hr = 0;
  const shotHit = (j) => {
    if (U.team[j] === hteam || !U.alive[j]) return false;
    const dx = U.x[j] - hx, dy = U.y[j] - hy, rr = kinds[U.kind[j]].r + hr;
    if (dx * dx + dy * dy < rr * rr) { hbest = j; return true; }
    return false;
  };
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
      const steps = (w.speed || 0) * dt > 24 ? 2 : 1; let hit = false;
      for (let q = 0; q < steps && !hit; q++) {
        P.x[s] += P.vx[s] * dt / steps; P.y[s] += P.vy[s] * dt / steps;
        hx = P.x[s]; hy = P.y[s]; hteam = team; hbest = -1; hr = 4;
        grid.near(hx, hy, 30, shotHit);
        if (hbest >= 0) {
          if (w.type === 'missile') blast(hx, hy, w.splash, w.dmg, team, k.index); else hurt(hbest, w.dmg, team, hx, hy, k.index);
          hit = true;
        } else {
          for (let t = 0; t < T.n; t++) { if (!T.alive[t] || T.team[t] === team) continue; const dx = T.x[t] - hx, dy = T.y[t] - hy; if (dx * dx + dy * dy < o.towerR * o.towerR) { if (w.type === 'missile') blast(hx, hy, w.splash, w.dmg, team, k.index); else hurtTower(t, w.dmg, team); hit = true; break; } }
        }
      }
      if (hit || P.x[s] < -50 || P.x[s] > o.W + 50 || P.y[s] < -50 || P.y[s] > o.H + 50) { if (hit && w.type !== 'missile') ev({ t: 'impact', x: hx, y: hy, team, kind: k.index }); if (hit && w.type === 'missile') ev({ t: 'explode', x: hx, y: hy, r: w.splash, team, kind: k.index }); P.alive[s] = 0; P.free.push(s); }
    }
  }

  // ---- mines
  let mx = 0, my = 0, mteam = 0, mtrig = false, mr = 0;
  const mineTrip = (j) => { if (U.team[j] === mteam || !U.alive[j]) return false; const dx = U.x[j] - mx, dy = U.y[j] - my; if (dx * dx + dy * dy < mr * mr) { mtrig = true; return true; } return false; };
  function stepMines() {
    for (let m = 0; m < MN.hi; m++) {
      if (!MN.alive[m]) continue;
      const w = kinds[MN.kind[m]].w;
      mx = MN.x[m]; my = MN.y[m]; mteam = MN.team[m]; mtrig = false; mr = w.trigger;
      grid.near(mx, my, mr, mineTrip);
      if (mtrig) { blast(mx, my, w.range, w.dmg, mteam, MN.kind[m]); ev({ t: 'explode', x: mx, y: my, r: w.range, team: mteam, kind: MN.kind[m] }); MN.alive[m] = 0; MN.free.push(m); }
    }
  }

  // ---- the wells: a side alone on a well turns it; both sides on it hold it still
  let wa = 0, wb = 0, wcx = 0, wcy = 0, wr2 = 0;
  const wellCount = (j) => { if (!U.alive[j]) return false; const dx = U.x[j] - wcx, dy = U.y[j] - wcy; if (dx * dx + dy * dy < wr2) { if (U.team[j] === 0) wa += U.hp[j]; else wb += U.hp[j]; } return false; };
  function stepWells(dt) {
    const reach = o.wellR * 1.6; wr2 = reach * reach;
    for (let w = 0; w < WL.n; w++) {
      wa = 0; wb = 0; wcx = WL.x[w]; wcy = WL.y[w];
      grid.near(wcx, wcy, reach, wellCount);
      let p = WL.prog[w];
      if (wa > 0 && wb === 0) p = Math.min(1, p + o.captureRate * dt); else if (wb > 0 && wa === 0) p = Math.max(-1, p - o.captureRate * dt);
      WL.prog[w] = p;
      const was = WL.owner[w];
      if (p >= 1 && was !== 0) { WL.owner[w] = 0; WL.fort[w] = 0; S.stats.wellsTaken[0]++; ev({ t: 'capture', x: wcx, y: wcy, team: 0, well: w, from: was }); }
      else if (p <= -1 && was !== 1) { WL.owner[w] = 1; WL.fort[w] = 0; S.stats.wellsTaken[1]++; ev({ t: 'capture', x: wcx, y: wcy, team: 1, well: w, from: was }); }
    }
  }

  // ---- the tick
  function step() {
    if (S.result) return;
    const dt = TICK;
    S.events.length = 0;
    S.tick++; S.time += dt;
    while (S.queue.length) apply(S.queue.shift());
    let inc0 = 0, inc1 = 0;
    for (let t = 0; t < T.n; t++) if (T.alive[t]) { if (T.team[t] === 0) inc0 += o.incomePerTower; else inc1 += o.incomePerTower; }
    for (let w = 0; w < WL.n; w++) { const pay = o.wellIncome + (WL.fort[w] ? o.fortifyBonus : 0); if (WL.owner[w] === 0) inc0 += pay; else if (WL.owner[w] === 1) inc1 += pay; }
    const esc = 1 + S.time * o.escalate, tm = (TEMPERS[o.temper] || TEMPERS.normal).incomeM;
    inc0 *= esc; inc1 *= esc * tm;
    S.income[0] = inc0; S.income[1] = inc1; S.energy[0] += inc0 * dt; S.energy[1] += inc1 * dt;
    grid.build(U.x, U.y, U.alive, U.hi);
    const hi = U.hi, tick = S.tick;
    for (let i = 0; i < hi; i++) {
      if (!U.alive[i]) continue;
      const k = kinds[U.kind[i]];
      U.age[i] += dt; U.cd[i] -= dt; if (U.stun[i] > 0) U.stun[i] -= dt;
      if (k.traits.regen && U.hp[i] < k.hp) U.hp[i] = Math.min(k.hp, U.hp[i] + k.hp * 0.02 * dt);
      if (k.shieldMax && U.sh[i] < k.shieldMax) U.sh[i] = Math.min(k.shieldMax, U.sh[i] + k.shieldMax * 0.08 * dt);
      if (U.target[i] === -1 ? ((tick + i) % 6 === 0) : (((tick + i) % 6 === 0) || !targetPos(i))) retarget(i, k);
      const dist = move(i, k, dt);
      if (k.traits.magnet) grid.near(U.x[i], U.y[i], k.w.range, (j) => { if (U.team[j] !== U.team[i] && U.alive[j]) { const dx = U.x[i] - U.x[j], dy = U.y[i] - U.y[j], d = Math.sqrt(dx * dx + dy * dy) || 1; if (d < k.w.range) { U.vx[j] += dx / d * 20; U.vy[j] += dy / d * 20; } } return false; });
      if (k.traits.kamikaze && dist < k.r + tr + 4) { const t = U.target[i]; blast(U.x[i], U.y[i], 70, 30, U.team[i], k.index); if (t <= -2) hurtTower(-2 - t, 40, U.team[i]); ev({ t: 'explode', x: U.x[i], y: U.y[i], r: 70, team: U.team[i], kind: k.index }); killUnit(i, -1, -1); continue; }
      const passive = k.w.type === 'aura' || k.w.type === 'spawn' || k.w.type === 'mine';
      if (U.cd[i] <= 0 && U.stun[i] <= 0 && (passive || (dist <= k.w.range + tr && dist >= (k.w.minRange || 0)))) { fire(i, k, dist); U.cd[i] = 1 / k.w.rate; }
    }
    stepShots(dt);
    stepMines();
    if (tick % 5 === 0) stepWells(dt * 5);
    while (U.hi > 0 && !U.alive[U.hi - 1]) { U.hi--; const f = U.free.indexOf(U.hi); if (f >= 0) U.free.splice(f, 1); }
    let a = 0, b = 0, ha = 0, hb = 0;
    for (let t = 0; t < T.n; t++) { if (T.team[t] === 0) { a += T.alive[t]; ha += T.hp[t]; } else { b += T.alive[t]; hb += T.hp[t]; } }
    if (a === 0 || b === 0) S.result = { winner: a === 0 ? 1 : 0, why: 'towers', tick: S.tick, time: S.time };
    else if (S.time >= o.clock) { let wa = 0, wb = 0; for (let w = 0; w < WL.n; w++) { if (WL.owner[w] === 0) wa++; else if (WL.owner[w] === 1) wb++; } S.result = { winner: ha !== hb ? (ha > hb ? 0 : 1) : wa !== wb ? (wa > wb ? 0 : 1) : -1, why: ha !== hb ? 'clock' : 'wells', tick: S.tick, time: S.time }; }
    if (S.result) ev({ t: 'end', winner: S.result.winner });
  }

  // ---- what a commander reads: small, plain, JSON-able
  function snapshot() {
    const counts = [new Uint16Array(kinds.length), new Uint16Array(kinds.length)];
    const fielded = [[0, 0, 0, 0, 0, 0], [0, 0, 0, 0, 0, 0]];   // energy alive per role, per side
    const nearT = new Float32Array(T.n), nearW = new Float32Array(WL.n), nearTr = new Float32Array(T.n), nearWr = new Float32Array(WL.n);
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i]) continue;
      const k = kinds[U.kind[i]], tm = U.team[i];
      counts[tm][k.index]++; fielded[tm][k.shape] += k.cost;
      for (let t = 0; t < T.n; t++) { if (!T.alive[t]) continue; const dx = T.x[t] - U.x[i], dy = T.y[t] - U.y[i]; if (dx * dx + dy * dy < 700 * 700) { if (T.team[t] !== tm) nearT[t] += U.hp[i]; else nearTr[t] += U.hp[i]; } }
      for (let w = 0; w < WL.n; w++) { const dx = WL.x[w] - U.x[i], dy = WL.y[w] - U.y[i]; if (dx * dx + dy * dy < 400 * 400) { if (tm === 0) nearW[w] += U.hp[i]; else nearWr[w] += U.hp[i]; } }
    }
    return {
      tick: S.tick, time: +S.time.toFixed(2), energy: [Math.floor(S.energy[0]), Math.floor(S.energy[1])], income: S.income.slice(),
      towers: T.x.map((x, t) => ({ i: t, team: T.team[t], x, y: T.y[t], hp: Math.round(T.hp[t]), alive: !!T.alive[t], threat: Math.round(nearT[t]), guard: Math.round(nearTr[t]) })),
      wells: WL.x.map((x, w) => ({ i: w, x, y: WL.y[w], owner: WL.owner[w], fort: WL.fort[w], prog: +WL.prog[w].toFixed(2), west: Math.round(nearW[w]), east: Math.round(nearWr[w]) })),
      counts: [Array.from(counts[0]), Array.from(counts[1])], fielded, alive: [U.count[0], U.count[1]],
      decks: decks.map((d) => d.map((b) => ({ id: b.id, role: b.role, cost: b.cost }))),
      result: S.result,
    };
  }

  return {
    S, o, kinds, decks, U, P, MN, T, WL, grid, TICK, battById,
    step, apply, snapshot, nearestEnemyTower, mult: () => 1 + S.time * o.escalate, price: (b) => Math.round(b.cost * (1 + S.time * o.escalate)), goalPoint: (g) => (goalPoint(g) ? { x: gx, y: gy, r: gr, name: g >= 1000 ? 'WELL ' + (g - 1000 + 1) : 'STRONGHOLD ' + ((g % o.towersPerSide) + 1) } : null),
    queue: (cmd) => S.queue.push(cmd),
    get result() { return S.result; },
    get events() { return S.events; },
    get energy() { return S.energy; },
    get income() { return S.income; },
    get tick() { return S.tick; },
    get time() { return S.time; },
  };
}
