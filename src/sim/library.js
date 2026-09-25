// library.js — THE FIRST ROSTER, THE ROLES, THE BATTALIONS, THE DRAFT AND THE WORDS.
// The bodies are written by hand so the grammar has voices before the generator has a thousand. Above
// them sit the six ROLES - one per shape, so the strategic language is the visual one: a triangle IS a
// striker - and the BATTALIONS, formations of bodies that are what a commander actually deploys.
// The counter table and the role prices are what the duel tool (tools/duel.js) measured, baked as it
// printed them, so a card never promises what the field denies. The words at the end (a role's job, a
// battalion's line, the waves' names, the supers) are what the cards, the banner and the plates print,
// so every glass says the same thing.
import { rng32 } from './rng.js';
import { FAMILIES, MOVES, WEAPONS, TRAITS } from './units.js';

export const LIBRARY = [
  // ORBS - light, fast, many: THE SWARM
  { id: 'MOTE',   family: 'orb', r: 6,  hp: 12, speed: 330, move: 'swarm',  weapon: 'bolt', w: { dmg: 3.5, rate: 3.4, range: 180 }, tags: ['swarm', 'cheap'] },
  { id: 'SPARK',  family: 'orb', hp: 28, speed: 300, move: 'zigzag', weapon: 'bolt', w: { dmg: 5, rate: 4, range: 240, count: 2, spread: 0.12 }, tags: ['swarm'] },
  { id: 'BLOOM',  family: 'orb', r: 12, hp: 44, speed: 180, move: 'march',  weapon: 'bolt', w: { dmg: 6, rate: 2, range: 220 }, traits: ['split'], split: 'MOTE', splitN: 4, tags: ['swarm', 'split'] },
  { id: 'WISP',   family: 'orb', hp: 18, speed: 210, move: 'phase',  weapon: 'arc',  w: { dmg: 6, rate: 1.4, range: 200, hops: 2 }, tags: ['harass'] },
  // SQUARES - the weight: THE ARMOR
  { id: 'BLOCK',    family: 'square', hp: 170, speed: 95,  move: 'march', weapon: 'missile', w: { dmg: 14, rate: 0.7, range: 380, splash: 60, turn: 2.5 }, tags: ['tank', 'splash'] },
  { id: 'BASTION',  family: 'square', r: 19, hp: 230, speed: 75, move: 'march', weapon: 'pulse', w: { dmg: 18, rate: 0.9, range: 130 }, traits: ['shield'], shield: 160, tags: ['tank', 'shield', 'antiswarm'] },
  { id: 'SLAB',     family: 'square', r: 24, hp: 340, speed: 60, move: 'march', weapon: 'mine', w: { dmg: 70, rate: 0.4, range: 110, trigger: 50 }, traits: ['regen'], tags: ['tank', 'zone'] },
  // TRIANGLES - the strike: THE STRIKE
  { id: 'DART',   family: 'tri', hp: 42, speed: 290, move: 'hop',    weapon: 'beam', w: { dmg: 18, rate: 2.6, range: 300 }, tags: ['strike'] },
  { id: 'TALON',  family: 'tri', r: 14, hp: 62, speed: 240, move: 'zigzag', weapon: 'arc', w: { dmg: 10, rate: 1.5, range: 250, hops: 4, hopRange: 170 }, tags: ['strike', 'antiswarm'] },
  { id: 'SHARD',  family: 'tri', r: 9,  hp: 14, speed: 360, move: 'march',  weapon: 'bolt', w: { dmg: 2, rate: 1, range: 90 }, traits: ['kamikaze'], cost: 15, tags: ['suicide', 'cheap'] },
  // HEXAGONS - the artillery and the hives: THE SIEGE
  { id: 'HIVE',      family: 'hex', hp: 140, speed: 65, move: 'hold',  weapon: 'spawn',   w: { child: 'MOTE', count: 3, rate: 0.25, range: 500 }, tags: ['carrier', 'swarm'] },
  { id: 'ORDNANCE',  family: 'hex', r: 22, hp: 150, speed: 65, move: 'march', weapon: 'missile', w: { dmg: 60, rate: 0.5, range: 720, minRange: 300, speed: 340, splash: 55, turn: 1.6 }, tags: ['artillery', 'splash'] },
  { id: 'CANNON',    family: 'hex', r: 21, hp: 140, speed: 70, move: 'march', weapon: 'beam',    w: { dmg: 60, rate: 0.6, range: 620, minRange: 270, pierce: 3 }, tags: ['artillery', 'line'] },
  // RINGS - the field: THE FIELD
  { id: 'HALO',      family: 'ring', hp: 90,  speed: 130, move: 'orbit', weapon: 'aura',  w: { dmg: 9, range: 190 }, traits: ['regen'], tags: ['support', 'heal'] },
  { id: 'NULL',      family: 'ring', hp: 100, speed: 120, move: 'orbit', weapon: 'pulse', w: { dmg: 6, rate: 0.6, range: 170 }, traits: ['emp'], tags: ['support', 'stun'] },
  { id: 'COIL',      family: 'ring', hp: 110, speed: 100, move: 'march', weapon: 'arc',   w: { dmg: 12, rate: 1.1, range: 320, hops: 5, hopRange: 180, decay: 0.8 }, tags: ['antiswarm'] },
  { id: 'LODESTONE', family: 'ring', r: 18, hp: 140, speed: 95, move: 'march', weapon: 'pulse', w: { dmg: 20, rate: 0.75, range: 150 }, traits: ['magnet'], tags: ['zone', 'antiswarm'] },
  // DIAMONDS - the blades: THE BLADE
  { id: 'NEEDLE', family: 'diamond', hp: 34, speed: 330, move: 'phase', weapon: 'beam', w: { dmg: 42, rate: 1.3, range: 270 }, traits: ['cloak'], tags: ['assassin'] },
  { id: 'PRISM',  family: 'diamond', r: 14, hp: 74, speed: 210, move: 'orbit', weapon: 'beam', w: { dmg: 17, rate: 2, range: 350, pierce: 3 }, tags: ['strike', 'line'] },
];

