# TRAX: VECTOR — THE PLAN

A top-down war of shapes and light. Five towers a side. From any tower of yours you deploy bodies
against any tower of theirs; the bodies fight what they meet. Nothing is a sprite: every body is a
shape drawn from a formula, every weapon a line of light. The same code runs without a screen, so a
captain written in code plays it in real time, and a person and a machine can play each other.

Working title VECTOR. The name is his call (open, below).

## 0. HIS ORDER, VERBATIM (2026-09-24)

"We're going to create a whole new game. I mean, the way these allies work is crap. But the first thing we're going to do is we're going to lay the foundation for a whole new game. It's not going to be any more sprites. It's going to be VFX only. And what we're going to do is we're only going to use orbs and cubes or squares, just shapes, essentially, polygons, that are going to have different weapons but it's going to be just interesting VFX but we're going to harness the power of AI and create incredible variety which is what you're capable of doing okay so you have to think on a massive scale of making a new game with incredible variety and we're just deploying against a battlefield. And it's going to be viewed from the top down, like a strategy game. And basically, from different points of the map, I could deploy different units to attack different towers. So, basically, maybe the enemy has five towers, and I have five towers, and we're looking from the top down. And from each tower, I could deploy a variety of different units and it's going to have to be massive with a massive battle. So this is not a joke. You have to plan out this game and plan out how you want to set up the architecture because it's just going to be simple but it's not going to mimic a game from the 90s. It has to be something that's going to be a hallmark of the AI digital age. With such a crazy variety of units and abilities and effects that it's just going to have emergent gameplay. But in order to do this, you have to really think like a master AI. And you have to make sure you know your actual capabilities. Something that you yourself can play using code. Okay? That you're not going to be confused between what I'm playing and what you're playing. You know, to the point that me and you could play one another. That's really the goal there. So you have to make a game that you yourself can play somehow. I understand it might not be in real time or whatever, but somehow, it would be nice if it was in real time. Some things might have missiles, some things might have electric, something might have this, but all simple VFX you can do. Without having to reiterate and do a bunch of bullshit. Something with beautiful code."

## 1. THE GAME IN ONE PAGE

- **THE FIELD.** A dark ground, 4000 by 2400, seen from above. A faint grid so scale reads.
- **THE TOWERS.** Five a side in an arc, yours on the west, theirs on the east. 1,500 hp each. A tower
  is where bodies are born and what the enemy comes to kill.
- **THE DEPLOY.** Tap a tower of yours, tap an enemy tower to aim, tap a card. The body is born beside
  your tower and marches on the enemy tower, fighting what it meets on the way. Hold a card to pour.
  Digits 1–9 deploy from the keyboard.
- **THE ENERGY.** One pool a side. Every living tower pays 8 a second into it; you open with 600. A body
  costs its price. (Defaults; the questions at the end.)
- **THE BODIES.** Six shapes, each a family with a temper: ORBS are light, fast and many; SQUARES are
  the weight; TRIANGLES strike; HEXAGONS are artillery and hives; RINGS are the field (auras, pulls,
  stuns); DIAMONDS are the blades. Eighteen are on the panel today; the grammar makes hundreds.
- **THE WEAPONS.** Bolts, homing missiles, beams, chain lightning, pulses, mines, hives that spawn,
  auras that heal. Every one is a line or a ring of light.
- **THE TRAITS.** Shields, splitting on death, regeneration, kamikaze, EMP, magnetism, cloak.
- **THE END.** Kill all five of their towers, or hold more tower hp when the clock rings at eight minutes.
- **THE OTHER SIDE.** A captain written in code by default. Two captains can play each other headless.
  Through the wire, a person at a keyboard or a model in a chat commands the east side of a match a
  person is watching in a browser.

## 2. THE PILLARS

1. **Light, not sprites.** Every body is a signed-distance shape drawn by the GPU in one instanced
   call; every weapon is a segment or a ring; every death is sparks. There is no art pipeline. A new
   body costs a line of data, never a drawing.
2. **Variety by grammar.** A body is a sentence: family × move × weapon × traits × numbers. The AI
   writes sentences by the thousand; a ledger of measured fights keeps the ones that fight differently.
3. **Emergence by composition.** Chain lightning hops across a swarm; a magnet drags a swarm onto
   mines; a hive fills the field with motes that a pulse clears; an EMP ring stuns a charge. None of
   these are scripted interactions; they fall out of simple rules meeting.
4. **Playable by code.** The world is a pure simulation with a command protocol and a snapshot. The
   captain is a function of the snapshot. What a person does with taps, a program does with commands;
   nothing else differs. This is the difference between "the AI plays too" and a demo.
5. **Determinism.** One seed, fixed ticks, commands at tick boundaries: a match replays from its seed
   and its command list, on any machine, byte for byte. Balance is measured, replays are free, and
   two machines can run the same war from the same commands.
6. **Scale is a number.** Ten thousand bodies in flat typed arrays and a spatial hash; measured, not
   hoped for.
