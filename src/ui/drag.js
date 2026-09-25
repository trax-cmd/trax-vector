// drag.js — THE VERB. One pointer machine on the eight cards and the surge band. Press a card and it
// lifts; move twelve pixels and a ghost of the real formation rides above the finger, the lane under it
// lights, and the ghost snaps to the next point that lane can take; let go and the battalion musters at
// that lane's gate and marches. A still press is a PREVIEW: what this card beats, drawn on the bodies
// themselves. A quick tap sends the card where the coach points. Nothing here converts screen to world
// but R.toWorld / R.toScreen, and nothing here spells a lane but lanes.js. (SPEC-v0.6 §4.3–4.6, §9.6)
//
// What this file writes for the painter (state.drag, §9.7 plus what a painter needs; every `at` is performance.now() ms):
//   batt, pointerId, x0, y0, t0, x, y, phase, lane, snap, from, ghost, slideFrom, cancelZone, at — as §9.7 names them.
//   phase    'down' | 'preview' | 'drag' | 'flight' (the 220 ms return after an order) | 'cancel' (the 150 ms red fade).
//   ax, ay   THE AIM in css px: the finger lifted 48 px on a touch pointer (0 on a mouse). Every rule reads the aim,
//            and the ghost's home is the aim, so what the ghost sits on is what the drop means.
//   gx, gy   the ghost's centre in world units this frame, slide / flight / aim already applied — a painter may draw
//            the ghost here and skip the slide arithmetic (slideFrom + snap are still kept for one that does its own).
//   alpha    the ghost's alpha: 1 live, 0.5 in a cancel zone, falling through 'flight' and 'cancel'.
//   tint     'team' | 'cancel' (#FF4D4D).
//   touch    true for a touch or pen pointer (the aim is lifted).
//   surface  'minimap' | 'arrow' | null — the finger is on a drop surface off the field (§2.10, §4.1).
//   snap     { kind: 'point'|'gate'|'keep'|'front'|'lane', index, lane, x, y, dropX, chip, short, defend } — x, y are the
//            mark's centre (the gold ring and the chip sit there); dropX is the x the order sends. 'lane' is the surge's.
//   path     the flight's way home: the march line backward from the point (through the lane head when the muster
//            was a keep) to the stronghold, { pts, len }; gx, gy ride it during 'flight'.
//   lead     true while the camera is on its way to a snapped mark that stood off the glass (THE LEAD, below).
// state.orders entries carry { lane, at, role, batt, x, y, from } so the 4 s order line can be drawn from them.
// state.laneFx = { team, amt: [3] } is the lane highlight's envelope, 0..1 per lane, in 100 ms / out 200 ms; main.js
// folds it into view.lanes[l].fxTeam / fxAmt at the 0.12 of §2.8 — one channel from here, one writer of the view.
import { W, H, LANE_Y, RUN, GATE_X, KEEP_X, KEEP_Y, CP_X, CENTRE, CP_R, GATE_R, KEEP_R, DROP_MIN, DROP_MAX,
  laneOf, cp, gate, keep, towerLane, slotsToward, laneWord, pointName } from '../sim/lanes.js';
import { ROLES, ROLE_GLYPH, BEATS, LOSES, ROLE_JOB, BATT_LINE } from '../sim/library.js';

// THE BUDGETS (§4.8), every one read back by the probe; the 80 ms lift is the .lift transition in index.html
const PREVIEW_MS = 180, TAP_MS = 250, DRAG_PX = 12, HOVER_MS = 200;
const LIGHT_IN_MS = 100, LIGHT_OUT_MS = 200, SLIDE_MS = 120, FLIGHT_MS = 220, CANCEL_MS = 150;
const CHIP_MS = 1200, NUDGE_MS = 200, LINGER_MS = 800, COUNT_MS = 500, WAVE_MS = 6000;
const HIT_PX = 44, PAN_PX = 40, PAN_PX_S = 600, MINI_GAP_PX = 8, LIFT_PX = 48, SURGE_R = 300;
const WORD_PX = 22, CHIP_PX = 24;   // the lane word rides this far above (or, pushed off, below) the finger; the chip this far off its mark's ring, or off the finger with the word at a drop surface
const LABEL_GAP_PX = 4;             // a word keeps this clear of another label, of the plate's line and of its room's edges
const LEAD_K = 0.25, FRAME_MS = 1000 / 60;   // the lead closes a quarter of the gap a frame at 60 fps: ≈ 200 ms, the re-follow's lerp (§2.2)
const RING_GAP_PX = 6;              // a mark is in view when this much glass shows beyond its ring
const SURGE_FULL = 10000;

const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => 1 - (1 - k) * (1 - k);   // ease-out: quick to leave, soft to land
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const inside = (r, px, py) => px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
const rectOf = (el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };

// ---- THE SNAP RULE (§4.3), pure, so probes/scratch-drag.mjs can try it on a hand-made board.
// board = { owner: the 15 checkpoint owners (WL.owner), alive: the 10 stronghold flags (T.alive), front: the side's own front x per lane }
// A goal: { kind, index, lane, x, y, dropX, chip, short, defend } — see the head of the file.

