// gl.js — THE LIGHT. WebGL2, three programs, everything instanced: one draw for every body on the
// field, one for every line of fire, one for every spark. Shapes are signed-distance fields, so an orb,
// a cube, a triangle, a hexagon, a ring and a diamond are the same quad with a different formula, and
// the glow is the field's falloff. Additive blending on a dark ground is the whole look.

const SHAPE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aA;   // x, y, size, shape
layout(location=1) in vec4 aC;   // r, g, b, a
layout(location=2) in vec2 aR;   // rotation, glow
uniform mat3 uCam; uniform float uMin;   // uMin: the smallest a body may draw, in world units (a few screen pixels), so the far view is a field of lights and not of nothing
out vec2 vP; flat out int vShape; out vec4 vCol; flat out float vGlow;
void main() {
  int id = gl_VertexID;
  vec2 q = vec2((id & 1) == 1 ? 1.0 : -1.0, (id & 2) == 2 ? 1.0 : -1.0);
  float c = cos(aR.x), s = sin(aR.x);
  vec2 local = q * 2.4;
  vec2 rp = vec2(local.x * c - local.y * s, local.x * s + local.y * c);
  vec3 cp = uCam * vec3(aA.xy + rp * max(aA.z, uMin), 1.0);
  gl_Position = vec4(cp.xy, 0.0, 1.0);
  vP = local; vShape = int(aA.w + 0.5); vCol = aC; vGlow = aR.y;
}`;
const SHAPE_FS = `#version 300 es
precision highp float;
in vec2 vP; flat in int vShape; in vec4 vCol; flat in float vGlow;
out vec4 o;
float sdCircle(vec2 p) { return length(p) - 1.0; }
float sdBox(vec2 p) { vec2 d = abs(p) - vec2(0.85); return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0); }
float sdTri(vec2 p) { const float k = 1.7320508; p.x = abs(p.x) - 1.0; p.y = p.y + 1.0 / k; if (p.x + k * p.y > 0.0) p = vec2(p.x - k * p.y, -k * p.x - p.y) / 2.0; p.x -= clamp(p.x, -2.0, 0.0); return -length(p) * sign(p.y); }
float sdHex(vec2 p) { const vec3 k = vec3(-0.866025404, 0.5, 0.577350269); p = abs(p); p -= 2.0 * min(dot(k.xy, p), 0.0) * k.xy; p -= vec2(clamp(p.x, -k.z * 0.95, k.z * 0.95), 0.95); return length(p) * sign(p.y); }
float sdRing(vec2 p) { return abs(length(p) - 0.78) - 0.22; }
float sdDiamond(vec2 p) { p = abs(p); return (p.x + p.y - 1.0) * 0.7071; }
void main() {
  vec2 p = vP; float d;
  if (vShape == 0) d = sdCircle(p); else if (vShape == 1) d = sdBox(p); else if (vShape == 2) d = sdTri(p * 1.05); else if (vShape == 3) d = sdHex(p); else if (vShape == 4) d = sdRing(p); else d = sdDiamond(p);
  float aa = fwidth(d) * 1.2;
  float core = 1.0 - smoothstep(-aa, aa, d);
  float rim = 1.0 - smoothstep(0.0, 0.16 + aa, abs(d));
  float glow = exp(-max(d, 0.0) * (3.6 - 2.2 * vGlow)) * vGlow;
  float a = (core * 0.5 + rim * 0.95 + glow * 0.85) * vCol.a;
  o = vec4(vCol.rgb * a, a);
}`;
const LINE_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aP;   // x1 y1 x2 y2
layout(location=1) in vec4 aC;   // r g b a
layout(location=2) in float aW;  // half width, world units
uniform mat3 uCam;
out float vLat; out vec4 vCol;
void main() {
  int id = gl_VertexID;
  float t = float(id & 1); float side = ((id & 2) == 2) ? 1.0 : -1.0;
  vec2 a = aP.xy, b = aP.zw, d = b - a; float len = max(length(d), 0.0001); vec2 n = vec2(-d.y, d.x) / len;
  vec3 cp = uCam * vec3(mix(a, b, t) + n * side * aW, 1.0);
  gl_Position = vec4(cp.xy, 0.0, 1.0);
  vLat = side; vCol = aC;
}`;
const LINE_FS = `#version 300 es
precision highp float;
in float vLat; in vec4 vCol; out vec4 o;
void main() { float a = (1.0 - smoothstep(0.25, 1.0, abs(vLat))) * vCol.a; o = vec4(vCol.rgb * a, a); }`;
const FIELD_VS = `#version 300 es
void main() { int id = gl_VertexID; vec2 q = vec2(id == 1 ? 3.0 : -1.0, id == 2 ? 3.0 : -1.0); gl_Position = vec4(q, 0.0, 1.0); }`;
const FIELD_FS = `#version 300 es
precision highp float;
uniform mat3 uInv; uniform vec2 uRes; uniform vec2 uField;
out vec4 o;
void main() {
  vec2 clip = (gl_FragCoord.xy / uRes) * 2.0 - 1.0;
  vec3 w = uInv * vec3(clip, 1.0);
  float inside = (w.x >= 0.0 && w.x <= uField.x && w.y >= 0.0 && w.y <= uField.y) ? 1.0 : 0.0;
  vec3 ground = mix(vec3(0.012, 0.014, 0.03), vec3(0.03, 0.045, 0.085), inside);
  vec2 g = abs(fract(w.xy / 200.0 + 0.5) - 0.5) / fwidth(w.xy / 200.0);
  float line = 1.0 - min(min(g.x, g.y), 1.0);
  vec2 g2 = abs(fract(w.xy / 1000.0 + 0.5) - 0.5) / fwidth(w.xy / 1000.0);
  float line2 = 1.0 - min(min(g2.x, g2.y), 1.0);
  float mid = 1.0 - min(abs(w.x - uField.x * 0.5) / max(fwidth(w.x), 0.001), 1.0);
  vec3 c = ground + inside * (line * vec3(0.05, 0.08, 0.14) + line2 * vec3(0.08, 0.12, 0.2) + mid * vec3(0.12, 0.14, 0.2));
  float v = length(clip) * 0.35; c *= 1.0 - v * v;
  o = vec4(c, 1.0);
}`;

