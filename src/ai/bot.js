// bot.js — THE CAPTAIN. A commander written in code, so the game is played by a machine in real time
// and the same policy can hold either side. Once a second it reads the snapshot and answers with
// battalions: it holds what is threatened with the counter to what threatens it, it claims wells with
// cheap hands, and it saves for waves that hit the weakest stronghold with the counter to what the
// enemy fields. Nothing here can see more than the snapshot shows a person.
import { rng32 } from '../sim/rng.js';
import { BEATS } from '../sim/library.js';

export function createBot(sim, team, opts = {}) {
  const r = rng32((opts.seed || 7) * 131 + team);
  const every = opts.every || 30;          // ticks between looks (30 = once a second)
  const reserve = opts.reserve ?? 0.1;
  const waves = opts.waves ?? 3;           // battalions in a wave
  const burst = opts.burst || 4;           // musters a look, at most
  let nextLook = 0, claims = [], lastFort = -9999;   // wells claimed lately: [well, tick]; the tick of the last fort
  const deck = sim.decks[team];
  const other = 1 - team;

  // the battalion in my deck that best answers a role, cheapest first among the answers
  function answerTo(role, budget) {
    const cands = deck.filter((b) => b.cost <= budget);
    if (!cands.length) return null;
    const counters = cands.filter((b) => BEATS[b.role].includes(role));
    const pool = counters.length ? counters : cands;
    return pool[r.int(pool.length)];
  }
  const cheapest = () => deck.reduce((a, b) => (b.cost < a.cost ? b : a), deck[0]);
  const avgCost = () => deck.reduce((a, b) => a + b.cost, 0) / deck.length;
  const topRole = (fielded) => { let best = -1, bv = 0; for (let q = 0; q < 6; q++) if (fielded[q] > bv) { bv = fielded[q]; best = q; } return best; };
  const nearest = (list, to) => { let b = null, bd = Infinity; for (const t of list) { const dx = t.x - to.x, dy = t.y - to.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; b = t; } } return b; };

  function look(snap) {
    const cmds = [];
    const mine = snap.towers.filter((t) => t.team === team && t.alive);
    const theirs = snap.towers.filter((t) => t.team !== team && t.alive);
    if (!mine.length || !theirs.length) return cmds;
    let energy = snap.energy[team];
    const keep = energy * reserve;
    const enemyTop = topRole(snap.fielded[other]);
    let sent = 0;
    const send = (b, from, goal) => { cmds.push({ op: 'deploy', team, tower: from.i, batt: b.id, goal }); energy -= b.cost; sent++; };
    // 1. HOLD: the stronghold or the well of mine under the heaviest threat, with the answer to what threatens it
    const myWells = snap.wells.filter((w) => w.owner === team);
    const hot = [...mine.map((t) => ({ kind: 'tower', i: t.i, x: t.x, y: t.y, threat: t.threat - t.guard * 0.6 })), ...myWells.map((w) => ({ kind: 'well', i: w.i, x: w.x, y: w.y, threat: (team === 0 ? w.east - w.west * 0.6 : w.west - w.east * 0.6) }))].sort((a, b) => b.threat - a.threat)[0];
    if (hot && hot.threat > 90) {
      const from = nearest(mine, hot);
      let tries = 0;
      while (sent < burst && tries++ < 2 && energy - keep > 20) { const b = answerTo(enemyTop >= 0 ? enemyTop : 0, energy - keep); if (!b) break; send(b, from, hot.kind === 'tower' ? hot.i : 1000 + hot.i); }
    }
    // 2. CLAIM: a well nobody of mine holds or is walking to, the nearest to my line, with a cheap hand
    claims = claims.filter((c) => sim.tick - c[1] < 30 * 25);
    if (sent < burst && energy - keep > cheapest().cost) {
      const open = snap.wells.filter((w) => w.owner !== team && !claims.some((c) => c[0] === w.i) && (team === 0 ? w.east : w.west) < 150);
      if (open.length) {
        const from = mine[r.int(mine.length)];
        const w = nearest(open, from);
        const b = r() < 0.7 ? cheapest() : answerTo(enemyTop >= 0 ? enemyTop : 0, energy - keep) || cheapest();
        if (b.cost <= energy - keep) { send(b, from, 1000 + w.i); claims.push([w.i, sim.tick]); }
      }
    }
    // 2b. THE FORT: holding three wells and a quiet one among them, with some energy in hand, fortify the quiet one nearest my strongholds - at most one every ten seconds
    if (sent < burst && energy - keep > 400 && myWells.length >= 3 && sim.tick - lastFort > 300) {
      const quiet = myWells.filter((w) => !w.fort && (team === 0 ? w.east : w.west) < 50);
      if (quiet.length) { const w = nearest(quiet, nearest(mine, quiet[0])); cmds.push({ op: 'fortify', team, well: w.i }); energy -= 150; sent++; lastFort = sim.tick; }
    }
    // 3. THE WAVE: with a wave's worth in hand, hit the weakest stronghold from the nearest of mine with the answers to their field
    const avg = avgCost();
    if (sent < burst && energy - keep > avg * waves) {
      const weak = theirs.slice().sort((a, b) => a.hp - b.hp)[0];
      const from = nearest(mine, weak);
      for (let k = 0; k < waves && sent < burst; k++) {
        const b = k === 0 ? (deck.find((q) => q.role === 1 && q.cost <= energy - keep) || answerTo(enemyTop, energy - keep)) : answerTo(enemyTop >= 0 ? enemyTop : r.int(6), energy - keep);
        if (!b || b.cost > energy - keep) break;
        send(b, from, weak.i);
      }
    }
    return cmds;
  }

  return {
    team, deck,
    tick() { if (sim.tick < nextLook || sim.result) return; nextLook = sim.tick + every; for (const c of look(sim.snapshot())) sim.queue(c); },
    look,
  };
}
