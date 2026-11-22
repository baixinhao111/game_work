import type { QuipChannel } from '../data/quips';
import type { WeaponId } from '../game/types';
import { triggerMiniToolVibrate, type VibrateIntensity } from '../platform/MiniToolBridge';

// 五声音阶升调频率 (C5, D5, E5, G5, A5, C6, D6, E6)
const PENTATONIC_SCALE = [523.25, 587.33, 659.25, 783.99, 880.0, 1046.5, 1174.66, 1318.51];

export class AudioEngine {
  private ctx: AudioContext | null = null;
  private noiseBuffer: AudioBuffer | null = null;
  private muted = false;
  private unlocked = false;
  /** 音效总线（音效音量滑块控制它）；解锁前为 null */
  private sfxBus: GainNode | null = null;
  private sfxVol = 0.9;
  private musicVol = 0.8;
  private vibrationOn = true;
  private lastShootSoundTime = 0;
  private lastQuipSoundTime = 0;

  constructor(initialMuted = false) {
    this.muted = initialMuted;
  }

  /** 已解锁的 AudioContext（供背景音乐共用）；解锁前为 null */
  get context(): AudioContext | null {
    return this.ctx;
  }

  get isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  /** 背景音乐音量 0~1（MusicEngine 每帧读取） */
  get musicVolume(): number {
    return this.muted ? 0 : this.musicVol;
  }

  /** 应用设置：音乐 / 音效音量与震动开关 */
  applySettings(opts: { musicVolume: number; sfxVolume: number; vibration: boolean }): void {
    this.musicVol = opts.musicVolume;
    this.sfxVol = opts.sfxVolume;
    this.vibrationOn = opts.vibration;
    if (this.sfxBus && this.ctx) this.sfxBus.gain.setTargetAtTime(this.sfxVol, this.ctx.currentTime, 0.03);
  }

  /** 音效是否需要发声（静音或音效音量为 0 时整段跳过合成，省 CPU） */
  private get sfxSilent(): boolean {
    return this.muted || this.sfxVol <= 0.001;
  }

  private get out(): AudioNode {
    return this.sfxBus ?? this.ctx!.destination;
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
        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = this.sfxVol;
        this.sfxBus.connect(this.ctx.destination);
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
    if (!this.vibrationOn) return;
    let intensity: VibrateIntensity = 'medium';
    if (typeof pattern === 'number') {
      intensity = pattern <= 15 ? 'light' : pattern <= 30 ? 'medium' : 'heavy';
    } else if (Array.isArray(pattern) && pattern.length > 0) {
      const tail = pattern[pattern.length - 1];
      intensity = tail >= 40 ? 'long' : 'medium';
    }
    triggerMiniToolVibrate(intensity);
  }

  playShoot(weaponId: WeaponId): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // 高射速下节流开火音，防止多弹道混叠破音
    if (now - this.lastShootSoundTime < 0.055) return;
    this.lastShootSoundTime = now;

