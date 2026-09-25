// gl.js — THE LIGHT. WebGL2, no assets, everything batched: one draw for every run of bodies of a shape, one for
// all the lines, one for all the sparks. A body is a signed-distance shape on a quad: a flat fill, a 1.5 px outline in the
// side's edge colour, a dark seam outside it so touching bodies stay countable, and an inner mark that says its role
// at the floor size. No glow, no halo: the edge is the light.
//
// Conventions every caller shares:
//   · world units (wu) in, css px on the glass; the camera (§2.2) is the one formula, in affine() below.
//   · the SHAPE stream is 16 floats: aA (x, y, r, shape) · aFill (r, g, b, a) · aEdge (r, g, b, rot) · aX (band, mark, flash, state).
//   · rot is in radians; a triangle's apex and a diamond's long axis point along local -y, so a body heading h
//     (atan2(vy, vx)) is passed as rot = h + PI/2 - the convention main.js's paint always used.
//   · a ring's band is its stroke as a fraction of r (0.18 a body ring, ~0.05 a VFX ring); it is never drawn
//     under 1 css px, so a thin ring is a line, not a donut.
//   · a BODY (no NOFLOOR, no CAP2 in its state) is floored to its family's screen size, keeps its outline at
//     alpha 1.0 whatever its fill (a hurt body hollows, its edge never dims) and SEAMS: 1.5 px of the ground colour
//     outside its outline, so two touching bodies stay countable.
//   · a NOFLOOR or CAP2 shape (a VFX ring, a checkpoint disc, a spark, a shield ring) is light laid on the field:
//     ONE alpha, aFill.a, for its fill and its stroke; no floor, no seam. A ring passed with fill alpha 0 draws nothing.
//   · a mark belongs to a shape (§2.4, §4.2): PUPIL on a circle, PLATE and CRACKS on a box, SPINE on a triangle,
//     CORE and CRACKS on a hexagon, ORBIT on a ring, SLIT on a diamond, DASHED on any; a mark on another shape draws nothing.
//
// The cost rule. The glass he plays is a phone at dpr 3 and the probe's is SwiftShader, which shades on the CPU and
// runs every path a shader holds for every pixel (its branches are lane masks, not jumps): a fragment shader costs its
// whole text per pixel. So every program here holds one job and nothing else - a shape program per silhouette with that
// shape's distance and marks, a dot program for the minimap, a field program with and without the jolt - anything per
// frame (the pulse, the orbit's angle, the pixel sizes) is a uniform or a vertex-shader varying, every antialias is a
// linear ramp of a known width and never a screen derivative, and a frame is scissored to the clear field rect. And
// nothing is instanced: SwiftShader runs a pipeline pass per instance, and a shatter's thousand chords and fragments
// cost it six milliseconds as instances, so a stream is a float texture of 16-float records the vertex shader pulls
// from - six vertices a record, one plain draw a run - which any GPU takes as one batch of triangles.

// the field's fixed geometry (a shader cannot import lanes.js; these mirror §3.1)
const LANE_Y0 = 1000, LANE_STEP = 1500, HALF = 400, RUN0 = 1100, RUN1 = 7900, CENTRE_X = 4500;
// §2.3 by shape (orb, square, tri, hex, ring, diamond): the screen floor and the radius the slope starts from
export const FLOOR = [5, 8, 7, 10, 8, 6], RMIN = [6, 16, 9, 20, 15, 11];
// §2.4 state bits and mark ids, by name, for every painter
export const STATE = { SHIELD: 1, STUN: 2, SURGE: 4, BEATS: 8, LOSES: 16, DIM3: 32, DIM4: 64, CLOAK: 128, NOFLOOR: 256, CAP2: 512 };
export const MARK = { NONE: 0, PUPIL: 1, PLATE: 2, SPINE: 3, CORE: 4, ORBIT: 5, SLIT: 6, CRACKS: 7, DASHED: 8 };
export const ICON_MARK = [MARK.PUPIL, MARK.PLATE, MARK.SPINE, MARK.CORE, MARK.ORBIT, MARK.SLIT];   // each family's own mark
// §2.1 the palette, written once as hex and lowered into the shaders
export const PALETTE = {
  ground: '#0A0D18', outside: '#050610', void: '#04060C', band: '#0E1322', bandEdge: '#232C48', grid250: '#141A2C', grid1000: '#1C2440', centre: '#202848',
  westFill: '#12A7C8', westEdge: '#7FF3FF', eastFill: '#C8321E', eastEdge: '#FFB07A', gold: '#FFD76A', beats: '#5CFF7A', loses: '#FF4D4D', miniGround: '#0C1020',
};
export const rgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16) / 255);
// §2.3 in JS, the same rule the vertex shader runs: a body's radius on the glass in css px, so a painter can size a ring around a floored body
export function drawRadius(r, shape, zoom, state = 0) {
  const sz = r * zoom;
  if (state & STATE.NOFLOOR) return sz;
  if (state & STATE.CAP2) return Math.min(sz, 2);
  return Math.max(sz, FLOOR[shape] + 0.25 * (r - RMIN[shape]));
}
// the world radius of a NOFLOOR ring drawn `padPx` css px outside a floored body (the shield ring's r + 2 px)
export const ringR = (r, shape, zoom, padPx) => (drawRadius(r, shape, zoom) + padPx) / zoom;
const v3a = (c) => `vec3(${c.map((v) => v.toFixed(4)).join(', ')})`, v3 = (h) => v3a(rgb(h));
const mixRgb = (h1, h2, t) => rgb(h1).map((v, i) => v + (rgb(h2)[i] - v) * t);
const DPR_CAP = 3, MAX_SHAPES = 40000, MAX_SPARKS = 120000, MAX_LINES = 30000, ATLAS_W = 288, ATLAS_H = 96, SHAPES = 6;
// a stream's records live in an RGBA32F texture, four texels (16 floats) a record, TEX_W texels a row: a record never straddles rows
const TEX_W = 1024, RECORD = 16;
// the vertex shaders' way into a stream: record i's texel k, and the quad's corner of vertex c (two triangles, corners 0 1 2 and 2 1 3)
const PULL = `
uniform highp sampler2D uRec;
vec4 rec(int i, int k) { int t = i * 4 + k; return texelFetch(uRec, ivec2(t % ${TEX_W}, t / ${TEX_W}), 0); }
int cornerOf(int c) { return c < 3 ? c : c == 3 ? 2 : c == 4 ? 1 : 3; }`;

