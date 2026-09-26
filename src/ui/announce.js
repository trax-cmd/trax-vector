// announce.js — THE PLATE. One line of news at a time over the field, in the side's colour: a wave by
// name, a front that moved, the centre taken, a gate shattered, a lane broken, a surge. Three may wait,
// the loudest first; a quieter one is dropped when the queue is full, never a wave (an order to answer waits its turn); a plate gives way early when news
// waits behind it, and at once to louder news - a shatter cuts the surge plate the frame it lands, so its
// plate, its low hit and the duck ride the flash (§5.4's priority read whole; the critic's round 3), and the
// doom cuts the shatter plate of its own tick, so it reads while its ring still crosses the glass. A tap
// follows the plate's lane. The routine news - a front that moved, the centre taken - speaks only for the
// lane he follows; the strip's arrows and the minimap carry the other two. Every lane is spelled by
// lanes.js; every plate has its motif in sound.js, played the moment the plate shows.
//
// main.js may hand every sim event to event(e) — plateFor() turns the ones that are news into plates — or compose
// its own words and call say(text, { team, lane, prio, sound }). In a text, the segment `X answers` prints X in gold.
import { laneWord } from '../sim/lanes.js';
import { ROLE_GLYPH, LOSES, SUPER_NAMES, GATE_BREAKER } from '../sim/library.js';

// THE BUDGETS (§4.8 / §5.4)
const IN_MS = 150, HOLD_MS = 2200, OUT_MS = 200, QUEUE = 3, FRONT_GAP_MS = 8000;
const CUT_MS = 1500;   // the hold when another plate waits: the break plate reads 1.5 s after the shatter plate (§5.2)
// THE DOOM stands over §5.4's seven: the last keep's shatter plate lands on the doom's own tick, and at a shared 7 the doom
// plate waited CUT_MS behind it - it showed 1.4 s after the fall, over a still crowd, once the 1,500 wu/s ring had left the
// phone's half-view (the critic's round-3 late phone frame). §5.3 wants it 'at the doom', so it cuts the shatter plate.
export const PRIO = { doom: 8, shatter: 7, laneBreak: 6, surge: 5, wave: 4, front: 3, centre: 2, yourWave: 1 };
const MOTIF = { 8: 'doom', 7: 'shatter', 6: 'laneBreak', 5: 'surge', 4: 'wave', 3: 'frontUp', 2: 'centre', 1: 'yourWave' };   // by priority, when say() names none

// the most frequent role of a wave; on a tie the one listed first (the captain leads with the card that heads the wave); -1 for none
export function topOf(roles) {
  const n = [0, 0, 0, 0, 0, 0];
  let top = -1;
  for (const r of roles) { n[r]++; if (top < 0 || n[r] > n[top]) top = r; }
  return top;
}

