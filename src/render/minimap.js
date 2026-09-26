// minimap.js — THE WHOLE FIELD IN A CORNER (SPEC-v0.6 §2.10). The canvas never zooms out to the
// whole field; this is the whole field: a second viewport of gl.frame, scissored to a small rect,
// rotated with the glass (on a phone held upright the field stands up, his gates at the bottom).
// The lanes are bars with the held segments tinted, the fronts ticks with a chevron on the one that
// last advanced, the checkpoints dots, the strongholds glyphs with hp bars, the camera a gold rectangle.
// It is also a drop surface: hit(px, py) says which lane and x a finger is over, through R.toWorld,
// the one converter (§2.2). The bodies themselves are gl.js's: the same stream, drawn once more at
// 1 px with uMini = 1; everything drawn here is passed with NOFLOOR so its size is exactly its pixels,
// with its colour in both fill and edge and its alpha in fa (a NOFLOOR shape is all one alpha, §2.4).
import { W, H, LANE_Y, GATE_X, cp, laneOf, laneWord } from '../sim/lanes.js';
import { PALETTE, BIT } from './paint.js';

const { FILL, EDGE, NEUTRAL_FILL, NEUTRAL_EDGE, GOLD, BAND_EDGE, MINI_GROUND } = PALETTE;
// The rects of §1, derived from the viewport so a bigger glass keeps the same corner: the size per
// glass, the gutter from the right edge, and what the map sits against (the hand below it on
// portrait and desk, the surge band above it on landscape). The chrome heights are index.html's
// numbers (§1), read from the DOM when it is there and taken from here when it is not.
export const LAYOUT = {
  portrait: { w: 84, h: 150, gutter: 8, handH: 202, chromeH: 72 },
  landscape: { w: 160, h: 89, gutter: 8, handH: 76, chromeH: 52 },
  desk: { w: 240, h: 133, gutter: 12, handH: 112, chromeH: 72 },
};
const GAP = 8;       // px between the map and the chrome it sits against
const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
// The bar's tone. §2.10 names the band's fill #0E1322, but on the map's #0C1020 ground that is a 2/255 step and
// the lanes vanish wherever nobody holds them. On the field the band reads by its edges (#232C48, §2.8), so the
// map's bar is drawn in that edge tone: the same band, seen from far enough that only its outline is left.
const BAR_BASE = BAND_EDGE;
// The held segments: the bar mixed toward the side's colour. A side's fill outside a body is what a halo is made of
// (§2.4), and its edge greys out in the slate, so the tint aims halfway between the two. §2.8's 12 % reads across a
// 400-px band; on a 3-px bar it takes 30 % before a held stretch is told from a free one at a glance.
const TINT = 0.3;
const SIDE = [0, 1].map((t) => mix(FILL[t], EDGE[t], 0.5));
const BAR_PX = 3, TICK_PX = 7, CHEV_PX = 4, POINT_PX = 3, HOLD_PX = 5, HP_PX = 7, COACH_PX = 3;   // §2.10's sizes on the glass
// Screen-right and screen-down as world directions, per rotation (§2.2): what "under the glyph" means on each glass.
const screenRight = (rot) => (rot ? [0, -rot] : [1, 0]);
const screenDown = (rot) => (rot ? [rot, 0] : [0, 1]);
// Lines blend additively (§2.4), so a bar that must read as an exact colour on the map's ground is drawn as the difference.
const onGround = (c) => [Math.max(0, c[0] - MINI_GROUND[0]), Math.max(0, c[1] - MINI_GROUND[1]), Math.max(0, c[2] - MINI_GROUND[2])];
const BAR = onGround(BAR_BASE), BAR_W = onGround(mix(BAR_BASE, SIDE[0], TINT)), BAR_E = onGround(mix(BAR_BASE, SIDE[1], TINT));

// The chrome as it really is: an edge of an element by id, when a document holds one with a height.
function domEdge(id, edge) {
  if (typeof document === 'undefined') return null;
  const el = document.getElementById(id); if (!el) return null;
  const r = el.getBoundingClientRect();
  return r.height > 0 ? r[edge] : null;
}