function pointGoal(board, team, lane, slot, glass) {
  const defend = board.owner[cp(lane, slot)] === team, tag = defend ? 'DEFEND · ' : '';
  return { kind: 'point', index: cp(lane, slot), lane, x: CP_X[slot], y: LANE_Y[lane], dropX: CP_X[slot],
    chip: tag + pointName(glass, team, lane, slot), short: `${tag}${laneWord(glass, team, lane)} ${slot + 1}`, defend };
}
// the enemy gate: the drop stops at the run's end (past the gate means "to the keeps", §3.6); the mark is the gate itself
function gateGoal(team, lane, glass) {
  const chip = `THEIR GATE · ${laneWord(glass, team, lane)}`;
  return { kind: 'gate', index: gate(1 - team, lane), lane, x: GATE_X[1 - team], y: LANE_Y[lane], dropX: team ? DROP_MIN : DROP_MAX, chip, short: chip, defend: false };
}
function keepGoal(team, k, lane) {
  return { kind: 'keep', index: keep(1 - team, k), lane, x: KEEP_X[1 - team], y: KEEP_Y[k], dropX: KEEP_X[1 - team], chip: 'THEIR KEEP', short: 'THEIR KEEP', defend: false };
}
// his own gate (or keep) dropped on = that lane's front point: the battalion walks to the line and holds it. The spec
// names no chip for it; THE FRONT · <lane> says where it goes.
function frontGoal(board, team, lane, glass) {
  const chip = `THE FRONT · ${laneWord(glass, team, lane)}`, x = board.front[lane];
  return { kind: 'front', index: -1, lane, x, y: LANE_Y[lane], dropX: x, chip, short: chip, defend: false };
}

// A keep is reached only through the yard behind a dead gate (§3.2). Keep 0 stands beside lanes 0 and 1, keep 1 beside 2 and 1;
// the sim walks towerLane's lane (0 / 2) first, so that lane is tried first, then the other. -1 when neither gate is dead.
export function keepLane(board, team, k, preferred) {
  const beside = k ? [2, 1] : [0, 1];
  const order = beside.includes(preferred) ? [preferred, ...beside.filter((l) => l !== preferred)] : beside;
  const open = order.find((l) => !board.alive[gate(1 - team, l)]);
  return open === undefined ? -1 : open;
}

// the living, reachable enemy keep nearest (x, y), or null
function nearestKeep(board, team, x, y, preferred) {
  let best = null, bd = Infinity;
  for (let k = 0; k < 2; k++) {
    if (!board.alive[keep(1 - team, k)]) continue;
    const lane = keepLane(board, team, k, preferred); if (lane < 0) continue;
    const d = Math.hypot(KEEP_X[1 - team] - x, KEEP_Y[k] - y);
    if (d < bd) { bd = d; best = keepGoal(team, k, lane); }
  }
  return best;
}

// THE ORDER RULE (§3.3) as the hand reads it: the points of a lane the side may gain on now — not his, and the point
// before it toward his own side his (or the first in his order). Several can be open at once when a lane is patchy.
export function capturable(board, team, lane) {
  const order = slotsToward(team), out = [];
  for (let i = 0; i < order.length; i++) {
    const s = order[i];
    if (board.owner[cp(lane, s)] === team) continue;
    if (i === 0 || board.owner[cp(lane, order[i - 1])] === team) out.push(s);
  }
  return out;
}

// THE LANE RULE: the capturable point nearest x (the nearest point that is not his, once the ORDER RULE has had its say);
// all five his -> the enemy gate; the gate dead -> the nearest living keep
export function laneGoal(board, team, lane, x, glass) {
  const open = capturable(board, team, lane);
  if (open.length) {
    let best = open[0];
    for (const s of open) if (Math.abs(CP_X[s] - x) < Math.abs(CP_X[best] - x)) best = s;
    return pointGoal(board, team, lane, best, glass);
  }
  if (board.alive[gate(1 - team, lane)]) return gateGoal(team, lane, glass);
  return nearestKeep(board, team, GATE_X[1 - team], LANE_Y[lane], lane);
}

// THE EXACT HITS: within hitR (world units; 44 css px over the zoom) of ANY checkpoint or living stronghold, the nearest
// one is the goal itself — a held point of his is a DEFEND, his own gate is that lane's front, an unreachable keep is skipped
function markGoal(board, team, x, y, hitR, glass) {
  let best = null, bd = hitR * hitR;
  const consider = (mx, my, make) => {
    const d = (mx - x) * (mx - x) + (my - y) * (my - y);
    if (d >= bd) return;
    const g = make(); if (g) { bd = d; best = g; }
  };
  for (let lane = 0; lane < 3; lane++) {
    for (let slot = 0; slot < 5; slot++) consider(CP_X[slot], LANE_Y[lane], () => pointGoal(board, team, lane, slot, glass));
    if (board.alive[gate(team, lane)]) consider(GATE_X[team], LANE_Y[lane], () => frontGoal(board, team, lane, glass));
    if (board.alive[gate(1 - team, lane)]) consider(GATE_X[1 - team], LANE_Y[lane], () => gateGoal(team, lane, glass));
  }
  for (let k = 0; k < 2; k++) {
    if (board.alive[keep(team, k)]) consider(KEEP_X[team], KEEP_Y[k], () => frontGoal(board, team, towerLane(keep(team, k)), glass));
    if (board.alive[keep(1 - team, k)]) consider(KEEP_X[1 - team], KEEP_Y[k], () => { const lane = keepLane(board, team, k, -1); return lane < 0 ? null : keepGoal(team, k, lane); });
  }
  return best;
}

// THE SNAP RULE, one rule: an exact hit wins, else the lane rule on the lit lane. Null only when the enemy has nothing left.
export function snapAt(board, team, lane, x, y, hitR, glass) {
  return markGoal(board, team, x, y, hitR, glass) || laneGoal(board, team, lane, x, glass);
}

