// main.js — THE LOOP. The sim ticks thirty times a second whatever the frame rate; the frame draws
// whatever the sim says. Captains tick beside the sim. Everything is exposed on window.VECTOR so a
// probe, a tool or a relay can drive the same match a person is watching.
import { createSim, TICK } from './sim/sim.js';
import { createBot } from './ai/bot.js';
import { createRenderer } from './render/gl.js';
import { createVfx, colorOf } from './render/vfx.js';
import { createInput } from './ui/input.js';
import { createHud } from './ui/hud.js';
import { createRelayClient } from './ui/relay.js';

const q = new URLSearchParams(location.search);
const seed = +(q.get('seed') || ((Date.now() / 1000) | 0) % 100000);
const sim = createSim({ seed });
const state = { team: +(q.get('team') || 0), tower: 2, goal: -1, deployed: 0, flash: null, paused: false };
const bots = [];
if (q.get('a') === 'bot') bots.push(createBot(sim, 0, { seed }));
if (q.get('b') !== 'human' && q.get('b') !== 'relay') bots.push(createBot(sim, 1, { seed: seed + 1 }));
const relay = q.get('relay') ? createRelayClient(q.get('relay'), sim, q.get('b') === 'relay' ? 1 : 0) : null;

const canvas = document.getElementById('field');
const R = createRenderer(canvas);
if (!R) { document.getElementById('nogl').style.display = 'flex'; throw new Error('no webgl2'); }
const vfx = createVfx(sim.kinds);
const cam = { x: sim.o.W / 2, y: sim.o.H / 2, zoom: 0.3 };
function fit() { const pad = 40; cam.zoom = Math.min((canvas.clientWidth - pad) / sim.o.W, (canvas.clientHeight - 120) / sim.o.H); cam.x = sim.o.W / 2; cam.y = sim.o.H / 2 + 30 / cam.zoom; }
function deploy(i) {
  if (state.tower < 0 || !sim.T.alive[state.tower] || sim.T.team[state.tower] !== state.team) { state.tower = firstOwn(); if (state.tower < 0) return false; }
  const ok = sim.apply({ op: 'deploy', team: state.team, tower: state.tower, kind: i, goal: state.goal });
  if (ok) state.deployed++;
  return ok;
}
function firstOwn() { const T = sim.T; let best = -1, bd = Infinity; for (let t = 0; t < T.n; t++) { if (T.team[t] !== state.team || !T.alive[t]) continue; const d = Math.abs(T.y[t] - sim.o.H / 2); if (d < bd) { bd = d; best = t; } } return best; }
state.tower = firstOwn();
const hud = createHud(sim, state, deploy);
createInput(canvas, cam, sim, state, deploy, fit);
fit(); window.addEventListener('resize', fit);
document.getElementById('again').addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('seed', String((seed * 7 + 13) % 100000)); location.href = u.toString(); });

// ---- what the frame draws
const T = sim.T, U = sim.U, P = sim.P, MN = sim.MN, kinds = sim.kinds, FAM = ['orb', 'square', 'tri', 'hex', 'ring', 'diamond'];
function paint(out) {
  const now = performance.now() / 1000;
  for (let t = 0; t < T.n; t++) {
    const c = colorOf(T.team[t], 'base'), alive = T.alive[t], hp = T.hp[t] / sim.o.towerHp;
    if (alive) {
      out.body(T.x[t], T.y[t], sim.o.towerR, 4, c[0], c[1], c[2], 0.55 + 0.4 * hp, 0, 0.9);
      out.body(T.x[t], T.y[t], sim.o.towerR * 0.42, 3, c[0], c[1], c[2], 0.9, now * 0.3, 1);
      out.body(T.x[t], T.y[t], sim.o.towerR * (0.62 + 0.3 * hp), 4, 1, 1, 1, 0.12 + 0.25 * hp, 0, 0.2);
    } else out.body(T.x[t], T.y[t], sim.o.towerR * 0.8, 4, c[0] * 0.3, c[1] * 0.3, c[2] * 0.3, 0.35, 0, 0.1);
    if (t === state.tower && alive) out.body(T.x[t], T.y[t], sim.o.towerR * 1.35, 4, 1, 1, 1, 0.35 + 0.25 * Math.sin(now * 5), 0, 0.3);
    if (t === state.goal && alive) out.body(T.x[t], T.y[t], sim.o.towerR * 1.2, 5, 1, 0.9, 0.5, 0.5 + 0.3 * Math.sin(now * 6), now, 0.4);
  }
  for (let i = 0; i < U.hi; i++) {
    if (!U.alive[i]) continue;
    const k = kinds[U.kind[i]], c = colorOf(U.team[i], k.family), hp = U.hp[i] / k.hp;
    let rot = 0;
    if (k.shape === 2 || k.shape === 5) rot = Math.atan2(U.vy[i], U.vx[i]) + Math.PI / 2; else if (k.shape === 1) rot = U.age[i] * 0.9 + U.ph[i]; else if (k.shape === 3) rot = -U.age[i] * 0.5;
    out.body(U.x[i], U.y[i], k.r, k.shape, c[0], c[1], c[2], 0.75 + 0.25 * hp, rot, 0.45 + 0.55 * hp);
    if (U.sh[i] > 0) out.body(U.x[i], U.y[i], k.r * 1.6, 4, 0.7, 0.85, 1, 0.12 + 0.35 * U.sh[i] / (k.shieldMax || 1), 0, 0.2);
    if (U.stun[i] > 0) out.body(U.x[i], U.y[i], k.r * 1.3, 0, 0.8, 0.9, 1, 0.25, 0, 1);
  }
  for (let s = 0; s < P.hi; s++) {
    if (!P.alive[s]) continue;
    const k = kinds[P.kind[s]], c = colorOf(P.team[s], k.family);
    if (k.w.type === 'missile') out.body(P.x[s], P.y[s], 6, 5, c[0], c[1], c[2], 1, Math.atan2(P.vy[s], P.vx[s]) + Math.PI / 2, 1);
    else out.body(P.x[s], P.y[s], 3, 0, 1, 1, 1, 0.9, 0, 1);
  }
  for (let m = 0; m < MN.hi; m++) { if (!MN.alive[m]) continue; const c = colorOf(MN.team[m], 'square'); out.body(MN.x[m], MN.y[m], 7, 4, c[0], c[1], c[2], 0.5 + 0.4 * Math.sin(now * 4 + m), 0, 0.6); }
  vfx.fill(out);
}

// ---- the loop
let last = performance.now(), acc = 0, fps = 0, fpsN = 0, fpsT = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!state.paused) {
    acc += dt; let steps = 0;
    while (acc >= TICK && steps < 4) { for (const b of bots) b.tick(); if (relay) relay.tick(); sim.step(); vfx.take(sim.events); acc -= TICK; steps++; }
    if (steps === 4) acc = 0;
  }
  vfx.update(dt);
  R.frame(cam, sim.o.W, sim.o.H, paint);
  hud.sync();
  fpsN++; fpsT += dt; if (fpsT >= 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.VECTOR = { sim, state, cam, vfx, bots, deploy, fit, get fps() { return fps; }, get counts() { return { ...R.counts, ...vfx.counts }; }, seed };
