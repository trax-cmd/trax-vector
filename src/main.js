// main.js — THE LOOP AND THE CAMERA. The sim ticks thirty times a second whatever the frame rate - slowed to
// 0.35× for the eight tenths of a second after a shatter - and the frame draws what the sim says through
// paint.js; the captain ticks beside the sim. The camera FOLLOWS a lane: the point an order was dropped on,
// else where that lane's bodies are dying, else the gap between its fronts, and it moves only when that point
// leaves the middle of the glass. Everything the glass shows that is not the field is routed from here: the
// sim's events become plates (announce.js), motifs (sound.js), light (vfx.js) and the three screen-wide
// moments of a shatter - the white flash, the shake and the jolt. Everything is on window.VECTOR so a probe,
// a tool or a relay drives the same match a person is watching. (SPEC-v0.6 §2.2, §5.2, §6.2, §9.7, §10.16)
//
// Clocks: `nowMs` is performance.now() milliseconds - state.slowUntil, shake.until, flashUntil, the follow's
// orderedAt and lastOrderAt (drag.js's stamps) and its chosenAt all read on it; paint.fill takes seconds on the same clock;
// the counter moments and the follow's deaths are timed on sim.time, so slow-time does not stretch them.
import { createSim, TICK, TEMPERS } from './sim/sim.js';
import { createBot } from './ai/bot.js';
import { advise } from './ai/coach.js';
import { BEATS, ROLE_GLYPH } from './sim/library.js';
import { W, H, LANE_Y, HALF, GATE_X, KEEP_X, CP_X, CENTRE, CP_R, DROP_MIN, DROP_MAX, cp, gate } from './sim/lanes.js';
import { createRenderer } from './render/gl.js';
import { createVfx } from './render/vfx.js';
import { createPaint } from './render/paint.js';
import { createMinimap } from './render/minimap.js';
import { createHud } from './ui/hud.js';
import { createDrag } from './ui/drag.js';
import { createAnnounce } from './ui/announce.js';
import { createInput } from './ui/input.js';
import { createSound } from './ui/sound.js';
import { createRelayClient } from './ui/relay.js';

// THE BUDGETS (§1, §2.2, §2.7, §4.8, §5.2, §6.2)
const ZOOM = { portrait: 0.46, landscape: 0.30, desk: 0.45 };   // the battle zoom per glass
const SLOW_MS = 800, SLOW_X = 0.35;                              // slow-time after a shatter (vfx asks for 0.8 s; the number rides in its request)
const FLASH_MS = 250, FLASH_A = 0.35;                            // the white flash, eased out
const SHAKE_MS = 500;                                            // the shake decays over half a second
const ORDER_MS = 6000, HEAT_MS = 12000;                          // an order holds the follow on its drop x for 6 s; 12 s without one the hottest lane
const LOOK_MS = 6000;                                            // a minimap tap looks at its x this long - the spec names follow(lane, x) without a hold, so an order's is borrowed
const DEAD_ZONE = 0.5, CHASE = 0.08, REFOLLOW = 0.25;            // the camera moves only when the point leaves the middle half of the rect; its two lerps
const DEATHS_S = 3;                                              // the follow reads the last 3 s of a lane's deaths
const ALARM_MS = 3000, ALARM_AMT = 0.18;                         // a wave's alarm on the band: the enemy fill pulsing at 1 Hz
const SURGE_MS = 8000, SURGE_HOT_MS = 300, SURGE_HOT = 0.5, SURGE_AMT = 0.15;   // a surge on the band
const MOMENT_N = 4, MOMENT_R = 400, MOMENT_S = 1, MOMENT_GAP_S = 4, MOMENT_HOLD_S = 2.2, MOMENT_RISE_PX = 40;   // §6.2 counter moments
const SNAP_TICKS = 30;                                           // the snapshot and the coach's advice, once a second
const TAP_MS = 300, TAP_PX = 10;                                 // a tap on the minimap

