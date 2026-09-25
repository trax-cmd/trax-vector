# TRAX: VECTOR — THE PLAN

A top-down war of shapes and light. Five towers a side. From any tower of yours you deploy bodies
against any tower of theirs; the bodies fight what they meet. Nothing is a sprite: every body is a
shape drawn from a formula, every weapon a line of light. The same code runs without a screen, so a
captain written in code plays it in real time, and a person and a machine can play each other.

Working title VECTOR. The name is his call (open, below).

## 0. HIS ORDER, VERBATIM (2026-09-24)

"We're going to create a whole new game. I mean, the way these allies work is crap. But the first thing we're going to do is we're going to lay the foundation for a whole new game. It's not going to be any more sprites. It's going to be VFX only. And what we're going to do is we're only going to use orbs and cubes or squares, just shapes, essentially, polygons, that are going to have different weapons but it's going to be just interesting VFX but we're going to harness the power of AI and create incredible variety which is what you're capable of doing okay so you have to think on a massive scale of making a new game with incredible variety and we're just deploying against a battlefield. And it's going to be viewed from the top down, like a strategy game. And basically, from different points of the map, I could deploy different units to attack different towers. So, basically, maybe the enemy has five towers, and I have five towers, and we're looking from the top down. And from each tower, I could deploy a variety of different units and it's going to have to be massive with a massive battle. So this is not a joke. You have to plan out this game and plan out how you want to set up the architecture because it's just going to be simple but it's not going to mimic a game from the 90s. It has to be something that's going to be a hallmark of the AI digital age. With such a crazy variety of units and abilities and effects that it's just going to have emergent gameplay. But in order to do this, you have to really think like a master AI. And you have to make sure you know your actual capabilities. Something that you yourself can play using code. Okay? That you're not going to be confused between what I'm playing and what you're playing. You know, to the point that me and you could play one another. That's really the goal there. So you have to make a game that you yourself can play somehow. I understand it might not be in real time or whatever, but somehow, it would be nice if it was in real time. Some things might have missiles, some things might have electric, something might have this, but all simple VFX you can do. Without having to reiterate and do a bunch of bullshit. Something with beautiful code."

## 1. THE GAME IN ONE PAGE (v0.2 THE FIELD OF WELLS)

- **THE FIELD.** A dark ground, 9000 by 5000, seen from above. A faint grid so scale reads. WHOLE shows
  it all; ACTION follows the fighting; a drag is yours.
- **THE STRONGHOLDS.** Five a side in an arc, yours on the west, theirs on the east. 2,500 hp each. A
  stronghold is where battalions muster and what the enemy comes to kill.
