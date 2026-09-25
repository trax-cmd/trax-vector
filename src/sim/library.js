// library.js — THE FIRST ROSTER, written by hand so the grammar has voices before the generator has
// a thousand. Eighteen bodies across the six shapes. Costs are computed from the grammar unless pinned;
// the ledger (tools/balance.js) moves them once the duels have spoken.
import { rng32 } from './rng.js';
import { FAMILIES, MOVES, WEAPONS, TRAITS } from './units.js';

export const LIBRARY = [
  // ORBS - light, fast, many
  { id: 'MOTE',   family: 'orb', r: 6,  hp: 8,  speed: 260, move: 'swarm',  weapon: 'bolt', w: { dmg: 3, rate: 3, range: 160 }, tags: ['swarm', 'cheap'] },
  { id: 'SPARK',  family: 'orb', hp: 22, speed: 240, move: 'zigzag', weapon: 'bolt', w: { dmg: 5, rate: 4, range: 240, count: 2, spread: 0.12 }, tags: ['swarm'] },
  { id: 'BLOOM',  family: 'orb', r: 12, hp: 40, speed: 170, move: 'march',  weapon: 'bolt', w: { dmg: 6, rate: 2, range: 220 }, traits: ['split'], split: 'MOTE', splitN: 4, tags: ['swarm', 'split'] },
  { id: 'WISP',   family: 'orb', hp: 18, speed: 200, move: 'phase',  weapon: 'arc',  w: { dmg: 6, rate: 1.4, range: 200, hops: 2 }, tags: ['harass'] },
  // SQUARES - the weight
  { id: 'BLOCK',    family: 'square', hp: 160, speed: 90,  move: 'march', weapon: 'missile', w: { dmg: 24, rate: 0.6, range: 400, splash: 70 }, tags: ['tank', 'splash'] },
  { id: 'BASTION',  family: 'square', r: 19, hp: 220, speed: 70, move: 'march', weapon: 'pulse', w: { dmg: 16, rate: 0.8, range: 120 }, traits: ['shield'], shield: 150, tags: ['tank', 'shield', 'antiswarm'] },
  { id: 'SLAB',     family: 'square', r: 24, hp: 320, speed: 55, move: 'march', weapon: 'mine', w: { dmg: 70, rate: 0.35, range: 100, trigger: 46 }, traits: ['regen'], tags: ['tank', 'zone'] },
  // TRIANGLES - the strike
  { id: 'DART',   family: 'tri', hp: 40, speed: 280, move: 'hop',    weapon: 'beam', w: { dmg: 12, rate: 2.5, range: 280 }, tags: ['strike'] },
  { id: 'TALON',  family: 'tri', r: 14, hp: 60, speed: 230, move: 'zigzag', weapon: 'arc', w: { dmg: 10, rate: 1.5, range: 240, hops: 4, hopRange: 170 }, tags: ['strike', 'antiswarm'] },
  { id: 'SHARD',  family: 'tri', r: 9,  hp: 14, speed: 340, move: 'march',  weapon: 'bolt', w: { dmg: 2, rate: 1, range: 90 }, traits: ['kamikaze'], cost: 15, tags: ['suicide', 'cheap'] },
  // HEXAGONS - the artillery and the hives
  { id: 'HIVE',      family: 'hex', hp: 130, speed: 60, move: 'hold',  weapon: 'spawn',   w: { child: 'MOTE', count: 3, rate: 0.25, range: 500 }, tags: ['carrier', 'swarm'] },
  { id: 'ORDNANCE',  family: 'hex', r: 22, hp: 120, speed: 60, move: 'march', weapon: 'missile', w: { dmg: 40, rate: 0.35, range: 640, speed: 360, splash: 110, turn: 3 }, tags: ['artillery', 'splash'] },
  { id: 'COIL',      family: 'hex', hp: 100, speed: 80, move: 'march', weapon: 'arc',     w: { dmg: 14, rate: 1.2, range: 300, hops: 6, hopRange: 190, decay: 0.8 }, tags: ['antiswarm'] },
  // RINGS - the field
  { id: 'HALO',      family: 'ring', hp: 80,  speed: 120, move: 'orbit', weapon: 'aura',  w: { dmg: 8, range: 180 }, traits: ['regen'], tags: ['support', 'heal'] },
  { id: 'NULL',      family: 'ring', hp: 90,  speed: 110, move: 'orbit', weapon: 'pulse', w: { dmg: 4, rate: 1, range: 150 }, traits: ['emp'], tags: ['support', 'stun'] },
  { id: 'LODESTONE', family: 'ring', r: 18, hp: 130, speed: 90, move: 'march', weapon: 'pulse', w: { dmg: 18, rate: 0.7, range: 140 }, traits: ['magnet'], tags: ['zone', 'antiswarm'] },
  // DIAMONDS - the blades
  { id: 'NEEDLE', family: 'diamond', hp: 30, speed: 320, move: 'phase', weapon: 'beam', w: { dmg: 28, rate: 1.2, range: 260 }, traits: ['cloak'], tags: ['assassin'] },
  { id: 'PRISM',  family: 'diamond', r: 14, hp: 70, speed: 200, move: 'orbit', weapon: 'beam', w: { dmg: 16, rate: 2, range: 340, pierce: 3 }, tags: ['strike', 'line'] },
];

// THE GENERATOR: a genome from a seed. Every field is drawn from the grammar with the family's bias, then
// priced by the same formula as the hand-written ones. This is how the roster grows to hundreds: the AI
// writes candidates, the balance ledger and the identity check keep the ones that fight differently.
export function generate(seed, id) {
  const r = rng32(seed);
  const family = r.pick(FAMILIES);
  const bias = { orb: ['swarm', 'zigzag', 'march'], square: ['march', 'hold'], tri: ['hop', 'zigzag', 'phase'], hex: ['march', 'hold'], ring: ['orbit', 'march'], diamond: ['phase', 'orbit', 'hop'] }[family];
  const move = r() < 0.7 ? r.pick(bias) : r.pick(MOVES);
  const weapon = r.pick(WEAPONS.filter((w) => w !== 'spawn'));
  const scale = r.range(0.6, 1.8);
  const g = {
    id: id || ('GEN' + seed), family, move, weapon,
    hp: undefined, speed: undefined,
    w: { dmg: undefined, rate: undefined, range: undefined },
    traits: [], tags: ['generated'],
  };
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
