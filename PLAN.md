# TRAX: VECTOR — THE PLAN

A top-down war of shapes and light on three lanes. Each side holds three gates and two keeps; you drag
a card onto a lane and a battalion musters at that lane's gate and marches, checkpoint by checkpoint,
toward theirs. Nothing is a sprite: every body is a shape drawn from a formula, every weapon a line of
light. The same code runs without a screen, so a captain written in code plays it in real time, and a
person and a machine can play each other.

Working title VECTOR. The name is his call (open, below).

## 0. HIS ORDER, VERBATIM (2026-09-24)

"We're going to create a whole new game. I mean, the way these allies work is crap. But the first thing we're going to do is we're going to lay the foundation for a whole new game. It's not going to be any more sprites. It's going to be VFX only. And what we're going to do is we're only going to use orbs and cubes or squares, just shapes, essentially, polygons, that are going to have different weapons but it's going to be just interesting VFX but we're going to harness the power of AI and create incredible variety which is what you're capable of doing okay so you have to think on a massive scale of making a new game with incredible variety and we're just deploying against a battlefield. And it's going to be viewed from the top down, like a strategy game. And basically, from different points of the map, I could deploy different units to attack different towers. So, basically, maybe the enemy has five towers, and I have five towers, and we're looking from the top down. And from each tower, I could deploy a variety of different units and it's going to have to be massive with a massive battle. So this is not a joke. You have to plan out this game and plan out how you want to set up the architecture because it's just going to be simple but it's not going to mimic a game from the 90s. It has to be something that's going to be a hallmark of the AI digital age. With such a crazy variety of units and abilities and effects that it's just going to have emergent gameplay. But in order to do this, you have to really think like a master AI. And you have to make sure you know your actual capabilities. Something that you yourself can play using code. Okay? That you're not going to be confused between what I'm playing and what you're playing. You know, to the point that me and you could play one another. That's really the goal there. So you have to make a game that you yourself can play somehow. I understand it might not be in real time or whatever, but somehow, it would be nice if it was in real time. Some things might have missiles, some things might have electric, something might have this, but all simple VFX you can do. Without having to reiterate and do a bunch of bullshit. Something with beautiful code."

## 1. THE GAME IN ONE PAGE (v0.6 THE BREACH)

**His words (2026-09-25), verbatim:** "first and foremost, the graphics suck. Those fuzzy fucking lights and that fucking fluff look like shit. I can't really even see the action. All I see is a bunch of bulbs walking around. And I still don't know what each one does. I don't see much strategy. I'm just tapping the shit around. The user interface is kind of corny. I have to go click on some tower, or some resource. I'm not doing anything special, it's not epic. Figure out how to make it epic. Stop with the mediocrity."

**The one sentence.** Three lanes between two sides' gates; you drag a card onto a lane and a battalion
musters at that lane's gate and marches; the fronts move checkpoint by checkpoint; kills fill a SURGE you
drag onto a lane; a gate at 0 hp SHATTERS with a shockwave the sim feels and the screen shows; the enemy
answers with a wave called by name. The contract it was built against is `SPEC-v0.6.md`.

- **THE LANES.** A dark field 9000 by 5000 seen from above. Three bands 800 wu tall, centred at y 1000,
  2500 and 4000, run between the gates at x 1100 and x 7900, with near-black void between them and a
  yard behind each side's gates. A body belongs to the lane it mustered in: it is held inside its band
  while in the run and fights only its own lane (shots and blasts still hit whatever they touch). The sim
  knows lanes 0, 1, 2; the glass names them - LEFT / CENTRE / RIGHT on the phone stood up (mirrored for
  the east), TOP / CENTRE / BOTTOM on its side and on a desk - and only `laneWord()` in
  `src/sim/lanes.js` ever spells one.
- **THE STRONGHOLDS.** Three gates a side (2,500 hp), one at the head of each lane, and two keeps
  (3,500 hp) in the yard behind them, reached only through a dead gate. Each pays 6 a second while it
  stands. A gate takes a tenth of small arms and the long guns (⬢) whole; a keep takes almost nothing
  from small arms and half from the long guns; a surging lane lands its shots whole on the gate it
  surges at. The surge is the breach.
- **THE CHECKPOINTS AND THE FRONT.** Five points a lane at x 1900, 3200, 4500, 5800 and 7100; the
  middle one is THE CENTRE (12 a second to its owner, any other point 6; a full board is 108 a second
  against 30 from the strongholds). One capture rule: a side alone on a point turns it at 0.5 a second
  while it carries the enemy's sign and 0.25 toward its own - an enemy point in 6 s, a neutral one in 4;
  both sides present freeze it. A side gains points in order from its own end. Each lane's FRONT is the
  midpoint between a side's last held point and the next; it moves point by point, drawn as a bar across
  the band with a chevron, and every move is news.
- **THE MARCH.** A battalion forms 220 wu ahead of its lane's gate (its nearest keep when the gate is
  dead), heavy bodies in front, folded inside the band, and marches to the point it was sent to. It holds
  there 20 s (45 on a DEFEND) and moves on when the point is its own or nothing has come for 8 s - point
  by point, then the gate, then the keeps. The first body to reach a point not its own stands as its
  picket and turns it while the rest march on; a body sees the enemy's vanguard in its lane a point and a
  half away and closes on it; an unopposed march goes half again as fast. The nearest enemy in reach
  always comes first.