- **THE WELLS.** Twenty-six across the field, neutral at the bell. A side alone on a well turns it in
  three seconds (six to take an enemy's); a well pays its owner 5 a second. The war is for the wells.
- **THE MUSTER.** Tap a card. With nothing aimed at, the battalion goes to the nearest open well, then
  to the nearest enemy well, then to their weakest stronghold, and musters from your stronghold nearest
  that point (v0.3: the game teaches by doing - the first tap is already a good move). Tap a well or an
  enemy stronghold to aim; tap a stronghold of yours to muster from it. Hold a card to pour. Digits 1–8.
- **THE HARVEST, SEEN (v0.3).** Every well you hold sends a mote of light home twice a second; the strip
  reads your energy and its rate, and the enemy's. Before your first muster the open wells breathe.
- **THE COACH (v0.3), WHO POINTS (v0.5).** The coach does not talk; it points. The card to tap GLOWS.
  The place the battalion will go is MARKED on the field with a gold ring and a word (CLAIM, ANSWER
  HERE, HOLD, TAKE, BREAK, FORTIFY). The line under the strip is four words with a dim reason under it:
  TAP THE GLOWING CARD · it marches to the marked well. Tapping the glowing card with nothing aimed at
  goes exactly where the mark is. Following the coach is one tap. Never a lesson, never a pop-up.
- **THE FIELD SPEAKS (v0.5).** When a shape kills a shape it beats, the field says so where it happened,
  in the killer's colour: ▲ BEATS ⬢. The strategy is read off the fight, not off a table.
- **THE FORT (v0.3).** Aim at a well of yours and a plaque offers FORTIFY for 150: a WARDEN ring stands
  on it (shielded, regenerating, pulsing) and the well pays 8 a second instead of 5. Lose the well and
  the fort is lost. Collecting is one choice, managing is another: expand, fortify, or attack.
- **THE VOICE (v0.3).** No samples: a few oscillators per event, cold for the west and hot for the
  east - a muster, a well turning, a well lost, a fort, a death, a stronghold struck, a stronghold
  down, the win, the loss, and the alarm. A SOUND chip mutes it.
- **THE TEMPERS (v0.4).** EASY, NORMAL, HARD: what the captain earns, how often it looks, how many
  battalions it musters a look. Set by a yardstick (§4b), not by feel. A chip cycles them; a new match.
- **THE WAR GROWS (v0.4).** Income, and the size and the price of every muster, scale with the clock:
  doubled at five minutes, tripled at ten. A tap stays a tap; the battalions get bigger. The late war
  is the massive one, and no match sits on a full purse waiting for the bell. At the bell, the side
  with more stronghold health wins; if equal, the side with more wells.
- **THE ALARM (v0.4).** When the enemy musters three battalions in three seconds, the coach line is
  overruled for six seconds - A WAVE IS COMING, their shapes, the stronghold of yours it is nearest, and
  the shapes that answer it - and the voice sounds it.
- **THE ENERGY.** One pool a side. Every living stronghold pays 6 a second, every well 5; you open with
  800. A battalion costs its price.
- **THE SHAPES ARE THE ROLES.** ● ORBS are THE SWARM; ■ SQUARES THE ARMOR; ▲ TRIANGLES THE STRIKE;
  ⬢ HEXAGONS THE SIEGE; ◯ RINGS THE FIELD; ◆ DIAMONDS THE BLADE. What a body is, you can see. What it
  beats, the card says - and the card says only what the judge measured (§4).
- **THE BATTALIONS.** Seventeen in the library, in lines, columns, wedges, rings and clouds; each match
  drafts eight a side, one of every role and two more, so no two matches hand out the same panel.
- **THE WEAPONS.** Bolts, homing missiles, beams, chain lightning, pulses, mines, hives that spawn,
  auras that heal. Every one is a line or a ring of light.
- **THE TRAITS.** Shields, splitting on death, regeneration, kamikaze, EMP, magnetism, cloak.
- **THE END.** Kill all five of their strongholds, or hold more stronghold hp when the clock rings at
  ten minutes. The end card says which of your shapes broke which of theirs.
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

## 4. THE TABLE, AND THE JUDGE THAT WRITES IT

A strategy a player can read needs a counter table that is TRUE. I wrote one by mechanics first; the judge
(`tools/duel.js`) fought every battalion against every other, nine hundred apart, at equal energy, and
said it was wrong in sixteen places: rings beat everything (the EMP stunned forever), the swarm lost to
everything (every weapon kills a nine-point body), the coil was an anti-swarm gun in the siege family.
Four passes of mechanics followed, each checked by the judge: a shorter stun and a gentler magnet; the
coil to the field and a cannon for the siege; each role's EYE (a striker or a blade takes the weakest it
can reach and finishes it, a gun takes the biggest beyond its blind ring, the rest take the nearest);
artillery with a MINIMUM RANGE it cannot fire inside, and strikers and blades that dive under the guns;
and the price formula itself - a body's price is the root of what it can take times what it can give
(Lanchester), because the first formula bought a wall of blocks for less than the strikers sent to kill it.
Then the judge PRICED THE ROLES: five passes, each raising the price of a role that won on average and
lowering one that lost, until every role was within a tenth of fair - ● 0.63 ■ 1.27 ▲ 0.81 ⬢ 1.86
◯ 0.86 ◆ 0.84 - and wrote the table it measured at those prices, which is what the cards, the strip's
ANSWER and the captain's counters all read:

