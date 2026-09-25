// bot.js — THE CAPTAIN. The machine that plays the far side of every match on the three lanes of THE
// BREACH (SPEC-v0.6 §8). It sees what a person sees - the snapshot - and the till (sim.price), and it
// answers with deploys, one announced wave at a time and the surge. The rules of §8 run in order at every
// look: defend the weak lane, mass a wave on the clock (or counter-push where the enemy is thin the moment
// it commits elsewhere), surge when the hammer is over the anvil, otherwise buy the centre; at the bell,
// one card into each lane. An attack never goes to a lane with nothing left to break, and no order goes to
// a lane it cannot muster into. Its only randomness is its own seeded stream, so a replay with the same
// seed gives the same orders and the sim's stream is never touched.
import { rng32 } from '../sim/rng.js';
import { BEATS, WAVE_NAMES } from '../sim/library.js';
import { TEMPERS } from '../sim/sim.js';
import { CP_X, CENTRE, slotsToward } from '../sim/lanes.js';
import { readLanes, surgeLane, topRole, waveTop, urgency, afford } from './coach.js';

const SWARM = 0, ARMOR = 1, STRIKE = 2;
const TICKS = 30;                 // sim ticks a second (TICK = 1/30)
const RESERVE = 0.1;              // the tenth of the purse a look never spends
const DEFEND_CARDS = 2, DEFEND_SHARE = 0.6;   // rule 1: at most two cards, at most 60 % of the purse
const WAVE_LEAD = 90;             // ticks between a wave's plate and its muster: 3 s (§5.4)
const WAVE_PATIENCE = 180;        // ticks a broke captain keeps trying to honour a plate: 6 s, then the wave is dropped
const DEEP = 3400;                // own depth past which a lane needs no answer and the wave goes where the enemy is thin
const COMMIT_S = 6, COMMIT_CARDS = 3;   // the enemy's commitment that earns a counter-push: three cards or a surge within 6 s
const SURGE_S = 8;                // a surge lives 8 s (§5.1)
const ALL_LANES = -1;             // the bell's wave goes to every lane at once: the announcer spells lane −1 as ALL LANES (§5.4)
const OPENING_NAME = 'THE SPEARHEAD';   // WAVE 1 is THE SPEARHEAD whatever its roles (§5.4's plate at the bell; STRIKE's first name)