const $ = (id) => document.getElementById(id);
const judgeGlass = () => (innerHeight > innerWidth ? 'portrait' : innerWidth < 1000 ? 'landscape' : 'desk');
function reload(params) { const u = new URL(location.href); for (const [k, v] of Object.entries(params)) u.searchParams.set(k, String(v)); location.href = u.toString(); }
// the temper asked for, else the one remembered, else NORMAL; remembered for the next match
function pickTemper(asked) {
  let t = asked || '';
  if (!TEMPERS[t]) { try { t = localStorage.getItem('vector_temper') || ''; } catch (e) { t = ''; } }
  if (!TEMPERS[t]) t = 'normal';
  try { localStorage.setItem('vector_temper', t); } catch (e) { /* a private tab keeps no preference */ }
  return t;
}

// ---- THE MATCH
const q = new URLSearchParams(location.search);
const seed = +(q.get('seed') || ((Date.now() / 1000) | 0) % 100000);
const team = q.get('team') === '1' ? 1 : 0, them = 1 - team;
const temper = pickTemper(q.get('temper'));
const sim = createSim({ seed, temper });
const { S, U, T, WL, kinds } = sim;
// who holds each side: the person's side is human unless asked; the far side is the captain, a relay wire, or a second person
const west = q.get('a') || (team === 1 ? 'bot' : 'human'), east = q.get('b') || (team === 0 ? 'bot' : 'human');
const bots = [];
if (west === 'bot') bots.push(createBot(sim, 0, { seed }));
if (east === 'bot') bots.push(createBot(sim, 1, { seed: seed + 1 }));
const relay = q.get('relay') ? createRelayClient(q.get('relay'), sim, east === 'relay' ? 1 : 0) : null;

// ---- THE STATE (§9.7) and THE VIEW (§9.3)
const glass0 = judgeGlass();
const state = {
  team, glass: glass0, rot: glass0 === 'portrait' ? (team ? 1 : -1) : 0, snap: null, advice: null, drag: null, hold: null,
  follow: { lane: 1, free: false, x: CP_X[CENTRE], y: LANE_Y[1], orderedAt: 0, chosenAt: 0, hot: 0 },   // at the bell the centre lane; chosenAt: the last re-follow or pull (§2.2, below)
  orders: [], lastOrderAt: 0, slowUntil: 0, shake: { amp: 0, until: 0 }, flashUntil: 0, jolt: { x: 0, y: 0, amp: 0, t: -1 },
  deployed: 0, temper, paused: false, labels: null,
};
const view = {
  x: CP_X[CENTRE], y: LANE_Y[1], zoom: ZOOM[glass0], rot: state.rot, rect: { x: 0, y: 0, w: 1, h: 1 }, shake: { x: 0, y: 0 }, time: 0, field: { W, H },
  lanes: LANE_Y.map(() => ({ westTo: GATE_X[0], eastFrom: GATE_X[1], frontW: 1500, frontE: 7500, chevW: 1, chevE: -1, fxTeam: -1, fxAmt: 0, broken: 0 })),
  jolt: state.jolt,
};

// ---- THE MODULES, in the order they lean on each other: the hud fills the hand before the minimap and the rect measure it
const canvas = $('field');
const R = createRenderer(canvas);
if (!R) { $('nogl').classList.add('on'); throw new Error('no webgl2'); }
const vfx = createVfx(kinds, sim);
const sound = createSound();
const hud = createHud(sim, state, R, state.glass);
const minimap = createMinimap({ R, sim, state, el: $('minimap'), glass: state.glass, view });
const paint = createPaint({ sim, vfx, state, R });
const announce = createAnnounce({ el: $('plate'), state, follow: followLane, sound });
const drag = createDrag({ canvas, R, sim, state, hud, minimap, announce, sound, order, surge, coach: () => state.advice, glass: state.glass, view });
createInput(canvas, view, state, { follow: followLane, free: () => { state.follow.free = true; }, cancelDrag: drag.cancel, tap: (i) => drag.tapCard(i), digitLane: (i, lane) => drag.tapCard(i, lane), wake: sound.wake });
const surgeEl = $('surge'), handEl = $('hand'), flashEl = $('flash');