| shape | beats | by |
|---|---|---|
| ● SWARM | ▲ STRIKE, ⬢ SIEGE | +0.20, +0.16 |
| ■ ARMOR | ● SWARM, ▲ STRIKE | +0.29, +0.14 |
| ▲ STRIKE | ⬢ SIEGE | +0.15 |
| ⬢ SIEGE | ■ ARMOR, ◯ FIELD | +0.33, +0.17 |
| ◯ FIELD | ● SWARM | +0.11 |
| ◆ BLADE | ◯ FIELD, ■ ARMOR, ⬢ SIEGE | +0.34, +0.17, +0.13 |

At the heart, a three-way cycle: squares beat orbs, orbs beat hexagons, hexagons beat squares. The
triangle hunts hexagons; the diamond hunts rings and squares; the ring checks orbs. A promise the field
denies is never printed. The judge runs again whenever a body or a rule changes, and the table moves with it.

## 4b. THE YARDSTICK, AND HOW THE TEMPERS WERE SET

The coach is a function (`src/ai/coach.js`): from the field it returns the one next move - what kind,
where, against which shape, with which shapes - and the sentence. The glass prints the sentence. THE
COACHED PLAYER (`src/ai/coached.js`) reads the same advice and does it at a person's pace: one look
every three seconds, one muster a look, two when the purse is deep. `tools/tempers.js` plays the
coached player against the captain at each temper over eight seeds. The first reading said the game was
too hard everywhere (one win of six at NORMAL; the captain looked every 1.5 s and mustered four a look
while a person taps once in three seconds) and that three matches in eight ran the whole clock with no
stronghold touched. The tempers were given a burst per look, the war was made to grow with the clock,
and the reading became: EASY the player wins 8 of 8, NORMAL 5 of 8, HARD 2 of 8, no draws, matches of
seven to eight minutes. A temper is fair when a person following the game's own coach wins about half.

## 5. THE GRAMMAR, AND HOW THE VARIETY IS MADE

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

## 6. THE VOCABULARY OF LIGHT

Death: sparks by size and a ring. Hit: three sparks. Shield: a small white ring. Beam: a bright core
line inside a wide faint line for a tenth of a second. Arc: the chain's points, each segment jittered
into lightning, a spark at every body it bit. Pulse: a ring that grows to the range. Explode: a flash,
a ring, twenty sparks. Blink: a ring where it left and a ring where it landed, a thread between. Tower
down: ninety sparks, two rings, a flash. Cold light for the west, hot light for the east; each family a
shade of its side. The vocabulary grows a word at a time with the abilities.

## 7. PLAYING EACH OTHER

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

## 8. THE ROADMAP

- **v0.1 THE FOUNDATION (this).** Everything above that says "now": the sim, the grammar, eighteen
  bodies, the captain, the light, the hand, the glass, the wire, headless, the road probe. Live.
- **v0.2 THE HUNDRED.** The generator run at scale, the identity check, the balance tool and its ledger,
  learned counters, the draft of a panel per match, names.
- **v0.3 THE WIRE ABROAD.** The worker relay with room codes; me versus him from anywhere; a spectator
  link.
- **v0.4 THE VERBS.** Rally and retreat; the abilities list above; the vocabulary's new words.
- **v0.5 THE PHONE.** The glass at every size, the pinch and the pour, a voice per family (the first
  synthesized voice landed in v0.3), the end card's replay.

## 9. WHAT STANDS UNTIL HE SAYS OTHERWISE

- The name. Default: VECTOR.
- The economy. Default: 600 to open, 8 a second per living tower, a body costs its price. (The arena's
  lesson: a war chest makes the opening the whole war — say the word and it is 20×.)
- The towers. Default: five a side in an arc, 1,500 hp, born bodies march on one enemy tower.
- The end. Default: all five towers, or the clock at eight minutes on tower hp.
- The panel. Default: the eighteen; v0.2 drafts nine to twelve from the hundred per match.
- The sides. Default: the person plays the west; `?team=1` plays the east; `?a=bot&b=bot` spectates.
- Sound. Default: none in v0.1; synthesized in v0.5.

## 10. THE PROOF STANDARD, AND THE BOARD

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

