// All audio is synthesized with the Web Audio API. No files.
const mtof = (m) => 440 * Math.pow(2, (m - 69) / 12);
const PENTA = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24, 26, 28, 31, 33];

const MIN_GAP = { hit: 0.03, crit: 0.04, kill: 0.035, shoot: 0.05, zap: 0.06, coin: 0.04, gem: 0.03, land: 0.1, slide: 0.15, missile: 0.08, explode: 0.06, whoosh: 0.1 };

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.voices = 0;
    this.last = {};
    this.intensity = 0;
    this.boss = false;
    this.musicOn = false;
    this.step = 0;
    this.nextT = 0;
    this.muted = false;
  }

  init() {
    if (this.ctx) { if (this.ctx.state === 'suspended') this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    const ctx = this.ctx = new AC();
    this.master = ctx.createGain(); this.master.gain.value = 0.7;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14; comp.ratio.value = 6; comp.attack.value = 0.003; comp.release.value = 0.15;
    this.master.connect(comp); comp.connect(ctx.destination);
    this.sfxG = ctx.createGain(); this.sfxG.gain.value = 0.9; this.sfxG.connect(this.master);
    this.musG = ctx.createGain(); this.musG.gain.value = 0.32; this.musG.connect(this.master);
    // noise buffer
    const len = ctx.sampleRate * 1;
    this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
    const d = this.noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  // ----- primitives -----
  tone(o) {
    const ctx = this.ctx; if (!ctx || this.voices > 60) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const osc = ctx.createOscillator(), g = ctx.createGain();
    osc.type = o.type || 'square';
    osc.frequency.setValueAtTime(o.f, t0);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(Math.max(20, o.f2), t0 + o.dur);
    const a = o.attack || 0.004, v = o.vol == null ? 0.2 : o.vol;
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.linearRampToValueAtTime(v, t0 + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    let node = osc;
    if (o.lp) { const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = o.lp; osc.connect(f); node = f; }
    node.connect(g); g.connect(o.dest || this.sfxG);
    osc.start(t0); osc.stop(t0 + o.dur + 0.02);
    this.voices++;
    osc.onended = () => { this.voices--; };
  }

  noise(o) {
    const ctx = this.ctx; if (!ctx || this.voices > 60) return;
    const t0 = ctx.currentTime + (o.delay || 0);
    const src = ctx.createBufferSource(); src.buffer = this.noiseBuf; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = o.type || 'lowpass'; f.frequency.setValueAtTime(o.f || 2000, t0);
    if (o.f2) f.frequency.exponentialRampToValueAtTime(Math.max(30, o.f2), t0 + o.dur);
    f.Q.value = o.q || 0.8;
    const g = ctx.createGain();
    g.gain.setValueAtTime(o.vol == null ? 0.2 : o.vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + o.dur);
    src.connect(f); f.connect(g); g.connect(o.dest || this.sfxG);
    src.start(t0, Math.random() * 0.5); src.stop(t0 + o.dur + 0.02);
    this.voices++;
    src.onended = () => { this.voices--; };
  }

  // ----- game sfx -----
  hit(crit, type) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime, k = crit ? 'crit' : 'hit';
    if (now - (this.last[k] || 0) < MIN_GAP[k]) return;
    this.last[k] = now;
    const p = 0.9 + Math.random() * 0.25;
    if (crit) {
      this.tone({ type: 'square', f: 880 * p, f2: 330, dur: 0.14, vol: 0.16 });
      this.tone({ type: 'triangle', f: 1320 * p, f2: 660, dur: 0.18, vol: 0.14, delay: 0.01 });
      this.noise({ type: 'highpass', f: 3000, dur: 0.1, vol: 0.16 });
    } else {
      this.tone({ type: 'square', f: 260 * p, f2: 110, dur: 0.07, vol: 0.13 });
      this.noise({ type: 'bandpass', f: 1800 * p, dur: 0.05, vol: 0.12, q: 1.2 });
    }
  }

  gem(combo) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (now - (this.last.gem || 0) < 0.025) return;
    this.last.gem = now;
    const m = 72 + PENTA[Math.min(combo, PENTA.length - 1)];
    this.tone({ type: 'triangle', f: mtof(m), dur: 0.16, vol: 0.14 });
    this.tone({ type: 'square', f: mtof(m + 12), dur: 0.08, vol: 0.04 });
  }

  sfx(name, p = 1) {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const gap = MIN_GAP[name];
    if (gap && now - (this.last[name] || 0) < gap) return;
    this.last[name] = now;
    const r = 0.94 + Math.random() * 0.12;
    switch (name) {
      case 'shoot': this.tone({ type: 'square', f: 620 * r, f2: 300, dur: 0.07, vol: 0.06 }); break;
      case 'zap': this.tone({ type: 'sawtooth', f: 1400 * r, f2: 200, dur: 0.14, vol: 0.09 }); this.noise({ type: 'highpass', f: 4000, dur: 0.1, vol: 0.09 }); break;
      case 'missile': this.noise({ type: 'bandpass', f: 900, f2: 300, dur: 0.25, vol: 0.09, q: 2 }); break;
      case 'whoosh': this.noise({ type: 'bandpass', f: 500, f2: 1600, dur: 0.18, vol: 0.09, q: 1.5 }); break;
      case 'jump': this.tone({ type: 'square', f: 300, f2: 620, dur: 0.12, vol: 0.09 }); break;
      case 'jump2': this.tone({ type: 'square', f: 480, f2: 980, dur: 0.14, vol: 0.09 }); this.tone({ type: 'triangle', f: 960, f2: 1500, dur: 0.12, vol: 0.06, delay: 0.03 }); break;
      case 'land': this.noise({ type: 'lowpass', f: 600, dur: 0.12, vol: 0.2 }); this.tone({ type: 'sine', f: 120, f2: 50, dur: 0.12, vol: 0.2 }); break;
      case 'slide': this.noise({ type: 'bandpass', f: 1200, f2: 500, dur: 0.3, vol: 0.09, q: 0.9 }); break;
      case 'dash': this.noise({ type: 'bandpass', f: 400, f2: 3000, dur: 0.22, vol: 0.16, q: 1.2 }); this.tone({ type: 'sawtooth', f: 200, f2: 700, dur: 0.15, vol: 0.06 }); break;
      case 'hurt': this.tone({ type: 'sawtooth', f: 240, f2: 60, dur: 0.28, vol: 0.2 }); this.noise({ type: 'lowpass', f: 900, dur: 0.2, vol: 0.2 }); break;
      case 'kill': this.tone({ type: 'triangle', f: 500 * r, f2: 160, dur: 0.1, vol: 0.09 }); break;
      case 'explode': this.noise({ type: 'lowpass', f: 1400, f2: 80, dur: 0.5, vol: 0.4 }); this.tone({ type: 'sine', f: 140, f2: 35, dur: 0.4, vol: 0.35 }); break;
      case 'slam': this.noise({ type: 'lowpass', f: 900, f2: 60, dur: 0.55, vol: 0.4 }); this.tone({ type: 'sine', f: 90, f2: 30, dur: 0.5, vol: 0.4 }); break;
      case 'coin': this.tone({ type: 'square', f: 1318, dur: 0.06, vol: 0.06 }); this.tone({ type: 'square', f: 1760, dur: 0.12, vol: 0.06, delay: 0.05 }); break;
      case 'select': this.tone({ type: 'square', f: 660, dur: 0.07, vol: 0.1 }); this.tone({ type: 'square', f: 990, dur: 0.12, vol: 0.1, delay: 0.06 }); break;
      case 'click': this.tone({ type: 'square', f: 520, dur: 0.05, vol: 0.08 }); break;
      case 'error': this.tone({ type: 'square', f: 180, f2: 120, dur: 0.18, vol: 0.12 }); break;
      case 'levelup': [72, 76, 79, 84, 88, 91].forEach((m, i) => { this.tone({ type: 'square', f: mtof(m), dur: 0.22, vol: 0.1, delay: i * 0.07 }); this.tone({ type: 'triangle', f: mtof(m - 12), dur: 0.26, vol: 0.12, delay: i * 0.07 }); }); break;
      case 'chest': [67, 71, 74, 79, 83, 86, 91].forEach((m, i) => { this.tone({ type: 'square', f: mtof(m), dur: 0.14, vol: 0.09, delay: i * 0.06 }); this.tone({ type: 'triangle', f: mtof(m + 12), dur: 0.16, vol: 0.07, delay: i * 0.06 }); }); this.noise({ type: 'highpass', f: 5000, dur: 0.4, vol: 0.06, delay: 0.3 }); break;
      case 'shrine': [57, 60, 64, 69].forEach((m, i) => this.tone({ type: 'sawtooth', f: mtof(m), dur: 0.5, vol: 0.09, delay: i * 0.09, lp: 1200 })); break;
      case 'boss':
        this.tone({ type: 'sawtooth', f: 120, f2: 40, dur: 1.6, vol: 0.32, lp: 500 });
        this.tone({ type: 'square', f: 90, f2: 30, dur: 1.8, vol: 0.2, lp: 400, delay: 0.1 });
        this.noise({ type: 'lowpass', f: 1200, f2: 100, dur: 1.6, vol: 0.35 }); break;
      case 'portal': [60, 64, 67, 72, 76, 79, 84].forEach((m, i) => this.tone({ type: 'triangle', f: mtof(m), dur: 0.9, vol: 0.12, delay: i * 0.1 })); break;
      case 'victory': [72, 76, 79, 84, 79, 84, 88, 91, 96].forEach((m, i) => { this.tone({ type: 'square', f: mtof(m), dur: 0.3, vol: 0.1, delay: i * 0.12 }); this.tone({ type: 'triangle', f: mtof(m - 12), dur: 0.34, vol: 0.14, delay: i * 0.12 }); }); break;
      case 'death': [67, 64, 60, 55, 48].forEach((m, i) => this.tone({ type: 'sawtooth', f: mtof(m), dur: 0.4, vol: 0.14, delay: i * 0.18, lp: 900 })); break;
      case 'telegraph': this.tone({ type: 'sine', f: 220, f2: 440, dur: 0.4, vol: 0.12 }); break;
      case 'spit': this.tone({ type: 'sawtooth', f: 300, f2: 120, dur: 0.16, vol: 0.09 }); break;
    }
  }

  // ----- music -----
  startMusic(boss = false) {
    if (!this.ctx) return;
    this.boss = boss;
    if (this.musicOn) return;
    this.musicOn = true; this.step = 0;
    this.nextT = this.ctx.currentTime + 0.1;
    this._timer = setInterval(() => this.schedule(), 25);
  }
  stopMusic() { this.musicOn = false; clearInterval(this._timer); }
  setIntensity(v) { this.intensity = Math.max(0, Math.min(1, v)); }
  setBoss(b) { this.boss = b; }

  schedule() {
    const ctx = this.ctx; if (!ctx || !this.musicOn) return;
    while (this.nextT < ctx.currentTime + 0.15) {
      const bpm = this.boss ? 158 : 112 + 38 * this.intensity;
      const dur = 60 / bpm / 4;
      this.playStep(this.step, this.nextT, dur);
      this.step++;
      this.nextT += dur;
    }
  }

  playStep(step, t, dur) {
    const ctx = this.ctx, I = this.intensity, boss = this.boss;
    const s = step % 16, bar = ((step / 16) | 0) % 4;
    const roots = boss ? [38, 34, 36, 33] : [45, 41, 48, 43];
    const minor = boss ? [true, false, false, false] : [true, false, false, false];
    const root = roots[bar], third = minor[bar] ? 3 : 4;
    const chord = [0, third, 7, 12, 12 + third, 19];
    const delay = t - ctx.currentTime;
    const dest = this.musG;
    // drums
    if (s % 4 === 0) this.tone({ type: 'sine', f: 150, f2: 40, dur: 0.16, vol: 0.5, delay, dest });
    if ((I > 0.25 || boss) && (s % 4 === 2)) this.noise({ type: 'highpass', f: 7000, dur: 0.04, vol: 0.14, delay, dest });
    if ((I > 0.5 || boss) && (s === 4 || s === 12)) { this.noise({ type: 'bandpass', f: 1800, dur: 0.11, vol: 0.28, delay, dest, q: 0.7 }); this.tone({ type: 'triangle', f: 220, f2: 120, dur: 0.08, vol: 0.14, delay, dest }); }
    // bass
    const bassPat = boss ? [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 7, 0, 3, 0, 5, 0] : [0, -1, 0, -1, 7, -1, 0, -1, 0, -1, 0, -1, 5, -1, 3, -1];
    const bn = bassPat[s];
    if (bn >= 0) this.tone({ type: boss ? 'sawtooth' : 'triangle', f: mtof(root + bn), dur: dur * 1.7, vol: boss ? 0.2 : 0.3, delay, dest, lp: boss ? 700 : 1400 });
    // arpeggio
    if (I > 0.12 || boss) {
      const idx = [0, 2, 1, 2, 3, 2, 1, 2, 0, 2, 4, 2, 5, 3, 4, 2][s];
      this.tone({ type: 'square', f: mtof(root + 24 + chord[idx]), dur: dur * 0.9, vol: 0.055 + I * 0.03, delay, dest, lp: 3500 });
    }
    // lead
    if (I > 0.55 || boss) {
      const pat = [0, -1, 4, -1, 7, -1, 5, 4, 2, -1, 4, -1, 7, 9, 7, -1];
      const ln = pat[s];
      if (ln >= 0 && ((bar % 2 === 0) || s < 8)) this.tone({ type: 'square', f: mtof(root + 36 + PENTA[ln % 5]), dur: dur * 1.6, vol: 0.06, delay, dest, lp: 3000 });
    }
  }
}