// the radius of a snapped mark as the painter draws it (world units): the gold ring at 1.6× on a point (THE CENTRE is 1.3× bigger),
// a gate or a keep, and the surge's own ring of 300; a front point wears a checkpoint's ring
export function ringR(s) {
  if (s.kind === 'lane') return SURGE_R;
  const r = s.kind === 'gate' ? GATE_R : s.kind === 'keep' ? KEEP_R : s.kind === 'point' && s.index % 5 === CENTRE ? CP_R * 1.3 : CP_R;
  return r * 1.6;
}

// THE MUSTER POINT (§3.6), as the sim picks it: the lane's own gate, else the side's living keep nearest the lane head
// (lane 1 stands between both; the first wins, as in the sim's strict `<`); -1 = nothing of his stands on that side
export function musterFrom(alive, team, lane) {
  if (alive[gate(team, lane)]) return gate(team, lane);
  for (const k of lane === 2 ? [1, 0] : [0, 1]) if (alive[keep(team, k)]) return keep(team, k);
  return -1;
}

// Where a tap sends a card, named: the coach's x on its lane read back as a place (a point within 100 wu — the sim's own
// DEFEND reach — the gate, the keeps, else the front at that x)
export function placeOf(board, team, lane, x, glass) {
  for (let s = 0; s < 5; s++) if (Math.abs(CP_X[s] - x) <= 100) return pointGoal(board, team, lane, s, glass);
  const past = team ? x < GATE_X[0] : x > GATE_X[1];
  if (past) return nearestKeep(board, team, GATE_X[1 - team], LANE_Y[lane], lane) || gateGoal(team, lane, glass);
  if (Math.abs(x - GATE_X[1 - team]) <= 300) return gateGoal(team, lane, glass);
  const g = frontGoal(board, team, lane, glass); g.x = g.dropX = x;
  return g;
}