- **2026-09-24 · THE FIELD OF WELLS (v0.2.0).** His word: "I don't want to make any more judgment calls
  ... I was able to overwhelm the enemy but I didn't know what I was doing ... something that gives me an
  idea of a strategy, on a massive scale, battalions, formations, harvesters." The decisions are mine
  now, and these are they: the field doubled to 9000 by 5000 with twenty-six wells to claim (the economy
  is territory); battalions in formation instead of single bodies, eight drafted a side; shape = role,
  with a counter table the judge measured and the cards print; the eye of each role and the blind ring
  of artillery; a captain that holds what is threatened with the counter to what threatens it, claims
  wells with cheap hands and saves for waves at the weakest stronghold; WHOLE / ACTION views; the strip
  reads what THEY FIELD and the ANSWER; the end card says which shape broke which. A hive bears a clutch
  of twenty-four, not a factory (the first war fielded twenty-seven thousand motes from six hundred
  musters). Measured: a whole war between two captains in 1.5 s of compute; six drafted seeds fell to
  the west five times, so the field was tested with the SAME deck on both sides over eight seeds
  (`tools/mirror.js`): west 3, east 3, draw 2 - the field is fair, the lean was the draft. Proof:
  vector-road.cjs at the phone glass and on a desk (boot, a tap on a stronghold, on an enemy stronghold,
  on a well; a card musters eight bodies and charges; the card reads "beats ▲ ⬢"; the strip reads WELLS
  and ANSWER; the east captain claims wells within ten seconds; a battalion sent across the field meets
  the enemy and a body falls), the judge's table above, frames viewed.

- **2026-09-24 · THE HARVEST (v0.3.0).** His word: "more interesting and more epic, but I don't know how
  to collect energy. And I don't know what to do ... the dynamic of collecting and managing is starting
  to come into play ... make it a game, make it fun." My decisions: a blind card is a good move (the
  nearest open well, from the nearest stronghold), the harvest is seen (motes of light from every well
  you hold to your stronghold), the coach line reads the field and says the one next thing, the open
  wells breathe before the first muster, the last order is drawn as a thread, the fight glows on the
  whole view, FORTIFY gives managing a choice (150: a warden and +3 a second, lost with the well; the
  captain fortifies too, once it holds three wells), and the voice - synthesized, nine events, a mute
  chip. Measured: two captains fortify thirteen and fourteen wells in five minutes; wars still resolve
  (seeds 2 and 7 by strongholds at 264 s and 276 s). Proof: vector-road.cjs at the phone glass and on a
  desk (the coach at the bell points at the wells; a blind card sends eight bodies to well 1 from
  stronghold 2 and the coach follows; the plaque appears for a well of mine and a tap fortifies it - a
  warden stands, the energy drops; sound wakes on the first tap; the rest as before), frames viewed.

- **2026-09-24 · THE TEMPERS (v0.4.0).** His word: "iterate again." My decisions: the coach became a
  function, and a COACHED PLAYER that follows it at a person's pace became the yardstick; three tempers
  set by that yardstick (EASY 8-0, NORMAL 5-3, HARD 2-6 over eight seeds); the war grows with the clock
  (income, muster size and price doubled at five minutes) so the late war is the massive one and no match
  waits on a full purse; the clock breaks a tie by wells; the enemy's waves are announced with their
  shapes, their target and the answer, and the voice sounds the alarm. Proof: vector-road.cjs at the
  phone glass and on a desk (the temper chip reads NORMAL and the state agrees; the rest as before),
  tools/tempers.js, headless wars resolve at 191 s and 239 s with peaks of 587 and 881 bodies.

- **2026-09-24 · THE POINTER (v0.5.0).** His word, before playing v0.4: "I didn't see the strategy in it.
  I didn't know what I was doing. Some instructions were coming up. I couldn't really follow them." So
  the instructions stopped being sentences. The coach points: the card to tap glows, the place is marked
  on the field with a word, the line is four words with a dim reason, and the glowing card goes where the
  mark is. When a shape beats a shape the field says so where it happened. The coached player reads the
  same advice and the yardstick held (EASY 4-0, NORMAL 2-2, HARD 0-4 over four seeds). Proof:
  vector-road.cjs at the phone glass and on a desk (at the bell the label reads TAP THE GLOWING CARD, one
  card glows, the mark reads CLAIM; the glowing card sends its battalion to the well the coach pointed at;
  the rest as before), frames viewed.
