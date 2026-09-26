// coach.js — THE COACH, as a function. From the snapshot it returns the one next thing: a VERB, a lane,
// an x, the enemy role it answers, the roles that answer it, the card to tap and the reason in one clause
// (SPEC-v0.6 §6.3). The glass makes that card glow and pulses that lane's front bar gold; the coached
// player (coached.js) makes the same move; so a person who follows the glow plays exactly the policy the
// tempers were measured against. The lane readers below are shared with the captain (bot.js): both sides
// read the field with the same eyes, and the only difference is who is asked to act.
// It reads nothing but the snapshot (§3.8) and the till: sim.price(b).
import { ROLES, ROLE_GLYPH, LOSES, GATE_BREAKER } from '../sim/library.js';
import { GATE_X, KEEP_X, CP_X, CENTRE, slotsToward, laneWord, pointName } from '../sim/lanes.js';

export const VERBS = ['DEFEND', 'ALARM', 'SURGE', 'BREAK', 'TAKE', 'PUSH'];
export const WEAK_DEPTH = 1500;   // an enemy front this close to a gate is a threat (§6.3 rule 1, §8 rule 1)
export const HIT_AGO = 3;         // a gate hit this many seconds ago is a threat
export const SURGE_FULL = 10000;  // the meter's top (§5.1); a surge fires only from a full meter
export const SURGE_SHARE = 0.4;   // the share of a side's fielded energy that makes a lane its hammer
export const SURGE_REACH = 1300;  // the anvil: an enemy point, gate or keep this close to the hammer's front
// THE TILL DRIFT: a queued order is applied one tick after the snapshot it was judged on, and the clock's multiplier
// has stepped by then, so a price can round up one diamond. Every buy that goes through the queue keeps that diamond
// in hand. The glass's own tap applies at once and needs no margin, so pickCard() stays exact for the glowing card.
export const TILL_DRIFT = 1;
export const afford = (price, energy) => price + TILL_DRIFT <= energy;

const total = (a) => a[0] + a[1] + a[2] + a[3] + a[4] + a[5];
const glyph = (q) => ROLE_GLYPH[q];
const glyphs = (qs) => qs.map(glyph).join(' ');
const KEEP = 1;   // T.kind: 0 a gate, 1 a keep (§3.2)
const SIEGE_WHY = ['siege breaks gates', 'siege breaks keeps'];   // the reason when the glowing card is the gate breaker: a gate standing, a gate dead

// the role with the most energy in a fielded row, −1 when the row is empty
export function topRole(fielded) {
  let best = -1, most = 0;
  for (let q = 0; q < 6; q++) if (fielded[q] > most) { most = fielded[q]; best = q; }
  return best;
}

// the role a wave is named by: the most frequent in its list, the first listed on a tie
export function waveTop(roles) {
  const n = [0, 0, 0, 0, 0, 0];
  let best = -1;
  for (const q of roles) { n[q]++; if (best < 0 || n[q] > n[best]) best = q; }
  return best;
}

// a side's living keeps, counted off the snapshot's strongholds
const keepsAlive = (snap, team) => snap.towers.reduce((n, t) => n + (t.team === team && t.kind === KEEP && t.alive ? 1 : 0), 0);
// a side with no stronghold standing: its last one fell, the sim set the doom on it and takes no more of its orders (§5.3)
const fallen = (snap, team) => !snap.towers.some((t) => t.team === team && t.alive);

