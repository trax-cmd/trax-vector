// main.js — THE LOOP. The sim ticks thirty times a second whatever the frame rate; the frame draws
// whatever the sim says. Captains tick beside the sim. The camera has three minds: WHOLE (the field),
// ACTION (where the bodies are falling), FREE (where you dragged it). The game teaches by doing: a card
// with nothing aimed at goes to the nearest open well, then to the enemy's, then to their weakest
// stronghold, and musters from your stronghold nearest that point. Everything is on window.VECTOR so a
// probe, a tool or a relay drives the same match a person is watching.
import { createSim, TICK, TEMPERS } from './sim/sim.js';
import { createBot } from './ai/bot.js';
import { createRenderer } from './render/gl.js';
import { createVfx, colorOf, NEUTRAL } from './render/vfx.js';
import { createInput } from './ui/input.js';
import { createHud } from './ui/hud.js';
import { createRelayClient } from './ui/relay.js';
import { createSound } from './ui/sound.js';

const q = new URLSearchParams(location.search);
const seed = +(q.get('seed') || ((Date.now() / 1000) | 0) % 100000);
let temper = q.get('temper') || ''; if (!TEMPERS[temper]) { try { temper = localStorage.getItem('vector_temper') || 'normal'; } catch (e) { temper = 'normal'; } } if (!TEMPERS[temper]) temper = 'normal';
try { localStorage.setItem('vector_temper', temper); } catch (e) { /* fine */ }
const sim = createSim({ seed, temper });
const state = { team: +(q.get('team') || 0), tower: -1, goal: -1, deployed: 0, flash: null, paused: false, fielded: null, threat: null, snap: null, view: 'whole', lastGoalAt: 0, temper, alarm: null, musters: [] };
const bots = [];
if (q.get('a') === 'bot') bots.push(createBot(sim, 0, { seed }));
if (q.get('b') !== 'human' && q.get('b') !== 'relay') bots.push(createBot(sim, 1, { seed: seed + 1, every: TEMPERS[temper].every, burst: TEMPERS[temper].burst }));
const relay = q.get('relay') ? createRelayClient(q.get('relay'), sim, q.get('b') === 'relay' ? 1 : 0) : null;
const sound = createSound();

const canvas = document.getElementById('field');
const R = createRenderer(canvas);
if (!R) { document.getElementById('nogl').style.display = 'flex'; throw new Error('no webgl2'); }
const vfx = createVfx(sim.kinds);
const cam = { x: sim.o.W / 2, y: sim.o.H / 2, zoom: 0.1 };
const heat = { x: sim.o.W / 2, y: sim.o.H / 2, hot: 0 };   // where the fight is: the running centre of hits and deaths, and how hot
const view = { whole() { state.view = 'whole'; }, action() { state.view = 'action'; }, free() { state.view = 'free'; } };
function fitWhole() { const pad = 24; const z = Math.min((canvas.clientWidth - pad) / sim.o.W, (canvas.clientHeight - 150) / sim.o.H); cam.zoom += (z - cam.zoom) * 0.12; cam.x += (sim.o.W / 2 - cam.x) * 0.12; cam.y += (sim.o.H / 2 + 20 / z - cam.y) * 0.12; }
function followAction() { const z = 0.42; cam.zoom += (z - cam.zoom) * 0.06; cam.x += (heat.x - cam.x) * 0.05; cam.y += (heat.y - cam.y) * 0.05; }

