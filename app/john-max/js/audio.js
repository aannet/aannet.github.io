// Sons synthétisés en WebAudio : rien à télécharger, tout se règle en direct.
let ctx = null, master = null, noise = null, shaper = null;

export function unlockAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.8;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 6;
  master.connect(comp).connect(ctx.destination);
  const len = ctx.sampleRate;
  noise = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  shaper = ctx.createWaveShaper();
  const curve = new Float32Array(256);
  for (let i = 0; i < 256; i++) { const x = (i / 128) - 1; curve[i] = Math.tanh(x * 3); }
  shaper.curve = curve;
  shaper.connect(master);
}

const rnd = (a) => 1 + (Math.random() - 0.5) * a;

function noiseBurst(t, dur, freq, q, gain, type = 'bandpass', dest = master) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  src.playbackRate.value = rnd(0.3);
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.003);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(dest);
  src.start(t, Math.random() * 0.5);
  src.stop(t + dur + 0.02);
  return f;
}

function thump(t, f0, f1, dur, gain, dest = master) {
  const o = ctx.createOscillator();
  o.type = 'sine';
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(dest);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let chargeNodes = null;

export const sfx = {
  // Montée d'énergie : grondement en dent de scie dont la fréquence monte pendant la charge
  chargeStart(full = 0.9) {
    if (!ctx) return;
    this.chargeStop();
    const t = ctx.currentTime;
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(70, t);
    o.frequency.exponentialRampToValueAtTime(240, t + full);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(300, t);
    f.frequency.exponentialRampToValueAtTime(1800, t + full);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.14, t + 0.1);
    o.connect(f).connect(g).connect(master);
    o.start(t);
    chargeNodes = { o, g };
  },
  chargeStop() {
    if (!ctx || !chargeNodes) return;
    const t = ctx.currentTime, { o, g } = chargeNodes;
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(g.gain.value, t);
    g.gain.linearRampToValueAtTime(0, t + 0.05);
    o.stop(t + 0.06);
    chargeNodes = null;
  },
  // Impact chargé : coup lourd + basse profonde + claquement
  charged(k = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    this.punch(true);
    thump(t, 120, 26, 0.5 + 0.3 * k, 1, shaper);
    noiseBurst(t, 0.35 + 0.2 * k, 500, 0.6, 0.9, 'lowpass', shaper);
    noiseBurst(t + 0.02, 0.08, 4000, 1.5, 0.5);
  },
  punch(heavy = false) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const p = rnd(0.2);
    if (heavy) {
      noiseBurst(t, 0.22, 900 * p, 0.8, 0.9, 'lowpass', shaper);
      thump(t, 180 * p, 38, 0.28, 1.0, shaper);
      noiseBurst(t, 0.06, 3200 * p, 1.2, 0.5);
    } else {
      noiseBurst(t, 0.09, 1600 * p, 1.0, 0.7);
      thump(t, 220 * p, 70, 0.1, 0.7);
    }
  },
  bat() {
    if (!ctx) return;
    const t = ctx.currentTime;
    // « tok » bois + gros impact
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.setValueAtTime(620 * rnd(0.15), t);
    o.frequency.exponentialRampToValueAtTime(300, t + 0.08);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.7, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.15);
    noiseBurst(t, 0.25, 700, 0.7, 0.9, 'lowpass', shaper);
    thump(t, 150, 35, 0.3, 1.0, shaper);
  },
  crack() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 4; i++) noiseBurst(t + i * 0.025, 0.06, 2500 + i * 600, 2, 0.6);
    thump(t, 400, 90, 0.15, 0.5);
  },
  whoosh(heavy = false) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const f = noiseBurst(t, heavy ? 0.22 : 0.13, 500, 1.5, heavy ? 0.22 : 0.12);
    f.frequency.setValueAtTime(400, t);
    f.frequency.exponentialRampToValueAtTime(heavy ? 1800 : 2600, t + (heavy ? 0.2 : 0.11));
  },
  thud(v = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = Math.min(1, v);
    thump(t, 110 * rnd(0.3), 40, 0.18, 0.6 * k);
    noiseBurst(t, 0.12, 400, 0.7, 0.4 * k, 'lowpass');
  },
  hurt() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noiseBurst(t, 0.12, 1100, 1, 0.6);
    thump(t, 160, 60, 0.15, 0.7);
  },
  box(v = 1) {
    if (!ctx) return;
    const t = ctx.currentTime;
    const k = Math.min(1, v);
    noiseBurst(t, 0.1, 500 * rnd(0.3), 3, 0.5 * k);
    thump(t, 90, 50, 0.1, 0.4 * k);
  },
  ready() {
    if (!ctx) return;
    const t = ctx.currentTime;
    [523, 784, 1046].forEach((f, i) => {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t + i * 0.07;
      o.type = 'triangle'; o.frequency.value = f;
      g.gain.setValueAtTime(0.13, s); g.gain.exponentialRampToValueAtTime(0.001, s + 0.25);
      o.connect(g).connect(master); o.start(s); o.stop(s + 0.27);
    });
  },
  denied() {
    if (!ctx) return;
    const t = ctx.currentTime, o = ctx.createOscillator(), g = ctx.createGain();
    o.type = 'square'; o.frequency.setValueAtTime(140, t); o.frequency.setValueAtTime(100, t + 0.06);
    g.gain.setValueAtTime(0.07, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
    o.connect(g).connect(master); o.start(t); o.stop(t + 0.15);
  },
  smash() {
    if (!ctx) return;
    const t = ctx.currentTime;
    this.charged(1);
    thump(t, 70, 18, 1.1, 1, shaper);
    noiseBurst(t, 0.9, 260, 0.5, 1, 'lowpass', shaper);
    noiseBurst(t + 0.03, 0.25, 3000, 0.8, 0.6, 'highpass');
  },
  wood() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (let i = 0; i < 3; i++) noiseBurst(t + i * 0.03, 0.08, 900 + i * 500, 3, 0.7);
    thump(t, 160, 60, 0.18, 0.8);
  },
  glass() {
    if (!ctx) return;
    const t = ctx.currentTime;
    noiseBurst(t, 0.5, 6000, 0.8, 0.8, 'highpass');
    for (let i = 0; i < 8; i++) {
      const o = ctx.createOscillator(), g = ctx.createGain(), s = t + Math.random() * 0.35;
      o.type = 'sine';
      o.frequency.value = 2500 + Math.random() * 3500;
      g.gain.setValueAtTime(0.12, s);
      g.gain.exponentialRampToValueAtTime(0.001, s + 0.12);
      o.connect(g).connect(master);
      o.start(s); o.stop(s + 0.14);
    }
  },
  clang() {
    if (!ctx) return;
    const t = ctx.currentTime;
    for (const f of [320, 487, 761]) {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = f * rnd(0.1);
      g.gain.setValueAtTime(0.08, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
      o.connect(g).connect(master);
      o.start(t); o.stop(t + 0.32);
    }
    noiseBurst(t, 0.08, 1500, 2, 0.4);
  },
  pickup() {
    if (!ctx) return;
    const t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.setValueAtTime(440, t);
    o.frequency.setValueAtTime(660, t + 0.06);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.12, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
    o.connect(g).connect(master);
    o.start(t); o.stop(t + 0.18);
  },
};
