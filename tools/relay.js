// relay.js — THE WIRE. A tiny HTTP relay so a match in a browser can be commanded from outside it.
//   node tools/relay.js            (port 8898)
//   the page: ?relay=http://<this machine>:8898&b=relay   (the east side takes its orders from here)
//   a captain: curl -X POST localhost:8898/cmd -d '{"op":"deploy","team":1,"tower":7,"kind":"BLOCK","goal":2}'
//              curl localhost:8898/state
import http from 'node:http';
const PORT = +(process.env.PORT || 8898);
const cmds = [];            // every command ever posted, in order; a page reads from its cursor
let state = null, stateAt = 0;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
function body(req) { return new Promise((res) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => res(s)); }); }
http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (u.pathname === '/cmd' && req.method === 'POST') {
    try { const c = JSON.parse(await body(req)); if (c.op !== 'deploy') throw new Error('op'); cmds.push(c); res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, n: cmds.length })); }
    catch (e) { res.writeHead(400, cors); res.end('a command is {"op":"deploy","team":1,"tower":7,"kind":"BLOCK","goal":2}'); }
    return;
  }
  if (u.pathname === '/cmds') { const since = +(u.searchParams.get('since') || 0), team = +(u.searchParams.get('team') || 1); const out = cmds.slice(since).filter((c) => (c.team | 0) === team); res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify({ cmds: out, next: cmds.length })); return; }
  if (u.pathname === '/state' && req.method === 'POST') { try { state = JSON.parse(await body(req)); stateAt = Date.now(); } catch (e) { /* ignore */ } res.writeHead(200, cors); res.end('ok'); return; }
  if (u.pathname === '/state') { res.writeHead(200, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify({ ageMs: state ? Date.now() - stateAt : null, state })); return; }
  res.writeHead(404, cors); res.end('no');
}).listen(PORT, () => console.log('the wire at http://127.0.0.1:' + PORT + '/  (POST /cmd, GET /cmds?team=1&since=0, POST/GET /state)'));
