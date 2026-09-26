// vector-road.cjs — the road a player walks, by real pointers, on three glasses (SPEC-v0.6 §11.2): the page
// boots clean and lays out to the numbers; the coach glows at the bell; a real drag musters where the chip
// said; a drag let go over the hand cancels; a tap sends the card where the coach points; a held card shows
// what it beats in green and red on the bodies themselves; an unaffordable card shakes; the surge is dragged
// onto a lane; a gate shatters with the flash, the slow-time, the plates and the lane break; the captain's
// wave is announced by name; the minimap follows and takes a drop; every budget is read back; a battle frame
// is measured pixel by pixel (blobs, both colours, a tracer, no glow, the seam); the fps; the desk's keys.
// Every check prints one PASS/FAIL line with its number and name, so a repair loop can dispatch on it, and
// five frames are taken per glass into probes/shots. Chromium (WebGL2 through SwiftShader with no GPU).
//   node probes/vector-road.cjs phone | portrait | desk     (the house at :8897, served by the probe when nothing answers; VECTOR_URL for the live page)
const { chromium } = require('C:/Users/TraxN/Desktop/trax-arena/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const GLASS = process.argv[2] || 'phone';
const URL0 = process.env.VECTOR_URL || 'http://127.0.0.1:8897/index.html';
const SHOTS = path.join(ROOT, 'probes', 'shots');
// §1: the three glasses and their numbers, read back with ±1
const GLASSES = {
  phone: { ctx: { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, glass: 'landscape', card: [98, 64], hand: 76, strip: 28, surge: 24, rect: [0, 52, 844, 262], mini: [676, 60, 160, 89], letters: 'TCB', plate: 18 },
  portrait: { ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true }, glass: 'portrait', card: [89, 92], hand: 202, strip: 36, surge: 36, rect: [0, 72, 390, 570], mini: [298, 484, 84, 150], letters: 'LCR', plate: 18 },
  desk: { ctx: { viewport: { width: 1280, height: 720 } }, glass: 'desk', card: [120, 100], hand: 112, strip: 36, surge: 36, rect: [0, 72, 1280, 536], mini: [1028, 467, 240, 133], letters: 'TCB', plate: 26 },
};
const G = GLASSES[GLASS];
if (!G) { console.log('a glass is phone, portrait or desk'); process.exit(1); }
const CP_X = [1900, 3200, 4500, 5800, 7100];
const KIND_OF_ROLE = ['MOTE', 'BLOCK', 'DART', 'CANNON', 'HALO', 'PRISM'];   // one uncloaked body per role, for fielding the hold's enemies
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---- THE PAGE'S OWN EYES: installed before the page's scripts run. A frame loop records the first frame at which each
// armed condition holds (16 ms resolution, the spec's own), every distinct plate with its on/off times and the strip's
// coach dot a moment later, and the pixel analyser reads the renderer's physical-px readback right here, so a frame's
// worth of bytes never crosses to Node.
function probeInPage() {
  const watches = [], marks = {}, frames = {}, promises = {}, plates = [], LANE_Y = [1000, 2500, 4000];
  let lastPlate = null, frameN = 0;
  const V = () => window.VECTOR;
  const luma = (r, g, b) => 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // the page's own clock for the pointer: a budget that starts at a press or a release is measured from the event's arrival
  // in the page, not from the probe's call, so the wire's latency never reads as the page's
  const stamps = { down: -1, up: -1 };
  document.addEventListener('pointerdown', () => { stamps.down = performance.now(); }, true);
  document.addEventListener('pointerup', () => { stamps.up = performance.now(); }, true);
  function frame() {
    const now = performance.now();
    frameN++;
    const pl = document.getElementById('plate');
    if (pl && pl.classList.contains('on')) {
      const text = pl.textContent.trim();
      if (!lastPlate || lastPlate.text !== text) {
        const entry = { text, at: now, off: -1, time: V() ? V().sim.time : -1, coach: null };
        setTimeout(() => { entry.coach = [...document.querySelectorAll('.lane.coach')].map((e) => +e.dataset.lane); entry.followed = [...document.querySelectorAll('.lane.followed')].map((e) => +e.dataset.lane); }, 1500);
        plates.push(entry); lastPlate = entry;
      }
    } else if (lastPlate) { lastPlate.off = now; lastPlate = null; }
    for (let i = watches.length - 1; i >= 0; i--) {
      const w = watches[i];
      let v = false;
      try { v = w.fn(V()); } catch (e) { v = false; }
      if (v) { marks[w.name] = w.value ? v : now; frames[w.name] = frameN - w.f0; w.resolve(w.value ? v : now - w.t0); watches.splice(i, 1); }
      else if (now - w.t0 > w.max) { marks[w.name] = -1; frames[w.name] = -1; w.resolve(-1); watches.splice(i, 1); }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  // arm a watch: `src` is an expression over V; the promise gives the ms from arming to the first frame it held (-1 past max),
  // or, with value = true, the expression's own value at that frame; framesOf(name) is the frames that passed to it
  function arm(name, src, max = 5000, value = false) {
    const fn = new Function('V', 'return (' + src + ');');
    promises[name] = new Promise((resolve) => watches.push({ name, fn, max, t0: performance.now(), f0: frameN, resolve, value }));
    return name;
  }
  const read = (name) => promises[name] || Promise.resolve(null);
  const at = (name) => marks[name];
  const framesOf = (name) => frames[name];

  // ---- the field's bodies, by hand: n bodies of a kind for a side, mustered free into a lane and carried to (x, y) ± spread inside its band
  // (the bodies are ordered to ox, by default where they are put, so they stand; a battle is ordered to its meeting point)
  function fieldAt(team, kind, n, x, y, spread, lane = 1, ox = x) {
    const sim = V().sim, U = sim.U, before = new Set();
    for (let i = 0; i < U.hi; i++) if (U.alive[i]) before.add(i);
    for (let k = 0; k < n; k++) sim.apply({ op: 'deploy', team, kind, lane, x: ox, free: true });
    const born = [];
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && !before.has(i)) { U.x[i] = x + (Math.random() - 0.5) * 2 * spread; U.y[i] = Math.max(LANE_Y[lane] - 380, Math.min(LANE_Y[lane] + 380, y + (Math.random() - 0.5) * 2 * spread)); born.push(i); }
    return born;
  }
  // a side held still and silent for s seconds (a stunned body neither walks nor fires), so a staged read is not shot up before it is taken
  const stun = (team, s) => { const U = V().sim.U; for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === team) U.stun[i] = Math.max(U.stun[i], s); };
  // where the camera looks: the followed lane and its x inside the run
  const look = () => { const v = V(), lane = v.state.follow.lane; return { lane, x: Math.max(1300, Math.min(7700, v.view.x)), y: LANE_Y[lane] }; };

  // ---- pixels: the readback is physical px, top-down RGBA, with width / height / dpr on the array
  const FILL = [[18, 167, 200], [200, 50, 30]], EDGE = [[127, 243, 255], [255, 176, 122]], BASES = [[14, 19, 34], [10, 13, 24], [14, 26, 38], [26, 18, 32]];
  // a pixel on the segment from a base colour toward a team's fill, at a share a ∈ [0.12, 0.72] within tol per channel; the share or -1
  function fillShare(r, g, b, fill, tol) {
    let best = -1;
    for (const base of BASES) {
      const dx = fill[0] - base[0], dy = fill[1] - base[1], dz = fill[2] - base[2];
      const a = ((r - base[0]) * dx + (g - base[1]) * dy + (b - base[2]) * dz) / (dx * dx + dy * dy + dz * dz);
      if (a < 0.12 || a > 0.72) continue;
      if (Math.abs(r - base[0] - a * dx) > tol || Math.abs(g - base[1] - a * dy) > tol || Math.abs(b - base[2] - a * dz) > tol) continue;
      best = Math.max(best, a);
    }
    return best;
  }
  const near = (r, g, b, c, tol) => Math.abs(r - c[0]) <= tol && Math.abs(g - c[1]) <= tol && Math.abs(b - c[2]) <= tol;
  // the field's own lines (§2.1): the band edges #232C48, the 1,000 grid #1C2440, the centre line #202848 - lit past 40 by Rec. 709
  // luma (44, 36, 41), so they are named dark by colour. A held checkpoint's RALLY disc (its owner's fill at 0.25, luma 36-58) is
  // not: it is the fill a halo is made of, so it is left lit and read as what it is - a disc its checkpoint's ring encloses
  const FIELD = [[35, 44, 72], [28, 36, 64], [32, 40, 72]];
  const mix = (a, c, k) => a.map((v, j) => v + k * (c[j] - v));
  // THE OUTLINE'S RAMP (§2.4): a 1.5 px outline between two pixel centres lights each at ~0.67 of the edge colour over what lies under
  // it - the seam's dark outside, the body's own fill inside (fillA 0.20-0.55 of the fill over the ground) - so an edge pixel is one on
  // the segment from any of those toward a side's edge colour, at a share of half or more. The whole outline reads as a wall then, and a
  // body is what it encloses; the pure-colour test it replaces found no outline on a 14 px BLOCK and read the whole body as a glow
  const UNDERS = BASES.flatMap((base) => [base, ...FILL.flatMap((fill) => [0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.45, 0.5, 0.55, 0.6].map((k) => mix(base, fill, k)))]);
  // the share a ≥ lo of a side's edge colour over any of `unders` that the pixel is, within tol per channel; the best share or -1
  function edgeShare(r, g, b, edge, unders, lo, tol) {
    let best = -1;
    for (const u of unders) {
      const dx = edge[0] - u[0], dy = edge[1] - u[1], dz = edge[2] - u[2];
      const a = ((r - u[0]) * dx + (g - u[1]) * dy + (b - u[2]) * dz) / (dx * dx + dy * dy + dz * dz);
      if (a < lo || a > 1.05 || a <= best) continue;
      if (Math.abs(r - u[0] - a * dx) > tol || Math.abs(g - u[1] - a * dy) > tol || Math.abs(b - u[2] - a * dz) > tol) continue;
      best = a;
    }
    return best;
  }
  // one pixel's class: 0 dark, 1/2 a side's fill, 3/4 a side's edge, 5 white, 6 other bright, 7 FAINT - a side's edge colour at
  // under half over the ground: a fading death ring, a trail's tail. Named before the fills, which it would otherwise pass for: the
  // west's edge at 0.17 over the band (33,56,71) reads as the west's fill over the east's tinted segment within 9 per channel
  function classOf(r, g, b) {
    if (luma(r, g, b) <= 40 || FIELD.some((c) => near(r, g, b, c, 6))) return 0;
    if (r >= 200 && g >= 200 && b >= 200) return 5;
    for (let t = 0; t < 2; t++) if (near(r, g, b, EDGE[t], 40) || edgeShare(r, g, b, EDGE[t], UNDERS, 0.5, 14) >= 0) return 3 + t;
    for (let t = 0; t < 2; t++) if (edgeShare(r, g, b, EDGE[t], BASES, 0.04, 6) >= 0) return 7;
    for (let t = 0; t < 2; t++) if (fillShare(r, g, b, FILL[t], 12) >= 0) return 1 + t;
    return 6;
  }
  // A held checkpoint's RALLY disc (§2.9: its owner's fill at 0.25, luma 36-58 - the east's on its drawn segment tint reads 77,30,33)
  // is the field's own paint in a body's colour, and it is the colour a halo is made of too, so it is named dark only where it is
  // painted: inside a held point's disc, in its owner's rally colour over any ground - the grounds and FIELD_FS's segment tints,
  // the band mixed 12 % toward a side's fill (§2.8), which read a little off the spec's hex. Left lit, a disc the rect's edge cuts
  // is reached from inside its ring and reads as a glow.
  const RALLY = FILL.map((fill) => [...BASES, ...FILL.map((f) => mix(BASES[0], f, 0.12))].map((base) => mix(base, fill, 0.25)));
  function darkenRallies(img, cls, at) {
    const v = V(), WL = v.sim.WL, dpr = img.dpr || 1, w = img.width, h = img.height;
    for (let q = 0; q < WL.n; q++) {
      const o = WL.owner[q];
      if (o < 0) continue;
      const [sx, sy] = v.R.toScreen(v.view, WL.x[q], WL.y[q]), cx = (sx - at.x) * dpr, cy = (sy - at.y) * dpr;
      const rad = (70 * (WL.slot[q] === 2 ? 1.3 : 1) * v.view.zoom + 2) * dpr;   // lanes.js CP_R, THE CENTRE drawn 1.3x
      for (let y = Math.max(0, Math.floor(cy - rad)); y < Math.min(h, cy + rad); y++) for (let x = Math.max(0, Math.floor(cx - rad)); x < Math.min(w, cx + rad); x++) {
        const p = y * w + x;
        if ((cls[p] === 1 || cls[p] === 2) && Math.hypot(x - cx, y - cy) <= rad && RALLY[o].some((c) => near(img[p * 4], img[p * 4 + 1], img[p * 4 + 2], c, 8))) cls[p] = 0;
      }
    }
  }
  // every pixel classed, each distinct colour once (a frame repeats its colours by the thousand)
  function classify(img) {
    const n = img.width * img.height, cls = new Uint8Array(n), seen = new Map();
    for (let p = 0; p < n; p++) {
      const key = (img[p * 4] << 16) | (img[p * 4 + 1] << 8) | img[p * 4 + 2];
      let c = seen.get(key);
      if (c === undefined) { c = classOf(img[p * 4], img[p * 4 + 1], img[p * 4 + 2]); seen.set(key, c); }
      cls[p] = c;
    }
    return cls;
  }
  // 8-connected components of a mask (Uint8Array, nonzero = in): each with its bbox, area and a vote per class
  function components(mask, cls, w, h) {
    const labels = new Int32Array(w * h), stack = new Int32Array(w * h), out = [];
    let next = 0;
    for (let s = 0; s < w * h; s++) {
      if (!mask[s] || labels[s]) continue;
      const c = { area: 0, x0: w, y0: h, x1: 0, y1: 0, votes: [0, 0, 0, 0, 0, 0, 0, 0] };
      let top = 0; stack[top++] = s; labels[s] = ++next;
      while (top) {
        const p = stack[--top], x = p % w, y = (p - x) / w;
        c.area++; c.votes[cls[p]]++;
        if (x < c.x0) c.x0 = x; if (x > c.x1) c.x1 = x; if (y < c.y0) c.y0 = y; if (y > c.y1) c.y1 = y;
        for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
          const qx = x + dx, qy = y + dy; if (qx < 0 || qy < 0 || qx >= w || qy >= h) continue;
          const q = qy * w + qx; if (mask[q] && !labels[q]) { labels[q] = next; stack[top++] = q; }
        }
      }
      c.w = c.x1 - c.x0 + 1; c.h = c.y1 - c.y0 + 1; c.cx = (c.x0 + c.x1) / 2; c.cy = (c.y0 + c.y1) / 2;
      out.push(c);
    }
    return out;
  }
  // a mask grown by k px, separably
  function dilate(mask, w, h, k) {
    const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!mask[y * w + x]) continue; for (let d = -k; d <= k; d++) { const q = x + d; if (q >= 0 && q < w) a[y * w + q] = 1; } }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { if (!a[y * w + x]) continue; for (let d = -k; d <= k; d++) { const q = y + d; if (q >= 0 && q < h) b[q * w + x] = 1; } }
    return b;
  }
  // a mask shrunk by k px (the pixels whose whole (2k+1)-square is in it), separably with running counts
  function erode(mask, w, h, k) {
    const a = new Uint8Array(w * h), b = new Uint8Array(w * h);
    for (let y = 0; y < h; y++) {
      let run = 0;
      for (let x = 0; x < w + k; x++) {
        if (x < w) run += mask[y * w + x] ? 1 : 0;
        if (x - 2 * k - 1 >= 0) run -= mask[y * w + x - 2 * k - 1] ? 1 : 0;
        const c = x - k; if (c >= k && c < w - k && run === 2 * k + 1) a[y * w + c] = 1;
      }
    }
    for (let x = 0; x < w; x++) {
      let run = 0;
      for (let y = 0; y < h + k; y++) {
        if (y < h) run += a[y * w + x];
        if (y - 2 * k - 1 >= 0) run -= a[(y - 2 * k - 1) * w + x];
        const c = y - k; if (c >= k && c < h - k && run === 2 * k + 1) b[c * w + x] = 1;
      }
    }
    return b;
  }
  // the pixels reachable from the image's dark border without crossing a wall pixel (4-connected, so a thin diagonal outline still
  // holds). Only a dark border pixel seeds: a body the rect's edge cuts is enclosed by its outline and the edge, not open to the world
  function outsideOf(wall, cls, w, h) {
    const out = new Uint8Array(w * h), stack = new Int32Array(w * h);
    let top = 0;
    const flood = (p) => { if (!wall[p] && !out[p]) { out[p] = 1; stack[top++] = p; } };
    const seed = (p) => { if (cls[p] === 0) flood(p); };
    for (let x = 0; x < w; x++) { seed(x); seed((h - 1) * w + x); }
    for (let y = 0; y < h; y++) { seed(y * w); seed(y * w + w - 1); }
    while (top) {
      const p = stack[--top], x = p % w;
      if (x > 0) flood(p - 1); if (x < w - 1) flood(p + 1); if (p >= w) flood(p - w); if (p < (h - 1) * w) flood(p + w);
    }
    return out;
  }
  // THE BATTLE FRAME's measures (§11.2 item 13) over a readback of the field rect whose top-left is `at` in css px
  function analyse(img, at) {
    const w = img.width, h = img.height, dpr = img.dpr || 1, cls = classify(img), n = w * h;
    darkenRallies(img, cls, at);
    const body = new Uint8Array(n), white = new Uint8Array(n), outline = new Uint8Array(n);
    for (let p = 0; p < n; p++) { if (cls[p] >= 1 && cls[p] <= 4) body[p] = 1; if (cls[p] === 5) white[p] = 1; if (cls[p] >= 3 && cls[p] <= 5) outline[p] = 1; }
    // a blob is a body (or a formation of touching bodies) when it holds fill pixels: the front bars and rings are edge colour only
    const blobs = components(body, cls, w, h).map((c) => ({ ...c, diam: Math.max(c.w, c.h) / dpr, filled: c.votes[1] + c.votes[2] > 0, team: c.votes[1] > c.votes[2] ? 0 : c.votes[2] > c.votes[1] ? 1 : -1 }));
    const big = blobs.filter((c) => c.diam >= 10 && c.filled), bodySized = big.filter((c) => c.diam <= 26), formations = big.filter((c) => c.diam <= 60);
    // a line of width k css px has area ≈ k·dpr·diag: ≤ 3 css px is thin (a tracer is 1.5, a beam 2, a ring 2, a front bar 6 wu)
    const thinner = (c, k) => c.area <= (k * dpr + 1) * Math.hypot(c.w, c.h) + 40 * dpr;
    const streaks = components(white, cls, w, h).filter((c) => Math.hypot(c.w, c.h) / dpr >= 12 && thinner(c, 2.5));   // a white line ≥ 12 css px long, any direction
    // THE NO-GLOW TEST: a body is what its outline encloses. Anything lit that the border can reach without crossing an outline,
    // more than 3 css px from one, must be a line, a ring or a spark. The outlines are closed by a pixel first: where two bodies of a
    // side touch, one's seam darkens the other's outline for a pixel or two, and that gap must not open a body to the world.
    // What is left is told by its thickness, read as a CORE - what survives a shrink by a square - in the colour it is lit in:
    //   a side's FILL colour outside a body is a halo's (§2.4: a body's fill; lines, rings and sparks are drawn in edge colours,
    //     white and gold), and its one lawful stroke is a held point's 1 px line to its gate (§2.6), so a square of 1.5 css px;
    //   any other colour is a stroke's, 2 css px at the widest and a pixel more each side antialiased, and a volley tangles its
    //     death rings, so a square of 5 css px: a tangle of rings has a bounding box as full as a halo's, but no core.
    // A spark is tiny and never a glow.
    const outside = outsideOf(dilate(outline, w, h, Math.max(1, Math.round(dpr / 2))), cls, w, h), near = dilate(outline, w, h, Math.round(3 * dpr));
    const bright = new Uint8Array(n), fillLit = new Uint8Array(n), kind = new Uint8Array(n);
    for (let p = 0; p < n; p++) if (cls[p] && outside[p] && !near[p]) { bright[p] = 1; if (cls[p] === 1 || cls[p] === 2) fillLit[p] = 1; }
    const fillCore = erode(fillLit, w, h, Math.max(1, Math.round(dpr / 2))), strokeCore = erode(bright, w, h, Math.round(2.5 * dpr));
    for (let p = 0; p < n; p++) kind[p] = fillCore[p] || strokeCore[p] ? 1 : 0;
    let glowPx = 0, worst = null;
    for (const c of components(bright, kind, w, h)) {   // each component votes over the cores: votes[1] is its pixels in either
      if (c.area <= 6 * dpr * dpr || c.votes[1] === 0) continue;
      glowPx += c.area;
      if (!worst || c.area > worst.area) worst = { x: Math.round(c.cx / dpr), y: Math.round(c.cy / dpr), w: Math.round(c.w / dpr), h: Math.round(c.h / dpr), area: c.area };
    }
    return { w: w / dpr, h: h / dpr, dpr, blobs: blobs.length, big: big.length, bodySized: bodySized.length, biggest: Math.round(Math.max(0, ...big.map((c) => c.diam))), west: formations.filter((c) => c.team === 0).length, east: formations.filter((c) => c.team === 1).length, streaks: streaks.length, glowPx: Math.round(glowPx / (dpr * dpr)), worst };
  }
  // THE SEAM (§11.2 item 13, the phone): two adjacent motes of one side keep a dark pixel between them. The seam ring (0.67 of the
  // outline's width, #0A0D18 at 0.8) darkens under 40 only where it falls on the neighbour's FILL - over a bright outline it reads
  // ~54 - so it shows where two motes overlap by a pixel or two, as motes at the floor size do in a cloud. Pairs from half-overlap
  // to just touching are read along the line of centres (a body flashing white from a hit is skipped), and the first pair whose
  // profile dips under 40 between its two lit runs is the seam; else the pair with the deepest dip is reported.
  async function seam() {
    const v = V(), sim = v.sim, U = sim.U, view = v.view, rect = view.rect, dpr = Math.min(3, devicePixelRatio || 1);
    const flashing = (i) => !!(v.vfx && v.vfx.flashUntil && v.vfx.flashUntil[i] > view.time);
    const motes = [];
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && sim.kinds[U.kind[i]].id === 'MOTE' && !flashing(i)) { const [sx, sy] = v.R.toScreen(view, U.x[i], U.y[i]); if (sx > rect.x + 12 && sx < rect.x + rect.w - 12 && sy > rect.y + 12 && sy < rect.y + rect.h - 12) motes.push({ i, team: U.team[i], sx, sy }); }
    const drawR = Math.max(6 * view.zoom, 5), ideal = 2 * drawR - 2, pairs = [];
    for (let a = 0; a < motes.length; a++) for (let b = a + 1; b < motes.length; b++) { if (motes[a].team !== motes[b].team) continue; const d = Math.hypot(motes[a].sx - motes[b].sx, motes[a].sy - motes[b].sy); if (d >= drawR && d <= 2 * drawR + 1) pairs.push({ A: motes[a], B: motes[b], d }); }
    pairs.sort((p, q) => Math.abs(p.d - ideal) - Math.abs(q.d - ideal));
    let best = null;
    for (const { A, B, d } of pairs.slice(0, 6)) {
      const x0 = Math.floor(Math.min(A.sx, B.sx)) - 6, y0 = Math.floor(Math.min(A.sy, B.sy)) - 6, wq = Math.ceil(Math.abs(A.sx - B.sx)) + 12, hq = Math.ceil(Math.abs(A.sy - B.sy)) + 12;
      const img = await v.readback(x0, y0, wq, hq), pd = img.dpr || dpr, W = img.width;
      const steps = Math.max(4, Math.ceil(d * pd)), lumas = [];
      for (let k = 0; k <= steps; k++) { const t = k / steps, px = Math.round(((A.sx + (B.sx - A.sx) * t) - x0) * pd), py = Math.round(((A.sy + (B.sy - A.sy) * t) - y0) * pd), p = (py * W + px) * 4; lumas.push(Math.round(luma(img[p], img[p + 1], img[p + 2]))); }
      const lit = lumas.map((l) => l > 40), first = lit.indexOf(true), last = lit.lastIndexOf(true);
      let minL = 999;
      for (let k = first + 1; k < last; k++) minL = Math.min(minL, lumas[k]);
      const r = { pair: [A.i, B.i], dist: +d.toFixed(1), drawR: +drawR.toFixed(1), lumas, dark: minL < 40, minLuma: minL, motes: motes.length, pairs: pairs.length };
      if (r.dark) return r;
      if (!best || minL < best.minLuma) best = r;
    }
    return best || { pair: null, motes: motes.length, pairs: pairs.length };
  }
  window.__probe = { arm, read, at, framesOf, marks, stamps, plates, fieldAt, stun, look, analyse, seam, luma };
}