    if (weaponId === 'keyboard') {
      this.playTone(950, 320, 0.045, 'square', 0.06);
      this.playNoise(0.035, 1800, 0.05);
    } else if (weaponId === 'americano') {
      this.playTone(1320, 560, 0.075, 'sawtooth', 0.055);
    } else if (weaponId === 'drone') {
      this.playTone(620, 980, 0.05, 'square', 0.04);
    } else if (weaponId === 'headphone') {
      this.playTone(220, 440, 0.12, 'sine', 0.09);
    } else if (weaponId === 'ai_pod') {
      this.playTone(1760, 1240, 0.03, 'square', 0.04);
    } else {
      // stapler 订书机清脆点击
      this.playTone(760, 290, 0.04, 'triangle', 0.065);
    }
  }

  private lastKillSoundTime = 0;

  /** 击杀「啵」：音高随连杀数沿五声音阶上行，越杀越带劲（节流避免糊成一片） */
  playKill(streak: number): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastKillSoundTime < 0.035) return;
    this.lastKillSoundTime = now;
    const idx = Math.min(PENTATONIC_SCALE.length - 1, Math.floor(streak / 6));
    const f = PENTATONIC_SCALE[idx] * (0.98 + Math.random() * 0.04);
    this.playTone(f * 1.5, f * 0.75, 0.05, 'square', 0.045);
    this.playNoise(0.03, 3200, 0.035);
  }

  /** 同一帧割倒一大片：低频碎裂声 */
  playCrunch(): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastKillSoundTime < 0.06) return;
    this.lastKillSoundTime = now;
    this.playNoise(0.14, 1300, 0.1);
    this.playTone(130, 48, 0.14, 'sine', 0.13);
  }

  /** Boss 出招音效：每种招式一个声音，让玩家「听」得出下一波是什么 */
  playBossShot(kind: 'ring' | 'fan' | 'charge' | 'whistle' | 'thud' | 'zap'): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    switch (kind) {
      case 'ring':
        // 闹铃颤音
        for (let i = 0; i < 6; i++) {
          this.playToneAt(now + i * 0.035, i % 2 ? 2093 : 1568, i % 2 ? 2093 : 1568, 0.05, 'square', 0.035);
        }
        break;
      case 'fan':
        for (let i = 0; i < 3; i++) this.playToneAt(now + i * 0.045, 980, 320, 0.09, 'sawtooth', 0.04);
        break;
      case 'charge':
        this.playToneAt(now, 220, 880, 0.55, 'sine', 0.05);
        this.playToneAt(now, 223, 884, 0.55, 'triangle', 0.03);
        break;
      case 'zap':
        this.playNoise(0.3, 5200, 0.06);
        this.playToneAt(now, 140, 120, 0.3, 'sawtooth', 0.06);
        break;
      case 'whistle':
        this.playToneAt(now, 1900, 520, 1.0, 'sine', 0.035);
        break;
      default:
        this.playToneAt(now, 110, 62, 0.4, 'sawtooth', 0.07);
    }
  }

  /** 击杀里程碑：上行三连音 */
  playMilestone(): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    [783.99, 1046.5, 1318.51].forEach((f, i) => this.playToneAt(now + i * 0.07, f, f, i === 2 ? 0.22 : 0.1, 'square', 0.07));
  }

  playGateTick(stepIndex: number): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const freq = PENTATONIC_SCALE[Math.min(PENTATONIC_SCALE.length - 1, Math.max(0, stepIndex))];
    this.playTone(freq, freq * 1.06, 0.065, 'triangle', 0.08);
  }

  playGateFlip(): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 1046.5];
    notes.forEach((f, idx) => {
      this.playToneAt(now + idx * 0.04, f, f * 1.03, 0.14, 'triangle', 0.11);
    });
    this.vibrate([15, 20, 25]);
  }

  playGateGood(): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.playToneAt(now, 587.33, 880, 0.1, 'triangle', 0.11);
    this.playToneAt(now + 0.06, 880, 1174.66, 0.12, 'sine', 0.1);
    this.vibrate(12);
  }

  playGateBad(): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    this.playToneAt(now, 240, 115, 0.18, 'sawtooth', 0.11);
    this.vibrate(35);
  }

  playExplosion(big = false): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const dur = big ? 0.34 : 0.16;
    this.playNoise(dur, big ? 650 : 1100, big ? 0.18 : 0.11);
    this.playTone(big ? 140 : 190, 42, dur, 'sine', big ? 0.2 : 0.12);
    if (big) this.vibrate([20, 30, 40]);
  }

  playUltimate(): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    // 打卡机“滴！滴！”清脆提示 + 冲击波扫频
    this.playToneAt(now, 1480, 1480, 0.06, 'square', 0.1);
    this.playToneAt(now + 0.08, 1975, 1975, 0.11, 'square', 0.11);
    this.playToneAt(now + 0.14, 240, 960, 0.35, 'sawtooth', 0.09);
    this.playNoise(0.32, 1600, 0.12);
    this.vibrate([25, 25, 45]);
  }

  playVictory(): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const melody = [523.25, 659.25, 783.99, 1046.5];
    melody.forEach((f, idx) => {
      this.playToneAt(now + idx * 0.095, f, f, idx === 3 ? 0.35 : 0.14, 'triangle', 0.13);
    });
  }

  playDefeat(): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    const notes = [392.0, 349.23, 293.66, 220.0];
    notes.forEach((f, idx) => {
      this.playToneAt(now + idx * 0.12, f, f * 0.96, 0.18, 'sawtooth', 0.08);
    });
  }

  /** 三通道嘴替专属提示音：气泡啵 / 工作群叮咚 / Boss 扩音呛声 */
  playQuip(channel: QuipChannel): void {
    if (this.sfxSilent || !this.ctx || this.ctx.state !== 'running') return;
    const now = this.ctx.currentTime;
    if (now - this.lastQuipSoundTime < 0.35) return;
    this.lastQuipSoundTime = now;

    if (channel === 'SQUAD') {
      this.playToneAt(now, 360, 740, 0.06, 'sine', 0.075);
    } else if (channel === 'CHAT') {
      this.playToneAt(now, 880, 880, 0.075, 'sine', 0.08);
      this.playToneAt(now + 0.065, 1174.66, 1174.66, 0.14, 'triangle', 0.085);
    } else {
      this.playToneAt(now, 195, 135, 0.13, 'sawtooth', 0.065);
      this.playToneAt(now + 0.04, 330, 260, 0.08, 'square', 0.045);
    }
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
    gain.connect(this.out);
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
    gain.connect(this.out);
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
