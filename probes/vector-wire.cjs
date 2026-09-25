// vector-wire.cjs — the wire, end to end: the relay is started, a page opens a match whose east side
// takes its orders from the relay, a command is posted from outside (the way a captain in a chat would),
// the page applies it, and the page's snapshot is read back through the relay.
//   node probes/vector-wire.cjs   (the house served at :8897)
const { chromium } = require('C:/Users/TraxN/Desktop/trax-arena/node_modules/playwright');
const { spawn } = require('child_process');
const http = require('http');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const get = (url) => new Promise((res, rej) => http.get(url, (r) => { let s = ''; r.on('data', (c) => { s += c; }); r.on('end', () => res({ code: r.statusCode, body: s })); }).on('error', rej));
const post = (url, obj) => new Promise((res, rej) => { const d = JSON.stringify(obj); const q = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(d) } }, (r) => { let s = ''; r.on('data', (c) => { s += c; }); r.on('end', () => res({ code: r.statusCode, body: s })); }); q.on('error', rej); q.end(d); });
(async () => {
  const relay = spawn(process.execPath, ['C:/Users/TraxN/Desktop/trax-vector/tools/relay.js'], { stdio: 'ignore' });
  const fails = [];
  try {
    let up = false; for (let i = 0; i < 40 && !up; i++) { try { await get('http://127.0.0.1:8898/state'); up = true; } catch (e) { await sleep(250); } }
    if (!up) throw new Error('the relay did not come up');
    const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
    const p = await b.newPage({ viewport: { width: 1280, height: 720 } });
    const errs = []; p.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 200)));
    await p.goto('http://127.0.0.1:8897/index.html?seed=2&b=relay&relay=http://127.0.0.1:8898&cb=' + Date.now(), { waitUntil: 'load' });
    await sleep(2500);
    const before = await p.evaluate(() => ({ deployed: window.VECTOR.sim.S.stats.deployed.slice(), bots: window.VECTOR.bots.length }));
    console.log('the page', JSON.stringify(before));
    if (before.bots !== 0) fails.push('a captain is still on the east side (bots ' + before.bots + ')');
    // a captain outside the page: one BLOCK from the east's middle tower at the west's middle tower
    const r1 = await post('http://127.0.0.1:8898/cmd', { op: 'deploy', team: 1, tower: 7, kind: 'BLOCK', goal: 2 });
    console.log('posted a command ->', r1.code, r1.body);
    await sleep(1200);
    const after = await p.evaluate(() => ({ deployed: window.VECTOR.sim.S.stats.deployed.slice(), alive: [window.VECTOR.sim.U.count[0], window.VECTOR.sim.U.count[1]], energy: window.VECTOR.sim.energy.map(Math.floor) }));
    console.log('the page after', JSON.stringify(after));
    if (after.deployed[1] !== 1) fails.push('the page did not apply the wire command (east deployed ' + after.deployed[1] + ')');
    // the snapshot comes back through the wire
    await sleep(1200);
    const st = JSON.parse((await get('http://127.0.0.1:8898/state')).body);
    console.log('the state through the wire', JSON.stringify({ ageMs: st.ageMs, tick: st.state && st.state.tick, alive: st.state && st.state.alive, energy: st.state && st.state.energy }));
    if (!st.state || st.state.tick < 30) fails.push('no fresh snapshot through the wire');
    // a bad command is refused
    const r2 = await post('http://127.0.0.1:8898/cmd', { op: 'nuke' }); if (r2.code !== 400) fails.push('a bad command was not refused');
    console.log('page errors:', errs.length ? errs.join(' | ') : 'none');
    if (errs.length) fails.push('page errors');
    await b.close();
  } catch (e) { fails.push(String(e.message || e)); }
  relay.kill();
  if (fails.length) { console.log('FAILS', JSON.stringify(fails)); process.exit(1); }
  console.log('OK - the wire: a command from outside the page moved a body in the match, and the match reported back');
})();