// ---- THE GLASS: judged on every resize; the rot turns the field up on a phone held upright, the rect is what the chrome leaves clear
function layout() {
  const g = judgeGlass(), changed = g !== state.glass;
  state.glass = g; document.body.dataset.glass = g;
  state.rot = view.rot = g === 'portrait' ? (team ? 1 : -1) : 0;
  if (changed) view.zoom = ZOOM[g];
  minimap.layout(g);
  const s = surgeEl.getBoundingClientRect(), h = handEl.getBoundingClientRect();
  view.rect.x = 0; view.rect.y = s.bottom; view.rect.w = innerWidth; view.rect.h = Math.max(1, h.top - s.bottom);
}
layout();
addEventListener('resize', layout);

// ---- THE ORDERS a person gives (drag.js calls these; the sim judges them)
function order(i, lane, x) {
  const ok = sim.apply({ op: 'deploy', team, batt: i, lane, x });
  if (ok) { state.deployed++; sound.play('muster', team); }
  return ok;
}
function surge(lane) { return sim.apply({ op: 'surge', team, lane }); }

// ---- THE FOLLOW (§2.2). The followed point of a lane: its last order's drop x for 6 s, else the centroid of its deaths in
// the last 3 s, else the gap between its fronts; clamped to the run unless the enemy gate is dead, then as far as the keeps.
// THE LANE: the one last chosen - by an order (drag.js stamps lastOrderAt), by a re-follow or by a pull - and twelve seconds
// after the last choice the hottest lane. The spec's twelve seconds run "with no order"; a re-follow and a pull restart them
// too (the critic's round 3: with the clock read off orders alone, twelve seconds past the last order the heat took every
// tap back on the very next frame), so follow.chosenAt carries them and the heat waits on the newer of the two stamps.
const cam = { chasing: true, k: REFOLLOW, look: null };   // look: a minimap tap's { lane, x, until }, the camera's own 6 s pin
const deaths = LANE_Y.map(() => []);                       // per lane, { x, t } on sim.time
function choose(lane, nowMs) {
  const f = state.follow;
  f.lane = lane; f.free = false; f.chosenAt = nowMs; cam.chasing = true;
}
// a minimap tap, a strip arrow, a plate, a double-tap on the field: a re-follow lands in 200 ms
function followLane(lane, x) {
  const at = performance.now();
  choose(lane, at); cam.k = REFOLLOW;
  cam.look = x === undefined ? null : { lane, x, at, until: at + LOOK_MS };
}
// news pulls the follow - a wave plate for a lane, a shatter in it - unless a drag is live or an order is fresh
function pull(lane, nowMs) {
  if (lane < 0 || lane > 2 || drag.active || nowMs - state.lastOrderAt < ORDER_MS) return;
  choose(lane, nowMs);
}
// twelve seconds without a choice, the camera goes where the killing is
function heat(nowMs) {
  const f = state.follow;
  if (nowMs - Math.max(state.lastOrderAt, f.chosenAt) < HEAT_MS) return;
  const sum = S.killsRing.sum;
  let best = f.lane;
  for (let l = 0; l < 3; l++) if (sum[l] > sum[best]) best = l;
  if (best !== f.lane) { f.lane = best; cam.chasing = true; }
}
function deathX(l) {
  const list = deaths[l];
  while (list.length && sim.time - list[0].t > DEATHS_S) list.shift();
  if (!list.length) return null;
  let x = 0; for (const d of list) x += d.x;
  return x / list.length;
}
function followPoint(l, nowMs) {
  const orders = state.orders;
  let x = null, at = -Infinity;
  if (cam.look && cam.look.lane === l && nowMs < cam.look.until) { x = cam.look.x; at = cam.look.at; }
  for (let i = orders.length - 1; i >= 0 && nowMs - orders[i].at < ORDER_MS; i--) if (orders[i].lane === l) { if (orders[i].at > at) x = orders[i].x; break; }   // the newer of a tap's pin and the last order wins
  if (x === null) x = deathX(l);
  if (x === null) x = (S.front.w[l] + S.front.e[l]) / 2;
  const open = !T.alive[gate(them, l)];   // the enemy gate dead: the yard keep is in reach
  return [Math.max(open && them === 0 ? KEEP_X[0] : DROP_MIN, Math.min(open && them === 1 ? KEEP_X[1] : DROP_MAX, x)), LANE_Y[l]];
}
function camera(nowMs) {
  const f = state.follow;
  f.hot = S.killsRing.sum[f.lane];
  if (f.free || drag.active) return;   // a freed camera stays where it was put; nothing moves under a live drag but its own edge pan
  heat(nowMs);
  const [px, py] = followPoint(f.lane, nowMs), r = view.rect, [sx, sy] = R.toScreen(view, px, py);
  if (Math.abs(sx - view.shake.x - (r.x + r.w / 2)) > r.w * DEAD_ZONE / 2 || Math.abs(sy - view.shake.y - (r.y + r.h / 2)) > r.h * DEAD_ZONE / 2) cam.chasing = true;
  if (!cam.chasing) return;
  view.x += (px - view.x) * cam.k; view.y += (py - view.y) * cam.k;
  if (Math.hypot(px - view.x, py - view.y) * view.zoom < 0.5) { cam.chasing = false; cam.k = CHASE; }
}
// a tap on the minimap follows the lane under the finger at that x (§2.10); a card dropped there is drag.js's affair
{
  const el = $('minimap'); let down = null;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener('pointerup', (e) => {
    const d = down; down = null;
    if (!d || drag.active || performance.now() - d.t > TAP_MS || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX) return;
    const h = minimap.hit(e.clientX, e.clientY);
    if (h.inside) followLane(h.lane, h.x);
  });
}

