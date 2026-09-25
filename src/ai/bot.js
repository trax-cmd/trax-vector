// bot.js — THE CAPTAIN. A commander written in code, so the game is played by a machine in real time
// and the same policy can hold either side. Twice a second it reads the snapshot and answers with
// deploy commands: defend the tower that is threatened, else push the enemy tower that is weakest,
// spending down to a reserve. Nothing here can see more than the snapshot shows a person.
import { rng32 } from '../sim/rng.js';

// what beats what, by tag: the enemy's dominant tag -> the tags we want on the street
const COUNTER = {
  swarm: ['antiswarm', 'splash', 'zone'], cheap: ['antiswarm', 'splash'],
  tank: ['strike', 'assassin', 'line', 'artillery'], shield: ['strike', 'line'],
  strike: ['tank', 'shield', 'heal'], harass: ['antiswarm', 'tank'],
  artillery: ['assassin', 'strike', 'harass'], carrier: ['assassin', 'strike'],
  support: ['assassin', 'strike'], heal: ['assassin'], zone: ['artillery', 'line'], assassin: ['swarm', 'antiswarm'],
  suicide: ['antiswarm', 'zone'], split: ['antiswarm'],
};

export function createBot(sim, team, opts = {}) {
  const r = rng32((opts.seed || 7) * 131 + team);
  const kinds = sim.kinds;
  const every = opts.every || 15;   // ticks between looks (15 = twice a second)
  const reserve = opts.reserve ?? 0.15;
  const burst = opts.burst || 6;
  let nextLook = 0;
  const tagsOf = (k) => kinds[k].tags;

  function pickByTags(want, budget) {
    const cands = kinds.filter((k) => k.cost <= budget && k.w.type !== 'spawn' || (k.w.type === 'spawn' && k.cost <= budget));
    if (!cands.length) return null;
    let best = null, bs = -1;
    for (const k of cands) {
      let s = r() * 0.5;
      for (const t of k.tags) if (want.includes(t)) s += 1;
      s += Math.min(1, k.cost / 120) * 0.4;   // a dearer body is a bigger answer
      if (s > bs) { bs = s; best = k; }
    }
    return best;
  }

  function look(snap) {
    const cmds = [];
    const mine = snap.towers.filter((t) => t.team === team && t.alive);
    const theirs = snap.towers.filter((t) => t.team !== team && t.alive);
    if (!mine.length || !theirs.length) return cmds;
    let energy = snap.energy[team];
    const keep = energy * reserve;
    const enemyCounts = snap.counts[1 - team];
    // the enemy's dominant tags, weighted by what they fielded
    const tagW = {};
    for (let k = 0; k < enemyCounts.length; k++) if (enemyCounts[k]) for (const t of tagsOf(k)) tagW[t] = (tagW[t] || 0) + enemyCounts[k] * kinds[k].cost;
    const top = Object.keys(tagW).sort((a, b) => tagW[b] - tagW[a]).slice(0, 2);
    const want = []; for (const t of top) for (const c of COUNTER[t] || []) want.push(c);
    // defend: the most threatened tower of mine
    const hot = mine.slice().sort((a, b) => b.threat - a.threat)[0];
    let sent = 0;
    if (hot && hot.threat > 60) {
      while (sent < burst && energy - keep > 10) {
        const k = pickByTags(want.length ? want : ['antiswarm', 'tank'], energy - keep);
        if (!k) break;
        cmds.push({ op: 'deploy', team, tower: hot.i, kind: k.index, goal: nearest(theirs, hot).i });
        energy -= k.cost; sent++;
      }
    }
    // push: the weakest enemy tower, from my tower nearest to it
    if (sent < burst && energy - keep > 10) {
      const weak = theirs.slice().sort((a, b) => a.hp - b.hp)[0];
      const from = nearest(mine, weak);
      const flavor = r() < 0.5 ? want : ['tank', 'strike', 'swarm', 'artillery'];
      while (sent < burst && energy - keep > 10) {
        const k = pickByTags(flavor, energy - keep);
        if (!k) break;
        cmds.push({ op: 'deploy', team, tower: from.i, kind: k.index, goal: weak.i });
        energy -= k.cost; sent++;
      }
    }
    return cmds;
  }
  function nearest(list, to) { let b = list[0], bd = Infinity; for (const t of list) { const dx = t.x - to.x, dy = t.y - to.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; b = t; } } return b; }

  return {
    team,
    // call once a tick; issues commands on its own cadence
    tick() { if (sim.tick < nextLook || sim.result) return; nextLook = sim.tick + every; for (const c of look(sim.snapshot())) sim.queue(c); },
    look,
  };
}
