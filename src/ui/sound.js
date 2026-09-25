// sound.js — THE VOICE (SPEC §5.5). Oscillators only, no samples, no speech: every motif is a few tones and
// an envelope born the moment it is needed. It wakes on the first touch (browsers demand it), the west
// speaks a fifth above the east, and every motif is rate-gated to its plate so a war of a thousand deaths
// is never a thousand clicks. duck(level, ms) pulls the master down for a moment - the breath after a
// shatter - and lets it back over 300 ms.
const MASTER = 0.35;
const PITCH = [1, 2 / 3];                 // west 1, east a fifth below (3:2)
const RETURN_S = 0.3;                     // the duck's way back

// the gates, ms per motif: a plate's sound may not repeat inside its own hold; the field sounds thin out under load
const GATE = {
  shatter: 500, laneBreak: 500, surge: 500, surgeEnemy: 500, wave: 4000, frontUp: 800, frontDown: 800, centre: 800, yourWave: 1000, doom: 1000,
  gateHit: 140, muster: 90, capture: 120, lost: 120, death: 45, explode: 70, tap: 40, win: 0, lose: 0,
};
// old names main.js's router may still say (the event is still towerHit in §9.1; the alarm is the wave's)
const ALIAS = { towerHit: 'gateHit', alarm: 'wave' };

export function createSound() {
  let ctx = null, master = null, muted = false;
  const last = new Map();
  try { muted = localStorage.getItem('vector_mute') === '1'; } catch (e) { /* a private tab keeps no preference */ }

  function wake() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = MASTER; master.connect(ctx.destination); }
    catch (e) { ctx = null; }
  }
  // one voice: a tone sliding f0 → f1 over dur seconds, attack 12 ms, exponential decay
  function tone(f0, f1, dur, type, vol, delay) {
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  // a burst of filtered noise, the band sliding f0 → f1
  function noise(dur, vol, f0, f1, delay) {
    const t = ctx.currentTime + (delay || 0), n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur);
  }
  // the master to level for ms, then back over 300 ms; delay seconds lets a hit land before the room empties
  function duck(level, ms, delay) {
    if (!ctx) return;
    const t = ctx.currentTime + (delay || 0), g = master.gain;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t);
    g.linearRampToValueAtTime(MASTER * level, t + 0.03);
    g.setValueAtTime(MASTER * level, t + ms / 1000);
    g.linearRampToValueAtTime(MASTER, t + ms / 1000 + RETURN_S);
  }
  // three notes k apart in time, one shape and volume: the announcer's triads and alarms
  const run = (freqs, gap, dur, type, vol, k) => freqs.forEach((f, i) => tone(f * k, f * k, dur, type, vol, i * gap));

  const MOTIF = {
    shatter(k) { tone(120 * k, 30, 1.2, 'sawtooth', 0.4); noise(0.8, 0.3, 800, 60); tone(60 * k, 25, 1.6, 'sine', 0.35, 0.1); duck(0.2, 400, 0.15); },   // the low hit, then the room ducks
    laneBreak(k) { run([260, 195, 130], 0.12, 0.14, 'square', 0.16, k); },
    surge(k) { run([330, 440, 660], 0.09, 0.14, 'triangle', 0.22, k); },
    surgeEnemy(k) { run([660, 440, 330], 0.09, 0.14, 'triangle', 0.22, k); },
    wave(k) { run([520, 390, 520], 0.22, 0.18, 'square', 0.12, k); },
    frontUp(k) { tone(392 * k, 523 * k, 0.08, 'sine', 0.16); },
    frontDown(k) { tone(523 * k, 392 * k, 0.08, 'sine', 0.16); },
    centre(k) { tone(784 * k, 784 * k, 0.4, 'sine', 0.2); tone(1568 * k, 1568 * k, 0.4, 'sine', 0.07); },
    yourWave(k) { for (let i = 0; i < 3; i++) MOTIF.muster(k, i * 0.09); },
    doom(k) { tone(90 * k, 30, 2.2, 'sawtooth', 0.3); tone(45 * k, 20, 2.6, 'sine', 0.3, 0.2); noise(1.2, 0.2, 600, 40); },
    gateHit(k) { tone(90 * k, 40, 0.25, 'sine', 0.35); noise(0.15, 0.1, 500, 120); },
    muster(k, d) { tone(220 * k, 440 * k, 0.12, 'triangle', 0.25, d); tone(330 * k, 660 * k, 0.16, 'sine', 0.12, 0.04 + (d || 0)); },
    capture(k) { tone(392 * k, 784 * k, 0.22, 'sine', 0.3); tone(587 * k, 1175 * k, 0.3, 'sine', 0.18, 0.1); },
    lost(k) { tone(600 * k, 180 * k, 0.35, 'sawtooth', 0.14); },
    death(k) { noise(0.08, 0.12, 1800 * k, 400); },
    explode(k) { noise(0.2, 0.16, 900, 150); tone(140 * k, 50, 0.2, 'sine', 0.2); },
    win() { tone(440, 880, 0.5, 'sine', 0.3); tone(554, 1108, 0.5, 'sine', 0.25, 0.18); tone(659, 1318, 0.8, 'sine', 0.25, 0.36); },
    lose() { tone(330, 110, 1.4, 'sawtooth', 0.22); tone(220, 70, 1.6, 'sine', 0.25, 0.2); },
    tap() { tone(900, 1200, 0.05, 'sine', 0.08); },
  };

  // the gate is taken whether or not a voice sounds, so a probe reads the same map a player hears
  function gate(name) { const now = performance.now(), ms = GATE[name] || 0; if ((last.get(name) || 0) + ms > now) return false; last.set(name, now); return true; }
  function play(name, team) {
    name = ALIAS[name] || name;
    const m = MOTIF[name]; if (!m || !gate(name)) return;
    if (!ctx || muted) return;
    m(PITCH[team === 1 ? 1 : 0]);
  }
  function toggle() { muted = !muted; try { localStorage.setItem('vector_mute', muted ? '1' : '0'); } catch (e) { /* fine */ } return muted; }
  return { wake, play, toggle, duck: (level, ms) => duck(level, ms, 0), get muted() { return muted; }, get on() { return !!ctx; }, get gates() { return last; } };
}