const SHAPE_VS = `#version 300 es
precision highp float;
${PULL}
uniform mat3 uCam; uniform float uZoom; uniform float uMini; uniform float uDpr; uniform float uTime; uniform float uFloor[6]; uniform float uRmin[6];
out vec2 vP; out vec4 vFill; flat out vec3 vEdge; flat out int vMark; flat out int vState; flat out float vFlash; flat out float vPx; flat out float vInvPx;
flat out float vOw; flat out float vHb; flat out float vAa; flat out float vInvAa; flat out vec2 vOrbit;
const int SURGE = 4, BEATS = 8, LOSES = 16, NOFLOOR = 256, CAP2 = 512;
// §2.3: the radius on the glass in css px - a per-family floor with a slope, so a bigger body of a family stays bigger
float drawRadius(float r, int shape, int state) {
  float sz = r * uZoom;
  if ((state & NOFLOOR) != 0) return sz;
  if ((state & CAP2) != 0) return min(sz, 2.0);
  return max(sz, uFloor[shape] + 0.25 * (r - uRmin[shape]));
}
// the quad's half-extent in SDF units: the shape's own reach, plus what is drawn outside it in pixels - the seam and the
// antialiasing on a body, the gold surge ring, the green or red answer ring - so no pixel is shaded for nothing
float extent(int shape, int state, float px) {
  float reach = shape == 1 ? 1.2021 : shape == 5 ? 1.6129 : 1.0;   // a box's corner (0.85·√2), a diamond's long apex, a unit circle
  float pad = ((state & (NOFLOOR | CAP2)) != 0) ? 0.75 : 2.25;         // the antialiasing alone, or the 1.5 px seam and the antialiasing
  if ((state & SURGE) != 0) pad = max(pad, 4.75);                     // the gold ring ends 4 px out
  float e = reach + pad / px;
  if ((state & (BEATS | LOSES)) != 0) e = max(e, max(1.8, 7.0 / px) + 1.75 / px);   // the answer ring: 2 px at 1.8 r, never under 7 px
  return e;
}
void main() {
  int i = gl_VertexID / 6, corner = cornerOf(gl_VertexID - i * 6);
  vec4 aA = rec(i, 0), aFill = rec(i, 1), aEdge = rec(i, 2), aX = rec(i, 3);   // x, y, r (wu), shape · fill rgb, alpha · edge rgb, rot · band, mark, flash, state
  vec2 q = vec2((corner & 1) == 1 ? 1.0 : -1.0, (corner & 2) == 2 ? 1.0 : -1.0);
  int shape = int(aA.w + 0.5), state = int(aX.w + 0.5);
  float px = drawRadius(aA.z, shape, state), ext = extent(shape, state, px);
  if (uMini > 0.5) { px = 0.75; ext = ((state & (NOFLOOR | CAP2)) != 0) ? 0.0 : 1.25; }   // the minimap: a 1.5 px dot; rings, discs and sparks stay off it
  vec2 local = q * ext;
  float c = cos(aEdge.w), s = sin(aEdge.w);
  vec2 off = vec2(local.x * c - local.y * s, local.x * s + local.y * c) * (px / uZoom);
  vec3 cp = uCam * vec3(aA.xy + off, 1.0);
  gl_Position = vec4(cp.xy, 0.0, 1.0);
  float invPx = 1.0 / px;
  vP = local; vFill = aFill; vEdge = aEdge.xyz; vMark = int(aX.y + 0.5); vState = state; vFlash = aX.z; vPx = px; vInvPx = invPx;
  vOw = (((state & (BEATS | LOSES)) != 0) ? 2.0 : 1.5) * invPx;                          // the outline, 1.5 css px (2 px under an answer)
  vHb = max(aX.x * 0.5, (((state & NOFLOOR) != 0) ? 0.5 : 1.5) * invPx);                // a ring's half stroke: a VFX ring never under 1 px, a body ring never under its two outlines
  vAa = 0.75 * invPx / uDpr; vInvAa = 0.5 / vAa;                                          // the antialias half-width, 0.75 physical px; every distance below has a unit gradient
  float a = uTime * 6.283; vOrbit = vec2(cos(a), sin(a)) * (1.0 - 2.0 * vHb - vOw);      // ORBIT: the dot's seat on the hollow, just inside the stroke, where it has contrast
}`;