// one lane as a side reads it: who fields what, where the fronts stand, what the next point is, whether an order
// can even be mustered there and whether there is anything left to break at its far end
export function readLane(snap, team, l, keeps = [keepsAlive(snap, 0), keepsAlive(snap, 1)]) {
  const L = snap.lanes[l], them = 1 - team;
  const own = total(L.fielded[team]), enemy = total(L.fielded[them]);
  const ownFront = team === 0 ? L.frontW : L.frontE, enemyFront = team === 0 ? L.frontE : L.frontW;
  const depth = Math.abs(GATE_X[team] - enemyFront), hitAgo = L.gateHitAgo[team];
  const order = slotsToward(team);
  const nextSlot = order.find((s) => L.held[s] !== team) ?? -1;      // by the ORDER RULE the first point not his is the next capturable
  const enemySlot = order.find((s) => L.held[s] === them) ?? -1;     // the nearest point of theirs ahead of his front
  const gateDead = L.gateHp[them] <= 0;
  // FINISHED: their gate is down and no keep of theirs lives - a card sent here walks to nothing and idles (§3.6 stage 5)
  const finished = gateDead && keeps[them] === 0 ? 1 : 0;
  // MUSTERABLE: his own gate lives, or a keep of his does and the bodies can walk the yard to the lane head; else the sim refuses
  const musterable = L.gateHp[team] > 0 || keeps[team] > 0 ? 1 : 0;
  // THE ANVIL for a surge: their nearest point ahead, else their gate, else (the gate dead) their keeps; a finished lane has none
  const anvilX = enemySlot >= 0 ? CP_X[enemySlot] : !gateDead ? GATE_X[them] : KEEP_X[them];
  return {
    lane: l, own, enemy,
    top: topRole(L.fielded[them]), ownTop: topRole(L.fielded[team]),
    ownFront, enemyFront, depth, hitAgo,
    weak: depth < WEAK_DEPTH || hitAgo < HIT_AGO,
    outnumbered: enemy > own,
    // THE WALK-IN: they field a battalion in a lane he fields nothing in - nothing stands between it and his gate, whatever the
    // front reads (the front moves only as points fall, four of five before the depth test wakes); the coach alone reads this
    walkIn: enemy > 0 && own === 0,
    nextSlot, nextX: nextSlot >= 0 ? CP_X[nextSlot] : gateDead ? KEEP_X[them] : GATE_X[them],   // past the enemy gate's x means the keeps (§3.6)
    reach: finished ? Infinity : Math.abs(anvilX - ownFront),
    centreHeld: L.held[CENTRE] === team,
    centreOpen: nextSlot === CENTRE,   // the centre is the next point: not his, and every point before it is
    gateOpen: nextSlot < 0,            // all five held: the gate (or the keeps) is the next point
    gateDead, finished, musterable,
  };
}

// the three lanes, each with its share of the side's fielded energy
export function readLanes(snap, team) {
  const keeps = [keepsAlive(snap, 0), keepsAlive(snap, 1)];
  const lanes = [0, 1, 2].map((l) => readLane(snap, team, l, keeps));
  const fielded = lanes[0].own + lanes[1].own + lanes[2].own;
  for (const L of lanes) L.share = fielded ? L.own / fielded : 0;
  return lanes;
}

// the order threatened lanes are answered in: a gate under fire first, then a lane where they out-field him, then the
// shallowest enemy front, then the heaviest column. THE OUT-FIELDED RANK IS ADDED ON THE MEASURE: the front moves only as
// points fall, so after the column that pushed it dies or walks on, the depth test still reads 'at his gate' over a lane
// only his own bodies walk. Ranked by depth alone, that lane drew DEFEND (and the captain's defence) for 15 s at a time
// while their real column walked another lane unmet - the timeline's quiet gaps of 8.3-10.8 s (seeds 1 and 3 coached, 6
// captains). A column walking a lane he left empty is now answered before a door his bodies already hold.
const alarmRank = (L) => (L.hitAgo < HIT_AGO ? 0 : L.outnumbered ? 1 : 2);
export const byUrgency = (a, b) => alarmRank(a) - alarmRank(b) || a.depth - b.depth || b.enemy - a.enemy || a.lane - b.lane;

// the lane a full meter should be dragged onto, −1 when there is none: the hammer over the anvil (§6.3 rule 3, §8 rule 4)
export function surgeLane(snap, team, lanes) {
  if (snap.surge[team] < SURGE_FULL) return -1;
  const fit = lanes.filter((L) => L.share >= SURGE_SHARE && L.reach <= SURGE_REACH);
  return fit.length ? fit.reduce((a, b) => (b.own > a.own ? b : a)).lane : -1;
}

