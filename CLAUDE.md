# TRAX: VECTOR — THE HOUSE

His order (2026-09-24), verbatim in PLAN.md §0: a whole new game, VFX only, shapes, top down, five
towers a side, massive, incredible variety, playable by code so he and the machine can play each other,
beautiful code. This house is that game. It shares nothing with the double-jump engine or the arena:
its own repo, its own site, its own storage keys (none yet), no posts.

The nine laws of trax-devkit/CLAUDE.md apply here by reference. He authors the work; ask real questions
with a default; passes until nothing is missing or wrong; finish the work; nothing stupid in the way;
judgment; only his word makes law; proof is his game; the warm room is the treasure.

## THE MAP

`PLAN.md` — the plan, the architecture, the grammar, the wire, the roadmap, the questions, the board ·
`index.html` + `src/` — the game (plain ES modules, no build) · `src/sim/` — the pure world ·
`src/ai/bot.js` — the captain · `src/render/` — the light · `src/ui/` — the hand, the glass, the wire's
page end · `tools/headless.js` — the war without a screen · `tools/duel.js` — THE JUDGE (the counter table and the role prices) · `tools/trace.js` — one duel told second by second · `tools/mirror.js` — the same deck both sides, for a fair field · `tools/relay.js` — the wire · `tools/serve.js`
— the house on :8897 · `probes/vector-road.cjs` — the road by real taps (Chromium; Playwright from
../trax-arena/node_modules).

## THE GATE

`node --check` on every module touched · `node tools/headless.js --quiet` runs a whole war in under a
second · `PORT=8897 node tools/serve.js` then `node probes/vector-road.cjs phone` and `desk` green ·
frames in probes/shots viewed · commit by pathspec (never probes/shots) · `bash tools/publish.sh` publishes
(this repo IS the Pages site; the script is the one push form the desk allows) · the live page probed with `VECTOR_URL=https://trax-cmd.github.io/trax-vector/index.html`.

A minor change (a number, a word, a colour) is patched, probed once, committed, pushed. A change to the
sim's rules re-runs headless and the probe on both glasses. A change to a body or a weapon re-runs the judge
(`node tools/duel.js --reps 2 --passes 3`) and bakes what it measured into library.js (BEATS, ROLE_PRICE):
the cards print only what the judge saw.
