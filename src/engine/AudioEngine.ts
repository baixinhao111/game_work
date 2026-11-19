import type { WeaponId } from '../game/types';

// 五声音阶升调频率 (C5, D5, E5, G5, A5, C6, D6, E6)
const PENTATONIC_SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private unlocked = false;
  private lastShootSoundTime = 0;

  constructor(initialMuted = false) {
    this.muted = initialMuted;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /**
   * 必须在用户手势同步栈（touchstart / touchend / click）中调用，适配 iOS Safari 与微信 X5 内核
   */
  unlock(): void {
    try {
      if (!this.ctx) {
        const AudioCtx =
          window.AudioContext ||
          (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
        if (!AudioCtx) return;
        this.ctx = new AudioCtx();
        this.noiseBuffer = this.createNoiseBuffer(this.ctx);
      }
      if (this.ctx.state === 'suspended') {
        void this.ctx.resume();
      }
      if (!this.unlocked) {
        const buffer = this.ctx.createBuffer(1, 1, 22050);
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.connect(this.ctx.destination);
        src.start(0);
        this.unlocked = true;
      }
    } catch {
      // 某些严格受限环境降级为无声模式而不崩溃
    }
  }

  suspend(): void {
    if (this.ctx && this.ctx.state === 'running') {
      void this.ctx.suspend();
    }
  }

  resumeIfPlaying(): void {
    if (this.ctx && this.ctx.state === 'suspended' && !this.muted) {
      void this.ctx.resume();
    }
  }

  vibrate(pattern: number | number[]): void {
    if (this.muted) return;
    try {
      if (typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function') {
        navigator.vibrate(pattern);
      }
    } catch {
      // iOS Safari 等不支持环境静默跳过
    }
  }

  playShoot(weaponId: WeaponId): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // 高射速下节流开火音，防止多弹道混叠破音
    if (now - this.lastShootSoundTime < 0.055) return;
    this.lastShootSoundTime = now;

    if (weaponId === 'keyboard') {
      this.playTone(950, 320, 0.045, 'square', 0.06);
      this.playNoise(0.035, 1800, 0.05);
    } else if (weaponId === 'americano') {
      this.playTone(1320, 560, 0.075, 'sawtooth', 0.055);
    } else {
      // stapler 订书机清脆点击
      this.playTone(760, 290, 0.04, 'triangle', 0.065);
    }
  }

  playGateTick(stepIndex: number): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const freq = PENTATONIC_SCALE[Math.min(PENTATONIC_SCALE.length - 1, Math.max(0, stepIndex))];
    this.playTone(freq, freq * 1.06, 0.065, 'triangle', 0.08);
  }

  playGateFlip(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.playToneAt(now + idx * 0.04, f, f * 1.03, 0.14, 'triangle', 0.11);
    });
    this.vibrate([15, 20, 25]);
  }

  playGateGood(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.playToneAt(now, 587.33, 880, 0.1, 'triangle', 0.11);
    this.playToneAt(now + 0.06, 880, 1174.66, 0.12, 'sine', 0.1);
    this.vibrate(12);
  }

  playGateBad(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.playToneAt(now, 240, 115, 0.18, 'sawtooth', 0.11);
    this.vibrate(35);
  }

  playExplosion(big = false): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const dur = big ? 0.34 : 0.16;
    this.playNoise(dur, big ? 650 : 1100, big ? 0.18 : 0.11);
    this.playTone(big ? 140 : 190, 42, dur, 'sine', big ? 0.2 : 0.12);
    if (big) this.vibrate([20, 30, 40]);
  }

  playUltimate(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // 打卡机“滴！滴！”清脆提示 + 冲击波扫频
    this.playToneAt(now, 1480, 1480, 0.06, 'square', 0.1);
    this.playToneAt(now + 0.08, 1975, 1975, 0.11, 'square', 0.11);
    this.playToneAt(now + 0.14, 240, 960, 0.35, 'sawtooth', 0.09);
    this.playNoise(0.32, 1600, 0.12);
    this.vibrate([25, 25, 45]);
  }

  playVictory(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const melody = [523.25, 659.25, 783.99, 1046.5];
    melody.forEach((f, idx) => {
      this.playToneAt(now + idx * 0.095, f, f, idx === 3 ? 0.35 : 0.14, 'triangle', 0.13);
    });
  }

  playDefeat(): void {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = [392.0, 349.23, 293.66, 220.0];
    notes.forEach((f, idx) => {
      this.playToneAt(now + idx * 0.12, f, f * 0.96, 0.18, 'sawtooth', 0.08);
    });
  }

  private playTone(
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ): void {
    if (!this.ctx) return;
    this.playToneAt(this.ctx.currentTime, freqStart, freqEnd, duration, type, volume);
  }

  private playToneAt(
    startTime: number,
    freqStart: number,
    freqEnd: number,
    duration: number,
    type: OscillatorType,
    volume: number
  ): void {
    if (!this.ctx) return;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(Math.max(20, freqStart), startTime);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, freqEnd), startTime + duration);

    gain.gain.setValueAtTime(0.001, startTime);
    gain.gain.linearRampToValueAtTime(volume, startTime + 0.006);
    gain.gain.exponentialRampToValueAtTime(0.0008, startTime + duration);

    osc.connect(gain);
    gain.connect(this.ctx.destination);
    osc.start(startTime);
    osc.stop(startTime + duration + 0.01);
  }

  private playNoise(duration: number, cutoffHz: number, volume: number): void {
    if (!this.ctx || !this.noiseBuffer) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;

    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(cutoffHz, now);

    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(volume, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + duration);

    src.connect(filter);
    filter.connect(gain);
    gain.connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.01);
  }

  private createNoiseBuffer(ctx: AudioContext): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * 0.5);
    const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < length; i++) {
      data[i] = Math.random() * 2 - 1;
    }
    return buffer;
  }
}
