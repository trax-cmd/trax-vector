// main.js — THE WAR on the glass. The world ticks thirty times a second; the frame draws the field (the open ground with
// every outpost's land tinted), the roads, the outposts, the armies, the battleships and the fire. The commander's hand:
//   tap an outpost          the reinforcements pour there for 45 s (three in five of the army), and the chosen battleship flies there
//   tap a battleship        take its helm (1-4 on a keyboard); tap open ground: it flies there
//   the two power buttons   fire the chosen ship's powers (Q / E); AUTO hands it back to its pilot
//   drag                    look around; pinch or wheel to zoom from one fight out to the whole war; tap a ship card to ride it again
import { createWorld, W, H, TICK, KINDS, SHIPS, UNITS, OUTPOSTS } from './world.js';
import { createRenderer, STATE, ICON_MARK, PALETTE, rgb } from '../render/gl.js';
import { createSound } from '../ui/sound.js';

const $ = (id) => document.getElementById(id);
const q = new URLSearchParams(location.search);
const seed = +(q.get('seed') || ((Date.now() / 1000) | 0) % 100000);
const ME = 0, THEM = 1;
const world = createWorld({ seed });
const { U, nodes, ships } = world;
const FILL = [rgb(PALETTE.westFill), rgb(PALETTE.eastFill)], EDGE = [rgb(PALETTE.westEdge), rgb(PALETTE.eastEdge)];
const GOLD = rgb(PALETTE.gold), WHITE = [1, 1, 1], NEUTRAL_F = rgb('#3A4258'), NEUTRAL_E = rgb('#8A94AD'), DOME_C = rgb('#BFE3FF');
const NODE_SHAPE = { HIVE: 0, FORGE: 1, SPIRE: 2, SHRINE: 4, CAPITAL: 3 };
const ZMIN = 0.06, ZMAX = 0.9;

const canvas = $('field'), R = createRenderer(canvas);
if (!R) { $('nogl').classList.add('on'); throw new Error('no webgl2'); }
const sound = createSound();
const view = { x: nodes[world.CAPITALS[ME]].x + 1200, y: H / 2, zoom: innerWidth < 1000 ? 0.22 : 0.3, rot: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, shake: { x: 0, y: 0 }, time: 0, field: { W, H }, open: { nodes: new Float32Array(64 * 4), n: nodes.length }, jolt: null };
const state = { sel: 0, follow: true, fx: [], booms: [], plates: [], plate: null, shake: 0 };

// ---- THE GLASS: the field between the strip and the tray; the minimap in the top-right corner of it
const mini = { view: { x: W / 2, y: H / 2, zoom: 0.01, rot: 0, rect: { x: 0, y: 0, w: 1, h: 1 }, shake: { x: 0, y: 0 } }, fill: miniFill };
function layout() {
  const top = $('strip').getBoundingClientRect().bottom, bottom = $('tray').getBoundingClientRect().top;
  Object.assign(view.rect, { x: 0, y: top, w: innerWidth, h: Math.max(1, bottom - top) });
  const mw = Math.min(innerWidth < 600 || innerHeight < 500 ? 160 : 230, innerWidth * 0.3), mh = mw * H / W;   // a short glass keeps its field
  Object.assign(mini.view.rect, { x: innerWidth - mw - 8, y: top + 8, w: mw, h: mh }); mini.view.zoom = mw / W;
  Object.assign($('minimap').style, { left: mini.view.rect.x + 'px', top: mini.view.rect.y + 'px', width: mw + 'px', height: mh + 'px' });
}
addEventListener('resize', layout);

// ---- THE TRAY: four battleship cards, the chosen ship's two powers and its AUTO, the rally
const tray = $('tray');
tray.innerHTML = `<div class="ships">${SHIPS.map((s, k) => `<button class="ship" data-k="${k}"><b>${k + 1} ${s.id}</b><i><span></span></i><em></em></button>`).join('')}</div>
  <div class="powers"><button class="pw" data-p="0"><b></b><i></i></button><button class="pw" data-p="1"><b></b><i></i></button><button class="auto">AUTO</button></div>
  <div class="rally"><b>RALLY</b><em>tap an outpost</em><button class="off">×</button></div>`;