// ---- where a battalion goes when nothing is aimed at: the nearest open well, then the nearest enemy well, then their weakest stronghold
const T = sim.T, U = sim.U, P = sim.P, MN = sim.MN, WL = sim.WL, kinds = sim.kinds;
function ownTowers() { const out = []; for (let t = 0; t < T.n; t++) if (T.team[t] === state.team && T.alive[t]) out.push(t); return out; }
function nearestOwnTower(x, y) { let best = -1, bd = Infinity; for (const t of ownTowers()) { const dx = T.x[t] - x, dy = T.y[t] - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = t; } } return best; }
function defaultGoal() {
  const own = ownTowers(); if (!own.length) return -1;
  const near = (pred) => { let best = -1, bd = Infinity; for (let w = 0; w < WL.n; w++) { if (!pred(w)) continue; for (const t of own) { const dx = WL.x[w] - T.x[t], dy = WL.y[w] - T.y[t], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = w; } } } return best; };
  let w = near((i) => WL.owner[i] < 0 && !marchingTo(1000 + i)); if (w >= 0) return 1000 + w;
  w = near((i) => WL.owner[i] === 1 - state.team); if (w >= 0) return 1000 + w;
  let best = -1, bh = Infinity; for (let t = 0; t < T.n; t++) if (T.team[t] !== state.team && T.alive[t] && T.hp[t] < bh) { bh = T.hp[t]; best = t; }
  return best;
}
// where a wave is headed: the stronghold of mine nearest the musters' centre
function nearestOwnGoal(musters) { let cx = 0, cy = 0; for (const m of musters) { cx += m.x; cy += m.y; } cx /= musters.length; cy /= musters.length; let best = -1, bd = Infinity; for (let t = 0; t < T.n; t++) { if (T.team[t] !== state.team || !T.alive[t]) continue; const dx = T.x[t] - cx, dy = T.y[t] - cy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = t; } } return best; }
function marchingTo(goal) { for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === state.team && U.goal[i] === goal) return true; return false; }
function deploy(i) {
  let goal = state.goal;
  if (!sim.goalPoint(goal) || (goal >= 0 && goal < 1000 && T.team[goal] === state.team)) goal = defaultGoal();
  if (goal < 0) return false;
  const gp = sim.goalPoint(goal);
  const from = (state.tower >= 0 && T.alive[state.tower] && T.team[state.tower] === state.team && state.towerPinned) ? state.tower : nearestOwnTower(gp.x, gp.y);
  if (from < 0) return false;
  const ok = sim.apply({ op: 'deploy', team: state.team, tower: from, batt: i, goal });
  if (ok) { state.deployed++; state.tower = from; state.lastGoal = goal; state.lastGoalAt = performance.now(); sound.play('muster', state.team); }
  return ok;
}
function fortify() {
  const g = state.goal; if (g < 1000) return false;
  const ok = sim.apply({ op: 'fortify', team: state.team, well: g - 1000 });
  if (ok) sound.play('fortify', state.team);
  return ok;
}
const hud = createHud(sim, state, deploy, fortify);
createInput(canvas, cam, sim, state, deploy, view, sound);
document.getElementById('vwhole').addEventListener('click', view.whole);
document.getElementById('vaction').addEventListener('click', view.action);
const temperBtn = document.getElementById('vtemper'); temperBtn.textContent = temper.toUpperCase();
temperBtn.addEventListener('click', () => { const names = Object.keys(TEMPERS); const next = names[(names.indexOf(temper) + 1) % names.length]; try { localStorage.setItem('vector_temper', next); } catch (e) { /* fine */ } const u = new URL(location.href); u.searchParams.set('temper', next); u.searchParams.set('seed', String(seed)); location.href = u.toString(); });
const muteBtn = document.getElementById('vmute');
muteBtn.textContent = sound.muted ? 'SOUND OFF' : 'SOUND ON';
muteBtn.addEventListener('click', () => { sound.wake(); const m = sound.toggle(); muteBtn.textContent = m ? 'SOUND OFF' : 'SOUND ON'; });
window.addEventListener('pointerdown', () => sound.wake(), { once: false, passive: true });
document.getElementById('again').addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('seed', String((seed * 7 + 13) % 100000)); location.href = u.toString(); });

