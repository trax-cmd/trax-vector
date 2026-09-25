# TRAX: VECTOR — THE HOUSE

His order (2026-09-24), verbatim in PLAN.md §0: a whole new game, VFX only, shapes, top down, towers a
side, massive, incredible variety, playable by code so he and the machine can play each other, beautiful
code. His word of 2026-09-25, verbatim in PLAN.md §1: the graphics suck, no strategy, a corny interface -
make it epic. This house is that game, at v0.6 THE BREACH: three lanes, one drag, the thirty seconds a
gate falls. It shares nothing with the double-jump engine or the arena: its own repo, its own site, its
own storage keys (`vector_temper`, `vector_mute`), no posts.

The nine laws of trax-devkit/CLAUDE.md apply here by reference. He authors the work; ask real questions
with a default; passes until nothing is missing or wrong; finish the work; nothing stupid in the way;
judgment; only his word makes law; proof is his game; the warm room is the treasure.

## THE MAP

`PLAN.md` — the plan, the architecture, the table, the yardstick, the wire, the board · `SPEC-v0.6.md` —
the contract v0.6 was built against: every number, every interface, the proof line · `index.html` +
`src/` — the game (plain ES modules, no build) · `src/sim/` — the pure world: `lanes.js` THE GEOMETRY
(every lane, gate, keep and checkpoint number and the lane words; nothing else spells a lane), `sim.js`
THE WORLD and the TEMPERS, `library.js` the bodies, roles and battalions, the judge's table and prices and
the words the glass prints, `units.js` the grammar · `src/ai/` — `bot.js` THE CAPTAIN, `coach.js` THE
COACH, `coached.js` the yardstick's player · `src/render/` — `gl.js` THE LIGHT (the one camera formula,
toWorld / toScreen), `vfx.js` the vocabulary, `paint.js` THE PAINTER, `minimap.js` the whole field ·
`src/ui/` — `drag.js` THE DRAG (the card and surge pointer machine), `hud.js` the hand and the strip,
`announce.js` THE PLATE, `sound.js` THE VOICE, `input.js` the field, `relay.js` the wire's page end ·
`src/main.js` — the loop, the camera, the event router · `tools/duel.js` — THE JUDGE (the counter table
and the role prices) · `tools/tempers.js` — THE YARDSTICK (the coached player against the captain at each
temper) · `tools/timeline.js` — THE PROOF LINE (the spec's §0 match over eight seeds, both modes, the
replay) · `tools/headless.js` — the war without a screen · `tools/mirror.js` — the same deck both sides ·
`tools/trace.js` — one duel told second by second · `tools/relay.js` — the wire · `tools/serve.js` — the
house on :8897 · `probes/vector-road.cjs` — the road by real pointers on three glasses (Chromium;
Playwright from ../trax-arena/node_modules) · `probes/vector-wire.cjs` — the wire end to end.

## THE GATE

`node --check` on every module touched · `node tools/headless.js --quiet` runs a whole war in under two
seconds · `node probes/vector-road.cjs phone`, `portrait` and `desk` green (it serves the house on :8897
when nothing answers) · frames in probes/shots viewed · commit by pathspec (never probes/shots) ·
`bash tools/publish.sh` publishes (this repo IS the Pages site; the script is the one push form the desk
allows) · then the live page probed on the three glasses with
`VECTOR_URL=https://trax-cmd.github.io/trax-vector/index.html`.

A minor change (a number he asked for, a word, a colour) is patched, probed once, committed, pushed.
What else a change touches decides what re-runs:
- **a body or a weapon** - the judge, `node tools/duel.js --reps 2 --passes 3`, and what it measured baked
  into library.js as printed (BEATS and ROLE_PRICE; LOSES is derived): the cards print only what the
  judge saw. A bake moves the prices the captains shop at, so the yardstick and the proof line follow it
  (on 2026-09-25 a bake turned the line red until NORMAL's income was re-set).
- **a sim rule** - `node tools/headless.js --quiet`, `node tools/timeline.js` green in both modes, and
  the probe on the three glasses.
- **the captain, the coach or the economy** - the yardstick, `node tools/tempers.js --seeds 8` (NORMAL
  3-5 to 5-3, EASY 7-8, HARD 1-2), and the proof line after it: the captain plays NORMAL in both of the
  timeline's modes.