// THE ROLES: one per shape. This is the whole strategy a player needs to read the field: shape against
// shape. THE TABLE IS MEASURED, NOT PROMISED: tools/duel.js fights every battalion against every other at
// the role prices below and writes BEATS from what it saw - a shape beats another it wins against by more
// than 0.15, both seats folded. The judge's reading of 2026-09-25 on the lane field (the two lines alone in
// the centre lane, 900 apart at THE CENTRE, the strongholds out of the fight; two duels a pair, 1,200 energy
// a side, --passes 3), which a second run on the same bytes repeated to the digit:
//   ● beats ◆ +0.23 ◯ +0.18 · ■ beats ● +0.49 ◆ +0.26 ▲ +0.22 · ▲ beats ◆ +0.26 ⬢ +0.16 · ◯ beats ■ +0.16 · ◆ beats ◯ +0.33
//   ⬢ beats no shape by the margin (its best ◆ +0.10, ◯ +0.09): the long guns' trade is the strongholds, which take
//   their shots whole (sim.js THE WALL) and which the judge keeps out of the fight.
// At the heart a three-way cycle - squares beat orbs, orbs beat rings, rings beat squares - with the triangle
// hunting hexagons, and the diamond, which hunts rings, answered by the orb, the square and the triangle.
export const ROLES = ['SWARM', 'ARMOR', 'STRIKE', 'SIEGE', 'FIELD', 'BLADE'];   // in FAMILIES order: orb, square, tri, hex, ring, diamond
export const ROLE_GLYPH = ['●', '■', '▲', '⬢', '◯', '◆'];
export const ROLE_JOB = ['cheap, many', 'slow wall', 'fast divers', 'long guns', 'stun & heal', 'cloak hunters'];   // a role's job in ≤ 13 characters: the card's third row
/* THE GATE BREAKER: the role whose shots land WHOLE on a gate (sim.js THE WALL: every other shot does a tenth, a surging lane on its own gate excepted) -
   the SIEGE shape beats no shape by the judge, it beats strongholds; the card, the hold banner and the coach say so through this one constant */
export const GATE_BREAKER = 3;
export const SUPER_NAMES = ['OVERDRIVE', 'BULWARK', 'BLINK', 'BARRAGE', 'NOVA', 'EXECUTE'];   // what a surge does to each shape (sim.js fireSurge); the plate prints the lane's top role's
export const BEATS = [[5, 4], [0, 5, 2], [5, 3], [], [1], [4]];   // role r beats BEATS[r], strongest first - the judge's reading, see above
// LOSES is derived, never written: the roles that beat r, so the green row of one card and the red row of another cannot disagree
export const LOSES = ROLES.map((_, r) => ROLES.map((_, q) => q).filter((q) => BEATS[q].includes(r)));
export const roleOf = (family) => FAMILIES.indexOf(family);