// ---- what the frame draws
function paint(out) {
  const now = performance.now() / 1000;
  for (let w = 0; w < WL.n; w++) {
    const o = WL.owner[w], c = o < 0 ? NEUTRAL : colorOf(o, 'base'), p = WL.prog[w];
    out.body(WL.x[w], WL.y[w], sim.o.wellR * 0.7, 4, c[0], c[1], c[2], o < 0 ? 0.35 : 0.7, 0, 0.5);
    out.body(WL.x[w], WL.y[w], sim.o.wellR * 0.28, 5, c[0], c[1], c[2], 0.5 + 0.4 * Math.abs(p), now * 0.6, 0.8);
    if (WL.fort[w]) out.body(WL.x[w], WL.y[w], sim.o.wellR * 1.05, 3, c[0], c[1], c[2], 0.35, -now * 0.2, 0.3);
    if (p !== 0 && Math.abs(p) < 1) { const pc = colorOf(p > 0 ? 0 : 1, 'base'); out.body(WL.x[w], WL.y[w], sim.o.wellR * (0.3 + 0.5 * Math.abs(p)), 4, pc[0], pc[1], pc[2], 0.5, 0, 0.3); }
    if (o < 0 && state.deployed === 0) out.body(WL.x[w], WL.y[w], sim.o.wellR * (1.2 + 0.4 * Math.sin(now * 3 + w)), 4, 1, 0.9, 0.5, 0.18, 0, 0.2);   // before the first muster the open wells breathe: this is where the money is
    if (state.goal === 1000 + w) out.body(WL.x[w], WL.y[w], sim.o.wellR * 1.3, 5, 1, 0.9, 0.5, 0.45 + 0.3 * Math.sin(now * 6), now, 0.4);
  }
  for (let t = 0; t < T.n; t++) {
    const c = colorOf(T.team[t], 'base'), alive = T.alive[t], hp = T.hp[t] / sim.o.towerHp;
    if (alive) {
      out.body(T.x[t], T.y[t], sim.o.towerR, 4, c[0], c[1], c[2], 0.55 + 0.4 * hp, 0, 0.9);
      out.body(T.x[t], T.y[t], sim.o.towerR * 0.42, 3, c[0], c[1], c[2], 0.9, now * 0.3, 1);
      out.body(T.x[t], T.y[t], sim.o.towerR * (0.62 + 0.3 * hp), 4, 1, 1, 1, 0.12 + 0.25 * hp, 0, 0.2);
    } else out.body(T.x[t], T.y[t], sim.o.towerR * 0.8, 4, c[0] * 0.3, c[1] * 0.3, c[2] * 0.3, 0.35, 0, 0.1);
    if (t === state.tower && alive && T.team[t] === state.team) out.body(T.x[t], T.y[t], sim.o.towerR * 1.35, 4, 1, 1, 1, 0.25 + 0.2 * Math.sin(now * 5), 0, 0.3);
    if (t === state.goal && alive) out.body(T.x[t], T.y[t], sim.o.towerR * 1.2, 5, 1, 0.9, 0.5, 0.5 + 0.3 * Math.sin(now * 6), now, 0.4);
  }
  // the last order, drawn: a thread from the stronghold to where the battalion was sent, fading over four seconds
  const age = (performance.now() - state.lastGoalAt) / 1000;
  if (state.lastGoal !== undefined && age < 4 && state.tower >= 0) { const gp = sim.goalPoint(state.lastGoal); if (gp) { const a = (1 - age / 4) * 0.5, c = colorOf(state.team, 'base'); out.line(T.x[state.tower], T.y[state.tower], gp.x, gp.y, 3, c[0], c[1], c[2], a); } }
  if (heat.hot > 0.3 && state.view !== 'action') { const c = [1, 0.9, 0.6]; out.body(heat.x, heat.y, 120 + 60 * Math.sin(now * 4), 4, c[0], c[1], c[2], 0.2 * Math.min(1, heat.hot), 0, 0.3); }
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
let last = performance.now(), acc = 0, fps = 0, fpsN = 0, fpsT = 0, snapAt = 0, flowAt = 0;
function loop(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  if (!state.paused) {
    acc += dt; let steps = 0;
    while (acc >= TICK && steps < 4) {
      for (const b of bots) b.tick(); if (relay) relay.tick();
      sim.step(); vfx.take(sim.events);
      for (const e of sim.events) {
        if (e.t === 'death' || e.t === 'towerHit' || e.t === 'capture') { const w = e.t === 'death' ? 1 : 6; heat.x += (e.x - heat.x) * 0.02 * w; heat.y += (e.y - heat.y) * 0.02 * w; heat.hot = Math.min(2, heat.hot + 0.08 * w); }
        if (e.t === 'muster' && e.team !== state.team) { state.musters.push({ at: performance.now(), role: e.role, x: e.x, y: e.y }); state.musters = state.musters.filter((m) => performance.now() - m.at < 3000); if (state.musters.length >= 3 && !(state.alarm && performance.now() < state.alarm.until)) { const roles = state.musters.map((m) => m.role); const counts = [0, 0, 0, 0, 0, 0]; for (const r of roles) counts[r]++; let top = 0; for (let r = 1; r < 6; r++) if (counts[r] > counts[top]) top = r; const g = sim.goalPoint(nearestOwnGoal(state.musters)); state.alarm = { until: performance.now() + 6000, roles: [...new Set(roles)], top, where: g ? g.name : 'YOUR LINE' }; sound.play('alarm'); } }
        if (e.t === 'death') sound.play('death', e.team); else if (e.t === 'capture') sound.play(e.team === state.team ? 'capture' : (e.from === state.team ? 'lost' : 'capture'), e.team); else if (e.t === 'towerHit') { if (e.team === state.team) sound.play('towerHit', e.team); } else if (e.t === 'towerDown') sound.play('towerDown', e.team); else if (e.t === 'explode') sound.play('explode', e.team); else if (e.t === 'fortify') { if (e.team !== state.team) sound.play('fortify', e.team); } else if (e.t === 'end') sound.play(e.winner === state.team ? 'win' : 'lose');
      }
      heat.hot *= 0.985;
      acc -= TICK; steps++;
    }
    if (steps === 4) acc = 0;
  }
  if (sim.tick >= snapAt) { snapAt = sim.tick + 30; const s = sim.snapshot(); state.snap = s; state.fielded = s.fielded; state.threat = s.towers.map((t) => t.threat); }
  // THE HARVEST, seen: every well you hold sends a mote of light home twice a second
  if (now - flowAt > 500 && !sim.result) { flowAt = now; for (let w = 0; w < WL.n; w++) { const o = WL.owner[w]; if (o < 0) continue; let best = -1, bd = Infinity; for (let t = 0; t < T.n; t++) { if (T.team[t] !== o || !T.alive[t]) continue; const dx = T.x[t] - WL.x[w], dy = T.y[t] - WL.y[w], d = dx * dx + dy * dy; if (d < bd) { bd = d; best = t; } } if (best >= 0) vfx.flow(WL.x[w], WL.y[w], T.x[best], T.y[best], colorOf(o, 'base'), WL.fort[w] ? 2 : 1); } }
  if (state.view === 'whole') fitWhole(); else if (state.view === 'action') followAction();
  vfx.update(dt);
  R.frame(cam, sim.o.W, sim.o.H, paint);
  hud.sync(now);
  document.getElementById('vwhole').classList.toggle('on', state.view === 'whole'); document.getElementById('vaction').classList.toggle('on', state.view === 'action');
  fpsN++; fpsT += dt; if (fpsT >= 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.VECTOR = { sim, state, cam, vfx, bots, deploy, fortify, defaultGoal, view, heat, sound, get fps() { return fps; }, get counts() { return { ...R.counts, ...vfx.counts }; }, seed };
