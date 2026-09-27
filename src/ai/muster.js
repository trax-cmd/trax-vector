// muster.js — THE LAUNCH BAY (v0.7). A side's army is not dealt by hand any more: every second and a half the bay spends
// the purse on up to two battalions and launches them into the lane its flagship flies nearest - out of the flagship
// itself (sim.js THE CARRIER) - marching a little past it. It picks the card that beats what the enemy fields most in
// that lane (library.js LOSES), else the next card in the deck's turn. THE HOME GUARD: when the enemy pushes on this side of the field in a lane
// the flagship is not flying, every other battalion goes there from its gate, to hold the side's front (a first reading: the
// bay fed the flagship's lane alone and the captain walked through the two empty lanes to the gates while the flown side won every fight). While the flagship rebuilds, the bay sends from
// the gate of the lane it last flew in. The person's side and a flown side both use it; the commander's work is the helm.
import { LOSES } from '../sim/library.js';
import { GATE_X } from '../sim/lanes.js';

const EVERY = 45;         // ticks between launches: a second and a half
const BURST = 2;          // battalions a launch at most
const AHEAD = 350;        // the march goes this far past the flagship
const GUARD = 250;        // enemy energy on this side of the middle that calls the home guard

export function createMuster(sim, team) {
  const fwd = team === 0 ? 1 : -1;
  let next = 30, turn = 0, lastLane = 1, n = 0;   // n: battalions sent, so the home guard takes every other one

  // the lane the enemy pushes hardest on this side of the middle (its energy past the centre), -1 when none pushes past GUARD
  function threatened() {
    const U = sim.U, kinds = sim.kinds, e = [0, 0, 0];
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] !== team && !U.flag[i] && (U.x[i] - 4500) * fwd < 0) e[U.lane[i]] += kinds[U.kind[i]].cost;
    let lane = -1, most = GUARD; for (let l = 0; l < 3; l++) if (e[l] > most) { most = e[l]; lane = l; }
    return lane;
  }
  // the role the enemy fields most (by energy) in a lane, -1 when it fields none there
  function topRole(lane) {
    const U = sim.U, kinds = sim.kinds, e = [0, 0, 0, 0, 0, 0];
    for (let i = 0; i < U.hi; i++) if (U.alive[i] && U.team[i] !== team && U.lane[i] === lane && !U.flag[i]) { const k = kinds[U.kind[i]]; e[k.shape] += k.cost; }
    let top = -1, most = 0; for (let r = 0; r < 6; r++) if (e[r] > most) { most = e[r]; top = r; }
    return top;
  }

  return {
    team,
    tick() {
      const S = sim.S; if (sim.result || S.tick < next) return;
      next = S.tick + EVERY;
      const f = sim.flags.i[team], U = sim.U, deck = sim.decks[team];
      const lane = f >= 0 ? U.lane[f] : lastLane; lastLane = lane;
      const x = f >= 0 ? U.x[f] + fwd * AHEAD : GATE_X[1 - team];
      const guard = threatened();
      let purse = S.energy[team];
      for (let sent = 0; sent < BURST; sent++) {
        const home = n % 2 === 1 && guard >= 0 && guard !== lane, l = home ? guard : lane;
        const tx = home ? (team === 0 ? S.front.w[l] : S.front.e[l]) : x;
        const top = topRole(l), want = top >= 0 ? LOSES[top] : [];
        let pick = -1;
        for (let k = 0; k < deck.length; k++) {
          const i = (turn + k) % deck.length, p = sim.price(deck[i]);
          if (p > purse) continue;
          if (want.includes(deck[i].role)) { pick = i; break; }
          if (pick < 0) pick = i;
        }
        if (pick < 0) break;
        sim.queue({ op: 'deploy', team, batt: pick, lane: l, x: tx });
        purse -= sim.price(deck[pick]); turn = pick + 1; n++;
      }
    },
  };
}