// ---- the road
(async () => {
  const t00 = Date.now();
  const fails = [], lines = [], budget = [];
  const check = (n, name, ok, detail = '') => { const l = `[${n}] ${name} · ${ok ? 'PASS' : 'FAIL'}${detail ? ' · ' + detail : ''}`; lines.push(l); console.log(l); if (!ok) fails.push(`${n} ${name}`); };
  const note = (n, text) => { const l = `[${n}] note · ${text}`; lines.push(l); console.log(l); };
  // a budget row: kind 'ms' is judged within max(40 ms, 25 %) of spec (or of alt, a second lawful value), 'rect' within ±1, 'fps' ≥ 55, 'css' exact,
  // 'frames' within ±3 (a per-frame lerp is a count of frames whatever the machine's rate), 'info' never; a note rides beside the read value
  const measure = (name, spec, got, kind = 'ms', alt = null, note = '') => budget.push({ name, spec, got, kind, alt, note });
  const rectStr = (r) => r ? `${Math.round(r.x)},${Math.round(r.y)} ${Math.round(r.w)}×${Math.round(r.h)}` : '—';
  const within = (a, b, tol) => Math.abs(a - b) <= tol;

  let house = null;
  if (!process.env.VECTOR_URL) house = await serveHouse();
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(G.ctx);
  const p = await ctx.newPage();
  const errs = [], logs = [];
  p.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 200)); });
  await p.addInitScript(probeInPage);
  const ev = (fn, arg) => p.evaluate(fn, arg);
  const arm = (name, src, max, value) => ev(([n, s, m, v]) => window.__probe.arm(n, s, m, v), [name, src, max || 5000, !!value]);
  const read = (name) => ev((n) => window.__probe.read(n), name);
  const at = (name) => ev((n) => window.__probe.at(n), name);
  const rect = (sel) => ev((s) => { const el = document.querySelector(s); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; }, sel);
  const shot = (k, name) => p.screenshot({ path: path.join(SHOTS, `road-${GLASS}-${k}-${name}.png`) });
  const simTime = () => ev(() => window.VECTOR.sim.time);
  const untilSim = async (t) => { while ((await simTime()) < t) await sleep(100); };
  const musters = () => ev(() => window.VECTOR.sim.S.stats.musters[0]);
  // the bodies an order bears are read by their battalion's grp (sim.js: S.grpN++ at every muster, carried by a bloom's or a hive's children,
  // 0 on a lone kind deploy): his bodies at or past the watermark taken before the order are that order's - whatever freed slots they
  // recycled into (a set of live slots misses a battalion born into a volley's dead ones) and whatever an earlier order's hive bore meanwhile
  const grpMark = () => ev(() => window.VECTOR.sim.S.grpN);
  const bornSince = (mark) => ev((g0) => { const U = window.VECTOR.sim.U, out = []; for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === 0 && U.grp[i] >= g0) out.push({ i, lane: U.lane[i], goalX: U.goalX[i] }); return out; }, mark);
  // every west body a muster bore since the mark, the dead included: a slot keeps its team, group and lane until a later muster
  // takes it, and in the probe's short waits the west's only musters are the probe's own - so a battalion killed on arrival still counts
  const bornEver = (mark) => ev((g0) => { const U = window.VECTOR.sim.U, out = []; for (let i = 0; i < U.hi; i++) if (U.team[i] === 0 && U.grp[i] >= g0) out.push({ i, lane: U.lane[i], alive: !!U.alive[i] }); return out; }, mark);
  const setEnergy = (v) => ev((q) => { window.VECTOR.sim.S.energy[0] = q; }, v);
  const goCard = () => ev(() => { const c = document.querySelector('.card.go') || document.querySelector('.card:not(.dim)') || document.querySelector('.card'); if (!c) return null; const r = c.getBoundingClientRect(); return { i: +c.dataset.i, id: c.dataset.k, x: r.x + r.width / 2, y: r.y + r.height / 2, go: c.classList.contains('go') }; });
  const fieldCentre = async () => { const r = await ev(() => window.VECTOR.view && window.VECTOR.view.rect); const q = r || { x: G.rect[0], y: G.rect[1], w: G.rect[2], h: G.rect[3] }; return { x: q.x + q.w / 2, y: q.y + q.h / 2, rect: q }; };
  // the camera put on a lane (a re-follow, given its settle), and the screen point of a lane at the camera's x: where a drop lands in it
  const lookAt = async (lane) => { await ev((l) => window.VECTOR.follow(l), lane); await sleep(700); };
  const laneScreen = (lane) => ev((l) => { const V = window.VECTOR, q = window.__probe.look(); const [x, y] = V.R.toScreen(V.view, q.x, [1000, 2500, 4000][l]); return { x, y, wx: q.x }; }, lane);
  // a mouse drag in steps, with a hook after the first 20 px
  async function drag(from, to, after20) {
    await p.mouse.move(from.x, from.y); await p.mouse.down();
    const dx = to.x - from.x, dy = to.y - from.y, d = Math.hypot(dx, dy);
    await p.mouse.move(from.x + dx / d * 20, from.y + dy / d * 20, { steps: 4 });
    if (after20) await after20();
    await p.mouse.move(to.x, to.y, { steps: 12 });
  }

  await p.goto(URL0 + (URL0.includes('?') ? '&' : '?') + 'seed=1&cb=' + Date.now(), { waitUntil: 'load' });
  await sleep(1500);

  // ---- 1. BOOT
  const boot = await ev((g) => {
    const V = window.VECTOR; if (!V) return null;
    const r = (s) => { const el = document.querySelector(s); if (!el) return null; const q = el.getBoundingClientRect(); return { x: q.x, y: q.y, w: q.width, h: q.height }; };
    const cards = [...document.querySelectorAll('.card')].map((c) => { const q = c.getBoundingClientRect(); return { w: q.width, h: q.height, in: q.left >= 0 && q.top >= 0 && q.right <= innerWidth && q.bottom <= innerHeight }; });
    const se = document.scrollingElement || document.documentElement;
    return { T: V.sim.T.n, WL: V.sim.WL.n, glass: document.body.dataset.glass, absent: ['#hint', '#fortify', '#views'].filter((s) => !document.querySelector(s)), more: r('#more'), cards, scroll: se.scrollHeight <= innerHeight + 1 && se.scrollWidth <= innerWidth + 1, energy: (document.querySelector('#energy') || {}).textContent, clock: (document.querySelector('#clock') || {}).textContent, lanes: [...document.querySelectorAll('#lanes .lane')].map((l) => { const q = l.getBoundingClientRect(); return { w: q.width, h: q.height, k: (l.querySelector('.k') || l).textContent.trim()[0] }; }), gl: !!document.querySelector('#field').getContext('webgl2'), iw: innerWidth };   // the strip's buttons only: drag.js's lane word is .lbl.lane (§9.8)
  }, GLASS);
  if (!boot) {
    check(1, 'BOOT', false, 'window.VECTOR missing (main.js did not boot) · page errors: ' + (errs.join(' | ') || 'none'));
    for (let n = 2; n <= 15; n++) note(n, 'SKIP · no page');
    await shot(0, 'boot');   // what the glass showed instead of a game
    await finish();
    return;
  }
  {
    const cardOk = boot.cards.length === 8 && boot.cards.every((c) => within(c.w, G.card[0], 1) && within(c.h, G.card[1], 1) && c.in);
    const moreOk = boot.more && within(boot.more.w, 44, 1) && within(boot.more.h, 44, 1) && boot.more.x + boot.more.w >= boot.iw - 2 && boot.more.y <= 2;
    const lanesOk = boot.lanes.length === 3 && boot.lanes.every((l, i) => within(l.w, 44, 1) && within(l.h, 36, 1) && l.k === G.letters[i]);
    const ok = errs.length === 0 && boot.T === 10 && boot.WL === 15 && boot.glass === G.glass && boot.absent.length === 3 && moreOk && cardOk && boot.scroll && /◆ \d+ \+\d+\/s/.test(boot.energy || '') && /\d:\d\d/.test(boot.clock || '') && lanesOk && boot.gl;
    check(1, 'BOOT', ok, `T ${boot.T} WL ${boot.WL} glass ${boot.glass} (wants ${G.glass}) · absent ${boot.absent.join(',')} · #more ${rectStr(boot.more)} · cards ${boot.cards.length} of ${boot.cards[0] ? Math.round(boot.cards[0].w) + '×' + Math.round(boot.cards[0].h) : '—'} (wants ${G.card.join('×')}) · scroll ${boot.scroll ? 'none' : 'YES'} · strip "${boot.energy}" "${boot.clock}" · lanes ${boot.lanes.map((l) => l.k + ' ' + Math.round(l.w) + '×' + Math.round(l.h)).join(' ')} · webgl2 ${boot.gl} · errors ${errs.length}`);
    if (boot.more) measure('⋯ 44 × 44', '44×44', `${Math.round(boot.more.w)}×${Math.round(boot.more.h)}`, 'rect');
    if (boot.cards[0]) measure(`card ${G.card.join(' × ')}`, G.card.join('×'), `${Math.round(boot.cards[0].w)}×${Math.round(boot.cards[0].h)}`, 'rect');
    if (boot.lanes[0]) measure('lane arrow 44 × 36', '44×36', `${Math.round(boot.lanes[0].w)}×${Math.round(boot.lanes[0].h)}`, 'rect');
  }
  for (const [sel, name, spec] of [['#strip', 'strip', `${G.strip} tall`], ['#surge', 'surge band', `${G.ctx.viewport.width} × ${G.surge}`], ['#hand', 'hand', `${G.hand} tall`]]) { const r = await rect(sel); if (r) measure(name, spec, sel === '#surge' ? `${Math.round(r.w)} × ${Math.round(r.h)}` : `${Math.round(r.h)} tall`, 'rect'); }
  { const r = await ev(() => window.VECTOR.view && window.VECTOR.view.rect); measure('field rect', G.rect.join(','), r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}` : '—', 'rect'); }

  // ---- 2. THE BELL
  // the coach's word (§2.9): the bare verb when its front bar is on the glass, else main.js pins it inside the rect with an arrow
  // the way the bar lies and the lane's letter - '◀ PUSH · C', 'PUSH · C ▶', '▲ PUSH · C', '▼ PUSH · C'. At the bell the west's bar
  // stands at 1,500, off every glass, so the pinned form is what the glass shows; either form must carry this verb and this lane
  const coachSays = (text, verb, letter) => text === verb || new RegExp(`^(?:[◀▲▼] ${verb} · ${letter}|${verb} · ${letter} ▶)$`).test(text);
  {
    const bell = await ev(() => { const V = window.VECTOR, go = document.querySelector('.card.go'); const tag = go && go.querySelector('.tag'); const word = document.querySelector('.lbl.word'); const glow = go ? getComputedStyle(go).animationDuration : ''; return { go: !!go, tag: tag ? tag.textContent.trim() : '', tagShown: tag ? getComputedStyle(tag).display !== 'none' : false, word: word ? word.textContent.trim() : '', wordShown: word ? getComputedStyle(word).display !== 'none' : false, lane: V.state.advice && V.state.advice.lane, verb: V.state.advice && V.state.advice.verb, glow }; });
    const wordOk = coachSays(bell.word, 'PUSH', G.letters[1]);
    check(2, 'THE BELL', bell.go && bell.tag === 'GO' && bell.tagShown && wordOk && bell.wordShown && bell.lane === 1, `.card.go ${bell.go} · tag "${bell.tag}" · word "${bell.word}" (wants PUSH, or pinned toward lane ${G.letters[1]}) · advice ${bell.verb} lane ${bell.lane}`);
    measure('coach glow 1,200', '1.2s', bell.glow || '—', 'css');
  }

  // the glass's own pace before anything is staged: the floor under the fps rows (SwiftShader draws every pixel on the CPU)
  await sleep(1200);
  measure('fps idle, nothing staged', '≥ 55', String(await ev(() => +window.VECTOR.fps.toFixed(1))), 'info');

  // ---- the board for the battle frame: at 12 s of a fresh match both fronts still stand at the gates, 6,000 wu apart and outside every
  // glass's view, and the picture (§11.3) wants the front bars with their chevrons. So the centre lane is dealt a mid-match board by hand -
  // the west holds its first two points, the east its last two, owner and prog as a capture leaves them (WL index lane · 5 + slot); the sim's
  // own stepCheckpoints re-reads the fronts within five ticks, 3,850 and 5,150 with both chevrons at THE CENTRE - and the camera is pinned
  // where the bars are: at their midpoint on a glass whose view holds both with their chevrons, else 50 wu past the west bar (portrait sees
  // 1,239 wu along the lane and the bars stand 1,300 apart: the west bar and the fight on it, THE CENTRE at the top of the glass). The west
  // bar reads gold in the frame, not cyan: the coach points at the centre lane at the bell and its mark is that bar pulsing gold (§2.9)
  await untilSim(9);
  await ev(() => { const WL = window.VECTOR.sim.WL; for (const [slot, team] of [[0, 0], [1, 0], [3, 1], [4, 1]]) { WL.owner[5 + slot] = team; WL.prog[5 + slot] = team === 0 ? 1 : -1; } });
  await sleep(250);
  const board = await ev(() => { const V = window.VECTOR, v = V.view, f = V.sim.front(), fw = f.w[1], fe = f.e[1], along = (v.rot ? v.rect.h : v.rect.w) / v.zoom, both = fe - fw + 240 <= along; V.follow(1, both ? (fw + fe) / 2 : fw + 50); return { fw, fe, along: Math.round(along), both }; });
  await sleep(700);
  note(13, `lane 1 dealt: west holds points 1-2, east 4-5 · fronts ${board.fw} / ${board.fe} · ${board.along} wu along the lane in view · camera ${board.both ? 'between the bars' : 'on the west bar'}`);
  // ---- the battle, made so it is mid-fight at the 12 s frame: both sides in the followed lane either side of the camera's point, ordered to
  // meet at it - motes (their bolts are the white tracers, touching motes the seam) and blocks (the heavy shapes). A mote volley is over in
  // a second, so two are staged, at 10.5 s and 11.5 s: the first is dying and the second arriving when the frame is taken and read.
  const volley = () => ev(() => { const P = window.__probe, q = P.look(); P.fieldAt(0, 'MOTE', 14, q.x - 200, q.y, 40, q.lane, q.x); P.fieldAt(0, 'BLOCK', 2, q.x - 250, q.y, 30, q.lane, q.x); P.fieldAt(1, 'MOTE', 14, q.x + 200, q.y, 40, q.lane, q.x); P.fieldAt(1, 'BLOCK', 2, q.x + 250, q.y, 30, q.lane, q.x); });
  await untilSim(10.5); await volley();
  await untilSim(11.5); await volley();

  // ---- 13. THE BATTLE FRAME at 12 s, and 14. the fps over the 3 s after it - sampled before the readbacks (a readback stalls the GPU and a
  // megapixel analysis stalls the page), with two more volleys through the window so the pixel reads that follow still find a fight on
  await untilSim(12);
  await shot(1, 'battle');
  {
    const fpsA = [];
    for (let k = 0; k < 6; k++) { fpsA.push(await ev(() => +window.VECTOR.fps.toFixed(1))); await sleep(500); if (k === 1 || k === 4) await volley(); }
    let seamR = null;   // the seam first: its pairs live a second
    if (GLASS !== 'desk') for (let k = 0; k < 6 && !(seamR && seamR.dark); k++) { const s = await ev(() => window.__probe.seam()); if (!seamR || (s.pair && (!seamR.pair || s.minLuma < seamR.minLuma))) seamR = s; if (!(seamR && seamR.dark)) await sleep(100); }
    const best = { blobs: 0 };
    for (let k = 0; k < 4; k++) {
      const a = await ev(async (r) => window.__probe.analyse(await window.VECTOR.readback(r.x, r.y, r.w, r.h), r), (await fieldCentre()).rect);
      if (a.streaks > (best.streaks || 0) || !best.w) Object.assign(best, a);
      if (a.streaks && a.west && a.east) break;
      await sleep(120);
    }
    const ok = best.big >= 6 && best.west >= 1 && best.east >= 1 && best.streaks >= 1 && best.glowPx === 0 && (GLASS === 'desk' || (seamR && seamR.dark));
    check(13, 'THE BATTLE FRAME', ok, `${best.w}×${best.h} css @${best.dpr} · filled blobs ≥ 10 px ${best.big} (body-sized ${best.bodySized}, biggest ${best.biggest} px) · west ${best.west} east ${best.east} · white streaks ≥ 12 px ${best.streaks} · glow px ${best.glowPx}${best.worst ? ' worst ' + JSON.stringify(best.worst) : ''}${GLASS !== 'desk' ? ' · seam ' + (seamR && seamR.pair ? `${seamR.dark ? 'dark pixel' : 'NO dark pixel'} between motes ${seamR.pair.join('/')} at ${seamR.dist} px (drawR ${seamR.drawR}, ${seamR.pairs} pairs in reach) min luma ${seamR.minLuma} · profile ${seamR.lumas.join(',')}` : 'no adjacent motes in view (' + (seamR ? seamR.motes : 0) + ' motes)') : ''}`);
    const mean = fpsA.reduce((s, v) => s + v, 0) / fpsA.length, lo = Math.min(...fpsA);
    check(14, 'FPS AT 12 S', mean >= 55, `V.fps over 3 s: ${fpsA.join(' ')} · mean ${mean.toFixed(1)} · min ${lo} (SwiftShader)`);
    measure('fps at 12 s ≥ 55', '≥ 55', mean.toFixed(1), 'fps', null, `min ${lo}`);
  }

  // ---- 3. THE DRAG: the glowing card from its centre to the field rect's centre, with the centre lane under the glass
  {
    await setEnergy(5000);
    await lookAt(1);
    const card = await goCard(), c = await fieldCentre();
    const before = await grpMark(), m0 = await musters(), spent0 = await ev(() => window.VECTOR.sim.S.stats.spent[0]);
    await arm('lift', '!!document.querySelector(".card.lift")', 2000);
    await arm('liftScale', '(() => { const c = document.querySelector(".card.lift"); if (!c) return false; const m = getComputedStyle(c).transform.match(/matrix\\(([^,]+)/); return m && +m[1] >= 1.05; })()', 2000);
    await arm('light', 'V.view && V.view.lanes && V.view.lanes[1].fxTeam === V.state.team && V.view.lanes[1].fxAmt >= 0.11', 3000);   // the drag's own tint: the coach's gold bar also rides uFx (fxTeam 2, §2.9)
    // the light's 100 ms (§4.3, §4.8) counts from the finger's first frame over the band: the drag begins 12 px up the card, over the hand -
    // a cancel zone with no band under it - and the pointer's steps into the field are the wire's time, not the ramp's
    await arm('overBand', 'V.state.drag && V.state.drag.phase === "drag" && V.state.drag.lane === 1', 3000);
    let at20 = null;
    await drag({ x: card.x, y: card.y }, c, async () => { at20 = await ev(() => ({ phase: window.VECTOR.state.drag && window.VECTOR.state.drag.phase, held: !!document.querySelector('#hand.held, .card.held') })); });
    await sleep(250);
    const mid = await ev(() => { const V = window.VECTOR, d = V.state.drag, lane = document.querySelector('.lbl.lane'), chip = [...document.querySelectorAll('.lbl.chip')].find((e) => getComputedStyle(e).display !== 'none' && /CENTRE/.test(e.textContent)); return { phase: d && d.phase, lane: d && d.lane, snap: d && d.snap && { kind: d.snap.kind, x: d.snap.x }, laneWord: lane && getComputedStyle(lane).display !== 'none' ? lane.textContent.trim() : '', chip: chip ? chip.textContent.trim() : '', held: !!document.querySelector('#hand.held, .card.held'), slideAt: d && d.slideFrom && d.slideFrom.at, gx: d && d.gx }; });
    if (!G.ctx.hasTouch) await shot(2, 'drag');   // a phone's frame is the touch drag's, below: its ghost rides above the finger
    const chipPoint = /THE CENTRE/.test(mid.chip) ? 4500 : (mid.chip.match(/POINT (\d)/) ? CP_X[+mid.chip.match(/POINT (\d)/)[1] - 1] : NaN);
    await arm('flash', '!!document.querySelector(".card.flash")', 1500);
    await arm('flashOff', '(() => { const P = window.__probe; return P.marks.flash > 0 && !document.querySelector(".card.flash"); })()', 2500);
    await arm('orderChip', '[...document.querySelectorAll(".lbl.chip")].some((e) => /→\\sCENTRE/.test(e.textContent) && getComputedStyle(e).display !== "none")', 1500);
    await arm('orderChipGone', '(() => { const P = window.__probe; return P.marks.orderChip > 0 && ![...document.querySelectorAll(".lbl.chip")].some((e) => /→\\sCENTRE/.test(e.textContent) && getComputedStyle(e).display !== "none"); })()', 3000);
    await arm('flight', '!V.state.drag', 2500);
    await arm('lightOff', 'V.view && V.view.lanes && (V.view.lanes[1].fxTeam !== V.state.team || V.view.lanes[1].fxAmt <= 0.005)', 3000);
    await p.mouse.up();
    // the price at the release: the clock's mult moves it a point or two over a drag's seconds, so it is read now and not before the press
    const priceAt = await ev((i) => window.VECTOR.sim.price(window.VECTOR.sim.decks[0][i]), card.i);
    await read('flash'); await read('flight');
    await sleep(1300);
    const born = await bornSince(before), m1 = await musters(), spent1 = await ev(() => window.VECTOR.sim.S.stats.spent[0]);
    const chipMs = await at('orderChip'), chipGone = await at('orderChipGone'), flashAt = await at('flash'), flashOff = await at('flashOff'), lightMs = await at('light'), lightOff = await at('lightOff'), liftMs = await at('lift'), liftScale = await at('liftScale'), flightAt = await at('flight');
    const upAt = await ev(() => window.__probe.stamps.up);   // the release as the page saw it: the flash, the flight and the light's fade count from here
    const flashMs = flashAt > 0 ? Math.round(flashAt - upAt) : -1, charged = spent1 - spent0;
    const bodiesOk = born.length > 0 && born.every((q) => q.lane === 1) && born.every((q) => within(q.goalX, chipPoint, 1));
    const ok = at20 && at20.phase === 'drag' && mid.held && /^(TOP|CENTRE|BOTTOM|LEFT|RIGHT)$/.test(mid.laneWord) && /CENTRE · (POINT \d|THE CENTRE)/.test(mid.chip) && m1 === m0 + 1 && bodiesOk && within(charged, priceAt, 1) && chipMs >= 0 && chipGone - chipMs >= 1000 && flashMs >= 0 && flashMs <= 150;
    check(3, 'THE DRAG', ok, `at +20 px phase ${at20 && at20.phase} · held ${mid.held} · lane word "${mid.laneWord}" · chip "${mid.chip}" (point x ${chipPoint}) · musters ${m0} → ${m1} · ${born.length} bodies lane ${[...new Set(born.map((q) => q.lane))].join(',')} goalX ${[...new Set(born.map((q) => Math.round(q.goalX)))].join(',')} · charged ${charged} of ${priceAt} at the release · order chip alive ${chipGone > 0 && chipMs >= 0 ? Math.round(chipGone - chipMs) : '—'} ms · .flash ${flashMs} ms after the release`);
    measure('card lift 80', 80, liftScale >= 0 && liftMs >= 0 ? Math.round(liftScale - liftMs) : (liftMs >= 0 ? 0 : -1));
    const overBandAt = await at('overBand');
    measure('lane light in 100', 100, lightMs >= 0 && overBandAt >= 0 ? Math.round(lightMs - overBandAt) : -1);
    measure('lane light out 200', 200, lightOff > 0 && upAt > 0 ? Math.round(lightOff - upAt) : -1);
    measure('drop return flight 220', 220, flightAt > 0 && upAt > 0 ? Math.round(flightAt - upAt) : -1);
    measure('card flash 120', 120, flashOff > 0 && flashAt > 0 ? Math.round(flashOff - flashAt) : -1);
    measure('destination chip 1,200', 1200, chipGone > 0 && chipMs >= 0 ? Math.round(chipGone - chipMs) : -1);
    // the same drag by a real touch on the phone glasses: the aim rides 48 px above the finger, so the finger stops 48 px lower. Frame 2
    // is taken here, the finger held on the glass (§11.3: the ghost as outlines above the finger), with the ghost's lift read off the drag
    if (G.ctx.hasTouch) {
      const cdp = await ctx.newCDPSession(p);
      const card2 = await goCard(), c2 = await fieldCentre(), before2 = await grpMark(), m2 = await musters();
      const touch = async (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
      await touch('touchStart', card2.x, card2.y);
      const tx = c2.x, ty = c2.y + 48;
      for (let k = 1; k <= 10; k++) { await touch('touchMove', card2.x + (tx - card2.x) * k / 10, card2.y + (ty - card2.y) * k / 10); await sleep(30); }
      await sleep(200);   // the ghost's 120 ms slide to its snap
      const tmid = await ev(() => { const V = window.VECTOR, d = V.state.drag; if (!d) return {}; const [gx, gy] = V.R.toScreen(V.view, d.gx, d.gy); return { phase: d.phase, lane: d.lane, touch: d.touch, finger: [d.x, d.y].map(Math.round), aim: [d.ax, d.ay].map(Math.round), ghost: [gx, gy].map(Math.round) }; });
      await shot(2, 'drag');
      note(3, `frame 2 on the touch drag: finger ${tmid.finger} · aim ${tmid.aim} (${tmid.finger && tmid.aim ? tmid.finger[1] - tmid.aim[1] : '—'} px above the finger) · ghost ${tmid.ghost}`);
      await touch('touchEnd', tx, ty);
      await sleep(600);
      const born2 = await bornSince(before2), m3 = await musters();
      const same = tmid.phase === 'drag' && m3 === m2 + 1 && born2.length > 0 && born2.every((q) => q.lane === 1);
      if (!same) note(3, `WARNING · the CDP touch drag diverged from the mouse drag: phase ${tmid.phase} lane ${tmid.lane} touch ${tmid.touch} · musters ${m2} → ${m3} · bodies ${born2.length} lanes ${[...new Set(born2.map((q) => q.lane))].join(',')}`);
      else note(3, `the CDP touch drag mustered ${born2.length} bodies into lane 1 like the mouse`);
      await cdp.detach();
    }
  }

  // ---- 4. THE CANCEL: a drag released over the hand
  {
    const card = await goCard(), c = await fieldCentre(), m0 = await musters(), spent0 = await ev(() => window.VECTOR.sim.S.stats.spent[0]);
    await drag({ x: card.x, y: card.y }, { x: c.x, y: c.y });
    await sleep(150);
    await p.mouse.move(card.x, card.y, { steps: 10 });
    await sleep(150);
    const over = await ev(() => { const d = window.VECTOR.state.drag, chip = [...document.querySelectorAll('.lbl.chip')].find((e) => getComputedStyle(e).display !== 'none' && /RELEASE TO CANCEL/.test(e.textContent)); return { phase: d && d.phase, zone: d && d.cancelZone, chip: !!chip }; });
    await p.mouse.up();
    await sleep(400);
    const m1 = await musters(), spent1 = await ev(() => window.VECTOR.sim.S.stats.spent[0]);
    check(4, 'THE CANCEL', over.phase === 'drag' && over.chip && m1 === m0 && spent1 === spent0, `over the hand: phase ${over.phase} zone ${over.zone} chip RELEASE TO CANCEL ${over.chip} · musters ${m0} → ${m1} · charged ${spent1 - spent0}`);
  }

  // ---- 5. THE TAP: down/up within 120 ms on the glowing card; two taps, two musters
  {
    await setEnergy(9000); await sleep(1100);
    const readAdvice = () => ev(() => { const a = window.VECTOR.state.advice; return a && { lane: a.lane, x: a.x, verb: a.verb, card: a.card }; });
    const card = await goCard(), adv = await readAdvice();
    const before = await grpMark(), m0 = await musters();
    const tap = async () => { await p.mouse.move(card.x, card.y); await p.mouse.down(); await sleep(60); await p.mouse.up(); };
    await tap();
    const adv2 = await readAdvice();   // the coach re-reads the field once a second: a point captured between the read and the press moves its x, so either reading is the tap's
    await sleep(350);
    const born1 = await bornSince(before), m1 = await musters();
    await tap(); await sleep(350);
    const m2 = await musters();
    const sentTo = (a) => a && born1.every((q) => q.lane === a.lane && within(q.goalX, a.x, 60));
    const ok = born1.length > 0 && (sentTo(adv) || sentTo(adv2)) && m1 === m0 + 1 && m2 === m0 + 2;
    check(5, 'THE TAP', ok, `advice ${adv && adv.verb} lane ${adv && adv.lane} x ${adv && adv.x} card ${adv && adv.card}${adv2 && adv && adv2.x !== adv.x ? ` (x ${adv2.x} by the release)` : ''} (tapped ${card.id}${card.go ? '' : ', NOT glowing'}) · first tap: ${born1.length} bodies lane ${[...new Set(born1.map((q) => q.lane))].join(',')} goalX ${[...new Set(born1.map((q) => Math.round(q.goalX)))].join(',')} · musters ${m0} → ${m1} → ${m2}`);
    measure('tap window 250', '< 250 taps', 'a 60 ms press tapped', 'info');
  }

  // ---- 6. THE HOLD: 300 ms still on a card with both a BEATS and a LOSES role; enemies of both roles fielded first, in the followed lane at the
  // camera's point (where the glass looks), with his own side held still for the read's seconds so nothing shoots the staged enemies before it
  {
    await lookAt(1);
    const pick = await ev(async (kinds) => {
      const lib = await import('../src/sim/library.js');
      const V = window.VECTOR, P = window.__probe, deck = V.sim.decks[0];
      const i = deck.findIndex((b) => lib.BEATS[b.role].length && lib.LOSES[b.role].length);
      if (i < 0) return null;
      const role = deck[i].role, c = document.querySelectorAll('.card')[i].getBoundingClientRect();
      const beats = lib.BEATS[role][0], loses = lib.LOSES[role][0], q = P.look();
      P.stun(0, 4);
      const a = P.fieldAt(1, kinds[beats], 4, q.x + 120, q.y - 60, 40, q.lane), b = P.fieldAt(1, kinds[loses], 4, q.x - 120, q.y + 60, 40, q.lane);
      return { i, id: deck[i].id, role, beats, loses, lane: q.lane, x: c.x + c.width / 2, y: c.y + c.height / 2, enemies: [...a, ...b] };
    }, KIND_OF_ROLE);
    if (!pick) check(6, 'THE HOLD', false, 'no card in the deck has both a BEATS and a LOSES role');
    else {
      await sleep(400);
      const m0 = await musters();
      await arm('hold', '!!V.state.hold', 2000);
      await p.mouse.move(pick.x, pick.y); await p.mouse.down();
      await read('hold');
      const holdMs = await ev(() => { const P = window.__probe; return P.marks.hold > 0 && P.stamps.down > 0 ? Math.round(P.marks.hold - P.stamps.down) : -1; });   // from the press as the page saw it
      await sleep(Math.max(0, 300 - Math.max(0, holdMs)) + 120);
      const held = await ev(() => { const V = window.VECTOR, b = document.getElementById('banner'); return { batt: V.state.hold && V.state.hold.batt, on: b && getComputedStyle(b).display !== 'none', text: b ? b.textContent.replace(/\s+/g, ' ').trim() : '' }; });
      // the green and red rings sit on the enemy bodies: read a box around each within 200 ms of the hold
      const pix = await ev(async (ids) => {
        const V = window.VECTOR, U = V.sim.U, P = window.__probe, view = V.view;
        let green = 0, red = 0, boxes = 0;
        const t0 = performance.now();
        for (const i of ids) {
          if (!U.alive[i]) continue;
          const [sx, sy] = V.R.toScreen(view, U.x[i], U.y[i]), r = view.rect;
          if (sx < r.x || sx > r.x + r.w || sy < r.y || sy > r.y + r.h) continue;
          const img = await V.readback(sx - 24, sy - 24, 48, 48); boxes++;
          for (let p = 0; p < img.width * img.height; p++) { const R = img[p * 4], G = img[p * 4 + 1], B = img[p * 4 + 2]; if (Math.abs(R - 92) <= 20 && Math.abs(G - 255) <= 20 && Math.abs(B - 122) <= 20) green++; if (Math.abs(R - 255) <= 20 && Math.abs(G - 77) <= 20 && Math.abs(B - 77) <= 20) red++; }
        }
        return { green, red, boxes, ms: Math.round(performance.now() - t0) };
      }, pick.enemies);
      await shot(3, 'hold');
      await p.mouse.up();
      await sleep(400);
      const m1 = await musters();
      const ok = held.batt === pick.i && /beats .* loses to/.test(held.text) && /good \d+ · bad \d+/.test(held.text) && pix.green >= 1 && pix.red >= 1 && m1 === m0;
      check(6, 'THE HOLD', ok, `card ${pick.id} (role ${pick.role}, beats ${pick.beats}, loses ${pick.loses}) · enemies staged in lane ${pick.lane} · hold armed ${holdMs} ms after the press · state.hold.batt ${held.batt} · banner "${held.text.slice(0, 110)}" · pixels green ${pix.green} red ${pix.red} in ${pix.boxes} boxes read in ${pix.ms} ms · musters ${m0} → ${m1}`);
      measure('preview arms 180', 180, holdMs);
    }
  }

  // ---- 7. UNAFFORDABLE: energy 0, a press shakes and lifts nothing
  {
    await setEnergy(0); await sleep(120);
    const card = await ev(() => { const c = document.querySelector('.card'); const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; });
    const m0 = await musters();
    await arm('shake', '!!document.querySelector(".card.shake")', 1000);
    await arm('shakeOff', '(() => { const P = window.__probe; return P.marks.shake > 0 && !document.querySelector(".card.shake"); })()', 2000);
    await p.mouse.move(card.x, card.y); await p.mouse.down();
    const shakeMs = await read('shake');
    const st = await ev(() => ({ lift: !!document.querySelector('.card.lift'), drag: !!window.VECTOR.state.drag, dim: !!document.querySelector('.card.dim') }));
    await sleep(120);
    await p.mouse.up(); await sleep(300);
    const m1 = await musters(), shakeOff = await at('shakeOff');
    check(7, 'UNAFFORDABLE', shakeMs >= 0 && !st.lift && !st.drag && m1 === m0, `.shake at ${shakeMs} ms · .lift ${st.lift} · drag ${st.drag} · .dim ${st.dim} · musters ${m0} → ${m1}`);
    measure('unaffordable shake 200', 200, shakeOff > 0 && shakeMs >= 0 ? Math.round(shakeOff - (await at('shake'))) : -1);
    await setEnergy(9000);
  }

  // ---- 8. THE SURGE: the meter set full, the band ready, dragged onto the centre lane - put under the glass first, his bodies standing in it
  {
    await lookAt(1);
    await ev(() => { const V = window.VECTOR, P = window.__probe, s = V.sim.snapshot(); if (!s.lanes[1].fielded[0].some((v) => v > 0)) { const q = P.look(); P.fieldAt(0, 'DART', 6, q.x, q.y, 40, 1); } });
    await arm('ready', 'document.querySelector("#surge").classList.contains("ready") && /SURGE READY/.test(document.querySelector("#surge").textContent)', 1500);
    await ev(() => { window.VECTOR.sim.S.surge[0] = 10000; });
    const readyMs = await read('ready');
    const band = await rect('#surge'), to = await laneScreen(1), surges0 = await ev(() => window.VECTOR.sim.S.stats.surges[0]);
    await drag({ x: band.x + band.w / 2, y: band.y + band.h / 2 }, to);
    await sleep(150);
    const mid = await ev(() => { const d = window.VECTOR.state.drag; return { phase: d && d.phase, batt: d && d.batt, lane: d && d.lane }; });
    // the drain, counted from the release as the page saw it: the bar falls from full to under a tenth of the band (kills during the surge
    // refill the meter a little at once, so an empty bar is not owed); the 400 ms is the bar's own transition, read off its style
    await arm('drain', `document.querySelector("#surge .bar").getBoundingClientRect().width <= ${Math.max(2, band.w * 0.1)}`, 3000);
    await p.mouse.up();
    await sleep(120);
    const fired = await ev(() => { const V = window.VECTOR, S = V.sim.S; return { lane: S.surgeLane[0], until: S.surgeUntil[0], time: V.sim.time, meter: S.surge[0], surges: S.stats.surges[0] }; });
    await read('drain');
    const drainMs = await ev(() => { const P = window.__probe; return P.marks.drain > 0 && P.stamps.up > 0 ? Math.round(P.marks.drain - P.stamps.up) : -1; });
    const transition = await ev(() => getComputedStyle(document.querySelector('#surge .bar')).transitionDuration);
    let plateMs = -1;
    for (let k = 0; k < 40 && plateMs < 0; k++) { const pl = await ev(() => window.__probe.plates.filter((q) => /YOU SURGE · CENTRE/.test(q.text)).length); if (pl) plateMs = k * 100; else await sleep(100); }
    // the op zeroes the meter before its first-tick effects, and a BARRAGE salvo's kills (or a capture landing the same instant) refill it
    // a little at once - so the meter is read as 'zeroed' when it holds under a quarter, which no single tick's kills could fill from 10,000
    const zeroed = fired.meter < 2500;
    const ok = readyMs >= 0 && readyMs <= 600 && mid.phase === 'drag' && mid.batt === 'surge' && fired.surges === surges0 + 1 && fired.lane === 1 && fired.until > fired.time && zeroed && plateMs >= 0 && drainMs >= 0 && drainMs <= 500;
    check(8, 'THE SURGE', ok, `#surge.ready at ${readyMs} ms · drag phase ${mid.phase} batt ${mid.batt} lane ${mid.lane} · surgeLane ${fired.lane} · until ${fired.until && fired.until.toFixed(1)} > time ${fired.time.toFixed(1)} · meter ${fired.meter} (${zeroed ? 'zeroed' : 'NOT zeroed'}) · plate YOU SURGE · CENTRE ${plateMs >= 0 ? 'within ' + plateMs + ' ms' : 'NOT SEEN'} · band under a tenth ${drainMs} ms after the release (transition ${transition})`);
    measure('surge drain 400', '0.4s', transition, 'css', null, `under a tenth in ${drainMs} ms`);
  }

  // ---- 9. THE SHATTER: the east's centre gate at 1 hp, six darts carried to its far side - in the yard, 170 wu off its edge, where the
  // east's own musters (220 wu before the gate, in the run) are out of the darts' aggro and cannot draw their beams off the gate; the
  // camera looks at the gate itself, so the blast stands in the middle of the glass, below the plate on every glass (a look at x 7,400
  // left portrait's gate at css y 127, the white disc and the fragments under the two-line plate)
  {
    await ev(() => window.VECTOR.follow(1, 7900, 2500));
    await sleep(700);
    const surge0 = await ev(() => { const S = window.VECTOR.sim.S; S.surge[0] = 1000; return S.surge[0]; });
    await arm('shatter', 'V.sim.T.alive[6] === 0', 12000);
    await arm('flashOn', 'parseFloat(getComputedStyle(document.getElementById("flash")).opacity) > 0.2', 12000);
    await arm('flashLeft', '(() => { const o = parseFloat(getComputedStyle(document.getElementById("flash")).opacity); return o > 0.01 ? { left: V.state.flashUntil - performance.now() } : false; })()', 12000, true);   // the flash's own budget, read on its first frame
    await arm('slowAtFlash', '(() => { const P = window.__probe; if (!(P.marks.flashOn > 0)) return false; const s = V.state.slowUntil; return { slow: s > performance.now() || (s > 0 && s < 1e6 && s > performance.now() / 1000), raw: s, now: performance.now(), shake: V.state.shake && V.state.shake.until }; })()', 12000, true);
    const fps0 = [];
    await ev(() => { const V = window.VECTOR; V.sim.T.hp[6] = 1; window.__probe.fieldAt(0, 'DART', 6, 8180, 2500, 30); });
    const shatterMs = await read('shatter');
    // the frame's moment is when it is asked for: the capture is taken then and the PNG's encoding (half a second at 3×) follows
    const reqAt = await ev(() => performance.now());
    await shot(4, 'shatter');
    const shotAt = await ev(() => performance.now());
    for (let k = 0; k < 6; k++) { fps0.push(await ev(() => +window.VECTOR.fps.toFixed(1))); await sleep(500); }
    const flashMs = await at('flashOn'), shatterAt = await at('shatter'), slow = await at('slowAtFlash'), flashLeft = await at('flashLeft');
    let plates = null;
    for (let k = 0; k < 40; k++) { plates = await ev(() => { const P = window.__probe.plates, a = P.find((q) => /THEIR GATE · CENTRE · SHATTERED/.test(q.text)), b = P.find((q) => /CENTRE LANE BROKEN/.test(q.text)); return { a: a ? a.at : -1, b: b ? b.at : -1 }; }); if (plates.a > 0 && plates.b > 0) break; await sleep(100); }
    const after = await ev(() => { const V = window.VECTOR, WL = V.sim.WL; return { owners: [5, 6, 7, 8, 9].map((w) => WL.owner[w]), surge: V.sim.S.surge[0], shatters: V.sim.S.stats.shatters[0] }; });
    const flipOk = after.owners.every((o) => o === 0), surgeOk = after.surge >= surge0 + 2500 - 1 || after.surge === 10000;
    const ok = shatterMs >= 0 && shatterMs <= 10000 && flashMs > 0 && flashMs - shatterAt <= 100 + 17 && slow && slow.slow && plates.a > 0 && plates.b > 0 && plates.b - plates.a <= 2000 && flipOk && surgeOk && reqAt - shatterAt <= 300;
    check(9, 'THE SHATTER', ok, `shatter at ${Math.round(shatterMs)} ms after the darts · #flash > 0.2 ${flashMs > 0 ? Math.round(flashMs - shatterAt) + ' ms after' : 'NOT SEEN'} · slowUntil ${slow ? JSON.stringify({ slow: slow.slow, raw: slow.raw }) : '—'} · plates SHATTERED ${plates.a > 0 ? Math.round(plates.a - shatterAt) + ' ms' : 'NOT SEEN'} → BROKEN ${plates.b > 0 && plates.a > 0 ? '+' + Math.round(plates.b - plates.a) + ' ms' : 'NOT SEEN'} · lane 1 owners ${after.owners.join('')} · surge ${surge0} → ${Math.round(after.surge)} · frame asked ${Math.round(reqAt - shatterAt)} ms after (written ${Math.round(shotAt - shatterAt)} ms)`);
    measure('shatter flash 250', 250, flashLeft && flashLeft.left > 0 ? Math.round(flashLeft.left) : -1);
    measure('slow-time 800 at 0.35×', 800, slow && slow.raw ? Math.round(Math.abs(slow.raw - slow.now) < 60000 ? slow.raw - slow.now : slow.raw * 1000 - slow.now) : -1);   // ms when it sits within a minute of performance.now(), else seconds
    measure('shake 500', 500, slow && slow.shake ? Math.round(slow.shake - slow.now) : -1);
    const mean = fps0.reduce((s, v) => s + v, 0) / fps0.length, lo = Math.min(...fps0);
    check(14, 'FPS ACROSS THE SHATTER', mean >= 55, `V.fps over 3 s: ${fps0.join(' ')} · mean ${mean.toFixed(1)} · min ${lo}`);
    measure('fps across the shatter ≥ 55', '≥ 55', mean.toFixed(1), 'fps', null, `min ${lo}`);
  }

  // ---- 10. THE WAVE: the captain's plate by name within 45 s, the alarm, the gold dot on the lane's arrow
  {
    // announce.js joins the glyphs, the arrow and the lane word with no-break spaces (the line never wraps between them): \s reads both
    const WAVE = /WAVE \d+ · THE [A-Z ]+ · .*→\s(TOP|CENTRE|BOTTOM|LEFT|RIGHT)/;
    let wave = null;
    while (!wave && (await simTime()) < 45.5) { wave = await ev((src) => { const re = new RegExp(src); const q = window.__probe.plates.find((e) => re.test(e.text)); return q ? { text: q.text, time: q.time, coach: q.coach, followed: q.followed, at: q.at, off: q.off } : null; }, WAVE.source); if (!wave) await sleep(300); }
    if (wave && wave.coach === null) { await sleep(1600); wave = await ev((src) => { const re = new RegExp(src); const q = window.__probe.plates.find((e) => re.test(e.text)); return { text: q.text, time: q.time, coach: q.coach, followed: q.followed, at: q.at, off: q.off }; }, WAVE.source); }
    const alarm = await ev(() => { const g = window.VECTOR.sound && window.VECTOR.sound.gates; return !!(g && (g.has ? g.has('wave') : g.wave)); });
    const laneIdx = wave ? { TOP: 0, CENTRE: 1, BOTTOM: 2, LEFT: 0, RIGHT: 2 }[wave.text.match(WAVE)[1]] : -1;   // the west's portrait words: LEFT is lane 0
    const dotOk = !wave || (wave.followed && wave.followed.includes(laneIdx)) || (wave.coach && wave.coach.includes(laneIdx));
    const seen = wave ? '' : await ev(() => window.__probe.plates.map((q) => `${q.time.toFixed(0)}s "${q.text}"`).join(' | '));
    // when no plate came: the captain's own wave state, so a red says whether the captain never announced or the glass swallowed it
    const why = wave ? '' : await ev(() => { const V = window.VECTOR, S = V.sim.S, bot = V.bots.find((q) => q.team === 1) || V.bots[0]; return JSON.stringify({ waves: S.stats.waves, wave: S.wave, pending: bot && bot.pending, energy: V.sim.energy.map(Math.round), alive: [V.sim.U.count[0], V.sim.U.count[1]] }); });   // what the glass did say, for whoever must find the wave
    check(10, 'THE WAVE', !!wave && alarm && dotOk, wave ? `"${wave.text}" at ${wave.time.toFixed(1)} s · alarm gate ${alarm} · lane ${laneIdx} followed ${JSON.stringify(wave.followed)} coach dot ${JSON.stringify(wave.coach)}` : `no wave plate by ${(await simTime()).toFixed(0)} s · alarm gate ${alarm} · plates seen: ${seen || 'none'} · the captain ${why}`);
    if (wave && wave.off < 0) {
      await shot(5, 'wave');   // the frame while the plate is on; then its going-off, for the plate's budget
      for (let k = 0; k < 30 && wave.off < 0; k++) { await sleep(100); wave.off = await ev((src) => { const q = window.__probe.plates.find((e) => new RegExp(src).test(e.text)); return q ? q.off : -1; }, WAVE.source); }
    } else {
      // the plate has passed: a wave is announced by hand for the frame (the same plate path the captain's takes)
      await arm('wavePlate', '/WAVE \\d+ · THE [A-Z ]+/.test(document.getElementById("plate").textContent) && document.getElementById("plate").classList.contains("on")', 6000);
      await ev(() => { window.VECTOR.sim.apply({ op: 'wave', team: 1, lane: 0, roles: [1, 1, 0] }); });
      const ms = await read('wavePlate');
      await sleep(200);
      await shot(5, 'wave');
      note(10, ms >= 0 ? `frame 5 taken on a wave announced by hand (${ms} ms to the plate)` : 'WARNING · a wave announced by hand showed no plate within 6 s; frame 5 is whatever was on the glass');
    }
    if (wave) measure('plate in 150 + hold 2,200 (on → off; 1,650 when cut by a waiting plate)', 2350, wave.off > 0 ? Math.round(wave.off - wave.at) : -1, 'ms', 1650);
  }

  // ---- 11. THE MINIMAP: its rect, a tap on the centre band follows lane 1 and moves the camera, a card dropped on the top band musters into lane 0
  {
    const r = await rect('#minimap');
    const rectOk = r && within(r.x, G.mini[0], 1) && within(r.y, G.mini[1], 1) && within(r.w, G.mini[2], 1) && within(r.h, G.mini[3], 1);
    measure(`minimap ${G.mini.slice(2).join(' × ')} at (${G.mini.slice(0, 2).join(', ')})`, G.mini.join(','), r ? `${Math.round(r.x)},${Math.round(r.y)},${Math.round(r.w)},${Math.round(r.h)}` : '—', 'rect');
    // a point on each band, found through the minimap's own hit test (the map stands up on portrait), inside the run so the follow's clamp leaves its x alone
    const spots = await ev(() => { const M = window.VECTOR.minimap, r = M.rect, out = { 0: null, 1: null }; for (let py = r.y + 2; py < r.y + r.h - 2; py += 2) for (let px = r.x + 2; px < r.x + r.w - 2; px += 2) { const h = M.hit(px, py); if (h && h.inside && h.lane >= 0 && h.lane <= 1 && !out[h.lane] && h.x >= 5500 && h.x <= 7500) out[h.lane] = { x: px, y: py, wx: Math.round(h.x) }; } return out; });
    // the camera parked far up lane 0 as a one-finger pan leaves it (§2.2: free, and nothing pulls a freed camera), so the tap's move is a
    // real one - follow(0, x) does not hold here: twelve seconds past the last order the hottest lane takes the follow the next frame
    await ev(() => { const V = window.VECTOR; Object.assign(V.state.follow, { lane: 0, free: true }); V.view.x = 2000; V.view.y = 1000; });
    await sleep(700);
    const cam0 = await ev(() => ({ x: Math.round(window.VECTOR.view.x), lane: window.VECTOR.state.follow.lane }));
    let tapR = null;
    if (spots[1]) {
      const wx = spots[1].wx, span = Math.abs(cam0.x - wx);
      await arm('refollow', 'V.state.follow.lane === 1 && !V.state.follow.free', 1000);
      await arm('camHalf', `Math.abs(V.view.x - ${wx}) <= ${span / 2}`, 1000);                                       // the camera on its way: half the distance
      await arm('camThere', `Math.abs(V.view.x - ${wx}) <= ${span * 0.03} + 3 / V.view.zoom`, 3000);                  // arrived: within 3 % of the way (a 0.25 lerp's twelfth frame) or 3 css px
      if (G.ctx.hasTouch) await p.touchscreen.tap(spots[1].x, spots[1].y); else await p.mouse.click(spots[1].x, spots[1].y);
      tapR = { follow: await read('refollow'), half: await read('camHalf'), there: await read('camThere') };
      tapR.frames = await ev(() => window.__probe.framesOf('camThere'));
      tapR.after = await ev(() => ({ x: Math.round(window.VECTOR.view.x), lane: window.VECTOR.state.follow.lane }));
    }
    let drop = null;
    if (spots[0]) {
      const card = await goCard(), before = await grpMark(), m0 = await musters();
      await drag({ x: card.x, y: card.y }, { x: spots[0].x, y: spots[0].y });
      await sleep(200);
      await p.mouse.up(); await sleep(600);
      const born = await bornEver(before), m1 = await musters();
      drop = { musters: [m0, m1], lanes: [...new Set(born.map((q) => q.lane))], n: born.length, alive: born.filter((q) => q.alive).length };
    }
    // the tap has moved the camera when it is halfway to the point within 300 ms; the settle is the budget row, in frames of the 0.25 lerp
    const tapOk = tapR && tapR.follow >= 0 && tapR.follow <= 300 && tapR.half >= 0 && tapR.half <= 300, dropOk = drop && drop.musters[1] === drop.musters[0] + 1 && drop.n > 0 && drop.lanes.length === 1 && drop.lanes[0] === 0;
    check(11, 'THE MINIMAP', rectOk && tapOk && dropOk, `rect ${rectStr(r)} (wants ${G.mini.join(',')}) · centre band ${spots[1] ? `tapped at ${spots[1].x},${spots[1].y} (world x ${spots[1].wx}): follow lane ${tapR.after.lane} in ${Math.round(tapR.follow)} ms, camera ${cam0.x} → ${tapR.after.x}: halfway in ${Math.round(tapR.half)} ms, there in ${Math.round(tapR.there)} ms (${tapR.frames} frames)` : 'NOT FOUND by V.minimap.hit'} · top band drop ${spots[0] ? `${drop.n} bodies (${drop.alive} alive) lanes ${drop.lanes.join(',')} musters ${drop.musters.join(' → ')}` : 'NOT FOUND'}`);
    if (tapR) measure('re-follow 200 (0.25 a frame: 12 frames to 97 %)', 12, tapR.frames, 'frames', null, `${Math.round(tapR.there)} ms`);
  }

  // ---- 15. THE DESK'S KEYS
  if (GLASS === 'desk') {
    await setEnergy(20000); await sleep(600);
    const m0 = await musters();
    for (const k of '12345678') { await p.keyboard.press(k); await sleep(120); }
    await sleep(300);
    const m1 = await musters(), before = await grpMark();   // the watermark after the eight: a hive the digits sent to lane 0 bears motes under ITS grp, not the keyed order's
    await p.keyboard.down('w'); await p.keyboard.press('2'); await p.keyboard.up('w');
    await sleep(400);
    const born = await bornSince(before), m2 = await musters();
    await ev(() => window.VECTOR.follow(1));
    const c = await fieldCentre();
    await p.mouse.move(c.x, c.y);
    for (let k = 0; k < 12; k++) await p.mouse.wheel(0, -600);
    await sleep(100);
    const zIn = await ev(() => window.VECTOR.view.zoom);
    for (let k = 0; k < 24; k++) await p.mouse.wheel(0, 600);
    await sleep(100);
    const zOut = await ev(() => window.VECTOR.view.zoom);
    const card = await goCard();
    await arm('hover', '!!V.state.hold', 1500);
    await p.mouse.move(card.x, card.y);
    const hoverMs = await read('hover');
    await p.mouse.move(c.x, c.y); await sleep(300);
    const ok = m1 === m0 + 8 && m2 === m1 + 1 && born.length > 0 && born.every((q) => q.lane === 1) && within(zIn, 1.2, 0.001) && within(zOut, 0.3, 0.001) && hoverMs >= 0;
    check(15, 'THE DESK KEYS', ok, `digits 1-8: musters ${m0} → ${m1} · W+2: ${born.length} bodies lanes ${[...new Set(born.map((q) => q.lane))].join(',')} · wheel zoom ${zIn.toFixed(2)} / ${zOut.toFixed(2)} · hover armed the preview in ${hoverMs} ms`);
    measure('hover preview 200', 200, hoverMs);
  }

  // ---- 12. THE BUDGETS, every one printed; a rect must match, a timing within max(40 ms, 25 %)
  {
    let bad = 0;
    const rows = budget.map((q) => {
      let ok = true;
      const near = (spec) => within(q.got, spec, Math.max(40, spec * 0.25));
      if (q.kind === 'ms') ok = q.got < 0 ? null : near(q.spec) || (q.alt !== null && near(q.alt));
      else if (q.kind === 'rect') ok = String(q.got).replace(/\s/g, '') === String(q.spec).replace(/\s/g, '') || rectClose(q.spec, q.got);
      else if (q.kind === 'fps') ok = +q.got >= 55;
      else if (q.kind === 'css') ok = String(q.got) === String(q.spec);
      else if (q.kind === 'frames') ok = q.got < 0 ? null : Math.abs(q.got - q.spec) <= 3;
      if (ok === false) bad++;
      return `    ${q.name.padEnd(46)} spec ${String(q.spec).padEnd(22)} read ${String(q.got < 0 ? '—' : q.got).padEnd(22)} ${q.kind === 'info' ? 'info' : ok === null ? 'unread' : ok ? 'ok' : 'OFF'}${q.note ? ' · ' + q.note : ''}`;
    });
    check(12, 'THE BUDGETS', bad === 0, `${budget.length} read, ${bad} off`);
    for (const r of rows) { lines.push(r); console.log(r); }
  }

  await finish();

  // a rect string "x,y,w,h" or "w×h" read back within ±1 of the spec's
  function rectClose(spec, got) {
    const a = String(spec).split(/[,×x ]+/).map(Number), c = String(got).split(/[,×x ]+/).map(Number);
    return a.length === c.length && a.every((v, i) => Number.isFinite(v) && Number.isFinite(c[i]) && Math.abs(v - c[i]) <= 1);
  }
  async function finish() {
    console.log('page errors:', errs.length ? errs.join(' | ') : 'none', '· console:', logs.length ? logs.slice(0, 5).join(' | ') : 'clean');
    if (errs.length && !fails.some((f) => f.startsWith('1 '))) { fails.push('1 BOOT (page errors)'); }
    await b.close();
    if (house) house.kill();
    console.log(`${fails.length ? 'FAILS ' + JSON.stringify(fails) : 'OK - the vector road on ' + GLASS + ', every check green'} · ${((Date.now() - t00) / 1000).toFixed(0)} s`);
    process.exit(fails.length ? 1 : 0);
  }
})().catch((e) => { console.error(e); process.exit(1); });

// the house on :8897 when nothing answers there (killed at the end); null when a server already answers
async function serveHouse() {
  const up = () => new Promise((res) => http.get(URL0, (r) => { r.resume(); res(true); }).on('error', () => res(false)));
  if (await up()) return null;
  const child = spawn(process.execPath, [path.join(ROOT, 'tools', 'serve.js')], { stdio: 'ignore', env: { ...process.env, PORT: '8897' } });
  for (let i = 0; i < 40; i++) { if (await up()) return child; await sleep(250); }
  child.kill();
  throw new Error('no server at ' + URL0);
}