// `view` (optional, main.js's camera) draws the gold rectangle of what the glass shows; §9.6 names no such
// argument, so without it the camera is read off window.VECTOR.view (§9.7) when that exists.
export function createMinimap({ R, sim, state, el, glass, view: mainView = null }) {
  const { S, T, WL } = sim;
  const rect = { x: 0, y: 0, w: 0, h: 0 };
  const view = { x: W / 2, y: H / 2, zoom: 0.02, rot: 0, rect, shake: { x: 0, y: 0 } };
  const camera = () => mainView || (globalThis.VECTOR && globalThis.VECTOR.view) || null;
  let letterEl = null, lastLetter = '';
  if (el && typeof document !== 'undefined') {
    el.style.position = 'fixed'; el.style.boxSizing = 'border-box';   // the border stays inside the rect the probe reads
    letterEl = document.createElement('span'); letterEl.className = 'letter';
    letterEl.style.cssText = 'position:absolute;left:3px;top:1px;font:800 9px ui-monospace,Menlo,Consolas,monospace;letter-spacing:.05em;color:#FFD76A;pointer-events:none;line-height:1';
    el.appendChild(letterEl);
  }

  // ---- the rect and the rotated view for a glass (re-run on resize)
  function layout(g) {
    glass = LAYOUT[g] ? g : 'desk';
    const L = LAYOUT[glass], iw = globalThis.innerWidth || 1280, ih = globalThis.innerHeight || 720;
    rect.w = L.w; rect.h = L.h; rect.x = iw - L.gutter - L.w;
    rect.y = glass === 'landscape' ? (domEdge('surge', 'bottom') ?? L.chromeH) + GAP : (domEdge('hand', 'top') ?? ih - L.handH) - GAP - L.h;
    view.rot = glass === 'portrait' ? (state.team ? 1 : -1) : 0;   // west stands the field up with +x UP, east the other way (§2.2)
    view.zoom = view.rot ? Math.min(rect.w / H, rect.h / W) : Math.min(rect.w / W, rect.h / H);
    if (el) { el.style.left = rect.x + 'px'; el.style.top = rect.y + 'px'; el.style.width = rect.w + 'px'; el.style.height = rect.h + 'px'; }
    return rect;
  }
  layout(glass);

  // ---- a finger on the map: which lane, which x (drag.js applies the SNAP RULE; main follows)
  function hit(px, py) {
    const inside = px >= rect.x && px < rect.x + rect.w && py >= rect.y && py < rect.y + rect.h;
    const p = R.toWorld(view, px, py);
    return { inside, lane: laneOf(p[1]), x: Math.max(0, Math.min(W, p[0])) };
  }

  // ---- the segment tints of a lane: the west's held prefix from its gate, the east's from theirs (§2.8)
  function tints(lane) {
    let westTo = GATE_X[0], eastFrom = GATE_X[1];
    for (let s = 0; s < 5 && WL.owner[cp(lane, s)] === 0; s++) westTo = WL.x[cp(lane, s)];
    for (let s = 4; s >= 0 && WL.owner[cp(lane, s)] === 1; s--) eastFrom = WL.x[cp(lane, s)];
    return [westTo, eastFrom];
  }
  const bar = (out, x1, x2, y, c, hw) => { if (x2 > x1) out.line(x1, y, x2, y, hw, c[0], c[1], c[2], 1, 1); };
  function laneBars(out, px) {
    for (let l = 0; l < 3; l++) {
      const y = LANE_Y[l], [westTo, eastFrom] = tints(l), hw = px(BAR_PX / 2);
      bar(out, GATE_X[0], westTo, y, BAR_W, hw);
      bar(out, westTo, eastFrom, y, BAR, hw);   // the free stretch between the held ones
      bar(out, eastFrom, GATE_X[1], y, BAR_E, hw);
    }
  }
  // both fronts as 2 px ticks across the bar; a 4 px chevron on the front that last advanced, pointing the way it moved
  function fronts(out, px) {
    const F = S.front;
    for (let l = 0; l < 3; l++) {
      const y = LANE_Y[l];
      for (const [x, c] of [[F.w[l], EDGE[0]], [F.e[l], EDGE[1]]]) out.line(x, y - px(TICK_PX / 2), x, y + px(TICK_PX / 2), px(1), c[0], c[1], c[2], 1, 1);
      const mv = F.moved[l]; if (!mv || mv.team < 0) continue;
      const team = mv.team, x = team ? F.e[l] : F.w[l], dir = team ? F.chevE[l] : F.chevW[l], c = EDGE[team], tip = x + dir * px(CHEV_PX * 0.75), back = x - dir * px(CHEV_PX * 0.25);
      out.line(back, y - px(CHEV_PX * 0.75), tip, y, px(0.75), c[0], c[1], c[2], 1, 1);
      out.line(back, y + px(CHEV_PX * 0.75), tip, y, px(0.75), c[0], c[1], c[2], 1, 1);
    }
  }
  // a 3 px disc is its outline: the owner's edge colour is the one that reads at that size
  function points(out, px) {
    for (let w = 0; w < WL.n; w++) {
      const o = WL.owner[w], c = o < 0 ? NEUTRAL_EDGE : EDGE[o];
      out.body(WL.x[w], WL.y[w], px(POINT_PX / 2), 0, c[0], c[1], c[2], 1, c[0], c[1], c[2], 0, 0, 0, 0, BIT.NOFLOOR);
    }
  }
  function strongholds(out, px) {
    const rt = screenRight(view.rot), dn = screenDown(view.rot);
    for (let t = 0; t < T.n; t++) {
      const x = T.x[t], y = T.y[t], alive = T.alive[t], team = T.team[t];
      const f = alive ? FILL[team] : NEUTRAL_FILL, e = alive ? EDGE[team] : NEUTRAL_EDGE;
      out.body(x, y, px(HOLD_PX / 2), T.kind[t] === 0 ? 3 : 1, f[0], f[1], f[2], alive ? 1 : 0.5, e[0], e[1], e[2], 0, 0, 0, 0, BIT.NOFLOOR);
      if (!alive) continue;
      const len = px(HP_PX) * T.hp[t] / T.hpMax[t], lx = x + dn[0] * px(4.5) - rt[0] * px(HP_PX / 2), ly = y + dn[1] * px(4.5) - rt[1] * px(HP_PX / 2);   // a 7 px bar under the glyph, filling from its left
      out.line(lx, ly, lx + rt[0] * len, ly + rt[1] * len, px(0.5), e[0], e[1], e[2], 1, 1);
    }
  }
  function cameraRect(out, px) {
    const v = camera(); if (!v || !v.rect) return;
    const r = v.rect, c = [R.toWorld(v, r.x, r.y), R.toWorld(v, r.x + r.w, r.y), R.toWorld(v, r.x + r.w, r.y + r.h), R.toWorld(v, r.x, r.y + r.h)];
    for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) & 3]; out.line(a[0], a[1], b[0], b[1], px(0.5), GOLD[0], GOLD[1], GOLD[2], 1, 1); }
  }
  // the coach's lane: a 3 px gold ring (a 1 px stroke) on his front there
  function coachRing(out, px) {
    const adv = state.advice; if (!adv || !(adv.lane >= 0)) return;
    const x = state.team ? S.front.e[adv.lane] : S.front.w[adv.lane];
    out.body(x, LANE_Y[adv.lane], px(COACH_PX), 4, GOLD[0], GOLD[1], GOLD[2], 1, GOLD[0], GOLD[1], GOLD[2], 0, 1 / COACH_PX, 0, 0, BIT.NOFLOOR);
  }
  function letter() {
    if (!letterEl) return;
    const ch = laneWord(glass, state.team, state.follow ? state.follow.lane : 1)[0];
    if (ch !== lastLetter) { letterEl.textContent = ch; lastLetter = ch; }
  }
  function draw(out) {
    const px = (n) => n / view.zoom;   // css px on the map → world units
    laneBars(out, px); fronts(out, px); points(out, px); strongholds(out, px); cameraRect(out, px); coachRing(out, px); letter();
  }
  return { rect, layout, view: () => view, hit, draw };
}