// ---- THE COUNTER MOMENTS (§6.2): four kills of one role by a role that beats it, within a second and a 400-wu circle, print the lesson
const recent = [];                                    // the last second's kills: { x, y, lane, a, b, t }
const momentAt = [-Infinity, -Infinity, -Infinity];   // per lane: one moment per 4 s
function counterMoment(e) {
  if (e.by < 0 || e.lane > 2) return;
  const a = kinds[e.by].shape, b = kinds[e.kind].shape, t = sim.time;
  while (recent.length && t - recent[0].t > MOMENT_S) recent.shift();
  if (!BEATS[a].includes(b)) return;
  recent.push({ x: e.x, y: e.y, lane: e.lane, a, b, t });
  if (t - momentAt[e.lane] < MOMENT_GAP_S) return;
  const same = recent.filter((d) => d.lane === e.lane && d.a === a && d.b === b);
  if (same.length < MOMENT_N) return;
  let cx = 0, cy = 0; for (const d of same) { cx += d.x; cy += d.y; } cx /= same.length; cy /= same.length;
  if (same.filter((d) => (d.x - cx) ** 2 + (d.y - cy) ** 2 <= MOMENT_R * MOMENT_R).length < MOMENT_N) return;
  momentAt[e.lane] = t;
  labels.moment(cx, cy, `${ROLE_GLYPH[a]} BEATS ${ROLE_GLYPH[b]}`, 1 - e.team);
}

