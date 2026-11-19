/* ============================================================
   Web Audio synthesis: engine, wind, afterburner, weapons
   ============================================================ */

const Sound = {
  ctx: null,
  master: null,
  engineGain: null,
  windGain: null,
  abGain: null,
  oscA: null,
  oscB: null,
  filter: null,
  enabled: false,
  ready: false,

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = new AC();
    this.ctx = ctx;
    const master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
    this.master = master;

    // looping noise source
    const len = ctx.sampleRate * 2;
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.2;
    }
    const noise = ctx.createBufferSource();
    noise.buffer = buf;
    noise.loop = true;
    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.7;
    const windGain = ctx.createGain();
    windGain.gain.value = 0.0;
    noise.connect(windFilter).connect(windGain).connect(master);
    noise.start();
    this.windGain = windGain;
    this.windFilter = windFilter;

    const abFilter = ctx.createBiquadFilter();
    abFilter.type = 'lowpass';
    abFilter.frequency.value = 900;
    const abGain = ctx.createGain();
    abGain.gain.value = 0;
    noise.connect(abFilter).connect(abGain).connect(master);
    this.abGain = abGain;

    const filt = ctx.createBiquadFilter();
    filt.type = 'lowpass';
    filt.frequency.value = 320;
    filt.Q.value = 3;
    const eg = ctx.createGain();
    eg.gain.value = 0.055;
    filt.connect(eg).connect(master);
    const a = ctx.createOscillator();
    a.type = 'sawtooth';
    a.frequency.value = 58;
    const b = ctx.createOscillator();
    b.type = 'square';
    b.frequency.value = 87;
    const bg = ctx.createGain();
    bg.gain.value = 0.35;
    a.connect(filt);
    b.connect(bg).connect(filt);
    a.start();
    b.start();
    this.oscA = a; this.oscB = b;
    this.filter = filt;
    this.engineGain = eg;
    this.ready = true;
  },

  setEnabled(on) {
    this.init();
    if (!this.ctx) return;
    this.enabled = !!on;
    if (on && this.ctx.state === 'suspended') this.ctx.resume();
    const t = this.ctx.currentTime;
    this.master.gain.cancelScheduledValues(t);
    this.master.gain.setTargetAtTime(on ? 0.55 : 0, t, 0.12);
  },

  toggle() {
    this.setEnabled(!this.enabled);
    return this.enabled;
  },

  update(player) {
    if (!this.ready || !this.enabled) return;
    const t = this.ctx.currentTime;
    const sp = clamp(player.speed / 300, 0.25, 1.2);
    const ab = player.ab;
    this.oscA.frequency.setTargetAtTime(52 + sp * 26 + ab * 24, t, 0.15);
    this.oscB.frequency.setTargetAtTime(80 + sp * 36 + ab * 30, t, 0.15);
    this.filter.frequency.setTargetAtTime(260 + sp * 280 + ab * 520, t, 0.15);
    this.engineGain.gain.setTargetAtTime(0.04 + sp * 0.035, t, 0.2);
    this.windGain.gain.setTargetAtTime(0.012 + sp * 0.03, t, 0.2);
    this.windFilter.frequency.setTargetAtTime(500 + sp * 900, t, 0.2);
    this.abGain.gain.setTargetAtTime(ab * 0.12, t, 0.12);
  },

  launch() {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.setValueAtTime(180, t);
    o.frequency.exponentialRampToValueAtTime(60, t + 0.35);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.16, t + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.45);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 1200;
    o.connect(f).connect(g).connect(this.master);
    o.start(t);
    o.stop(t + 0.5);

    const buf = ctx.createBuffer(1, ctx.sampleRate * 0.4, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
    const n = ctx.createBufferSource();
    n.buffer = buf;
    const ng = ctx.createGain();
    ng.gain.value = 0.1;
    const nf = ctx.createBiquadFilter();
    nf.type = 'bandpass';
    nf.frequency.value = 1400;
    n.connect(nf).connect(ng).connect(this.master);
    n.start(t);
  },

  boom(water) {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const len = Math.floor(ctx.sampleRate * 1.6);
    const buf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const k = 1 - i / len;
      d[i] = (Math.random() * 2 - 1) * k * k;
    }
    const n = ctx.createBufferSource();
    n.buffer = buf;
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.setValueAtTime(water ? 1800 : 1100, t);
    f.frequency.exponentialRampToValueAtTime(80, t + 1.2);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.55, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
    n.connect(f).connect(g).connect(this.master);
    n.start(t);

    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(28, t + 0.7);
    const og = ctx.createGain();
    og.gain.setValueAtTime(0.4, t);
    og.gain.exponentialRampToValueAtTime(0.0001, t + 0.8);
    o.connect(og).connect(this.master);
    o.start(t); o.stop(t + 0.85);
  },

  dry() {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'square';
    o.frequency.value = 140;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.05, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.07);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.08);
  },

  click() {
    if (!this.ready || !this.enabled) return;
    const ctx = this.ctx, t = ctx.currentTime;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = 660;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.04, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.05);
    o.connect(g).connect(this.master);
    o.start(t); o.stop(t + 0.06);
  },
};
