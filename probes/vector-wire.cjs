// vector-wire.cjs — the wire, end to end: the relay is started, a page opens a match whose east side takes
// its orders from the relay, the documented command is posted from outside (the way a captain in a chat
// would), the page applies it, a surge is posted and refused under a full meter, then fires on a full one,
// the page's snapshot comes back through the relay with its lanes and meters, and a bad op is still refused.
//   node probes/vector-wire.cjs   (the house served at :8897 - PORT=8897 node tools/serve.js - or the probe serves it)
const { chromium } = require('C:/Users/TraxN/Desktop/trax-arena/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const HOUSE = 'http://127.0.0.1:8897', WIRE = 'http://127.0.0.1:8898';
const EXAMPLE = { op: 'deploy', team: 1, batt: 'PHALANX', lane: 1, x: 4500 };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url) => new Promise((res, rej) => http.get(url, (r) => { let s = ''; r.on('data', (c) => { s += c; }); r.on('end', () => res({ code: r.statusCode, body: s })); }).on('error', rej));
const post = (url, obj) => new Promise((res, rej) => { const d = JSON.stringify(obj); const q = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(d) } }, (r) => { let s = ''; r.on('data', (c) => { s += c; }); r.on('end', () => res({ code: r.statusCode, body: s })); }); q.on('error', rej); q.end(d); });
async function up(url, tries = 40) { for (let i = 0; i < tries; i++) { try { await get(url); return true; } catch (e) { await sleep(250); } } return false; }
// a node process of the house's tools, killed at the end; null when the port already answers
async function serve(script, url, port) {
  if (await up(url, 2)) return null;
  const child = spawn(process.execPath, [path.join(ROOT, 'tools', script)], { stdio: 'ignore', env: { ...process.env, PORT: String(port) } });
  if (!(await up(url))) throw new Error(script + ' did not come up at ' + url);
  return child;
}
// the first seed whose east deck holds the documented battalion, so the example is posted word for word
async function seedWithPhalanx() {
  const { draft } = await import('file:///' + path.join(ROOT, 'src/sim/library.js').replace(/\\/g, '/'));
  for (let s = 1; s < 200; s++) if (draft(s * 17 + 101 + 5, 8).some((b) => b.id === EXAMPLE.batt)) return s;
  throw new Error('no seed under 200 drafts ' + EXAMPLE.batt + ' for the east');
}