// ---- THE LABELS: DOM words on the field, so they read on any glass - the 2× on every centre, the coach's ONE WORD at his bar, the lessons.
// #labels (z-index 7) lies over the strip, the surge band AND the minimap, so a label keeps off the chrome by its own box (§4.1,
// §11.3): hidden when its point is off the clear field rect, its box pinned inside the rect otherwise, and off the minimap's rect,
// which takes precedence over anything on the field (§2.10) - the map lies inside the rect on every glass, so the pin alone seated
// the coach's word on the map's border and keep glyphs (the critic's round 3). A box is measured once, at birth - a hidden
// element measures 0 - and the word is born as the widest verb, so its pin holds for every verb the coach speaks.
const labels = (() => {
  const layer = $('labels');
  const PAD = 4;   // a box keeps this off the rect's edges and off the map
  const make = (cls, text) => {
    const el = document.createElement('div'); el.className = cls; el.textContent = text; layer.appendChild(el);
    const rec = { el, w: el.offsetWidth, h: el.offsetHeight };
    el.style.display = 'none';
    return rec;
  };
  const word = make('lbl word', 'DEFEND'), twice = LANE_Y.map(() => make('lbl gold', '2×'));
  word.el.textContent = '';   // born wide, printed on the coach's verb
  const live = [];   // the moments: { el, w, h, x, y, at }
  const put = (rec, sx, sy, on) => { rec.el.style.display = on ? 'block' : 'none'; if (on) rec.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`; };
  const inRect = (sx, sy) => { const r = view.rect; return sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h; };
  // a box hanging from its bottom centre (x, y), PAD inside the given rect
  const fits = (rec, x, y, r) => x - rec.w / 2 >= r.x + PAD && x + rec.w / 2 <= r.x + r.w - PAD && y - rec.h >= r.y + PAD && y <= r.y + r.h - PAD;
  const onMap = (rec, x, y, m) => m.w > 0 && x + rec.w / 2 > m.x - PAD && x - rec.w / 2 < m.x + m.w + PAD && y > m.y - PAD && y - rec.h < m.y + m.h + PAD;
  // (sx, sy) is the label's bottom centre; the box hanging from it is held inside the rect, then, if that put it on the minimap,
  // stepped off the map - left, right, above or below it - the shortest way that keeps it inside the rect (a map many times
  // narrower than the glass always leaves the way beside it)
  const seat = (rec, sx, sy, on) => {
    const r = view.rect, m = minimap.rect;
    let x = Math.max(r.x + PAD + rec.w / 2, Math.min(r.x + r.w - PAD - rec.w / 2, sx)), y = Math.max(r.y + PAD + rec.h, Math.min(r.y + r.h - PAD, sy));
    if (on && onMap(rec, x, y, m)) {
      const ways = [[m.x - PAD - rec.w / 2, y], [m.x + m.w + PAD + rec.w / 2, y], [x, m.y - PAD], [x, m.y + m.h + PAD + rec.h]];
      let best = null, dist = Infinity;
      for (const [wx, wy] of ways) {
        const d = Math.abs(wx - x) + Math.abs(wy - y);
        if (d < dist && fits(rec, wx, wy, r)) { best = [wx, wy]; dist = d; }
      }
      if (best) [x, y] = best;
    }
    put(rec, x, y, on);
  };
  function moment(x, y, text, side) {
    if (live.length >= 4) live.shift().el.remove();
    live.push({ ...make('lbl t' + side, text), x, y, at: performance.now() });
  }
  // the word sits on his front bar's end at the band's edge; when that bar is off the glass (at the bell the camera looks at the
  // centre and the bar stands at 1500) the seat pins it inside the rect toward it, so the verb is always readable
  function coachWord() {
    const a = state.advice;
    if (!a || sim.result) { put(word, 0, 0, false); return; }
    const [sx, sy] = R.toScreen(view, team ? S.front.e[a.lane] : S.front.w[a.lane], LANE_Y[a.lane] - HALF);
    if (word.el.textContent !== a.verb) word.el.textContent = a.verb;
    seat(word, sx, sy - 4, true);
  }
  // the 2× hangs above its centre ring; where the strip would cut the hang (the centre at the top of the glass) it sits under the ring
  function centreMarks() {
    const gap = CP_R * 1.3 * view.zoom + 4;
    for (let l = 0; l < 3; l++) {
      const [sx, sy] = R.toScreen(view, CP_X[CENTRE], LANE_Y[l]), t = twice[l], hangs = sy - gap - t.h >= view.rect.y + PAD;
      seat(t, sx, hangs ? sy - gap : sy + gap + t.h, inRect(sx, sy));
    }
  }
  function sync(nowMs) {
    centreMarks();
    coachWord();
    for (let i = live.length - 1; i >= 0; i--) {
      const m = live[i], age = (nowMs - m.at) / 1000;
      if (age > MOMENT_HOLD_S) { m.el.remove(); live.splice(i, 1); continue; }
      const [sx, sy] = R.toScreen(view, m.x, m.y);
      seat(m, sx, sy - MOMENT_RISE_PX * age / MOMENT_HOLD_S, inRect(sx, sy));   // a lesson off the rect is never printed over the chrome
      m.el.style.opacity = (age < 0.15 ? age / 0.15 : Math.min(1, (MOMENT_HOLD_S - age) / 0.5)).toFixed(3);
    }
  }
  return { moment, sync, live };
})();
state.labels = labels.live;

// ---- THE EVENT ROUTER: the sim's words become plates, motifs and the follow's pulls (vfx.take reads the same list for the light)
const surgeFx = [null, null];   // per side, { lane, at } of its live surge, for the band's tint
let alarm = null;               // { lane, at, until } the enemy's announced wave, for the band's pulse
function route(e, nowMs) {
  switch (e.t) {
    case 'death': sound.play('death', e.team); if (e.lane <= 2) deaths[e.lane].push({ x: e.x, t: sim.time }); counterMoment(e); break;
    case 'capture': sound.play(e.team === team ? 'capture' : e.from === team ? 'lost' : 'capture', e.team); announce.event(e); break;
    case 'towerHit': if (e.team === team) sound.play('gateHit', e.team); break;
    case 'explode': sound.play('explode', e.team); break;
    case 'shatter': announce.event(e); pull(e.lane, nowMs); break;
    case 'laneBreak': case 'front': case 'doom': announce.event(e); break;
    case 'surge': announce.event(e); surgeFx[e.team] = { lane: e.lane, at: nowMs }; break;
    case 'wave': if (e.team !== team) { announce.event(e); alarm = { lane: e.lane, at: nowMs, until: nowMs + ALARM_MS }; pull(e.lane, nowMs); } break;
    case 'end': sound.play(e.winner === team ? 'win' : 'lose'); break;
    default: break;
  }
}

// ---- THE EVENTS, taken as they land. The sim clears its list at the top of every tick, and an order applied between ticks (a drop,
// the wire, a tool at the console) appends to the last tick's list - so the frame takes what it has not yet taken before every tick
// and at the top of every frame, and nothing a drop announces (a muster ring, a surge plate) is lost.
let taken = 0;
function drain(nowMs) {
  const ev = sim.events;
  if (taken >= ev.length) return;
  const fresh = taken ? ev.slice(taken) : ev;
  vfx.take(fresh);
  for (const e of fresh) route(e, nowMs);
  taken = ev.length;
}

// ---- THE MOMENTS OF A SHATTER (§2.7): vfx asks, the loop answers - the white flash, the shake, the jolt and slow-time
let lastFlash = -1;
function moments(nowMs) {
  const rq = vfx.requests;
  if (rq.flash) { state.flashUntil = nowMs + FLASH_MS; rq.flash = 0; }
  if (rq.shake) { state.shake.amp = rq.shake; state.shake.until = nowMs + SHAKE_MS; rq.shake = 0; }
  if (rq.slow) { state.slowUntil = nowMs + (rq.slow * 1000 || SLOW_MS); rq.slow = 0; }
  const j = rq.jolt;
  state.jolt.t = j ? (nowMs - j.t0) / 1000 : -1;   // the field shader reads t outside [0, 0.4) as no jolt
  if (j) { state.jolt.x = j.x; state.jolt.y = j.y; state.jolt.amp = j.amp; }
  const left = state.flashUntil - nowMs, op = left > 0 ? FLASH_A * (left / FLASH_MS) ** 2 : 0;   // 0.35 falling to 0, quick at first
  if (op !== lastFlash) { flashEl.style.opacity = op.toFixed(3); lastFlash = op; }
  const sh = state.shake.until - nowMs;
  if (sh > 0) { const a = Math.random() * 6.283, amp = state.shake.amp * sh / SHAKE_MS; view.shake.x = Math.cos(a) * amp; view.shake.y = Math.sin(a) * amp; }
  else { view.shake.x = 0; view.shake.y = 0; }
}

// ---- THE LANES AS THE FIELD SHADER READS THEM (§2.8): the held segments, the fronts and their chevrons, the broken bars, and ONE tint
// per lane, ranked: the drag's light on the lit lane, a live surge, the enemy wave's alarm, the coach's gold on his own bar
function laneFx(l, nowMs) {
  const fx = state.laneFx;
  if (fx && fx.amt[l] > 0) return [fx.team, 0.12 * fx.amt[l]];
  for (const t of [team, them]) { const s = surgeFx[t]; if (s && s.lane === l && nowMs - s.at < SURGE_MS) return [t, nowMs - s.at < SURGE_HOT_MS ? SURGE_HOT : SURGE_AMT]; }
  if (alarm && alarm.lane === l && nowMs < alarm.until) return [them, ALARM_AMT * (0.5 - 0.5 * Math.cos((nowMs - alarm.at) / 1000 * 6.283))];
  const a = state.advice;
  if (a && a.lane === l && !sim.result) return [2 + team, 0.8 + 0.2 * Math.sin(nowMs / 1000 * 6.283)];   // 1.0 → 0.6 at 1 Hz
  return [-1, 0];
}
function syncLanes(nowMs) {
  const F = S.front;
  for (let l = 0; l < 3; l++) {
    const ln = view.lanes[l];
    let westTo = GATE_X[0], eastFrom = GATE_X[1];
    for (let s = 0; s < 5 && WL.owner[cp(l, s)] === 0; s++) westTo = CP_X[s];
    for (let s = 4; s >= 0 && WL.owner[cp(l, s)] === 1; s--) eastFrom = CP_X[s];
    ln.westTo = westTo; ln.eastFrom = eastFrom;
    ln.frontW = F.w[l]; ln.frontE = F.e[l]; ln.chevW = F.chevW[l]; ln.chevE = F.chevE[l];
    ln.broken = T.alive[gate(0, l)] && T.alive[gate(1, l)] ? 0 : 1;
    [ln.fxTeam, ln.fxAmt] = laneFx(l, nowMs);
  }
}

// ---- THE SHEET behind the ⋯: the sound, the temper (a new match), the stamp; PLAY AGAIN deals a new seed
const sheet = $('sheet'), soundBtn = $('sound');
$('more').addEventListener('click', () => sheet.classList.toggle('open'));
soundBtn.textContent = sound.muted ? 'SOUND OFF' : 'SOUND ON';
soundBtn.addEventListener('click', () => { sound.wake(); soundBtn.textContent = sound.toggle() ? 'SOUND OFF' : 'SOUND ON'; });
$('temper').addEventListener('click', () => { const names = Object.keys(TEMPERS); reload({ temper: names[(names.indexOf(temper) + 1) % names.length], seed }); });
$('again').addEventListener('click', () => reload({ seed: (seed * 7 + 13) % 100000 }));

// ---- THE LOOP
let last = performance.now(), acc = 0, fps = 0, fpsN = 0, fpsT = 0, snapAt = 0, frameS = 0;
const fillMain = (out) => paint.fill(out, view, frameS);
const mini = { view: minimap.view(), fill: (out) => { minimap.draw(out, frameS); paint.miniFill(out, minimap.view(), frameS); } };
function loop(nowMs) {
  const real = Math.min(0.1, (nowMs - last) / 1000); last = nowMs;
  const dt = real * (nowMs < state.slowUntil ? SLOW_X : 1);   // §5.2 slow-time: dt scaled before the accumulator; ticks stay ticks
  drain(nowMs);
  if (!state.paused) {
    acc += dt; let steps = 0;
    while (acc >= TICK && steps < 4) {
      drain(nowMs);   // an order given between ticks put its events on the last tick's list, which the tick is about to wipe
      for (const b of bots) b.tick(); if (relay) relay.tick();
      sim.step(); taken = 0; drain(nowMs);
      acc -= TICK; steps++;
    }
    if (steps === 4) acc = 0;
  }
  if (sim.tick >= snapAt) { snapAt = sim.tick + SNAP_TICKS; state.snap = sim.snapshot(); state.advice = advise(sim, team, state.snap, state.glass); }
  moments(nowMs);
  camera(nowMs);
  syncLanes(nowMs);
  frameS = nowMs / 1000; view.time = frameS;
  vfx.update(dt); vfx.trail.snap(U, nowMs);   // the light slows with the world
  R.frame(view, fillMain, mini);
  hud.sync(nowMs); announce.tick(nowMs); labels.sync(nowMs);
  fpsN++; fpsT += real; if (fpsT >= 1) { fps = fpsN / fpsT; fpsN = 0; fpsT = 0; }
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

window.VECTOR = {
  sim, state, view, vfx, bots, order, surge, drag, minimap, announce, hud, sound, R, readback: R.readback, follow: followLane, seed,
  get glass() { return state.glass; }, get fps() { return fps; }, get counts() { return { ...R.counts, ...vfx.counts }; },
};