const shipBtns = [...tray.querySelectorAll('.ship')], pwBtns = [...tray.querySelectorAll('.pw')], autoBtn = tray.querySelector('.auto'), rallyEm = tray.querySelector('.rally em'), rallyOff = tray.querySelector('.rally .off');
shipBtns.forEach((b, k) => b.addEventListener('click', () => choose(k)));
pwBtns.forEach((b, p) => b.addEventListener('click', () => firePower(p)));
autoBtn.addEventListener('click', () => { sound.wake(); const sh = ships[ME][state.sel]; world.apply({ op: 'auto', team: ME, slot: state.sel, on: !sh.auto }); });
rallyOff.addEventListener('click', () => world.apply({ op: 'unrally', team: ME }));
function choose(k) { sound.wake(); state.sel = k; state.follow = true; sound.play('tap'); }
function firePower(p) { sound.wake(); if (world.apply({ op: 'power', team: ME, slot: state.sel, k: p })) sound.play('surge', ME); }
function syncTray() {
  ships[ME].forEach((sh, k) => {
    const b = shipBtns[k], alive = sh.i >= 0, frac = alive ? U.hp[sh.i] / SHIPS[k].hp : 0;
    b.classList.toggle('sel', k === state.sel); b.classList.toggle('down', !alive);
    b.querySelector('span').style.width = (frac * 100).toFixed(0) + '%';
    b.querySelector('em').textContent = alive ? (sh.auto ? 'AUTO' : 'YOU') : 'REBUILD ' + Math.max(0, sh.back - world.time).toFixed(0) + 's';
  });
  const sh = ships[ME][state.sel], spec = SHIPS[state.sel];
  pwBtns.forEach((b, p) => {
    const cd = sh.cd[p], ready = cd <= 0 && sh.i >= 0;
    b.querySelector('b').textContent = (p ? 'E ' : 'Q ') + spec.powers[p];
    b.querySelector('i').textContent = ready ? 'READY' : sh.i < 0 ? '—' : cd.toFixed(0) + 's';
    b.classList.toggle('ready', ready); b.style.setProperty('--p', ready ? 1 : 1 - cd / spec.cds[p]);
  });
  autoBtn.classList.toggle('on', sh.auto);
  const r = world.S.rally[ME];
  rallyEm.textContent = r >= 0 ? `${nodes[r].kind} · ${Math.max(0, world.S.rallyUntil[ME] - world.time).toFixed(0)}s` : 'tap an outpost';
  rallyOff.style.visibility = r >= 0 ? 'visible' : 'hidden';
  const left = Math.max(0, 720 - world.time);
  $('clock').textContent = `${(left / 60) | 0}:${String((left % 60) | 0).padStart(2, '0')}`;
  $('score').innerHTML = `<b class="w">${world.owned(ME)}</b> OUTPOSTS <b class="e">${world.owned(THEM)}</b>`;
  $('armies').innerHTML = `<b class="w">${U.count[ME]}</b> ARMY <b class="e">${U.count[THEM]}</b>`;
}

