// vfx.js — THE VOCABULARY. The sim speaks in events; this file turns each word into light: sparks,
// rings, beams, arcs, flashes. Everything here is cosmetic and everything is cheap: particles in flat
// arrays, rings as growing ring-shapes, lightning as jittered segments. Colours come from the side and
// the family, so a body's light tells you what it is before you read a word.
import { rng32 } from '../sim/rng.js';

const TEAM = [
  // west: cold light            east: hot light
  { orb: [0.45, 1.0, 0.95], square: [0.3, 0.72, 1.0], tri: [0.6, 1.0, 0.8], hex: [0.35, 0.85, 1.0], ring: [0.72, 0.9, 1.0], diamond: [0.92, 0.97, 1.0], base: [0.4, 0.95, 1.0], flash: [0.8, 1.0, 1.0] },
  { orb: [1.0, 0.52, 0.3], square: [1.0, 0.32, 0.42], tri: [1.0, 0.72, 0.3], hex: [1.0, 0.42, 0.62], ring: [1.0, 0.62, 0.52], diamond: [1.0, 0.88, 0.55], base: [1.0, 0.42, 0.32], flash: [1.0, 0.9, 0.8] },
];
export function colorOf(team, family) { return TEAM[team][family] || TEAM[team].base; }
const ARC = [[0.75, 0.9, 1.0], [1.0, 0.85, 0.7]];

