// vfx.js — THE VOCABULARY. The sim speaks in events; this file turns each word into light: a death is a
// thin ring and a few streaks, a beam is one line, a shatter is twelve flying arcs and a shockwave. Everything
// here is cosmetic and everything is thin: no donuts, no clouds, a spark never over 2 px, a line never under
// 1.5. Colour says the side (two pairs: fill and edge) and nothing else; the shape says the role.
//
// Clocks: every life here counts on the vfx clock, seconds advanced by update(dt). The two arrays paint reads
// by body index, flashUntil and barrel.until, hold performance.now() / 1000 - the clock main.js's paint keeps.
// The requests main.js consumes (jolt.t0, ripple[].at) are performance.now() milliseconds.
import { rng32 } from '../sim/rng.js';
import { STATE, PALETTE, rgb } from './gl.js';

// §2.1 the two sides: a fill and an edge each; role is read from the shape, never from a hue
export const TEAM = [{ fill: rgb(PALETTE.westFill), edge: rgb(PALETTE.westEdge) }, { fill: rgb(PALETTE.eastFill), edge: rgb(PALETTE.eastEdge) }];
export const NEUTRAL = { fill: rgb('#3A4258'), edge: rgb('#8A94AD') };
export const GOLD = rgb(PALETTE.gold), BEATS_C = rgb(PALETTE.beats), LOSES_C = rgb(PALETTE.loses), WHITE = [1, 1, 1], SHIELD_C = rgb('#BFE3FF'), SMOKE = rgb('#8A94AD');
export function colorOf(team) { return TEAM[team] || NEUTRAL; }

// the field's fixed geometry, mirrored from lanes.js §3.1 (the lane break ripples the five points of a lane)
const LANE_Y = [1000, 2500, 4000], CP_X = [1900, 3200, 4500, 5800, 7100], CP_R = 70, GATE_R = 110, KEEP_R = 130, FIELD_W = 9000, FIELD_H = 5000;
// the spec's px are read on the portrait glass at zoom 0.46; a NOFLOOR size is set there and scales with the camera
const PX = 1 / 0.46;
const px = (n) => n * PX;
const { NOFLOOR, CAP2 } = STATE;
const BODIES = 30000, SLOTS = 4, SNAP_MS = 30, TAIL_S = 0.12;
const SPARK_CAP = 60000, SHARD_CAP = 3000, RING_CAP = 4000, SEG_CAP = 12000, DISC_CAP = 500, DEBRIS_N = 120, FRAGMENTS = 12;
// a ring that grows past POLY_R is a polyline for its whole life: the shape shader's quad shades every pixel under a ring
// (a 116-wu muster ring is a hundred thousand physical px on the portrait glass, and a fight makes a dozen rings a frame),
// while a polyline shades its stroke alone. Chords are cut so the sag under the true circle stays under SAG wu - a
// seventh of a pixel at 0.46 - from a mote's death ring to the shockwave and the doom ring across the field
const POLY_R = 40, SAG = 0.3, CHORDS_MIN = 12, CHORDS_MAX = 512;
const SHOCK_STROKE = Math.max(6, 2 / 0.30);   // §2.7: 6 wu, and never under 2 px at the widest battle zoom (landscape, 0.30)
const easeOut = (t) => 1 - (1 - t) * (1 - t);
const nowS = () => performance.now() / 1000;