// ---- THE MACHINE. `view` is main.js's (§9.3): the spec hands createDrag no view, so it is taken when given and read off
// window.VECTOR otherwise — edge pan moves it, and every conversion goes through R with it.
export function createDrag({ canvas, R, sim, state, hud, minimap, announce, sound, order, surge, coach, glass, view }) {
  const $ = (id) => document.getElementById(id);
  const hand = $('hand'), layer = $('labels');
  const zones = { hand, strip: $('strip'), surge: $('surge'), plate: $('plate'), banner: $('banner') };
  const team = state.team, deck = sim.decks[team], T = sim.T, WL = sim.WL, U = sim.U, kinds = sim.kinds;
  const now = () => performance.now();
  const viewNow = () => view || (globalThis.VECTOR && globalThis.VECTOR.view) || null;
  const glassNow = () => state.glass || glass;
  const affordable = (i) => sim.price(deck[i]) <= sim.energy[team];
  const board = () => ({ owner: WL.owner, alive: T.alive, front: team ? sim.front().e : sim.front().w });
  const live = (d) => !!d && (d.phase === 'down' || d.phase === 'preview' || d.phase === 'drag');
  const followLane = () => (state.follow && state.follow.lane >= 0 ? state.follow.lane : 1);
  const buzz = () => { if (typeof navigator !== 'undefined' && navigator.vibrate) navigator.vibrate(8); };

  // ---- the words on the field: the lane word rides the finger, the chip sits over the snapped mark, order chips linger.
  // #labels also holds main.js's words - the 2× on every centre, the coach's verb, the counter moments - appended after these
  // and so painted over them (the critic's round-1 frames: CENTRE under ■ BEATS ● and the 2×). These take the top of the
  // stack and step clear of any other label they would cover, so the finger's word always reads. THE PLATE is no label
  // (#plate, its own pane at 18 % of the rect, §4.1) but the louder news: it splits the field into a room above it and a
  // room below, a word that would share its columns lives in the room its mark is in, and a word that cannot be lifted clear
  // inside its room goes under its mark instead - never into the plate's line, never with the plate between it and its
  // mark (the critic's round-3 phone frame: CENTRE · THE CENTRE, lifted over the 2× and a ■ BEATS ● moment, stamped across
  // THEY TOOK THE CENTRE · TOP).
  const mine = new Set();   // this file's labels, told from main.js's when the layer is read
  function label(cls) { const el = document.createElement('div'); el.className = cls; el.style.display = 'none'; el.style.zIndex = '1'; layer.appendChild(el); mine.add(el); return el; }
  function drop(el) { el.remove(); mine.delete(el); }
  function place(el, px, py) { el.style.transform = `translate(${px}px, ${py}px) translate(-50%, -100%)`; }   // its bottom centre at (px, py)
  const laneEl = label('lbl lane'), chipEl = label('lbl chip');
  // the boxes of the other labels shown on the field this frame
  function others() {
    const out = [];
    for (const el of layer.children) {
      if (mine.has(el) || el.style.display === 'none') continue;
      const b = el.getBoundingClientRect(); if (b.width > 0 && b.height > 0) out.push(b);
    }
    return out;
  }
  // the room every word of this file stays inside: the field rect inset a gap (the whole glass before there is a view)
  function room(v) {
    const r = v && v.rect;
    if (!r) return { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };
    return { left: r.x + LABEL_GAP_PX, right: r.x + r.w - LABEL_GAP_PX, top: r.y + LABEL_GAP_PX, bottom: r.y + r.h - LABEL_GAP_PX };
  }
  // THE PLATE'S LINE: while a plate is on, a word of width w at x that would share its columns keeps to the side of the plate
  // its mark (at glass y markY) is on, so the plate reads whole and never stands between a word and its mark
  function cutAtPlate(rm, x, w, markY) {
    const plate = zones.plate;
    if (!plate || !plate.classList.contains('on')) return;
    const p = rectOf(plate);
    if (x + w / 2 <= p.x || x - w / 2 >= p.x + p.w) return;
    if (markY < p.y) rm.bottom = Math.min(rm.bottom, p.y - LABEL_GAP_PX);
    else rm.top = Math.max(rm.top, p.y + p.h + LABEL_GAP_PX);
  }
  const overlaps = (a, b) => a.right > b.left && a.left < b.right && a.bottom > b.top && a.top < b.bottom;
  // a word above its mark (its bottom centre at (px, above)), lifted clear of any box it covers; when the lift would climb out
  // of the word's room it goes under its mark instead (its top at `below`), lowered clear the same way. Gives its box, for the
  // next word to keep clear of.
  function placeClear(el, v, px, above, below, boxes) {
    const w = el.offsetWidth || 0, h = el.offsetHeight || 0, rm = room(v), x = clamp(px, rm.left + w / 2, rm.right - w / 2);
    cutAtPlate(rm, x, w, (above + below) / 2);
    const boxAt = (top) => ({ left: x - w / 2, right: x + w / 2, top, bottom: top + h });
    const clear = (box, off) => {   // off: the top the word takes to get off the box it covers
      for (let hit = boxes.find((b) => overlaps(box, b)), n = 0; hit && n < boxes.length; hit = boxes.find((b) => overlaps(box, b)), n++) box = boxAt(off(hit));
      return box;
    };
    let box = clear(boxAt(clamp(above, rm.top + h, rm.bottom) - h), (b) => b.top - LABEL_GAP_PX - h);
    if (box.top < rm.top) box = clear(boxAt(clamp(below, rm.top, rm.bottom - h)), (b) => b.bottom + LABEL_GAP_PX);
    place(el, x, box.bottom);
    return box;
  }
  const chips = [];   // { el, x, y, until } in world units
  function sayChip(text, x, y, ms) {
    const el = label('lbl chip'); el.textContent = text; el.style.display = 'block';
    chips.push({ el, x, y, until: now() + ms });
  }
  // the order chips ride their points, each clear of the words placed before it this frame
  function stepChips(t, boxes) {
    const v = viewNow();
    for (let i = chips.length - 1; i >= 0; i--) {
      const c = chips[i], left = c.until - t;
      if (left <= 0) { drop(c.el); chips.splice(i, 1); continue; }
      if (v) { const [sx, sy] = R.toScreen(v, c.x, c.y), r = CP_R * v.zoom + 10; boxes.push(placeClear(c.el, v, sx, sy - r, sy + r, boxes)); }
      c.el.style.opacity = left < 200 ? left / 200 : 1;
    }
  }
  // the lane word at the finger, then the chip: on its mark's ring, at the aim when the drop would cancel, stacked over the
  // word at a drop surface off the field; each keeps clear of the boxes given and adds its own
  function showWords(d, v, boxes) {
    laneEl.style.display = d.lane >= 0 ? 'block' : 'none';
    if (d.lane >= 0) { laneEl.textContent = laneWord(glassNow(), team, d.lane); boxes.push(placeClear(laneEl, v, d.x, d.y - WORD_PX, d.y + WORD_PX, boxes)); }
    chipEl.style.display = 'block';
    chipEl.classList.toggle('cancel', !d.snap);
    chipEl.textContent = d.snap ? d.snap.chip : 'RELEASE TO CANCEL';
    let x = d.ax, y = d.ay, r = CHIP_PX;
    if (d.snap && (d.surface || !v)) { x = d.x; y = d.y; r = WORD_PX + CHIP_PX; }
    else if (d.snap) { [x, y] = R.toScreen(v, d.snap.x, d.snap.y); r = ringR(d.snap) * v.zoom + 8; }
    boxes.push(placeClear(chipEl, v, x, y - r, y + r, boxes));
  }
  function hideWords() { laneEl.style.display = 'none'; chipEl.style.display = 'none'; }

  // ---- the lane highlight: 0..1 per lane, in 100 ms / out 200 ms; main.js folds state.laneFx into the field shader's uFx (§2.8)
  const lit = [0, 0, 0]; let litLane = -1;
  function stepLight(dt) {
    let any = false;
    for (let l = 0; l < 3; l++) {
      lit[l] = l === litLane ? Math.min(1, lit[l] + dt / LIGHT_IN_MS) : Math.max(0, lit[l] - dt / LIGHT_OUT_MS);
      if (lit[l] > 0) any = true;
    }
    state.laneFx = any ? { team, amt: lit.slice() } : null;
  }

  // ---- the frame: runs only while something moves (a press, a drag, a preview, a chip, a fading light)
  let raf = 0, lastT = 0, countAt = 0;
  function kick() { if (!raf) { lastT = now(); raf = requestAnimationFrame(frame); } }
  function frame(t) {
    raf = 0;
    const dt = Math.min(50, Math.max(0, t - lastT)); lastT = t;
    const d = state.drag, boxes = others();   // the other labels' boxes: every word placed this frame keeps clear of them and of each other
    if (d) stepDrag(d, t, dt, boxes);
    stepLight(dt); stepChips(t, boxes);
    if (state.hold && t - countAt >= COUNT_MS) { countAt = t; banner(state.hold.batt); }
    if (state.drag || state.hold || chips.length || lit.some((a) => a > 0)) raf = requestAnimationFrame(frame);
  }
  function stepDrag(d, t, dt, boxes) {
    const v = viewNow();
    if (d.phase === 'drag') {
      if (v && !d.cancelZone && !d.surface) {
        if (edgePan(d, v, dt)) track(d, t);   // the finger took the world with it: what is under it is read again
        else if (d.lead) lead(d, v, dt);      // the world comes to the finger: what is under it is not
      }
      if (d.snap) {
        const k = ease(Math.min(1, (t - d.slideFrom.at) / SLIDE_MS));
        d.gx = lerp(d.slideFrom.x, d.snap.x, k); d.gy = lerp(d.slideFrom.y, d.snap.y, k);
      } else if (v) [d.gx, d.gy] = R.toWorld(v, d.ax, d.ay);
      showWords(d, v, boxes);
    } else if (d.phase === 'flight') {
      const k = ease(Math.min(1, (t - d.at) / FLIGHT_MS));
      [d.gx, d.gy] = along(d.path, k); d.alpha = 1 - k;
      if (k >= 1) state.drag = null;
    } else if (d.phase === 'cancel') {
      const k = Math.min(1, (t - d.at) / CANCEL_MS); d.alpha = 0.5 * (1 - k);
      if (k >= 1) state.drag = null;
    }
  }

  // the way home after a drop: the march line backward — the point, the lane head when the muster is a keep (§3.6), the stronghold
  function homePath(s, from) {
    const pts = [[s.x, s.y]];
    if (T.kind[from] === 1) pts.push([GATE_X[team], LANE_Y[s.lane]]);
    pts.push([T.x[from], T.y[from]]);
    let len = 0;
    for (let i = 1; i < pts.length; i++) len += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]);
    return { pts, len };
  }
  function along(path, k) {
    let left = k * path.len;
    for (let i = 1; i < path.pts.length; i++) {
      const [ax, ay] = path.pts[i - 1], [bx, by] = path.pts[i], seg = Math.hypot(bx - ax, by - ay);
      if (left <= seg || i === path.pts.length - 1) { const q = seg ? Math.min(1, left / seg) : 1; return [lerp(ax, bx, q), lerp(ay, by, q)]; }
      left -= seg;
    }
    return path.pts[path.pts.length - 1];
  }

  // ---- THE CAMERA UNDER A DRAG. It is main.js's (§2.2: it never moves under a live drag but for the finger's own asks), so a
  // move is the world delta R.toWorld reads for a step on the glass: what stood (gx, gy) px from the rect's centre now stands
  // at it. False when the world's edge held the camera where it was.
  function panBy(v, gx, gy) {
    const r = v.rect, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    const [ax, ay] = R.toWorld(v, cx, cy), [bx, by] = R.toWorld(v, cx + gx, cy + gy);
    const x = clamp(v.x + bx - ax, 0, W), y = clamp(v.y + by - ay, 0, H), moved = x !== v.x || y !== v.y;
    v.x = x; v.y = y;
    return moved;
  }
  // EDGE PAN: a finger within 40 px of the top / left / right edge of the field rect pans 600 px/s that way; never the hand's
  // edge, never within 8 px of the minimap.
  function edgePan(d, v, dt) {
    const r = v.rect, m = minimap.rect;
    if (!r || !inside(r, d.x, d.y)) return false;
    if (m && inside({ x: m.x - MINI_GAP_PX, y: m.y - MINI_GAP_PX, w: m.w + 2 * MINI_GAP_PX, h: m.h + 2 * MINI_GAP_PX }, d.x, d.y)) return false;
    const px = d.x < r.x + PAN_PX ? -1 : d.x > r.x + r.w - PAN_PX ? 1 : 0, py = d.y < r.y + PAN_PX ? -1 : 0;
    if (!px && !py) return false;
    const step = PAN_PX_S * dt / 1000;
    panBy(v, px * step, py * step);
    if (state.follow) state.follow.free = true;   // the finger took the camera; the drop's follow takes it back (§2.2)
    return true;
  }
  // THE LEAD (the critic's round 1; §4.3 read whole). The SNAP RULE often names a mark off the glass - at the bell the camera
  // looks at the centre and a fresh lane's first point stands 2,600 wu behind it - and a ghost that slides to it (§4.3; the
  // painter draws it on the mark) slides out of the picture with the gold ring and the march line. So when a new snap's mark is
  // off the glass and the finger is on the field, the camera goes to the mark: it pans with the re-follow's lerp until the mark
  // sits under the aim along the lane and inside the rect across it. The ghost is on the mark from the first frame and rides it
  // up to the finger; the ring, the line and the muster pulse come with it; and the follow lands on that x at the release anyway
  // (§4.3), so he sees where the men will go before he lets go. Under the aim, not merely inside the edge: the aim then reads as
  // an exact hit on the mark, and the next points stand 1,300 wu (≥ 390 px on every glass) from it, so a jitter re-snaps
  // nothing. The pan itself re-reads nothing under the finger (edge pan does: there the finger asks to see elsewhere). A mark
  // already in view is never led to - the ghost slides to it as §4.3 says - and a drop surface off the field never leads.
  // A mark is in view when its ring sits whole inside the field rect; a big ring on a small glass makes do with a quarter of it.
  const inset = (v, s) => Math.min(ringR(s) * v.zoom + RING_GAP_PX, v.rect.w / 4, v.rect.h / 4);
  function inView(v, s) {
    const r = v.rect; if (!r) return true;
    const m = inset(v, s), [sx, sy] = R.toScreen(v, s.x, s.y);
    return sx >= r.x + m && sx <= r.x + r.w - m && sy >= r.y + m && sy <= r.y + r.h - m;
  }
  function lead(d, v, dt) {
    const s = d.snap, r = v.rect, m = inset(v, s), [sx, sy] = R.toScreen(v, s.x, s.y);
    const tx = clamp(v.rot ? sx : d.ax, r.x + m, r.x + r.w - m), ty = clamp(v.rot ? d.ay : sy, r.y + m, r.y + r.h - m);   // portrait stands the lane up: along is the glass's y
    const dx = tx - sx, dy = ty - sy;
    if (Math.abs(dx) < 1 && Math.abs(dy) < 1) { d.lead = false; return; }
    const k = 1 - Math.pow(1 - LEAD_K, dt / FRAME_MS);
    if (!panBy(v, -dx * k, -dy * k)) d.lead = false;   // the mark must move (dx, dy) on the glass, so the camera steps the other way
  }

  // ---- the surfaces under a finger
  let rects = null;   // the glass, the hand, the strip, the band and the three lane arrows, read once a drag: a layout holds still under a finger
  function readRects() {
    rects = { glass: rectOf(canvas), arrows: (hud.laneEls || []).map(rectOf) };
    for (const k of ['hand', 'strip', 'surge']) if (zones[k]) rects[k] = rectOf(zones[k]);
  }
  const shown = (el) => !!el && getComputedStyle(el).display !== 'none';
  // the cancel zones (§4.3): the hand, the strip, the surge band, a live plate, the banner, off the glass
  function zoneAt(px, py) {
    if (!inside(rects.glass, px, py)) return 'off';
    for (const k of ['hand', 'strip', 'surge']) if (rects[k] && inside(rects[k], px, py)) return k;
    if (zones.plate && zones.plate.classList.contains('on') && inside(rectOf(zones.plate), px, py)) return 'plate';
    if (shown(zones.banner) && inside(rectOf(zones.banner), px, py)) return 'banner';
    return null;
  }
  // the drop surfaces that are not the field: the minimap's bands and the strip's lane arrows = that lane's next point
  function dropSurface(px, py) {
    const m = minimap.hit(px, py);
    if (m && m.inside) return { kind: 'minimap', lane: m.lane, x: m.x };
    const l = rects.arrows.findIndex((r) => inside(r, px, py));
    return l < 0 ? null : { kind: 'arrow', lane: l, x: GATE_X[team] };
  }

  // ---- what a lane holds, for the surge chip and the hold banner. The banner's good / bad are BODIES (the spec's example
  // `good 14 · bad 30` is a body count; snap.lanes[].fielded sums energy), so they are counted off U in the followed lane.
  function enemyRoles(lane) {
    const n = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] !== team && U.lane[i] === lane) n[kinds[U.kind[i]].shape]++;
    return n;
  }
  // his top role in a lane by the energy standing there - read live off U, as the sim's own fireSurge reads it, so the
  // chip names the super the plate will name (a snapshot is up to a second old)
  function ownTop(lane) {
    const f = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === team && U.lane[i] === lane) { const k = kinds[U.kind[i]]; f[k.shape] += k.cost; }
    let top = -1;
    for (let r = 0; r < 6; r++) if (f[r] > 0 && (top < 0 || f[r] > f[top])) top = r;
    return top;
  }
  // the surge has no point to snap to: its mark is the lane under the finger, its chip the lane's top role of his
  function surgeGoal(lane, wx) {
    const top = ownTop(lane), x = clamp(wx, RUN[0], RUN[1]);
    const chip = `${top >= 0 ? `${ROLE_GLYPH[top]} ${ROLES[top]} ` : ''}SURGE → ${laneWord(glassNow(), team, lane)}`;
    return { kind: 'lane', index: lane, lane, x, y: LANE_Y[lane], dropX: x, chip, short: chip, defend: false };
  }

  // ---- THE PREVIEW (§4.5): the bits on the bodies are paint's from state.hold; the words are the banner's
  function armPreview(i) {
    const b = deck[i];
    state.hold = { batt: i, role: b.role, beats: BEATS[b.role], loses: LOSES[b.role], since: now() };
    const d = state.drag;
    if (d && d.batt === i && d.phase === 'down') { d.phase = 'preview'; d.at = now(); }
    countAt = now(); banner(i); kick();
  }
  function banner(i) {
    const b = deck[i], role = b.role, a = coach(), n = enemyRoles(followLane());
    const count = (rs) => rs.reduce((s, r) => s + n[r], 0);
    const names = (rs) => (rs.length ? rs.map((r) => `${ROLE_GLYPH[r]} ${ROLES[r]}`).join(' ') : '—');
    const text = `${ROLE_GLYPH[role]} ${ROLES[role]} · ${ROLE_JOB[role]} · beats ${names(BEATS[role])} · loses to ${names(LOSES[role])}`;
    const why = a && a.card === i && a.why ? `why this card: ${a.why}` : '';
    hud.banner(text, `good ${count(BEATS[role])} · bad ${count(LOSES[role])}`, [BATT_LINE[b.id], why].filter(Boolean).join(' · '));
  }
  // the bits leave in one frame; the banner lingers `linger` ms (800 after a release, 0 after a tap)
  function clearPreview(linger) {
    if (!state.hold) return;
    state.hold = null; hud.bannerOff(linger);
  }

  // ---- AN ORDER, from a drop or a tap: the sim is told, the chip prints, the follow moves, YOUR WAVE is counted
  const waveAt = [-Infinity, -Infinity, -Infinity];   // the last YOUR WAVE plate per lane: one per lane per 6 s, the first one free
  function commit(i, at, t) {
    if (!order(i, at.lane, at.dropX)) return false;
    const b = deck[i];
    sayChip(`${b.id} → ${at.short}`, at.x, at.y, CHIP_MS);
    state.orders = (state.orders || []).filter((o) => t - o.at < WAVE_MS);
    state.orders.push({ lane: at.lane, at: t, role: b.role, batt: i, x: at.dropX, y: LANE_Y[at.lane], from: musterFrom(T.alive, team, at.lane) });
    state.lastOrderAt = t;
    if (!state.follow) state.follow = { hot: 0 };
    Object.assign(state.follow, { lane: at.lane, x: at.dropX, y: LANE_Y[at.lane], orderedAt: t, free: false });   // in place: the loop keeps its reference
    const mine = state.orders.filter((o) => o.lane === at.lane);
    if (mine.length >= 3 && t - waveAt[at.lane] >= WAVE_MS) {   // three or more into one lane within six seconds is a wave of his own
      waveAt[at.lane] = t;
      announce.say(`YOUR WAVE · ${mine.map((o) => ROLE_GLYPH[o.role]).join(' ')} → ${laneWord(glassNow(), team, at.lane)}`, { team, lane: at.lane, prio: 1 });
    }
    return true;
  }

  // ---- THE TAP (§4.4): the card goes where the coach points; with a lane held (Q/W/E) to that lane at the coach's x or its
  // front. The muster event's own ring at the gate (vfx, 180 ms) is the gold pulse collapsing to the battalion.
  function tapCard(i, lane, t = now()) {
    if (live(state.drag)) return false;
    const a = coach();
    if (i === 'surge') return fireSurge(a ? a.lane : followLane());
    if (!(i >= 0 && i < deck.length) || sim.result) return false;
    if (!affordable(i)) { hud.shake(i); return false; }
    if (!a) { nudge(hud.cards[i]); return false; }   // no advice (the end): nothing, the card dim-pulses
    const to = lane === undefined ? a.lane : lane, x = to === a.lane ? a.x : board().front[to];
    if (commit(i, placeOf(board(), team, to, x, glassNow()), t)) return true;
    hud.shake(i); return false;
  }
  function nudge(el) { el.classList.add('nudge'); setTimeout(() => el.classList.remove('nudge'), NUDGE_MS); }
  function fireSurge(lane) {
    if (surge(lane)) return true;
    hud.shake('surge'); return false;
  }

  // ---- THE POINTER MACHINE. The press is taken on the card (or the band) and captured there; every move and the release
  // are read at the window by pointerId, so a pointer the element could not capture (a synthetic one, a mouse that left
  // the window) still drives the same drag.
  let held = null;   // { el, i } the element under capture
  let previewTimer = 0, hoverTimer = 0;
  const stopTimers = () => { clearTimeout(previewTimer); clearTimeout(hoverTimer); previewTimer = hoverTimer = 0; };
  const aim = (d) => { d.ax = d.x; d.ay = d.y - (d.touch ? LIFT_PX : 0); };

  function begin(e, i, el) {
    const t = now();
    state.drag = { batt: i, pointerId: e.pointerId, x0: e.clientX, y0: e.clientY, t0: t, x: e.clientX, y: e.clientY, ax: e.clientX, ay: e.clientY,
      phase: 'down', lane: -1, snap: null, from: -1, ghost: null, slideFrom: null, cancelZone: null, surface: null, path: null, lead: false, at: t,
      gx: 0, gy: 0, alpha: 1, tint: 'team', touch: e.pointerType !== 'mouse' };
    held = { el, i };
    try { el.setPointerCapture(e.pointerId); } catch (err) { /* a synthetic pointer has no capture to give; the window listeners still see it */ }
    if (e.preventDefault) e.preventDefault();
    el.classList.add('lift');
    buzz();
    if (sound) sound.play('tap', team);
    stopTimers();
    if (i !== 'surge') previewTimer = setTimeout(() => { const d = state.drag; if (live(d) && d.phase === 'down') armPreview(i); }, PREVIEW_MS);
    kick();
  }
  function startDrag(d, t) {
    clearTimeout(previewTimer); previewTimer = 0;
    d.phase = 'drag'; d.at = t;
    d.ghost = d.batt === 'surge' ? { slots: [], big: SURGE_R, form: 'surge' } : sim.formation(d.batt, team);
    if (d.batt === 'surge') clearPreview(0);                                  // the bits on the bodies are a card's; the band has none
    else if (state.hold && state.hold.batt !== d.batt) armPreview(d.batt);   // a desk hover's preview of another card gives way to the dragged one
    readRects();
    aim(d);
    const v = viewNow();
    if (v) [d.gx, d.gy] = R.toWorld(v, d.ax, d.ay);   // the ghost is born at the aim and slides from there
    if (hand) hand.classList.add('held');
    track(d, t);
  }
  // every move while dragging: the aim, the surface, the zone, the lit lane and the snapped goal
  function track(d, t) {
    const v = viewNow(); if (!v) return;
    aim(d);
    const surf = dropSurface(d.x, d.y), zone = surf ? null : zoneAt(d.x, d.y);
    let goal = null, lane = -1;
    if (!zone) {
      let wx, wy;
      if (surf) { lane = surf.lane; wx = surf.x; wy = LANE_Y[lane]; } else { [wx, wy] = R.toWorld(v, d.ax, d.ay); lane = laneOf(wy); }
      if (d.batt === 'surge') goal = surgeGoal(lane, wx);
      else goal = surf ? laneGoal(board(), team, lane, wx, glassNow()) : snapAt(board(), team, lane, wx, wy, HIT_PX / v.zoom, glassNow());
    }
    const from = goal && d.batt !== 'surge' ? musterFrom(T.alive, team, goal.lane) : -1;
    if (goal && d.batt !== 'surge' && from < 0) goal = null;   // nothing of his left on that side to muster from
    if (goal && (!d.snap || d.snap.x !== goal.x || d.snap.y !== goal.y)) {   // a new mark: the ghost slides to it from where it stands - or, off the glass, is on it and the camera comes
      d.lead = !surf && !inView(v, goal);
      d.slideFrom = d.batt === 'surge' || d.lead ? { x: goal.x, y: goal.y, at: t } : { x: d.gx, y: d.gy, at: t };
    } else if (!goal || surf) d.lead = false;
    d.surface = surf ? surf.kind : null; d.cancelZone = goal ? null : (zone || 'none');
    d.snap = goal; d.from = from; d.lane = goal ? goal.lane : lane;
    d.tint = goal ? 'team' : 'cancel'; d.alpha = goal ? 1 : 0.5;
    litLane = goal ? goal.lane : -1;
    showWords(d, v, others());   // the words answer the move itself; the frame keeps them riding a slide or a pan
  }
  function move(e) {
    const d = state.drag; if (!live(d) || e.pointerId !== d.pointerId) return;
    d.x = e.clientX; d.y = e.clientY;
    const t = now();
    if (d.phase === 'drag') track(d, t);
    else if (Math.hypot(d.x - d.x0, d.y - d.y0) >= DRAG_PX) startDrag(d, t);
  }
  // the release decides (§4.3): a drag drops or cancels; a quick still press is the tap; a longer one was the preview and musters nothing
  function up(e) {
    const d = state.drag; if (!live(d) || e.pointerId !== d.pointerId) return;
    const t = now(), tap = t - d.t0 < TAP_MS && Math.hypot(d.x - d.x0, d.y - d.y0) < DRAG_PX;
    letGo(d);
    if (d.phase === 'drag') { if (d.snap) release(d, t); else fade(d, t); clearPreview(LINGER_MS); }
    else if (tap) { state.drag = null; clearPreview(0); tapCard(d.batt, undefined, t); }
    else { state.drag = null; clearPreview(LINGER_MS); }
    if (e.pointerType === 'mouse') hoverArm(d.batt);   // a desk mouse still resting on the card re-arms the preview
  }
  // the capture, the lift and the dimmed hand end with the press; the words leave; the light goes out
  function letGo(d) {
    stopTimers();
    if (held) { try { held.el.releasePointerCapture(d.pointerId); } catch (err) { /* already released */ } held.el.classList.remove('lift'); held = null; }
    if (hand) hand.classList.remove('held');
    hideWords(); litLane = -1; d.lead = false;
  }
  // RELEASE on a valid snap: the order, then the ghost flies home along the march line and dissolves into the real bodies
  function release(d, t) {
    const s = d.snap;
    if (d.batt === 'surge') {
      state.drag = null;
      if (fireSurge(s.lane)) sayChip(s.chip, s.x, s.y, CHIP_MS);
      return;
    }
    if (!commit(d.batt, s, t)) { fade(d, t); return; }   // the till refused (the price climbed under the finger): nothing charged
    hud.flash(d.batt);
    d.phase = 'flight'; d.at = t; d.path = homePath(s, d.from); d.alpha = 1; d.tint = 'team';
  }
  // a drop in a cancel zone: nothing charged, the red ghost fades where it was
  function fade(d, t) { d.phase = 'cancel'; d.at = t; d.snap = null; d.tint = 'cancel'; d.alpha = 0.5; kick(); }
  function cancel() {
    const d = state.drag; if (!live(d)) return;
    const t = now(); letGo(d);
    if (d.phase === 'drag') fade(d, t); else state.drag = null;
    clearPreview(LINGER_MS);
  }
  // a desk mouse resting on a card 200 ms arms the same preview without a press
  function hoverArm(i) {
    if (glassNow() !== 'desk' || i === 'surge') return;
    clearTimeout(hoverTimer);
    hoverTimer = setTimeout(() => { hoverTimer = 0; if (!live(state.drag)) armPreview(i); }, HOVER_MS);
  }
  function hoverLeave(i) {
    clearTimeout(hoverTimer); hoverTimer = 0;
    if (!live(state.drag) && state.hold && state.hold.batt === i) clearPreview(LINGER_MS);
  }

  hud.cards.forEach((el, i) => {
    el.addEventListener('pointerdown', (e) => {
      // a second finger: the window listener below has already cancelled the first drag, so this press is a new press
      if (live(state.drag) || sim.result) return;
      if (!affordable(i)) { hud.shake(i); return; }   // no lift, no drag: the price flashes red and the wait shows
      begin(e, i, el);
    });
    el.addEventListener('pointerenter', (e) => { if (e.pointerType === 'mouse' && !live(state.drag)) hoverArm(i); });
    el.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse') hoverLeave(i); });
  });
  // THE SURGE BAND (§4.6): at 100 the same machine with batt 'surge'; under 100 a press shakes the band (the number is on it)
  if (hud.surgeEl) {
    hud.surgeEl.addEventListener('pointerdown', (e) => {
      if (live(state.drag) || sim.result) return;
      if (sim.S.surge[team] < SURGE_FULL) { hud.shake('surge'); return; }
      begin(e, 'surge', hud.surgeEl);
    });
  }
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);
  window.addEventListener('pointercancel', (e) => { const d = state.drag; if (live(d) && e.pointerId === d.pointerId) cancel(); });
  // a second finger anywhere during a drag cancels it; Escape too (input.js routes Escape to cancel() as well; both are idempotent)
  window.addEventListener('pointerdown', (e) => { const d = state.drag; if (live(d) && e.pointerId !== d.pointerId) cancel(); }, true);
  window.addEventListener('keydown', (e) => { if (e.key === 'Escape') cancel(); });

  return { get active() { return !!state.drag && state.drag.phase === 'drag'; }, cancel, tapCard };
}