- **THE DRAG, THE MAIN VERB.** Press a card and move 12 px: the battalion's ghost - its real formation
  as outlines - rides 48 px above the finger, the lane under the finger lights, the point it will go to
  snaps under a gold ring with a chip (`CENTRE · POINT 3`, `THEIR GATE · CENTRE`, `DEFEND · LEFT ·
  POINT 2`), a dotted march line runs from the gate that will muster it, and that gate pulses. Let go and
  the ghost flies back into the gate and comes out as the real bodies. Let go over the hand, the strip or
  the chrome and nothing is charged (`RELEASE TO CANCEL`). The minimap and the strip's lane arrows take a
  drop too.
- **THE HOLD AND THE TAP.** Hold a card still for 180 ms and the field answers: every enemy body it
  beats wears a green ring, every enemy that beats it a red one, and the banner reads its job, what it
  beats and what it loses to, and `good 12 · bad 9` - the bodies it beats against the bodies that beat it
  in the lane on the glass. A quick tap sends the card where the coach points.
- **THE COACH, WHO POINTS.** One card glows gold with a GO tag, the lane's front bar pulses gold with
  ONE WORD - DEFEND, ALARM, SURGE, BREAK, TAKE, PUSH - and a gold dot marks that lane's arrow on the strip
  when it is not the lane on the glass. No sentence on the glass; the reason is in the held card's banner.
