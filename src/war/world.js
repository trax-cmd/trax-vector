// world.js — THE WAR. One open field, fifty outposts, two empires. Every outpost a side holds builds its own kind of
// unit on its own clock; the armies march on their own to the outposts their side wants, fight whatever they meet and
// take what they stand on. The commander does three things: says where the reinforcements go (a rally on an outpost),
// flies any of four battleships, and fires their powers. Pure and deterministic: a seed makes the map, the ticks make
// the war, commands land at tick boundaries - the page, a tool and a test all play the same match.
import { rng32 } from '../sim/rng.js';

export const W = 14000, H = 9000, TICK = 1 / 30;
export const CAP_UNITS = 2400;                  // a side's bodies at most: an outpost waits while its empire is full

// THE UNITS - six shapes, six jobs. shape: the renderer's family (orb, square, tri, hex, ring, diamond)
export const UNITS = [
  { id: 'FIGHTER',   shape: 0, r: 7,  hp: 22,  speed: 250, range: 170, dmg: 4,  rate: 2.6 },
  { id: 'TANK',      shape: 1, r: 15, hp: 170, speed: 95,  range: 240, dmg: 13, rate: 0.9, splash: 45 },
  { id: 'STRIKER',   shape: 2, r: 10, hp: 48,  speed: 235, range: 210, dmg: 11, rate: 1.8 },
  { id: 'ARTILLERY', shape: 3, r: 16, hp: 80,  speed: 70,  range: 650, dmg: 34, rate: 0.45, splash: 80, minRange: 220, shell: 0.6 },
  { id: 'MEDIC',     shape: 4, r: 12, hp: 80,  speed: 130, range: 150, dmg: 3,  rate: 1, heal: 10, healR: 180 },
  { id: 'LANCER',    shape: 5, r: 9,  hp: 34,  speed: 300, range: 270, dmg: 30, rate: 0.9, hunts: true },
];
// THE BATTLESHIPS - four a side, each with two powers. Index into KINDS = UNITS.length + slot
export const SHIPS = [
  { id: 'DREADNOUGHT', shape: 3, r: 46, hp: 5200, speed: 150, range: 520, dmg: 16, rate: 5, powers: ['BROADSIDE', 'DOME'], cds: [14, 22] },
  { id: 'CARRIER',     shape: 4, r: 44, hp: 3800, speed: 175, range: 420, dmg: 8,  rate: 4, powers: ['LAUNCH', 'REPAIR'], cds: [16, 20] },
  { id: 'RAIDER',      shape: 5, r: 30, hp: 2300, speed: 330, range: 440, dmg: 30, rate: 2.5, powers: ['WARP', 'TORPEDO'], cds: [10, 12] },
  { id: 'MONITOR',     shape: 1, r: 40, hp: 4600, speed: 140, range: 600, dmg: 22, rate: 2, splash: 50, powers: ['BOMBARD', 'EMP'], cds: [18, 20] },
];
export const KINDS = [...UNITS, ...SHIPS.map((s) => ({ ...s, ship: true }))];
const FIRST_SHIP = UNITS.length;

// THE OUTPOSTS - what each kind builds, in turn, and how often (seconds at size 2)
export const OUTPOSTS = {
  HIVE:    { build: [[0, 3]], every: 5 },                                 // fighters by threes
  FORGE:   { build: [[1, 1], [1, 1], [3, 1]], every: 6 },                 // tanks, and artillery every third
  SPIRE:   { build: [[2, 2], [5, 1]], every: 5 },                         // strikers, then a lancer
  SHRINE:  { build: [[4, 1], [0, 2]], every: 6, mends: true },            // a medic and two fighters; heals its owner's bodies around it
  CAPITAL: { build: [[1, 1], [2, 2], [0, 3], [3, 1], [5, 1]], every: 3 }, // a bit of everything, fast
};
const KIND_POOL = ['HIVE', 'HIVE', 'FORGE', 'FORGE', 'SPIRE', 'SPIRE', 'SHRINE'];
const CAP_R = 280;          // presence radius that takes an outpost
const TAKE_RATE = 0.22;     // control per second from a full garrison (8 bodies); a capital at a third of that
const GUN = { range: 320, dmg: 7, rate: 1 }, CAPITAL_GUN = { range: 460, dmg: 26, rate: 2.5 };
const CELL = 160;
const BUILD_PACE = 0.4;     // every build clock times this: a first reading held 200-300 bodies a side alive - the war is meant to be vast
const SHIP_BACK = 25;       // seconds a sunk battleship takes to rebuild at the capital
const CLOCK = 720;          // twelve minutes, then the empire with more outposts wins