// THE BATTALIONS: what a commander deploys. A formation of bodies with a role and a shape on the field.
export const FORMS = ['line', 'column', 'wedge', 'ring', 'cloud'];
export const BATTALIONS = [
  { id: 'MOTE CLOUD',     role: 0, form: 'cloud',  units: [['MOTE', 18]] },
  { id: 'SPARK WING',     role: 0, form: 'wedge',  units: [['SPARK', 8]] },
  { id: 'BLOOM LINE',     role: 0, form: 'line',   units: [['BLOOM', 5], ['MOTE', 6]] },
  { id: 'PHALANX',        role: 1, form: 'line',   units: [['BLOCK', 4], ['HALO', 1]] },
  { id: 'BASTION WALL',   role: 1, form: 'line',   units: [['BASTION', 3], ['BLOCK', 2]] },
  { id: 'SLAB TRAIN',     role: 1, form: 'column', units: [['SLAB', 2], ['BLOCK', 2]] },
  { id: 'LANCE',          role: 2, form: 'wedge',  units: [['DART', 6]] },
  { id: 'TALON STORM',    role: 2, form: 'cloud',  units: [['TALON', 4], ['DART', 3]] },
  { id: 'SHARD RAIN',     role: 2, form: 'cloud',  units: [['SHARD', 14]] },
  { id: 'SIEGE TRAIN',    role: 3, form: 'column', units: [['ORDNANCE', 3], ['CANNON', 1]] },
  { id: 'CANNON LINE',    role: 3, form: 'line',   units: [['CANNON', 3], ['HIVE', 1]] },
  { id: 'HIVE MOTHER',    role: 3, form: 'column', units: [['HIVE', 2], ['ORDNANCE', 1]] },
  { id: 'NULL FIELD',     role: 4, form: 'ring',   units: [['NULL', 3], ['HALO', 2]] },
  { id: 'LODESTONE RING', role: 4, form: 'ring',   units: [['LODESTONE', 3], ['NULL', 1]] },
  { id: 'COIL BATTERY',   role: 4, form: 'line',   units: [['COIL', 3], ['HALO', 1]] },
  { id: 'NEEDLE PACK',    role: 5, form: 'cloud',  units: [['NEEDLE', 6]] },
  { id: 'PRISM LINE',     role: 5, form: 'line',   units: [['PRISM', 4], ['NEEDLE', 2]] },
];
// A battalion's own line, ≤ 26 characters, under the banner while its card is held.
export const BATT_LINE = {
  'MOTE CLOUD': 'eighteen motes, a cloud', 'SPARK WING': 'eight twin-shot orbs', 'BLOOM LINE': 'blooms split into motes',
  'PHALANX': 'four blocks and a healer', 'BASTION WALL': 'shielded pulse wall', 'SLAB TRAIN': 'mine-laying slabs',
  'LANCE': 'six beam darts', 'TALON STORM': 'chain-lightning divers', 'SHARD RAIN': 'fourteen suicide shards',
  'SIEGE TRAIN': 'three mortars, one cannon', 'CANNON LINE': 'piercing cannons, a hive', 'HIVE MOTHER': 'hives that bear motes',
  'NULL FIELD': 'stun pulses and healers', 'LODESTONE RING': 'magnets that drag swarms', 'COIL BATTERY': 'lightning batteries',
  'NEEDLE PACK': 'cloaked assassins', 'PRISM LINE': 'piercing beams, cloaked',
};
// THE WAVES BY NAME: the captain's waves are announced three seconds ahead; the name is the wave's top role's, four per role, cycled by the wave number.
export const WAVE_NAMES = [
  ['THE LOCUST HOUR', 'THE GLASS RAIN', 'THE MOTE STORM', 'THE THOUSAND'],    // ● SWARM
  ['THE IRON TIDE', 'THE WALL WALKS', 'THE SLAB CHOIR', 'THE ANVIL'],         // ■ ARMOR
  ['THE SPEARHEAD', 'THE KNIFE HOUR', 'THE LANCE', 'THE DIVE'],               // ▲ STRIKE
  ['THE THUNDER LINE', 'THE LONG GUNS', 'THE HIVE MOTHER', 'THE BOMBARD'],    // ⬢ SIEGE
  ['THE NULL CHOIR', 'THE HALO', 'THE STILL FIELD', 'THE LODESTONE'],         // ◯ FIELD
  ['THE KNIVES', 'THE PRISM', 'THE NEEDLES', 'THE CUT'],                      // ◆ BLADE
];

