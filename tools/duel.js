// duel.js — THE JUDGE. Every battalion against every battalion at equal energy, alone in the centre lane with
// no stronghold in reach, until one side is dead or the clock runs. The results fold by role. The judge
// CONFIRMS first: pass 1 measures at the prices library.js carries, and when every promise of BEATS holds
// there it stops - a baked table is confirmed, never walked off its own prices. Only a broken promise sets
// it PRICING the roles: a role that wins on average pays more next pass, a role that loses pays less, until
// the table holds or --passes (the walk's ceiling, pass 1 included) runs out. Then THE ANSWER TO BLADE (§7):
// while no shape beats the diamond, its price rises a tenth a pass - fewer diamonds for the budget - until
// one does or the price cap stops it. Finally it prints the table it measured - which shape beats which at
// those prices - for library.js to carry (BEATS, ROLE_PRICE), so a card never promises what the field denies.
//   node tools/duel.js [--budget 1200] [--reps 2] [--clock 75] [--passes 1] [--verbose]
// The placement (placeDuel) is shared with trace.js: both lines muster through the lane op at their own gate
// of lane 1 (gates 1 and 6) and are carried into band 1 so their inner edges stand 450 either side of THE
// CENTRE - 900 between the lines, past every weapon's reach - with the strongholds at 1e9 hp.
import { pathToFileURL } from 'node:url';
import { createSim } from '../src/sim/sim.js';
import { BATTALIONS, ROLES, ROLE_GLYPH, BEATS, LOSES, ROLE_PRICE } from '../src/sim/library.js';
import { GATE_X, CP_X, CENTRE, clampY } from '../src/sim/lanes.js';

export const LANE = 1;          // the duel's lane: the centre one, its band centred on the field's middle
export const GAP = 450;         // each line's inner edge stands this far from THE CENTRE
const RANK_GAP = 60;            // world units between one battalion's rear and the next one's front
const BEATS_BY = 0.15;          // a shape beats another when it wins by more than this, both seats folded
const PRICE_FLOOR = 0.35, PRICE_CAP = 4;   // a role's price is walked inside these
const BLADE = 5, BLADE_STEP = 0.1;         // §7: the diamond's price rises a tenth a pass until a shape beats it

// muster both sides' lines (budget energy of battalion a on the west, b on the east) and carry them into place
export function placeDuel(sim, budget) {
  const T = sim.T;
  for (let t = 0; t < T.n; t++) T.hp[t] = 1e9;   // the strongholds stand like mountains: nothing here is about them
  const ca = sim.decks[0][0].cost, cb = sim.decks[1][0].cost;
  const na = Math.max(1, Math.round(budget / ca)), nb = Math.max(1, Math.round(budget / cb));
  for (let i = 0; i < na; i++) sim.apply({ op: 'deploy', team: 0, batt: 0, lane: LANE, x: GATE_X[1], free: true });   // an order at the enemy gate: the line marches east
  for (let i = 0; i < nb; i++) sim.apply({ op: 'deploy', team: 1, batt: 0, lane: LANE, x: GATE_X[0], free: true });   // and this one west
  carry(sim, 0, CP_X[CENTRE] - GAP);
  carry(sim, 1, CP_X[CENTRE] + GAP);
  return { na, nb, ca, cb };
}
// A side's battalions are carried to the centre and stood one behind another, the first's inner edge at `edge`,
// each keeping its own formation. Every muster forms on the same spot at the gate, so stacked as mustered the
// bodies of two line formations would sit exactly on one another and never separate.
function carry(sim, team, edge) {
  const U = sim.U, kinds = sim.kinds, away = team === 0 ? -1 : 1;   // the west's ranks stand toward smaller x, the east's toward larger
  const groups = new Map();
  for (let i = 0; i < U.hi; i++) {
    if (!U.alive[i] || U.team[i] !== team) continue;
    const g = groups.get(U.grp[i]) || { ids: [], lo: Infinity, hi: -Infinity };
    g.ids.push(i); g.lo = Math.min(g.lo, U.x[i]); g.hi = Math.max(g.hi, U.x[i]);
    groups.set(U.grp[i], g);
  }
  let front = edge;
  for (const g of groups.values()) {
    const shift = front - (team === 0 ? g.hi : g.lo);
    for (const i of g.ids) { U.x[i] += shift; U.y[i] = clampY(LANE, U.y[i], kinds[U.kind[i]].r); }
    front += away * (g.hi - g.lo + RANK_GAP);
  }
}

