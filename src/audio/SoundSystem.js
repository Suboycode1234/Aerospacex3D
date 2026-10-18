// Tactical Procedural Audio Engine for Combat Flight Simulator
export class SoundSystem {
  constructor() {
    this.ctx = null;
    this.enabled = true;
    this.initialized = false;

    // Jet engine audio nodes
    this.engineGain = null;
    this.engineOsc = null;
    this.engineNoise = null;
    this.engineFilter = null;

    // Afterburner nodes
    this.abGain = null;
    this.abNoise = null;
    this.abFilter = null;

    // Wind noise nodes
    this.windGain = null;
    this.windNoise = null;

    // Lock-on tone nodes
    this.lockOsc = null;
    this.lockGain = null;
    this.isLockTonePlaying = false;
  }

  init() {
    if (this.initialized) return;
    try {
      const AudioContext = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AudioContext();

      // Master compressor to keep punchy sound without digital clipping
      this.masterCompressor = this.ctx.createDynamicsCompressor();
      this.masterCompressor.threshold.setValueAtTime(-12, this.ctx.currentTime);
      this.masterCompressor.knee.setValueAtTime(30, this.ctx.currentTime);
      this.masterCompressor.ratio.setValueAtTime(12, this.ctx.currentTime);
      this.masterCompressor.attack.setValueAtTime(0.003, this.ctx.currentTime);
      this.masterCompressor.release.setValueAtTime(0.25, this.ctx.currentTime);
      this.masterCompressor.connect(this.ctx.destination);

      this.setupEngineSound();
      this.setupAfterburnerSound();
      this.setupWindSound();
      this.setupLockTone();

      this.initialized = true;
    } catch (e) {
      console.warn('AudioContext init failed:', e);
    }
  }