// ---- THE HAND on the field: a tap commands, a drag looks, a pinch or the wheel zooms
const ptrs = new Map(); let down = null, pinch = 0;
const toWorld = (sx, sy) => R.toWorld(view, sx, sy), toScreen = (wx, wy) => R.toScreen(view, wx, wy);
canvas.addEventListener('pointerdown', (e) => { sound.wake(); canvas.setPointerCapture(e.pointerId); ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY }); if (ptrs.size === 1) down = { x: e.clientX, y: e.clientY, t: performance.now(), moved: false }; else { down = null; pinch = spread(); } });
canvas.addEventListener('pointermove', (e) => {
  const p = ptrs.get(e.pointerId); if (!p) return;
  const dx = e.clientX - p.x, dy = e.clientY - p.y; p.x = e.clientX; p.y = e.clientY;
  if (ptrs.size >= 2) { const s = spread(); if (pinch > 0) zoomAt(...centre(), s / pinch); pinch = s; return; }
  if (down && (down.moved || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 10)) { down.moved = true; state.follow = false; view.x -= dx / view.zoom; view.y -= dy / view.zoom; }
});
const lift = (e) => { const was = ptrs.get(e.pointerId); ptrs.delete(e.pointerId); if (ptrs.size < 2) pinch = 0; if (down && was && !down.moved && performance.now() - down.t < 400) tap(e.clientX, e.clientY); if (!ptrs.size) down = null; };
canvas.addEventListener('pointerup', lift); canvas.addEventListener('pointercancel', (e) => { ptrs.delete(e.pointerId); down = null; });
canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0015)); }, { passive: false });
function spread() { const v = [...ptrs.values()]; return v.length < 2 ? 0 : Math.hypot(v[0].x - v[1].x, v[0].y - v[1].y); }
function centre() { const v = [...ptrs.values()]; return [(v[0].x + v[1].x) / 2, (v[0].y + v[1].y) / 2]; }
function zoomAt(sx, sy, f) { const [wx, wy] = toWorld(sx, sy); view.zoom = Math.max(ZMIN, Math.min(ZMAX, view.zoom * f)); const [nx, ny] = toWorld(sx, sy); view.x += wx - nx; view.y += wy - ny; }
function tap(sx, sy) {
  const [wx, wy] = toWorld(sx, sy);
  // a battleship of mine under the finger: take its helm
  for (let k = 0; k < 4; k++) { const sh = ships[ME][k]; if (sh.i < 0) continue; const [px, py] = toScreen(U.x[sh.i], U.y[sh.i]); if (Math.hypot(px - sx, py - sy) < Math.max(26, SHIPS[k].r * view.zoom + 10)) { choose(k); return; } }
  // an outpost: rally there, and the chosen ship flies there too
  for (let n = 0; n < nodes.length; n++) { const [px, py] = toScreen(nodes[n].x, nodes[n].y); if (Math.hypot(px - sx, py - sy) < Math.max(26, (60 + nodes[n].size * 14) * view.zoom)) { world.apply({ op: 'rally', team: ME, node: n }); world.apply({ op: 'move', team: ME, slot: state.sel, x: nodes[n].x, y: nodes[n].y }); sound.play('muster', ME); say(`REINFORCEMENTS → ${nodes[n].kind}`, ME); return; } }
  world.apply({ op: 'move', team: ME, slot: state.sel, x: wx, y: wy }); sound.play('tap');
}
$('minimap').addEventListener('pointerdown', (e) => { const r = mini.view.rect; view.x = ((e.clientX - r.x) / r.w) * W; view.y = ((e.clientY - r.y) / r.h) * H; state.follow = false; });
addEventListener('keydown', (e) => {
  if (e.key >= '1' && e.key <= '4') choose(+e.key - 1);
  else if (e.key === 'q' || e.key === 'Q') firePower(0);
  else if (e.key === 'e' || e.key === 'E') firePower(1);
  else if (e.key === 'r' || e.key === 'R') world.apply({ op: 'unrally', team: ME });
  else if (e.key === 'f' || e.key === 'F') state.follow = true;
});

