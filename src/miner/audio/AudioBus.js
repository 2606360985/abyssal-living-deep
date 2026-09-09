/** All original synthesis. No recordings or unlicensed network sound assets. */
export class AudioBus {
  constructor(volume = .45) {
    this.volume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : .45));
    this.muted = false; this.active = new Set(); this.loops = []; this.groups = {}; this.ctx = null; this.servo = 0;
  }
  async unlock() {
    if (!this.ctx) {
      this.ctx = new AudioContext(); const c = this.ctx;
      this.master = c.createGain(); this.master.gain.value = this.muted ? 0 : this.volume;
      const limiter = c.createDynamicsCompressor(); limiter.threshold.value = -12; limiter.ratio.value = 8;
      this.master.connect(limiter); limiter.connect(c.destination);
      this.capture = c.createMediaStreamDestination(); limiter.connect(this.capture);
      for (const name of ['ambience', 'vehicle', 'ui', 'impact']) { this.groups[name] = c.createGain(); this.groups[name].connect(this.master); }
      this.noise = c.createBuffer(1, c.sampleRate * 4, c.sampleRate);
      const samples = this.noise.getChannelData(0); let seed = 713, brown = 0;
      for (let i = 0; i < samples.length; i++) { seed = Math.imul(seed, 1664525) + 1013904223 >>> 0; brown = (brown + (seed / 4294967296 * 2 - 1) * .025) / 1.015; samples[i] = brown * 3; }
      const source = c.createBufferSource(); source.buffer = this.noise; source.loop = true;
      const low = c.createBiquadFilter(); low.type = 'lowpass'; low.frequency.value = 330;
      const gain = c.createGain(); gain.gain.value = .14; source.connect(low).connect(gain).connect(this.groups.ambience); source.start(); this.loops.push(source);
      this.motor = c.createOscillator(); this.motor.type = 'triangle'; this.motor.frequency.value = 43;
      this.motorGain = c.createGain(); this.motorGain.gain.value = .006;
      this.motor.connect(this.motorGain).connect(this.groups.vehicle); this.motor.start(); this.loops.push(this.motor);
      this.servoOsc = c.createOscillator(); this.servoOsc.type = 'sawtooth'; this.servoOsc.frequency.value = 185;
      const filter = c.createBiquadFilter(); filter.type = 'lowpass'; filter.frequency.value = 470;
      this.servoGain = c.createGain(); this.servoGain.gain.value = 0;
      this.servoOsc.connect(filter).connect(this.servoGain).connect(this.groups.vehicle); this.servoOsc.start(); this.loops.push(this.servoOsc);
    }
    if (!document.hidden) await this.ctx.resume();
  }
  tone(group, start, end, duration, gain = .12, delay = 0, type = 'sine') {
    if (!this.ctx || this.muted || this.ctx.state !== 'running') return;
    const c = this.ctx, t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(start, t); o.frequency.exponentialRampToValueAtTime(Math.max(1, end), t + duration);
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(gain, t + .012); g.gain.exponentialRampToValueAtTime(.0001, t + duration);
    o.connect(g).connect(this.groups[group]); const entry = { source: o, gain: g }; this.active.add(entry);
    o.onended = () => { o.disconnect(); g.disconnect(); this.active.delete(entry); };
    o.start(t); o.stop(t + duration + .02);
  }
  ping() { this.tone('ui', 92, 55, .12, .06); this.tone('ui', 840, 520, .65, .18); this.tone('ui', 650, 500, 1.6, .07, .38); }
  confirm() { this.tone('ui', 560, 560, .14, .075); this.tone('ui', 840, 840, .23, .06, .15); }
  reject() { this.tone('ui', 160, 110, .2, .08); }
  impact() { this.tone('impact', 120, 24, .7, .22); this.tone('impact', 260, 60, .16, .07, 0, 'triangle'); }
  interference(amount) { if (amount > .4) this.tone('impact', 54, 28, .55, amount * .1); }
  setMuted(value) { this.muted = value; if (this.ctx) this.master.gain.setTargetAtTime(value ? 0 : this.volume, this.ctx.currentTime, .04); if (value) this.reset(); }
  update(thrust, servo = 0, signal = 1) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    this.motor.frequency.setTargetAtTime(38 + thrust * 53, t, .15);
    this.motorGain.gain.setTargetAtTime((.008 + thrust * .055) * signal, t, .1);
    this.servoGain.gain.setTargetAtTime(servo * .025 * signal, t, .025);
    this.groups.ambience.gain.setTargetAtTime(signal, t, .08);
  }
  reset() { for (const entry of this.active) { try { entry.source.stop(); } catch {} entry.source.disconnect(); entry.gain.disconnect(); } this.active.clear(); this.servo = 0; }
  suspend() { this.reset(); return this.ctx?.suspend(); }
  get nodeCount() { return this.active.size + this.loops.length; }
}
