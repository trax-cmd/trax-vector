// sim.js — THE WORLD. Pure: no DOM, no clock of its own, no randomness but its seed. Fixed ticks,
// commands applied at tick boundaries, every body in flat typed arrays. The same file runs in the
// browser and in Node, which is what lets a bot play it, a tool balance it and a replay reproduce it.
import { rng32 } from './rng.js';
import { Grid } from './grid.js';
import { compileAll } from './units.js';
import { LIBRARY } from './library.js';

export const TICK = 1 / 30;
export const DEFAULTS = {
  W: 4000, H: 2400,                // the field, in world units
  towersPerSide: 5, towerHp: 1500, towerR: 60,
  energy0: 600, incomePerTower: 8,  // a shared pool a side; each living tower pays into it every second
  clock: 480,                       // seconds; at the bell the side with more tower hp wins
  capUnits: 20000, capShots: 60000, capMines: 4000, cell: 64,
  seed: 1,
};

export function createSim(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const rng = rng32(o.seed);
  const kinds = compileAll(o.roster || LIBRARY);
  const N = o.capUnits, M = o.capShots, MM = o.capMines;

  // ---- the bodies: struct of arrays
  const U = {
    x: new Float32Array(N), y: new Float32Array(N), vx: new Float32Array(N), vy: new Float32Array(N),
    hp: new Float32Array(N), sh: new Float32Array(N), cd: new Float32Array(N), age: new Float32Array(N), ph: new Float32Array(N), stun: new Float32Array(N),
    kind: new Uint16Array(N), team: new Uint8Array(N), alive: new Uint8Array(N), target: new Int32Array(N), goal: new Int16Array(N), home: new Int16Array(N),
    hi: 0, free: [], count: [0, 0],
  };
  // ---- the shots
  const P = {
    x: new Float32Array(M), y: new Float32Array(M), vx: new Float32Array(M), vy: new Float32Array(M), life: new Float32Array(M),
    kind: new Uint16Array(M), team: new Uint8Array(M), alive: new Uint8Array(M), target: new Int32Array(M),
    hi: 0, free: [],
  };
  // ---- the mines
  const MN = { x: new Float32Array(MM), y: new Float32Array(MM), kind: new Uint16Array(MM), team: new Uint8Array(MM), alive: new Uint8Array(MM), hi: 0, free: [] };
  // ---- the towers: five a side in an arc, the player's on the west
  const T = { x: [], y: [], team: [], hp: [], alive: [], n: 0 };
  {
    const ys = [0.18, 0.34, 0.5, 0.66, 0.82], xs = [0.095, 0.14, 0.16, 0.14, 0.095];
    for (let side = 0; side < 2; side++) for (let i = 0; i < o.towersPerSide; i++) {
      const x = o.W * xs[i % 5], y = o.H * ys[i % 5];
      T.x.push(side ? o.W - x : x); T.y.push(y); T.team.push(side); T.hp.push(o.towerHp); T.alive.push(1); T.n++;
    }
  }
  const grid = new Grid(o.W, o.H, o.cell, N);
  const S = {
    o, rng, kinds, U, P, MN, T, grid,
    energy: [o.energy0, o.energy0],
    tick: 0, time: 0, events: [], queue: [], result: null,
    stats: { deployed: [0, 0], kills: [0, 0], spent: [0, 0], towerDmg: [0, 0] },
  };
  const EV_CAP = 2400;   // the renderer cannot show more than this a tick; the sim never allocates past it
  const ev = (e) => { if (S.events.length < EV_CAP) S.events.push(e); };

  // ---- slots
  function allocUnit() { if (U.free.length) return U.free.pop(); if (U.hi >= N) return -1; return U.hi++; }
  function allocShot() { if (P.free.length) return P.free.pop(); if (P.hi >= M) return -1; return P.hi++; }
  function allocMine() { if (MN.free.length) return MN.free.pop(); if (MN.hi >= MM) return -1; return MN.hi++; }

  function spawnUnit(team, kind, x, y, goal, home) {
    const i = allocUnit(); if (i < 0) return -1;
    const k = kinds[kind];
    U.x[i] = x; U.y[i] = y; U.vx[i] = 0; U.vy[i] = 0;
    U.hp[i] = k.hp; U.sh[i] = k.shieldMax; U.cd[i] = rng() * 0.5; U.age[i] = 0; U.ph[i] = rng() * 6.283; U.stun[i] = 0;
    U.kind[i] = kind; U.team[i] = team; U.alive[i] = 1; U.target[i] = -1; U.goal[i] = goal; U.home[i] = home;
    U.count[team]++;
    return i;
  }
  function killUnit(i, byTeam) {
    if (!U.alive[i]) return;
    const k = kinds[U.kind[i]], team = U.team[i];
    U.alive[i] = 0; U.count[team]--; U.free.push(i);
    if (byTeam >= 0 && byTeam !== team) S.stats.kills[byTeam]++;
    ev({ t: 'death', x: U.x[i], y: U.y[i], team, kind: k.index, r: k.r });
    if (k.traits.split && k.splitIndex >= 0) {
      for (let j = 0; j < k.splitN; j++) {
        const a = rng() * 6.283, d = 6 + rng() * 14;
        const c = spawnUnit(team, k.splitIndex, U.x[i] + Math.cos(a) * d, U.y[i] + Math.sin(a) * d, U.goal[i], U.home[i]);
        if (c >= 0) { U.vx[c] = Math.cos(a) * 120; U.vy[c] = Math.sin(a) * 120; }
      }
    }
  }

  // ---- damage, the one door
  function hurt(i, dmg, byTeam, hx, hy) {
    if (!U.alive[i] || dmg <= 0) return;
    if (U.sh[i] > 0) { const a = Math.min(U.sh[i], dmg); U.sh[i] -= a; dmg -= a; if (dmg <= 0) { ev({ t: 'shield', x: hx, y: hy, team: U.team[i] }); return; } }
    U.hp[i] -= dmg;
    ev({ t: 'hit', x: hx, y: hy, team: U.team[i], dmg });
    if (U.hp[i] <= 0) killUnit(i, byTeam);
  }
  function hurtTower(t, dmg, byTeam) {
    if (!T.alive[t]) return;
    T.hp[t] -= dmg; S.stats.towerDmg[byTeam] += dmg;
    ev({ t: 'towerHit', x: T.x[t], y: T.y[t], team: T.team[t] });
    if (T.hp[t] <= 0) { T.hp[t] = 0; T.alive[t] = 0; ev({ t: 'towerDown', x: T.x[t], y: T.y[t], team: T.team[t] }); }
  }
  // area damage on the other side, with linear falloff
  function blast(x, y, r, dmg, team, byTeam) {
    grid.near(x, y, r, (j) => {
      if (U.team[j] === team || !U.alive[j]) return false;
      const dx = U.x[j] - x, dy = U.y[j] - y, d = Math.sqrt(dx * dx + dy * dy);
      if (d < r + kinds[U.kind[j]].r) hurt(j, dmg * (1 - Math.max(0, d - 20) / (r + 1)), byTeam, U.x[j], U.y[j]);
      return false;
    });
    for (let t = 0; t < T.n; t++) if (T.alive[t] && T.team[t] !== team) { const dx = T.x[t] - x, dy = T.y[t] - y; if (dx * dx + dy * dy < (r + o.towerR) * (r + o.towerR)) hurtTower(t, dmg * 0.6, byTeam); }
  }

  // ---- commands
  // { op:'deploy', team, tower, kind, goal }  kind: roster index or id; tower: index of a tower the side owns; goal: an enemy tower index (default: the nearest living one)
  function apply(cmd) {
    if (S.result) return false;
    if (cmd.op !== 'deploy') return false;
    const team = cmd.team | 0;
    const kind = typeof cmd.kind === 'string' ? kinds.findIndex((k) => k.id === cmd.kind) : cmd.kind | 0;
    const k = kinds[kind]; if (!k) return false;
    const tw = cmd.tower | 0; if (tw < 0 || tw >= T.n || T.team[tw] !== team || !T.alive[tw]) return false;
    if (S.energy[team] < k.cost) return false;
    let goal = cmd.goal === undefined || cmd.goal === null ? -1 : cmd.goal | 0;
    if (goal < 0 || goal >= T.n || T.team[goal] === team || !T.alive[goal]) goal = nearestEnemyTower(team, T.x[tw], T.y[tw]);
    const a = rng() * 6.283, d = o.towerR + 20 + rng() * 60;
    const i = spawnUnit(team, kind, T.x[tw] + Math.cos(a) * d, T.y[tw] + Math.sin(a) * d, goal, tw);
    if (i < 0) return false;
    S.energy[team] -= k.cost; S.stats.spent[team] += k.cost; S.stats.deployed[team]++;
    ev({ t: 'deploy', x: U.x[i], y: U.y[i], team, kind });
    return true;
  }
  function nearestEnemyTower(team, x, y) {
    let best = -1, bd = Infinity;
    for (let t = 0; t < T.n; t++) { if (!T.alive[t] || T.team[t] === team) continue; const dx = T.x[t] - x, dy = T.y[t] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = t; } }
    return best;
  }

  // ---- targeting: the nearest enemy body inside the aggro ring, else the goal tower
  let qx = 0, qy = 0, qteam = 0, qbest = -1, qbd = 0, qcloakR = 120 * 120;
  const pickNearest = (j) => {
    if (U.team[j] === qteam || !U.alive[j]) return false;
    const dx = U.x[j] - qx, dy = U.y[j] - qy, d = dx * dx + dy * dy;
    if (d >= qbd) return false;
    if (kinds[U.kind[j]].traits.cloak && d > qcloakR && U.cd[j] > 0.3) return false;   // a cloaked body is seen only up close, or when it just fired
    qbd = d; qbest = j; return false;
  };
  function retarget(i, k) {
    qx = U.x[i]; qy = U.y[i]; qteam = U.team[i]; qbest = -1; qbd = k.aggro * k.aggro;
    grid.near(qx, qy, k.aggro, pickNearest);
    if (qbest >= 0) { U.target[i] = qbest; return; }
    let g = U.goal[i];
    if (g < 0 || !T.alive[g]) { g = nearestEnemyTower(qteam, qx, qy); U.goal[i] = g; }
    U.target[i] = g < 0 ? -1 : -2 - g;
  }
  // where a target is; returns false if it is gone
  let tx = 0, ty = 0, tr = 0;
  function targetPos(i) {
    const t = U.target[i];
    if (t >= 0) { if (!U.alive[t] || U.team[t] === U.team[i]) return false; tx = U.x[t]; ty = U.y[t]; tr = kinds[U.kind[t]].r; return true; }
    if (t <= -2) { const g = -2 - t; if (!T.alive[g]) return false; tx = T.x[g]; ty = T.y[g]; tr = o.towerR; return true; }
    return false;
  }

  // ---- movement
  let sx = 0, sy = 0, si = 0, sr = 0, sn = 0, steam = 0, cx = 0, cy = 0, cn = 0;
  const separate = (j) => {
    if (j === si || !U.alive[j]) return false;
    const dx = U.x[si] - U.x[j], dy = U.y[si] - U.y[j], d2 = dx * dx + dy * dy, m = sr + kinds[U.kind[j]].r;
    if (U.team[j] === steam && U.kind[j] === U.kind[si]) { cx += U.x[j]; cy += U.y[j]; cn++; }
    if (d2 < m * m && d2 > 0.01) { const d = Math.sqrt(d2), p = (m - d) / d; sx += dx * p; sy += dy * p; }
    return ++sn >= 10;
  };
  function move(i, k, dt) {
    const has = targetPos(i);
    let dx = 0, dy = 0, dist = 1;
    if (has) { dx = tx - U.x[i]; dy = ty - U.y[i]; dist = Math.sqrt(dx * dx + dy * dy) || 1; dx /= dist; dy /= dist; }
    const range = k.w.range, spd = k.speed;
    let wx = 0, wy = 0;   // the wanted velocity
    const age = U.age[i], ph = U.ph[i];
    switch (k.move) {
      case 'march': if (has && dist > range * 0.85) { wx = dx * spd; wy = dy * spd; } break;
      case 'zigzag': if (has && dist > range * 0.85) { const s = Math.sin(age * 5 + ph) * 0.7; wx = (dx - dy * s) * spd; wy = (dy + dx * s) * spd; } break;
      case 'orbit': if (has) { if (dist > range * 0.9) { wx = dx * spd; wy = dy * spd; } else { const s = ph > 3.14 ? 1 : -1; wx = -dy * s * spd * 0.8 + dx * (dist - range * 0.7) * 2; wy = dx * s * spd * 0.8 + dy * (dist - range * 0.7) * 2; } } break;
      case 'swarm': if (has && dist > range * 0.8) { wx = dx * spd; wy = dy * spd; } if (cn) { const gx = cx / cn - U.x[i], gy = cy / cn - U.y[i]; wx += gx * 0.8; wy += gy * 0.8; } break;
      case 'hop': if (has && dist > range * 0.85) { const g = Math.sin(age * 3.2 + ph) > 0.1 ? 2.2 : 0; wx = dx * spd * g; wy = dy * spd * g; } break;
      case 'hold': { const h = U.home[i]; if (has && dist > range * 0.85 && U.target[i] >= 0) { wx = dx * spd; wy = dy * spd; } if (h >= 0) { const hx = T.x[h] - U.x[i], hy = T.y[h] - U.y[i], hd = Math.sqrt(hx * hx + hy * hy); if (hd > 260) { wx = hx / hd * spd; wy = hy / hd * spd; } } break; }
      case 'phase': if (has && dist > range * 0.85) { wx = dx * spd * 0.6; wy = dy * spd * 0.6; if (U.cd[i] < -2.6 && dist > 300) { const jump = Math.min(240, dist - range * 0.7); ev({ t: 'blink', x: U.x[i], y: U.y[i], x2: U.x[i] + dx * jump, y2: U.y[i] + dy * jump, team: U.team[i] }); U.x[i] += dx * jump; U.y[i] += dy * jump; U.cd[i] = 0.2; } } break;
    }
    // separation and the swarm's centre, from the grid, at most ten neighbours
    si = i; sr = k.r; sx = 0; sy = 0; sn = 0; steam = U.team[i]; cx = 0; cy = 0; cn = 0;
    grid.near(U.x[i], U.y[i], k.r * 2 + 8, separate);
    wx += sx * 40; wy += sy * 40;
    if (U.stun[i] > 0) { wx *= 0.05; wy *= 0.05; }
    const ease = Math.min(1, dt * (k.mass > 3 ? 4 : 9));
    U.vx[i] += (wx - U.vx[i]) * ease; U.vy[i] += (wy - U.vy[i]) * ease;
    let nx = U.x[i] + U.vx[i] * dt, ny = U.y[i] + U.vy[i] * dt;
    if (nx < 0) nx = 0; else if (nx > o.W) nx = o.W; if (ny < 0) ny = 0; else if (ny > o.H) ny = o.H;
    U.x[i] = nx; U.y[i] = ny;
    return has ? dist : Infinity;
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
    const w = k.w, team = U.team[i], x = U.x[i], y = U.y[i];
    switch (w.type) {
      case 'bolt': {
        const base = Math.atan2(ty - y, tx - x);
        for (let c = 0; c < w.count; c++) {
          const s = allocShot(); if (s < 0) break;
          const a = base + (w.count > 1 ? (c - (w.count - 1) / 2) * w.spread : 0) + (rng() - 0.5) * 0.04;
          P.x[s] = x; P.y[s] = y; P.vx[s] = Math.cos(a) * w.speed; P.vy[s] = Math.sin(a) * w.speed; P.life[s] = w.life; P.kind[s] = k.index; P.team[s] = team; P.alive[s] = 1; P.target[s] = -1;
        }
        ev({ t: 'shot', x, y, team, kind: k.index });
        break;
      }
      case 'missile': {
        for (let c = 0; c < w.count; c++) {
          const s = allocShot(); if (s < 0) break;
          const a = Math.atan2(ty - y, tx - x) + (rng() - 0.5) * 0.8;
          P.x[s] = x; P.y[s] = y; P.vx[s] = Math.cos(a) * w.speed; P.vy[s] = Math.sin(a) * w.speed; P.life[s] = (w.range / w.speed) * 2.2; P.kind[s] = k.index; P.team[s] = team; P.alive[s] = 1; P.target[s] = U.target[i];
        }
        ev({ t: 'shot', x, y, team, kind: k.index });
        break;
      }
      case 'beam': {
        ev({ t: 'beam', x, y, x2: tx, y2: ty, team, kind: k.index });
        const t = U.target[i];
        if (t >= 0) hurt(t, w.dmg, team, tx, ty); else if (t <= -2) hurtTower(-2 - t, w.dmg, team);
        if (w.pierce > 0) {   // the line goes on past the target for `pierce` more bodies
          const dx = (tx - x) / (dist || 1), dy = (ty - y) / (dist || 1); let left = w.pierce;
          grid.near((x + tx) / 2, (y + ty) / 2, w.range / 2 + 40, (j) => {
            if (left <= 0) return true;
            if (U.team[j] === team || !U.alive[j] || j === t) return false;
            const px = U.x[j] - x, py = U.y[j] - y, along = px * dx + py * dy;
            if (along < 0 || along > w.range) return false;
            const off = Math.abs(px * dy - py * dx); if (off > kinds[U.kind[j]].r + 6) return false;
            hurt(j, w.dmg * 0.7, team, U.x[j], U.y[j]); left--; return false;
          });
        }
        break;
      }
      case 'arc': {
        const t = U.target[i]; const pts = [x, y];
        let dmg = w.dmg; let lx, ly;
        if (t >= 0) { hurt(t, dmg, team, tx, ty); lx = tx; ly = ty; arcHit[0] = t; an = 1; }
        else if (t <= -2) { hurtTower(-2 - t, dmg, team); lx = tx; ly = ty; an = 0; }
        else break;
        pts.push(lx, ly);
        for (let h = 0; h < w.hops; h++) {
          dmg *= w.decay; ax = lx; ay = ly; ateam = team; abest = -1; abd = w.hopRange * w.hopRange;
          grid.near(ax, ay, w.hopRange, arcNext);
          if (abest < 0) break;
          hurt(abest, dmg, team, U.x[abest], U.y[abest]); if (an < 16) arcHit[an++] = abest;
          lx = U.x[abest]; ly = U.y[abest]; pts.push(lx, ly);
        }
        ev({ t: 'arc', pts, team, kind: k.index });
        break;
      }
      case 'pulse': {
        blast(x, y, w.range, w.dmg, team, team);
        if (k.traits.emp) grid.near(x, y, w.range, (j) => { if (U.team[j] !== team && U.alive[j]) { const dx = U.x[j] - x, dy = U.y[j] - y; if (dx * dx + dy * dy < w.range * w.range) U.stun[j] = Math.max(U.stun[j], 1.2); } return false; });
        ev({ t: 'pulse', x, y, r: w.range, team, kind: k.index, emp: !!k.traits.emp });
        break;
      }
      case 'mine': {
        const m = allocMine(); if (m < 0) break;
        MN.x[m] = x + (rng() - 0.5) * 30; MN.y[m] = y + (rng() - 0.5) * 30; MN.kind[m] = k.index; MN.team[m] = team; MN.alive[m] = 1;
        ev({ t: 'mine', x: MN.x[m], y: MN.y[m], team });
        break;
      }
      case 'spawn': {
        for (let c = 0; c < w.count; c++) {
          const a = rng() * 6.283, d = k.r + 10;
          const j = spawnUnit(team, k.childIndex, x + Math.cos(a) * d, y + Math.sin(a) * d, U.goal[i], U.home[i]);
          if (j >= 0) { U.vx[j] = Math.cos(a) * 160; U.vy[j] = Math.sin(a) * 160; }
        }
        ev({ t: 'spawnout', x, y, team, kind: k.index });
        break;
      }
      case 'aura': {
        const heal = w.dmg / w.rate;
        grid.near(x, y, w.range, (j) => { if (U.team[j] === team && U.alive[j] && j !== i) { const kk = kinds[U.kind[j]]; if (U.hp[j] < kk.hp) U.hp[j] = Math.min(kk.hp, U.hp[j] + heal); } return false; });
        ev({ t: 'aura', x, y, r: w.range, team, kind: k.index });
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
      if (w.type === 'missile') {   // homing: turn toward the target, or fly on
        const t = P.target[s]; let gx = 0, gy = 0, have = false;
        if (t >= 0 && U.alive[t] && U.team[t] !== team) { gx = U.x[t]; gy = U.y[t]; have = true; }
        else if (t <= -2 && T.alive[-2 - t]) { gx = T.x[-2 - t]; gy = T.y[-2 - t]; have = true; }
        else if (t >= 0) { P.target[s] = -1; }
        if (have) {
          const want = Math.atan2(gy - P.y[s], gx - P.x[s]), cur = Math.atan2(P.vy[s], P.vx[s]);
          let d = want - cur; while (d > Math.PI) d -= 6.283; while (d < -Math.PI) d += 6.283;
          const turn = Math.max(-w.turn * dt, Math.min(w.turn * dt, d)), a = cur + turn;
          P.vx[s] = Math.cos(a) * w.speed; P.vy[s] = Math.sin(a) * w.speed;
        }
      }
      // sub-stepped so a fast bolt cannot pass through a small body between two ticks
      const steps = (w.speed || 0) * dt > 24 ? 2 : 1; let hit = false;
      for (let q = 0; q < steps && !hit; q++) {
        P.x[s] += P.vx[s] * dt / steps; P.y[s] += P.vy[s] * dt / steps;
        hx = P.x[s]; hy = P.y[s]; hteam = team; hbest = -1; hr = 4;
        grid.near(hx, hy, 30, shotHit);
        if (hbest >= 0) {
          if (w.type === 'missile') blast(hx, hy, w.splash, w.dmg, team, team); else hurt(hbest, w.dmg, team, hx, hy);
          hit = true;
        } else {
          for (let t = 0; t < T.n; t++) { if (!T.alive[t] || T.team[t] === team) continue; const dx = T.x[t] - hx, dy = T.y[t] - hy; if (dx * dx + dy * dy < o.towerR * o.towerR) { if (w.type === 'missile') blast(hx, hy, w.splash, w.dmg, team, team); else hurtTower(t, w.dmg, team); hit = true; break; } }
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
      if (mtrig) { blast(mx, my, w.range, w.dmg, mteam, mteam); ev({ t: 'explode', x: mx, y: my, r: w.range, team: mteam, kind: MN.kind[m] }); MN.alive[m] = 0; MN.free.push(m); }
    }
  }

  // ---- the tick
  function step() {
    if (S.result) return;
    const dt = TICK;
    S.events.length = 0;
    S.tick++; S.time += dt;
    // 1. commands for this tick
    while (S.queue.length) apply(S.queue.shift());
    // 2. income
    for (let t = 0; t < T.n; t++) if (T.alive[t]) S.energy[T.team[t]] += o.incomePerTower * dt;
    // 3. the grid
    grid.build(U.x, U.y, U.alive, U.hi);
    // 4. every body: target, move, fire, traits
    const hi = U.hi, tick = S.tick;
    for (let i = 0; i < hi; i++) {
      if (!U.alive[i]) continue;
      const k = kinds[U.kind[i]];
      U.age[i] += dt; U.cd[i] -= dt; if (U.stun[i] > 0) U.stun[i] -= dt;
      if (k.traits.regen && U.hp[i] < k.hp) U.hp[i] = Math.min(k.hp, U.hp[i] + k.hp * 0.02 * dt);
      if (k.shieldMax && U.sh[i] < k.shieldMax) U.sh[i] = Math.min(k.shieldMax, U.sh[i] + k.shieldMax * 0.08 * dt);
      if (U.target[i] === -1 || ((tick + i) % 6 === 0) || !targetPos(i)) retarget(i, k);
      const dist = move(i, k, dt);
      if (k.traits.magnet) grid.near(U.x[i], U.y[i], k.w.range, (j) => { if (U.team[j] !== U.team[i] && U.alive[j]) { const dx = U.x[i] - U.x[j], dy = U.y[i] - U.y[j], d = Math.sqrt(dx * dx + dy * dy) || 1; if (d < k.w.range) { U.vx[j] += dx / d * 90; U.vy[j] += dy / d * 90; } } return false; });
      if (k.traits.kamikaze && dist < k.r + tr + 4 && U.target[i] !== -1) { const t = U.target[i]; blast(U.x[i], U.y[i], 70, 30, U.team[i], U.team[i]); if (t <= -2) hurtTower(-2 - t, 40, U.team[i]); ev({ t: 'explode', x: U.x[i], y: U.y[i], r: 70, team: U.team[i], kind: k.index }); killUnit(i, -1); continue; }
      if (U.cd[i] <= 0 && U.stun[i] <= 0 && dist <= k.w.range + tr && (U.target[i] !== -1 || k.w.type === 'aura' || k.w.type === 'spawn' || k.w.type === 'mine')) {
        if (k.w.type === 'aura' || k.w.type === 'spawn' || k.w.type === 'mine' || dist <= k.w.range + tr) { fire(i, k, dist); U.cd[i] = 1 / k.w.rate; }
      } else if (U.cd[i] <= 0 && (k.w.type === 'aura' || k.w.type === 'spawn' || k.w.type === 'mine')) { fire(i, k, dist); U.cd[i] = 1 / k.w.rate; }
    }
    // 5. shots and mines
    stepShots(dt);
    stepMines();
    // 6. the trim: the high-water mark falls when the top slots are empty
    while (U.hi > 0 && !U.alive[U.hi - 1]) { U.hi--; const f = U.free.indexOf(U.hi); if (f >= 0) U.free.splice(f, 1); }
    // 7. the bell
    let a = 0, b = 0, ha = 0, hb = 0;
    for (let t = 0; t < T.n; t++) { if (T.team[t] === 0) { a += T.alive[t]; ha += T.hp[t]; } else { b += T.alive[t]; hb += T.hp[t]; } }
    if (a === 0 || b === 0) S.result = { winner: a === 0 ? 1 : 0, why: 'towers', tick: S.tick, time: S.time };
    else if (S.time >= o.clock) S.result = { winner: ha === hb ? -1 : ha > hb ? 0 : 1, why: 'clock', tick: S.tick, time: S.time };
    if (S.result) ev({ t: 'end', winner: S.result.winner });
  }

  // ---- what a commander reads: small, plain, JSON-able
  function snapshot() {
    const counts = [new Uint16Array(kinds.length), new Uint16Array(kinds.length)];
    const nearTower = new Float32Array(T.n);   // enemy hp within 600 of each tower
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i]) continue;
      counts[U.team[i]][U.kind[i]]++;
      for (let t = 0; t < T.n; t++) { if (!T.alive[t] || T.team[t] === U.team[i]) continue; const dx = T.x[t] - U.x[i], dy = T.y[t] - U.y[i]; if (dx * dx + dy * dy < 600 * 600) nearTower[t] += U.hp[i]; }
    }
    return {
      tick: S.tick, time: +S.time.toFixed(2), energy: [Math.floor(S.energy[0]), Math.floor(S.energy[1])],
      towers: T.x.map((x, t) => ({ i: t, team: T.team[t], x, y: T.y[t], hp: Math.round(T.hp[t]), alive: !!T.alive[t], threat: Math.round(nearTower[t]) })),
      counts: [Array.from(counts[0]), Array.from(counts[1])], alive: [U.count[0], U.count[1]],
      result: S.result,
    };
  }

  return {
    S, o, kinds, U, P, MN, T, grid, TICK,
    step, apply, snapshot, nearestEnemyTower,
    queue: (cmd) => S.queue.push(cmd),
    get result() { return S.result; },
    get events() { return S.events; },
    get energy() { return S.energy; },
    get tick() { return S.tick; },
    get time() { return S.time; },
  };
}
