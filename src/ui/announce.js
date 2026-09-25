// announce.js — THE PLATE. One line of news at a time over the field, in the side's colour: a wave by
// name, a front that moved, the centre taken, a gate shattered, a lane broken, a surge. Three may wait,
// the loudest first; a quieter one is dropped when the queue is full; a plate gives way early when news
// waits behind it, and at once to louder news - a shatter cuts the surge plate the frame it lands, so its
// plate, its low hit and the duck ride the flash (§5.4's priority read whole; the critic's round 3). A tap
// follows the plate's lane. Every lane is spelled by lanes.js; every plate has its motif in sound.js,
// played the moment the plate shows.
//
// main.js may hand every sim event to event(e) — plateFor() turns the ones that are news into plates — or compose
// its own words and call say(text, { team, lane, prio, sound }). In a text, the segment `X answers` prints X in gold.
import { laneWord } from '../sim/lanes.js';
import { ROLE_GLYPH, LOSES, SUPER_NAMES } from '../sim/library.js';

// THE BUDGETS (§4.8 / §5.4)
const IN_MS = 150, HOLD_MS = 2200, OUT_MS = 200, QUEUE = 3, FRONT_GAP_MS = 8000;
const CUT_MS = 1500;   // the hold when another plate waits: the break plate reads 1.5 s after the shatter plate (§5.2)
export const PRIO = { shatter: 7, laneBreak: 6, surge: 5, wave: 4, front: 3, centre: 2, yourWave: 1 };
const MOTIF = { 7: 'shatter', 6: 'laneBreak', 5: 'surge', 4: 'wave', 3: 'frontUp', 2: 'centre', 1: 'yourWave' };   // by priority, when say() names none

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
      const text = e.team === his ? `${lw(e.lane)} LANE BROKEN · THE KEEPS ARE OPEN` : `${lw(e.lane)} LANE LOST · YOUR KEEPS ARE OPEN`;
      return { text, team: e.team, lane: e.lane, prio: PRIO.laneBreak, sound: 'laneBreak' };
    }
    case 'surge': {
      if (e.team === his) return { text: `YOU SURGE · ${lw(e.lane)} · ${ROLE_GLYPH[e.role]} ${SUPER_NAMES[e.role]}`, team: his, lane: e.lane, prio: PRIO.surge, sound: 'surge' };
      const answer = LOSES[e.role][0];   // the first counter to the surging role; a role with none is named by its super
      const tail = answer === undefined ? `${ROLE_GLYPH[e.role]} ${SUPER_NAMES[e.role]}` : `${ROLE_GLYPH[answer]} answers ${ROLE_GLYPH[e.role]}`;
      return { text: `THEY SURGE · ${lw(e.lane)} · ${tail}`, team: theirs, lane: e.lane, prio: PRIO.surge, sound: 'surgeEnemy' };
    }
    case 'wave': {   // the captain's wave by name; his own musters are YOUR WAVE, counted by drag.js
      if (e.team === his) return null;
      const answer = LOSES[topOf(e.roles)] && LOSES[topOf(e.roles)][0];
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
      return { text: mine ? 'YOUR LAST KEEP FALLS' : 'THEIR LAST KEEP FALLS', team: mine ? theirs : his, lane: -1, prio: PRIO.shatter, sound: 'doom' };
    }
    default: return null;
  }
}

const esc = (s) => s.replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
// the answer glyph in gold: `· ◆ answers` -> `· <b class="gold">◆</b> answers`
export function render(text) { return esc(text).replace(/(^|· )(\S) answers/g, '$1<b class="gold">$2</b> answers'); }

export function createAnnounce({ el, state, follow, sound }) {
  const queue = [];    // the plates waiting, loudest first, oldest first among equals
  let current = null;  // the plate on the glass: { text, team, lane, prio, sound, at, leaving }
  const frontAt = [-Infinity, -Infinity, -Infinity];   // the last front plate per lane: one per lane per 8 s, the first one free
  const now = () => performance.now();

  // queue a plate; false when it was dropped (a full queue with nothing quieter, or a front plate too soon after the last)
  function say(text, { team = state.team, lane = -1, prio = PRIO.yourWave, sound: motif } = {}) {
    const t = now();
    if (prio === PRIO.front && lane >= 0 && t - frontAt[lane] < FRONT_GAP_MS) return false;
    const plate = { text, team, lane, prio, sound: motif === undefined ? MOTIF[prio] : motif, at: 0, leaving: 0 };
    if (queue.length >= QUEUE) {
      if (plate.prio <= queue[queue.length - 1].prio) return false;   // the tail is the quietest and the newest of the quiet
      queue.pop();
    }
    let i = queue.length;
    while (i > 0 && queue[i - 1].prio < plate.prio) i--;
    queue.splice(i, 0, plate);
    if (prio === PRIO.front && lane >= 0) frontAt[lane] = t;
    return true;
  }
  function event(e) { const p = plateFor(e, state.team, state.glass); return p ? say(p.text, p) : false; }

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
    if (current && queue.length && queue[0].prio > current.prio) current = null;
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