// the shape fragment shader, one program per shape: the head every variant shares, the shape's own distance and marks, the body
const SHAPE_FS_HEAD = `#version 300 es
precision highp float;
in vec2 vP; in vec4 vFill; flat in vec3 vEdge; flat in int vMark; flat in int vState; flat in float vFlash; flat in float vPx; flat in float vInvPx;
flat in float vOw; flat in float vHb; flat in float vAa; flat in float vInvAa; flat in vec2 vOrbit;
uniform float uTime; uniform float uPulse;
out vec4 o;
const vec3 SEAM = ${v3(PALETTE.ground)}, WHITE = vec3(1.0), GOLD = ${v3(PALETTE.gold)}, GREEN = ${v3(PALETTE.beats)}, RED = ${v3(PALETTE.loses)};
const int STUN = 2, SURGE = 4, BEATS = 8, LOSES = 16, DIM3 = 32, DIM4 = 64, CLOAK = 128, NOFLOOR = 256, CAP2 = 512;
const float K = 1.6129, NONE = 1e3;   // the diamond's long axis, 1 : 1.6; a mark distance that draws nothing
float cov(float d) { return 1.0 - clamp((d + vAa) * vInvAa, 0.0, 1.0); }   // coverage of d < 0, a ramp over 1.5 physical px
float sdSeg(vec2 p, vec2 a, vec2 b) { vec2 pa = p - a, ba = b - a; return length(pa - ba * clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0)); }
// the way round the body in quarter turns, 0..4: the diamond angle, a monotone stand-in for atan2 within 4° at a tenth of its cost
float turn(vec2 p) { float a = p.y / (abs(p.x) + abs(p.y) + 1e-6); return p.x < 0.0 ? 2.0 - a : (a < 0.0 ? 4.0 + a : a); }
float dashes(vec2 p) { return step(0.5, fract(turn(p) * vPx * 0.0982 - uTime * 12.0)); }   // 8 px on, 8 px off (a quarter turn is 1.571·px), crawling at 12 Hz
`;
// every distance is exact (inigo quilez's), so the 1.5 px outline, seam and antialias are 1.5 px at a corner as on a side:
// a plane distance under-measures past an apex and stretched the seam 2 px beyond a triangle's tip into the next atlas cell
const SD_BOX = `float sdBox(vec2 p, float h) { vec2 d = abs(p) - vec2(h); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }`;
const SD_HEX = `float sdHex(vec2 p) {   // pointy-top, circumradius 1 (inradius 0.866)
  const vec3 k = vec3(-0.8660254, 0.5, 0.5773503); const float r = 0.8660254;
  p = abs(p.yx);
  p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy;
  p -= vec2(clamp(p.x, -k.z * r, k.z * r), r);
  return length(p) * sign(p.y);
}`;
const CRACKS = `float cracks(vec2 p) { return min(sdSeg(p, vec2(-0.6, -0.3), vec2(0.5, 0.4)), min(sdSeg(p, vec2(-0.1, -0.7), vec2(0.2, 0.6)), sdSeg(p, vec2(-0.7, 0.4), vec2(0.6, -0.1)))) - vOw * 0.67; }`;
// §2.4 per shape: sd(p), the silhouette, and mark(p, m), the inner mark's distance (1.5 px lines inset 1.5 px, alive at the floor size)
const SHAPE_SD = [
  `float sd(vec2 p) { return length(p) - 1.0; }
float mark(vec2 p, int m) { return m == 1 ? length(p) - 0.30 : NONE; }                                                      // PUPIL: a filled disc r 0.30`,
  `${SD_BOX}
${CRACKS}
float sd(vec2 p) { return sdBox(p, 0.85); }
float mark(vec2 p, int m) { return m == 2 ? abs(sdBox(p, 0.5)) - vOw * 0.5 : m == 7 ? cracks(p) : NONE; }                     // PLATE: a square outline at 0.5 r; CRACKS`,
  `float sd(vec2 p) {   // the equilateral triangle of circumradius 1, apex at (0, -1), base at y 0.5
  const float k = 1.7320508, r = 0.8660254;
  p = vec2(abs(p.x) - r, r / k - p.y);
  if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) * 0.5;
  p.x -= clamp(p.x, -2.0 * r, 0.0);
  return -length(p) * sign(p.y);
}
float mark(vec2 p, int m) { return m == 3 ? sdSeg(p, vec2(0.0, -1.0 + 2.0 * vOw), vec2(0.0, 0.5 - 2.0 * vOw)) - vOw * 0.5 : NONE; }   // SPINE: apex to base centre`,
  `${SD_HEX}
${CRACKS}
float sd(vec2 p) { return sdHex(p); }
float mark(vec2 p, int m) { return m == 4 ? sdHex(p / 0.35) * 0.35 : m == 7 ? cracks(p) : NONE; }                            // CORE: a filled hexagon r 0.35; CRACKS`,
  `float sd(vec2 p) { return abs(length(p) - (1.0 - vHb)) - vHb; }
float mark(vec2 p, int m) { return m == 5 ? length(p - vOrbit) - vOw * 0.67 : NONE; }                                          // ORBIT: a 2 px dot riding the hollow`,
  `float sd(vec2 p) {   // the rhombus with half-diagonals 1 across and K along the heading
  const vec2 b = vec2(1.0, K);
  p = abs(p);
  float h = clamp((b.x * (b.x - 2.0 * p.x) - b.y * (b.y - 2.0 * p.y)) / dot(b, b), -1.0, 1.0);
  return length(p - 0.5 * b * vec2(1.0 - h, 1.0 + h)) * sign(p.x * b.y + p.y * b.x - b.x * b.y);
}
float mark(vec2 p, int m) { return m == 6 ? sdSeg(p, vec2(0.0, -K + 3.0 * vOw), vec2(0.0, K - 3.0 * vOw)) - vOw * 0.5 : NONE; }   // SLIT: the centre line along the long axis`,
];
const SHAPE_FS_MAIN = `
void main() {
  vec2 p = vP; int st = vState;
  float d = sd(p), ow = vOw;
  vec3 fillC = vFill.rgb, edgeC = vEdge; float fillA = vFill.a;
  if ((st & DIM3) != 0) fillA *= 0.3;
  if ((st & DIM4) != 0) fillA *= 0.4;
  if ((st & CLOAK) != 0) fillA = 0.25;
  fillC = mix(fillC, WHITE, vFlash * 0.9); fillA = mix(fillA, 1.0, vFlash * 0.9);   // a hit blinks white; the fill comes up with it or a hollowed body would not show its blink
  bool light = (st & (NOFLOOR | CAP2)) != 0;
  float lineA = light ? fillA : 1.0;                                                  // a body's outline never dims; a ring, a disc or a spark is all one alpha
  if ((st & STUN) != 0 && fract(uTime * 12.0) < 0.5) edgeC = WHITE;
  if ((st & BEATS) != 0) edgeC = GREEN; else if ((st & LOSES) != 0) edgeC = RED;
  float inner = cov(d + ow), edge = cov(d);                                            // inside the outline; inside the silhouette
  float fill = inner * fillA;
  float line = (1.0 - inner) * edge;
  if ((st & CLOAK) != 0 || vMark == 8) line *= dashes(p);
  // the seam, on a body only: a ring, a disc or a spark is light on the field, and a dark border would outlive its fade.
  // 1.5 px at 0.9, not the spec's 1 px at 0.8: motes in a cloud overlap on the glass at the floor, the seam lands on the
  // neighbour's pupil, and the pupil's edge colour under 0.8 of ground reads 54 luminance where the probe wants under 40
  float seam = light ? 0.0 : (1.0 - edge) * cov(d - ow) * 0.9;
  vec3 col = fillC * fill + edgeC * line * lineA + SEAM * seam;   // premultiplied: the three bands never overlap
  float alpha = fill + line * lineA + seam;
  if (vMark > 0 && vMark < 8) {   // a mark in the edge colour inside the outline; CRACKS dark; ORBIT's dot rides the hollow, not the fill
    float m = cov(mark(p, vMark)) * (vMark == 5 ? 1.0 : inner);
    vec3 mc = vMark == 7 ? SEAM : edgeC; float ma = vMark == 7 ? 0.9 : lineA;
    col = mix(col, mc * ma, m); alpha = mix(alpha, ma, m);
  }
  if ((st & SURGE) != 0) {   // a 2 px gold ring 2 px outside the outline pulsing 1.0 -> 0.5 at 2 Hz (uPulse), and a 1 px white rim on the outline
    float g = cov(d - 4.0 * vInvPx) * (1.0 - cov(d - 2.0 * vInvPx)) * uPulse;
    float w = cov(d - vInvPx) * (1.0 - edge);
    col = mix(col, GOLD, g); alpha = mix(alpha, 1.0, g);
    col = mix(col, WHITE, w); alpha = mix(alpha, 1.0, w);
  }
  if ((st & (BEATS | LOSES)) != 0) {   // the answer ring: 2 px at 1.8 r, never under 7 px
    float ring = cov(abs(length(p) - max(1.8, 7.0 * vInvPx)) - vInvPx);
    col = mix(col, edgeC, ring); alpha = mix(alpha, 1.0, ring);
  }
  o = vec4(col, alpha);
}`;
const shapeFs = (shape) => SHAPE_FS_HEAD + SHAPE_SD[shape] + SHAPE_FS_MAIN;
// §2.10 the minimap's program: every shape a dot in the fill colour, green or red under a hold, dimmed with the hold's dims
const MINI_FS = `#version 300 es
precision highp float;
in vec2 vP; in vec4 vFill; flat in int vState; flat in float vAa; flat in float vInvAa;
out vec4 o;
const vec3 GREEN = ${v3(PALETTE.beats)}, RED = ${v3(PALETTE.loses)};
const int BEATS = 8, LOSES = 16, DIM3 = 32, DIM4 = 64;
void main() {
  int st = vState;
  float a = (1.0 - clamp((length(vP) - 1.0 + vAa) * vInvAa, 0.0, 1.0)) * step(0.001, vFill.a) * (((st & (DIM3 | DIM4)) != 0) ? 0.45 : 1.0);
  vec3 c = ((st & BEATS) != 0) ? GREEN : ((st & LOSES) != 0) ? RED : vFill.rgb;
  o = vec4(c * a, a);
}`;

