// relay.js — THE WIRE. A tiny HTTP relay so a match in a browser can be commanded from outside it.
//   node tools/relay.js            (port 8898)
//   the page: ?relay=http://<this machine>:8898&b=relay   (the east side takes its orders from here)
//   a captain: curl -X POST localhost:8898/cmd -d '{"op":"deploy","team":1,"batt":"PHALANX","lane":1,"x":4500}'
//              curl -X POST localhost:8898/cmd -d '{"op":"surge","team":1,"lane":1}'
//              curl localhost:8898/state
// The relay checks a command's SHAPE and nothing more: the sim is the judge of the purse, the lane's gate and
// the meter, and the page tells the truth back through /state. A command is one of the sim's three ops
// (sim.js apply()): the spec names deploy and surge; wave rides along because the sim takes it and an outside
// captain without it could never announce what it musters.
//   deploy  { team, batt | kind, lane, x, free? }  or the legacy { team, tower, batt | kind, goal }
//   surge   { team, lane }
//   wave    { team, lane, roles, n?, name? }
import http from 'node:http';

const PORT = +(process.env.PORT || 8898);
const EXAMPLE = { op: 'deploy', team: 1, batt: 'PHALANX', lane: 1, x: 4500 };
const cmds = [];            // every command ever posted, in order; a page reads from its cursor
let state = null, stateAt = 0;
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': 'content-type', 'access-control-allow-methods': 'GET,POST,OPTIONS' };

const isLane = (v) => Number.isInteger(v) && v >= 0 && v <= 2;
const named = (v) => (typeof v === 'string' && v.length > 0) || Number.isInteger(v);
// why a command is refused, or null when its shape is one the sim can apply
function fault(c) {
  if (!c || typeof c !== 'object') return 'a command is a JSON object';
  if (c.team !== 0 && c.team !== 1) return 'team is 0 or 1';
  switch (c.op) {
    case 'deploy':
      if (!named(c.batt) && !named(c.kind)) return 'deploy names a batt (an id or a deck index) or a kind';
      if (c.lane !== undefined) return isLane(c.lane) && Number.isFinite(+c.x) ? null : 'deploy takes lane 0..2 and a finite x';
      return Number.isInteger(c.goal) || Number.isInteger(c.tower) ? null : 'the legacy deploy takes a tower and a goal';
    case 'surge': return isLane(c.lane) ? null : 'surge takes lane 0..2';
    case 'wave': return isLane(c.lane) && Array.isArray(c.roles) ? null : 'wave takes lane 0..2 and a roles list';
    default: return 'op is deploy, surge or wave';
  }
}

function body(req) { return new Promise((res) => { let s = ''; req.on('data', (c) => { s += c; }); req.on('end', () => res(s)); }); }
const json = (res, code, obj) => { res.writeHead(code, { ...cors, 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

http.createServer(async (req, res) => {
  const u = new URL(req.url, 'http://x');
  if (req.method === 'OPTIONS') { res.writeHead(204, cors); res.end(); return; }
  if (u.pathname === '/cmd' && req.method === 'POST') {
    let c = null, why = 'a command is JSON';
    try { c = JSON.parse(await body(req)); why = fault(c); } catch (e) { /* not JSON: refused below */ }
    if (why) { json(res, 400, { error: why, example: EXAMPLE }); return; }
    cmds.push(c);
    json(res, 200, { ok: true, n: cmds.length });
    return;
  }
  if (u.pathname === '/cmds') {
    const since = +(u.searchParams.get('since') || 0), team = +(u.searchParams.get('team') || 1);
    json(res, 200, { cmds: cmds.slice(since).filter((c) => c.team === team), next: cmds.length });
    return;
  }
  if (u.pathname === '/state' && req.method === 'POST') { try { state = JSON.parse(await body(req)); stateAt = Date.now(); } catch (e) { /* a torn post is dropped; the next one is a second away */ } res.writeHead(200, cors); res.end('ok'); return; }
  if (u.pathname === '/state') { json(res, 200, { ageMs: state ? Date.now() - stateAt : null, state }); return; }
  res.writeHead(404, cors); res.end('no');
}).listen(PORT, () => console.log('the wire at http://127.0.0.1:' + PORT + '/  (POST /cmd, GET /cmds?team=1&since=0, POST/GET /state)'));
