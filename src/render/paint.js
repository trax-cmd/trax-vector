// paint.js — THE PAINTER. Everything the frame draws from the sim's arrays and the player's hand: the
// checkpoints and strongholds, the bodies with their bits and marks, the shots and mines, the ghost of a
// battalion under a finger, the lines of energy and of orders; then the vfx's own light. Split out of
// main.js's paint() for v0.6 (SPEC-v0.6 §2.9, §9.5). It never converts a coordinate itself: world units
// go into the renderer's streams and gl.js projects them; the one screen point it needs (the finger under
// a drag) goes through R.toWorld. Nothing is stored across frames except what a picture needs (a
// triangle's last heading, a scratch order for the shape sort).
//
// TWO RULES OF THE STREAM this file leans on (§2.4): a floored body's outline is drawn at alpha 1.0 in
// its edge colour, so "an edge at 0.6" is the edge colour dimmed toward the ground; a NOFLOOR shape (a
// ring, a disc) is all one alpha - the ratio rides in fillA, as the SHIELD clause says - so every mark
// drawn here carries its colour in both fill and edge and its alpha in fa, and nothing goes invisible.
//
// CLOCKS: `now` is seconds on the performance clock (performance.now() / 1000); drag.js's and main.js's
// stamps (drag.at, slideFrom.at, orders[].at, follow.orderedAt, hold.since) are performance.now()
// milliseconds; the sim's own clock is sim.time; vfx.flashUntil[i] reads on the `now` clock.
import { LANE_Y, HALF, GATE_X, CP_R, CENTRE, gate, keep, cp, slotsToward } from '../sim/lanes.js';

// ---- THE PALETTE (§2.1, fixed). Side by hue, never role by hue. vfx.js carries the same numbers;
// they are repeated here so the painter and the minimap link against nothing half-built.
const hex = (h) => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
export const PALETTE = {
  FILL: [hex('#12A7C8'), hex('#C8321E')],          // west, east
  EDGE: [hex('#7FF3FF'), hex('#FFB07A')],
  NEUTRAL_FILL: hex('#3A4258'), NEUTRAL_EDGE: hex('#8A94AD'),
  GOLD: hex('#FFD76A'), BEATS_C: hex('#5CFF7A'), LOSES_C: hex('#FF4D4D'), WHITE: [1, 1, 1],
  SHIELD_C: hex('#BFE3FF'), SMOKE: hex('#8A94AD'),
  GROUND: hex('#0A0D18'), BAND: hex('#0E1322'), BAND_EDGE: hex('#232C48'), MINI_GROUND: hex('#0C1020'),
};
const { FILL, EDGE, NEUTRAL_FILL, NEUTRAL_EDGE, GOLD, LOSES_C, WHITE, SHIELD_C, GROUND } = PALETTE;

// ---- THE STREAM'S WORDS (§2.4): state bits and inner marks, by name
export const BIT = { SHIELD: 1, STUN: 2, SURGE: 4, BEATS: 8, LOSES: 16, DIM3: 32, DIM4: 64, CLOAK: 128, NOFLOOR: 256, CAP2: 512 };
export const MARK = { NONE: 0, PUPIL: 1, PLATE: 2, SPINE: 3, CORE: 4, ORBIT: 5, SLIT: 6, CRACKS: 7, DASHED: 8 };
const MARK_OF_SHAPE = [MARK.PUPIL, MARK.PLATE, MARK.SPINE, MARK.CORE, MARK.ORBIT, MARK.SLIT];   // orb, square, tri, hex, ring, diamond
const SHAPE_RANK = [5, 1, 3, 0, 2, 4];   // the body pass's order: hex, square, ring, then tri, diamond, orb - the swarm sits on the wall
// §2.3 by family: the floor on the glass and the radius the slope starts from. gl.js's vertex shader runs
// the same rule; the painter needs it to wrap a ring around a body the shader has floored (the shield).
const FLOOR = [5, 8, 7, 10, 8, 6], RMIN = [6, 16, 9, 20, 15, 11];
const BODY_BAND = 0.18;             // a ring body's stroke as a fraction of r
const TAU = Math.PI * 2, HALF_PI = Math.PI / 2;
const REVEAL_R = 120;               // the sim's cloak radius (retarget, §5.1): a cloaked body within it is seen
const REVEAL_FIRE_S = 0.3;          // a cloaked body shows for this long after it fires
const CONTEST_GRACE = 0.25;         // a contest is fresh for this long after WL.contestedAt (stepCheckpoints runs every 5th tick = 0.167 s); the snapshot carries it on
const SLIDE_MS = 120, FLIGHT_MS = 220, CANCEL_MS = 150, ORDER_MS = 4000, PULSE_S = 0.8, LIFT_PX = 48;   // §4.8
const CROSS_PX = 6, DASH_PX = 12, ENERGY_DASH_PX = 16, SURGE_R = 300;
const MINE_R = 7, MINE_MIN_PX = 3.5;   // §9.5 a mine is a 2 px ring r 7 (wu); under 7 px across a ring is a dot, so its radius never draws under 3.5 css px
// gl.js's outlines in the SDF's own unit (§2.4), so a stronghold core's 2 px outline can be laid as lines on the shape's own boundary:
// a pointy-top hexagon of circumradius 1 (a corner every 60° from 30°) and a box of half-extent 0.85
const HEX_CORNERS = [0, 1, 2, 3, 4, 5].map((k) => [Math.cos(Math.PI / 6 + k * Math.PI / 3), Math.sin(Math.PI / 6 + k * Math.PI / 3)]);
const BOX_CORNERS = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(([x, y]) => [x * 0.85, y * 0.85]);

