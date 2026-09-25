// duel.js — THE JUDGE. Every battalion against every battalion at equal energy, alone on the field with
// no stronghold in reach, until one side is dead or the clock runs. The results fold by role. Then the
// judge PRICES the roles: a role that wins on average pays more next pass, a role that loses pays less,
// until every role is worth its cost (--passes). Finally it writes the table it measured - which shape
// beats which at those prices - for library.js to carry, so a card never promises what the field denies.
//   node tools/duel.js [--budget 1200] [--reps 2] [--clock 75] [--passes 1] [--verbose]
import { createSim } from '../src/sim/sim.js';
import { BATTALIONS, ROLES, ROLE_GLYPH, BEATS, LOSES, ROLE_PRICE } from '../src/sim/library.js';

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const BUDGET = +arg('budget', 1200), REPS = +arg('reps', 2), CLOCK = +arg('clock', 75), PASSES = +arg('passes', 1), VERBOSE = process.argv.includes('--verbose');

// one duel: battalion a (west) against battalion b (east), equal budgets at the given role prices; west's share left minus east's
function duel(a, b, seed, rolePrice) {
  const sim = createSim({ seed, decks: [[a], [b]], energy0: 1e9, rolePrice });
  const T = sim.T, U = sim.U;
  for (let t = 0; t < T.n; t++) { T.hp[t] = 1e9; }
  const ca = sim.decks[0][0].cost, cb = sim.decks[1][0].cost;
  const na = Math.max(1, Math.round(BUDGET / ca)), nb = Math.max(1, Math.round(BUDGET / cb));
  const midW = sim.WL.x.map((x, i) => [Math.abs(x - sim.o.W * 0.29), i]).sort((p, q) => p[0] - q[0])[0][1];
  const midE = sim.WL.x.map((x, i) => [Math.abs(x - sim.o.W * 0.71), i]).sort((p, q) => p[0] - q[0])[0][1];
  for (let i = 0; i < na; i++) sim.apply({ op: 'deploy', team: 0, tower: 2, batt: 0, goal: 1000 + midE, free: true });
  for (let i = 0; i < nb; i++) sim.apply({ op: 'deploy', team: 1, tower: 7, batt: 0, goal: 1000 + midW, free: true });
  // each muster is carried to the centre and pushed back so its inner edge stands 450 from the middle: 900 between the lines, past every weapon's reach
  const cx = sim.o.W / 2, cy = sim.o.H / 2;
  let inW = -Infinity, inE = Infinity;
  for (let i = 0; i < U.hi; i++) { if (!U.alive[i]) continue; if (U.team[i] === 0) { U.x[i] = cx + (U.x[i] - T.x[2]); U.y[i] = cy + (U.y[i] - T.y[2]) * 0.5; inW = Math.max(inW, U.x[i]); } else { U.x[i] = cx + (U.x[i] - T.x[7]); U.y[i] = cy + (U.y[i] - T.y[7]) * 0.5; inE = Math.min(inE, U.x[i]); } }
  for (let i = 0; i < U.hi; i++) { if (!U.alive[i]) continue; if (U.team[i] === 0) U.x[i] += (cx - 450) - inW; else U.x[i] += (cx + 450) - inE; }
  const hp0 = [0, 0]; for (let i = 0; i < U.hi; i++) if (U.alive[i]) hp0[U.team[i]] += sim.kinds[U.kind[i]].hp;
  const ticks = CLOCK * 30;
  for (let t = 0; t < ticks; t++) { sim.step(); if (U.count[0] === 0 || U.count[1] === 0) break; }
  const hp = [0, 0]; for (let i = 0; i < U.hi; i++) if (U.alive[i]) hp[U.team[i]] += Math.min(U.hp[i], sim.kinds[U.kind[i]].hp);
  return hp[0] / hp0[0] - hp[1] / hp0[1];
}