export function createVfx(kinds, sim) {
  const r = rng32(99);
  let clock = 0;
  const edgeOf = (team) => colorOf(team).edge;
  const isMissile = new Uint8Array(kinds.length); kinds.forEach((k, i) => { isMissile[i] = k.w && k.w.type === 'missile' ? 1 : 0; });

  // ---- the stores: flat arrays for what is many, small objects for what is rare
  const P = { x: new Float32Array(SPARK_CAP), y: new Float32Array(SPARK_CAP), vx: new Float32Array(SPARK_CAP), vy: new Float32Array(SPARK_CAP), life: new Float32Array(SPARK_CAP), max: new Float32Array(SPARK_CAP), size: new Float32Array(SPARK_CAP), streak: new Float32Array(SPARK_CAP), r: new Float32Array(SPARK_CAP), g: new Float32Array(SPARK_CAP), b: new Float32Array(SPARK_CAP), n: 0 };
  const SH = { x: new Float32Array(SHARD_CAP), y: new Float32Array(SHARD_CAP), vx: new Float32Array(SHARD_CAP), vy: new Float32Array(SHARD_CAP), ang: new Float32Array(SHARD_CAP), spin: new Float32Array(SHARD_CAP), life: new Float32Array(SHARD_CAP), max: new Float32Array(SHARD_CAP), size: new Float32Array(SHARD_CAP), team: new Uint8Array(SHARD_CAP), n: 0 };
  const rings = [];      // { x, y, r0, r1, life, max, wait, c, a, stroke }
  const segs = [];       // { x1, y1, x2, y2, hw, c, a1, a2, life, max, beam }
  const discs = [];      // { x, y, r, life, max, c, a }
  const fragments = [];  // { x, y, r, a0, dx, dy, t, team, slot }  a stronghold's arc in flight
  const ripples = [];    // { x, y, at }  a gold ring due on a checkpoint
  const lanes = [];      // { x1, y1, x2, y2, t }  the lane-break line
  const dooms = [];      // { x, y, team, t, life }
  const debris = { x: new Float32Array(DEBRIS_N), y: new Float32Array(DEBRIS_N), r: new Float32Array(DEBRIS_N), a0: new Float32Array(DEBRIS_N), team: new Uint8Array(DEBRIS_N), on: new Uint8Array(DEBRIS_N) };
  const P_KEYS = ['x', 'y', 'vx', 'vy', 'life', 'max', 'size', 'streak', 'r', 'g', 'b'], SH_KEYS = ['x', 'y', 'vx', 'vy', 'ang', 'spin', 'life', 'max', 'size', 'team'];
  const flashUntil = new Float32Array(BODIES);
  const barrel = { until: new Float32Array(BODIES), x2: new Float32Array(BODIES), y2: new Float32Array(BODIES) };
  const requests = { flash: 0, jolt: null, shake: 0, slow: 0, ripple: [] };

  // ---- the emitters
  function emit(x, y, c, n, speed, life, sizePx, streakPx) {
    for (let i = 0; i < n; i++) {
      if (P.n >= SPARK_CAP) return;
      const k = P.n++, a = r() * 6.283, v = speed * (0.4 + r() * 0.8);
      P.x[k] = x; P.y[k] = y; P.vx[k] = Math.cos(a) * v; P.vy[k] = Math.sin(a) * v;
      P.life[k] = P.max[k] = life * (0.6 + r() * 0.4); P.size[k] = px(sizePx); P.streak[k] = px(streakPx);   // never longer than asked: the particle rule caps a spark at 0.4 s
      P.r[k] = c[0]; P.g[k] = c[1]; P.b[k] = c[2];
    }
  }
  function smoke(x, y, vx, vy) {
    if (P.n >= SPARK_CAP) return;
    const k = P.n++;
    P.x[k] = x; P.y[k] = y; P.vx[k] = vx + (r() - 0.5) * 30; P.vy[k] = vy + (r() - 0.5) * 30;
    P.life[k] = P.max[k] = 0.4; P.size[k] = px(0.75); P.streak[k] = 0; P.r[k] = SMOKE[0]; P.g[k] = SMOKE[1]; P.b[k] = SMOKE[2];
  }
  function shards(x, y, n, speed, sizeWu, life, team) {
    for (let i = 0; i < n; i++) {
      if (SH.n >= SHARD_CAP) return;
      const k = SH.n++, a = r() * 6.283, v = speed * (0.5 + r() * 0.8);
      SH.x[k] = x; SH.y[k] = y; SH.vx[k] = Math.cos(a) * v; SH.vy[k] = Math.sin(a) * v; SH.ang[k] = r() * 6.283; SH.spin[k] = 6 * (r() < 0.5 ? -1 : 1);
      SH.life[k] = SH.max[k] = life; SH.size[k] = sizeWu; SH.team[k] = team;
    }
  }
  const ring = (x, y, r0, r1, life, c, a, stroke, wait = 0) => { if (rings.length < RING_CAP) rings.push({ x, y, r0, r1, life, max: life, wait, c, a, stroke, poly: Math.max(r0, r1) > POLY_R }); };
  const seg = (x1, y1, x2, y2, hw, c, a1, a2, life, beam = false) => { if (segs.length < SEG_CAP) segs.push({ x1, y1, x2, y2, hw, c, a1, a2, life, max: life, beam }); };
  const disc = (x, y, rr, life, c, a) => { if (discs.length < DISC_CAP) discs.push({ x, y, r: rr, life, max: life, c, a }); };
  // §2.5 an arc: jittered 2 px white segments, no underlay, a spark where it bites
  function arc(pts, c) {
    for (let i = 0; i + 3 < pts.length; i += 2) {
      const x1 = pts[i], y1 = pts[i + 1], x2 = pts[i + 2], y2 = pts[i + 3], dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
      const n = Math.max(2, Math.min(6, (len / 40) | 0)), j = Math.min(36, len * 0.35);
      let lx = x1, ly = y1;
      for (let s = 1; s <= n; s++) { const t = s / n, o = s < n ? (r() - 0.5) * j : 0, qx = x1 + dx * t + nx * o, qy = y1 + dy * t + ny * o; seg(lx, ly, qx, qy, px(1), WHITE, 1, 1, 0.13); lx = qx; ly = qy; }
      emit(x2, y2, c, 1, 60, 0.15, 1, 0);
    }
  }
  // §2.7 THE SHATTER: the ring breaks into twelve arcs that fly and stay as debris, a shockwave twice, a flash, shards, sparks, and the requests the loop answers
  function shatter(e) {
    const R0 = e.kind === 1 ? KEEP_R : GATE_R, c = edgeOf(e.team), slot = (e.tower | 0) * FRAGMENTS;
    for (let k = 0; k < FRAGMENTS; k++) { const a0 = k * Math.PI / 6, mid = a0 + Math.PI / 12; fragments.push({ x: e.x, y: e.y, r: R0, a0, dx: Math.cos(mid), dy: Math.sin(mid), t: 0, team: e.team, slot: slot + k }); }
    ring(e.x, e.y, R0, 1400, 0.9, c, 1, SHOCK_STROKE); ring(e.x, e.y, R0, 1400, 0.9, c, 0.7, SHOCK_STROKE, 0.15);
    disc(e.x, e.y, 200, 0.12, WHITE, 0.9);
    shards(e.x, e.y, 24, 300, px(4), 1.0, e.team);
    emit(e.x, e.y, c, 40, 260, 0.4, 1, 0);
    requests.flash = 1; requests.jolt = { x: e.x, y: e.y, amp: 6, t0: performance.now() }; requests.shake = 8; requests.slow = 0.8;
  }
  // §2.7 THE LANE BREAK: a gold line runs the lane from the breaker's gate, and the five points ripple outward 80 ms apart
  function laneBreak(e) {
    const y = LANE_Y[e.lane] ?? LANE_Y[1], slots = e.from < e.to ? [0, 1, 2, 3, 4] : [4, 3, 2, 1, 0];
    lanes.push({ x1: e.from, y1: y, x2: e.to, y2: y, t: 0 });
    slots.forEach((s, k) => { ripples.push({ x: CP_X[s], y, at: clock + k * 0.08 }); requests.ripple.push({ x: CP_X[s], y, at: performance.now() + k * 80 }); });
    while (requests.ripple.length > 64) requests.ripple.shift();   // a loop that never drains the list still gets a bounded one
  }
  function doom(e) {
    const W = sim && sim.o ? sim.o.W : FIELD_W, H = sim && sim.o ? sim.o.H : FIELD_H;
    const far = Math.max(Math.hypot(e.x, e.y), Math.hypot(W - e.x, e.y), Math.hypot(e.x, H - e.y), Math.hypot(W - e.x, H - e.y));
    dooms.push({ x: e.x, y: e.y, team: e.team, t: 0, life: far / 1500 + 2.5 });
  }

  // ---- §2.6 the words
  function take(events) {
    const now = nowS();
    for (const e of events) {
      const c = edgeOf(e.team);
      switch (e.t) {
        case 'death': {   // a thin ring, a white blink and a few streaks; a heavy body throws shards; a self-death (a dive, the doom) is the light death alone
          const k = kinds[e.kind], quiet = e.by < 0, heavy = !quiet && k && (k.shape === 1 || k.shape === 3);
          ring(e.x, e.y, e.r, e.r * (heavy ? 4 : 3), 0.35, c, 1, px(2));
          if (!quiet) disc(e.x, e.y, e.r * 1.2, 0.08, WHITE, 0.9);
          emit(e.x, e.y, c, heavy ? 10 : 6, 90 + e.r * 8, 0.3, 0.75, 6);
          if (heavy) shards(e.x, e.y, 3, 200, px(2.5), 0.6, e.team);
          break;
        }
        case 'hit': emit(e.x, e.y, c, 2, 140, 0.22, 1, 0); if (e.i >= 0 && e.i < BODIES) flashUntil[e.i] = now + 0.06; break;
        case 'impact': emit(e.x, e.y, c, 2, 120, 0.18, 1, 0); break;
        case 'shield': ring(e.x, e.y, 10, 26, 0.18, SHIELD_C, 0.9, px(1)); break;
        case 'beam': seg(e.x, e.y, e.x2, e.y2, px(1), c, 1, 1, 0.2, true); break;
        case 'arc': arc(e.pts, c); break;
        case 'pulse': ring(e.x, e.y, 8, e.r, 0.3, e.emp ? WHITE : c, 0.9, px(2)); break;
        case 'aura': ring(e.x, e.y, e.r, e.r, 0.5, c, 0.25, px(1)); break;
        case 'explode': ring(e.x, e.y, 6, e.r, 0.3, c, 1, px(2)); disc(e.x, e.y, e.r * 0.5, 0.1, WHITE, 0.9); break;
        case 'blink': ring(e.x, e.y, 6, 24, 0.14, c, 1, px(1.5)); ring(e.x2, e.y2, 24, 6, 0.14, c, 1, px(1.5)); seg(e.x, e.y, e.x2, e.y2, px(0.5), c, 0.7, 0.7, 0.14); break;
        case 'deploy': ring(e.x, e.y, 6, 40, 0.3, c, 0.8, px(1)); break;
        case 'muster': ring(e.x, e.y, 20, 60 + (e.n | 0) * 4, 0.18, c, 1, px(2)); break;
        case 'capture': ring(e.x, e.y, CP_R, CP_R * 1.8, 0.4, c, 1, px(2)); if (e.centre) ring(e.x, e.y, CP_R * 1.3, CP_R * 2.4, 0.6, GOLD, 0.8, px(2)); break;
        case 'mine': ring(e.x, e.y, 4, 16, 0.3, c, 0.7, px(1)); break;
        case 'spawnout': emit(e.x, e.y, c, 3, 100, 0.3, 1, 0); break;
        case 'towerHit': emit(e.x, e.y, c, 3, 160, 0.3, 1, 0); break;
        case 'barrel': if (e.i >= 0 && e.i < BODIES) { barrel.until[e.i] = now + 0.12; barrel.x2[e.i] = e.x2; barrel.y2[e.i] = e.y2; } break;
        case 'shatter': shatter(e); break;
        case 'laneBreak': laneBreak(e); break;
        case 'doom': doom(e); break;
        default: break;
      }
    }
  }

  // ---- time
  function update(dt) {
    clock += dt;
    const damp = 1 - Math.min(0.9, dt * 2.4);
    let n = P.n;
    for (let k = 0; k < n; k++) {
      P.life[k] -= dt;
      if (P.life[k] <= 0) { n--; if (k !== n) for (const key of P_KEYS) P[key][k] = P[key][n]; k--; continue; }
      P.x[k] += P.vx[k] * dt; P.y[k] += P.vy[k] * dt; P.vx[k] *= damp; P.vy[k] *= damp;
    }
    P.n = n;
    n = SH.n;
    for (let k = 0; k < n; k++) {
      SH.life[k] -= dt;
      if (SH.life[k] <= 0) { n--; if (k !== n) for (const key of SH_KEYS) SH[key][k] = SH[key][n]; k--; continue; }
      SH.x[k] += SH.vx[k] * dt; SH.y[k] += SH.vy[k] * dt; SH.ang[k] += SH.spin[k] * dt; SH.vx[k] *= damp; SH.vy[k] *= damp;
    }
    SH.n = n;
    for (let i = rings.length - 1; i >= 0; i--) { const g = rings[i]; if (g.wait > 0) { g.wait -= dt; continue; } g.life -= dt; if (g.life <= 0) { rings[i] = rings[rings.length - 1]; rings.pop(); } }
    for (let i = segs.length - 1; i >= 0; i--) { segs[i].life -= dt; if (segs[i].life <= 0) { segs[i] = segs[segs.length - 1]; segs.pop(); } }
    for (let i = discs.length - 1; i >= 0; i--) { discs[i].life -= dt; if (discs[i].life <= 0) { discs[i] = discs[discs.length - 1]; discs.pop(); } }
    for (let i = fragments.length - 1; i >= 0; i--) {   // an arc flies 1.2 s, then lies where it fell for the match
      const f = fragments[i]; f.t += dt;
      if (f.t >= 1.2) { const s = f.slot % DEBRIS_N, d = 600 * 1.2; debris.x[s] = f.x + f.dx * d; debris.y[s] = f.y + f.dy * d; debris.r[s] = f.r; debris.a0[s] = f.a0; debris.team[s] = f.team; debris.on[s] = 1; fragments.splice(i, 1); }
    }
    for (let i = ripples.length - 1; i >= 0; i--) { const p = ripples[i]; if (clock >= p.at) { ring(p.x, p.y, CP_R, CP_R * 1.6, 0.35, GOLD, 1, px(2)); ripples.splice(i, 1); } }
    for (let i = lanes.length - 1; i >= 0; i--) { lanes[i].t += dt; if (lanes[i].t >= 2.6) lanes.splice(i, 1); }
    for (let i = dooms.length - 1; i >= 0; i--) { dooms[i].t += dt; if (dooms[i].t >= dooms[i].life) dooms.splice(i, 1); }
    if (sim && sim.P) {   // §2.5 a missile smokes: three grey specks a second, 1.5 px, 0.4 s
      const SP = sim.P, rate = 3 * dt;
      for (let s = 0; s < SP.hi; s++) if (SP.alive[s] && isMissile[SP.kind[s]] && r() < rate) smoke(SP.x[s], SP.y[s], -SP.vx[s] * 0.05, -SP.vy[s] * 0.05);
    }
  }

  // ---- the light, written into the renderer's streams
  const body = (out, x, y, rr, shape, c, a, rot, band) => out.body(x, y, rr, shape, c[0], c[1], c[2], a, c[0], c[1], c[2], rot, band, 0, 0, NOFLOOR);
  // a ring of `stroke` wu: the SDF ring when small, a polyline of chords when it is or will be past POLY_R
  function ringOut(out, x, y, rr, c, a, stroke, poly) {
    if (!poly) { body(out, x, y, rr, 4, c, a, 0, stroke / rr); return; }
    const n = Math.min(CHORDS_MAX, Math.max(CHORDS_MIN, Math.ceil(Math.PI / Math.acos(1 - Math.min(0.5, SAG / rr))))), hw = stroke / 2;
    let lx = x + rr, ly = y;
    for (let j = 1; j <= n; j++) { const an = 6.2832 * j / n, nx = x + Math.cos(an) * rr, ny = y + Math.sin(an) * rr; out.line(lx, ly, nx, ny, hw, c[0], c[1], c[2], a, a); lx = nx; ly = ny; }
  }
  // an arc of a stronghold's ring as four segments, 8 wu thick
  function arcStrip(out, cx, cy, rr, a0, c, a) {
    let lx = cx + Math.cos(a0) * rr, ly = cy + Math.sin(a0) * rr;
    for (let j = 1; j <= 4; j++) { const an = a0 + (Math.PI / 6) * j / 4, nx = cx + Math.cos(an) * rr, ny = cy + Math.sin(an) * rr; out.line(lx, ly, nx, ny, 4, c[0], c[1], c[2], a, a); lx = nx; ly = ny; }
  }
  function fill(out) {
    for (const g of rings) { if (g.wait > 0) continue; const t = 1 - g.life / g.max, rr = g.r0 + (g.r1 - g.r0) * easeOut(t); if (rr > 0.5) ringOut(out, g.x, g.y, rr, g.c, g.a * (1 - t), g.stroke, g.poly); }
    for (const s of segs) {
      const age = s.max - s.life;
      if (s.beam) { if (age < 0.08) out.line(s.x1, s.y1, s.x2, s.y2, px(1), 1, 1, 1, 1, 1); else { const a = Math.max(0, 1 - (age - 0.08) / 0.12); out.line(s.x1, s.y1, s.x2, s.y2, px(0.5), s.c[0], s.c[1], s.c[2], a, a); } }   // 2 px white for 80 ms, then 1 px of the side fading over 120
      else { const t = s.life / s.max; out.line(s.x1, s.y1, s.x2, s.y2, s.hw, s.c[0], s.c[1], s.c[2], s.a1 * t, s.a2 * t); }
    }
    for (const f of fragments) { const d = 600 * f.t, c = edgeOf(f.team); arcStrip(out, f.x + f.dx * d, f.y + f.dy * d, f.r, f.a0, c, 1 - 0.65 * (f.t / 1.2)); }
    for (let s = 0; s < DEBRIS_N; s++) if (debris.on[s]) arcStrip(out, debris.x[s], debris.y[s], debris.r[s], debris.a0[s], edgeOf(debris.team[s]), 0.35);
    for (let k = 0; k < SH.n; k++) body(out, SH.x[k], SH.y[k], SH.size[k], 2, edgeOf(SH.team[k]), SH.life[k] / SH.max[k], SH.ang[k], 0);
    for (const d of dooms) { const rr = 1500 * d.t, a = 0.8 * Math.min(1, (d.life - d.t) / 2.5); ringOut(out, d.x, d.y, Math.max(1, rr), edgeOf(d.team), a, px(2), true); }
  }
  function fillTop(out) {
    for (const f of discs) body(out, f.x, f.y, f.r, 0, f.c, f.a * f.life / f.max, 0, 0);
    for (const l of lanes) {   // the 3 px gold line runs the lane in 0.6 s and fades over 2 s
      const run = Math.min(1, l.t / 0.6), a = l.t < 0.6 ? 1 : Math.max(0, 1 - (l.t - 0.6) / 2);
      out.line(l.x1, l.y1, l.x1 + (l.x2 - l.x1) * run, l.y1 + (l.y2 - l.y1) * run, px(1.5), GOLD[0], GOLD[1], GOLD[2], a, a);
    }
    for (let k = 0; k < P.n; k++) {
      const t = P.life[k] / P.max[k];
      if (P.streak[k] > 0) { const v = Math.hypot(P.vx[k], P.vy[k]) || 1, l = P.streak[k] / v; out.line(P.x[k] - P.vx[k] * l, P.y[k] - P.vy[k] * l, P.x[k], P.y[k], px(0.75), P.r[k], P.g[k], P.b[k], 0, t); }
      else out.spark(P.x[k], P.y[k], P.size[k], 0, P.r[k], P.g[k], P.b[k], t, P.r[k], P.g[k], P.b[k], 0, 0, 0, 0, CAP2);
    }
  }

  // ---- §2.5 THE TRAIL: four snapshots of every body's position 30 ms apart; the tail is the oldest, ~120 ms back
  const TX = new Float32Array(BODIES * SLOTS), TY = new Float32Array(BODIES * SLOTS);
  let head = 0, snapAt = -Infinity, snaps = 0;
  const trail = {
    // now: performance.now() milliseconds, the clock main.js keeps (a caller without one gets the vfx clock). On the wall
    // clock a tail is the last 120 ms a person watched, so slow-time shortens it as it shortens every stride.
    snap(U, now = clock * 1000) {
      if (now - snapAt < SNAP_MS) return;
      snapAt = now; head = (head + 1) % SLOTS; snaps++;
      const n = Math.min(U.hi, BODIES);
      TX.set(U.x.subarray(0, n), head * BODIES); TY.set(U.y.subarray(0, n), head * BODIES);
    },
    // light bodies at speed leave a 1 css px thread of their edge, 0.35 at the head to 0 at the tail; OVERDRIVE (surging) three times as long
    fill(out, U, zoom, surging) {
      if (snaps < SLOTS) return;
      const isSurging = typeof surging === 'function' ? surging : surging && surging.length ? (i) => !!surging[i] : () => false;
      const tail = ((head + 1) % SLOTS) * BODIES, n = Math.min(U.hi, BODIES), now = nowS(), thread = 0.5 / zoom, barrelW = 0.75 / zoom;
      for (let i = 0; i < n; i++) {
        if (!U.alive[i]) continue;
        const k = kinds[U.kind[i]], c = edgeOf(U.team[i]);
        if (U.age[i] >= TAIL_S && (k.shape === 0 || k.shape === 2 || k.shape === 5) && k.speed >= 200) {
          const hx = U.x[i], hy = U.y[i], m = isSurging(i) ? 3 : 1;
          out.line(hx + (TX[tail + i] - hx) * m, hy + (TY[tail + i] - hy) * m, hx, hy, thread, c[0], c[1], c[2], 0, 0.35);
        }
        if (barrel.until[i] > now) {   // §2.5 the siege barrel: 1.5 px from the hex's centre, 0.9 r toward its target, 120 ms
          const dx = barrel.x2[i] - U.x[i], dy = barrel.y2[i] - U.y[i], d = Math.hypot(dx, dy) || 1;
          out.line(U.x[i], U.y[i], U.x[i] + dx / d * 0.9 * k.r, U.y[i] + dy / d * 0.9 * k.r, barrelW, c[0], c[1], c[2], 1, 1);
        }
      }
    },
  };

  return {
    take, update, fill, fillTop, trail, flashUntil, barrel, requests, debris,
    get counts() { return { sparks: P.n, shards: SH.n, rings: rings.length, segs: segs.length, discs: discs.length, fragments: fragments.length, debris: debris.on.reduce((s, v) => s + v, 0) }; },
  };
}