(async () => {
  const fails = [], checks = [];
  const check = (name, ok, detail) => { checks.push(`${ok ? 'PASS' : 'FAIL'} ${name}${detail ? ' · ' + detail : ''}`); if (!ok) fails.push(name); };
  let house = null, relay = null, b = null;
  try {
    house = await serve('serve.js', HOUSE + '/index.html', 8897);
    relay = await serve('relay.js', WIRE + '/state', 8898);
    // 0. the wire's own judgment of a command's shape, before any page: a bad op, a bad lane and a bare surge are refused
    const r4 = await post(WIRE + '/cmd', { op: 'nuke', team: 1 }), r5 = await post(WIRE + '/cmd', { op: 'deploy', team: 1, batt: 'PHALANX', lane: 5, x: 4500 }), r6 = await post(WIRE + '/cmd', { op: 'surge', team: 1 });
    check('a bad op is refused', r4.code === 400, r4.code + ' ' + r4.body.slice(0, 80));
    check('a bad lane is refused', r5.code === 400, r5.code + ' ' + r5.body.slice(0, 80));
    check('a surge with no lane is refused', r6.code === 400, r6.code + ' ' + r6.body.slice(0, 80));
    const seed = await seedWithPhalanx();
    b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; p.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200)));
    await p.goto(`${HOUSE}/index.html?seed=${seed}&b=relay&relay=${WIRE}&cb=${Date.now()}`, { waitUntil: 'load' });
    await sleep(2500);
    const before = await p.evaluate(() => { const V = window.VECTOR; return V ? { musters: V.sim.S.stats.musters.slice(), bots: V.bots.length, deck: V.sim.decks[1].map((q) => q.id) } : null; });
    console.log('the page (seed ' + seed + ')', JSON.stringify(before));
    check('the page booted with window.VECTOR', !!before);
    if (!before) throw new Error('no window.VECTOR: the page did not boot');
    check('no captain sits on the east side', before.bots === 0, 'bots ' + before.bots);
    check('the east deck holds ' + EXAMPLE.batt, before.deck.includes(EXAMPLE.batt), before.deck.join(', '));

    // 1. the documented command, word for word: a PHALANX into the centre lane at THE CENTRE
    const r1 = await post(WIRE + '/cmd', EXAMPLE);
    check('the documented deploy is accepted by the wire', r1.code === 200, r1.code + ' ' + r1.body);
    await sleep(1200);
    const after = await p.evaluate(() => { const V = window.VECTOR, U = V.sim.U; const lanes = new Set(); for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] === 1) lanes.add(U.lane[i]); return { musters: V.sim.S.stats.musters.slice(), alive: [U.count[0], U.count[1]], lanes: [...lanes], energy: V.sim.energy.map(Math.floor) }; });
    console.log('the page after the deploy', JSON.stringify(after));
    check('the page mustered the east battalion', after.musters[1] === before.musters[1] + 1, `musters ${before.musters[1]} → ${after.musters[1]}`);
    check('its bodies stand in lane 1', after.lanes.length === 1 && after.lanes[0] === 1, 'lanes ' + JSON.stringify(after.lanes));

    // 2. a surge under a full meter is taken by the wire and refused by the sim; on a full meter it fires into the lane
    const r2 = await post(WIRE + '/cmd', { op: 'surge', team: 1, lane: 1 });
    check('a surge command is accepted by the wire', r2.code === 200, r2.code + ' ' + r2.body);
    await sleep(800);
    const refused = await p.evaluate(() => ({ lane: window.VECTOR.sim.S.surgeLane[1], surge: window.VECTOR.sim.S.surge[1], surges: window.VECTOR.sim.S.stats.surges[1] }));
    check('the sim refused it under 10,000', refused.surges === 0 && refused.lane === -1, JSON.stringify(refused));
    await p.evaluate(() => { window.VECTOR.sim.S.surge[1] = 10000; });
    const r3 = await post(WIRE + '/cmd', { op: 'surge', team: 1, lane: 1 });
    await sleep(800);
    const fired = await p.evaluate(() => ({ lane: window.VECTOR.sim.S.surgeLane[1], left: +(window.VECTOR.sim.S.surgeUntil[1] - window.VECTOR.sim.time).toFixed(1), surges: window.VECTOR.sim.S.stats.surges[1] }));
    check('a full meter fires into lane 1 through the wire', r3.code === 200 && fired.surges === 1 && fired.lane === 1 && fired.left > 0, JSON.stringify(fired));

    // 3. the snapshot comes back through the wire with its lanes and meters
    await sleep(1200);
    const st = JSON.parse((await get(WIRE + '/state')).body), s = st.state;
    console.log('the state through the wire', JSON.stringify({ ageMs: st.ageMs, tick: s && s.tick, alive: s && s.alive, surge: s && s.surge, surgeLane: s && s.surgeLane, lane1: s && s.lanes && s.lanes[1] }));
    check('a fresh snapshot came through', !!s && s.tick >= 30 && st.ageMs < 3000, `tick ${s && s.tick} · age ${st.ageMs} ms`);
    check('snap.lanes has three lanes with fronts, held points and fielded energy', !!s && Array.isArray(s.lanes) && s.lanes.length === 3 && s.lanes.every((l) => typeof l.frontW === 'number' && typeof l.frontE === 'number' && l.held.length === 5 && l.fielded.length === 2));
    check('lane 1 fields the east battalion', !!s && s.lanes && s.lanes[1].fielded[1].reduce((q, v) => q + v, 0) > 0, s && s.lanes ? JSON.stringify(s.lanes[1].fielded[1]) : '');
    check('snap.surge and snap.surgeLane read the fired surge', !!s && Array.isArray(s.surge) && s.surge.length === 2 && s.surgeLane[1] === 1, s ? `surge ${JSON.stringify(s.surge)} · lane ${JSON.stringify(s.surgeLane)}` : '');

    check('no page errors', errs.length === 0, errs.join(' | '));
  } catch (e) { fails.push(String(e.message || e)); checks.push('FAIL ' + String(e.message || e)); }
  for (const c of checks) console.log(c);
  if (b) await b.close();
  if (relay) relay.kill();
  if (house) house.kill();
  if (fails.length) { console.log('FAILS', JSON.stringify(fails)); process.exit(1); }
  console.log('OK - the wire: the documented command from outside the page mustered a battalion into lane 1, a surge fired through it, and the match reported its lanes back');
})();