const lerp = (a, b, k) => a + (b - a) * k;
const ease = (k) => { const t = Math.min(1, Math.max(0, k)); return 1 - (1 - t) * (1 - t); };   // ease-out, clamped: quick to leave, soft to land
// A floored body's outline is at alpha 1.0 in its edge colour (§2.4: aEdge carries no alpha), so an
// edge "at 0.6" is the colour 0.6 of the way from the ground to the edge colour.
export function dimmed(c, a) { return [GROUND[0] + (c[0] - GROUND[0]) * a, GROUND[1] + (c[1] - GROUND[1]) * a, GROUND[2] + (c[2] - GROUND[2]) * a]; }
// Twelve o'clock on the glass as a world angle, with the sweep clockwise on the glass as +angle:
// rot 0 → -π/2 (screen up is world -y); rot -1 (west portrait, +x is UP) → 0; rot +1 → π.
export function clockStart(rot) { return -HALF_PI * (1 + rot); }
// §2.3 in JS: a body's radius on the glass in css px - the family floor with its slope
export function drawRadius(r, shape, zoom) { return Math.max(r * zoom, FLOOR[shape] + 0.25 * (r - RMIN[shape])); }

// An arc of `sweep` radians from a0, as short chords (the renderer draws lines, not curves).
function arc(out, x, y, r, a0, sweep, segs, halfW, c, alpha) {
  if (sweep <= 0) return;
  const step = TAU / segs, n = Math.ceil(sweep / step - 1e-6);
  let px = x + Math.cos(a0) * r, py = y + Math.sin(a0) * r;
  for (let s = 1; s <= n; s++) {
    const a = a0 + Math.min(sweep, s * step), qx = x + Math.cos(a) * r, qy = y + Math.sin(a) * r;
    out.line(px, py, qx, qy, halfW, c[0], c[1], c[2], alpha, alpha);
    px = qx; py = qy;
  }
}
// A dotted line: dashes of `dash` world units with equal gaps.
function dotted(out, x1, y1, x2, y2, dash, halfW, c, alpha) {
  const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy);
  if (len < 1) return;
  const ux = dx / len, uy = dy / len;
  for (let a = 0; a < len; a += dash * 2) {
    const b = Math.min(len, a + dash);
    out.line(x1 + ux * a, y1 + uy * a, x1 + ux * b, y1 + uy * b, halfW, c[0], c[1], c[2], alpha, alpha);
  }
}
// A closed outline through unit corners scaled by r, as lines of halfW: the stroke a NOFLOOR shape cannot carry at its own alpha.
function polygon(out, x, y, corners, r, halfW, c, alpha) {
  for (let i = 0, n = corners.length; i < n; i++) {
    const a = corners[i], b = corners[(i + 1) % n];
    out.line(x + a[0] * r, y + a[1] * r, x + b[0] * r, y + b[1] * r, halfW, c[0], c[1], c[2], alpha, alpha);
  }
}