export function createWorld(opts = {}) {
  const seed = opts.seed || 1, rng = rng32(seed);
  const N = CAP_UNITS * 2 + 64;
  const U = {
    x: new Float32Array(N), y: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N), hp: new Float32Array(N),
    kind: new Uint8Array(N), team: new Uint8Array(N), alive: new Uint8Array(N), cd: new Float32Array(N), stun: new Float32Array(N),
    target: new Int32Array(N), dest: new Int16Array(N), hi: 0, free: [], count: [0, 0],
  };
  const S = { tick: 0, time: 0, events: [], queue: [], result: null, rally: [-1, -1], rallyUntil: [0, 0], shells: [], stats: { kills: [0, 0], built: [0, 0], taken: [0, 0] } };

  // ---- THE MAP: 25 outposts on the west half by a seeded dart throw, the east the same turned about the centre
  const nodes = [];
  function place() {
    const half = [{ x: 800, y: H / 2, kind: 'CAPITAL', size: 3 }];
    for (let tries = 0; half.length < 25 && tries < 20000; tries++) {
      const x = 700 + rng() * (W / 2 - 1100), y = 500 + rng() * (H - 1000);
      if (half.every((n) => Math.hypot(n.x - x, n.y - y) > 1100)) half.push({ x, y, kind: KIND_POOL[(rng() * KIND_POOL.length) | 0], size: 1 + ((rng() * 3) | 0) });
    }
    for (const n of half) nodes.push({ ...n, team: -1, prog: 0, links: [], built: 0, step: 0, silent: 0, cd: 0 });
    for (const n of half) nodes.push({ ...n, x: W - n.x, y: H - n.y, team: -1, prog: 0, links: [], built: 0, step: 0, silent: 0, cd: 0 });
    // the roads: each outpost to its three nearest (they read as the map's network and say which outposts border which)
    nodes.forEach((n, i) => {
      const near = nodes.map((m, j) => [j, Math.hypot(m.x - n.x, m.y - n.y)]).filter(([j]) => j !== i).sort((a, b) => a[1] - b[1]).slice(0, 3);
      for (const [j] of near) { if (!n.links.includes(j)) n.links.push(j); if (!nodes[j].links.includes(i)) nodes[j].links.push(i); }
    });
    const capital = [0, 25];
    capital.forEach((c, team) => {
      const own = [c, ...nodes[c].links.slice().sort((a, b) => Math.hypot(nodes[a].x - nodes[c].x, nodes[a].y - nodes[c].y) - Math.hypot(nodes[b].x - nodes[c].x, nodes[b].y - nodes[c].y)).slice(0, 2)];
      for (const k of own) { nodes[k].team = team; nodes[k].prog = team === 0 ? 1 : -1; }
    });
    return capital;
  }
  const CAPITALS = place();

  // ---- the bodies
  function spawn(team, kind, x, y, dest) {
    if (U.count[team] >= CAP_UNITS && kind < FIRST_SHIP) return -1;
    const i = U.free.length ? U.free.pop() : U.hi < N ? U.hi++ : -1; if (i < 0) return -1;
    U.x[i] = x; U.y[i] = y; U.vx[i] = 0; U.vy[i] = 0; U.hp[i] = KINDS[kind].hp; U.kind[i] = kind; U.team[i] = team; U.alive[i] = 1;
    U.cd[i] = rng() * 0.5; U.stun[i] = 0; U.target[i] = -1; U.dest[i] = dest; U.count[team]++;
    return i;
  }
  function kill(i, by) {
    if (!U.alive[i]) return;
    const team = U.team[i], k = U.kind[i];
    U.alive[i] = 0; U.count[team]--; U.free.push(i);
    if (by >= 0 && by !== team) S.stats.kills[by]++;
    if (k >= FIRST_SHIP) { const sh = ships[team][k - FIRST_SHIP]; sh.i = -1; sh.back = S.time + SHIP_BACK; S.events.push({ t: 'shipDown', team, slot: k - FIRST_SHIP, x: U.x[i], y: U.y[i] }); }
    else if (S.events.length < 1500) S.events.push({ t: 'die', team, kind: k, x: U.x[i], y: U.y[i] });
  }

  // ---- THE BATTLESHIPS: { i: the body (-1 rebuilding), back, cd: [two powers], auto, steer, dome }
  const ships = [0, 1].map((team) => SHIPS.map((s, slot) => ({ team, slot, i: -1, back: 0, cd: [4, 8], auto: true, steer: [0, 0], dome: 0 })));
  function launchShip(team, slot) {
    const c = nodes[CAPITALS[team]]; if (c.team !== team) return;
    const a = (slot / 4) * Math.PI * 2, x = c.x + Math.cos(a) * 260, y = c.y + Math.sin(a) * 260;
    const sh = ships[team][slot], i = spawn(team, FIRST_SHIP + slot, x, y, CAPITALS[team]);
    if (i >= 0) { sh.i = i; sh.steer = [x, y]; S.events.push({ t: 'shipUp', team, slot, x, y }); }
  }

  // ---- THE GRID: a counting sort of every body into 160-wu cells, rebuilt every tick
  const cols = Math.ceil(W / CELL), rows = Math.ceil(H / CELL), start = new Int32Array(cols * rows + 1), items = new Int32Array(N), cellOf = new Int32Array(N);
  function buildGrid() {
    start.fill(0);
    for (let i = 0; i < U.hi; i++) { if (!U.alive[i]) { cellOf[i] = -1; continue; } const c = Math.min(cols - 1, Math.max(0, (U.x[i] / CELL) | 0)) + Math.min(rows - 1, Math.max(0, (U.y[i] / CELL) | 0)) * cols; cellOf[i] = c; start[c + 1]++; }
    for (let c = 0; c < cols * rows; c++) start[c + 1] += start[c];
    const fill = start.slice(0, cols * rows);
    for (let i = 0; i < U.hi; i++) if (cellOf[i] >= 0) items[fill[cellOf[i]]++] = i;
  }
  // every body within r of (x, y), handed to fn(j, d2); fn returns true to stop
  function near(x, y, r, fn) {
    const c0 = Math.max(0, ((x - r) / CELL) | 0), c1 = Math.min(cols - 1, ((x + r) / CELL) | 0), r0 = Math.max(0, ((y - r) / CELL) | 0), r1 = Math.min(rows - 1, ((y + r) / CELL) | 0), r2 = r * r;
    for (let cy = r0; cy <= r1; cy++) for (let cx = c0; cx <= c1; cx++) {
      const c = cx + cy * cols;
      for (let p = start[c]; p < start[c + 1]; p++) { const j = items[p], dx = U.x[j] - x, dy = U.y[j] - y, d2 = dx * dx + dy * dy; if (d2 < r2 && fn(j, d2)) return; }
    }
  }
  function countNear(x, y, r, team) { let n = 0; near(x, y, r, (j) => { if (U.team[j] === team) n += U.kind[j] >= FIRST_SHIP ? 6 : 1; return false; }); return n; }

  // ---- damage, the one door: a dome over the victim takes 60% off
  function hurt(i, dmg, by) {
    if (!U.alive[i]) return;
    const team = U.team[i];
    for (const sh of ships[team]) if (sh.i >= 0 && sh.dome > S.time) { const dx = U.x[sh.i] - U.x[i], dy = U.y[sh.i] - U.y[i]; if (dx * dx + dy * dy < 520 * 520) { dmg *= 0.4; break; } }
    U.hp[i] -= dmg;
    if (U.hp[i] <= 0) kill(i, by);
  }
  function blast(x, y, r, dmg, by) { near(x, y, r, (j) => { if (U.team[j] !== by) hurt(j, dmg, by); return false; }); if (S.events.length < 1500) S.events.push({ t: 'boom', x, y, r, team: by }); }
  function shot(x1, y1, x2, y2, team, kind) { if (S.events.length < 1500) S.events.push({ t: 'shot', x1, y1, x2, y2, team, kind }); }

  // ---- THE BRAIN of a side (both sides, every second): which outposts it wants. Defend what is under attack, else take the
  // outposts bordering its land, nearest its centre first and neutral before enemy-held; a rally puts the commander's outpost first
  const goals = [[], []];
  function think(team) {
    const own = nodes.map((n, k) => k).filter((k) => nodes[k].team === team);
    if (!own.length) { goals[team] = []; return; }
    let cx = 0, cy = 0; for (const k of own) { cx += nodes[k].x; cy += nodes[k].y; } cx /= own.length; cy /= own.length;
    const threatened = own.filter((k) => countNear(nodes[k].x, nodes[k].y, 600, 1 - team) > 4).sort((a, b) => countNear(nodes[b].x, nodes[b].y, 600, 1 - team) - countNear(nodes[a].x, nodes[a].y, 600, 1 - team));
    const border = new Set(); for (const k of own) for (const j of nodes[k].links) if (nodes[j].team !== team) border.add(j);
    const cands = (border.size ? [...border] : nodes.map((n, k) => k).filter((k) => nodes[k].team !== team))
      .map((k) => [k, Math.hypot(nodes[k].x - cx, nodes[k].y - cy) + (nodes[k].team < 0 ? 0 : 700) + countNear(nodes[k].x, nodes[k].y, 500, 1 - team) * 25]).sort((a, b) => a[1] - b[1]).map(([k]) => k);
    const g = [...threatened.slice(0, 2), ...cands].filter((k, i, a) => a.indexOf(k) === i).slice(0, 3);
    if (S.rally[team] >= 0) { if (S.time > S.rallyUntil[team]) S.rally[team] = -1; else { g.unshift(S.rally[team]); g.splice(3); } }
    goals[team] = g;
  }
  // a body's goal: the rally takes three in five; the others go to the nearest of the side's goals
  function goalFor(team, i, x, y) {
    const g = goals[team]; if (!g.length) return -1;
    if (S.rally[team] >= 0 && i % 5 < 3) return S.rally[team];
    let best = g[0], bd = Infinity; for (const k of g) { const d = Math.hypot(nodes[k].x - x, nodes[k].y - y); if (d < bd) { bd = d; best = k; } }
    return best;
  }

  // ---- THE OUTPOSTS: build, shoot, mend, change hands
  function stepNodes(dt) {
    nodes.forEach((n, k) => {
      if (n.team < 0) return;
      const spec = OUTPOSTS[n.kind];
      n.built += dt;
      const every = spec.every * (1.3 - 0.15 * n.size) * BUILD_PACE;
      if (n.built >= every) {
        n.built -= every;
        const [kind, count] = spec.build[n.step++ % spec.build.length];
        for (let c = 0; c < count; c++) { const a = rng() * 6.283, i = spawn(n.team, kind, n.x + Math.cos(a) * 70, n.y + Math.sin(a) * 70, -1); if (i >= 0) { U.dest[i] = goalFor(n.team, i, n.x, n.y); S.stats.built[n.team]++; } }
      }
      if (spec.mends) near(n.x, n.y, 320, (j) => { if (U.team[j] === n.team && U.kind[j] < FIRST_SHIP) U.hp[j] = Math.min(KINDS[U.kind[j]].hp, U.hp[j] + KINDS[U.kind[j]].hp * 0.06 * dt); return false; });
      // its guns: the nearest enemy in reach, unless an EMP has silenced it
      n.cd -= dt;
      if (n.cd <= 0 && n.silent < S.time) {
        const gun = n.kind === 'CAPITAL' ? CAPITAL_GUN : GUN;
        let best = -1, bd = gun.range * gun.range;
        near(n.x, n.y, gun.range, (j, d2) => { if (U.team[j] !== n.team && d2 < bd) { bd = d2; best = j; } return false; });
        if (best >= 0) { hurt(best, gun.dmg * (n.kind === 'CAPITAL' ? 1 : n.size), n.team); shot(n.x, n.y, U.x[best], U.y[best], n.team, -1); n.cd = 1 / gun.rate; }
      }
    });
  }
  function stepControl(dt) {
    nodes.forEach((n, k) => {
      const w = countNear(n.x, n.y, CAP_R, 0), e = countNear(n.x, n.y, CAP_R, 1);
      if ((w > 0) === (e > 0)) return;   // nobody, or both: it holds
      const dir = w > 0 ? 1 : -1, rate = TAKE_RATE * Math.min(1, (w || e) / 8) * (n.kind === 'CAPITAL' ? 0.35 : 1);
      const before = n.prog; n.prog = Math.max(-1, Math.min(1, n.prog + dir * rate * dt));
      if (n.team >= 0 && (n.team === 0 ? n.prog <= 0 : n.prog >= 0) && before !== n.prog) { const was = n.team; n.team = -1; S.events.push({ t: 'lost', node: k, team: was, x: n.x, y: n.y }); }
      if (n.team < 0 && Math.abs(n.prog) >= 1) {
        n.team = n.prog > 0 ? 0 : 1; n.built = 0; S.stats.taken[n.team]++;
        S.events.push({ t: 'taken', node: k, team: n.team, x: n.x, y: n.y, kind: n.kind });
        if (k === CAPITALS[1 - n.team]) S.result = { winner: n.team, why: 'capital', time: S.time };
      }
    });
  }

  // ---- a body's tick: look, move, keep apart, fire
  function retarget(i) {
    const k = KINDS[U.kind[i]], team = U.team[i], aggro = Math.max(k.range * 1.3, 300);
    let best = -1, score = Infinity;
    near(U.x[i], U.y[i], aggro, (j, d2) => {
      if (U.team[j] === team) return false;
      if (k.minRange && d2 < k.minRange * k.minRange) return false;
      const sc = k.hunts ? -U.hp[j] + d2 * 0.0005 : d2;
      if (sc < score) { score = sc; best = j; }
      return false;
    });
    if (best < 0) { for (let n = 0; n < nodes.length; n++) { const o = nodes[n]; if (o.team === 1 - team && Math.hypot(o.x - U.x[i], o.y - U.y[i]) < aggro) { best = -2 - n; break; } } }
    U.target[i] = best;
  }
  function targetXY(i) { const t = U.target[i]; if (t >= 0) return U.alive[t] && U.team[t] !== U.team[i] ? [U.x[t], U.y[t]] : null; if (t <= -2) { const n = nodes[-2 - t]; return n.team === 1 - U.team[i] ? [n.x, n.y] : null; } return null; }
  function fire(i, k, t) {
    const team = U.team[i];
    if (t <= -2) {   // a body firing on an enemy outpost drains its control a little toward its side and silences its guns briefly
      const n = nodes[-2 - t]; n.prog += (team === 0 ? 1 : -1) * k.dmg * 0.0004; n.prog = Math.max(-1, Math.min(1, n.prog)); shot(U.x[i], U.y[i], n.x, n.y, team, U.kind[i]); return;
    }
    if (k.shell) { S.shells.push({ x: U.x[t], y: U.y[t], at: S.time + k.shell, r: k.splash, dmg: k.dmg, team }); shot(U.x[i], U.y[i], U.x[t], U.y[t], team, U.kind[i]); return; }
    shot(U.x[i], U.y[i], U.x[t], U.y[t], team, U.kind[i]);
    if (k.splash) blast(U.x[t], U.y[t], k.splash, k.dmg, team); else hurt(t, k.dmg, team);
  }
  function stepBody(i, dt) {
    const kind = U.kind[i], k = KINDS[kind], team = U.team[i], ship = kind >= FIRST_SHIP;
    if (U.stun[i] > 0) U.stun[i] -= dt;
    if ((S.tick + i) % 8 === 0 || (U.target[i] !== -1 && !targetXY(i))) retarget(i);
    const tp = targetXY(i);
    let gx, gy, stop;
    if (ship) { const sh = ships[team][kind - FIRST_SHIP]; gx = sh.steer[0]; gy = sh.steer[1]; stop = 20; }
    else if (tp) { gx = tp[0]; gy = tp[1]; stop = k.range * 0.85; }
    else {
      let d = U.dest[i];
      if (d < 0 || (nodes[d].team === team && !goals[team].includes(d))) { d = U.dest[i] = goalFor(team, i, U.x[i], U.y[i]); }
      if (d < 0) { gx = U.x[i]; gy = U.y[i]; stop = 1; }
      else { const a = (i * 2.399) % 6.283, rr = 60 + (i % 7) * 30; gx = nodes[d].x + Math.cos(a) * rr; gy = nodes[d].y + Math.sin(a) * rr; stop = 25; }
    }
    const dx = gx - U.x[i], dy = gy - U.y[i], dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const spd = k.speed * (U.stun[i] > 0 ? 0.15 : 1);
    let wx = 0, wy = 0;
    if (dist > stop) { wx = (dx / dist) * spd; wy = (dy / dist) * spd; }
    if (!ship) {   // keep apart: the bodies of one's own cell, ten at most
      const c = cellOf[i]; let seen = 0;
      if (c >= 0) for (let p = start[c]; p < start[c + 1] && seen < 10; p++) {
        const j = items[p]; if (j === i || !U.alive[j]) continue; seen++;
        const ex = U.x[i] - U.x[j], ey = U.y[i] - U.y[j], rr = k.r + KINDS[U.kind[j]].r, d2 = ex * ex + ey * ey;
        if (d2 < rr * rr) { const d = Math.sqrt(d2) || 0.5, push = (rr - d) * 6; wx += (d2 > 0.01 ? ex / d : Math.cos(i)) * push; wy += (d2 > 0.01 ? ey / d : Math.sin(i)) * push; }
      }
    }
    const ease = Math.min(1, dt * (ship ? 3 : 8));
    U.vx[i] += (wx - U.vx[i]) * ease; U.vy[i] += (wy - U.vy[i]) * ease;
    U.x[i] = Math.max(20, Math.min(W - 20, U.x[i] + U.vx[i] * dt)); U.y[i] = Math.max(20, Math.min(H - 20, U.y[i] + U.vy[i] * dt));
    // fire
    U.cd[i] -= dt;
    if (k.heal && (S.tick + i) % 15 === 0) near(U.x[i], U.y[i], k.healR, (j) => { if (U.team[j] === team && U.kind[j] < FIRST_SHIP) U.hp[j] = Math.min(KINDS[U.kind[j]].hp, U.hp[j] + k.heal * 0.5); return false; });
    if (U.cd[i] <= 0 && U.stun[i] <= 0 && U.target[i] !== -1 && tp) {
      const ex = tp[0] - U.x[i], ey = tp[1] - U.y[i];
      if (ex * ex + ey * ey <= (k.range + 40) * (k.range + 40)) { fire(i, k, U.target[i]); U.cd[i] = 1 / k.rate; }
    }
    if (ship) { const top = k.hp, home = nodes[CAPITALS[team]], atHome = Math.hypot(home.x - U.x[i], home.y - U.y[i]) < 700; if (U.hp[i] < top) U.hp[i] = Math.min(top, U.hp[i] + top * (atHome ? 0.04 : 0.008) * dt); }
  }

  // ---- THE POWERS: each needs no aim - it reads the battle around its ship (a WARP flies toward the ship's steer point)
  function densest(x, y, r, team) {   // the enemy body with the most of its side around it, within r
    let best = -1, most = 0;
    near(x, y, r, (j) => { if (U.team[j] === team || (j % 3)) return false; const c = countNear(U.x[j], U.y[j], 220, 1 - team); if (c > most) { most = c; best = j; } return false; });
    return best;
  }
  function enemiesNear(x, y, r, team, max) { const out = []; near(x, y, r, (j) => { if (U.team[j] !== team) out.push(j); return out.length >= max; }); return out; }
  function power(team, slot, k) {
    const sh = ships[team][slot], i = sh.i; if (i < 0 || sh.cd[k] > 0 || U.stun[i] > 0) return false;
    const name = SHIPS[slot].powers[k], x = U.x[i], y = U.y[i];
    switch (name) {
      case 'BROADSIDE': { const t = enemiesNear(x, y, 750, team, 16); if (!t.length) return false; t.forEach((j, n) => S.shells.push({ x: U.x[j], y: U.y[j], at: S.time + 0.3 + n * 0.04, r: 70, dmg: 95, team })); break; }
      case 'DOME': sh.dome = S.time + 8; break;
      case 'LAUNCH': for (let n = 0; n < 24; n++) { const a = (n / 24) * 6.283, j = spawn(team, 0, x + Math.cos(a) * 80, y + Math.sin(a) * 80, goalFor(team, n, x, y)); if (j >= 0) { U.vx[j] = Math.cos(a) * 300; U.vy[j] = Math.sin(a) * 300; } } break;
      case 'REPAIR': near(x, y, 650, (j) => { if (U.team[j] === team) U.hp[j] = Math.min(KINDS[U.kind[j]].hp, U.hp[j] + KINDS[U.kind[j]].hp * (j === i ? 0.25 : 0.5)); return false; }); break;
      case 'WARP': { const dx = sh.steer[0] - x, dy = sh.steer[1] - y, d = Math.hypot(dx, dy); if (d < 200) return false; const jump = Math.min(1600, d); U.x[i] = Math.max(40, Math.min(W - 40, x + (dx / d) * jump)); U.y[i] = Math.max(40, Math.min(H - 40, y + (dy / d) * jump)); S.events.push({ t: 'warp', team, x1: x, y1: y, x2: U.x[i], y2: U.y[i] }); break; }
      case 'TORPEDO': { const j = densest(x, y, 1300, team); if (j < 0) return false; S.shells.push({ x: U.x[j], y: U.y[j], at: S.time + 0.8, r: 260, dmg: 320, team, big: true }); shot(x, y, U.x[j], U.y[j], team, -2); break; }
      case 'BOMBARD': { const t = enemiesNear(x, y, 950, team, 60); if (!t.length) return false; for (let n = 0; n < 36; n++) { const j = t[(rng() * t.length) | 0]; S.shells.push({ x: U.x[j] + (rng() - 0.5) * 120, y: U.y[j] + (rng() - 0.5) * 120, at: S.time + 0.2 + n * 0.08, r: 80, dmg: 70, team }); } break; }
      case 'EMP': near(x, y, 650, (j) => { if (U.team[j] !== team) U.stun[j] = Math.max(U.stun[j], U.kind[j] >= FIRST_SHIP ? 1.5 : 3); return false; }); for (const n of nodes) if (n.team === 1 - team && Math.hypot(n.x - x, n.y - y) < 650) n.silent = S.time + 4; break;
    }
    sh.cd[k] = SHIPS[slot].cds[k];
    S.events.push({ t: 'power', team, slot, k, name, x, y });
    return true;
  }

  // ---- THE PILOT: a battleship on its own flies to the nearest of its side's goals where the fight is, rides a little behind it,
  // goes home to mend under a third, and fires its powers when the battle around it is worth them
  function pilot(sh) {
    const i = sh.i, team = sh.team; if (i < 0) return;
    const x = U.x[i], y = U.y[i], k = SHIPS[sh.slot], home = nodes[CAPITALS[team]];
    if (U.hp[i] < k.hp * 0.3) { sh.steer = [home.x, home.y]; return; }
    let best = -1, bd = Infinity;
    for (const g of goals[team]) { const d = Math.hypot(nodes[g].x - x, nodes[g].y - y) - countNear(nodes[g].x, nodes[g].y, 700, 1 - team) * 30; if (d < bd) { bd = d; best = g; } }
    if (best >= 0) { const n = nodes[best], hx = home.x - n.x, hy = home.y - n.y, hd = Math.hypot(hx, hy) || 1, off = 260 + sh.slot * 60; sh.steer = [n.x + (hx / hd) * off, n.y + (hy / hd) * off]; }
    const foes = countNear(x, y, 750, 1 - team), friends = countNear(x, y, 520, team);
    const want = { BROADSIDE: foes >= 8, DOME: friends >= 15 && foes >= 10, LAUNCH: true, REPAIR: U.hp[i] < k.hp * 0.55 || friends >= 25, WARP: Math.hypot(sh.steer[0] - x, sh.steer[1] - y) > 2500, TORPEDO: foes >= 10, BOMBARD: foes >= 12, EMP: foes >= 18 };
    for (let p = 0; p < 2; p++) if (sh.cd[p] <= 0 && want[k.powers[p]]) power(team, sh.slot, p);
  }

  // ---- THE COMMANDS
  function apply(c) {
    if (!c || S.result) return false;
    const team = c.team | 0; if (team < 0 || team > 1) return false;
    if (c.op === 'rally') { const k = c.node | 0; if (k < 0 || k >= nodes.length) return false; S.rally[team] = k; S.rallyUntil[team] = S.time + 45; think(team); for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === team && U.kind[i] < FIRST_SHIP && i % 5 < 3) U.dest[i] = k; S.events.push({ t: 'rally', team, node: k }); return true; }
    if (c.op === 'unrally') { S.rally[team] = -1; think(team); return true; }
    const sh = ships[team][c.slot | 0]; if (!sh) return false;
    if (c.op === 'move') { sh.steer = [Math.max(40, Math.min(W - 40, +c.x)), Math.max(40, Math.min(H - 40, +c.y))]; sh.auto = false; return true; }
    if (c.op === 'auto') { sh.auto = !!c.on; return true; }
    if (c.op === 'power') return power(team, sh.slot, c.k | 0);
    return false;
  }

  // ---- the tick
  function step() {
    if (S.result) return;
    const dt = TICK; S.events.length = 0; S.tick++; S.time += dt;
    if (S.tick === 1) {   // the opening: four battleships and a vanguard at each capital
      for (let team = 0; team < 2; team++) { for (let s = 0; s < 4; s++) launchShip(team, s); think(team); const c = nodes[CAPITALS[team]]; for (let n = 0; n < 40; n++) { const a = rng() * 6.283, kind = [0, 0, 1, 2, 5][n % 5], i = spawn(team, kind, c.x + Math.cos(a) * 200, c.y + Math.sin(a) * 200, -1); if (i >= 0) U.dest[i] = goalFor(team, i, c.x, c.y); } }
    }
    while (S.queue.length) apply(S.queue.shift());
    if (S.tick % 30 === 1) { think(0); think(1); }
    buildGrid();
    for (let team = 0; team < 2; team++) for (const sh of ships[team]) {
      for (let p = 0; p < 2; p++) sh.cd[p] = Math.max(0, sh.cd[p] - dt);
      if (sh.i < 0 && S.time >= sh.back) launchShip(team, sh.slot);
      else if (sh.auto && S.tick % 15 === sh.slot) pilot(sh);
    }
    const hi = U.hi; for (let i = 0; i < hi; i++) if (U.alive[i]) stepBody(i, dt);
    for (let s = S.shells.length - 1; s >= 0; s--) { const sl = S.shells[s]; if (S.time >= sl.at) { blast(sl.x, sl.y, sl.r, sl.dmg, sl.team); S.shells.splice(s, 1); } }
    stepNodes(dt);
    if (S.tick % 5 === 0) stepControl(dt * 5);
    while (U.hi > 0 && !U.alive[U.hi - 1]) { U.hi--; const f = U.free.lastIndexOf(U.hi); if (f >= 0) U.free.splice(f, 1); }
    if (!S.result && S.time >= CLOCK) { const a = nodes.filter((n) => n.team === 0).length, b = nodes.filter((n) => n.team === 1).length; S.result = { winner: a === b ? -1 : a > b ? 0 : 1, why: 'clock', time: S.time }; }
    if (S.result) S.events.push({ t: 'end', winner: S.result.winner, why: S.result.why });
  }

  return {
    S, U, nodes, ships, goals, CAPITALS, KINDS, FIRST_SHIP, step, apply, queue: (c) => S.queue.push(c),
    get time() { return S.time; }, get result() { return S.result; }, get events() { return S.events; },
    owned: (team) => nodes.filter((n) => n.team === team).length,
  };
}