// ---- THE PLATES: one line of news at a time
function say(text, team) { state.plates.push({ text, team }); if (state.plates.length > 3) state.plates.shift(); }
function syncPlate(now) {
  const el = $('plate');
  if (state.plate && now > state.plate.until) { state.plate = null; el.classList.remove('on'); }
  if (!state.plate && state.plates.length) { const p = state.plates.shift(); state.plate = { ...p, until: now + 2200 }; el.textContent = p.text; el.className = 'on t' + p.team; }
}
function events(now) {
  for (const e of world.events) {
    switch (e.t) {
      case 'shot': state.fx.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, team: e.team, kind: e.kind, at: now }); break;
      case 'boom': state.booms.push({ x: e.x, y: e.y, r: e.r, team: e.team, at: now }); break;
      case 'die': if (state.booms.length < 600) state.booms.push({ x: e.x, y: e.y, r: KINDS[e.kind].r * 2.2, team: e.team, at: now, small: true }); break;
      case 'taken': say(e.team === ME ? `TAKEN · ${e.kind}` : `THEY TOOK A ${e.kind}`, e.team); sound.play(e.team === ME ? 'capture' : 'lost', e.team); break;
      case 'shipDown': say(e.team === ME ? `YOUR ${SHIPS[e.slot].id} IS DOWN · BACK IN 25 S` : `THEIR ${SHIPS[e.slot].id} IS DOWN`, e.team === ME ? THEM : ME); sound.play('shatter', e.team); state.booms.push({ x: e.x, y: e.y, r: 420, team: e.team, at: now, big: true }); state.shake = now + 450; break;
      case 'power': if (e.team === THEM) say(`THEY FIRE ${e.name}`, THEM); state.booms.push({ x: e.x, y: e.y, r: 300, team: e.team, at: now, ring: true }); break;
      case 'warp': state.fx.push({ x1: e.x1, y1: e.y1, x2: e.x2, y2: e.y2, team: e.team, kind: -3, at: now }); break;
      case 'end': endScreen(e); break;
    }
  }
}
function endScreen(e) {
  const won = e.winner === ME;
  $('endword').textContent = e.winner < 0 ? 'A DRAW' : won ? 'VICTORY' : 'DEFEAT';
  $('endwhy').textContent = e.why === 'capital' ? (won ? 'their capital is yours' : 'they took your capital') : `the clock: ${world.owned(ME)} outposts to ${world.owned(THEM)}`;
  $('end').classList.add('on'); sound.play(won ? 'win' : 'lose');
}
$('again').addEventListener('click', () => { const u = new URL(location.href); u.searchParams.set('seed', String((seed * 7 + 13) % 100000)); location.href = u.toString(); });
$('sound').addEventListener('click', () => { sound.wake(); $('sound').textContent = sound.toggle() ? 'SOUND OFF' : 'SOUND ON'; });

