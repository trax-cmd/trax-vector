// hud.js — THE GLASS (SPEC §4.2, §4.6's look, §6.1's face). The fixed hand of eight cards - the icon by
// the field's own painter (R.iconAtlas), the gold price, the name, the role's job, BEATS in green and
// LOSES in red - the strip (energy and its rate, the clock, the three lane arrows), the surge band, the
// banner of the hold preview and the end card. The pointer machine is drag.js's; this file only paints
// and answers. It reads the sim and main.js's state (§9.7) and writes nothing back to either.
import { ROLES, ROLE_GLYPH, BEATS, LOSES, ROLE_JOB } from '../sim/library.js';
import { laneWord } from '../sim/lanes.js';

const PRICE_MS = 500;                     // prices, arcs and waits re-read every 500 ms (§4.2)
const STRIP_MS = 200;                     // the strip's words: five times a second is plenty for a number and a clock
const FLASH_MS = 120, SHAKE_MS = 200;     // §4.8: card flash 120 · unaffordable shake 200
const ICON = 48;                          // one icon of R.iconAtlas: 48 × 48 physical px, roles across, teams down
const EDGE = ['#7FF3FF', '#FFB07A'];      // the side edge colours (§2.1), for the fallback glyph only

export function createHud(sim, state, R, glass) {
  const $ = (id) => document.getElementById(id);
  const hand = $('hand'), energyEl = $('energy'), clockEl = $('clock'), surgeEl = $('surge'), bannerEl = $('banner'), endEl = $('end');
  const surgeBar = surgeEl.querySelector('.bar'), surgeTxt = surgeEl.querySelector('.txt');
  const laneEls = [...$('lanes').querySelectorAll('.lane')];
  const team = state.team, deck = sim.decks[team];
  const cards = [], faces = [];

  // ---- THE FACE (§4.2): four rows - icon + price, name, role job, beats | loses; CSS hides the role row on landscape
  const glyphs = (roles) => roles.length ? roles.map((q) => `<i>${ROLE_GLYPH[q]}</i>`).join('') : '<i>—</i>';
  hand.innerHTML = '';
  deck.forEach((b, i) => {
    const c = document.createElement('div');
    c.className = 'card'; c.dataset.i = i; c.dataset.k = b.id;
    c.innerHTML = `<div class="top"><canvas class="ico" width="${ICON}" height="${ICON}"></canvas><span class="price"><i class="arc"></i><b class="p"></b><span class="wait"></span></span></div>`
      + `<div class="name"></div><div class="role"><i>${ROLE_GLYPH[b.role]}</i><span></span></div>`
      + `<div class="vs"><span class="beats">${glyphs(BEATS[b.role])}</span><i class="bar"></i><span class="loses">${glyphs(LOSES[b.role])}</span></div><span class="tag">GO</span>`;
    c.querySelector('.name').textContent = b.id;
    c.querySelector('.role span').textContent = ROLE_JOB[b.role];
    hand.appendChild(c); cards.push(c);
    faces.push({ ico: c.querySelector('.ico'), p: c.querySelector('.p'), arc: c.querySelector('.arc'), waitEl: c.querySelector('.wait'), ok: true, price: -1, wait: '' });
  });
  surgeEl.classList.add('t' + team);
  if (state.temper) $('temper').textContent = String(state.temper).toUpperCase();

  // The icons: the field's painter draws the six silhouettes with their inner marks into R.iconAtlas at boot; the
  // face copies its role's cell. Copied again over the first frames, so an atlas filled during the first frame
  // still lands; with no atlas at all the glyph is drawn in the side's edge colour, so a face is never blank.
  let iconPasses = 0;
  function paintIcons() {
    const atlas = R && R.iconAtlas;
    faces.forEach((f, i) => {
      const ctx = f.ico.getContext('2d'); if (!ctx) return;
      ctx.clearRect(0, 0, ICON, ICON);
      if (atlas) { ctx.drawImage(atlas, deck[i].role * ICON, team * ICON, ICON, ICON, 0, 0, ICON, ICON); return; }
      ctx.font = '800 30px ui-monospace, Menlo, Consolas, monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillStyle = EDGE[team];
      ctx.fillText(ROLE_GLYPH[deck[i].role], ICON / 2, ICON / 2 + 1);
    });
  }
  paintIcons();

  // ---- prices, the affordable bit, the arc and the wait
  let priceAt = -PRICE_MS;
  function syncCards(now) {
    const e = sim.energy[team], inc = sim.income[team], due = now - priceAt >= PRICE_MS;
    if (due) priceAt = now;
    for (let i = 0; i < cards.length; i++) {
      const f = faces[i], price = sim.price(deck[i]), ok = e >= price;
      if (ok !== f.ok) { f.ok = ok; cards[i].classList.toggle('dim', !ok); }   // the bit every frame: a buy dims the card at once
      if (!due) continue;
      if (price !== f.price) { f.price = price; f.p.textContent = String(price); }
      if (ok) continue;
      f.arc.style.setProperty('--p', Math.max(0, Math.min(1, e / price)).toFixed(3));
      const s = inc > 0 ? Math.max(1, Math.ceil((price - e) / inc)) : 0;
      const wait = s ? `in ${s}s` : '—';
      if (wait !== f.wait) { f.wait = wait; f.waitEl.textContent = wait; }
    }
  }

  // ---- GO: the coach's card glows with its tag. The strip and the glow follow main.js's state (advice.card,
  // advice.lane, follow.lane) until the explicit hand - setGo / setFollowed / setCoachLane - is used once;
  // from then on the caller owns that fact and the state is not re-read for it (two sources never fight).
  const explicit = { go: false, follow: false, coach: false };
  let goI = -1;
  function applyGo(i) {
    i = (i == null || i < 0 || i >= cards.length) ? -1 : i;
    if (i === goI) return;
    goI = i; cards.forEach((c, j) => c.classList.toggle('go', j === i));
  }
  function setGo(i) { explicit.go = true; applyGo(i); }

  // ---- THE STRIP: energy and rate, the clock, three lane arrows in the colour of the side whose front last advanced
  let followed = state.follow ? state.follow.lane : 1, coachLane = -1, stripAt = -STRIP_MS;
  const mmss = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
  // the clock counts DOWN to the bell (sim.o.clock, 480 s): what is left is what a player plans against; an old sim with no clock counts up
  const clockText = () => mmss(sim.o && sim.o.clock ? sim.o.clock - sim.time : sim.time);
  function lastAdvance(l) {
    const fr = sim.S && sim.S.front;
    if (fr && fr.moved && fr.moved[l] && fr.moved[l].team >= 0) return fr.moved[l].team;
    const sn = state.snap;
    if (sn && sn.lanes && sn.lanes[l] && sn.lanes[l].lastAdvance >= 0) return sn.lanes[l].lastAdvance;
    return -1;
  }
  function syncStrip(now) {
    if (now - stripAt < STRIP_MS) return;
    stripAt = now;
    energyEl.textContent = `◆ ${Math.floor(sim.energy[team])} +${Math.round(sim.income[team])}/s`;
    clockEl.textContent = clockText();
    if (!explicit.follow && state.follow) followed = state.follow.lane;
    if (!explicit.coach && 'advice' in state) coachLane = state.advice && !sim.result ? state.advice.lane : -1;
    const g = state.glass || glass;
    laneEls.forEach((el, l) => {
      const adv = lastAdvance(l), letter = laneWord(g, team, l)[0];
      const isF = followed === l, isC = coachLane === l && !isF;
      const key = letter + adv + (isF ? 'f' : '') + (isC ? 'c' : '');
      if (el.dataset.key === key) return;
      el.dataset.key = key;
      el.className = 'lane' + (adv >= 0 ? ' t' + adv : '') + (isF ? ' followed' : '') + (isC ? ' coach' : '');
      el.querySelector('.k').textContent = letter;
      el.querySelector('.ar').textContent = adv >= 0 ? '▲' : '—';
    });
  }
  function setFollowed(lane) { explicit.follow = true; followed = lane; stripAt = -STRIP_MS; }
  function setCoachLane(lane) { explicit.coach = true; coachLane = lane == null ? -1 : lane; stripAt = -STRIP_MS; }

  // ---- THE SURGE BAND (§4.6): the bar's width is the meter; at 100 it is gold and says so; the drain is CSS (400 ms)
  let surgePct = -1, surgeReady = false;
  function syncSurge() {
    const max = (sim.o && sim.o.surgeMax) || 10000, v = sim.S && sim.S.surge ? sim.S.surge[team] : 0;
    const pct = Math.max(0, Math.min(100, Math.floor(v / max * 100))), ready = v >= max;
    if (pct === surgePct && ready === surgeReady) return;
    surgePct = pct; surgeReady = ready;
    surgeBar.style.width = pct + '%';
    surgeEl.classList.toggle('ready', ready);
    surgeTxt.textContent = ready ? 'SURGE READY · DRAG TO A LANE' : pct + '%';
  }

  // ---- THE BANNER (§4.5): the words, the counts at the right, the line under; bannerOff lets it linger
  const bTxt = bannerEl.querySelector('.txt'), bRight = bannerEl.querySelector('.right'), bSub = bannerEl.querySelector('.sub');
  let bannerT = 0;
  function banner(text, right, sub) {
    clearTimeout(bannerT);
    bTxt.textContent = text || ''; bRight.textContent = right || ''; bSub.textContent = sub || '';
    bannerEl.classList.add('on');
  }
  function bannerOff(ms) { clearTimeout(bannerT); bannerT = setTimeout(() => bannerEl.classList.remove('on'), ms || 0); }

  // ---- the card's own moments: a white flash on a muster, a shake on an unaffordable press (also the surge band)
  function pulse(el, cls, ms) { if (!el) return; el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls); setTimeout(() => el.classList.remove(cls), ms); }
  const flash = (i) => pulse(cards[i], 'flash', FLASH_MS);
  const shake = (i) => pulse(i === 'surge' ? surgeEl : cards[i], 'shake', SHAKE_MS);

  // ---- THE END CARD: who won, why, the numbers, and which shape broke which (§6.2 keeps the line)
  function topBreaks(mat, who) {
    if (!mat) return [];
    const arr = [];
    for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if (mat[a * 6 + b] > 0) arr.push([mat[a * 6 + b], a, b]);
    arr.sort((p, q) => q[0] - p[0]);
    return arr.slice(0, 2).map(([n, a, b]) => `${who} ${ROLE_GLYPH[a]} ${ROLES[a]} broke ${ROLE_GLYPH[b]} ${ROLES[b]} · ${n}`);
  }
  function end() {
    if (endEl.classList.contains('on')) return;
    const r = sim.result, st = (sim.S && sim.S.stats) || {}, me = team, them = 1 - team, w = r ? r.winner : -1;
    $('endword').textContent = w < 0 ? 'A DRAW' : w === me ? 'THE FIELD IS YOURS' : 'THE FIELD IS LOST';
    const pair = (k) => { const a = st[k] || [0, 0]; return `${a[me]} – ${a[them]}`; };
    const lines = [...topBreaks(st.roleKills && st.roleKills[me], 'YOUR'), ...topBreaks(st.roleKills && st.roleKills[them], 'THEIR')];
    $('endline').innerHTML = `${r && r.why === 'clock' ? 'the clock' : 'the strongholds'} · ${mmss(r ? r.time : sim.time)} · musters ${pair('musters')} · kills ${pair('kills')} · captures ${pair('captures')} · shatters ${pair('shatters')} · surges ${pair('surges')}<br>${lines.join('<br>')}`;
    bannerEl.classList.remove('on');
    endEl.classList.add('on');
  }

  function sync(now) {
    if (iconPasses < 3) { paintIcons(); iconPasses++; }
    syncCards(now);
    if (sim.result) applyGo(-1); else if (!explicit.go && 'advice' in state) applyGo(state.advice ? state.advice.card : -1);
    syncSurge();
    syncStrip(now);
    if (sim.result) end();
  }
  return { sync, cards, surgeEl, laneEls, banner, bannerOff, flash, shake, setGo, setFollowed, setCoachLane, end };
}