export function createPaint({ sim, vfx, state, R, hold = () => state.hold, drag = () => state.drag }) {
  const { S, U, P, MN, T, WL, kinds, grid } = sim;
  const N = U.x.length;

  // ---- the kinds, flattened: the loop over thirty thousand bodies reads typed arrays, not objects
  const K = kinds.length;
  const kShape = new Uint8Array(K), kR = new Float32Array(K), kHpInv = new Float32Array(K), kShInv = new Float32Array(K), kCloak = new Uint8Array(K), kFireWin = new Float32Array(K), kMissile = new Uint8Array(K);
  kinds.forEach((k, i) => {
    kShape[i] = k.shape; kR[i] = k.r; kHpInv[i] = 1 / k.hp;
    kShInv[i] = 1 / (k.shieldMax || 200);   // BULWARK hands a shieldless square a 200 pool (§5.1): that is its ratio's top
    kCloak[i] = k.traits.cloak ? 1 : 0; kFireWin[i] = 1 / k.w.rate - REVEAL_FIRE_S; kMissile[i] = k.w.type === 'missile' ? 1 : 0;
  });
  const face = new Float32Array(N);          // the last heading of every triangle and diamond: a body that stops keeps facing where it went
  const order = new Int32Array(N), rankStart = new Int32Array(7), cursor = new Int32Array(6);
  const holdBits = new Uint16Array(6), surgeLane = [-1, -1];
  const surging = (i) => U.lane[i] === surgeLane[U.team[i]];

  // per-frame scratch, set once at the top of fill()
  let zoom = 1, rot = 0, me = 0, ms = 0, holdOn = false;
  const wu = (px) => px / zoom;   // css px → world units at this frame's zoom (line half-widths and pixel-sized gaps)
  // A ring with a stroke of `pxW` css px and a disc, at the frame's zoom (or the minimap's): colour in both
  // fill and edge, alpha in fa - the one alpha of a NOFLOOR shape. The shader never draws a stroke under 1 px.
  function ring(out, x, y, r, pxW, c, alpha, k = zoom) { out.body(x, y, r, 4, c[0], c[1], c[2], alpha, c[0], c[1], c[2], 0, pxW / (r * k), 0, 0, BIT.NOFLOOR); }
  function disc(out, x, y, r, c, alpha) { out.body(x, y, r, 0, c[0], c[1], c[2], alpha, c[0], c[1], c[2], 0, 0, 0, 0, BIT.NOFLOOR); }

  // ---- the muster stronghold of a lane for a side (§3.6): its gate, else the side's living keep nearest the lane head
  function musterOf(team, lane) {
    const g = gate(team, lane);
    if (T.alive[g]) return g;
    let best = -1, bd = Infinity;
    for (let k = 0; k < 2; k++) {
      const t = keep(team, k); if (!T.alive[t]) continue;
      const d = Math.abs(T.y[t] - LANE_Y[lane]);
      if (d < bd) { bd = d; best = t; }
    }
    return best;
  }
  // The march from a stronghold to a point: a keep's battalion walks the yard to the lane head first (§3.6).
  function marchLine(out, from, lane, tx, ty, halfW, c, alpha, dash) {
    let x1 = T.x[from], y1 = T.y[from];
    const seg = (x2, y2) => { if (dash) dotted(out, x1, y1, x2, y2, dash, halfW, c, alpha); else out.line(x1, y1, x2, y2, halfW, c[0], c[1], c[2], alpha, alpha); x1 = x2; y1 = y2; };
    if (T.kind[from] === 1) seg(GATE_X[T.team[from]], LANE_Y[lane]);
    seg(tx, ty);
  }

  // ---- checkpoints (§2.9): the 2 px ring, the 1 px inner ring, the RALLY disc, the capture arc, the contested strobe, THE CENTRE
  function checkpoints(out, now) {
    const strobe = ((now * 8) | 0) & 1, a0 = clockStart(rot), points = state.snap && state.snap.points;
    for (let w = 0; w < WL.n; w++) {
      const x = WL.x[w], y = WL.y[w], o = WL.owner[w], p = WL.prog[w], centre = WL.slot[w] === CENTRE, r = centre ? CP_R * 1.3 : CP_R;
      // a contest starts on the sim's stamp and lasts as long as the snapshot (once a second) says both sides stand there
      const contested = sim.time - WL.contestedAt[w] < CONTEST_GRACE || !!(points && points[w] && points[w].contested);
      const e = contested ? EDGE[strobe] : o < 0 ? NEUTRAL_EDGE : EDGE[o], ea = o < 0 && !contested ? 0.6 : 1;
      if (o >= 0) disc(out, x, y, r, FILL[o], 0.25);   // held: the RALLY
      ring(out, x, y, r, 2, e, ea);
      ring(out, x, y, r * 0.7, 1, e, ea);
      if (centre) ring(out, x, y, r + wu(3), 1, GOLD, 1);
      // the side whose sign prog carries is taking the point (or losing its hold on it): the arc drains in the holder's edge, then fills in the taker's
      if (p !== 0 && Math.abs(p) < 1) arc(out, x, y, r + wu(7), a0, Math.abs(p) * TAU, 24, wu(1.5), EDGE[p > 0 ? 0 : 1], 1);
    }
  }

  // ---- strongholds (§2.9): the 3 px ring, the core (a hex for a gate, a square for a keep), the hp arc, cracks under half, the dead ring, the muster pulse
  function strongholds(out, now) {
    const d = drag(), pulsing = d && d.phase === 'drag' && !d.cancelZone && d.from >= 0 ? d.from : -1, a0 = clockStart(rot);
    for (let t = 0; t < T.n; t++) {
      const x = T.x[t], y = T.y[t], r = T.r[t];
      if (!T.alive[t]) { ring(out, x, y, r, 3, NEUTRAL_FILL, 0.25); continue; }   // dead: the ring alone; vfx lays the debris around it
      const team = T.team[t], e = EDGE[team], f = FILL[team], frac = T.hp[t] / T.hpMax[t];
      ring(out, x, y, r, 3, e, 1);
      core(out, x, y, r * 0.45, T.kind[t], f, e, frac < 0.5);
      arc(out, x, y, r + wu(6), a0, frac * TAU, 36, wu(2), e, 0.9);
      if (t === pulsing) { const ph = (now % PULSE_S) / PULSE_S; ring(out, x, y, r * (1 + 0.4 * ph), 2, e, 1 - ph); }   // grows to 1.4× and fades, every 800 ms
    }
  }
  // The core (§2.9): a hexagon for a gate, a square for a keep, at 0.45 r, fill 0.35, outlined 2 px in the edge colour at 1.0, CRACKS
  // under half. It is a landmark, not a body, so it goes NOFLOOR and is r·zoom on the glass at every zoom: floored, the hex family's
  // slope would lift a gate's 49.5-wu core from 14.9 to 17.4 px at 0.30 and only let go past 0.35. A NOFLOOR shape is all one alpha
  // with the shader's 1.5 px stroke (§2.4), so the fill is one flat shape (its colour in fill and edge alike, the cracks dark on it)
  // and the outline is its own lines on the shape's boundary.
  function core(out, x, y, r, kind, f, e, cracked) {
    const hexagon = kind === 0;
    out.body(x, y, r, hexagon ? 3 : 1, f[0], f[1], f[2], 0.35, f[0], f[1], f[2], 0, 0, cracked ? MARK.CRACKS : 0, 0, BIT.NOFLOOR);
    polygon(out, x, y, hexagon ? HEX_CORNERS : BOX_CORNERS, r, wu(1), e, 1);
  }

  // ---- a dead gate's front bar (§2.7): two 6-wu halves offset 30 wu with a 40-wu gap, in the side that lost it, for the match
  function brokenBars(out) {
    for (let lane = 0; lane < 3; lane++) for (let side = 0; side < 2; side++) {
      const g = gate(side, lane); if (T.alive[g]) continue;
      const x = T.x[g], y = LANE_Y[lane], e = EDGE[side];
      out.line(x - 15, y - HALF, x - 15, y - 20, 3, e[0], e[1], e[2], 0.9, 0.9);
      out.line(x + 15, y + 20, x + 15, y + HALF, 3, e[0], e[1], e[2], 0.9, 0.9);
    }
  }

  // ---- bodies (§2.3-2.4): sorted by shape into the body pass's order, every bit and mark set here
  let rvx = 0, rvy = 0, rvHit = false;
  const seen = (j) => { if (U.team[j] !== me || !U.alive[j]) return false; const dx = U.x[j] - rvx, dy = U.y[j] - rvy; if (dx * dx + dy * dy < REVEAL_R * REVEAL_R) { rvHit = true; return true; } return false; };
  // A cloaked enemy is drawn exactly when his bodies could target it (the sim's retarget rule, §5.1): when it
  // has just fired, or when one of his bodies stands inside the cloak radius.
  function revealed(i, k) {
    if (U.cd[i] > kFireWin[k]) return true;
    rvx = U.x[i]; rvy = U.y[i]; rvHit = false; grid.near(rvx, rvy, REVEAL_R, seen);
    return rvHit;
  }
  function body(out, i, now) {
    const k = U.kind[i], team = U.team[i], shape = kShape[k], x = U.x[i], y = U.y[i];
    const surge = U.lane[i] === surgeLane[team];
    const cloaked = kCloak[k] === 1 || (shape === 5 && surge);   // EXECUTE: a surging diamond counts as cloaked (§5.1)
    if (cloaked && team !== me && !revealed(i, k)) return;
    let rotation = 0;
    if (shape === 2 || shape === 5) {   // squares and hexes never turn; a triangle and a diamond point where they go
      const vx = U.vx[i], vy = U.vy[i];
      if (U.age[i] < 0.04) face[i] = team ? Math.PI : 0;   // born facing the enemy
      if (vx * vx + vy * vy > 400) face[i] = Math.atan2(vy, vx);
      rotation = face[i] + HALF_PI;   // the SDF's apex sits at local -y: +π/2 turns it onto the heading
    }
    let st = 0, mark = MARK_OF_SHAPE[shape];
    if (U.sh[i] > 0) st |= BIT.SHIELD;
    if (U.stun[i] > 0) st |= BIT.STUN;
    if (surge) st |= BIT.SURGE;
    if (holdOn) st |= team === me ? BIT.DIM4 : holdBits[shape];
    if (cloaked) { st |= BIT.CLOAK; mark = MARK.DASHED; }   // only the viewer's own cloaked bodies reach here: dashed, to their own side
    const f = FILL[team], e = EDGE[team], fa = 0.20 + 0.35 * U.hp[i] * kHpInv[k], flash = vfx.flashUntil[i] > now ? 1 : 0;
    out.body(x, y, kR[k], shape, f[0], f[1], f[2], fa, e[0], e[1], e[2], rotation, shape === 4 ? BODY_BAND : 0, mark, flash, st);
    // the shield: a 1 px ring 2 px outside the outline the shader actually drew (floored), its alpha the shield's ratio
    if (U.sh[i] > 0) ring(out, x, y, (drawRadius(kR[k], shape, zoom) + 2) / zoom, 1, SHIELD_C, Math.min(1, 0.35 + 0.5 * U.sh[i] * kShInv[k]));
  }
  function bodies(out, now) {
    const hi = U.hi;
    rankStart.fill(0);
    for (let i = 0; i < hi; i++) if (U.alive[i]) rankStart[SHAPE_RANK[kShape[U.kind[i]]] + 1]++;
    for (let s = 0; s < 6; s++) rankStart[s + 1] += rankStart[s];
    cursor.set(rankStart.subarray(0, 6));
    for (let i = 0; i < hi; i++) if (U.alive[i]) order[cursor[SHAPE_RANK[kShape[U.kind[i]]]]++] = i;
    for (let q = 0, n = rankStart[6]; q < n; q++) body(out, order[q], now);
  }

  // ---- shots (§2.5): a bolt is a white streak with a coloured head, never a lone dot; a missile a 4 px diamond with a 30 px streak
  function shots(out) {
    for (let s = 0; s < P.hi; s++) {
      if (!P.alive[s]) continue;
      const e = EDGE[P.team[s]], x = P.x[s], y = P.y[s], vx = P.vx[s], vy = P.vy[s];
      if (kMissile[P.kind[s]]) {
        const sp = Math.hypot(vx, vy) || 1, tail = wu(30) / sp;
        out.body(x, y, wu(4), 5, e[0], e[1], e[2], 1, e[0], e[1], e[2], Math.atan2(vy, vx) + HALF_PI, 0, 0, 0, BIT.NOFLOOR);
        out.line(x, y, x - vx * tail, y - vy * tail, wu(1), e[0], e[1], e[2], 0.6, 0);
      } else {
        out.line(x, y, x - vx * 0.05, y - vy * 0.05, wu(0.75), WHITE[0], WHITE[1], WHITE[2], 0.9, 0.9);   // 50 ms of flight, white the whole way: the head says which end is which
        disc(out, x, y, wu(1.5), e, 1);
      }
    }
  }
  function mines(out) {
    for (let m = 0; m < MN.hi; m++) { if (!MN.alive[m]) continue; ring(out, MN.x[m], MN.y[m], Math.max(MINE_R, wu(MINE_MIN_PX)), 2, EDGE[MN.team[m]], 1); }
  }

  // ---- the energy lines (§2.6): each held checkpoint draws one 1 px line to its lane's own gate in the owner fill at 0.25, with a
  // 3 px dash in the edge colour sliding gate-ward once a second. Lines blend additively and every point of a lane lies on its centre
  // line, so a point's line runs only to the next held point on the way to the gate: a lane held whole shows the five lines' union,
  // one 0.25 thread from the gate to the far point, never five stacked to 1.25 - and each point's dash rides its own stretch.
  function energyLines(out, now) {
    const ph = now % 1;
    for (let lane = 0; lane < 3; lane++) for (let side = 0; side < 2; side++) {
      const f = FILL[side], e = EDGE[side], slots = slotsToward(side);
      let x2 = GATE_X[side], y2 = LANE_Y[lane];   // where the next held point's line ends: the gate, then each held point for the one beyond it
      for (let s = 0; s < 5; s++) {
        const w = cp(lane, slots[s]); if (WL.owner[w] !== side) continue;
        const x1 = WL.x[w], y1 = WL.y[w];
        out.line(x1, y1, x2, y2, wu(0.5), f[0], f[1], f[2], 0.25, 0.25);
        const dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, ux = dx / len, uy = dy / len, half = wu(ENERGY_DASH_PX / 2);
        const a = Math.max(0, ph * len - half), b = Math.min(len, ph * len + half);
        out.line(x1 + ux * a, y1 + uy * a, x1 + ux * b, y1 + uy * b, wu(1.5), e[0], e[1], e[2], 0.9, 0.9);   // the dash: 3 px wide, 16 px long, the point to the stretch's end in one second
        x2 = x1; y2 = y1;
      }
    }
  }

  // ---- the ghost (§4.3): the battalion's real slots as outlines, the finger's crosshair, the snapped point's gold ring, the dotted march line
  // A touch pointer lifts the ghost 48 px above the finger, a mouse none; drag.js says which (`touch`), else the glass does.
  const lift = (d) => ((d.touch === undefined ? state.glass !== 'desk' : d.touch) ? LIFT_PX : 0);
  // where the ghost stands and how far it has faded: sliding onto the snapped point, flying home after an order, or riding the aim
  function ghostAt(d, view) {
    if (d.phase === 'flight' && d.from >= 0 && d.slideFrom) {   // the 220 ms return along the march line, dissolving into the real bodies
      const k = ease((ms - d.at) / FLIGHT_MS);
      return [lerp(d.slideFrom.x, T.x[d.from], k), lerp(d.slideFrom.y, T.y[d.from], k), 1 - k];
    }
    if (d.snap && d.phase === 'drag' && !d.cancelZone) {
      let gx = d.snap.x, gy = d.snap.y;
      const sf = d.slideFrom;   // the 120 ms slide from where the ghost last stood, eased out
      if (sf && ms - sf.at < SLIDE_MS) { const k = ease((ms - sf.at) / SLIDE_MS); gx = lerp(sf.x, gx, k); gy = lerp(sf.y, gy, k); }
      return [gx, gy, 1];
    }
    const p = R.toWorld(view, d.x, d.y - lift(d));
    return [p[0], p[1], d.phase === 'cancel' ? 1 - ease((ms - d.at) / CANCEL_MS) : 1];
  }
  function ghost(out, view) {
    const d = drag(); if (!d || (d.phase !== 'drag' && d.phase !== 'cancel' && d.phase !== 'flight')) return;
    const cancel = d.phase === 'cancel' || !!d.cancelZone, [gx, gy, fade] = ghostAt(d, view);
    if (d.batt === 'surge') ring(out, gx, gy, SURGE_R, 2, cancel ? LOSES_C : GOLD, (cancel ? 0.5 : 1) * fade);   // the surge's ghost is a gold ring r 300
    else if (d.ghost) {
      const e = cancel ? dimmed(LOSES_C, 0.5 * fade) : dimmed(EDGE[me], 0.6 * fade);
      const fx = me ? -1 : 1, heading = (me ? Math.PI : 0) + HALF_PI;   // facing the enemy; slots are [forward, side, kind] as the sim musters them (east flips both)
      for (const [f, s, kind] of d.ghost.slots) {
        const shape = kShape[kind];
        out.body(gx + fx * f, gy + fx * s, kR[kind], shape, 0, 0, 0, 0, e[0], e[1], e[2], shape === 2 || shape === 5 ? heading : 0, shape === 4 ? BODY_BAND : 0, 0, 0, BIT.DIM3);
      }
    }
    if (d.phase === 'flight') return;   // the finger has let go: no crosshair, no mark, no march
    const c = R.toWorld(view, d.x, d.y), arm = wu(CROSS_PX);   // the finger's own point wears a 12 px crosshair
    out.line(c[0] - arm, c[1], c[0] + arm, c[1], wu(0.75), WHITE[0], WHITE[1], WHITE[2], 0.8, 0.8);
    out.line(c[0], c[1] - arm, c[0], c[1] + arm, wu(0.75), WHITE[0], WHITE[1], WHITE[2], 0.8, 0.8);
    if (!d.snap || cancel) return;
    if (d.batt !== 'surge') ring(out, d.snap.x, d.snap.y, snapR(d.snap) * 1.6, 3, GOLD, 1);   // the snapped point wears a 3 px gold ring at 1.6× (the surge's own ring is the mark)
    if (d.from >= 0) marchLine(out, d.from, d.lane, d.snap.x, d.snap.y, wu(1), EDGE[me], 0.45, wu(DASH_PX));
  }
  // the radius of what a drag snapped to: a checkpoint (THE CENTRE 1.3×), a stronghold, or a lane's front point (a checkpoint's size)
  function snapR(snap) {
    if (snap.kind === 'gate' || snap.kind === 'keep') return T.r[snap.index];
    return snap.kind === 'point' && WL.slot[snap.index] === CENTRE ? CP_R * 1.3 : CP_R;
  }
  // ---- the order lines (§4.3): 4 s at 2 px, fading, from the muster stronghold to the drop x. §9.7's orders carry only
  // { lane, at } and the follow keeps the last order's x; drag.js's carry x and from as well, so every order in the window draws.
  function orderLines(out) {
    const orders = state.orders, f = state.follow;
    if (!orders) return;
    for (const o of orders) {
      const age = ms - o.at; if (age < 0 || age >= ORDER_MS) continue;
      const x = o.x !== undefined ? o.x : f && f.orderedAt === o.at ? f.x : undefined;
      if (x === undefined) continue;
      const from = o.from >= 0 ? o.from : musterOf(me, o.lane); if (from < 0) continue;
      marchLine(out, from, o.lane, x, LANE_Y[o.lane], wu(1), EDGE[me], 0.7 * (1 - age / ORDER_MS), 0);
    }
  }

  function fill(out, view, now) {
    zoom = view.zoom; rot = view.rot || 0; me = state.team; ms = now * 1000;
    for (let t = 0; t < 2; t++) surgeLane[t] = S.surgeUntil[t] > sim.time ? S.surgeLane[t] : -1;
    const h = hold(); holdOn = !!h;
    if (h) { const beats = h.beats || [], loses = h.loses || []; for (let r = 0; r < 6; r++) holdBits[r] = beats.includes(r) ? BIT.BEATS : loses.includes(r) ? BIT.LOSES : BIT.DIM3; }   // a BLADE card loses to nothing: an empty list, never a hole
    checkpoints(out, now);
    strongholds(out, now);
    brokenBars(out);
    bodies(out, now);
    shots(out);
    mines(out);
    vfx.trail.fill(out, U, zoom, surging);
    energyLines(out, now);
    ghost(out, view);
    orderLines(out);
    vfx.fill(out);
    vfx.fillTop(out);
  }
  // The minimap's own marks from the painter: where a live drag will land (a 3 px gold ring), and its march.
  function miniFill(out, miniView) {
    const d = drag(); if (!d || d.phase !== 'drag' || !d.snap || d.cancelZone) return;
    const k = miniView.zoom;
    ring(out, d.snap.x, d.snap.y, 3 / k, 1, GOLD, 1, k);
    if (d.from >= 0) marchLine(out, d.from, d.lane, d.snap.x, d.snap.y, 0.5 / k, GOLD, 0.6, 0);
  }
  return { fill, miniFill };
}