// ---- THE PAINT
const ring = (out, x, y, r, px, c, a) => out.body(x, y, r, 4, c[0], c[1], c[2], a, c[0], c[1], c[2], 0, px / (r * view.zoom), 0, 0, STATE.NOFLOOR);
function arc(out, x, y, r, frac, hw, c, a) { const n = Math.max(6, (40 * frac) | 0); let px = x, py = y - r; for (let i = 1; i <= n; i++) { const t = -Math.PI / 2 + (i / n) * frac * Math.PI * 2, qx = x + Math.cos(t) * r, qy = y + Math.sin(t) * r; out.line(px, py, qx, qy, hw, c[0], c[1], c[2], a, a); px = qx; py = qy; } }
function fill(out, now) {
  const z = view.zoom, wu = (px) => px / z;
  // the roads
  for (let n = 0; n < nodes.length; n++) for (const m of nodes[n].links) if (m > n) { const a = nodes[n], b = nodes[m], same = a.team >= 0 && a.team === b.team, c = same ? EDGE[a.team] : NEUTRAL_E; out.line(a.x, a.y, b.x, b.y, wu(same ? 1 : 0.75), c[0], c[1], c[2], same ? 0.35 : 0.18, same ? 0.35 : 0.18); }
  // the outposts: a ring in its owner's colour, its kind's shape at the heart, the control arc while it changes hands, the rally in gold
  for (let n = 0; n < nodes.length; n++) {
    const o = nodes[n], rr = 60 + o.size * 14, f = o.team >= 0 ? FILL[o.team] : NEUTRAL_F, e = o.team >= 0 ? EDGE[o.team] : NEUTRAL_E;
    ring(out, o.x, o.y, rr, 3, e, 1);
    out.body(o.x, o.y, rr * 0.5, NODE_SHAPE[o.kind], f[0], f[1], f[2], 0.85, e[0], e[1], e[2], 0, 0, ICON_MARK[NODE_SHAPE[o.kind]], 0, STATE.NOFLOOR);
    if (Math.abs(o.prog) < 0.999) arc(out, o.x, o.y, rr + wu(7), Math.abs(o.prog), wu(2), o.prog > 0 ? EDGE[0] : EDGE[1], 0.9);
    if (o.kind === 'CAPITAL') ring(out, o.x, o.y, rr + wu(14), 2, e, 0.6);
    if (world.S.rally[ME] === n) { const ph = (now % 900) / 900; ring(out, o.x, o.y, rr * (1.3 + ph * 0.6), 3, GOLD, 1 - ph); ring(out, o.x, o.y, rr * 1.25, 2, GOLD, 0.9); }
  }
  // the armies
  for (let i = 0; i < U.hi; i++) {
    if (!U.alive[i]) continue;
    const k = KINDS[U.kind[i]], t = U.team[i], f = FILL[t], e = EDGE[t];
    const rot = k.shape === 2 || k.shape === 5 ? Math.atan2(U.vy[i], U.vx[i]) + Math.PI / 2 : 0;
    out.body(U.x[i], U.y[i], k.r, k.shape, f[0], f[1], f[2], 1, e[0], e[1], e[2], rot, k.shape === 4 ? 0.3 : 0, ICON_MARK[k.shape], 0, U.stun[i] > 0 ? STATE.STUN : 0);
  }
  // the battleships: the hull arc, the dome, mine in gold, the chosen one's helm line
  for (let t = 0; t < 2; t++) for (const sh of ships[t]) {
    if (sh.i < 0) continue;
    const x = U.x[sh.i], y = U.y[sh.i], k = SHIPS[sh.slot], e = EDGE[t];
    arc(out, x, y, k.r + wu(9), Math.max(0, U.hp[sh.i] / k.hp), wu(2.5), U.hp[sh.i] < k.hp * 0.3 ? rgb(PALETTE.loses) : e, 1);
    if (sh.dome > world.time) ring(out, x, y, 520, 2, DOME_C, 0.5);
    if (t === ME) {
      ring(out, x, y, k.r + wu(16), sh.slot === state.sel ? 3 : 1.5, GOLD, sh.slot === state.sel ? 1 : 0.5);
      if (sh.slot === state.sel && !sh.auto && Math.hypot(sh.steer[0] - x, sh.steer[1] - y) > k.r * 2) { out.line(x, y, sh.steer[0], sh.steer[1], wu(0.75), GOLD[0], GOLD[1], GOLD[2], 0.6, 0.2); ring(out, sh.steer[0], sh.steer[1], wu(8), 1.5, GOLD, 0.9); }
    }
  }
  // the fire: tracers 120 ms, a warp's streak 300 ms, the shells' marks where they will land
  state.fx = state.fx.filter((s) => now - s.at < (s.kind === -3 ? 300 : 120));
  for (const s of state.fx) { const a = 1 - (now - s.at) / (s.kind === -3 ? 300 : 120), e = s.kind === -2 || s.kind === -3 ? GOLD : EDGE[s.team], w = s.kind >= UNITS.length || s.kind < 0 ? 1.6 : 0.6; out.line(s.x1, s.y1, s.x2, s.y2, wu(w), e[0], e[1], e[2], 0.15 * a, 0.9 * a); out.line(s.x2 - (s.x2 - s.x1) * 0.06, s.y2 - (s.y2 - s.y1) * 0.06, s.x2, s.y2, wu(w + 0.4), WHITE[0], WHITE[1], WHITE[2], a, a); }
  for (const sl of world.S.shells) { const left = sl.at - world.time, e = EDGE[sl.team]; ring(out, sl.x, sl.y, sl.r * (0.4 + 0.6 * Math.max(0, 1 - left)), 1.5, sl.big ? GOLD : e, 0.7); }
  state.booms = state.booms.filter((b) => now - b.at < (b.big ? 900 : 380));
  for (const b of state.booms) { const life = b.big ? 900 : 380, p = (now - b.at) / life, e = EDGE[b.team]; ring(out, b.x, b.y, b.r * (b.small ? 0.6 + p * 0.6 : 0.3 + p * 0.9), b.big ? 4 : b.small ? 1 : 2, b.ring ? GOLD : b.small ? e : WHITE, (1 - p) * (b.small ? 0.7 : 0.9)); }
}
function miniFill(out) {
  const k = mini.view.zoom;
  for (const o of nodes) { const c = o.team >= 0 ? EDGE[o.team] : NEUTRAL_E; out.body(o.x, o.y, (o.kind === 'CAPITAL' ? 4 : 2.5) / k, 4, c[0], c[1], c[2], 1, c[0], c[1], c[2], 0, 0.45, 0, 0, STATE.NOFLOOR); }
  const r = view.rect, [x0, y0] = toWorld(r.x, r.y), [x1, y1] = toWorld(r.x + r.w, r.y + r.h), g = GOLD, hw = 0.75 / k;
  out.line(x0, y0, x1, y0, hw, g[0], g[1], g[2], 0.9, 0.9); out.line(x1, y0, x1, y1, hw, g[0], g[1], g[2], 0.9, 0.9); out.line(x1, y1, x0, y1, hw, g[0], g[1], g[2], 0.9, 0.9); out.line(x0, y1, x0, y0, hw, g[0], g[1], g[2], 0.9, 0.9);
}

