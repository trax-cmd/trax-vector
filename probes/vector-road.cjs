// vector-road.cjs — the road a player walks, by real taps: the page loads with no error, the field is
// drawn, a tap on a tower of yours chooses it, a tap on a card deploys and charges, the captain across
// the field deploys on its own, bodies fight, frames are taken. Chromium (WebGL2 through SwiftShader
// when there is no GPU), a phone glass or a desk.
//   node probes/vector-road.cjs [phone|desk]   (the house served at :8897 - PORT=8897 node tools/serve.js)
const { chromium } = require('C:/Users/TraxN/Desktop/trax-arena/node_modules/playwright');
const http = require('http');
const GLASS = process.argv[2] || 'phone';
const URL0 = process.env.VECTOR_URL || 'http://127.0.0.1:8897/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitServer() { for (let i = 0; i < 40; i++) { try { await new Promise((res, rej) => http.get(URL0, (r) => { r.resume(); res(); }).on('error', rej)); return; } catch (e) { await sleep(250); } } throw new Error('no server at ' + URL0); }
(async () => {
  if (!process.env.VECTOR_URL) await waitServer();
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const ctx = await b.newContext(GLASS === 'phone' ? { viewport: { width: 844, height: 390 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } : { viewport: { width: 1280, height: 720 } });
  const p = await ctx.newPage();
  const errs = [], logs = [];
  p.on('pageerror', (e) => errs.push(String(e.message || e).slice(0, 300)));
  p.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(m.type() + ': ' + m.text().slice(0, 200)); });
  const fails = [];
  await p.goto(URL0 + (URL0.includes('?') ? '&' : '?') + 'seed=1&cb=' + Date.now(), { waitUntil: 'load' });
  await sleep(1500);
  const boot = await p.evaluate(() => { const V = window.VECTOR; if (!V) return null; return { seed: V.seed, towers: V.sim.T.n, tower: V.state.team, chosen: V.state.tower, alive: [V.sim.U.count[0], V.sim.U.count[1]], energy: V.sim.energy.slice(), fps: V.fps, counts: V.counts, gl: !!document.querySelector('#field').getContext('webgl2') }; });
  console.log(GLASS, 'BOOT', JSON.stringify(boot));
  if (!boot) { fails.push('window.VECTOR missing (module failed?)'); }
  else { if (boot.towers !== 10) fails.push('towers ' + boot.towers); if (!boot.gl) fails.push('no webgl2 context'); }
  const tap = async (x, y) => { if (GLASS === 'phone') await p.touchscreen.tap(x, y); else await p.mouse.click(x, y); };
  // 1. a tower of mine by a tap (the northern one), then an enemy tower to aim
  const toScreen = async (t) => p.evaluate((t) => { const V = window.VECTOR, c = document.getElementById('field'); return [c.clientWidth / 2 + (V.sim.T.x[t] - V.cam.x) * V.cam.zoom, c.clientHeight / 2 + (V.sim.T.y[t] - V.cam.y) * V.cam.zoom]; }, t);
  const [tx0, ty0] = await toScreen(0); await tap(tx0, ty0); await sleep(200);
  const chosen = await p.evaluate(() => window.VECTOR.state.tower); console.log('tapped my northern tower ->', chosen); if (chosen !== 0) fails.push('the tap did not choose tower 0 (got ' + chosen + ')');
  const [ex, ey] = await toScreen(9); await tap(ex, ey); await sleep(200);
  const goal = await p.evaluate(() => window.VECTOR.state.goal); console.log('tapped the enemy southern stronghold ->', goal); if (goal !== 9) fails.push('the tap did not aim at stronghold 9 (got ' + goal + ')');
  // a well by a tap: the first well of the west column
  const [wx0, wy0] = await p.evaluate(() => { const V = window.VECTOR, c = document.getElementById('field'); return [c.clientWidth / 2 + (V.sim.WL.x[0] - V.cam.x) * V.cam.zoom, c.clientHeight / 2 + (V.sim.WL.y[0] - V.cam.y) * V.cam.zoom]; });
  await tap(wx0, wy0); await sleep(200);
  const wgoal = await p.evaluate(() => window.VECTOR.state.goal); console.log('tapped the first well ->', wgoal); if (wgoal !== 1000) fails.push('the tap did not aim at well 0 (got ' + wgoal + ')');
  // 2. a card: the first battalion of the deck, mustered at the chosen stronghold toward the well
  const card = await p.evaluate(() => { const c = document.querySelector('.card'); const r = c.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2, id: c.dataset.k, n: document.querySelectorAll('.card').length, words: c.textContent.replace(/s+/g, ' ').trim() }; });
  console.log('the first card', JSON.stringify(card)); if (card.n !== 8) fails.push('the deck has ' + card.n + ' cards, not 8'); if (!/beat/.test(card.words)) fails.push('the card does not say what it beats');
  console.log('the card’s promise line:', JSON.stringify(await p.evaluate(() => document.querySelector('.card .w').textContent)));
  const e0 = await p.evaluate(() => window.VECTOR.sim.energy[0]);
  await tap(card.x, card.y); await sleep(300);
  const after = await p.evaluate(() => ({ energy: window.VECTOR.sim.energy[0], alive: window.VECTOR.sim.U.count[0], deployed: window.VECTOR.state.deployed }));
  console.log('BLOCK card', JSON.stringify({ before: Math.floor(e0), after }));
  if (after.deployed !== 1 || after.alive < 2 || after.energy >= e0) fails.push('the card did not muster a battalion and charge: ' + JSON.stringify(after));
  const strip = await p.evaluate(() => document.getElementById('strip').textContent); if (!/WELLS/.test(strip) || !/ANSWER/.test(strip)) fails.push('the strip does not read wells and the answer: ' + strip.slice(0, 120));
  // 3. a second battalion sent across the field at the enemy's first well, so the two sides meet; the captain across the field claims its own wells meanwhile
  await p.evaluate(() => { window.VECTOR.state.goal = 1013; window.VECTOR.deploy(1); });
  await sleep(9000);
  for (let i = 0; i < 24; i++) { const k = await p.evaluate(() => window.VECTOR.sim.S.stats.kills[0] + window.VECTOR.sim.S.stats.kills[1]); if (k > 0) break; await sleep(2500); }
  const fight = await p.evaluate(() => { const V = window.VECTOR, s = V.sim.snapshot(); return { t: s.time, alive: s.alive, energy: s.energy, deployed: V.sim.S.stats.deployed, kills: V.sim.S.stats.kills, fps: +V.fps.toFixed(1), counts: V.counts, towers: s.towers.map((t) => t.hp) }; });
  console.log('THE FIELD at', fight.t, 's', JSON.stringify(fight));
  if (fight.deployed[1] < 1) fails.push('the east captain deployed nothing');
  if (fight.kills[0] + fight.kills[1] < 1) fails.push('no body fell in seventy seconds');
  const wells = await p.evaluate(() => { const W = window.VECTOR.sim.WL; let a = 0, b = 0, moving = 0; for (let w = 0; w < W.n; w++) { if (W.owner[w] === 0) a++; else if (W.owner[w] === 1) b++; if (W.prog[w] !== 0) moving++; } return { west: a, east: b, moving }; }); console.log('wells', JSON.stringify(wells)); if (wells.east + wells.moving < 1) fails.push('the east captain claimed no well and turned none in ten seconds');
  await p.screenshot({ path: 'C:/Users/TraxN/Desktop/trax-vector/probes/shots/road-' + GLASS + '-1-field.png' });
  // 4. zoom in on the fight and look
  await p.evaluate(() => { const V = window.VECTOR, U = V.sim.U; let sx = 0, sy = 0, n = 0; for (let i = 0; i < U.hi; i++) if (U.alive[i]) { sx += U.x[i]; sy += U.y[i]; n++; } V.cam.zoom = 0.9; if (n) { V.cam.x = sx / n; V.cam.y = sy / n; } });   // look where the bodies are
  await sleep(1500);
  await p.screenshot({ path: 'C:/Users/TraxN/Desktop/trax-vector/probes/shots/road-' + GLASS + '-2-close.png' });
  const late = await p.evaluate(() => ({ fps: +window.VECTOR.fps.toFixed(1), counts: window.VECTOR.counts }));
  console.log('close', JSON.stringify(late));
  console.log('page errors:', errs.length ? errs.join(' | ') : 'none', '· console:', logs.length ? logs.slice(0, 5).join(' | ') : 'clean');
  if (errs.length) fails.push('page errors');
  if (fails.length) { console.log('FAILS', JSON.stringify(fails)); await b.close(); process.exit(1); }
  console.log('OK - the vector road on a ' + GLASS);
  await b.close();
})().catch((e) => { console.error(e); process.exit(1); });