export function createBot(sim, team, opts = {}) {
  const r = rng32((opts.seed || 7) * 131 + team);
  // the temper: named in opts, else the match's own (sim.o.temper is the one read beyond the snapshot and the till: the
  // sheet's EASY / HARD pick reaches the captain through it), else NORMAL; every, burst and wave may each be overridden
  const temper = { ...TEMPERS.normal, ...(TEMPERS[opts.temper || (sim.o && sim.o.temper)] || {}) };
  const every = opts.every || temper.every, burst = opts.burst || temper.burst;
  const waveTicks = (opts.wave || temper.wave) * TICKS;
  const them = 1 - team;
  let opened = false, nextLook = 0, nextWave = waveTicks;
  let waveN = 1, pending = null;    // the opening goes up as WAVE 1 (§5.4); the waves announced on the clock count from 2
  const seen = [[], [], []];        // per lane, [tick, enemy fielded] over the last 6 s: the enemy's drops read as rises
  let answeredAt = -1;              // the tick of the last counter-push: a commitment is answered once

  // the deck at today's prices, as the captain shops it
  const shop = (snap) => snap.decks[team].map((b, i) => ({ i, role: b.role, price: sim.price(b) }));
  const meanPrice = (deck) => deck.reduce((s, b) => s + sim.price(b), 0) / deck.length;
  const within = (cards, budget) => cards.filter((c) => afford(c.price, budget));
  const counters = (cards, role) => cards.filter((c) => BEATS[c.role].includes(role));
  const deploy = (c, lane, x) => ({ op: 'deploy', team, batt: c.i, lane, x });

  // the answer to a role within a budget: a counter when one is affordable, else any card - a body in the lane beats no body
  function answer(deck, role, budget) {
    const fit = within(deck, budget), pool = role >= 0 ? counters(fit, role) : [];
    return pool.length ? r.pick(pool) : fit.length ? r.pick(fit) : null;
  }
  // a wave's card from a pool: one within the budget when the pool has one, else any of the pool - the muster pays what it can
  const pickIn = (pool, budget) => { const fit = within(pool, budget); return r.pick(fit.length ? fit : pool); };

  // the lanes an attack may go to: those with something left to break at the far end; with none, any (the doom is near)
  const attackable = (lanes) => { const live = lanes.filter((L) => !L.finished); return live.length ? live : lanes; };
  // the lane where the enemy fields the least, never the committed one; tie the enemy's shallowest front
  const punishLane = (lanes, from) => attackable(lanes.filter((L) => L.lane !== from)).sort((a, b) => a.enemy - b.enemy || b.depth - a.depth || a.lane - b.lane)[0].lane;
  // (2) MASS: the lane of the highest own advantage, tie the enemy's shallowest front
  const massLane = (lanes) => attackable(lanes).slice().sort((a, b) => (b.own - b.enemy) - (a.own - a.enemy) || b.depth - a.depth || a.lane - b.lane)[0].lane;

  // (6) THE OPENING (§3.7): one card into each lane at the bell - the three cheapest, the dearest of them to the centre, the
  // wings by the coin; the reserve is waived here, since three lanes fielded come before a tenth kept back. Its plate goes
  // up first, as every wave's does: WAVE 1 · THE SPEARHEAD · (the roles sent) → ALL LANES (§5.4), a wave op for lane −1
  // with no lead (inS 0: the muster is in this same look), so the glass reads the bell and the clock's waves count from 2
  function opening(deck, purse, cmds, send) {
    const [a, b, c] = deck.slice().sort((p, q) => p.price - q.price);
    const wings = r() < 0.5 ? [a, b] : [b, a];
    const x = CP_X[slotsToward(team)[0]];   // the first point toward the enemy
    const drops = [];   // [lane, card] of what the purse covers, in lane order - the plate names exactly what marches
    let left = purse.left;
    for (const [lane, card] of [[0, wings[0]], [1, c], [2, wings[1]]]) if (card && afford(card.price, left)) { drops.push([lane, card]); left -= card.price; }
    if (!drops.length) return;
    cmds.push({ op: 'wave', team, lane: ALL_LANES, roles: drops.map(([, card]) => card.role), n: waveN, name: OPENING_NAME, inS: 0 });
    for (const [lane, card] of drops) send(card, lane, x);
  }

  // (1) DEFEND THE WEAK LANE: the counter to its top enemy role at its own front, at most two cards and 60 % of the purse;
  // with two weak lanes each gets one, the gate under fire first. Returns whether any lane is weak.
  function defend(snap, lanes, deck, purse, send) {
    const weak = lanes.filter((L) => L.weak).sort((a, b) => urgency(a) - urgency(b));
    let share = snap.energy[team] * DEFEND_SHARE;
    for (let k = 0; k < DEFEND_CARDS && weak.length && purse.sent < burst; k++) {
      const L = weak[k % weak.length], c = answer(deck, L.top, Math.min(purse.left, share));
      if (!c) break;
      send(c, L.lane, L.ownFront); share -= c.price;
    }
    return weak.length > 0;
  }

  // (3) THE ENEMY'S COMMITMENT: three cards' worth of fielded energy arriving in a lane within 6 s, or a surge there, while own
  // depth in that lane is past 3,400 - no answer is owed there, so the wave goes where the enemy is thin. A card's worth is the
  // enemy deck's mean price: fielded sums body cost, which the price tracks within a role factor. Returns the lane, −1 for none.
  function commitment(snap, lanes) {
    const window = COMMIT_S * TICKS, worth = meanPrice(snap.decks[them]);
    const surgeStart = snap.tick - Math.round((SURGE_S - snap.surgeLeft[them]) * TICKS);
    let from = -1, most = 0;
    for (const L of lanes) {
      const log = seen[L.lane];
      while (log.length && snap.tick - log[0][0] > window) log.shift();
      const cards = log.length ? (L.enemy - log[0][1]) / worth : 0;
      log.push([snap.tick, L.enemy]);
      const surged = snap.surgeLeft[them] >= SURGE_S - COMMIT_S && snap.surgeLane[them] === L.lane && surgeStart > answeredAt;
      const weight = Math.max(cards, surged ? COMMIT_CARDS : 0);
      if (weight >= COMMIT_CARDS && L.depth > DEEP && weight > most) { most = weight; from = L.lane; }
    }
    return lanes.length > 1 ? from : -1;   // a counter-push needs another lane to go to
  }

  // the plate goes up 3 s before the muster (§5.4): 2-4 cards by temper, the first an ARMOR when their top role there is SWARM or
  // STRIKE, the rest counters to it (to their top role anywhere when the lane is empty), chosen within the purse as it will stand
  // at the muster; the wave is named by its top role, cycled by its number
  function announce(snap, lanes, deck, left, lane, cmds) {
    const L = lanes.find((q) => q.lane === lane), top = L.top >= 0 ? L.top : topRole(snap.fielded[them]);
    let budget = left + snap.income[team] * (WAVE_LEAD / TICKS) * (1 - RESERVE);
    const cards = [];
    for (let k = 0; k < burst; k++) {
      const armor = k === 0 && (top === SWARM || top === STRIKE);
      const pool = armor ? deck.filter((c) => c.role === ARMOR) : top >= 0 ? counters(deck, top) : [];
      const c = pickIn(pool.length ? pool : deck, budget);
      cards.push(c); budget -= c.price;
    }
    const roles = cards.map((c) => c.role), n = ++waveN;
    cmds.push({ op: 'wave', team, lane, roles, n, name: waveName(roles, n) });
    pending = { at: snap.tick + WAVE_LEAD, lane, cards: cards.map((c) => c.i) };
  }
  // WAVE_NAMES by the wave's top role, four per role, cycled by wave number: WAVE 1 · THE SPEARHEAD is STRIKE's first name
  function waveName(roles, n) { const names = WAVE_NAMES[waveTop(roles)]; return names[(n - 1) % names.length]; }

  // a plate is honoured (§5.4): at its tick the captain musters what it can afford at its own front, at least the cheapest card of
  // the list with the reserve waived; broke, it tries every tick for 6 s, then the wave is dropped - as it is at once when the
  // lane can no longer be mustered into (the plate named that lane; the sim drops the plate itself six seconds on)
  function honour(snap, lanes, cmds) {
    const L = lanes.find((q) => q.lane === pending.lane);
    if (!L) { pending = null; return; }
    const deck = shop(snap), lane = L.lane, x = L.ownFront, energy = snap.energy[team];
    const list = pending.cards.map((i) => deck[i]), bought = [];
    let left = energy * (1 - RESERVE);
    for (const c of list) if (afford(c.price, left)) { bought.push(c); left -= c.price; }
    if (!bought.length) { const c = list.reduce((a, b) => (b.price < a.price ? b : a)); if (afford(c.price, energy)) bought.push(c); }
    if (bought.length) { for (const c of bought) cmds.push(deploy(c, lane, x)); pending = null; }
    else if (snap.tick >= pending.at + WAVE_PATIENCE) pending = null;
  }

  // (5) THE CENTRE: no threat and no wave due - one card at x 4500 to the lane whose centre is not his and least defended; with
  // every centre his (the spec is silent) the best lane by advantage gets it at its next point, so the purse never idles
  function centre(lanes, deck, purse, send) {
    const open = attackable(lanes).filter((L) => !L.centreHeld).sort((a, b) => a.enemy - b.enemy || a.lane - b.lane)[0];
    const L = open || lanes.find((q) => q.lane === massLane(lanes));
    const c = answer(deck, L.top, purse.left);
    if (c) send(c, L.lane, open ? CP_X[CENTRE] : L.nextX);
  }

  // one look at the snapshot: the commands it earns, in the order of §8, over the lanes an order can be mustered into
  // (the surge alone reads all three: it is dragged onto bodies already standing, not mustered)
  function look(snap) {
    const cmds = [], all = readLanes(snap, team), lanes = all.filter((L) => L.musterable);
    if (!lanes.length) { pending = null; return cmds; }   // no stronghold of his stands: the doom is on him and the sim takes no order
    if (pending && snap.tick >= pending.at) honour(snap, lanes, cmds);
    if (snap.tick < nextLook && snap.tick < nextWave) return cmds;
    nextLook = snap.tick + every;
    const deck = shop(snap);
    const purse = { left: snap.energy[team] * (1 - RESERVE), sent: 0 };
    const send = (c, lane, x) => { cmds.push(deploy(c, lane, x)); purse.left -= c.price; purse.sent++; };
    if (!opened) { opened = true; purse.left = snap.energy[team]; opening(deck, purse, cmds, send); return cmds; }
    const weak = defend(snap, lanes, deck, purse, send);
    const waveDue = snap.tick >= nextWave, from = commitment(snap, lanes);
    if (!pending && (waveDue || from >= 0)) {
      announce(snap, lanes, deck, purse.left, from >= 0 ? punishLane(lanes, from) : massLane(lanes), cmds);
      nextWave = snap.tick + waveTicks;
      if (from >= 0) { answeredAt = snap.tick; seen[from].length = 0; }
    }
    const surge = surgeLane(snap, team, all);
    if (surge >= 0) cmds.push({ op: 'surge', team, lane: surge });
    if (!weak && !pending && !waveDue && purse.sent < burst) centre(lanes, deck, purse, send);
    return cmds;
  }

  return {
    team, look,
    get pending() { return pending; },
    // the clock and the verdict are the only reads outside the snapshot: they say when the next snapshot is due
    tick() {
      if (sim.result) return;
      const t = sim.tick;
      if (t < nextLook && t < nextWave && !(pending && t >= pending.at)) return;
      for (const c of look(sim.snapshot())) sim.queue(c);
    },
  };
}
