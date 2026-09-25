// sound.js — THE VOICE. No samples: every sound is a few oscillators and an envelope, born the moment
// it is needed. It wakes on the first touch (browsers demand it), it never plays more than a few voices
// a frame, and a MUTE chip silences it. Cold sounds for the west, hot for the east, so an ear can tell
// whose well just turned.
export function createSound() {
  let ctx = null, master = null, muted = false, last = new Map();
  try { muted = localStorage.getItem('vector_mute') === '1'; } catch (e) { /* fine */ }
  function wake() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    try { ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = 0.35; master.connect(ctx.destination); } catch (e) { ctx = null; }
  }
  // one voice: a tone that slides from f0 to f1 over dur seconds with an attack-decay envelope
  function tone(f0, f1, dur, type, vol, delay) {
    if (!ctx || muted) return;
    const t = ctx.currentTime + (delay || 0);
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.02);
  }
  function noise(dur, vol, f0, f1) {
    if (!ctx || muted) return;
    const t = ctx.currentTime, n = Math.floor(ctx.sampleRate * dur), buf = ctx.createBuffer(1, n, ctx.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < n; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / n);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const f = ctx.createBiquadFilter(); f.type = 'bandpass'; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = 0.8;
    const g = ctx.createGain(); g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f); f.connect(g); g.connect(master); src.start(t); src.stop(t + dur);
  }
  // rate limit per name: a war of a thousand deaths must not be a thousand clicks
  function gate(name, ms) { const now = performance.now(); if ((last.get(name) || 0) + ms > now) return false; last.set(name, now); return true; }
  const W = 1, E = 0.75;   // the east speaks lower
  function play(name, team) {
    if (!ctx || muted) return;
    const k = team === 1 ? E : W;
    switch (name) {
      case 'muster': if (gate('muster', 90)) { tone(220 * k, 440 * k, 0.12, 'triangle', 0.25); tone(330 * k, 660 * k, 0.16, 'sine', 0.12, 0.04); } break;
      case 'capture': if (gate('capture', 120)) { tone(392 * k, 784 * k, 0.22, 'sine', 0.3); tone(587 * k, 1175 * k, 0.3, 'sine', 0.18, 0.1); } break;
      case 'lost': if (gate('lost', 120)) { tone(600 * k, 180 * k, 0.35, 'sawtooth', 0.14); } break;
      case 'fortify': if (gate('fortify', 150)) { tone(150, 300, 0.25, 'square', 0.12); tone(300, 600, 0.3, 'triangle', 0.12, 0.12); tone(450, 900, 0.35, 'sine', 0.1, 0.24); } break;
      case 'death': if (gate('death', 45)) { noise(0.08, 0.12, 1800 * k, 400); } break;
      case 'towerHit': if (gate('towerHit', 140)) { tone(90, 40, 0.25, 'sine', 0.35); noise(0.15, 0.1, 500, 120); } break;
      case 'towerDown': if (gate('towerDown', 400)) { tone(120, 30, 1.2, 'sawtooth', 0.4); noise(0.8, 0.3, 800, 60); tone(60, 25, 1.6, 'sine', 0.35, 0.1); } break;
      case 'explode': if (gate('explode', 70)) { noise(0.2, 0.16, 900, 150); tone(140, 50, 0.2, 'sine', 0.2); } break;
      case 'win': tone(440, 880, 0.5, 'sine', 0.3); tone(554, 1108, 0.5, 'sine', 0.25, 0.18); tone(659, 1318, 0.8, 'sine', 0.25, 0.36); break;
      case 'lose': tone(330, 110, 1.4, 'sawtooth', 0.22); tone(220, 70, 1.6, 'sine', 0.25, 0.2); break;
      case 'tap': if (gate('tap', 40)) tone(900, 1200, 0.05, 'sine', 0.08); break;
      case 'alarm': if (gate('alarm', 4000)) { tone(520, 520, 0.18, 'square', 0.12); tone(390, 390, 0.18, 'square', 0.12, 0.22); tone(520, 520, 0.18, 'square', 0.12, 0.44); } break;
      default: break;
    }
  }
  function toggle() { muted = !muted; try { localStorage.setItem('vector_mute', muted ? '1' : '0'); } catch (e) { /* fine */ } return muted; }
  return { wake, play, toggle, get muted() { return muted; }, get on() { return !!ctx; } };
}
