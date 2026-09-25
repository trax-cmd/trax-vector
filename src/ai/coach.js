// coach.js — THE COACH, as a function. From the field and a snapshot it returns the one next thing: what
// kind of move, where, against which shape, with which shapes, a LABEL of a few words and the reason in
// one clause. The glass makes the card glow and marks the place; the coached player (ai/coached.js) makes
// the move. One advice, two readers, so a person who follows the glow is playing exactly the policy the
// tempers were measured against.
import { ROLES, ROLE_GLYPH, BEATS } from '../sim/library.js';

const g = (q) => ROLE_GLYPH[q];
const ans = (qs) => qs.map((q) => g(q)).join(' ');

export function advise(sim, team, snap) {
  if (sim.result || !snap) return null;
  const me = team, them = 1 - team, e = sim.energy[me], o = sim.o;
  const mine = snap.towers.filter((t) => t.team === me && t.alive);
  const theirs = snap.towers.filter((t) => t.team !== me && t.alive);
  if (!mine.length || !theirs.length) return null;
  const nearMine = (list) => { let b = null, bd = Infinity; for (const w of list) for (const t of mine) { const dx = w.x - t.x, dy = w.y - t.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; b = w; } } return b; };
  const myWells = snap.wells.filter((w) => w.owner === me), openWells = snap.wells.filter((w) => w.owner < 0), theirWells = snap.wells.filter((w) => w.owner === them);
  const f = snap.fielded[them]; let top = -1, tv = 0; for (let q = 0; q < 6; q++) if (f[q] > tv) { tv = f[q]; top = q; }
  const answers = top >= 0 ? [0, 1, 2, 3, 4, 5].filter((q) => BEATS[q].includes(top)) : [];
  const enemyOn = (w) => (me === 0 ? w.east : w.west), myOn = (w) => (me === 0 ? w.west : w.east);
  const income = Math.round(sim.income[me]);
  // 1. a stronghold or a well of mine under attack
  const hotT = mine.slice().sort((a, b) => b.threat - a.threat)[0];
  if (hotT && hotT.threat > 120) return { kind: 'hold', target: hotT.i, role: top, answers, label: 'HOLD YOUR STRONGHOLD', why: top >= 0 ? `they bring ${g(top)} · ${ans(answers)} beats it` : 'they are at your gate' };
  const hotW = myWells.filter((w) => enemyOn(w) > 80).sort((a, b) => enemyOn(b) - enemyOn(a))[0];
  if (hotW) return { kind: 'hold', target: 1000 + hotW.i, role: top, answers, label: 'HOLD YOUR WELL', why: top >= 0 ? `they bring ${g(top)} · ${ans(answers)} beats it` : 'they are on it' };
  // 2. the opening
  const marching = snap.wells.filter((w) => w.owner !== me && myOn(w) > 0);
  if (sim.S.stats.musters[me] === 0) { const w = nearMine(openWells); return { kind: 'first', target: w ? 1000 + w.i : theirs[0].i, role: -1, answers: [], label: 'TAP THE GLOWING CARD', why: `it marches to the marked well · wells pay energy, +${o.wellIncome}/s each` }; }
  if (myWells.length === 0) { const w = nearMine(openWells.filter((q) => !marching.includes(q))) || nearMine(openWells); return { kind: 'claim', target: w ? 1000 + w.i : theirs[0].i, role: -1, answers: [], label: 'CLAIM ANOTHER WELL', why: `your first battalion is marching · a well turns ${me === 0 ? 'cyan' : 'red'} when you stand on it` }; }
  // 3. claim while there is room
  if (myWells.length < 5 && openWells.length) { const w = nearMine(openWells.filter((q) => !marching.includes(q))) || nearMine(openWells); return { kind: 'claim', target: 1000 + w.i, role: -1, answers: [], label: 'CLAIM THE MARKED WELL', why: `${myWells.length} well${myWells.length > 1 ? 's' : ''} · +${income}/s · more wells, more energy` }; }
  // 4. a fort when the purse allows and a quiet well waits
  const quiet = myWells.filter((w) => !w.fort && enemyOn(w) < 40);
  const forts = myWells.filter((w) => w.fort).length;
  if (e >= o.fortifyCost && quiet.length && forts < Math.max(1, myWells.length >> 1)) { const w = nearMine(quiet); return { kind: 'fortify', target: 1000 + w.i, role: -1, answers: [], label: 'FORTIFY THE MARKED WELL', why: `tap the well, then FORTIFY · a warden guards it, it pays +${o.wellIncome + o.fortifyBonus}/s` }; }
  // 5. what they field, answered where it stands - the enemy well nearest my line, or their weakest stronghold
  const weak = theirs.slice().sort((a, b) => a.hp - b.hp)[0];
  if (top >= 0 && tv > 0) { const w = nearMine(theirWells); return { kind: 'answer', target: w ? 1000 + w.i : weak.i, role: top, answers, label: `ANSWER ${g(top)} WITH ${ans(answers)}`, why: `they field ${g(top)} ${ROLES[top]} · ${ans(answers)} beats it · the glowing card goes to the mark` }; }
  if (theirWells.length > myWells.length) { const w = nearMine(theirWells); return { kind: 'take', target: 1000 + w.i, role: -1, answers: [], label: 'TAKE THEIR WELL', why: `they hold ${theirWells.length} wells to your ${myWells.length}` }; }
  return { kind: 'push', target: weak.i, role: top, answers, label: 'BREAK THEIR STRONGHOLD', why: `${myWells.length} wells · +${income}/s · hold a card to pour on the mark` };
}