// the card to tap: with a stronghold to break (breaker) the cheapest affordable GATE_BREAKER first - its shots land whole
// on a gate or a keep where every other card's are turned by THE WALL (sim.js) - else the cheapest affordable answer;
// with none, the dearest affordable (a body in the lane beats no body, and a person taps the big card); −1 when nothing
// is affordable and the tap waits
export function pickCard(sim, deck, answers, budget, breaker = false) {
  let siege = -1, siegeCheapest = Infinity, cheap = -1, cheapest = Infinity, dear = -1, dearest = -1;
  deck.forEach((b, i) => {
    const p = sim.price(b);
    if (p > budget) return;
    if (breaker && b.role === GATE_BREAKER && p < siegeCheapest) { siege = i; siegeCheapest = p; }
    if (answers.includes(b.role) && p < cheapest) { cheap = i; cheapest = p; }
    if (p > dearest) { dear = i; dearest = p; }
  });
  return siege >= 0 ? siege : cheap >= 0 ? cheap : dear;
}

// the six rules of §6.3 in order, over the lanes an order can be mustered into; glass names the lanes (§1) and
// defaults to his hand, the portrait
export function advise(sim, team, snap, glass = 'portrait') {
  if (!snap || snap.result) return null;
  // THE DOOM DECIDES THE WAR (§5.3): once either side's last stronghold falls the coach is silent until the end card. The
  // loser takes no order; the winner has nothing left to answer - a wave the loser announced will never muster, since its
  // commands are refused, and an ALARM on it would glow over the shatter and THEIR LAST KEEP FALLS
  if (fallen(snap, 0) || fallen(snap, 1)) return null;
  const them = 1 - team, deck = snap.decks[team], energy = snap.energy[team];
  const lanes = readLanes(snap, team).filter((L) => L.musterable);   // never empty here: a standing keep musters every lane, a gate its own
  const word = (l) => laneWord(glass, team, l);
  const on = (l) => (l === 1 ? 'in the ' : 'on the ') + word(l);
  // THE REASON FITS ITS LINE. The banner's sub-line is one line cut with an ellipsis (§4.5: the battalion's line, then
  // 'why this card: ' and this), so every reason stays under sixty characters and the long ones - PUSH, BREAK, ALARM - lead
  // with the clause that says which card answers what, the place after it; DEFEND and SURGE keep §6.3's own words, which
  // fit whole. THE GATE BREAKER: on BREAK, or a PUSH whose lane already stands at their gate, the siege card glows before
  // the counters; when it does, its four words lead and the place follows
  const say = (verb, L, x, top, why, place = why) => {
    const answers = top >= 0 ? LOSES[top] : [];
    const breaker = (verb === 'BREAK' || verb === 'PUSH') && L.gateOpen && !L.finished;
    const card = pickCard(sim, deck, answers, energy, breaker);
    const siege = breaker && card >= 0 && deck[card].role === GATE_BREAKER;
    return { verb, lane: L.lane, x, role: top, answers, breaker, card, why: siege ? `${SIEGE_WHY[+L.gateDead]} · ${place}` : why };
  };
  const bring = (L) => `they bring ${glyph(L.top)} ${ROLES[L.top]} ${on(L.lane)} and ${glyphs(LOSES[L.top])} beats it`;
  // THE OPENING: until his first battalion stands nothing of his is anywhere, and the coach's one word is PUSH CENTRE (§3.7)
  const opening = lanes.every((L) => L.own === 0);

  // 1. DEFEND: an enemy front within 1,500 of his gate, or a gate hit within 3 s - the most urgent lane, at his front; then, once he
  // has opened, a WALK-IN (readLane): a lane they field and he does not, the heaviest first, at his next point up that lane.
  // THE WALK-IN IS ADDED TO §6.3 ON THE MEASURE. The rule names the two door tests alone, but the captain opens into every lane at
  // the bell (§3.7) and the door tests wake only once a wing has lost four points; a coach with the two alone left the coached side's
  // wings empty for 24 s of every match, the captain's battalions walked them to the gate unmet, and the proof line's 'surge full on
  // both sides before the first gate hit' read 3/8 at every value of the lever - the west had nothing to kill and nothing to capture
  // off the centre lane. A person who sees an enemy column walk an empty lane sends someone; the coach now says so. Its x is the next
  // point, not the front: with nothing held the front is the gate's doorstep (1500), where the answer stands eight seconds quiet before
  // the march walks it on; at the first point it captures on arrival and meets the column a point further out (measured: the row 7/8
  // at the doorstep and 8/8 at the point; the coached side's wins at NORMAL 2-6 at the doorstep and 3-5 at the point, the yardstick's
  // own reading before the walk-in).
  const weak = lanes.filter((L) => L.weak || (!opening && L.walkIn)).sort(byUrgency)[0];
  if (weak) {
    const empty = weak.hitAgo < HIT_AGO ? `they are at your gate ${on(weak.lane)}` : `the front is back at your gate ${on(weak.lane)}`;   // no body of theirs in the lane
    const why = weak.top < 0 ? empty : weak.weak ? bring(weak) : `${glyph(weak.top)} ${ROLES[weak.top]} walks the ${word(weak.lane)} unmet and ${glyphs(LOSES[weak.top])} beats it`;
    return say('DEFEND', weak, weak.weak ? weak.ownFront : weak.nextX, weak.top, why);
  }

  // 2. ALARM: a wave they announced, answered at his front in that lane; the bell's plate names every lane (lane −1,
  // WAVE 1 · THE SPEARHEAD → ALL LANES, §5.4) and matches none, so it alarms nothing and t = 0 stays PUSH CENTRE (§3.7)
  const wave = snap.wave[them], alarm = wave && lanes.find((L) => L.lane === wave.lane);
  if (alarm) {
    const top = waveTop(wave.roles);
    return say('ALARM', alarm, alarm.ownFront, top, `${glyphs(LOSES[top])} answers ${glyph(top)} · ${wave.name} comes ${on(alarm.lane)}`);
  }

  // 3. SURGE: the meter is full and a lane holds his hammer over their anvil
  const surge = surgeLane(snap, team, lanes);
  if (surge >= 0) {
    const L = lanes.find((q) => q.lane === surge);
    return say('SURGE', L, L.ownFront, L.top, `the surge is full and your ${glyph(L.ownTop)} hold the ${word(surge)} · drag it there`);
  }

  // 4. BREAK: a lane whose next point is their gate or, the gate dead, their keeps - the one where he fields the most
  const open = lanes.filter((L) => L.gateOpen && !L.finished).sort((a, b) => b.own - a.own)[0];
  if (open) {
    const place = `their ${word(open.lane)} gate ${open.gateDead ? 'is open' : 'stands alone'}`;
    const why = open.gateDead ? `${place} · the keeps are next` : open.top >= 0 ? `${glyphs(LOSES[open.top])} beats what guards it · ${place}` : place;
    return say('BREAK', open, open.nextX, open.top, why, place);
  }

  // 5. TAKE: a centre that is the next point and not his, the least defended first
  const take = lanes.filter((L) => L.centreOpen).sort((a, b) => a.enemy - b.enemy || a.lane - b.lane)[0];
  if (take) return say('TAKE', take, CP_X[CENTRE], take.top, take.lane === 1 ? 'the centre pays 12/s' : `the centre ${on(take.lane)} pays 12/s`);

  // 6. PUSH: his best lane by fielded advantage, tie the enemy's shallowest front, tie the centre - at its next point;
  // a finished lane comes last, since nothing sent there can fight
  const ranked = lanes.slice().sort((a, b) => a.finished - b.finished || (b.own - b.enemy) - (a.own - a.enemy) || b.depth - a.depth || Math.abs(a.lane - 1) - Math.abs(b.lane - 1) || a.lane - b.lane);
  // THE OPENING IS PUSH CENTRE (§3.7, §6.3): until his first battalion stands, the advantage sort says nothing about him -
  // it would only send him where the captain's tick-1 drops are thinnest, a wing - so with nothing of his fielded the lane
  // is the centre whatever they dropped, at the bell and a second and a half after it alike; the sort decides only when
  // the centre cannot take an order (unmusterable, or nothing left to break there)
  const push = (opening && ranked.find((L) => L.lane === 1 && !L.finished)) || ranked[0];
  // the next point by name; with all five held (only a finished lane reaches here) the far end itself
  const point = push.nextSlot >= 0 ? pointName(glass, team, push.lane, push.nextSlot) : `${word(push.lane)} · THEIR ${push.gateDead ? 'KEEPS' : 'GATE'}`;
  const step = opening ? 'the centre pays 12/s' : `${point} is the next step`;   // at the bell the tap's chip names the point
  const why = push.top >= 0 ? `${glyphs(LOSES[push.top])} beats their ${glyph(push.top)} · ${step}` : step;
  return say('PUSH', push, push.nextX, push.top, why, step);
}