function pass(rolePrice) {
  const n = BATTALIONS.length;
  const M = Array.from({ length: n }, () => new Array(n).fill(0));
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
    let s = 0; for (let r = 0; r < REPS; r++) s += duel(BATTALIONS[a], BATTALIONS[b], 100 + r * 7 + a * 31 + b, rolePrice);
    M[a][b] = s / REPS;
    if (VERBOSE) console.log(BATTALIONS[a].id.padEnd(15) + ' vs ' + BATTALIONS[b].id.padEnd(15) + (M[a][b] >= 0 ? ' +' : ' ') + M[a][b].toFixed(2));
  }
  const R = Array.from({ length: 6 }, () => new Array(6).fill(0)), C = Array.from({ length: 6 }, () => new Array(6).fill(0));
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) { const ra = BATTALIONS[a].role, rb = BATTALIONS[b].role; R[ra][rb] += M[a][b]; C[ra][rb]++; R[rb][ra] -= M[a][b]; C[rb][ra]++; }
  const V = R.map((row, a) => row.map((v, b) => (C[a][b] ? v / C[a][b] : 0)));
  const avg = V.map((row, a) => row.reduce((s, v, b) => s + (a === b ? 0 : v), 0) / 5);
  return { V, avg };
}

const t0 = Date.now();
let rolePrice = ROLE_PRICE.slice(), V = null, avg = null;
for (let p = 0; p < PASSES; p++) {
  ({ V, avg } = pass(rolePrice));
  console.log(`pass ${p + 1}: role strength ` + ROLES.map((r, i) => `${ROLE_GLYPH[i]} ${avg[i] >= 0 ? '+' : ''}${avg[i].toFixed(2)}`).join('  ') + `   prices ${rolePrice.map((v) => v.toFixed(2)).join(' ')}`);
  if (p < PASSES - 1) rolePrice = rolePrice.map((v, i) => Math.max(0.35, Math.min(4, v * (1 + avg[i] / 2))));
}
console.log('\nTHE ROLE MATRIX (row against column, +1 the row wins whole; both seats folded) at prices ' + rolePrice.map((v) => v.toFixed(2)).join(' '));
console.log('          ' + ROLES.map((r) => r.padStart(8)).join(''));
for (let a = 0; a < 6; a++) console.log((ROLE_GLYPH[a] + ' ' + ROLES[a]).padEnd(10) + ROLES.map((_, b) => (a === b ? '     ·  ' : (V[a][b] >= 0 ? '+' : '') + V[a][b].toFixed(2).padStart(7))).join(''));
console.log('\nTHE PROMISE (library.js BEATS): a shape should beat the two it claims (> +0.15), lose to the two that claim it (< -0.15)');
let broken = 0;
for (let a = 0; a < 6; a++) {
  const line = [];
  for (const b of BEATS[a]) { const v = V[a][b]; const ok = v > 0.15; if (!ok) broken++; line.push(`beats ${ROLE_GLYPH[b]} ${v >= 0 ? '+' : ''}${v.toFixed(2)} ${ok ? 'ok' : 'BROKEN'}`); }
  for (const b of LOSES[a]) { const v = V[a][b]; const ok = v < -0.15; if (!ok) broken++; line.push(`loses ${ROLE_GLYPH[b]} ${v >= 0 ? '+' : ''}${v.toFixed(2)} ${ok ? 'ok' : 'BROKEN'}`); }
  console.log((ROLE_GLYPH[a] + ' ' + ROLES[a]).padEnd(10) + line.join(' · '));
}
const measured = ROLES.map((_, a) => ROLES.map((_, b) => b).filter((b) => b !== a && V[a][b] > 0.15).sort((p, q) => V[a][q] - V[a][p]));
console.log('\n' + (broken ? broken + ' promise(s) BROKEN' : 'THE TABLE HOLDS') + ' · ' + ((Date.now() - t0) / 1000).toFixed(0) + ' s');
console.log('MEASURED BEATS = ' + JSON.stringify(measured) + '   ROLE_PRICE = ' + JSON.stringify(rolePrice.map((v) => +v.toFixed(2))));
