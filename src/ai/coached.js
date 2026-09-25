// coached.js — THE COACHED PLAYER. A person who reads the coach line and does what it says, at a
// person's pace: one look every three seconds, one muster a look (two when the purse is deep), the
// battalion that answers what the coach names, from the stronghold nearest the point. This is the yardstick
// the tempers are measured with: a temper is fair when this player wins about half the time.
import { advise } from './coach.js';

export function createCoached(sim, team, opts = {}) {
  const every = opts.every || 90;   // ticks between looks: 90 = three seconds, a person tapping along
  let nextLook = 0;
  const deck = sim.decks[team];
  const cost = (b) => sim.price(b);
  const cheapest = () => deck.reduce((a, b) => (cost(b) < cost(a) ? b : a), deck[0]);
  const avg = () => deck.reduce((a, b) => a + cost(b), 0) / deck.length;
  function pick(a, budget) {
    if (a.answers && a.answers.length) { const fit = deck.filter((b) => a.answers.includes(b.role) && cost(b) <= budget); if (fit.length) return fit[Math.floor(fit.length / 2)]; }
    if (a.kind === 'claim' || a.kind === 'first') return cost(cheapest()) <= budget ? cheapest() : null;
    const fit = deck.filter((b) => cost(b) <= budget); return fit.length ? fit[fit.length - 1] : null;   // the dearest it can afford: a person taps the big card
  }
  function fromNearest(goal) { const gp = sim.goalPoint(goal); if (!gp) return -1; let best = -1, bd = Infinity; for (let t = 0; t < sim.T.n; t++) { if (sim.T.team[t] !== team || !sim.T.alive[t]) continue; const dx = sim.T.x[t] - gp.x, dy = sim.T.y[t] - gp.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = t; } } return best; }
  function act() {
    const snap = sim.snapshot();
    const a = advise(sim, team, snap); if (!a) return;
    let energy = sim.energy[team];
    if (a.kind === 'fortify') { sim.queue({ op: 'fortify', team, well: a.target - 1000 }); return; }
    const n = energy > avg() * 3 ? 2 : 1;
    for (let i = 0; i < n; i++) {
      const b = pick(a, energy); if (!b) return;
      const from = fromNearest(a.target); if (from < 0) return;
      sim.queue({ op: 'deploy', team, tower: from, batt: b.id, goal: a.target }); energy -= cost(b);
    }
  }
  return { team, tick() { if (sim.tick < nextLook || sim.result) return; nextLook = sim.tick + every; act(); } };
}