const LINE_VS = `#version 300 es
precision highp float;
${PULL}
uniform mat3 uCam; uniform float uZoom;
out float vLat; out float vA; flat out vec3 vC;
void main() {
  int i = gl_VertexID / 6, corner = cornerOf(gl_VertexID - i * 6);
  vec4 aP = rec(i, 0), aC = rec(i, 1); vec2 aW = rec(i, 2).xy;   // x1 y1 x2 y2 · r g b a1 · half width (wu), a2
  float t = float(corner & 1), side = ((corner & 2) == 2) ? 1.0 : -1.0;
  vec2 a = aP.xy, b = aP.zw, d = b - a; float len = max(length(d), 0.0001); vec2 n = vec2(-d.y, d.x) / len;
  float hw = max(aW.x, 0.75 / uZoom);   // a line is never thinner than 1.5 css px
  vec3 cp = uCam * vec3(mix(a, b, t) + n * side * hw, 1.0);
  gl_Position = vec4(cp.xy, 0.0, 1.0);
  vLat = side; vA = mix(aC.a, aW.y, t); vC = aC.rgb;
}`;
const LINE_FS = `#version 300 es
precision highp float;
in float vLat; in float vA; flat in vec3 vC; out vec4 o;
void main() { float a = (1.0 - smoothstep(0.85, 1.0, abs(vLat))) * vA; o = vec4(vC * a, a); }`;

