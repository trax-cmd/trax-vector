// units.js — THE GRAMMAR. A unit is a genome: a shape, a body, a way of moving, a weapon and a few
// traits. Everything the war can field is a sentence in this grammar, which is how the variety scales:
// the library writes a few dozen by hand, the generator writes thousands, the ledger keeps the ones
// that fight differently. compile() turns a genome into the flat numbers the sim reads every tick.

export const FAMILIES = ['orb', 'square', 'tri', 'hex', 'ring', 'diamond'];   // the six shapes; the index is what the renderer draws
export const MOVES = ['march', 'zigzag', 'orbit', 'swarm', 'hop', 'hold', 'phase'];
export const WEAPONS = ['bolt', 'missile', 'beam', 'arc', 'pulse', 'mine', 'spawn', 'aura'];
export const TRAITS = ['shield', 'split', 'regen', 'kamikaze', 'emp', 'magnet', 'cloak'];

// What a family is, before the genome says otherwise. Size is the radius in world units.
const FAMILY_BASE = {
  orb:     { r: 9,  hp: 20,  speed: 220, mass: 1,   move: 'swarm',  weapon: 'bolt'    },
  square:  { r: 16, hp: 140, speed: 90,  mass: 4,   move: 'march',  weapon: 'missile' },
  tri:     { r: 12, hp: 45,  speed: 260, mass: 1.5, move: 'hop',    weapon: 'beam'    },
  hex:     { r: 20, hp: 110, speed: 70,  mass: 5,   move: 'march',  weapon: 'missile' },
  ring:    { r: 15, hp: 80,  speed: 120, mass: 3,   move: 'orbit',  weapon: 'aura'    },
  diamond: { r: 11, hp: 35,  speed: 300, mass: 1.2, move: 'phase',  weapon: 'beam'    },
};

// The weapon table: what each word means in numbers. A genome may override any field.
const WEAPON_BASE = {
  bolt:    { dmg: 6,  rate: 2.5, range: 260, speed: 900, count: 1, spread: 0.06, life: 0 },
  missile: { dmg: 22, rate: 0.7, range: 420, speed: 420, turn: 4.5, splash: 60, count: 1 },
  beam:    { dmg: 10, rate: 3,   range: 300, pierce: 0 },
  arc:     { dmg: 9,  rate: 1.6, range: 240, hops: 3, hopRange: 150, decay: 0.7 },
  pulse:   { dmg: 14, rate: 0.9, range: 110 },
  mine:    { dmg: 60, rate: 0.25, range: 90, trigger: 40 },
  spawn:   { dmg: 0,  rate: 0.2, range: 500, child: 'MOTE', count: 3 },
  aura:    { dmg: 6,  rate: 2,   range: 160 },   // dmg is the heal per second to allies in range
};

const TRAIT_COST = { shield: 20, split: 18, regen: 12, kamikaze: 8, emp: 16, magnet: 22, cloak: 14 };

export function compile(genome, index) {
  const fam = FAMILY_BASE[genome.family];
  if (!fam) throw new Error('unknown family ' + genome.family);
  const wname = genome.weapon || fam.weapon;
  const wbase = WEAPON_BASE[wname];
  if (!wbase) throw new Error('unknown weapon ' + wname);
  const w = { type: wname, ...wbase, ...(genome.w || {}) };
  if (w.type === 'bolt' && !w.life) w.life = (w.range / w.speed) * 1.25;
  const traits = {};
  for (const t of genome.traits || []) { if (!TRAITS.includes(t)) throw new Error('unknown trait ' + t); traits[t] = true; }
  const d = {
    index, id: genome.id, name: genome.name || genome.id,
    family: genome.family, shape: FAMILIES.indexOf(genome.family),
    r: genome.r ?? fam.r, hp: genome.hp ?? fam.hp, speed: genome.speed ?? fam.speed, mass: genome.mass ?? fam.mass,
    move: genome.move || fam.move,
    w, traits,
    shieldMax: traits.shield ? (genome.shield ?? Math.round((genome.hp ?? fam.hp) * 0.6)) : 0,
    splitInto: genome.split || null, splitN: genome.splitN || 3,
    aggro: genome.aggro ?? Math.max(220, w.range * 1.4),
    hue: genome.hue ?? 0,
    tags: genome.tags || [],
    cost: 0, dps: 0,
    childIndex: -1,
  };
  if (!MOVES.includes(d.move)) throw new Error('unknown move ' + d.move);
  d.dps = dpsOf(d);
  d.cost = genome.cost ?? costOf(d);
  return d;
}

function dpsOf(d) {
  const w = d.w;
  switch (w.type) {
    case 'bolt': return w.dmg * w.count * w.rate;
    case 'missile': return w.dmg * w.count * w.rate * (1 + w.splash / 120);
    case 'beam': return w.dmg * w.rate * (1 + (w.pierce || 0) * 0.5);
    case 'arc': { let s = 0, m = 1; for (let i = 0; i <= w.hops; i++) { s += m; m *= w.decay; } return w.dmg * w.rate * s; }
    case 'pulse': return w.dmg * w.rate * 2.2;
    case 'mine': return w.dmg * w.rate * 1.5;
    case 'spawn': return 4 * w.count * w.rate * 10;   // a carrier is worth its children
    case 'aura': return w.dmg * 1.5;
    default: return 0;
  }
}

// The price of a body: what it can take, what it can give, how far and how fast. One formula for the
// hand-written and the generated alike, so the ledger's corrections mean the same thing everywhere.
export function costOf(d) {
  const reach = Math.sqrt(Math.max(60, d.w.range) / 200);
  let c = d.hp / 8 + d.dps * reach * 1.1 + d.speed / 30 + (d.shieldMax || 0) / 10;
  for (const t in d.traits) c += TRAIT_COST[t] || 0;
  if (d.move === 'phase') c += 10;
  if (d.move === 'hold') c *= 0.85;
  return Math.max(10, Math.round(c / 5) * 5);
}

// The whole roster at once: indices are stable for the match, and a spawner's child is resolved by id.
export function compileAll(genomes) {
  const kinds = genomes.map((g, i) => compile(g, i));
  const byId = new Map(kinds.map((k) => [k.id, k]));
  for (const k of kinds) {
    if (k.w.type === 'spawn') { const c = byId.get(k.w.child); if (!c) throw new Error(k.id + ' spawns unknown ' + k.w.child); k.childIndex = c.index; }
    if (k.splitInto) { const c = byId.get(k.splitInto); if (!c) throw new Error(k.id + ' splits into unknown ' + k.splitInto); k.splitIndex = c.index; }
  }
  return kinds;
}