// ---- THE CAMERA: it rides the chosen battleship until you drag away (tap its card, or F, to ride again)
function camera(now) {
  const sh = ships[ME][state.sel];
  if (state.follow && sh.i >= 0) { view.x += (U.x[sh.i] - view.x) * 0.08; view.y += (U.y[sh.i] - view.y) * 0.08; }
  const half = (view.rect.w / view.zoom) / 2; view.x = Math.max(-half * 0.3, Math.min(W + half * 0.3, view.x)); view.y = Math.max(0, Math.min(H, view.y));
  if (now < state.shake) { const a = Math.random() * 6.28, amp = 10 * (state.shake - now) / 450; view.shake.x = Math.cos(a) * amp; view.shake.y = Math.sin(a) * amp; } else { view.shake.x = 0; view.shake.y = 0; }
  nodes.forEach((o, n) => view.open.nodes.set([o.x, o.y, o.team, 1300 + o.size * 150 + (o.kind === 'CAPITAL' ? 400 : 0)], n * 4));
}

// ---- THE LOOP
layout();
let last = performance.now(), acc = 0, fps = 0, fpsN = 0, fpsT = 0;
function loop(now) {
  const real = Math.min(0.1, (now - last) / 1000); last = now;
  acc += real; let steps = 0;
  while (acc >= TICK && steps < 4) { world.step(); events(now); acc -= TICK; steps++; }
  if (steps === 4) acc = 0;
  camera(now);
  view.time = now / 1000;
  R.frame(view, (out) => fill(out, now), mini);
  syncTray(); syncPlate(now);
  fpsN++; fpsT += real; if (fpsT >= 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);
say('TAP AN OUTPOST TO SEND YOUR ARMY · TAP A SHIP TO FLY IT', ME);
window.WAR = { world, view, state, R, seed, get fps() { return fps; } };