// THE ROLE PRICE: what a role pays on top of its bodies' formula price, walked by the judge (tools/duel.js --passes) toward
// every role worth its cost at equal budgets. The formula prices a body; the judge prices a role. The reading of 2026-09-25
// on the lane field: three passes from 09-24's ● 0.63 ■ 1.27 ▲ 0.81 ⬢ 1.86 ◯ 0.86 ◆ 0.84, then THE ANSWER TO BLADE (§7) -
// nothing beat the diamond at 0.90 or 1.00, so its price rose a tenth a pass to 1.10, where ▲ +0.26 ■ +0.26 ● +0.23 beat it.
// At these prices the roles win on average ● +0.03 ■ +0.17 ▲ +0.02 ⬢ -0.03 ◯ -0.08 ◆ -0.10: three passes and the blade's
// rise leave the square the strongest buy, and the next walk starts here.
export const ROLE_PRICE = [0.6, 1.41, 0.8, 1.92, 0.73, 1.1];
// A battalion's price is its bodies' prices, times its role's price, with a tenth off for the muster.
export function battalionCost(b, kinds, rolePrice) {
  let c = 0;
  for (const [id, n] of b.units) { const k = kinds.find((q) => q.id === id); if (!k) throw new Error(b.id + ' musters unknown ' + id); c += k.cost * n; }
  return Math.max(20, Math.round(c * 0.9 * ((rolePrice || ROLE_PRICE)[b.role] || 1) / 10) * 10);
}

// THE DRAFT: eight battalions a side per match - one of every role, then two more - so no two matches
// hand out the same panel and every panel can answer every role.
export function draft(seed, n = 8) {
  const r = rng32(seed);
  const out = [];
  for (let role = 0; role < 6; role++) { const pool = BATTALIONS.filter((b) => b.role === role); out.push(r.pick(pool)); }
  const rest = BATTALIONS.filter((b) => !out.includes(b));
  while (out.length < n && rest.length) { const i = r.int(rest.length); out.push(rest.splice(i, 1)[0]); }
  return out.sort((a, b) => a.role - b.role);
}

// THE GENERATOR: a genome from a seed, drawn from the grammar with the family's bias, priced by the same
// formula as the hand-written. This is how the roster grows to hundreds: the AI writes candidates, the
// balance ledger and the identity check keep the ones that fight differently.
export function generate(seed, id) {
  const r = rng32(seed);
  const family = r.pick(FAMILIES);
  const bias = { orb: ['swarm', 'zigzag', 'march'], square: ['march', 'hold'], tri: ['hop', 'zigzag', 'phase'], hex: ['march', 'hold'], ring: ['orbit', 'march'], diamond: ['phase', 'orbit', 'hop'] }[family];
  const move = r() < 0.7 ? r.pick(bias) : r.pick(MOVES);
  const weapon = r.pick(WEAPONS.filter((w) => w !== 'spawn'));
  const scale = r.range(0.6, 1.8);
  const g = { id: id || ('GEN' + seed), family, move, weapon, w: {}, traits: [], tags: ['generated'] };
  const base = { orb: 20, square: 140, tri: 45, hex: 110, ring: 80, diamond: 35 }[family];
  g.hp = Math.max(6, Math.round(base * scale * r.range(0.7, 1.4)));
  g.speed = Math.round({ orb: 220, square: 90, tri: 260, hex: 70, ring: 120, diamond: 300 }[family] * r.range(0.7, 1.35));
  g.r = Math.round({ orb: 9, square: 16, tri: 12, hex: 20, ring: 15, diamond: 11 }[family] * Math.sqrt(scale));
  g.w.dmg = Math.round({ bolt: 6, missile: 22, beam: 10, arc: 9, pulse: 14, mine: 60, aura: 6 }[weapon] * r.range(0.6, 1.8));
  g.w.rate = +({ bolt: 2.5, missile: 0.7, beam: 3, arc: 1.6, pulse: 0.9, mine: 0.25, aura: 2 }[weapon] * r.range(0.6, 1.6)).toFixed(2);
  g.w.range = Math.round({ bolt: 260, missile: 420, beam: 300, arc: 240, pulse: 110, mine: 90, aura: 160 }[weapon] * r.range(0.7, 1.5));
  if (weapon === 'bolt' && r() < 0.35) { g.w.count = 2 + r.int(3); g.w.spread = 0.15; }
  if (weapon === 'arc') g.w.hops = 1 + r.int(6);
  if (weapon === 'missile') g.w.splash = Math.round(40 + r() * 100);
  if (weapon === 'beam' && r() < 0.3) g.w.pierce = 1 + r.int(4);
  const nT = r() < 0.5 ? 0 : r() < 0.8 ? 1 : 2;
  const pool = TRAITS.filter((t) => t !== 'split');
  for (let i = 0; i < nT; i++) { const t = r.pick(pool); if (!g.traits.includes(t)) g.traits.push(t); }
  if (r() < 0.12) { g.traits.push('split'); g.split = 'MOTE'; g.splitN = 2 + r.int(4); }
  g.hue = r();
  return g;
}