// one duel: battalion a (west) against battalion b (east), equal budgets at the given role prices; west's share of its
// starting hp left minus east's: +1 the west wins whole, -1 the east does
export function duel(a, b, seed, rolePrice, budget, clock) {
  const sim = createSim({ seed, decks: [[a], [b]], energy0: 1e9, rolePrice });
  const U = sim.U, kinds = sim.kinds;
  placeDuel(sim, budget);
  const hp0 = [0, 0]; for (let i = 0; i < U.hi; i++) if (U.alive[i]) hp0[U.team[i]] += kinds[U.kind[i]].hp;
  for (let t = 0, n = clock * 30; t < n; t++) { sim.step(); if (U.count[0] === 0 || U.count[1] === 0) break; }
  const hp = [0, 0]; for (let i = 0; i < U.hi; i++) if (U.alive[i]) hp[U.team[i]] += Math.min(U.hp[i], kinds[U.kind[i]].hp);
  return hp[0] / hp0[0] - hp[1] / hp0[1];
}

function main() {
  const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
  const BUDGET = +arg('budget', 1200), REPS = +arg('reps', 2), CLOCK = +arg('clock', 75), PASSES = +arg('passes', 1), VERBOSE = process.argv.includes('--verbose');

  // every pair both ways, folded by role: V[a][b] is how role a fares against role b, both seats averaged
  function pass(rolePrice) {
    const n = BATTALIONS.length;
    const M = Array.from({ length: n }, () => new Array(n).fill(0));
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      let s = 0; for (let r = 0; r < REPS; r++) s += duel(BATTALIONS[a], BATTALIONS[b], 100 + r * 7 + a * 31 + b, rolePrice, BUDGET, CLOCK);
      M[a][b] = s / REPS;
      if (VERBOSE) console.log(BATTALIONS[a].id.padEnd(15) + ' vs ' + BATTALIONS[b].id.padEnd(15) + (M[a][b] >= 0 ? ' +' : ' ') + M[a][b].toFixed(2));
    }
    const R = Array.from({ length: 6 }, () => new Array(6).fill(0)), C = Array.from({ length: 6 }, () => new Array(6).fill(0));
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { const ra = BATTALIONS[a].role, rb = BATTALIONS[b].role; R[ra][rb] += M[a][b]; C[ra][rb]++; R[rb][ra] -= M[a][b]; C[rb][ra]++; }
    const V = R.map((row, a) => row.map((v, b) => (C[a][b] ? v / C[a][b] : 0)));
    const avg = V.map((row, a) => row.reduce((s, v, b) => s + (a === b ? 0 : v), 0) / 5);
    return { V, avg };
  }

  const signed = (v) => (v >= 0 ? '+' : '') + v.toFixed(2);
  const prices = (rp) => rp.map((v) => v.toFixed(2)).join(' ');
  // the shapes that beat role r, strongest first - what its LOSES row will read
  const beatenBy = (V, r) => ROLES.map((_, a) => a).filter((a) => a !== r && V[a][r] > BEATS_BY).sort((p, q) => V[q][r] - V[p][r]);
  // THE PROMISE read off V: per role, each shape it claims to beat (> +BEATS_BY) and each that claims it (< -BEATS_BY)
  const promise = (V) => ROLES.map((_, a) => [
    ...BEATS[a].map((b) => ({ word: 'beats', b, v: V[a][b], ok: V[a][b] > BEATS_BY })),
    ...LOSES[a].map((b) => ({ word: 'loses', b, v: V[a][b], ok: V[a][b] < -BEATS_BY })),
  ]);
  const brokenIn = (V) => promise(V).flat().filter((c) => !c.ok).length;

  const t0 = Date.now();
  let rolePrice = ROLE_PRICE.slice(), V = null, avg = null;
  // pass 1 at the baked prices; the walk moves them only while a promise is broken, and never past its ceiling
  for (let p = 0; p < PASSES; p++) {
    ({ V, avg } = pass(rolePrice));
    const broken = brokenIn(V);
    console.log(`pass ${p + 1}: role strength ` + ROLES.map((r, i) => `${ROLE_GLYPH[i]} ${signed(avg[i])}`).join('  ') + `   prices ${prices(rolePrice)} · ${broken ? broken + ' broken' : 'the table holds'}`);
    if (!broken || p === PASSES - 1) break;
    rolePrice = rolePrice.map((v, i) => Math.max(PRICE_FLOOR, Math.min(PRICE_CAP, v * (1 + avg[i] / 2))));
  }
  // THE ANSWER TO BLADE (§7): the other prices stand; only the diamond's climbs, a tenth a pass, until a shape beats it
  for (let p = 1; !beatenBy(V, BLADE).length && rolePrice[BLADE] + BLADE_STEP <= PRICE_CAP; p++) {
    rolePrice[BLADE] = +(rolePrice[BLADE] + BLADE_STEP).toFixed(2);
    ({ V, avg } = pass(rolePrice));
    console.log(`blade pass ${p}: ◆ at ${rolePrice[BLADE].toFixed(2)} · against it ` + ROLES.map((r, a) => (a === BLADE ? null : `${ROLE_GLYPH[a]} ${signed(V[a][BLADE])}`)).filter(Boolean).join('  '));
  }
  const answer = beatenBy(V, BLADE);
  console.log(answer.length ? `THE ANSWER TO BLADE: ${answer.map((a) => `${ROLE_GLYPH[a]} ${ROLES[a]} ${signed(V[a][BLADE])}`).join(' · ')} at ◆ ${rolePrice[BLADE].toFixed(2)}` : `NO ANSWER TO BLADE: nothing beats it by ${BEATS_BY} with its price at the cap ${PRICE_CAP}`);
  console.log('\nTHE ROLE MATRIX (row against column, +1 the row wins whole; both seats folded) at prices ' + prices(rolePrice));
  console.log('          ' + ROLES.map((r) => r.padStart(8)).join(''));
  for (let a = 0; a < 6; a++) console.log((ROLE_GLYPH[a] + ' ' + ROLES[a]).padEnd(10) + ROLES.map((_, b) => (a === b ? '     ·  ' : signed(V[a][b]).padStart(8))).join(''));
  console.log(`\nTHE PROMISE (library.js BEATS): a shape should beat the two it claims (> +${BEATS_BY}), lose to the two that claim it (< -${BEATS_BY})`);
  promise(V).forEach((claims, a) => console.log((ROLE_GLYPH[a] + ' ' + ROLES[a]).padEnd(10) + (claims.map((c) => `${c.word} ${ROLE_GLYPH[c.b]} ${signed(c.v)} ${c.ok ? 'ok' : 'BROKEN'}`).join(' · ') || 'claims nothing')));
  const broken = brokenIn(V), baked = rolePrice.every((v, i) => v === ROLE_PRICE[i]);
  const measured = ROLES.map((_, a) => ROLES.map((_, b) => b).filter((b) => b !== a && V[a][b] > BEATS_BY).sort((p, q) => V[a][q] - V[a][p]));
  console.log('\n' + (broken ? broken + ' promise(s) BROKEN' : `THE TABLE HOLDS at the ${baked ? 'baked' : 'walked'} prices`) + ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
  console.log('MEASURED BEATS = ' + JSON.stringify(measured) + '   ROLE_PRICE = ' + JSON.stringify(rolePrice.map((v) => +v.toFixed(2))) + '   (LOSES follows: ' + ROLES.map((_, r) => ROLE_GLYPH[r] + ' ' + (beatenBy(V, r).map((a) => ROLE_GLYPH[a]).join('') || '—')).join(' ') + ')');
}

// the judge sits only when this file is the script run; trace.js imports the placement and sits its own bench
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main();