7. **Beautiful code.** Small modules with one job each, plain ES modules, no build step, every file
   readable top to bottom. Comments say why; the code says what.

## 3. THE ARCHITECTURE

```
index.html               the page: a canvas, a strip, the cards, the end card
src/main.js              the loop: 30 ticks a second whatever the frame rate; captains tick beside the sim
src/sim/sim.js           THE WORLD: pure, deterministic; bodies, shots, mines, towers, energy, commands, the bell
src/sim/grid.js          the spatial hash: every "who is near me" in constant time per cell
src/sim/units.js         THE GRAMMAR: genome -> compiled body; the one cost formula
src/sim/library.js       the first eighteen bodies, and generate(seed) for the thousands
src/sim/rng.js           the seeded stream
src/ai/bot.js            THE CAPTAIN: a policy of the snapshot -> deploy commands
src/render/gl.js         THE LIGHT: WebGL2, three programs, everything instanced
src/render/vfx.js        THE VOCABULARY: sim events -> sparks, rings, beams, arcs, flashes
src/ui/input.js          the hand: drag, pinch, wheel, tap, digits
src/ui/hud.js            the glass: strip, cards, hint, end card
src/ui/relay.js          the page's end of the wire
tools/headless.js        the war without a screen: two captains, the cost of a tick
tools/relay.js           THE WIRE: a tiny HTTP relay so a match in a browser is commanded from outside
tools/serve.js           the house on a port
probes/vector-road.cjs   the road by real taps, frames taken
```

**Data.** Bodies live in struct-of-arrays typed arrays (`x, y, vx, vy, hp, shield, cooldown, age,
phase, stun, kind, team, alive, target, goal, home`), capacity 20,000; shots 60,000; mines 4,000. A
slot is a number; a free-list recycles them; the high-water mark trims itself. Nothing allocates in the
tick but the event list, which is capped.

**The tick** (30 a second): commands → income → grid build (counting sort) → for every body: retarget
(every sixth tick, staggered), move (its family's style, plus separation and the swarm's centre from
the grid), fire (when its target is in range), traits → shots (sub-stepped so a fast bolt cannot pass
through a small body) → mines → the trim → the bell.

**Targeting.** The nearest enemy body inside the aggro ring, else the goal tower. A cloaked body is
seen only up close or when it just fired. A target is an index: ≥ 0 a body, ≤ −2 a tower.

**Commands.** `{ op: 'deploy', team, tower, kind, goal }`. That is the whole protocol today. A rally
or a retreat would be a second verb; the shape stays.

**The snapshot.** What a captain reads: tick, time, energy, every tower's hp and the enemy hp within
600 of it, counts alive per kind per side, the result. Small, plain, JSON-able. The captain sees exactly
what a person sees on the glass, in numbers.

**Events.** The sim narrates itself: death, hit, shield, beam, arc (with its points), pulse, aura,
explode, blink, deploy, mine, spawnout, towerHit, towerDown, end. The renderer spends them as light;
headless throws them away. The sim never knows a screen exists.

**The renderer.** Three WebGL2 programs. Shapes: one quad per body, the fragment computes the signed
distance of the family's shape (circle, box, triangle, hexagon, ring, diamond), the edge is a bright
rim, the outside is an exponential glow; additive blending on a near-black ground makes the neon.
Lines: one quad per segment for beams, arcs and trails. The field: a full-screen formula with the grid
and a vignette. Particles are the shape program again with a life fade. A body never draws under a
few screen pixels, so the far view is a field of lights.

**Measured on this machine (Node 24, one core):**

| war | peak alive | mean tick | worst tick | speed |
|---|---|---|---|---|
| default economy, two captains | 53 | 0.02 ms | 1.2 ms | 1,547× real time |
| heavy (40k energy, 400/s a tower) | 624 | 0.20 ms | 1.0 ms | 166× |
| massive (200k energy, 2,000/s, 80 a look) | 5,148 | 2.8 ms | 15.1 ms | 12× |

A tick has a 33 ms budget. Five thousand bodies spend a tenth of it. The frame at the phone glass:
sixty a second with the field drawn through SwiftShader (no GPU at all).

## 4. THE GRAMMAR, AND HOW THE VARIETY IS MADE

```
genome = { id, family: orb|square|tri|hex|ring|diamond,
           r, hp, speed, mass, move: march|zigzag|orbit|swarm|hop|hold|phase,
           weapon: bolt|missile|beam|arc|pulse|mine|spawn|aura, w: { dmg, rate, range, ...per weapon },
           traits: [shield, split, regen, kamikaze, emp, magnet, cloak], split, splitN, hue, tags, cost? }
```

- **compile(genome)** fills every field from the family's temper and the weapon's table, computes the
  body's dps and its **cost** by one formula (hp, dps weighted by reach, speed, shield, traits). The
  hand-written and the generated are priced by the same rule, so the ledger's corrections mean the
  same thing everywhere.
- **generate(seed)** writes a genome from the grammar with the family's bias: a square that hops, a
  ring that mines, an orb with chain lightning. Every seed is a different body.
