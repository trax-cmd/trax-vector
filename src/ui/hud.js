// hud.js — THE GLASS. The strip on top says what matters: your energy and its rate, wells and
// strongholds held, the clock, what THEY field by shape and what answers it. The cards along the bottom
// are your eight battalions: shape, name, size, price, and what each beats. A held card pours. The COACH
// line says the one thing to do next, from the state of the field. The FORTIFY plaque appears when a well
// of yours is aimed at. The end card says who won and which shape broke which.
import { ROLES, ROLE_GLYPH, BEATS } from '../sim/library.js';
const FAM_GLYPH = ['●', '■', '▲', '⬢', '◯', '◆'];

export function createHud(sim, state, deploy, fortify) {
  const $ = (id) => document.getElementById(id);
  const strip = $('strip'), bar = $('bar'), hint = $('hint'), end = $('end'), fort = $('fortify');
  const deck = sim.decks[state.team], cards = [];
  bar.innerHTML = '';
  deck.forEach((b, i) => {
    const c = document.createElement('div'); c.className = 'card'; c.dataset.k = b.id; c.dataset.i = i;
    const bodies = b.body.map(([kind, n]) => `<span>${FAM_GLYPH[sim.kinds[kind].shape]}<i>${n}</i></span>`).join('');
    const beats = BEATS[b.role].map((q) => ROLE_GLYPH[q]).join(' ');
    c.innerHTML = `<div class="g t${state.team}">${ROLE_GLYPH[b.role]}</div><div class="n">${b.id}</div><div class="u">${bodies}</div><div class="p">${b.cost}</div><div class="w">beats ${beats || '—'}</div><div class="d">${i + 1}</div>`;
    let pour = null;
    const stop = () => { if (pour) { clearInterval(pour); pour = null; } };
    c.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); deploy(i); stop(); pour = setInterval(() => { if (!deploy(i)) stop(); }, 260); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) c.addEventListener(ev, stop);
    bar.appendChild(c); cards.push(c);
  });
  fort.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); fortify(); });
  let dim = '', lastStrip = 0, lastCoach = '';
  // THE COACH: one sentence, from the field, never a lesson
  function coach() {
    const T = sim.T, WL = sim.WL, me = state.team, e = sim.energy[me];
    let myWells = 0, open = 0, theirWells = 0, myForts = 0;
    for (let w = 0; w < WL.n; w++) { if (WL.owner[w] === me) { myWells++; if (WL.fort[w]) myForts++; } else if (WL.owner[w] < 0) open++; else theirWells++; }
    const cheapest = deck.reduce((a, b) => (b.cost < a.cost ? b : a), deck[0]);
    const f = state.fielded ? state.fielded[1 - me] : null;
    let top = -1, tv = 0; if (f) for (let q = 0; q < 6; q++) if (f[q] > tv) { tv = f[q]; top = q; }
    let hot = -1, hv = 120; if (state.threat) for (let t = 0; t < T.n; t++) if (T.team[t] === me && T.alive[t] && state.threat[t] > hv) { hv = state.threat[t]; hot = t; }
    if (sim.result) return '';
    if (hot >= 0 && top >= 0) { const ans = [0, 1, 2, 3, 4, 5].filter((q) => BEATS[q].includes(top)); return `THEY ARE AT YOUR STRONGHOLD WITH ${ROLE_GLYPH[top]} — MUSTER ${ans.map((q) => ROLE_GLYPH[q] + ' ' + ROLES[q]).join(' OR ')} THERE (TAP IT, THEN A CARD)`; }
    if (state.deployed === 0) return `TAP A CARD — THE BATTALION GOES TO THE NEAREST WELL · EVERY WELL YOU HOLD PAYS +5/s`;
    if (myWells === 0) return `YOUR FIRST BATTALION IS MARCHING TO A WELL — STAND ON IT AND IT TURNS ${me === 0 ? 'CYAN' : 'RED'} · TAP MORE CARDS FOR MORE WELLS`;
    if (myWells < 4 && open > 0) return `${myWells} WELL${myWells > 1 ? 'S' : ''} · +${Math.round(sim.income[me])}/s — CLAIM MORE: TAP A CARD (IT GOES TO THE NEAREST OPEN WELL)`;
    if (e >= sim.o.fortifyCost && myForts === 0 && myWells > 0) return `TAP A WELL OF YOURS, THEN FORTIFY — A WARDEN GUARDS IT AND IT PAYS +${sim.o.wellIncome + sim.o.fortifyBonus}/s`;
    if (top >= 0 && tv > 0) { const ans = [0, 1, 2, 3, 4, 5].filter((q) => BEATS[q].includes(top)); return `THEY FIELD ${ROLE_GLYPH[top]} ${ROLES[top]} — ANSWER WITH ${ans.map((q) => ROLE_GLYPH[q] + ' ' + ROLES[q]).join(' OR ')} · TAP THEIR WELL OR STRONGHOLD TO AIM`; }
    if (theirWells > myWells) return `THEY HOLD MORE WELLS (${theirWells} TO ${myWells}) — TAP ONE OF THEIRS, THEN A CARD, AND TAKE IT`;
    return `${myWells} WELLS · +${Math.round(sim.income[me])}/s — TAP THEIR WEAKEST STRONGHOLD, THEN POUR (HOLD A CARD)`;
  }
  function sync(now) {
    const e = sim.energy[state.team], T = sim.T, WL = sim.WL;
    let key = '';
    for (const b of deck) key += e >= b.cost ? '1' : '0';
    if (key !== dim) { dim = key; cards.forEach((c, i) => { c.classList.toggle('dim', key[i] === '0'); }); }
    if (now - lastStrip > 200) {
      lastStrip = now;
      let mine = 0, theirs = 0, mhp = 0, thp = 0, wm = 0, wt = 0;
      for (let t = 0; t < T.n; t++) { if (T.team[t] === state.team) { mine += T.alive[t]; mhp += T.hp[t]; } else { theirs += T.alive[t]; thp += T.hp[t]; } }
      for (let w = 0; w < WL.n; w++) { if (WL.owner[w] === state.team) wm++; else if (WL.owner[w] === 1 - state.team) wt++; }
      const m = Math.floor(sim.time / 60), s = Math.floor(sim.time % 60);
      const f = state.fielded ? state.fielded[1 - state.team] : null;
      let they = '', answer = '';
      if (f) {
        const tot = f.reduce((a, b) => a + b, 0) || 1;
        const order = [0, 1, 2, 3, 4, 5].filter((q) => f[q] > 0).sort((a, b) => f[b] - f[a]);
        they = order.slice(0, 3).map((q) => `<b class="r${q}">${ROLE_GLYPH[q]}</b><i>${Math.round(f[q] / tot * 100)}%</i>`).join(' ');
        if (order.length) { const top = order[0]; answer = [0, 1, 2, 3, 4, 5].filter((q) => BEATS[q].includes(top)).map((q) => `<b class="r${q}">${ROLE_GLYPH[q]}</b> ${ROLES[q]}`).join(' · '); }
      }
      strip.innerHTML = `<span class="a">ENERGY ${Math.floor(e)} <i>+${Math.round(sim.income[state.team])}/s</i></span><span>WELLS ${wm}<i>/${WL.n}</i> · STRONGHOLDS ${mine}<i> ${Math.round(mhp)}</i></span><span class="c">${m}:${s < 10 ? '0' : ''}${s}</span><span class="b">THEY ${theirs}<i> ${Math.round(thp)}</i> · WELLS ${wt} <i>+${Math.round(sim.income[1 - state.team])}/s</i></span><span class="k">THEY FIELD ${they || '—'}</span><span class="k">ANSWER ${answer || '—'}</span>`;
      const line = coach(); if (line !== lastCoach) { lastCoach = line; hint.textContent = line; hint.style.display = line ? 'block' : 'none'; }
      // the fortify plaque: a well of yours is aimed at and not yet fortified
      const g = state.goal; const w = g >= 1000 ? g - 1000 : -1;
      const show = w >= 0 && WL.owner[w] === state.team && !WL.fort[w] && !sim.result;
      fort.style.display = show ? 'block' : 'none';
      if (show) { fort.textContent = `FORTIFY THIS WELL · ${sim.o.fortifyCost}`; fort.classList.toggle('dim', e < sim.o.fortifyCost); }
    }
    if (sim.result && end.style.display !== 'flex') {
      const w = sim.result.winner; const won = w === state.team;
      $('endword').textContent = w < 0 ? 'A DRAW' : won ? 'THE FIELD IS YOURS' : 'THE FIELD IS LOST';
      const rk = sim.S.stats.roleKills[state.team], ek = sim.S.stats.roleKills[1 - state.team];
      const lines = [];
      const top = (mat, who) => { const arr = []; for (let a = 0; a < 6; a++) for (let b = 0; b < 6; b++) if (mat[a * 6 + b] > 0) arr.push([mat[a * 6 + b], a, b]); arr.sort((p, q) => q[0] - p[0]); return arr.slice(0, 2).map(([n, a, b]) => `${who} ${ROLE_GLYPH[a]} ${ROLES[a]} broke ${ROLE_GLYPH[b]} ${ROLES[b]} · ${n}`); };
      lines.push(...top(rk, 'YOUR'), ...top(ek, 'THEIR'));
      $('endline').innerHTML = `${sim.result.why === 'clock' ? 'the clock' : 'the strongholds'} · ${Math.floor(sim.result.time / 60)}:${(Math.floor(sim.result.time % 60) + '').padStart(2, '0')} · musters ${sim.S.stats.musters[state.team]} – ${sim.S.stats.musters[1 - state.team]} · kills ${sim.S.stats.kills[state.team]} – ${sim.S.stats.kills[1 - state.team]} · wells taken ${sim.S.stats.wellsTaken[state.team]} – ${sim.S.stats.wellsTaken[1 - state.team]} · forts ${sim.S.stats.forts[state.team]} – ${sim.S.stats.forts[1 - state.team]}<br>${lines.join('<br>')}`;
      end.style.display = 'flex'; hint.style.display = 'none'; fort.style.display = 'none';
    }
  }
  return { sync, cards, coach };
}
