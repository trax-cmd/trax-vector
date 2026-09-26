// main.js — THE LOOP AND THE CAMERA. The sim ticks thirty times a second whatever the frame rate - slowed to
// 0.35× for the eight tenths of a second after a shatter - and the frame draws what the sim says through
// paint.js; the captain ticks beside the sim. The camera FOLLOWS a lane: the point an order was dropped on,
// else where that lane's bodies are dying, else the gap between its fronts - and once a gate of it falls, the fight
// in the yard - and it moves only when that point leaves the middle of the glass. Everything the glass shows that is not the field is routed from here: the
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
import { W, H, LANE_Y, HALF, GATE_X, CP_X, CENTRE, CP_R, DROP_MIN, DROP_MAX, inRun, cp, gate, keep, towerLane, laneWord } from './sim/lanes.js';
import { createRenderer } from './render/gl.js';
import { createVfx } from './render/vfx.js';
import { createPaint } from './render/paint.js';
import { createMinimap } from './render/minimap.js';
import { createHud } from './ui/hud.js';
import { createDrag, ringR } from './ui/drag.js';
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
const BLAST_MS = 2000;                                           // a shatter holds the camera on the stronghold while its rings, fragments and slow-time play out
const DEAD_ZONE = 0.5, CHASE = 0.08, REFOLLOW = 0.25;            // the camera moves only when the point leaves the middle half of the rect; its two lerps
const DEATHS_S = 3;                                              // the follow reads the last 3 s of a lane's deaths
const BUSY_KILLS = 20;                                           // kills in 3 s that make the followed lane too busy for a wave's pull
const ALARM_MS = 3000, ALARM_AMT = 0.18;                         // a wave's alarm on the band: the enemy fill pulsing at 1 Hz
const SURGE_MS = 8000, SURGE_HOT_MS = 300, SURGE_HOT = 0.5, SURGE_AMT = 0.15;   // a surge on the band
const MOMENT_N = 3, MOMENT_R = 400, MOMENT_S = 2, MOMENT_GAP_S = 4, MOMENT_HOLD_S = 2.2, MOMENT_RISE_PX = 40;   // §6.2 counter moments (3 in 2 s: why at THE COUNTER MOMENTS)
const MOMENT_REACH_PX = 96, MOMENT_STEP_PX = 4;                  // a lesson that would cross a ring or a word looks this far for a clear seat, in these steps
const RING_ARC_PX = 9;                                           // a checkpoint's capture arc stands 7 px outside its ring with a 1.5 px stroke (paint.js)
const CENTRE_R = 1.3, SNAP_RING = 1.6, SNAP_STROKE_PX = 3;       // THE CENTRE is drawn 1.3×; a drag snapped to it rings it 1.6× in a 3 px stroke (§2.9, §4.3)
const WORD_LIFT = 4;                                             // the coach's word stands this many px clear of its bar
const GLYPH_HALVES = [[-15, -HALF, -20], [15, 20, HALF]], GLYPH_HW = 3;   // paint.js's broken bar: [x off the dead gate, y from, y to] of each half, 3 wu half-width
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
// the last 3 s, else the gap between its fronts, on the lane's centre-line and clamped to the run. Once a gate of the lane is
// dead its fight leaves the band for the yard, where the keeps stand 750 wu off every lane line - farther than half a lane's
// view on any glass - so while breakers stand past the dead gate the lane is followed there in x AND y, on their centroid (the
// critic's round 1: pinned to LANE_Y the glass showed an empty lane end for the whole late game, every keep's fall included).
// THE LANE: the one last chosen - by an order (drag.js stamps lastOrderAt), by a re-follow or by a pull - and twelve seconds
// after the last choice the hottest lane. The spec's twelve seconds run "with no order"; a re-follow and a pull restart them
// too (the critic's round 3: with the clock read off orders alone, twelve seconds past the last order the heat took every
// tap back on the very next frame), so follow.chosenAt carries them and the heat waits on the newer of the two stamps.
const cam = { chasing: true, k: REFOLLOW, look: null };   // look: the camera's own pin { lane, x, y?, at, until } - a minimap tap's, a shatter's
const deaths = LANE_Y.map(() => []);                       // per lane, { x, t } on sim.time
const onGlass = (sx, sy) => { const r = view.rect; return sx >= r.x && sx <= r.x + r.w && sy >= r.y && sy <= r.y + r.h; };
function choose(lane, nowMs) {
  const f = state.follow;
  f.lane = lane; f.free = false; f.chosenAt = nowMs; cam.chasing = true;
}
// a minimap tap, a strip arrow, a plate, a double-tap on the field: a re-follow lands in 200 ms. A tap on a yard gives its
// world y as well, so the camera looks at the keep under the finger and not at the lane line beside it.
function followLane(lane, x, y) {
  const at = performance.now();
  choose(lane, at); cam.k = REFOLLOW;
  cam.look = x === undefined ? null : { lane, x, y, at, until: at + LOOK_MS };
}
// news pulls the follow - a wave plate for a lane, a shatter in it - unless a drag is live or an order is fresh; true when it moved
function pull(lane, nowMs) {
  if (lane < 0 || lane > 2 || drag.active || nowMs - state.lastOrderAt < ORDER_MS) return false;
  choose(lane, nowMs);
  return true;
}
// the glass is on a busy lane: 20+ kills in its last 3 s and more than `lane` has. A wave's news does not take it off one (the
// critic's round 4: WAVE 6 took the phone off a keep siege of a hundred bodies to an empty keep, and restarted the heat clock
// that would have brought it back) - its alarm still pulses the band and the strip arrow wears its dot. A shatter still pulls:
// its flash, rings and slow-time are the moment itself.
function busy(lane) {
  const f = state.follow, sum = S.killsRing.sum;
  return !f.free && sum[f.lane] >= BUSY_KILLS && sum[f.lane] > sum[lane];
}
// a shatter pulls to the stronghold itself - a keep belongs to no lane, so to the lane it stands beside - and when the stronghold
// is off the glass the camera CUTS there on the event's frame: the flash, the white disc and the shake land on the blast, not
// on the void a lerp would be crossing (the critic's round 1: the punch met an empty void, the rings 0.7 s later)
function pullShatter(e, nowMs) {
  const lane = e.lane >= 0 ? e.lane : towerLane(e.tower);
  if (!pull(lane, nowMs)) return;
  cam.look = { lane, x: e.x, y: e.y, at: nowMs, until: nowMs + BLAST_MS };
  const [sx, sy] = R.toScreen(view, e.x, e.y);
  if (onGlass(sx - view.shake.x, sy - view.shake.y)) return;   // on the glass already: the pin's lerp keeps it there
  view.x = e.x; view.y = e.y; cam.chasing = false; cam.k = CHASE;
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
// `side`'s bodies of lane l standing in the other side's yard (past its gate): their centroid, or null when none stands there
function yardBodies(l, side) {
  let n = 0, sx = 0, sy = 0;
  for (let i = 0; i < U.hi; i++) {
    if (!U.alive[i] || U.team[i] !== side || U.lane[i] !== l) continue;
    const x = U.x[i];
    if (side === 0 ? x > GATE_X[1] : x < GATE_X[0]) { sx += x; sy += U.y[i]; n++; }
  }
  return n ? [sx / n, sy / n] : null;
}
// the keep of `owner` that lane l's breakers march on: its living keep nearest the lane's dead gate, the first on a tie, as the sim picks it
function marchedKeep(owner, l) {
  let best = null, bd = Infinity;
  for (let k = 0; k < 2; k++) {
    const t = keep(owner, k);
    if (!T.alive[t]) continue;
    const d = (T.x[t] - GATE_X[owner]) ** 2 + (T.y[t] - LANE_Y[l]) ** 2;
    if (d < bd) { bd = d; best = [T.x[t], T.y[t]]; }
  }
  return best;
}
// where lane l's fight stands in a yard, or null when none does: the breakers' bodies past a dead gate, his break before his
// defence. A keep with no breaker before it is no fight (the critic's round 4: that fallback parked the camera on an empty yard
// for 40 s while the lane's killing went on in the run), so an empty yard falls through to the run's deaths and fronts - save
// for an order he dropped on THEIR KEEP (`marching`), whose battalion is still walking there from his gate.
function yardFight(l, marching) {
  const theirs = !T.alive[gate(them, l)], mine = !T.alive[gate(team, l)];
  if (!theirs && !mine) return null;
  return (theirs && yardBodies(l, team)) || (mine && yardBodies(l, them)) || (marching && theirs && marchedKeep(them, l)) || null;
}
const onRun = (x) => Math.max(DROP_MIN, Math.min(DROP_MAX, x));
// the pin that holds lane l now: the newer of the camera's own look and the lane's last order inside its 6 s, or null
function pinOf(l, nowMs) {
  const look = cam.look && cam.look.lane === l && nowMs < cam.look.until ? cam.look : null;
  const orders = state.orders;
  for (let i = orders.length - 1; i >= 0 && nowMs - orders[i].at < ORDER_MS; i--) {
    if (orders[i].lane === l) return look && look.at >= orders[i].at ? look : orders[i];
  }
  return look;
}
function followPoint(l, nowMs) {
  const pin = pinOf(l, nowMs);
  if (pin && pin === cam.look && pin.y !== undefined) return [pin.x, pin.y];   // a look at a spot: a shatter, a tap on a yard
  if (pin && inRun(pin.x)) return [onRun(pin.x), LANE_Y[l]];
  const yard = yardFight(l, !!pin);                                              // a pin here lies past the run: THEIR KEEP, where that walk goes
  if (yard) return yard;
  const x = pin ? pin.x : deathX(l) ?? (S.front.w[l] + S.front.e[l]) / 2;
  return [onRun(x), LANE_Y[l]];
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
// a tap on the minimap follows the lane under the finger at that x (§2.10), and on a yard at its y too; a card dropped there is drag.js's affair
{
  const el = $('minimap'); let down = null;
  el.addEventListener('pointerdown', (e) => { down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
  el.addEventListener('pointerup', (e) => {
    const d = down; down = null;
    if (!d || drag.active || performance.now() - d.t > TAP_MS || Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_PX) return;
    const h = minimap.hit(e.clientX, e.clientY);
    if (h.inside) followLane(h.lane, h.x, inRun(h.x) ? undefined : R.toWorld(minimap.view(), e.clientX, e.clientY)[1]);
  });
}

// ---- THE COUNTER MOMENTS (§6.2): kills of one role by a role that beats it, close in time and inside a 400-wu circle, print the lesson.
// The spec's four within one second made two lessons in two minutes of a captains' match, both off the glass (the critic's round 1),
// so three within two seconds make one, and a lesson is born only where the glass looks - in practice the followed lane - so an
// unseen one never spends its lane's four seconds.
const recent = [];                                    // the last two seconds' kills: { x, y, lane, a, b, t }
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
  if (labels.moment(cx, cy, `${ROLE_GLYPH[a]} BEATS ${ROLE_GLYPH[b]}`, 1 - e.team)) momentAt[e.lane] = t;
}

// ---- THE LABELS: DOM words on the field, so they read on any glass - the 2× on every centre, the coach's ONE WORD at his bar, the lessons.
// #labels (z-index 7) lies over the strip, the surge band, the minimap AND the plate, so a label keeps off the chrome by its own box
// (§4.1, §11.3): hidden when its point is off the clear field rect, its box pinned inside the rect otherwise, and off the minimap's
// rect, which takes precedence over anything on the field (§2.10) - the map lies inside the rect on every glass, so the pin alone
// seated the coach's word on the map's border and keep glyphs (the critic's round 3) - and off a live plate, which stands inside
// the rect too (the critic's repair round 2: at the bell on the desk the pinned '◀ PUSH · C' sat on WAVE 1's corner). A box is measured while shown - a hidden element
// measures 0 - at birth, and the coach's word again whenever its text changes. A lesson also keeps off every checkpoint's ring,
// the 2× words and the coach's word (the ledger's round: it printed across THE CENTRE's ring and its 2×): from its seat it looks
// a short reach up, down and aside for a clear one, keeps the one it found while it stays clear, and is not born - hidden
// later - when the reach holds none.
const labels = (() => {
  const layer = $('labels');
  const PAD = 4;   // a box keeps this off the rect's edges, the map and the plate
  // the live plate's box, w 0 while none shows. It is measured when the plate changes - its class, its words, the end of its
  // entrance, the glass - and not every frame: a measure taken after the frame's writes would force a layout on every frame
  const plateEl = $('plate'), plate = { x: 0, y: 0, w: 0, h: 0 };
  // A plate that drops its `on` class is still on the glass through its fade (announce.js's OUT_MS, current.leaving set), rising
  // as it goes, so through the fade it is measured every frame and stays chrome until its opacity reads 0 - the CSS fade starts a
  // frame after announce.js's clock, so that clock alone let go of a plate still at 0.13 (the critic's round 4: DEFEND printed
  // across a fading SURGE plate).
  let plateDirty = true, plateFading = false;
  const markPlate = () => { plateDirty = true; };
  new MutationObserver(markPlate).observe(plateEl, { attributeFilter: ['class'], childList: true, characterData: true, subtree: true });
  plateEl.addEventListener('transitionend', markPlate);
  addEventListener('resize', markPlate);
  function measurePlate() {
    const on = plateEl.classList.contains('on'), leaving = !!(announce.current && announce.current.leaving);
    const fading = !on && (leaving || plateFading) && +getComputedStyle(plateEl).opacity > 0;
    if (!plateDirty && !fading && !plateFading) return;
    plateDirty = false; plateFading = fading;
    if (!on && !fading) { plate.w = 0; return; }
    const b = plateEl.getBoundingClientRect();
    plate.x = b.left; plate.y = b.top; plate.w = b.width; plate.h = b.height;
  }
  const chrome = [minimap.rect, plate];   // the boxes inside the rect a label never stands on
  const measure = (rec) => { rec.el.style.display = 'block'; rec.w = rec.el.offsetWidth; rec.h = rec.el.offsetHeight; };
  const make = (cls, text) => {
    const el = document.createElement('div'); el.className = cls; el.textContent = text; layer.appendChild(el);
    const rec = { el, w: 0, h: 0 };
    measure(rec); el.style.display = 'none';
    return rec;
  };
  const BAR_SAMPLES = [-HALF, 0, HALF];
  const word = make('lbl word', ''), twice = LANE_Y.map(() => make('lbl gold', '2×'));
  const live = [];   // the moments: { el, w, h, x, y (the world centroid), at, off (the clear seat it holds) }
  // rec.sx, rec.sy, rec.on remember where a box stands this frame, so a lesson seated after it keeps off it
  const put = (rec, sx, sy, on) => {
    rec.on = on; rec.sx = sx; rec.sy = sy;
    rec.el.style.display = on ? 'block' : 'none';
    if (on) rec.el.style.transform = `translate(${sx}px, ${sy}px) translate(-50%, -100%)`;
  };
  // a box hanging from its bottom centre (x, y), PAD inside the given rect
  const fits = (rec, x, y, r) => x - rec.w / 2 >= r.x + PAD && x + rec.w / 2 <= r.x + r.w - PAD && y - rec.h >= r.y + PAD && y <= r.y + r.h - PAD;
  const onBox = (rec, x, y, m) => m.w > 0 && x + rec.w / 2 > m.x - PAD && x - rec.w / 2 < m.x + m.w + PAD && y > m.y - PAD && y - rec.h < m.y + m.h + PAD;
  const onChrome = (rec, x, y) => chrome.some((m) => onBox(rec, x, y, m));
  // (sx, sy) is the label's bottom centre; the box hanging from it is held inside the rect, then, if that put it on the map or
  // the plate, stepped off - left, right, above or below one of them - the shortest way that keeps it inside the rect and off
  // both (the desk's plate spans nearly the glass, so off it is mostly below it; beside the landscape map stands the plate, so
  // off the map is not always beside it)
  const place = (rec, sx, sy, on) => {
    const r = view.rect;
    let x = Math.max(r.x + PAD + rec.w / 2, Math.min(r.x + r.w - PAD - rec.w / 2, sx)), y = Math.max(r.y + PAD + rec.h, Math.min(r.y + r.h - PAD, sy));
    if (on && onChrome(rec, x, y)) {
      let best = null, dist = Infinity;
      for (const m of chrome) {
        if (m.w <= 0) continue;
        for (const [wx, wy] of [[m.x - PAD - rec.w / 2, y], [m.x + m.w + PAD + rec.w / 2, y], [x, m.y - PAD], [x, m.y + m.h + PAD + rec.h]]) {
          const d = Math.abs(wx - x) + Math.abs(wy - y);
          if (d < dist && fits(rec, wx, wy, r) && !onChrome(rec, wx, wy)) { best = [wx, wy]; dist = d; }
        }
      }
      if (best) [x, y] = best;
    }
    return [x, y];
  };
  const seat = (rec, sx, sy, on) => { const [x, y] = place(rec, sx, sy, on); put(rec, x, y, on); };

  // ---- a lesson's clear seat. Two bottom-centred boxes overlap, or a box comes within a ring's reach of its centre (the box's
  // nearest point to the centre, so a ring is a circle whatever the rot)
  const overlaps = (rec, x, y, o) => o.on && Math.abs(x - o.sx) < (rec.w + o.w) / 2 + PAD && Math.abs((y - rec.h / 2) - (o.sy - o.h / 2)) < (rec.h + o.h) / 2 + PAD;
  const crosses = (rec, x, y, [cx, cy, cr]) => {
    const nx = Math.max(x - rec.w / 2, Math.min(x + rec.w / 2, cx)), ny = Math.max(y - rec.h, Math.min(y, cy));
    return (nx - cx) ** 2 + (ny - cy) ** 2 < (cr + PAD) ** 2;
  };
  const clear = (rec, x, y, rings) => fits(rec, x, y, view.rect) && !onChrome(rec, x, y) && !overlaps(rec, x, y, word)
    && !twice.some((t) => overlaps(rec, x, y, t)) && !rings.some((c) => crosses(rec, x, y, c));
  // every ring on the glass as [sx, sy, its screen radius]: each checkpoint out to its capture arc (THE CENTRE is drawn 1.3×),
  // and a live drag's snapped mark out to the outer edge of its 3 px gold ring at 1.6× - wider than any capture arc (the critic's
  // round 3: a lesson cleared THE CENTRE's arc and sat on the snap ring the desk drew round it)
  function ringsOnGlass() {
    const out = [];
    for (let l = 0; l < 3; l++) for (let s = 0; s < 5; s++) {
      const [sx, sy] = R.toScreen(view, CP_X[s], LANE_Y[l]);
      out.push([sx, sy, CP_R * (s === CENTRE ? CENTRE_R : 1) * view.zoom + RING_ARC_PX]);
    }
    const d = state.drag;   // paint.js rings the snap only while the finger drags onto it, off the cancel zone, for a battalion
    if (d && d.phase === 'drag' && d.snap && !d.cancelZone && d.batt !== 'surge') {
      const [sx, sy] = R.toScreen(view, d.snap.x, d.snap.y);
      out.push([sx, sy, ringR(d.snap) * view.zoom + SNAP_STROKE_PX / 2]);
    }
    return out;
  }
  // the lesson's offset from its seat: the one it holds while that stays clear, else the nearest clear one within the reach
  // (up and down before aside at one distance - above or below a ring is where the eye looks), else null
  function settle(m, x, y, rings) {
    if (m.off && clear(m, x + m.off[0], y + m.off[1], rings)) return m.off;
    for (let d = 0; d <= MOMENT_REACH_PX; d += MOMENT_STEP_PX) {
      for (const [dx, dy] of [[0, -d], [0, d], [-d, 0], [d, 0]]) if (clear(m, x + dx, y + dy, rings)) return [dx, dy];
    }
    return null;
  }
  // a lesson is born only with its centroid on the glass and a clear seat in reach; true when it was
  function moment(x, y, text, side) {
    const [sx, sy] = R.toScreen(view, x, y);
    if (!onGlass(sx, sy)) return false;
    const m = { ...make('lbl t' + side, text), x, y, at: performance.now(), off: null }, [px, py] = place(m, sx, sy, true);
    m.off = settle(m, px, py, ringsOnGlass());
    if (!m.off) { m.el.remove(); return false; }
    if (live.length >= 4) live.shift().el.remove();
    live.push(m);
    return true;
  }
  // a lesson rises from its centroid and fades; off the rect it is never printed over the chrome, and with no clear seat it is
  // hidden for the frame
  function lessons(nowMs) {
    const rings = live.length ? ringsOnGlass() : null;
    for (let i = live.length - 1; i >= 0; i--) {
      const m = live[i], age = (nowMs - m.at) / 1000;
      if (age > MOMENT_HOLD_S) { m.el.remove(); live.splice(i, 1); continue; }
      const [sx, sy] = R.toScreen(view, m.x, m.y), on = onGlass(sx, sy);
      const [x, y] = place(m, sx, sy - MOMENT_RISE_PX * age / MOMENT_HOLD_S, on);
      const off = on ? settle(m, x, y, rings) : null;
      if (off) m.off = off;
      put(m, x + (off ? off[0] : 0), y + (off ? off[1] : 0), !!off);
      m.el.style.opacity = (age < 0.15 ? age / 0.15 : Math.min(1, (MOMENT_HOLD_S - age) / 0.5)).toFixed(3);
    }
  }
  // the word sits on his front bar's end at the band's edge. When no part of that bar can be seen - off the glass (at the bell
  // the camera looks at the centre and the bar stands at 1500; the camera follows another lane) or under the minimap - the seat
  // pins it inside the rect toward the bar and off the map, and the pinned word names the lane and points from where it stands
  // to the bar - '◀ PUSH · C' - so a verb in a corner still says where (the critic's round 1: PUSH alone in a corner, SURGE on
  // TOP's glass for a surge the coach meant in BOTTOM; round 3: a bare DEFEND beside the map, its bar's end under the map)
  function coachWord() {
    const a = state.advice;
    if (!a || sim.result) { put(word, 0, 0, false); return; }
    const [bx, by, broken] = barOf(a.lane), seen = barSeen(bx, by), tag = a.verb + ' · ' + laneWord(state.glass, team, a.lane)[0];
    if (seen) say(a.verb);
    else if (!word.el.textContent.includes(tag)) say(tag + ' ▶');   // any arrow, for a width to seat by: the four are near one width
    const [sx, sy] = foot(bx, by, broken);                          // after the words: the foot reads the word's width
    if (seen) { seat(word, sx, sy, true); return; }
    const [x, y] = place(word, sx, sy, true);
    say(pointed(tag, x, y - word.h / 2, R.toScreen(view, bx, by - HALF), R.toScreen(view, bx, by + HALF)));
    seat(word, sx, sy, true);
  }
  // the word's text, measured again whenever it changes
  function say(text) { if (word.el.textContent !== text) { word.el.textContent = text; measure(word); } }
  // where his bar stands in the lane (world x, the lane's centre y, broken): his front, or once a gate of the lane is dead - the
  // field then hides both of its bars (§2.7) - the broken glyph paint.js draws at that dead gate, the one nearer his front when
  // both are (the critic's round 3: the word hung on a bar the field no longer drew, the glyph 40 px away)
  function barOf(lane) {
    const fx = team ? S.front.e[lane] : S.front.w[lane], dead = [0, 1].map((side) => gate(side, lane)).filter((g) => !T.alive[g]);
    if (!dead.length) return [fx, LANE_Y[lane], false];
    const g = dead.reduce((a, b) => (Math.abs(T.x[b] - fx) < Math.abs(T.x[a] - fx) ? b : a));
    return [T.x[g], LANE_Y[lane], true];
  }
  // the screen point the word hangs from: WORD_LIFT px above the bar's end at the band's edge - and, on a broken glyph, above
  // either half that runs under the word where it will stand: paint.js draws the halves 15 wu off the gate's x, so on the
  // upright phone, where world x runs down the glass, a half stood 7 px above the gate's x and ran along the feet of a word
  // pinned against the glass's edge (the critic's round 4)
  function foot(bx, by, broken) {
    const [sx, sy] = R.toScreen(view, bx, by - HALF);
    let top = sy;
    if (broken) {
      const [x] = place(word, sx, sy - WORD_LIFT, true), hw = GLYPH_HW * view.zoom;
      for (const [dx, y0, y1] of GLYPH_HALVES) {
        const [ax, ay] = R.toScreen(view, bx + dx, by + y0), [cx, cy] = R.toScreen(view, bx + dx, by + y1);
        if (Math.max(ax, cx) + hw > x - word.w / 2 && Math.min(ax, cx) - hw < x + word.w / 2) top = Math.min(top, ay - hw, cy - hw);
      }
    }
    return [sx, top - WORD_LIFT];
  }
  // a bar crosses its whole band: seen when its top, its middle or its bottom is on the glass and not under the map or the plate
  function barSeen(x, y) {
    for (const d of BAR_SAMPLES) { const [sx, sy] = R.toScreen(view, x, y + d); if (onGlass(sx, sy) && !underChrome(sx, sy)) return true; }
    return false;
  }
  const underChrome = (sx, sy) => chrome.some((m) => m.w > 0 && sx >= m.x && sx <= m.x + m.w && sy >= m.y && sy <= m.y + m.h);
  // the tag with an arrow from the word's centre (x, y) to the nearest point of the bar's span (its two ends on the screen, a
  // and b), along the axis that point is farther off: a word pinned level with a bar just off the side points aside, not down
  // the band to the lane's centre (the critic's round 4: '▼ PUSH · C' with the bar 31 px off the left edge)
  function pointed(tag, x, y, [ax, ay], [bx, by]) {
    const ex = bx - ax, ey = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / (ex * ex + ey * ey || 1)));
    const dx = ax + ex * t - x, dy = ay + ey * t - y;
    if (Math.abs(dx) >= Math.abs(dy)) return dx < 0 ? '◀ ' + tag : tag + ' ▶';
    return (dy < 0 ? '▲ ' : '▼ ') + tag;
  }
  // the 2× hangs above its centre ring, clear of the widest ring THE CENTRE ever wears - the gold ring a drag snapped to it draws
  // at 1.6× (the critic's round 1: hung at 1.3× + 4 px, that ring ran through the top of the 2 on the phone); where the strip
  // would cut the hang (the centre at the top of the glass) it sits under the ring
  function centreMarks() {
    const gap = CP_R * CENTRE_R * SNAP_RING * view.zoom + SNAP_STROKE_PX / 2 + PAD;
    for (let l = 0; l < 3; l++) {
      const [sx, sy] = R.toScreen(view, CP_X[CENTRE], LANE_Y[l]), t = twice[l], hangs = sy - gap - t.h >= view.rect.y + PAD;
      seat(t, sx, hangs ? sy - gap : sy + gap + t.h, onGlass(sx, sy));
    }
  }
  function sync(nowMs) {
    measurePlate();
    centreMarks();   // the 2× and the word are put first: a lesson keeps off where they stand this frame
    coachWord();
    lessons(nowMs);
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
    case 'shatter': announce.event(e); pullShatter(e, nowMs); break;
    case 'laneBreak': case 'front': case 'doom': announce.event(e); break;
    case 'surge': announce.event(e); surgeFx[e.team] = { lane: e.lane, at: nowMs }; break;
    case 'wave': if (e.team !== team) { announce.event(e); alarm = { lane: e.lane, at: nowMs, until: nowMs + ALARM_MS }; if (!busy(e.lane)) pull(e.lane, nowMs); } break;
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
