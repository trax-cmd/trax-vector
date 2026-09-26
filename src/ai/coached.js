// coached.js — THE COACHED PLAYER. A person who reads the coach and does what it says, at a person's
// pace: one look every three seconds, one drop a look (two when the purse is deep), the card the coach
// glows, to the lane and the x the coach marks; the surge dragged where the coach says SURGE - and, the
// band pulsing gold while the coach says something else, tapped into the coach's lane as the glass's tap
// does (§4.6), since a person with a full meter does not wait for the word. This is the yardstick the
// tempers are measured with (tools/tempers.js): a temper is fair when this player wins about half the
// time. Nothing else - no rule of its own (SPEC-v0.6 §6.3).
import { advise, pickCard, afford, SURGE_FULL } from './coach.js';

export function createCoached(sim, team, opts = {}) {
  const every = opts.every || 90;   // ticks between looks: three seconds, a person tapping along
  let nextLook = 0;
  const meanPrice = (deck) => deck.reduce((s, b) => s + sim.price(b), 0) / deck.length;
  const fieldedIn = (snap, lane) => snap.lanes[lane].fielded[team].reduce((s, v) => s + v, 0);

  // where a full meter goes, −1 for nowhere: the coach's lane on SURGE; otherwise the coach's lane when his bodies stand
  // there, else the lane holding the most of his energy - the sim refuses a surge into an empty lane, and a person sees
  // that too and drags the band onto his own bodies
  function surgeInto(snap, a) {
    if (a.verb === 'SURGE') return a.lane;
    if (snap.surge[team] < SURGE_FULL) return -1;
    if (fieldedIn(snap, a.lane) > 0) return a.lane;
    const heaviest = [0, 1, 2].reduce((best, l) => (fieldedIn(snap, l) > fieldedIn(snap, best) ? l : best), 0);
    return fieldedIn(snap, heaviest) > 0 ? heaviest : -1;
  }

  // the commands one look earns: the surge, then the coach's card at its place - and a second card, picked the
  // coach's way for what is left, when energy runs past three times the deck's mean price. The orders go through
  // the queue and are priced a tick later, so a card a diamond short of safe waits a look.
  function act(snap) {
    const a = advise(sim, team, snap);
    if (!a) return [];
    const cmds = [], into = surgeInto(snap, a);
    if (into >= 0) cmds.push({ op: 'surge', team, lane: into });
    const deck = snap.decks[team];
    let energy = snap.energy[team], card = a.card;
    const drops = energy > 3 * meanPrice(deck) ? 2 : 1;
    for (let k = 0; k < drops && card >= 0; k++) {
      const price = sim.price(deck[card]);
      if (!afford(price, energy)) break;
      cmds.push({ op: 'deploy', team, batt: card, lane: a.lane, x: a.x });
      energy -= price;
      card = pickCard(sim, deck, a.answers, energy, a.breaker);
    }
    return cmds;
  }

  return {
    team, act,
    tick() {
      if (sim.result || sim.tick < nextLook) return;
      nextLook = sim.tick + every;
      for (const c of act(sim.snapshot())) sim.queue(c);
    },
  };
}