export function createVfx(kinds) {
  const r = rng32(99);
  const CAP = 100000;
  const P = { x: new Float32Array(CAP), y: new Float32Array(CAP), vx: new Float32Array(CAP), vy: new Float32Array(CAP), life: new Float32Array(CAP), max: new Float32Array(CAP), size: new Float32Array(CAP), r: new Float32Array(CAP), g: new Float32Array(CAP), b: new Float32Array(CAP), n: 0 };
  const rings = [];   // { x, y, r0, r1, life, max, c, w }
  const segs = [];    // { x1, y1, x2, y2, w, c, a, life, max }
  const flashes = []; // { x, y, size, life, max, c }
  const fam = (kind) => (kinds[kind] ? kinds[kind].family : 'orb');

  function spark(x, y, c, speed, life, size, n) {
    for (let i = 0; i < n; i++) {
      if (P.n >= CAP) return;
      const k = P.n++, a = r() * 6.283, v = speed * (0.3 + r() * 0.9);
      P.x[k] = x; P.y[k] = y; P.vx[k] = Math.cos(a) * v; P.vy[k] = Math.sin(a) * v;
      P.life[k] = P.max[k] = life * (0.6 + r() * 0.7); P.size[k] = size * (0.7 + r() * 0.6);
      P.r[k] = c[0]; P.g[k] = c[1]; P.b[k] = c[2];
    }
  }
  const ring = (x, y, r0, r1, life, c, w) => { if (rings.length < 3000) rings.push({ x, y, r0, r1, life, max: life, c, w: w || 1 }); };
  const seg = (x1, y1, x2, y2, w, c, a, life) => { if (segs.length < 9000) segs.push({ x1, y1, x2, y2, w, c, a, life, max: life }); };
  const flash = (x, y, size, life, c) => { if (flashes.length < 2000) flashes.push({ x, y, size, life, max: life, c }); };

  function take(events) {
    for (const e of events) {
      const c = colorOf(e.team, fam(e.kind));
      switch (e.t) {
        case 'death': spark(e.x, e.y, c, 90 + e.r * 8, 0.55, 2.2 + e.r * 0.12, 6 + (e.r | 0)); ring(e.x, e.y, e.r * 0.6, e.r * 3.2, 0.32, c); break;
        case 'hit': spark(e.x, e.y, c, 140, 0.22, 1.8, 3); break;
        case 'shield': ring(e.x, e.y, 10, 26, 0.18, TEAM[e.team].flash); break;
        case 'impact': spark(e.x, e.y, c, 120, 0.18, 1.6, 2); break;
        case 'beam': seg(e.x, e.y, e.x2, e.y2, 2.6, TEAM[e.team].flash, 0.9, 0.11); seg(e.x, e.y, e.x2, e.y2, 7, c, 0.35, 0.11); spark(e.x2, e.y2, c, 120, 0.2, 1.8, 3); break;
        case 'arc': { const p = e.pts, ac = ARC[e.team];
          for (let i = 0; i + 3 < p.length; i += 2) { const x1 = p[i], y1 = p[i + 1], x2 = p[i + 2], y2 = p[i + 3]; const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len; const n = Math.max(2, Math.min(6, (len / 40) | 0)); let px = x1, py = y1;
            for (let s = 1; s <= n; s++) { const t = s / n, j = s < n ? (r() - 0.5) * Math.min(36, len * 0.35) : 0; const qx = x1 + dx * t + nx * j, qy = y1 + dy * t + ny * j; seg(px, py, qx, qy, 2.2, ac, 1.0, 0.13); seg(px, py, qx, qy, 6, c, 0.3, 0.13); px = qx; py = qy; }
            spark(x2, y2, ac, 160, 0.16, 1.5, 2); }
          break; }
        case 'pulse': ring(e.x, e.y, 8, e.r, 0.32, e.emp ? TEAM[e.team].flash : c, 2.2); break;
        case 'aura': ring(e.x, e.y, e.r * 0.85, e.r, 0.5, c, 0.6); break;
        case 'explode': ring(e.x, e.y, 6, e.r * 1.35, 0.4, c, 2.6); flash(e.x, e.y, e.r * 0.8, 0.16, TEAM[e.team].flash); spark(e.x, e.y, c, 220 + e.r * 2, 0.6, 2.6, 14 + (e.r / 6 | 0)); break;
        case 'blink': ring(e.x, e.y, 4, 26, 0.22, c); ring(e.x2, e.y2, 26, 6, 0.22, c); seg(e.x, e.y, e.x2, e.y2, 3, c, 0.5, 0.14); break;
        case 'deploy': ring(e.x, e.y, 6, 40, 0.3, c); spark(e.x, e.y, c, 80, 0.4, 2, 5); break;
        case 'shot': break;
        case 'mine': ring(e.x, e.y, 4, 16, 0.3, c); break;
        case 'spawnout': spark(e.x, e.y, c, 100, 0.3, 2, 4); break;
        case 'towerHit': spark(e.x, e.y, TEAM[e.team].base, 160, 0.3, 2.2, 4); break;
        case 'towerDown': { const b = TEAM[e.team].base; spark(e.x, e.y, b, 420, 1.4, 3.4, 90); ring(e.x, e.y, 20, 420, 0.9, b, 4); ring(e.x, e.y, 10, 200, 0.5, TEAM[e.team].flash, 3); flash(e.x, e.y, 200, 0.35, TEAM[e.team].flash); break; }
        default: break;
      }
    }
  }
  function update(dt) {
    let n = P.n;
    for (let k = 0; k < n; k++) {
      P.life[k] -= dt;
      if (P.life[k] <= 0) { n--; if (k !== n) { P.x[k] = P.x[n]; P.y[k] = P.y[n]; P.vx[k] = P.vx[n]; P.vy[k] = P.vy[n]; P.life[k] = P.life[n]; P.max[k] = P.max[n]; P.size[k] = P.size[n]; P.r[k] = P.r[n]; P.g[k] = P.g[n]; P.b[k] = P.b[n]; } k--; continue; }
      P.x[k] += P.vx[k] * dt; P.y[k] += P.vy[k] * dt; const dmp = 1 - Math.min(0.9, dt * 2.4); P.vx[k] *= dmp; P.vy[k] *= dmp;
    }
    P.n = n;
    for (let i = rings.length - 1; i >= 0; i--) { rings[i].life -= dt; if (rings[i].life <= 0) { rings[i] = rings[rings.length - 1]; rings.pop(); } }
    for (let i = segs.length - 1; i >= 0; i--) { segs[i].life -= dt; if (segs[i].life <= 0) { segs[i] = segs[segs.length - 1]; segs.pop(); } }
    for (let i = flashes.length - 1; i >= 0; i--) { flashes[i].life -= dt; if (flashes[i].life <= 0) { flashes[i] = flashes[flashes.length - 1]; flashes.pop(); } }
  }
  // write everything into the renderer's streams
  function fill(out) {
    for (let k = 0; k < P.n; k++) { const t = P.life[k] / P.max[k]; out.spark(P.x[k], P.y[k], P.size[k] * (0.4 + t), 0, P.r[k], P.g[k], P.b[k], t * 0.9, 0, 1); }
    for (const g of rings) { const t = 1 - g.life / g.max; const rr = g.r0 + (g.r1 - g.r0) * (1 - (1 - t) * (1 - t)); out.spark(g.x, g.y, rr, 4, g.c[0], g.c[1], g.c[2], (1 - t) * 0.7 * g.w, 0, 0.4); }
    for (const f of flashes) { const t = f.life / f.max; out.spark(f.x, f.y, f.size * (1.2 - t * 0.4), 0, f.c[0], f.c[1], f.c[2], t * 0.8, 0, 1); }
    for (const s of segs) { const t = s.life / s.max; out.line(s.x1, s.y1, s.x2, s.y2, s.w, s.c[0], s.c[1], s.c[2], s.a * t); }
  }
  return { take, update, fill, get counts() { return { particles: P.n, rings: rings.length, segs: segs.length }; } };
}
