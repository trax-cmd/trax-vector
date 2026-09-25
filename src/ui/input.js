// input.js — THE FIELD'S HAND (SPEC §4.7). The canvas only: one finger pans and the camera goes free,
// pinch and wheel zoom about the finger clamped [0.30, 1.20], a double-tap re-follows, arrows pan, digits
// 1–8 are the tap on a card, Q/W/E held with a digit send to lane 0/1/2, Escape cancels a drag, the sound
// wakes on the first touch. The cards, the band, the plate and the minimap take their own pointers in their
// own modules; a drag's pointer is captured by its card and never reaches here. Nothing here reads the sim
// and nothing here aims: a tap on the field alone does nothing (§4.4).
const ZMIN = 0.30, ZMAX = 1.20;
const TAP_MS = 300, TAP_PX = 20;      // a double-tap: two taps < 300 ms apart, < 20 px
const MOVE_PX = 8;                    // a pan begins after 8 px, so a tap stays a tap
const ARROW_PX = 120;                 // one arrow press pans this many screen px
const LANE_KEY = { q: 0, w: 1, e: 2 };

export function createInput(canvas, view, state, cb) {
  const ptrs = new Map();
  let pinchD = 0, drift = 0, down = null, moved = false, lastTap = null;
  const heldLanes = [];                 // the lane keys held right now, last pressed last

  // A screen delta as a world delta. This mirrors gl.js's rotation rule (§2.2) for DELTAS only: the converter
  // proper (R.toWorld) is not in this module's hands, and a pan or a zoom about the finger needs no offset,
  // only the scale and the turn - rot 0 → (dx, dy)/k; rot ±1 → (rot·dy, −rot·dx)/k.
  function worldDelta(dx, dy) { const k = view.zoom, r = view.rot || 0; return r ? [r * dy / k, -r * dx / k] : [dx / k, dy / k]; }
  const clampZoom = (z) => Math.max(ZMIN, Math.min(ZMAX, z));
  const busy = () => !!state.drag;      // the camera never moves under a live drag (edge pan is drag.js's)
  const followedLane = () => (state.follow && state.follow.lane >= 0 ? state.follow.lane : 1);

  // pan so the world under the finger moves with it
  function pan(dx, dy) { const [wx, wy] = worldDelta(dx, dy); view.x -= wx; view.y -= wy; }
  // zoom by f about the screen point (px, py): the world under that point stays put
  function zoomAt(px, py, f) {
    const r = view.rect, ox = px - (r.x + r.w / 2), oy = py - (r.y + r.h / 2);
    const [ax, ay] = worldDelta(ox, oy);
    view.zoom = clampZoom(view.zoom * f);
    const [bx, by] = worldDelta(ox, oy);
    view.x += ax - bx; view.y += ay - by;
  }

  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { down = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); drift = 0; }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    p.x = e.clientX; p.y = e.clientY;
    if (ptrs.size === 2) {
      // a pinch zooms about the fingers' midpoint and carries the world with the midpoint; only a real drift frees the camera
      moved = true;
      if (busy() || pinchD <= 0) return;
      const [a, b] = [...ptrs.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchD);
      pinchD = d;
      pan(dx / 2, dy / 2); drift += Math.hypot(dx, dy) / 2;
      if (drift > MOVE_PX) cb.free();
      return;
    }
    if (ptrs.size !== 1) return;
    if (!moved && Math.abs(e.clientX - down.x) + Math.abs(e.clientY - down.y) > MOVE_PX) moved = true;
    if (moved && !busy()) { pan(dx, dy); cb.free(); }
  });
  function up(e) {
    const had = ptrs.delete(e.pointerId);
    if (had && ptrs.size === 0 && down && !moved && performance.now() - down.t < TAP_MS) tapped(e.clientX, e.clientY);
    if (ptrs.size < 2) pinchD = 0;
    if (ptrs.size === 0) down = null;
  }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());   // a long press on Android would open a menu on the field
  // one tap on the field is nothing; the second within 300 ms and 20 px re-follows the followed lane
  function tapped(x, y) {
    const now = performance.now();
    if (lastTap && now - lastTap.t < TAP_MS && Math.hypot(x - lastTap.x, y - lastTap.y) < TAP_PX) { lastTap = null; cb.follow(followedLane()); return; }
    lastTap = { x, y, t: now };
  }
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); if (!busy()) zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0012)); }, { passive: false });

  // ---- the desk's keys
  const typing = (e) => e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable);
  window.addEventListener('keydown', (e) => {
    if (typing(e)) return;
    const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (key in LANE_KEY) { if (!heldLanes.includes(LANE_KEY[key])) heldLanes.push(LANE_KEY[key]); return; }
    if (key >= '1' && key <= '8') { const i = +key - 1; if (heldLanes.length) cb.digitLane(i, heldLanes[heldLanes.length - 1]); else cb.tap(i); return; }
    if (key === 'Escape') { cb.cancelDrag(); return; }
    if (busy()) return;
    const r = view.rect, cx = r.x + r.w / 2, cy = r.y + r.h / 2;
    if (key === 'ArrowLeft') { pan(ARROW_PX, 0); cb.free(); } else if (key === 'ArrowRight') { pan(-ARROW_PX, 0); cb.free(); }
    else if (key === 'ArrowUp') { pan(0, ARROW_PX); cb.free(); } else if (key === 'ArrowDown') { pan(0, -ARROW_PX); cb.free(); }
    // + / − zoom about the rect's centre, the same clamp as the wheel: §4.7 names neither key, so a desk without a wheel keeps a way in and out (my call)
    else if (key === '+' || key === '=') zoomAt(cx, cy, 1.2); else if (key === '-') zoomAt(cx, cy, 1 / 1.2);
  });
  window.addEventListener('keyup', (e) => { const key = e.key.length === 1 ? e.key.toLowerCase() : e.key; if (key in LANE_KEY) { const i = heldLanes.indexOf(LANE_KEY[key]); if (i >= 0) heldLanes.splice(i, 1); } });
  window.addEventListener('blur', () => { heldLanes.length = 0; });

  // ---- the strip's lane arrows: a tap follows that lane. Bound here because follow(lane) is this module's hand
  // and nothing on the strip has one; a card dropped on an arrow is drag.js's affair and never becomes a click.
  for (const el of document.querySelectorAll('#lanes .lane')) el.addEventListener('click', () => cb.follow(+el.dataset.lane));

  // ---- the sound wakes on the first pointer anywhere (browsers demand a gesture); cb.wake is main.js's sound.wake
  if (cb.wake) window.addEventListener('pointerdown', () => cb.wake(), { passive: true, capture: true });

  return { zoomAt, pan };
}