// THE TEXTS (§5.4), pure: a sim event read from `his` side, or null when it is not news for the plate
export function plateFor(e, his, glass) {
  const lw = (lane) => (lane >= 0 && lane <= 2 ? laneWord(glass, his, lane) : 'ALL LANES');
  const theirs = 1 - his;
  switch (e.t) {
    case 'shatter': {   // e.team lost the stronghold, e.by broke it; the plate wears the breaker's colour
      const mine = e.team === his, own = mine ? 'YOUR' : 'THEIR';
      const text = e.kind === 1 ? `${own} KEEP SHATTERED` : `${own} GATE · ${lw(e.lane)} · SHATTERED`;
      return { text, team: e.by, lane: e.lane, prio: PRIO.shatter, sound: 'shatter' };
    }
    case 'laneBreak': {   // e.team is the breaker
      // THE BREAKER, named once: his broken lane opens the keeps, and a keep takes small arms at a five-hundredth but the
      // gate breaker's long guns at half (sim.js THE WALL), so the plate ends with the card that answers the keeps, in the
      // wave plate's gold grammar - the same plate, no new line in the queue. The shatter plate before it keeps its three
      // words (it cuts the surge plate and rides the flash), a surge plate stays about the surge (a surging lane breaches
      // its gate with any shape), and the lost lane's plate names nothing: the answer there is the counter the coach glows.
      const text = e.team === his ? `${lw(e.lane)} LANE BROKEN · THE KEEPS ARE OPEN · ${ROLE_GLYPH[GATE_BREAKER]} answers` : `${lw(e.lane)} LANE LOST · YOUR KEEPS ARE OPEN`;
      return { text, team: e.team, lane: e.lane, prio: PRIO.laneBreak, sound: 'laneBreak' };
    }
    case 'surge': {
      if (e.team === his) return { text: `YOU SURGE · ${lw(e.lane)} · ${ROLE_GLYPH[e.role]} ${SUPER_NAMES[e.role]}`, team: his, lane: e.lane, prio: PRIO.surge, sound: 'surge' };
      const answer = LOSES[e.role][0];   // the strongest counter to the surging role (LOSES is strongest-first); a role with none is named by its super
      const tail = answer === undefined ? `${ROLE_GLYPH[e.role]} ${SUPER_NAMES[e.role]}` : `${ROLE_GLYPH[answer]} answers ${ROLE_GLYPH[e.role]}`;
      return { text: `THEY SURGE · ${lw(e.lane)} · ${tail}`, team: theirs, lane: e.lane, prio: PRIO.surge, sound: 'surgeEnemy' };
    }
    case 'wave': {   // the captain's wave by name; his own musters are YOUR WAVE, counted by drag.js
      if (e.team === his) return null;
      const answer = LOSES[topOf(e.roles)] && LOSES[topOf(e.roles)][0];   // the strongest counter to the wave's top role - for a ⬢ SIEGE wave too
      const text = `WAVE ${e.n} · ${e.name} · ${e.roles.map((r) => ROLE_GLYPH[r]).join(' ')} → ${lw(e.lane)}${answer === undefined ? '' : ` · ${ROLE_GLYPH[answer]} answers`}`;
      return { text, team: theirs, lane: e.lane, prio: PRIO.wave, sound: 'wave' };
    }
    case 'front': {   // his front moved; the loser's copy of the same strip is the same news
      if (e.team !== his) return null;
      return e.dir > 0 ? { text: `${lw(e.lane)} FRONT ADVANCES`, team: his, lane: e.lane, prio: PRIO.front, sound: 'frontUp' }
        : { text: `${lw(e.lane)} FRONT FALLS BACK`, team: theirs, lane: e.lane, prio: PRIO.front, sound: 'frontDown' };
    }
    case 'capture': {
      if (!e.centre) return null;
      return e.team === his ? { text: `THE CENTRE IS YOURS · ${lw(e.lane)}`, team: his, lane: e.lane, prio: PRIO.centre, sound: 'centre' }
        : { text: `THEY TOOK THE CENTRE · ${lw(e.lane)}`, team: theirs, lane: e.lane, prio: PRIO.centre, sound: 'centre' };
    }
    case 'doom': {   // e.team's last stronghold fell; the plate wears the winner's colour
      const mine = e.team === his;
      return { text: mine ? 'YOUR LAST KEEP FALLS' : 'THEIR LAST KEEP FALLS', team: mine ? theirs : his, lane: -1, prio: PRIO.doom, sound: 'doom' };
    }
    default: return null;
  }
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// The plate wraps to two balanced lines on the portrait glass, and a plain space let it break where no reader would. So the
// render binds two things, and the text keeps its plain spaces, as the spec spells it and the probes read it:
// - a wave's glyphs aimed at its lane - `■ ■ ● → LEFT`, the captain's and YOUR WAVE alike - stay on one line ('WAVE 2 · THE
//   HALO · ◯' over '◯ ◯ → LEFT', the critic's round 2);
// - a separator stays with the word before it, so a line may end on '·' but never begin with one ('THEY SURGE · LEFT' over
//   '· ◆ answers ◯', the critic's round 3). A no-wrap span must hold the word too: Chrome breaks before a span that opens on
//   the space, so ` ·` alone bound nothing.
const NOWRAP = '<span style="white-space:nowrap">';
const AIMED = /((?:[^\s\w·→] )+→ (?:ALL LANES|\w+))/g;
const LAST = /(<(span|b)[^>]*>[^<]*<\/\2>|[^\s<>]+)$/;   // a segment's last unit: a group rendered whole, or its last word
// one segment between separators: the aimed group unbroken, and a leading answer glyph in gold (`◆ answers` -> `<b class="gold">◆</b> answers`)
const segment = (s) => s.replace(AIMED, `${NOWRAP}$1</span>`).replace(/^(\S) answers/, '<b class="gold">$1</b> answers');
// the separator after a segment, bound to its last unit
const bound = (s) => (LAST.test(s) ? s.replace(LAST, `${NOWRAP}$1 ·</span>`) : `${s} ·`);
export function render(text) {
  const segs = esc(text).split(' · ').map(segment);
  return segs.map((s, i) => (i < segs.length - 1 ? bound(s) : s)).join(' ');
}

export function createAnnounce({ el, state, follow, sound }) {
  const queue = [];    // the plates waiting, loudest first (by rank), oldest first among equals
  let current = null;  // the plate on the glass: { text, team, lane, prio, rank, sound, at, leaving }
  const frontAt = [-Infinity, -Infinity, -Infinity];   // the last front plate per lane: one per lane per 8 s, the first one free
  const now = () => performance.now();

  // THE PAIR (§5.2): a lane's break plate reads 1.5 s after its own shatter plate. Ranked by priority alone, a second gate's
  // shatter inside that window - both sides breaking a gate at once, the portrait probe's run at 30 s - stood between the two
  // and the break read 3.7 s late, over another lane's news. So a break whose shatter (same lane, same breaker) is up or
  // waiting ranks as that shatter, and news of equal rank keeps its turn: the pair reads as one piece of news.
  const pairs = (s, b) => !!s && s.prio === PRIO.shatter && s.lane === b.lane && s.team === b.team;
  const rankOf = (p) => (p.prio === PRIO.laneBreak && (pairs(current, p) || queue.some((q) => pairs(q, p))) ? PRIO.shatter : p.prio);

  // the index of the quietest waiting plate a full queue may drop - the last that is not a wave (the queue runs loudest first) - or -1
  const quietestNotWave = () => { for (let k = queue.length - 1; k >= 0; k--) if (queue[k].prio !== PRIO.wave) return k; return -1; };
  // queue a plate; false when it was dropped (a full queue with nothing quieter, or a front plate too soon after the last)
  function say(text, { team = state.team, lane = -1, prio = PRIO.yourWave, sound: motif } = {}) {
    const t = now();
    if (prio === PRIO.front && lane >= 0 && t - frontAt[lane] < FRONT_GAP_MS) return false;
    const plate = { text, team, lane, prio, rank: prio, sound: motif === undefined ? MOTIF[prio] : motif, at: 0, leaving: 0 };
    plate.rank = rankOf(plate);
    if (prio === PRIO.doom) queue.length = 0;   // the match is decided: the last keep's shatter plate, queued the same tick, would only say it again after
    // THE WAVE WAITS. A wave plate is an order to answer - its shapes, its lane, the gold answer - so a full queue never drops it: it
    // may stand over the queue's size, and louder news pops the quietest plate that is not a wave. (The probe's portrait runs: the
    // captain's WAVE 2, announced in the seconds his own gate fell, was popped from a queue of shatter and lane plates and never read,
    // its alarm never sounded - the enemy's wave arrived unannounced. Now it reads a second or two late, after the louder news.)
    if (queue.length >= QUEUE && prio !== PRIO.wave) {
      const k = quietestNotWave();
      if (k < 0 || plate.rank <= queue[k].rank) return false;   // the tail is the quietest and the newest of the quiet
      queue.splice(k, 1);
    }
    let i = queue.length;
    while (i > 0 && queue[i - 1].rank < plate.rank) i--;
    queue.splice(i, 0, plate);
    if (prio === PRIO.front && lane >= 0) frontAt[lane] = t;
    return true;
  }
  // THE LANE IN VIEW. Front and centre news came every few seconds from all three lanes - the plate stood over the top of
  // the field three quarters of the first minute and a half, often about a lane off the glass, and a live plate is a drop's
  // cancel zone (the critic's round-1 phone run: 21 of 47 plates were routine, TOP FRONT ADVANCES over the centre lane in
  // view). So routine news prints for the followed lane alone; the strip's arrows take the front's colour and the minimap
  // the owners for the others, and the loud news - a wave, a surge, a shatter, a broken lane - speaks for every lane.
  const followed = () => (state.follow && state.follow.lane >= 0 ? state.follow.lane : 1);
  const routine = (p) => p.prio === PRIO.front || p.prio === PRIO.centre;
  function event(e) {
    const p = plateFor(e, state.team, state.glass);
    if (!p || (routine(p) && p.lane !== followed())) return false;
    return say(p.text, p);
  }

  function show(p, t) {
    current = p; p.at = t;
    if (el.classList.contains('on')) snapOut();   // a cut: the plate on the glass goes without its fade, so the entrance plays again
    el.innerHTML = render(p.text);
    el.classList.remove('t0', 't1'); el.classList.add('t' + p.team);
    el.style.transitionDuration = IN_MS + 'ms';
    el.classList.add('on');
    if (sound && p.sound) sound.play(p.sound, p.team);
  }
  // the plate off at once: no transition, and a layout forced so the browser has seen it off before the entrance starts
  function snapOut() {
    el.style.transition = 'none'; el.classList.remove('on');
    void el.offsetWidth;
    el.style.transition = '';
  }
  // the clock of the plate: in, hold (cut short when news waits), out, next. Louder news cuts the plate at once; the plate
  // cut is gone - its motif has sounded and its words were up, and the field (the band's tint, the arrow's dot, the coach's
  // glow) carries the rest - so nothing shows twice and no motif plays twice.
  function tick(t) {
    if (current && queue.length && queue[0].rank > current.rank) current = null;
    if (current) {
      const hold = queue.length ? CUT_MS : HOLD_MS;
      if (!current.leaving && t - current.at >= IN_MS + hold) { current.leaving = t; el.classList.remove('on'); el.style.transitionDuration = OUT_MS + 'ms'; }
      if (current.leaving && t - current.leaving >= OUT_MS) current = null;
    }
    if (!current && queue.length) show(queue.shift(), t);
  }
  el.addEventListener('pointerdown', () => { if (current && current.lane >= 0 && current.lane <= 2) follow(current.lane); });

  return { say, event, tick, get current() { return current; }, get waiting() { return queue.length; } };
}