// THE FIELD is one full-screen triangle, scissored to the clear field rect (§2.2: the camera centres on it and the strip,
// the band and the hand cover the rest of the canvas). Two programs, with and without the jolt's sin and exp, since the
// jolt lives 0.4 s after a shatter and the frame pays for what the shader holds. The world point comes interpolated from
// the vertices (an affine camera makes that exact), the pixel sizes and the band's tints arrive as uniforms, and a line
// is a linear one-pixel ramp.
const FIELD_VS = `#version 300 es
precision highp float;
uniform mat3 uInv;
out vec2 vW;
void main() { int id = gl_VertexID; vec2 q = vec2(id == 1 ? 3.0 : -1.0, id == 2 ? 3.0 : -1.0); vW = (uInv * vec3(q, 1.0)).xy; gl_Position = vec4(q, 0.0, 1.0); }`;
const fieldFs = (jolt) => `#version 300 es
precision highp float;
in vec2 vW;                // the world point under the pixel
uniform vec2 uField; uniform float uTime;
uniform vec4 uPx;          // one css px in wu, one physical px in wu, its reciprocal, the 250 grid on (1) or off (0)
uniform vec4 uJolt;        // x, y, amp (css px), t seconds since the jolt (outside [0, 0.4) there is none)
uniform vec4 uLane[3];     // westTo, eastFrom, frontW, frontE
uniform vec4 uFx[3];       // chevW, chevE, fxTeam (-1 none · 0/1 a side's fill on the band · 2/3 gold on the west/east front bar), fxAmt
uniform vec4 uTint[3];     // the band's light: a side's fill and the amount (fxTeam 0/1 by fxAmt), else amount 0
uniform float uBroken[3];  // 1 hides the lane's front bars (paint draws the broken glyph)
out vec4 o;
const vec3 OUTSIDE = ${v3(PALETTE.outside)}, GROUND = ${v3(PALETTE.ground)}, VOID = ${v3(PALETTE.void)}, BAND = ${v3(PALETTE.band)}, EDGE = ${v3(PALETTE.bandEdge)};
const vec3 BAND_W = ${v3a(mixRgb(PALETTE.band, PALETTE.westFill, 0.12))}, BAND_E = ${v3a(mixRgb(PALETTE.band, PALETTE.eastFill, 0.12))};   // the held segments carry their side
const vec3 GRID1 = ${v3(PALETTE.grid250)}, GRID4 = ${v3(PALETTE.grid1000)}, MID = ${v3(PALETTE.centre)}, GOLD = ${v3(PALETTE.gold)};
const vec3 WEDGE = ${v3(PALETTE.westEdge)}, EEDGE = ${v3(PALETTE.eastEdge)};
const float LANE_Y0 = ${LANE_Y0.toFixed(1)}, LANE_STEP = ${LANE_STEP.toFixed(1)}, HALF = ${HALF.toFixed(1)}, RUN0 = ${RUN0.toFixed(1)}, RUN1 = ${RUN1.toFixed(1)}, CENTRE_X = ${CENTRE_X.toFixed(1)};
float cover(float g, float hw) { return clamp((hw + 0.5 * uPx.y - g) * uPx.z, 0.0, 1.0); }          // |g| < hw, one physical pixel soft
float gridAt(float v, float inv, float period) { return abs(fract(v * inv + 0.5) - 0.5) * period; }   // distance to the nearest multiple
// a front bar: a bar of half-width hw across the band at fx with a 40-wu chevron pointing dir, laid in col at 0.9. The chevron
// is one arm mirrored about the lane's centre line: a 45° line from the bar to the apex, cut at the bar and mitred at the tip
vec3 bar(vec3 c, vec2 w, float fx, float ly, float dir, float hw, vec3 col) {
  vec2 q = vec2((w.x - fx) * dir, abs(w.y - ly));
  float chev = cover(abs(q.x + q.y - 40.0) * 0.7071, hw) * step(q.y, 40.0) * step(q.x, 40.0 + 1.5 * hw);
  return mix(c, col, 0.9 * max(cover(abs(w.x - fx), hw), chev));
}
void main() {
  vec2 w = vW;
  float cssPx = uPx.x, phPx = uPx.y;
${jolt ? `  {   // §2.7: the ground displaced radially from the shatter, amp·sin(40t)·e^(-t/0.13) px
    vec2 dv = w - uJolt.xy;
    w += dv / max(length(dv), 1.0) * (uJolt.z * sin(40.0 * uJolt.w) * exp(-uJolt.w / 0.13) * cssPx);
  }` : ''}
  if (w.x < 0.0 || w.x > uField.x || w.y < 0.0 || w.y > uField.y) { o = vec4(OUTSIDE, 1.0); return; }
  float g4 = cover(min(gridAt(w.x, 0.001, 1000.0), gridAt(w.y, 0.001, 1000.0)), 0.5 * phPx);
  if (w.x < RUN0 || w.x > RUN1) { o = vec4(mix(GROUND, GRID4, g4), 1.0); return; }   // the yards: ground with the 1,000 grid only
  int lane = int(clamp(floor((w.y - (LANE_Y0 - LANE_STEP * 0.5)) / LANE_STEP), 0.0, 2.0));
  float ly = LANE_Y0 + LANE_STEP * float(lane), dy = abs(w.y - ly);
  if (dy > HALF) { o = vec4(VOID, 1.0); return; }
  vec4 L = uLane[lane], F = uFx[lane], T = uTint[lane];
  vec3 c = w.x <= L.x ? BAND_W : w.x >= L.y ? BAND_E : BAND;
  c = mix(c, T.rgb, T.a);   // a drag, an alarm, a surge lights the band
  // texture, not a net: the 250 grid is dropped below the battle zooms. §2.8 says under 0.35, but the landscape glass
  // fights at 0.30 (§1) and the critic's frame wants the grid 75 px apart there (§11.3), so the line is drawn at the clamp's floor
  if (uPx.w > 0.5) c = mix(c, GRID1, cover(min(gridAt(w.x, 0.004, 250.0), gridAt(w.y, 0.004, 250.0)), 0.5 * phPx));
  c = mix(c, GRID4, g4);
  c = mix(c, MID, cover(abs(w.x - CENTRE_X), 0.5 * phPx));
  float e = max(dy - (HALF - 2.0 * cssPx), max(RUN0 + 2.0 * cssPx - w.x, w.x - (RUN1 - 2.0 * cssPx)));   // the 2 px edge, inside the band
  c = mix(c, EDGE, clamp(e * uPx.z + 0.5, 0.0, 1.0));
  if (uBroken[lane] < 0.5) {
    float hw = max(3.0, 0.75 * cssPx);   // a 6-wu bar, never under 1.5 css px
    if (abs(L.z - L.w) < 20.0) {   // the fronts meet: one bar, striped, strobing at 4 Hz
      float s = step(0.5, fract(w.y / 160.0 + floor(uTime * 4.0) * 0.5));
      c = mix(c, mix(WEDGE, EEDGE, s), 0.9 * cover(abs(w.x - (L.z + L.w) * 0.5), hw));
    } else {   // the coach's bar pulses gold (fxTeam 2 the west bar, 3 the east)
      c = bar(c, w, L.z, ly, F.x, hw, F.z > 1.5 && F.z < 2.5 ? mix(WEDGE, GOLD, F.w) : WEDGE);
      c = bar(c, w, L.w, ly, F.y, hw, F.z > 2.5 ? mix(EEDGE, GOLD, F.w) : EEDGE);
    }
  }
  o = vec4(c, 1.0);
}`;

function compile(gl, vs, fs) {
  const p = gl.createProgram();
  for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error('shader: ' + gl.getShaderInfoLog(s));
    gl.attachShader(p, s);
  }
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('program: ' + gl.getProgramInfoLog(p));
  return p;
}
// a program with its uniform locations by name
function program(gl, vs, fs, names) { const prog = compile(gl, vs, fs); return { prog, u: Object.fromEntries(names.map((n) => [n, gl.getUniformLocation(prog, n)])) }; }

// a stream: a Float32Array of 16-float records the frame fills, uploaded once a pass into its float texture (the rows in use)
function stream(gl, cap) {
  const rows = Math.ceil(cap * 4 / TEX_W), data = new Float32Array(rows * TEX_W * 4);
  const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, TEX_W, rows, 0, gl.RGBA, gl.FLOAT, null);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  const st = {
    data, cap, n: 0,
    upload() {
      if (!st.n) return;
      const used = Math.ceil(st.n * 4 / TEX_W);
      gl.bindTexture(gl.TEXTURE_2D, tex); gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, TEX_W, used, gl.RGBA, gl.FLOAT, data.subarray(0, used * TEX_W * 4));
    },
    bind() { gl.bindTexture(gl.TEXTURE_2D, tex); },
  };
  return st;
}

