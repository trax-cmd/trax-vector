// input.js — THE HAND. Drag the field, pinch or wheel to zoom, tap a tower of yours to choose it, tap
// an enemy tower to aim at it, tap a card (or press its digit) to deploy. A held card pours. The same
// pointer events serve a mouse and a finger; nothing here reads the sim except the tower positions.
export function createInput(canvas, cam, sim, state, deploy, fit) {
  const ptrs = new Map();
  let pinchD = 0, downAt = null, moved = false;
  const T = sim.T, R = sim.o.towerR;
  const toWorld = (px, py) => [cam.x + (px - canvas.clientWidth / 2) / cam.zoom, cam.y + (py - canvas.clientHeight / 2) / cam.zoom];
  const clampZoom = (z) => Math.max(0.06, Math.min(3, z));

  function tap(px, py) {
    const [wx, wy] = toWorld(px, py);
    let best = -1, bd = (R * 2.2) * (R * 2.2);
    for (let t = 0; t < T.n; t++) { if (!T.alive[t]) continue; const dx = T.x[t] - wx, dy = T.y[t] - wy, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = t; } }
    if (best < 0) return;
    if (T.team[best] === state.team) state.tower = best; else state.goal = best;
    state.flash = { t: best, at: performance.now() };
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
      if (moved) { cam.x -= dx / cam.zoom; cam.y -= dy / cam.zoom; }
    } else if (ptrs.size === 2) {
      p.x = e.clientX; p.y = e.clientY;
      const [a, b] = [...ptrs.values()]; const d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinchD > 0) { const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; zoomAt(mx, my, d / pinchD); }
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
    cam.x += wx - nx; cam.y += wy - ny;
  }
  window.addEventListener('keydown', (e) => {
    if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) return;
    if (e.key >= '1' && e.key <= '9') { deploy(+e.key - 1); return; }
    const step = 120 / cam.zoom;
    if (e.key === 'ArrowLeft') cam.x -= step; else if (e.key === 'ArrowRight') cam.x += step; else if (e.key === 'ArrowUp') cam.y -= step; else if (e.key === 'ArrowDown') cam.y += step;
    else if (e.key === '+' || e.key === '=') cam.zoom = clampZoom(cam.zoom * 1.2); else if (e.key === '-') cam.zoom = clampZoom(cam.zoom / 1.2);
    else if (e.key === 'f' || e.key === 'F') fit();
    else if (e.key === 'q' || e.key === 'Q') { state.tower = nextOwn(-1); } else if (e.key === 'e' || e.key === 'E') { state.tower = nextOwn(1); }
  });
  function nextOwn(dir) { const own = []; for (let t = 0; t < T.n; t++) if (T.team[t] === state.team && T.alive[t]) own.push(t); if (!own.length) return -1; const i = own.indexOf(state.tower); return own[((i < 0 ? 0 : i) + dir + own.length) % own.length]; }
  return { toWorld, zoomAt };
}
