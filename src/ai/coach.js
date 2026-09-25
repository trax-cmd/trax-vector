// coach.js — THE COACH, as a function. From the field and a snapshot it returns the one next thing: what
// kind of move, where, against which shape, with which shapes, and the sentence that says it. The glass
// prints the sentence; the coached player (ai/coached.js) makes the move. One advice, two readers, so a
// person who follows the coach is playing exactly the policy the tempers were measured against.
import { ROLES, ROLE_GLYPH, BEATS } from '../sim/library.js';

const g = (q) => ROLE_GLYPH[q];
const say = (qs) => qs.map((q) => g(q) + ' ' + ROLES[q]).join(' OR ');

export function advise(sim, team, snap) {
  if (sim.result || !snap) return null;
  const me = team, them = 1 - team, WL = sim.WL, e = sim.energy[me], o = sim.o;
  const mine = snap.towers.filter((t) => t.team === me && t.alive);
  const theirs = snap.towers.filter((t) => t.team !== me && t.alive);
  if (!mine.length || !theirs.length) return null;
  const near = (list, to) => { let b = null, bd = Infinity; for (const t of list) { const dx = t.x - to.x, dy = t.y - to.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; b = t; } } return b; };
  const nearMine = (list) => { let b = null, bd = Infinity; for (const w of list) for (const t of mine) { const dx = w.x - t.x, dy = w.y - t.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; b = w; } } return b; };
  const myWells = snap.wells.filter((w) => w.owner === me), openWells = snap.wells.filter((w) => w.owner < 0), theirWells = snap.wells.filter((w) => w.owner === them);
  const f = snap.fielded[them]; let top = -1, tv = 0; for (let q = 0; q < 6; q++) if (f[q] > tv) { tv = f[q]; top = q; }
  const answers = top >= 0 ? [0, 1, 2, 3, 4, 5].filter((q) => BEATS[q].includes(top)) : [];
  const enemyOn = (w) => (me === 0 ? w.east : w.west), myOn = (w) => (me === 0 ? w.west : w.east);
  // 1. a stronghold or a well of mine under attack
  const hotT = mine.slice().sort((a, b) => b.threat - a.threat)[0];
  if (hotT && hotT.threat > 120) return { kind: 'hold', target: hotT.i, role: top, answers, text: `THEY ARE AT YOUR STRONGHOLD WITH ${top >= 0 ? g(top) : '?'} — MUSTER ${answers.length ? say(answers) : 'WHAT YOU HAVE'} THERE (TAP IT, THEN A CARD)` };
  const hotW = myWells.filter((w) => enemyOn(w) > 80).sort((a, b) => enemyOn(b) - enemyOn(a))[0];
  if (hotW) return { kind: 'hold', target: 1000 + hotW.i, role: top, answers, text: `THEY ARE ON YOUR WELL WITH ${top >= 0 ? g(top) : '?'} — MUSTER ${answers.length ? say(answers) : 'WHAT YOU HAVE'} THERE (TAP THE WELL, THEN A CARD)` };
  // 2. the opening
  const marching = snap.wells.filter((w) => w.owner !== me && myOn(w) > 0);
  if (sim.S.stats.musters[me] === 0) { const w = nearMine(openWells); return { kind: 'first', target: w ? 1000 + w.i : theirs[0].i, role: -1, answers: [], text: `TAP A CARD — THE BATTALION GOES TO THE NEAREST WELL · EVERY WELL YOU HOLD PAYS +${o.wellIncome}/s` }; }
  if (myWells.length === 0) { const w = nearMine(openWells.filter((q) => !marching.includes(q))) || nearMine(openWells); return { kind: 'claim', target: w ? 1000 + w.i : theirs[0].i, role: -1, answers: [], text: `YOUR FIRST BATTALION IS MARCHING TO A WELL — STAND ON IT AND IT TURNS ${me === 0 ? 'CYAN' : 'RED'} · TAP MORE CARDS FOR MORE WELLS` }; }
  // 3. claim while there is room
  if (myWells.length < 5 && openWells.length) { const w = nearMine(openWells.filter((q) => !marching.includes(q))) || nearMine(openWells); return { kind: 'claim', target: 1000 + w.i, role: -1, answers: [], text: `${myWells.length} WELL${myWells.length > 1 ? 'S' : ''} · +${Math.round(sim.income[me])}/s — CLAIM MORE: TAP A CARD (IT GOES TO THE NEAREST OPEN WELL)` }; }
  // 4. a fort when the purse allows and a quiet well waits
  const quiet = myWells.filter((w) => !w.fort && enemyOn(w) < 40);
  const forts = myWells.filter((w) => w.fort).length;
  if (e >= o.fortifyCost && quiet.length && forts < Math.max(1, myWells.length >> 1)) { const w = nearMine(quiet); return { kind: 'fortify', target: 1000 + w.i, role: -1, answers: [], text: `TAP A WELL OF YOURS, THEN FORTIFY — A WARDEN GUARDS IT AND IT PAYS +${o.wellIncome + o.fortifyBonus}/s` }; }
  // 5. what they field, answered where it stands - the enemy well nearest my line, or their weakest stronghold
  const weak = theirs.slice().sort((a, b) => a.hp - b.hp)[0];
  if (top >= 0 && tv > 0) { const w = nearMine(theirWells); return { kind: 'answer', target: w ? 1000 + w.i : weak.i, role: top, answers, text: `THEY FIELD ${g(top)} ${ROLES[top]} — ANSWER WITH ${say(answers)} · TAP THEIR WELL OR STRONGHOLD TO AIM` }; }
  if (theirWells.length > myWells.length) { const w = nearMine(theirWells); return { kind: 'take', target: 1000 + w.i, role: -1, answers: [], text: `THEY HOLD MORE WELLS (${theirWells.length} TO ${myWells.length}) — TAP ONE OF THEIRS, THEN A CARD, AND TAKE IT` }; }
  return { kind: 'push', target: weak.i, role: top, answers, text: `${myWells.length} WELLS · +${Math.round(sim.income[me])}/s — TAP THEIR WEAKEST STRONGHOLD, THEN POUR (HOLD A CARD)` };
}
