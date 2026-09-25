// relay.js — THE WIRE, the page's end of it. With ?relay=http://host:8898&b=relay the east side is
// commanded from outside: the page asks the relay for its commands four times a second and posts the
// snapshot once a second, so a captain at a keyboard - or a model in a chat - plays the match a person
// is watching. Commands are the same objects the sim applies; the relay adds nothing.
export function createRelayClient(base, sim, team) {
  let since = 0, next = 0, nextState = 0, busy = false;
  async function poll() {
    if (busy) return; busy = true;
    try {
      const r = await fetch(base + '/cmds?team=' + team + '&since=' + since, { cache: 'no-store' });
      if (r.ok) { const j = await r.json(); since = j.next; for (const c of j.cmds) sim.queue({ ...c, team }); }
    } catch (e) { /* the wire is allowed to drop */ }
    busy = false;
  }
  async function post() {
    try { await fetch(base + '/state', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(sim.snapshot()) }); } catch (e) { /* same */ }
  }
  return {
    tick() { const t = sim.tick; if (t >= next) { next = t + 8; poll(); } if (t >= nextState) { nextState = t + 30; post(); } },
  };
}