const ZERO = { x: 0, y: 0 }, TMP = { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 };
// §2.2 THE CAMERA, css px: sx = a·wx + b·wy + e, sy = c·wx + d·wy + f, centred on the clear field rect, turned with the glass, shaken
function affine(view, cw, ch, t) {
  const rect = view.rect || { x: 0, y: 0, w: cw, h: ch }, sh = view.shake || ZERO, k = view.zoom, rot = view.rot | 0;
  const cx = rect.x + rect.w / 2, cy = rect.y + rect.h / 2;
  if (rot) { t.a = 0; t.b = -rot * k; t.c = rot * k; t.d = 0; t.e = cx + rot * view.y * k + sh.x; t.f = cy - rot * view.x * k + sh.y; }
  else { t.a = k; t.b = 0; t.c = 0; t.d = k; t.e = cx - view.x * k + sh.x; t.f = cy - view.y * k + sh.y; }
  return t;
}
const DEFAULT_LANE = { westTo: RUN0, eastFrom: RUN1, frontW: 1500, frontE: 7500, chevW: 1, chevE: -1, fxTeam: -1, fxAmt: 0, broken: 0 };
const SHAPE_UNIFORMS = ['uRec', 'uCam', 'uZoom', 'uMini', 'uDpr', 'uTime', 'uPulse', 'uFloor[0]', 'uRmin[0]'];
const FIELD_UNIFORMS = ['uInv', 'uField', 'uPx', 'uTime', 'uJolt', 'uLane[0]', 'uFx[0]', 'uTint[0]', 'uBroken[0]'];

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  const shapeP = Array.from({ length: SHAPES }, (_, shape) => program(gl, SHAPE_VS, shapeFs(shape), SHAPE_UNIFORMS));
  const miniP = program(gl, SHAPE_VS, MINI_FS, SHAPE_UNIFORMS);
  const lineP = program(gl, LINE_VS, LINE_FS, ['uRec', 'uCam', 'uZoom']);
  const fieldP = [program(gl, FIELD_VS, fieldFs(false), FIELD_UNIFORMS), program(gl, FIELD_VS, fieldFs(true), FIELD_UNIFORMS)];
  for (const P of [...shapeP, miniP]) { gl.useProgram(P.prog); gl.uniform1fv(P.u['uFloor[0]'], FLOOR); gl.uniform1fv(P.u['uRmin[0]'], RMIN); gl.uniform1f(P.u.uMini, P === miniP ? 1 : 0); gl.uniform1i(P.u.uRec, 0); }
  gl.useProgram(lineP.prog); gl.uniform1i(lineP.u.uRec, 0);
  const shapes = stream(gl, MAX_SHAPES), sparks = stream(gl, MAX_SPARKS), lines = stream(gl, MAX_LINES);
  gl.bindVertexArray(gl.createVertexArray());   // every draw is attribute-less: the vertex shaders pull their records from the streams' textures
  const cam = new Float32Array(9), inv = new Float32Array(9), laneBuf = new Float32Array(12), fxBuf = new Float32Array(12), tintBuf = new Float32Array(12), brokenBuf = new Float32Array(3);
  const miniGround = rgb(PALETTE.miniGround), fills = [rgb(PALETTE.westFill), rgb(PALETTE.eastFill)];
  let vw = 1, vh = 1, cw = 1, ch = 1, dpr = 1, counts = { shapes: 0, sparks: 0, lines: 0 };
  let pulse = 1, pass = 0;   // the surge ring's pulse this frame; a stamp for the camera a pass sets, so a program takes it once
  const readbacks = [];

  function push(st, x, y, r, shape, fr, fg, fb, fa, er, eg, eb, rot, band, mark, flash, state) {
    if (st.n >= st.cap) return;
    const d = st.data, o = st.n * RECORD;
    d[o] = x; d[o + 1] = y; d[o + 2] = r; d[o + 3] = shape; d[o + 4] = fr; d[o + 5] = fg; d[o + 6] = fb; d[o + 7] = fa;
    d[o + 8] = er; d[o + 9] = eg; d[o + 10] = eb; d[o + 11] = rot; d[o + 12] = band; d[o + 13] = mark; d[o + 14] = flash; d[o + 15] = state; st.n++;
  }
  // §9.3 what a painter gets: body (premultiplied pass), spark (additive, drawn last), line (additive, per-vertex alpha)
  const out = {
    body: (x, y, r, shape, fr, fg, fb, fa, er, eg, eb, rot, band, mark, flash, state) => push(shapes, x, y, r, shape, fr, fg, fb, fa, er, eg, eb, rot, band, mark, flash, state),
    spark: (x, y, r, shape, fr, fg, fb, fa, er, eg, eb, rot, band, mark, flash, state) => push(sparks, x, y, r, shape, fr, fg, fb, fa, er, eg, eb, rot, band, mark, flash, state),
    line: (x1, y1, x2, y2, halfW, r, g, b, a1, a2) => {   // ten floats of the record: x1 y1 x2 y2 · r g b a1 · halfW a2
      if (lines.n >= lines.cap) return;
      const d = lines.data, o = lines.n * RECORD;
      d[o] = x1; d[o + 1] = y1; d[o + 2] = x2; d[o + 3] = y2; d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a1; d[o + 8] = halfW; d[o + 9] = a2; lines.n++;
    },
  };

  // the canvas's css size and the glass's pixel ratio. The size is read when the glass changes - through a ResizeObserver
  // where the browser has one - never per frame or per conversion: a layout read on a dirty document forces a layout, and
  // the hand rewrites its text every half second. The ratio is read every frame; it costs nothing and changes on its own.
  const ratio = () => Math.min(DPR_CAP, window.devicePixelRatio || 1);
  function resize() {
    dpr = ratio();
    cw = canvas.clientWidth || 1; ch = canvas.clientHeight || 1;
    const w = Math.max(1, Math.round(cw * dpr)), h = Math.max(1, Math.round(ch * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    vw = w; vh = h;
  }
  const observed = typeof ResizeObserver === 'function';
  if (observed) new ResizeObserver(resize).observe(canvas);
  resize();
  // uCam (world -> clip) and uInv (clip -> world) from the css affine and the css size; GL clip y points up
  function setCamera(t, w, h) {
    const kx = 2 / w, ky = -2 / h;
    cam[0] = t.a * kx; cam[1] = t.c * ky; cam[2] = 0; cam[3] = t.b * kx; cam[4] = t.d * ky; cam[5] = 0; cam[6] = t.e * kx - 1; cam[7] = t.f * ky + 1; cam[8] = 1;
    const p = cam[0], q = cam[3], u = cam[6], r = cam[1], s = cam[4], v = cam[7], det = p * s - q * r;
    inv[0] = s / det; inv[1] = -r / det; inv[2] = 0; inv[3] = -q / det; inv[4] = p / det; inv[5] = 0; inv[6] = (q * v - s * u) / det; inv[7] = (r * u - p * v) / det; inv[8] = 1;
    pass++;
  }
  function toScreen(view, wx, wy) { const t = affine(view, cw, ch, TMP); return [t.a * wx + t.b * wy + t.e, t.c * wx + t.d * wy + t.f]; }
  function toWorld(view, px, py) {
    const t = affine(view, cw, ch, TMP), det = t.a * t.d - t.b * t.c, dx = px - t.e, dy = py - t.f;
    return [(t.d * dx - t.b * dy) / det, (t.a * dy - t.c * dx) / det];
  }

  // the scissor in physical px from a css rect (GL counts rows from the bottom)
  function scissor(r) { gl.scissor(Math.round(r.x * dpr), Math.round((ch - r.y - r.h) * dpr), Math.round(r.w * dpr), Math.round(r.h * dpr)); }
  function drawField(view, time) {
    const field = view.field || { W: 9000, H: 5000 }, j = view.jolt, cssPx = 1 / view.zoom, phPx = cssPx / dpr;
    for (let l = 0; l < 3; l++) {
      const ln = (view.lanes && view.lanes[l]) || DEFAULT_LANE, tint = fills[ln.fxTeam] || fills[0];
      laneBuf.set([ln.westTo, ln.eastFrom, ln.frontW, ln.frontE], l * 4); fxBuf.set([ln.chevW, ln.chevE, ln.fxTeam, ln.fxAmt], l * 4); brokenBuf[l] = ln.broken ? 1 : 0;
      tintBuf.set([tint[0], tint[1], tint[2], fills[ln.fxTeam] ? ln.fxAmt : 0], l * 4);
    }
    const jolting = j && j.t >= 0 && j.t < 0.4, P = fieldP[jolting ? 1 : 0];
    gl.useProgram(P.prog);
    gl.uniformMatrix3fv(P.u.uInv, false, inv); gl.uniform2f(P.u.uField, field.W, field.H); gl.uniform1f(P.u.uTime, time);
    gl.uniform4f(P.u.uPx, cssPx, phPx, 1 / phPx, view.zoom > 0.29 ? 1 : 0);
    if (jolting) gl.uniform4f(P.u.uJolt, j.x, j.y, j.amp, j.t);
    gl.uniform4fv(P.u['uLane[0]'], laneBuf); gl.uniform4fv(P.u['uFx[0]'], fxBuf); gl.uniform4fv(P.u['uTint[0]'], tintBuf); gl.uniform1fv(P.u['uBroken[0]'], brokenBuf);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }
  // a shape program takes the pass's camera and clock once, however many runs it draws
  function use(P, zoom, time, pixelRatio) {
    gl.useProgram(P.prog);
    if (P.pass === pass) return;
    P.pass = pass;
    gl.uniformMatrix3fv(P.u.uCam, false, cam); gl.uniform1f(P.u.uZoom, zoom); gl.uniform1f(P.u.uDpr, pixelRatio); gl.uniform1f(P.u.uTime, time); gl.uniform1f(P.u.uPulse, pulse);
  }
  // a shape stream is drawn in runs of one shape, each by that shape's own program, in the order the painter filled it
  function drawShapes(st, zoom, time, pixelRatio = dpr) {
    if (!st.n) return;
    const d = st.data;
    st.bind();
    for (let i = 0; i < st.n;) {
      const shape = d[i * RECORD + 3] | 0; let j = i + 1;
      while (j < st.n && (d[j * RECORD + 3] | 0) === shape) j++;
      use(shapeP[shape] || shapeP[0], zoom, time, pixelRatio);
      gl.drawArrays(gl.TRIANGLES, i * 6, (j - i) * 6);
      i = j;
    }
  }
  // §2.10 the same stream once more as 1.5 px dots on the minimap, in one draw
  function drawDots(st, zoom, time) {
    if (!st.n) return;
    use(miniP, zoom, time, dpr);
    st.bind(); gl.drawArrays(gl.TRIANGLES, 0, st.n * 6);
  }
  function drawLines(zoom) {
    if (!lines.n) return;
    gl.useProgram(lineP.prog); gl.uniformMatrix3fv(lineP.u.uCam, false, cam); gl.uniform1f(lineP.u.uZoom, zoom);
    lines.bind(); gl.drawArrays(gl.TRIANGLES, 0, lines.n * 6);
  }
  const premultiplied = () => gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA), additive = () => gl.blendFunc(gl.ONE, gl.ONE);
  // the three passes of a painted view: bodies over the ground, then the lines, then the sparks on top
  function drawPasses(zoom, time) {
    shapes.upload(); lines.upload(); sparks.upload();
    gl.enable(gl.BLEND);
    premultiplied(); drawShapes(shapes, zoom, time);
    additive(); drawLines(zoom); drawShapes(sparks, zoom, time);
  }
  // §2.10: the minimap is a second viewport: scissored, its own ground, the same body stream as dots, then its own marks
  function drawMini(mini, time) {
    const mv = mini.view;
    scissor(mv.rect);
    gl.clearColor(miniGround[0], miniGround[1], miniGround[2], 1); gl.clear(gl.COLOR_BUFFER_BIT);
    setCamera(affine(mv, cw, ch, TMP), cw, ch);
    gl.enable(gl.BLEND); premultiplied(); drawDots(shapes, mv.zoom, time);
    shapes.n = 0; sparks.n = 0; lines.n = 0;
    if (mini.fill) mini.fill(out);
    drawPasses(mv.zoom, time);
  }
  // css px in, top-down RGBA out, read at the end of the frame it was asked in
  function flushReadbacks() {
    while (readbacks.length) {
      const { x, y, w, h, resolve } = readbacks.shift();
      const px = Math.round(x * dpr), py = Math.round(y * dpr), pw = Math.max(1, Math.round(w * dpr)), ph = Math.max(1, Math.round(h * dpr));
      const raw = new Uint8Array(pw * ph * 4), img = new Uint8Array(pw * ph * 4);
      gl.readPixels(px, vh - py - ph, pw, ph, gl.RGBA, gl.UNSIGNED_BYTE, raw);
      for (let row = 0; row < ph; row++) img.set(raw.subarray((ph - 1 - row) * pw * 4, (ph - row) * pw * 4), row * pw * 4);
      img.width = pw; img.height = ph; img.dpr = dpr;
      resolve(img);
    }
  }
  function readback(x, y, w, h) { return new Promise((resolve) => readbacks.push({ x, y, w, h, resolve })); }

  // A frame is scissored to the clear field rect (§2.2): the strip, the surge band and the hand cover the rest of the canvas,
  // and a third of a phone's pixels shaded under them was the difference between 35 and 60 fps at dpr 3. The canvas
  // outside the rect is never drawn - the browser clears it after each composite - and the minimap sits inside the rect.
  function frame(view, fill, mini) {
    if (!observed || dpr !== ratio()) resize();
    const time = view.time === undefined ? performance.now() / 1000 : view.time;
    pulse = 0.75 + 0.25 * Math.cos(time * 12.566);   // the surge ring, 1.0 -> 0.5 at 2 Hz
    gl.viewport(0, 0, vw, vh); gl.disable(gl.DEPTH_TEST); gl.disable(gl.BLEND);
    gl.enable(gl.SCISSOR_TEST); scissor(view.rect || { x: 0, y: 0, w: cw, h: ch });
    setCamera(affine(view, cw, ch, TMP), cw, ch);
    drawField(view, time);
    shapes.n = 0; sparks.n = 0; lines.n = 0;
    fill(out);
    counts = { shapes: shapes.n, sparks: sparks.n, lines: lines.n };
    drawPasses(view.zoom, time);
    if (mini && mini.view) drawMini(mini, time);
    gl.disable(gl.SCISSOR_TEST);
    flushReadbacks();
  }

  // §4.2 THE ICON ATLAS: the six silhouettes with their marks in both team colours, r 20 px, 6 × 2 cells of 48 px,
  // drawn once into a texture by the same shader that draws the field and read back into a 2D canvas the hand copies from.
  // Drawn at r 10 css px under dpr 2 so the 1.5 px outline and the marks carry the field's weight at the card's scale.
  // The diamond is the one shape taller than its r (1 : 1.6 along the heading): at r 10 its apex would reach 32 physical
  // px in a cell of ±24 and land in the other side's cell, so it is drawn with its long apex at 10 css px - the seam and
  // its antialiasing end inside the cell - and the hand keeps its 48 × 48 cells.
  const ICON_R = 10, DIAMOND_K = 1.6129;
  function buildIconAtlas() {
    const tex = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ATLAS_W, ATLAS_H, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
    const fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    gl.viewport(0, 0, ATLAS_W, ATLAS_H); gl.disable(gl.SCISSOR_TEST); gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
    const cssW = ATLAS_W / 2, cssH = ATLAS_H / 2, cell = cssW / 6;   // 6 × 2 cells of 24 css px, 48 physical
    setCamera(affine({ x: cssW / 2, y: cssH / 2, zoom: 1, rot: 0, rect: { x: 0, y: 0, w: cssW, h: cssH }, shake: ZERO }, cssW, cssH, TMP), cssW, cssH);
    shapes.n = 0;
    const teams = [[rgb(PALETTE.westFill), rgb(PALETTE.westEdge)], [rgb(PALETTE.eastFill), rgb(PALETTE.eastEdge)]];
    for (let team = 0; team < 2; team++) for (let fam = 0; fam < 6; fam++) {
      const [f, e] = teams[team], r = fam === 5 ? ICON_R / DIAMOND_K : ICON_R;
      out.body(cell * (fam + 0.5), cell * (team + 0.5), r, fam, f[0], f[1], f[2], 0.55, e[0], e[1], e[2], 0, fam === 4 ? 0.18 : 0, ICON_MARK[fam], 0, 0);
    }
    shapes.upload(); gl.enable(gl.BLEND); premultiplied(); drawShapes(shapes, 1, 0, ATLAS_W / cssW);
    const raw = new Uint8Array(ATLAS_W * ATLAS_H * 4); gl.readPixels(0, 0, ATLAS_W, ATLAS_H, gl.RGBA, gl.UNSIGNED_BYTE, raw);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.deleteFramebuffer(fbo); gl.deleteTexture(tex);
    const atlas = document.createElement('canvas'); atlas.width = ATLAS_W; atlas.height = ATLAS_H;
    const img = atlas.getContext('2d').createImageData(ATLAS_W, ATLAS_H), px = img.data;
    for (let row = 0; row < ATLAS_H; row++) for (let i = 0; i < ATLAS_W * 4; i += 4) {   // GL rows come bottom-up and premultiplied; a canvas wants top-down straight alpha
      const s = (ATLAS_H - 1 - row) * ATLAS_W * 4 + i, d = row * ATLAS_W * 4 + i, a = raw[s + 3];
      px[d] = a ? Math.min(255, raw[s] * 255 / a) : 0; px[d + 1] = a ? Math.min(255, raw[s + 1] * 255 / a) : 0; px[d + 2] = a ? Math.min(255, raw[s + 2] * 255 / a) : 0; px[d + 3] = a;
    }
    atlas.getContext('2d').putImageData(img, 0, 0);
    return atlas;
  }
  const iconAtlas = buildIconAtlas();

  return { gl, resize, frame, toWorld, toScreen, iconAtlas, readback, get counts() { return counts; } };
}
