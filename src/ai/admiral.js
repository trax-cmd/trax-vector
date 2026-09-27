// admiral.js — THE ADMIRAL (v0.7). The machine's hand on a flagship's helm: every half second it flies the flagship to
// where its side's war is - the lane with the most of the fight, a little behind its own front, so the army launched out
// of it lands on the line - pulls it home to repair when the hull is under a third, and takes an upgrade whenever one is
// due. The east's commander is one; on the page ?a=bot makes the west's one too (and tools use it to fly both).
import { rng32 } from '../sim/rng.js';
import { BOON_IDS } from '../sim/sim.js';
import { GATE_X, KEEP_X, LANE_Y, laneOf } from '../sim/lanes.js';

const LOOK = 15;          // ticks between looks: half a second
const RETREAT = 0.3;      // hull share under which it flies home
const BEHIND = 160;       // how far behind its own vanguard it rides
const REACH = 700;        // it rides no further than this past its side's front: launched deep, an army lands in the enemy's mass
const STAY = 1.25;        // the lane it flies in must be beaten by a quarter before it changes lanes

export function createAdmiral(sim, team, opts = {}) {
  const rng = rng32((opts.seed || 1) * 7919 + team * 31);
  const fwd = team === 0 ? 1 : -1;
  const picks = opts.picks !== false;   // the person picks the west's upgrades on the page; the admiral picks them when it flies
  let nextLook = 0, boonAt = sim.o.boonEvery;

  // per lane: the side's bodies, the enemy's bodies, and the side's vanguard x (its body nearest the enemy)
  function read() {
    const U = sim.U, own = [0, 0, 0], foe = [0, 0, 0], van = [NaN, NaN, NaN];
    for (let i = 0; i < U.hi; i++) {
      if (!U.alive[i] || U.flag[i]) continue;
      const l = U.lane[i];
      if (U.team[i] === team) { own[l]++; if (Number.isNaN(van[l]) || (U.x[i] - van[l]) * fwd > 0) van[l] = U.x[i]; } else foe[l]++;
    }
    return { own, foe, van };
  }

  function look() {
    const f = sim.flags.i[team]; if (f < 0) return null;
    const U = sim.U, y = U.y[f], hull = U.hp[f] / sim.flagTop(team), lane0 = laneOf(y);
    if (hull < RETREAT) return { x: GATE_X[team] - fwd * 250, y: LANE_Y[lane0] };   // home to repair, in its own lane
    const { own, foe, van } = read();
    let lane = lane0, best = -1;
    for (let l = 0; l < 3; l++) { const s = (own[l] + foe[l] * 0.6) * (l === lane0 ? STAY : 1); if (s > best) { best = s; lane = l; } }
    const front = team === 0 ? sim.S.front.w[lane] : sim.S.front.e[lane];
    let x = Number.isNaN(van[lane]) ? front - fwd * 200 : van[lane] - fwd * BEHIND;
    x = team === 0 ? Math.max(KEEP_X[0] + 200, Math.min(front + REACH, x)) : Math.min(KEEP_X[1] - 200, Math.max(front - REACH, x));
    return { x, y: LANE_Y[lane] };
  }

  return {
    team,
    tick() {
      if (sim.result) return;
      if (picks && sim.time >= boonAt) { boonAt += sim.o.boonEvery; sim.queue({ op: 'boon', team, id: BOON_IDS[(rng() * BOON_IDS.length) | 0] }); }
      if (sim.S.tick < nextLook) return;
      nextLook = sim.S.tick + LOOK;
      const at = look(); if (at) sim.queue({ op: 'steer', team, x: at.x, y: at.y });
    },
  };
}