- **The hundred.** The plan for the roster: the generator writes a thousand; an identity check drops
  any body within a small distance of another in stat space (so no two feel the same); the balance
  tool (the arena's method, duels of equal energy per pair, strength in both seats) prices them; the
  captain's counter table is learned from the duel matrix rather than written by hand; the AI names
  what survives. The roster on the panel is then a draft of nine to twelve a match, drawn from the
  hundred, so no two matches field the same panel. That is the "incredible variety": not a long list,
  but a grammar, a generator, a judge and a draft.
- **Abilities to come** (each a verb in the sim, each a word in the vocabulary): a gravity well, a
  time-slow field, a reflect shield, a chain of tethered bodies, a body that grows on kills, a body that
  turns enemies, a burrower, a wall. Every one composes with every other by construction.

## 5. THE VOCABULARY OF LIGHT

Death: sparks by size and a ring. Hit: three sparks. Shield: a small white ring. Beam: a bright core
line inside a wide faint line for a tenth of a second. Arc: the chain's points, each segment jittered
into lightning, a spark at every body it bit. Pulse: a ring that grows to the range. Explode: a flash,
a ring, twenty sparks. Blink: a ring where it left and a ring where it landed, a thread between. Tower
down: ninety sparks, two rings, a flash. Cold light for the west, hot light for the east; each family a
shade of its side. The vocabulary grows a word at a time with the abilities.

## 6. PLAYING EACH OTHER

Three levels, honest about what a model can do:

1. **The captain (now).** `src/ai/bot.js` is me playing in real time: a policy I wrote, ticking twice
   a second inside the match, reading only the snapshot a person sees. When he plays the west, the
   east is the captain. Two captains play each other headless for the ledger.
2. **The wire (now, on one Wi-Fi).** `node tools/relay.js` on this desk; his phone opens the match with
   `?relay=http://<this desk>:8898&b=relay`. The page pulls the east side's commands four times a
   second and posts the snapshot once a second. I, the model, read `/state` and post `/cmd` from the
   chat — a general giving orders every few seconds while the captain's reflexes are the policy. This
   is me and him playing one another: real time for the match, a few seconds a decision for me. That
   cadence is the truth of what I am; the plan does not pretend otherwise.
3. **The worker (next).** The same relay as a Cloudflare worker with a room code, so the wire works
   from anywhere, and lockstep for two people: since the sim is deterministic, two browsers exchanging
   only commands run the same war.

## 7. THE ROADMAP

- **v0.1 THE FOUNDATION (this).** Everything above that says "now": the sim, the grammar, eighteen
  bodies, the captain, the light, the hand, the glass, the wire, headless, the road probe. Live.
- **v0.2 THE HUNDRED.** The generator run at scale, the identity check, the balance tool and its ledger,
  learned counters, the draft of a panel per match, names.
- **v0.3 THE WIRE ABROAD.** The worker relay with room codes; me versus him from anywhere; a spectator
  link.
- **v0.4 THE VERBS.** Rally and retreat; the abilities list above; the vocabulary's new words.
- **v0.5 THE PHONE.** The glass at every size, the pinch and the pour, sound (a synthesized voice per
  family, no samples), the end card's replay.

## 8. THE QUESTIONS, EACH WITH ITS DEFAULT

- The name. Default: VECTOR.
- The economy. Default: 600 to open, 8 a second per living tower, a body costs its price. (The arena's
  lesson: a war chest makes the opening the whole war — say the word and it is 20×.)
- The towers. Default: five a side in an arc, 1,500 hp, born bodies march on one enemy tower.
- The end. Default: all five towers, or the clock at eight minutes on tower hp.
- The panel. Default: the eighteen; v0.2 drafts nine to twelve from the hundred per match.
- The sides. Default: the person plays the west; `?team=1` plays the east; `?a=bot&b=bot` spectates.
- Sound. Default: none in v0.1; synthesized in v0.5.

## 9. THE PROOF STANDARD, AND THE BOARD

Done is: the road probe green by real taps on the served page and on the live page, frames viewed,
the headless numbers printed, no page error. Nothing is claimed that the probe did not touch.

- **2026-09-24 · THE FOUNDATION (v0.1.0).** The house, the plan, the sim, the grammar, eighteen bodies,
  the captain, the light, the hand, the glass, the wire, headless, the probe. Proof: vector-road.cjs
  green at the phone glass and on a desk (Chromium, WebGL2 through SwiftShader: boot with no error, a tap
  chooses a tower, a tap aims, a card deploys and charges, the east captain fields twenty-nine bodies in
  eleven seconds, bodies fall, sixty frames a second); the headless table above; frames viewed.
  THE WIRE, proven the same day (probes/vector-wire.cjs): the relay up, a page whose east side takes its
  orders from it, one command posted from outside (`{op:"deploy", team:1, tower:7, kind:"BLOCK", goal:2}`)
  moved a body in the running match within a second, the snapshot came back through `/state` at tick 120,
  a bad command was refused. Live at https://trax-cmd.github.io/trax-vector/ and probed there.
