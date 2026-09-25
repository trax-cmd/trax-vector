// hud.js — THE GLASS. A strip on top (energy, towers, the clock, the enemy), the cards along the
// bottom (one per body, price and shape), a hint until the first deploy, and the end card. DOM, so it
// is readable on a phone and clickable by a probe; the field itself is the canvas beneath.
const GLYPH = ['●', '■', '▲', '⬢', '◯', '◆'];
export function createHud(sim, state, deploy, stopPour) {
  const $ = (id) => document.getElementById(id);
  const strip = $('strip'), bar = $('bar'), hint = $('hint'), end = $('end');
  const kinds = sim.kinds, cards = [];
  bar.innerHTML = '';
  kinds.forEach((k, i) => {
    const c = document.createElement('div'); c.className = 'card'; c.dataset.k = k.id; c.dataset.i = i;
    c.innerHTML = `<div class="g t${state.team}">${GLYPH[k.shape]}</div><div class="n">${k.name}</div><div class="p">${k.cost}</div><div class="d">${i + 1}</div>`;
    let pour = null;
    const stop = () => { if (pour) { clearInterval(pour); pour = null; } };
    c.addEventListener('pointerdown', (e) => { e.preventDefault(); e.stopPropagation(); deploy(i); stop(); pour = setInterval(() => { if (!deploy(i)) stop(); }, 130); });
    for (const ev of ['pointerup', 'pointercancel', 'pointerleave']) c.addEventListener(ev, stop);
    bar.appendChild(c); cards.push(c);
  });
  let dim = '';
  function sync() {
    const e = sim.energy[state.team], T = sim.T;
    let mine = 0, theirs = 0, mhp = 0, thp = 0;
    for (let t = 0; t < T.n; t++) { if (T.team[t] === state.team) { mine += T.alive[t]; mhp += T.hp[t]; } else { theirs += T.alive[t]; thp += T.hp[t]; } }
    const m = Math.floor(sim.time / 60), s = Math.floor(sim.time % 60);
    strip.innerHTML = `<span class="a">ENERGY ${Math.floor(e)}</span><span>TOWERS ${mine} · ${Math.round(mhp)}</span><span class="c">${m}:${s < 10 ? '0' : ''}${s}</span><span>ENEMY ${theirs} · ${Math.round(thp)}</span><span class="b">THEIR ENERGY ${Math.floor(sim.energy[1 - state.team])}</span><span class="k">ALIVE ${sim.U.count[state.team]} · ${sim.U.count[1 - state.team]}</span>`;
    let key = '';
    for (const k of kinds) key += e >= k.cost ? '1' : '0';
    if (key !== dim) { dim = key; cards.forEach((c, i) => { c.classList.toggle('dim', key[i] === '0'); }); }
    if (state.deployed && hint.style.display !== 'none') hint.style.display = 'none';
    if (sim.result && end.style.display !== 'flex') {
      const w = sim.result.winner; const won = w === state.team;
      $('endword').textContent = w < 0 ? 'A DRAW' : won ? 'THE FIELD IS YOURS' : 'THE FIELD IS LOST';
      $('endline').textContent = `${sim.result.why === 'clock' ? 'the clock' : 'the towers'} · ${Math.floor(sim.result.time / 60)}:${(Math.floor(sim.result.time % 60) + '').padStart(2, '0')} · deployed ${sim.S.stats.deployed[state.team]} – ${sim.S.stats.deployed[1 - state.team]} · kills ${sim.S.stats.kills[state.team]} – ${sim.S.stats.kills[1 - state.team]}`;
      end.style.display = 'flex'; stopPour && stopPour();
    }
  }
  return { sync, cards };
}
