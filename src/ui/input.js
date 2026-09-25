// input.js — THE HAND. Drag the field, pinch or wheel to zoom, tap a stronghold of yours to choose
// where the next battalion musters, tap an enemy stronghold or any well to aim at it, tap a card (or
// press its digit) to muster. A held card pours. The same pointer events serve a mouse and a finger;
// nothing here reads the sim but the positions of what can be tapped.
export function createInput(canvas, cam, sim, state, deploy, view, sound) {
  const ptrs = new Map();
  let pinchD = 0, downAt = null, moved = false;
  const T = sim.T, WL = sim.WL, R = sim.o.towerR;
  const toWorld = (px, py) => [cam.x + (px - canvas.clientWidth / 2) / cam.zoom, cam.y + (py - canvas.clientHeight / 2) / cam.zoom];
  const clampZoom = (z) => Math.max(0.04, Math.min(3, z));

  function tap(px, py) {
    const [wx, wy] = toWorld(px, py);
    const reach = Math.max(R * 2.2, 36 / cam.zoom);   // a finger is a finger at any zoom
    let best = -1, bd = reach * reach, kind = '';
    for (let t = 0; t < T.n; t++) { if (!T.alive[t]) continue; const dx = T.x[t] - wx, dy = T.y[t] - wy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = t; kind = 'tower'; } }
    for (let w = 0; w < WL.n; w++) { const dx = WL.x[w] - wx, dy = WL.y[w] - wy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = w; kind = 'well'; } }
    if (best < 0) return;
    if (kind === 'tower') { if (T.team[best] === state.team) { state.tower = best; state.towerPinned = true; } else state.goal = best; }
    else state.goal = 1000 + best;
    state.flash = { kind, i: best, at: performance.now() };
    if (sound) sound.play('tap');
  }
  canvas.addEventListener('pointerdown', (e) => {
    canvas.setPointerCapture(e.pointerId);
    ptrs.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ptrs.size === 1) { downAt = { x: e.clientX, y: e.clientY, t: performance.now() }; moved = false; }
    if (ptrs.size === 2) { const [a, b] = [...ptrs.values()]; pinchD = Math.hypot(a.x - b.x, a.y - b.y); }
    e.preventDefault();
  });
  canvas.addEventListener('pointermove', (e) => {
    const p = ptrs.get(e.pointerId); if (!p) return;
    const dx = e.clientX - p.x, dy = e.clientY - p.y;
    if (ptrs.size === 1) {
      if (Math.abs(e.clientX - downAt.x) + Math.abs(e.clientY - downAt.y) > 8) moved = true;
      if (moved) { cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom; view.free(); }
    } else if (ptrs.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD > 0) { zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / pinchD); }
      pinchD = d; moved = true; return;
    }
    p.x = e.clientX; p.y = e.clientY;
  });
  const up = (e) => {
    const had = ptrs.has(e.pointerId); ptrs.delete(e.pointerId);
    if (had && ptrs.size === 0 && downAt && !moved && performance.now() - downAt.t < 400) tap(e.clientX, e.clientY);
    if (ptrs.size < 2) pinchD = 0;
    if (ptrs.size === 0) downAt = null;
  };
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('wheel', (e) => { e.preventDefault(); zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * 0.0012)); }, { passive: false });
  function zoomAt(px, py, f) {
    const [wx, wy] = toWorld(px, py);
    cam.zoom = clampZoom(cam.zoom * f);
    const [nx, ny] = toWorld(px, py);
    cam.x += wx - nx; cam.y += wy - ny; view.free();
  }
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key >= '1' && e.key <= '9') { deploy(+e.key - 1); return; }
    const step = 120 / cam.zoom;
    if (e.key === 'ArrowLeft') { cam.x -= step; view.free(); } else if (e.key === 'ArrowRight') { cam.x += step; view.free(); } else if (e.key === 'ArrowUp') { cam.y -= step; view.free(); } else if (e.key === 'ArrowDown') { cam.y += step; view.free(); }
    else if (e.key === '+' || e.key === '=') { cam.zoom = clampZoom(cam.zoom * 1.2); view.free(); } else if (e.key === '-') { cam.zoom = clampZoom(cam.zoom / 1.2); view.free(); }
    else if (e.key === 'f' || e.key === 'F') view.whole();
    else if (e.key === 'a' || e.key === 'A') view.action();
    else if (e.key === 'q' || e.key === 'Q') { state.tower = nextOwn(-1); } else if (e.key === 'e' || e.key === 'E') { state.tower = nextOwn(1); }
  });
  function nextOwn(dir) { const own = []; for (let t = 0; t < T.n; t++) if (T.team[t] === state.team && T.alive[t]) own.push(t); if (!own.length) return -1; const i = own.indexOf(state.tower); return own[((i < 0 ? 0 : i) + dir + own.length) % own.length]; }
  return { toWorld, zoomAt };
}