function program(gl, vs, fs) {
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

// an instanced stream: a Float32Array the frame fills, uploaded once a draw
function stream(gl, cap, stride, layout) {
  const vao = gl.createVertexArray(); gl.bindVertexArray(vao);
  const buf = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  const data = new Float32Array(cap * stride);
  gl.bufferData(gl.ARRAY_BUFFER, data.byteLength, gl.DYNAMIC_DRAW);
  let off = 0;
  for (const [loc, size] of layout) { gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc, size, gl.FLOAT, false, stride * 4, off * 4); gl.vertexAttribDivisor(loc, 1); off += size; }
  gl.bindVertexArray(null);
  return { vao, buf, data, stride, cap, n: 0,
    upload() { gl.bindBuffer(gl.ARRAY_BUFFER, buf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, data.subarray(0, this.n * stride)); } };
}

export function createRenderer(canvas) {
  const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, premultipliedAlpha: true, powerPreference: 'high-performance' });
  if (!gl) return null;
  const shapeP = program(gl, SHAPE_VS, SHAPE_FS), lineP = program(gl, LINE_VS, LINE_FS), fieldP = program(gl, FIELD_VS, FIELD_FS);
  const uCamS = gl.getUniformLocation(shapeP, 'uCam'), uCamL = gl.getUniformLocation(lineP, 'uCam'), uMin = gl.getUniformLocation(shapeP, 'uMin');
  const uInv = gl.getUniformLocation(fieldP, 'uInv'), uRes = gl.getUniformLocation(fieldP, 'uRes'), uField = gl.getUniformLocation(fieldP, 'uField');
  const fieldVao = gl.createVertexArray();
  const SHAPE_LAYOUT = [[0, 4], [1, 4], [2, 2]], LINE_LAYOUT = [[0, 4], [1, 4], [2, 1]];
  const shapes = stream(gl, 40000, 10, SHAPE_LAYOUT);     // bodies, towers, shots, mines
  const sparks = stream(gl, 120000, 10, SHAPE_LAYOUT);    // particles and rings
  const lines = stream(gl, 12000, 9, LINE_LAYOUT);
  const cam = new Float32Array(9), inv = new Float32Array(9);
  let vw = 1, vh = 1;

  function resize() {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const w = Math.max(1, Math.round(canvas.clientWidth * dpr)), h = Math.max(1, Math.round(canvas.clientHeight * dpr));
    if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
    vw = w; vh = h; gl.viewport(0, 0, w, h);
  }
  function camera(c) {
    const sx = 2 * c.zoom / (vw / (Math.min(2, window.devicePixelRatio || 1))), sy = -2 * c.zoom / (vh / (Math.min(2, window.devicePixelRatio || 1)));
    cam.set([sx, 0, 0, 0, sy, 0, -c.x * sx, -c.y * sy, 1]);
    inv.set([1 / sx, 0, 0, 0, 1 / sy, 0, c.x, c.y, 1]);
  }
  // push one shape: x y size shape r g b a rot glow
  function shape(S, x, y, size, kind, r, g, b, a, rot, glow) {
    if (S.n >= S.cap) return; const o = S.n * 10, d = S.data;
    d[o] = x; d[o + 1] = y; d[o + 2] = size; d[o + 3] = kind; d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a; d[o + 8] = rot; d[o + 9] = glow; S.n++;
  }
  function line(x1, y1, x2, y2, w, r, g, b, a) {
    const S = lines; if (S.n >= S.cap) return; const o = S.n * 9, d = S.data;
    d[o] = x1; d[o + 1] = y1; d[o + 2] = x2; d[o + 3] = y2; d[o + 4] = r; d[o + 5] = g; d[o + 6] = b; d[o + 7] = a; d[o + 8] = w; S.n++;
  }
  let minWorld = 0;
  function draw(prog, S, uCam) {
    if (!S.n) return;
    gl.useProgram(prog); gl.uniformMatrix3fv(uCam, false, cam); if (prog === shapeP) gl.uniform1f(uMin, minWorld);
    S.upload(); gl.bindVertexArray(S.vao); gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, S.n); gl.bindVertexArray(null);
  }
  function frame(c, fieldW, fieldH, fill) {
    resize(); camera(c); minWorld = 2.4 / c.zoom;
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    gl.useProgram(fieldP); gl.uniformMatrix3fv(uInv, false, inv); gl.uniform2f(uRes, vw, vh); gl.uniform2f(uField, fieldW, fieldH);
    gl.bindVertexArray(fieldVao); gl.drawArrays(gl.TRIANGLES, 0, 3); gl.bindVertexArray(null);
    shapes.n = 0; sparks.n = 0; lines.n = 0;
    fill({ body: (x, y, size, kind, r, g, b, a, rot, glow) => shape(shapes, x, y, size, kind, r, g, b, a, rot, glow), spark: (x, y, size, kind, r, g, b, a, rot, glow) => shape(sparks, x, y, size, kind, r, g, b, a, rot, glow), line });
    gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE);
    draw(shapeP, shapes, uCamS);
    draw(lineP, lines, uCamL);
    draw(shapeP, sparks, uCamS);
  }
  // screen (css px) -> world
  function toWorld(c, px, py) { const cw = canvas.clientWidth, ch = canvas.clientHeight; return [c.x + (px - cw / 2) / c.zoom, c.y + (py - ch / 2) / c.zoom]; }
  return { gl, frame, resize, toWorld, get counts() { return { shapes: shapes.n, sparks: sparks.n, lines: lines.n }; } };
}