  ensureContext() {
    if (!this.initialized) this.init();
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  createNoiseBuffer() {
    const bufferSize = this.ctx.sampleRate * 2;
    const buffer = this.ctx.createBuffer(1, bufferSize, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }

  setupEngineSound() {
    // Jet Turbine Whine
    this.engineOsc = this.ctx.createOscillator();
    this.engineOsc.type = 'sawtooth';
    this.engineOsc.frequency.setValueAtTime(160, this.ctx.currentTime);

    const oscFilter = this.ctx.createBiquadFilter();
    oscFilter.type = 'bandpass';
    oscFilter.frequency.setValueAtTime(450, this.ctx.currentTime);
    oscFilter.Q.setValueAtTime(4.0, this.ctx.currentTime);

    // Jet Exhaust Rumble
    const noiseBuffer = this.createNoiseBuffer();
    this.engineNoise = this.ctx.createBufferSource();
    this.engineNoise.buffer = noiseBuffer;
    this.engineNoise.loop = true;

    this.engineFilter = this.ctx.createBiquadFilter();
    this.engineFilter.type = 'lowpass';
    this.engineFilter.frequency.setValueAtTime(280, this.ctx.currentTime);

    this.engineGain = this.ctx.createGain();
    this.engineGain.gain.setValueAtTime(0.12, this.ctx.currentTime);

    this.engineOsc.connect(oscFilter);
    oscFilter.connect(this.engineGain);

    this.engineNoise.connect(this.engineFilter);
    this.engineFilter.connect(this.engineGain);

    this.engineGain.connect(this.masterCompressor);

    this.engineOsc.start();
    this.engineNoise.start();
  }

  setupAfterburnerSound() {
    const noiseBuffer = this.createNoiseBuffer();
    this.abNoise = this.ctx.createBufferSource();
    this.abNoise.buffer = noiseBuffer;
    this.abNoise.loop = true;

    this.abFilter = this.ctx.createBiquadFilter();
    this.abFilter.type = 'lowpass';
    this.abFilter.frequency.setValueAtTime(180, this.ctx.currentTime);
    this.abFilter.Q.setValueAtTime(2.0, this.ctx.currentTime);

    this.abGain = this.ctx.createGain();
    this.abGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.abNoise.connect(this.abFilter);
    this.abFilter.connect(this.abGain);
    this.abGain.connect(this.masterCompressor);

    this.abNoise.start();
  }

  setupWindSound() {
    const noiseBuffer = this.createNoiseBuffer();
    this.windNoise = this.ctx.createBufferSource();
    this.windNoise.buffer = noiseBuffer;
    this.windNoise.loop = true;

    const windFilter = this.ctx.createBiquadFilter();
    windFilter.type = 'bandpass';
    windFilter.frequency.setValueAtTime(800, this.ctx.currentTime);
    windFilter.Q.setValueAtTime(0.8, this.ctx.currentTime);

    this.windGain = this.ctx.createGain();
    this.windGain.gain.setValueAtTime(0.05, this.ctx.currentTime);

    this.windNoise.connect(windFilter);
    windFilter.connect(this.windGain);
    this.windGain.connect(this.masterCompressor);

    this.windNoise.start();
  }

  setupLockTone() {
    this.lockOsc = this.ctx.createOscillator();
    this.lockOsc.type = 'sine';
    this.lockOsc.frequency.setValueAtTime(880, this.ctx.currentTime);

    this.lockGain = this.ctx.createGain();
    this.lockGain.gain.setValueAtTime(0.0, this.ctx.currentTime);

    this.lockOsc.connect(this.lockGain);
    this.lockGain.connect(this.masterCompressor);

    this.lockOsc.start();
  }

  updateEngine(throttle, airspeed, isAfterburner) {
    if (!this.initialized || !this.enabled || !this.ctx) return;

    try {
      const t = this.ctx.currentTime;
      // Sanitize inputs
      const safeThrottle = Math.max(0, Math.min(1.0, isFinite(throttle) ? throttle : 0.5));
      const safeAirspeed = Math.max(0, Math.min(1500, isFinite(airspeed) ? airspeed : 200));

      // Engine pitch scales with throttle (140Hz idle to 380Hz max mil thrust)
      const baseFreq = Math.max(80, Math.min(1200, 140 + safeThrottle * 240 + (safeAirspeed / 600) * 80));
      if (this.engineOsc && this.engineOsc.frequency) {
        this.engineOsc.frequency.setTargetAtTime(baseFreq, t, 0.08);
      }

      const baseFilter = Math.max(100, Math.min(4000, 250 + safeThrottle * 450));
      if (this.engineFilter && this.engineFilter.frequency) {
        this.engineFilter.frequency.setTargetAtTime(baseFilter, t, 0.1);
      }

      const targetGain = Math.max(0, Math.min(0.6, 0.08 + safeThrottle * 0.18));
      if (this.engineGain && this.engineGain.gain) {
        this.engineGain.gain.setTargetAtTime(targetGain, t, 0.1);
      }

      // Afterburner rumble roar
      const abTarget = isAfterburner ? 0.35 : 0.0;
      if (this.abGain && this.abGain.gain) {
        this.abGain.gain.setTargetAtTime(abTarget, t, 0.05);
      }

      // Wind rush
      const windTarget = Math.min(0.25, (safeAirspeed / 800) * 0.22);
      if (this.windGain && this.windGain.gain) {
        this.windGain.gain.setTargetAtTime(windTarget, t, 0.1);
      }
    } catch (e) {
      // Prevent audio parameter error from crashing the render loop
    }
  }

  setLockTone(mode) {
    // mode: 'none', 'tracking' (pulsing), 'locked' (solid whine)
    if (!this.initialized || !this.enabled) return;
    const t = this.ctx.currentTime;

    if (mode === 'locked') {
      this.lockOsc.frequency.setValueAtTime(950, t);
      this.lockGain.gain.setTargetAtTime(0.18, t, 0.02);
    } else if (mode === 'tracking') {
      this.lockOsc.frequency.setValueAtTime(650, t);
      // Fast pulse
      const now = performance.now() / 1000;
      const pulse = Math.sin(now * 16) > 0 ? 0.12 : 0.0;
      this.lockGain.gain.setValueAtTime(pulse, t);
    } else {
      this.lockGain.gain.setTargetAtTime(0.0, t, 0.03);
    }
  }

  // 20mm Vulcan Rotary Cannon (Cyclic mechanical bursts)
  playCannonShot() {
    if (!this.initialized || !this.enabled) return;
    const t = this.ctx.currentTime;

    // Cannon punch (low pop)
    const osc = this.ctx.createOscillator();
    const oscGain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(140, t);
    osc.frequency.exponentialRampToValueAtTime(35, t + 0.05);

    oscGain.gain.setValueAtTime(0.3, t);
    oscGain.gain.exponentialRampToValueAtTime(0.001, t + 0.06);

    osc.connect(oscGain);
    oscGain.connect(this.masterCompressor);

    osc.start(t);
    osc.stop(t + 0.07);

    // High frequency muzzle crack
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'highpass';
    filter.frequency.setValueAtTime(1200, t);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.25, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterCompressor);

    noise.start(t);
    noise.stop(t + 0.05);
  }

  // Guided Missile Launch (Rocket motor ignition & whoosh)
  playMissileLaunch() {
    if (!this.initialized || !this.enabled) return;
    const t = this.ctx.currentTime;

    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(400, t);
    filter.frequency.exponentialRampToValueAtTime(1600, t + 0.8);
    filter.Q.setValueAtTime(1.5, t);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(0.01, t);
    gain.gain.linearRampToValueAtTime(0.4, t + 0.1);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(this.masterCompressor);

    noise.start(t);
    noise.stop(t + 1.3);
  }

  // Flare deploy "thump-pop"
  playFlareDeploy() {
    if (!this.initialized || !this.enabled) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(220, t);
    osc.frequency.exponentialRampToValueAtTime(60, t + 0.12);

    gain.gain.setValueAtTime(0.25, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.12);

    osc.connect(gain);
    gain.connect(this.masterCompressor);
    osc.start(t);
    osc.stop(t + 0.13);
  }

  // Explosion (Boom with deep resonance and debris crackle)
  playExplosion(distance = 100) {
    if (!this.initialized || !this.enabled) return;
    const t = this.ctx.currentTime;
    const volume = Math.max(0.05, Math.min(1.0, 1.0 - (distance / 4000)));

    // Deep sub-bass boom
    const subOsc = this.ctx.createOscillator();
    const subGain = this.ctx.createGain();
    subOsc.type = 'sine';
    subOsc.frequency.setValueAtTime(90, t);
    subOsc.frequency.exponentialRampToValueAtTime(20, t + 1.4);

    subGain.gain.setValueAtTime(0.6 * volume, t);
    subGain.gain.exponentialRampToValueAtTime(0.001, t + 1.5);

    subOsc.connect(subGain);
    subGain.connect(this.masterCompressor);
    subOsc.start(t);
    subOsc.stop(t + 1.6);

    // Blast wave noise
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, t);
    filter.frequency.exponentialRampToValueAtTime(100, t + 1.2);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.7 * volume, t);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 1.3);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterCompressor);
    noise.start(t);
    noise.stop(t + 1.4);
  }

  // Sonic Boom
  playSonicBoom() {
    if (!this.initialized || !this.enabled) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(65, t);
    osc.frequency.exponentialRampToValueAtTime(15, t + 0.4);

    gain.gain.setValueAtTime(0.8, t);
    gain.gain.exponentialRampToValueAtTime(0.001, t + 0.45);

    osc.connect(gain);
    gain.connect(this.masterCompressor);
    osc.start(t);
    osc.stop(t + 0.5);
  }

  // Tactical Cockpit Warning Beeps
  playWarningBeep(alertType = 'missile') {
    if (!this.initialized || !this.enabled) return;
    const t = this.ctx.currentTime;

    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = 'square';

    if (alertType === 'missile') {
      osc.frequency.setValueAtTime(1200, t);
      osc.frequency.setValueAtTime(900, t + 0.08);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.stop(t + 0.2);
    } else {
      osc.frequency.setValueAtTime(750, t);
      gain.gain.setValueAtTime(0.12, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.15);
      osc.stop(t + 0.16);
    }

    osc.connect(gain);
    gain.connect(this.masterCompressor);
    osc.start(t);
  }

  // Hyperspace Quantum Portal Warp Sound (Sub-bass rumble + high energy charge + sonic boom)
  playWarpJump() {
    if (!this.initialized || !this.enabled) return;
    const t = this.ctx.currentTime;

    // 1. High-frequency energy charge sweep up
    const sweepOsc = this.ctx.createOscillator();
    const sweepGain = this.ctx.createGain();
    sweepOsc.type = 'sawtooth';
    sweepOsc.frequency.setValueAtTime(180, t);
    sweepOsc.frequency.exponentialRampToValueAtTime(3200, t + 0.35);

    sweepGain.gain.setValueAtTime(0.01, t);
    sweepGain.gain.linearRampToValueAtTime(0.40, t + 0.30);
    sweepGain.gain.exponentialRampToValueAtTime(0.001, t + 0.60);

    sweepOsc.connect(sweepGain);
    sweepGain.connect(this.masterCompressor);
    sweepOsc.start(t);
    sweepOsc.stop(t + 0.65);

    // 2. Heavy Sub-bass Shockwave Sonic Boom
    const boomOsc = this.ctx.createOscillator();
    const boomGain = this.ctx.createGain();
    boomOsc.type = 'sine';
    boomOsc.frequency.setValueAtTime(140, t + 0.28);
    boomOsc.frequency.exponentialRampToValueAtTime(28, t + 1.2);

    boomGain.gain.setValueAtTime(0.85, t + 0.28);
    boomGain.gain.exponentialRampToValueAtTime(0.001, t + 1.4);

    boomOsc.connect(boomGain);
    boomGain.connect(this.masterCompressor);
    boomOsc.start(t + 0.28);
    boomOsc.stop(t + 1.5);

    // 3. Hyperspace Atmospheric Whoosh Blast
    const noise = this.ctx.createBufferSource();
    noise.buffer = this.createNoiseBuffer();
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(450, t + 0.25);
    filter.frequency.exponentialRampToValueAtTime(4500, t + 0.45);
    filter.frequency.exponentialRampToValueAtTime(300, t + 1.3);

    const noiseGain = this.ctx.createGain();
    noiseGain.gain.setValueAtTime(0.60, t + 0.28);
    noiseGain.gain.exponentialRampToValueAtTime(0.001, t + 1.2);

    noise.connect(filter);
    filter.connect(noiseGain);
    noiseGain.connect(this.masterCompressor);
    noise.start(t + 0.25);
    noise.stop(t + 1.35);
  }

  toggle() {
    this.enabled = !this.enabled;
    if (!this.enabled && this.ctx) {
      if (this.engineGain) this.engineGain.gain.value = 0;
      if (this.abGain) this.abGain.gain.value = 0;
      if (this.windGain) this.windGain.gain.value = 0;
      if (this.lockGain) this.lockGain.gain.value = 0;
    }
    return this.enabled;
  }
}