- **THE SURGE AND THE SUPERS.** Kills fill a meter of 10,000 (six points per energy of enemy bodies
  killed at the bell's prices), a capture +800, THE CENTRE +1,200, a shattered stronghold +2,500. Full,
  the band under the strip pulses gold - `SURGE READY · DRAG TO A LANE` - and dragged onto a lane it gives
  every body of the side there its shape's super for 8 s: ● OVERDRIVE (fire ×2.5, speed ×1.4),
  ■ BULWARK (+200 shield, damage taken halved), ▲ BLINK (a jump of up to 400 wu at its target, the next
  three shots ×3), ⬢ BARRAGE (a five-shot salvo, no blind ring, splash ×1.5), ◯ NOVA (an EMP pulse and a
  heal of 30 %), ◆ EXECUTE (cloaked, beams ×4 on the wounded). The plate says it: `YOU SURGE · CENTRE ·
  ▲ BLINK`.
- **THE SHATTER AND THE LANE BREAK.** A gate at 0 hp shatters: the clock slows to 0.35× for 0.8 s, the
  ring breaks into twelve fragments that lie as debris for the rest of the match, a shockwave ring runs
  to 1,400 wu, the glass flashes white, the ground jolts, the camera shakes and the sound ducks after the
  low hit; in the sim every body of the side that lost it within 700 wu is thrown out at 400 wu/s and
  stunned 1.5 s. A dead gate BREAKS ITS LANE: all five points flip to the breaker, a gold line runs the
  lane, the breaker's meter jumps 2,500, and the plates read `THEIR GATE · CENTRE · SHATTERED`, then
  `CENTRE LANE BROKEN · THE KEEPS ARE OPEN`. When a side's last stronghold falls a DOOM wave crosses the
  field at 1,500 wu/s, killing that side's bodies as it reaches them, and the result follows 2.5 s after
  it passes the far corner.
- **THE WAVES BY NAME.** The captain musters in waves - every 40 s at NORMAL, 30 at HARD, 55 at EASY -
  of two to four cards into one lane, announced three seconds ahead with a name from the wave's top
  role: `WAVE 7 · THE IRON TIDE · ■ ■ ● → LEFT · ◆ answers`. The lane pulses red, the alarm sounds, the
  coach's glow moves to the answer. The bell's plate is `WAVE 1 · THE SPEARHEAD · … → ALL LANES`: the
  captain opens with one card into each lane.
- **THE ANNOUNCER.** One plate at a time over the field in the side's colour, three waiting at most,
  the loudest first (a shatter, a lane break, a surge, a wave, a front, the centre, your wave); a louder
  plate cuts a quieter one. Every plate has an oscillator motif - the low hit and the duck, three
  descending squares, a rising or a falling triad, the alarm - and a tap on a plate follows its lane.
- **THE CAMERA, AND THE PHONE STOOD UP.** Three glasses, judged again on every resize: the phone upright
  (390 × 844: the field stands up, his gates at the bottom, one lane 368 px wide running up the glass,
  the hand two rows of four), the phone on its side (844 × 390: one lane 240 px tall across the glass,
  the hand one row of eight) and the desk (1280 × 720). The camera centres on the clear field between
  the chrome and follows a lane - the last ordered, after twelve quiet seconds the hottest - and moves
  only when the followed point leaves the middle half of the glass; a wave's lane or a shatter pulls it,
  unless a finger is dragging or an order is fresh. The minimap is the whole field: a tap follows a
  lane, a card dropped on it musters there.
- **THE PALETTE AND THE SIZE RULE.** Side by hue, role by silhouette, mark and size, never role by
  hue: the west cyan (fill `#12A7C8`, edge `#7FF3FF`), the east red (`#C8321E`, `#FFB07A`), gold
  `#FFD76A` for the coach, the surge, the camera and the prices, green `#5CFF7A` for what a held card
  beats and red `#FF4D4D` for what beats it. A body is a flat fill with a 1.5 px outline, an inner mark
  (a pupil, a plate, a spine, a core, an orbiting dot, a slit), a dark seam against a touching body of its
  side, and no glow; a hurt body hollows while its outline never dims. On the glass no body is under
  10 css px across or over 24, and within a family a bigger body is drawn bigger. Explosions are lines -
  a thin ring, a white disc, a few streaks - never donuts.
- **THE ENERGY AND THE CLOCK.** One pool a side: 800 to open, paid by the strongholds and the points.
  The war grows with the clock: income, muster size and price doubled at four minutes and tripled at the
  bell at eight. At the bell the side with more stronghold hp wins, tie by points held, tie by kills.
- **THE SHAPES ARE THE ROLES.** ● ORBS are THE SWARM; ■ SQUARES THE ARMOR; ▲ TRIANGLES THE STRIKE;
  ⬢ HEXAGONS THE SIEGE; ◯ RINGS THE FIELD; ◆ DIAMONDS THE BLADE. What a body is, you can see. What it
  beats, the card says - and the card says only what the judge measured (§4).
- **THE BATTALIONS.** Seventeen in the library, in lines, columns, wedges, rings and clouds; each match
  drafts eight a side, one of every role and two more.
- **THE TEMPERS.** EASY, NORMAL and HARD on the ⋯ sheet: what the captain earns, how often it looks,
  how many cards a look and how often it sends a wave - set by a yardstick (§4b), not by feel.
- **THE OTHER SIDE.** A captain written in code by default; two captains play each other headless;
  through the wire a person at a keyboard or a model in a chat commands the east of a match a person is
  watching in a browser.

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
index.html               the page: the canvas, the strip, the surge band, the plate, the banner, the minimap's hit box, the hand, the ⋯ sheet, the end card; three glasses
src/main.js              the loop (30 ticks a second whatever the frame rate; slow-time scales dt before the accumulator), the follow camera, the glass, the event router, window.VECTOR
src/sim/lanes.js         THE GEOMETRY: every lane, gate, keep and checkpoint number and the lane words, in one place; pure, no imports
src/sim/sim.js           THE WORLD: pure, deterministic; bodies, shots, mines, strongholds, checkpoints, fronts, the surge, the shatter, the doom, the commands, the snapshot; TEMPERS
src/sim/grid.js          the spatial hash: every "who is near me" in constant time per cell
src/sim/units.js         THE GRAMMAR: genome -> compiled body; the one cost formula
src/sim/library.js       the nineteen bodies, the six roles, the seventeen battalions, the draft, the judge's table and prices, the words the glass prints
src/sim/rng.js           the seeded stream
src/ai/bot.js            THE CAPTAIN: the snapshot -> deploys, announced waves, the surge
src/ai/coach.js          THE COACH: advise(sim, team, snap) -> the verb, the lane, the x, the answers, the card, the reason
src/ai/coached.js        THE COACHED PLAYER: the coach's advice at a person's pace; the yardstick's player
src/render/gl.js         THE LIGHT: WebGL2, no assets; the camera's one formula (toWorld / toScreen), the shape, line, spark, field and minimap passes, the icon atlas, readback
src/render/vfx.js        THE VOCABULARY: sim events -> tracers, rings, streaks, shards, the shatter, the lane break, the doom
src/render/paint.js      THE PAINTER: checkpoints, strongholds, fronts, bodies with their bits, shots, the ghost and the march line, the energy lines
src/render/minimap.js    the whole field in a corner, laid out per glass; tap to follow, drop to muster
src/ui/drag.js           THE DRAG: the card and surge pointer machine - drag, hold, tap, snap, cancel, chips
src/ui/hud.js            the glass: the hand's faces, the strip, the surge band, the banner, the end card
src/ui/announce.js       THE PLATE: the queue of news, its words, its motifs
src/ui/sound.js          THE VOICE: oscillators only, a motif per event, the duck
src/ui/input.js          the field under the finger: pan, pinch, wheel, double-tap, keys
src/ui/relay.js          the page's end of the wire
tools/duel.js            THE JUDGE: every battalion against every other; the table and the role prices
tools/tempers.js         THE YARDSTICK: the coached player against the captain at each temper
tools/timeline.js        THE PROOF LINE: the match of the spec's §0 over eight seeds, both modes, and the replay
tools/headless.js        the war without a screen: two captains, the fronts every 30 s, the cost of a tick
tools/mirror.js          the same deck both sides, for a fair field
tools/trace.js           one duel told second by second
tools/relay.js           THE WIRE: a tiny HTTP relay so a match in a browser is commanded from outside
tools/serve.js           the house on a port
tools/publish.sh         publish = push main (this repo is the Pages site)
probes/vector-road.cjs   the road by real pointers on three glasses, frames taken
probes/vector-wire.cjs   the wire, end to end
```

**Data.** Bodies live in struct-of-arrays typed arrays - position, velocity, hp, shield, cooldown, age,
phase, stun, kind, team, target, goal, and for the lanes `lane`, `goalX`, `holdUntil`, `quiet`, `stage`,
`defend`, the shockwave's `pushX` / `pushY` / `pushT`, BLINK's `charge` and the doom's `doomAt` -
capacity 30,000; shots 80,000 (each with its `mul`, BLINK's ×3); mines 6,000. The strongholds `T` are ten
(0-2 the west gates, 3-4 its keeps, 5-7 the east gates, 8-9 its keeps) with `kind`, `lane`, `hpMax`, `r`;
the checkpoints `WL` are fifteen (index `lane·5 + slot`) with `owner`, `prog`, `contestedAt`. A slot is a
number; a free-list recycles them; the high-water mark trims itself. Nothing allocates in the tick but
the event list, which is capped at 2,400 - except the rare events a glass must never miss, which always
land.

**The tick** (30 a second): commands → income (the strongholds and the points, scaled by the clock; the
east's by its temper) → a surge that has run out closes, an unhonoured wave plate is dropped → the grid
(a counting sort) and each lane's vanguard → for every body: the doom if it is due, retarget (every sixth
tick, staggered), the march, the move (its family's style, the band and its soft edge, the shockwave's
push), magnets, the kamikaze, fire → shots → mines → the checkpoints and the fronts every fifth tick →
the trim → the doom's result or the bell.

**Targeting.** Lane-locked: in the run a body sees only its own lane's enemies, and with none standing
there it does not look. The nearest enemy inside its aggro ring, by its role's eye - a swarm, an armour
or a field takes the nearest, a striker or a blade the weakest in reach, a siege gun the biggest beyond
its blind ring - else the stronghold its march has reached. A cloaked body is unseen beyond 120 wu until
it has just fired. A target is an index: ≥ 0 a body, ≤ −2 a stronghold.

**The commands** (`sim.apply()`; the wire takes the same):
```
{ op: 'deploy', team, batt: id | deck index, lane, x, free? }   a battalion into a lane, marching to x (held to 1300..7700; past the enemy gate = to the keeps, once that gate is dead)
{ op: 'deploy', team, kind: id | index, lane, x, free? }        one body, the same march (the tools and the wire)
{ op: 'deploy', team, tower, batt | kind, goal }                 the legacy form: a goal ≥ 1000 is a checkpoint (index + 1000), a gate or a keep names its lane and x
{ op: 'surge', team, lane }                                      a full meter into a lane: one super per shape for 8 s
{ op: 'wave', team, lane, roles, n?, name? }                     the captain's wave, announced three seconds ahead (lane −1 = ALL LANES); recorded and told, nothing mustered
```
A command lands at a tick boundary and says whether it took; a refused one - a price not covered, a lane
with no stronghold left to muster from, a surge short of 10,000 or into a lane where the side has no
body, any order from a doomed side - changes nothing. A price is `round(cost × mult)`, `mult = 1 + time/240`.

**The snapshot** (`snapshot()`, what a captain and the wire read; small, plain, JSON-able):
```
{ tick, time, energy: [w, e], income: [w, e], mult,
  towers: [{ i, team, kind, lane, x, y, hp, hpMax, alive, threat, guard, hitAgo }] × 10,
  points: [{ i, lane, slot, x, y, owner, prog, west, east, contested }] × 15,
  lanes:  [{ frontW, frontE, held: [5 owners], contested, fielded: [[6], [6]], kills3s, lastAdvance, gateHp: [w, e], gateHitAgo: [w, e], broken: [w, e] }] × 3,
  surge: [w, e], surgeLane: [w, e], surgeLeft: [w, e],
  wave: [{ n, lane, roles, name, inS } | null] × 2,
  counts: [[per kind], [per kind]], fielded: [[6], [6]], alive: [w, e], decks, result }
```
`fielded` is the energy alive per role; `threat` and `guard` the enemy and friendly hp within 700 of a
stronghold; `hitAgo` the seconds since it was last hit (99 if never). The captain sees exactly what a
person sees on the glass, in numbers.

**The events** (`sim.events`, the tick's narration; the renderer, the plates and the voice spend them,
headless throws them away, and the sim never knows a screen exists): `death { x, y, team, kind, r, by,
lane }` (by: the killer's kind, −1 for none) · `hit { x, y, team, dmg, i }` · `shield { x, y, team }` ·
`impact { x, y, team, kind }` · `beam { x, y, x2, y2, team, kind }` · `arc { pts, team, kind }` ·
`pulse { x, y, r, team, kind, emp }` · `aura { x, y, r, team, kind }` · `explode { x, y, r, team, kind }`
· `blink { x, y, x2, y2, team }` · `deploy { x, y, team, kind, lane }` · `muster { x, y, team, role, n,
lane, x2, batt, grp, defend }` · `mine { x, y, team }` · `spawnout { x, y, team, kind }` · `barrel { x,
y, x2, y2, team, kind, i }` · `towerHit { x, y, team, tower, lane, kind }` · `shatter { x, y, team,
tower, kind, lane, by }` · `laneBreak { lane, team, from, to }` · `capture { x, y, team, lane, slot,
from, centre }` · `contested { lane, slot, x, y }` · `front { lane, team, dir, x }` · `surge { team,
lane, role }` · `wave { team, n, lane, roles, name, inS }` · `doom { team, x, y, until }` · `end
{ winner }`. v0.5's `towerDown` and `fortify` are gone.

**The renderer.** WebGL2, no assets, every run of a kind one plain draw: a stream is a float texture of
16-float records the vertex shader reads (instancing cost SwiftShader a pass per instance). One program
per silhouette - the flat fill, the 1.5 px outline, the seam, the inner mark, the state bits (shield,
stun, surge, the hold's green and red, dim, cloak) and the per-family screen floor with its slope; a line
program with a hard edge and a 0.75 px floor; additive sparks drawn last; the field program (the bands,
the void, the yards, the grids, the segment tints, the fronts and their chevrons, the lane light, the
shatter's jolt); and a second, scissored pass for the minimap that draws the same uploaded bodies as 1 px
dots. The camera is one formula, `toWorld` / `toScreen`, and nothing else converts. Before the first
frame the six role icons are drawn and read back once into an atlas the cards copy from, so a card's
icon is the field's own painter.

**Measured on this machine (Node 24, one core, 2026-09-25):** a whole war between two captains at NORMAL
(`node tools/headless.js --quiet`, seed 1) - west by strongholds at 272 s, 8,165 ticks in 1.2 s, 0.15 ms a
tick on average and 3.8 ms at worst, 1,617 bodies alive at the peak, 105 events a tick, 223× real time.
The sixteen matches of the proof line peaked at 303 to 2,092 bodies. A tick has a 33 ms budget. The
frame: sixty a second on all three glasses through SwiftShader (no GPU at all), across a shatter too.

## 4. THE TABLE, AND THE JUDGE THAT WRITES IT

A strategy a player can read needs a counter table that is TRUE. I wrote one by mechanics first; the judge
(`tools/duel.js`) fought every battalion against every other at equal energy and said it was wrong in
sixteen places: rings beat everything (the EMP stunned forever), the swarm lost to everything (every
weapon kills a nine-point body), the coil was an anti-swarm gun in the siege family. Four passes of
mechanics followed, each checked by the judge: a shorter stun and a gentler magnet; the coil to the field
and a cannon for the siege; each role's EYE (a striker or a blade takes the weakest it can reach and
finishes it, a gun takes the biggest beyond its blind ring, the rest take the nearest); artillery with a
MINIMUM RANGE it cannot fire inside, and strikers and blades that dive under the guns; and the price
formula itself - a body's price is the root of what it can take times what it can give (Lanchester),
because the first formula bought a wall of blocks for less than the strikers sent to kill it. Then the
judge PRICED THE ROLES - raising the price of a role that won on average, lowering one that lost - and
wrote the table it measured at those prices, which is what the cards, the banner, the coach's answers and
the captain's counters all read. A promise the field denies is never printed. The judge runs again
whenever a body or a rule changes, and the table moves with it.

**The reading of 2026-09-25, on the lane field (v0.6).** The two lines muster through the lane command
at the gates of the centre lane and stand 900 apart at THE CENTRE, the strongholds out of the fight; two
duels a pair at 1,200 energy a side, both seats folded (`node tools/duel.js --reps 2 --passes 3`, 24 s).
Three passes walked the prices from 09-24's ● 0.63 ■ 1.27 ▲ 0.81 ⬢ 1.86 ◯ 0.86 ◆ 0.84 to ● 0.60 ■ 1.41
▲ 0.80 ⬢ 1.92 ◯ 0.73 ◆ 0.90; nothing then beat the diamond, so THE ANSWER TO BLADE raised its price a
tenth a pass - 1.00, then 1.10, where ▲ +0.26, ■ +0.26 and ● +0.23 beat it. Baked into library.js as
printed: `BEATS = [[5,4],[0,5,2],[5,3],[],[1],[4]]`, `ROLE_PRICE = [0.6,1.41,0.8,1.92,0.73,1.1]`, and
LOSES derived from BEATS:

| shape | beats | by | loses to |
|---|---|---|---|
| ● SWARM | ◆ BLADE, ◯ FIELD | +0.23, +0.18 | ■ |
| ■ ARMOR | ● SWARM, ◆ BLADE, ▲ STRIKE | +0.49, +0.26, +0.22 | ◯ |
| ▲ STRIKE | ◆ BLADE, ⬢ SIEGE | +0.26, +0.16 | ■ |
| ⬢ SIEGE | — | its best ◆ +0.10, ◯ +0.09 | ▲ |
| ◯ FIELD | ■ ARMOR | +0.16 | ● ◆ |
| ◆ BLADE | ◯ FIELD | +0.33 | ● ■ ▲ |

At the heart, a three-way cycle: squares beat orbs, orbs beat rings, rings beat squares. The triangle
hunts hexagons; the diamond hunts rings and is answered by the orb, the square and the triangle. The
hexagon beats no shape in the open by the judge's margin, so its card prints `—` rather than a promise:
the long guns' trade is the strongholds, which take their shots whole and a tenth of anything else, and
which the judge keeps out of its fight. The card prices at the bell moved with the table - the swarm's
170-190, the armour's 340-620, the strike's 150-270, the siege's 400-810, the field's 150-190, the
blade's 450-490.

Two things the reading says plainly. At these prices the roles win on average ● +0.03 ■ +0.17 ▲ +0.02
⬢ −0.03 ◯ −0.08 ◆ −0.10: the square is the strongest buy. And the walk has not come to rest: the judge
at the baked prices (`--passes 1`) prints THE TABLE HOLDS, but a fresh three-pass walk from them lifts ■
to 1.51, where ■ against ▲ reads 0.00, and calls that one pair broken. On the same bytes the reading
repeats to the digit (two runs, 11:43 and 12:33).

## 4b. THE YARDSTICK, AND HOW THE TEMPERS WERE SET

The coach is a function (`src/ai/coach.js`): from the snapshot it returns the one next move - a verb, a
lane, an x, the shapes that answer, the card and the reason. THE COACHED PLAYER (`src/ai/coached.js`)
reads the same advice and does it at a person's pace: one look every three seconds, one drop a look (two
when the purse is deep), the surge dragged where the coach says. `tools/tempers.js` plays the coached
player against the captain at each temper over eight seeds. A temper is four numbers in sim.js TEMPERS -
the captain's income (incomeM), how often it looks, how many cards a look, how often it sends a wave -
and it is right when a person following the game's own coach wins about half at NORMAL (3-5 to 5-3 of
8), most at EASY (7-8) and few at HARD (1-2).

The first reading, at v0.4, said too hard everywhere (one win of six at NORMAL) and three matches in eight
ran the whole clock with no stronghold touched; the tempers were given a burst per look, the war was made
to grow with the clock, and the reading became EASY 8-0, NORMAL 5-3, HARD 2-6.

**The reading of 2026-09-25, on the lane field with the judge's table baked.** At the numbers then
seated, EASY read 6-2 (too hard for EASY), NORMAL 4-4, HARD 1-7. EASY's income went 0.60 → 0.55: 8-0.
NORMAL read 4-4 at 0.85 and again at 0.95 - but the captain plays NORMAL in both of the proof line's
modes, and at 0.85 the line missed three rows by a seed each (§10); of NORMAL's fair values 0.95 is the
one that holds the whole line (0.90 and 1.00 miss rows), so NORMAL is 0.95. HARD stays 1.05: 1-7. Two
rounds; THE TEMPERS HOLD:

| temper | incomeM | a look every | cards a look | a wave every | the coached player | mean match |
|---|---|---|---|---|---|---|
| EASY | 0.55 | 4 s | 2 | 55 s | 8-0 | 308 s |
| NORMAL | 0.95 | 2.5 s | 3 | 40 s | 4-4 | 302 s |
| HARD | 1.05 | 1.5 s | 4 | 30 s | 1-7 | 332 s |

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

v0.6 threw out the neon - his eye saw fuzzy lights and fluff - and the edge is the light now. A body is a
flat fill with a 1.5 px outline in its side's edge colour, an inner mark that names its role even at the
floor size, and a dark seam that keeps touching bodies of a side countable; a hurt body hollows while its
outline stays whole; nothing glows. A bolt is a white streak with a head in the shooter's colour, never a
lone dot; a missile a small diamond with a streak and grey smoke; a beam one thin line, white and then
the edge colour; an arc a jagged white line with a spark where it bites; a siege gun shows its barrel
toward its target. A death is a thin ring to three radii, a white disc for 80 ms and a few streaks; a
square or a hexagon leaves three shards. A pulse, an aura, a blink and a shield are rings a pixel or two
thick. A held checkpoint sends a thin line home to its gate with a bright dash sliding along it. The
shatter is the only thing that fills the screen: twelve arc fragments that lie as debris, two shockwave
rings to 1,400, a white disc, twenty-four shards and forty sparks, the white flash, the ground's jolt, the
camera's shake, the slow-time and the duck. A lane break runs a gold line up the lane and ripples its
five points; the doom is a ring in the loser's colour crossing the field. Cyan for the west, red for the
east, gold for the coach and the surge, green and red for what a held card beats and what beats it. The
vocabulary grows a word at a time with the abilities.

## 7. PLAYING EACH OTHER

Three levels, honest about what a model can do:

1. **The captain (now).** `src/ai/bot.js` is me playing in real time: a policy I wrote, looking every
   2.5 s at NORMAL inside the match, reading only the snapshot a person sees. When he plays the west, the
   east is the captain. Two captains play each other headless for the ledger.
2. **The wire (now, on one Wi-Fi).** `node tools/relay.js` on this desk; his phone opens the match with
   `?relay=http://<this desk>:8898&b=relay`. The page pulls the east side's commands four times a
   second and posts the snapshot once a second. I, the model, read `/state` and post `/cmd` from the
   chat — a general giving orders every few seconds while the captain's reflexes are the policy. This
   is me and him playing one another: real time for the match, a few seconds a decision for me. That
   cadence is the truth of what I am; the plan does not pretend otherwise.
   On the lanes (v0.6) an order on the wire is `{"op":"deploy","team":1,"batt":"PHALANX","lane":1,"x":4500}`
   and a full meter `{"op":"surge","team":1,"lane":1}`; the old tower-and-goal form still maps onto a lane.
3. **The worker (next).** The same relay as a Cloudflare worker with a room code, so the wire works
   from anywhere, and lockstep for two people: since the sim is deterministic, two browsers exchanging
   only commands run the same war.

## 8. THE ROADMAP

The first roadmap, as written at v0.1. What shipped, version by version, is the board (§10): v0.2 THE
FIELD OF WELLS, v0.3 THE HARVEST, v0.4 THE TEMPERS, v0.5 THE POINTER, v0.6 THE BREACH.

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
- The field. Default: three lanes; three gates (2,500 hp) and two keeps (3,500 hp) a side; five
  checkpoints a lane, THE CENTRE in the middle.
- The economy. Default: 800 to open; 6 a second per living stronghold, 6 per held point, 12 for THE
  CENTRE; income, muster size and price doubled at four minutes and tripled at the bell. (The arena's
  lesson stands: a war chest makes the opening the whole war — say the word and it is 20×.)
- The end. Default: all five strongholds of a side (then the doom wave), or the bell at eight minutes on
  stronghold hp, tie by points held, tie by kills.
- The panel. Default: seventeen battalions; each match drafts eight a side, one of every role and two
  more.
- The tempers. Default: NORMAL; EASY and HARD on the ⋯ sheet (a new match).
- The sides. Default: the person plays the west; `?team=1` plays the east; `?a=bot&b=bot` spectates.
- Sound. Default: on - oscillators, no samples; SOUND on the ⋯ sheet mutes it and the page remembers.

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

- **2026-09-25 · THE BREACH (v0.6.0).** His word, after playing v0.5 (verbatim in §1): the graphics
  suck - fuzzy lights and fluff, a bunch of bulbs walking around; he can't see the action, doesn't know
  what each one does, sees no strategy, just taps; the interface is corny; make it epic. My decisions,
  written as `SPEC-v0.6.md` and built against its interfaces by seven owners (SIM, AI, two for the
  render and two for the glass in parallel, TOOLS after the sim) with MAIN integrating: three lanes
  between two sides' gates, five checkpoints a lane and a front that moves point by point; the DRAG as
  the verb, the HOLD that rings on the bodies themselves what a card beats in green and what beats it in
  red, the TAP that follows the coach; a SURGE meter filled by kills and captures and dragged onto a lane
  for six supers; a gate that SHATTERS with a shockwave the sim feels and breaks its lane open, and a
  doom wave for the last keep; the captain's waves announced by name; a plate queue with a voice; a
  camera that follows a lane and stands up on the phone; crisp shapes with outlines, marks and seams, no
  glow, never under 10 px.
  - **The judge** (`tools/duel.js --reps 2 --passes 3`): the table and prices of §4, baked as printed -
    `BEATS [[5,4],[0,5,2],[5,3],[],[1],[4]]`, `ROLE_PRICE [0.6,1.41,0.8,1.92,0.73,1.1]`, the diamond
    lifted 0.90 → 1.10 until three shapes beat it. At those prices THE TABLE HOLDS; a fresh three-pass
    walk from them breaks one pair (■ against ▲ at 0.00 with ■ at 1.51).
  - **The yardstick** (`tools/tempers.js --seeds 8`), two rounds: EASY 8-0 (incomeM 0.60 → 0.55),
    NORMAL 4-4 (0.85 → 0.95, for the proof line), HARD 1-7 (1.05) - THE TEMPERS HOLD, matches of 302 to
    332 s on average.
  - **The proof line** (`tools/timeline.js`, eight seeds, both modes, 24 s): GREEN. The captain against
    the coached player: the first death at 6.9-9.5 s, the first contested point at 9.3-19.2 s, the first
    front move at 4.5-4.7 s, the first gate hit at 23.4-100.1 s, both meters full before it in 7 of 8,
    both surges fired in 8 of 8, a shatter in 8 of 8 (at 43.1-130.9 s), no quiet longer than 6.6 s, 0
    stalls, 6 of 8 past 240 s (matches of 233-379 s; the player won 4, the captain 4), 303-1,984 bodies at
    the peak.
    Captain against captain: the first death at 6.4-7.3 s, contest 6.2-8.8 s, front 4.3-4.5 s, gate hit
    18.7-28.2 s, both meters full first in 6 of 8, both fired in 8 of 8, a shatter in 8 of 8
    (27.7-110.3 s), no quiet over 5.4 s, 0 stalls, 8 of 8 past 240 s (matches of 252-480 s; west 4, east
    4), peaks of 929-2,092.
    Every tick of every match: no body outside its band in the run; every lane break flipped its five
    points the same tick; every doom inside its 8.57 s with the result `strongholds`; the captain's
    opening one battalion a lane at tick 1. Replay byte-equal (seed 1 in the line; seed 3 alone with
    `--twice`, 6,986 ticks). The bake cost the line its margin: at NORMAL 0.85 it missed three rows by a
    seed each (the coached matches past 240 s 5 of 8, the captains' meters full before the first gate hit
    5 of 8, one lull of 8.7 s), and at 0.90 and 1.00 rows miss too; at 0.95 every row meets its need,
    some by one seed.
  - **The mirror** (`tools/mirror.js --seeds 6`, one deck both sides, equal income): west 5, east 1 -
    and on the table before the bake west 1, east 5. The lean flips with the prices: a mirror is won by
    the side whose snowball starts first, not by the field's side.
  - **Headless** (`tools/headless.js --quiet`): a whole war in 1.2 s (west by strongholds at 272 s,
    8,165 ticks, 0.15 ms a tick, 3.8 at worst, 1,617 alive at the peak, 223× real time).
  - **The road** (`probes/vector-road.cjs`, Chromium, WebGL2 through SwiftShader, on the final bytes),
    every check green on all three glasses (and on the bytes before the bake, at 12:14-12:16, green too).
    PHONE 844 × 390 @2x, 40 s: the boot clean (10 strongholds, 15 points, the glass `landscape`, eight
    cards 98 × 64 with no scroll, the strip `◆ 844 +30/s` and `7:58`, the T C B arrows 44 × 36, the ⋯
    44 × 44); at the bell one card glows GO and the word reads PUSH on the centre lane; a real drag
    (mouse, and a CDP touch drag that agreed) of the glowing PHALANX to the field's centre mustered 5
    bodies into the centre lane at x 4500 under the chip `CENTRE · THE CENTRE`, charged 364 of 364, the
    order chip alive 1,216 ms, the card's flash 5 ms after the release; a drag let go over the hand
    charged nothing (`RELEASE TO CANCEL`); two taps sent two PHALANX where the coach said DEFEND (lane 0,
    x 1,500); a hold armed in 199 ms with the banner `● SWARM · cheap, many · beats ◆ BLADE ◯ FIELD ·
    loses to ■ ARMOR · good 12 · bad 9` and 7,982 green and 7,303 red pixels on the bodies; the
    unaffordable card shook in 27 ms and never lifted; the surge band READY in 24 ms, dragged to the
    centre (the meter zeroed, `YOU SURGE · CENTRE`, the band drained in 306 ms); the forced shatter 61 ms
    after the darts, the flash that frame, slow-time on, `SHATTERED` and then `BROKEN` 1,849 ms later,
    the lane's five points all the west's, the meter 1,000 → 3,500; the wave `WAVE 2 · THE HALO · ◯ ◯ ◯
    → TOP · ● answers` at 30.9 s with the alarm; the minimap at (676, 60) 160 × 89, a tap on its centre
    band followed the lane in 33 ms with the camera there in 232 ms, a drop on its top band mustered into
    lane 0; the 12 s battle frame 37 blobs of 10 px or more (west 13, east 23), 2 white tracers of 12 px
    or more, 0 glow pixels, a dark seam between motes in 54 of 74 pairs; 60 fps at 12 s and across the
    shatter. The budgets read back: the card lift 57 ms (80), the lane light 115 in and 222 out (100 /
    200), the return flight 237 (220), the card flash 133 (120), the chip 1,216 (1,200), the preview 199
    (180), the shake 201 (200), the surge drain 0.4 s, the shatter flash 232 (250), slow-time 765 (800),
    the camera shake 465 (500), the re-follow 14 frames (12); every plate the phone saw was cut by a louder
    one, so its plate timing went unread this run.
    PORTRAIT 390 × 844 @3x, 39 s: the same road stood up - the glass `portrait`, eight cards 89 × 92 in
    two rows, the arrows L C R; the drag 5 bodies for 364; the hold 22,157 green and 13,361 red pixels
    (`good 12 · bad 6`); the surge drained in 308 ms; the shatter 145 ms after the darts, `BROKEN` +1,867
    ms; the wave `WAVE 2 · THE HALO · ◯ ◯ ◯ → LEFT · ● answers` at 33.5 s (its frame taken on a wave
    announced by hand); the minimap at (298, 484) 84 × 150, the camera there in 249 ms; the plate 1,667 ms
    (cut by a waiting plate, the spec's 1,650); 27 budgets, none off; the battle frame 32 blobs (west 12,
    east 19), 2 tracers, 0 glow, seams in 30 of 39 pairs; 60 fps.
    DESK 1280 × 720, 50 s: eight cards 120 × 100; the drag 5 bodies for 363; the hold 683 green and
    1,026 red pixels (`good 12 · bad 9`); the surge 320 ms; the shatter 109 ms after the darts, `BROKEN`
    +1,882 ms; the wave `WAVE 2 · THE KNIFE HOUR · ▲ ◯ ⬢ → CENTRE · ■ answers` at 40.0 s; the minimap at
    (1028, 467) 240 × 133, the camera there in 204 ms; the desk's keys (digits 1-8 mustered eight, W + 2
    six bodies into the centre lane, the wheel clamped at 1.20 and 0.30, a hover armed the preview in
    219 ms); the plate 2,367 ms (2,350); 28 budgets, none off; the battle frame 28 blobs (west 13, east
    12), 3 tracers, 0 glow; 60 fps. Frames viewed: `road-{phone,portrait,desk}-{1-battle,2-drag,3-hold,
    4-shatter,5-wave}.png`. NOT YET LIVE: the page at trax-cmd.github.io/trax-vector still serves
    v0.5.0 THE POINTER (read the same day); the commit, `bash tools/publish.sh` and the road on the live
    page with `VECTOR_URL` are the steps left, and the proof standard above is not met until they are.
  - **The critic** (a screenshot critic reading the probe's runs and frames against the spec's §11)
    judged three rounds, each followed by fixes from the owners it named. Round 1: FAIL, 20 findings (the
    bell and the budgets red on the phone, the bell and the fps red on portrait among them) - the
    captain's hunt past a dead keep, the portrait's fps (29.9 → 60 idle, 39.1 → 60 in battle), the energy
    lines, the plate's layout, the drag's lead to a mark off the glass, the coach, the probe. Round 2:
    every probe check green on the three glasses, 4 findings - the proof line's pacing rows, the coached
    side's meter before the first gate hit (3 of 8 → 8 of 8), the labels' clip, the portrait card's role
    glyph. Round 3: 5 findings (one probe check red on the desk, frame findings, one acceptance line) -
    the follow's twelve seconds took back every re-follow, the drag's chip stamped across a plate, the
    shatter's plate waiting behind the surge's, the coach's word on the minimap, and headless over two
    seconds (3.0-3.3 s → 1.1 s). The fourth round's critic could not run (the account's credits
    ran out, twice), so round 3's repairs stand on the road and the proof line above, not on a critic's
    verdict.
