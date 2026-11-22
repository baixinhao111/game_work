import { DAY_TRANSPOSE, SONGS, type SongDef, type ThemeId } from '../data/music';
import type { GameWorld } from '../game/GameWorld';
import type { AudioEngine } from './AudioEngine';

const LOOKAHEAD_SEC = 0.12;
const TICK_MS = 25;
const BUS_VOLUME = 0.3;

const midiToHz = (m: number): number => 440 * Math.pow(2, (m - 69) / 12);

export interface MusicTarget {
  theme: ThemeId | null;
  /** 0~3：同时开启的编曲层数 */
  intensity: number;
  transpose: number;
  tempoMul: number;
  alarm: boolean;
}

/**
 * 实时合成的动态芯片音乐（不打包任何音频文件）。
 * 采用「前瞻调度」：每 25ms 把接下来 120ms 内要响的音符排进 AudioContext 时钟，
 * 节拍不受画面掉帧影响；AudioContext 被挂起（暂停）时音乐自然停住。
 */
export class MusicSynth {
  private noise: AudioBuffer;
  readonly bus: GainNode;

  constructor(
    readonly ctx: BaseAudioContext,
    destination: AudioNode
  ) {
    const len = Math.floor(ctx.sampleRate * 0.5);
    this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -14;
    comp.ratio.value = 4;
    this.bus = ctx.createGain();
    this.bus.gain.value = BUS_VOLUME;
    this.bus.connect(comp);
    comp.connect(destination);
  }

  private tone(
    wave: OscillatorType,
    midi: number,
    t: number,
    dur: number,
    vol: number,
    opts: { attack?: number; cutoff?: number; detune?: number; slideTo?: number } = {}
  ): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = wave;
    osc.frequency.setValueAtTime(midiToHz(midi), t);
    if (opts.slideTo !== undefined) osc.frequency.exponentialRampToValueAtTime(midiToHz(opts.slideTo), t + dur);
    if (opts.detune) osc.detune.value = opts.detune;
    const g = ctx.createGain();
    const a = opts.attack ?? 0.005;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + a);
    g.gain.setValueAtTime(vol, t + Math.max(a, dur * 0.6));
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let node: AudioNode = osc;
    if (opts.cutoff) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = opts.cutoff;
      osc.connect(f);
      node = f;
    }
    node.connect(g);
    g.connect(this.bus);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  private noiseHit(t: number, dur: number, vol: number, type: BiquadFilterType, freq: number): void {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f);
    f.connect(g);
    g.connect(this.bus);
    src.start(t);
    src.stop(t + dur + 0.02);
  }

  private kick(t: number, vol: number): void {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(150, t);
    osc.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
    osc.connect(g);
    g.connect(this.bus);
    osc.start(t);
    osc.stop(t + 0.25);
  }

  private snare(t: number, vol: number): void {
    this.noiseHit(t, 0.13, vol, 'highpass', 1400);
    this.tone('triangle', 52, t, 0.08, vol * 0.5);
  }

  crash(t: number, vol = 0.22): void {
    this.noiseHit(t, 0.9, vol, 'highpass', 5000);
  }

  /** 排一步（16 分音符）的所有声部 */
  scheduleStep(song: SongDef, step: number, t: number, target: MusicTarget, stepDur: number): void {
    const bar = Math.floor(step / 16) % song.chords.length;
    const s = step % 16;
    const chord = song.chords[bar];
    const tr = target.transpose;
    const lvl = target.intensity;

    // 层 0：贝斯 + 踩镲
    const b = song.bassPattern[s];
    if (b !== null) this.tone(song.bassWave, chord.bass + b + tr, t, stepDur * 1.6, 0.16, { cutoff: 900 });
    if (song.hat[s] === 'x') {
      // 16 分密集踩镲要压低音量，否则噪声会盖住旋律
      const dense = song.hat.indexOf('.') === -1;
      this.noiseHit(t, dense ? 0.025 : 0.035, dense ? 0.03 : lvl >= 3 ? 0.055 : 0.045, 'highpass', 8000);
    }

    // 层 1：底鼓 + 军鼓
    if (lvl >= 1) {
      if (song.kick[s] === 'x') this.kick(t, 0.55);
      if (song.snare[s] === 'x') this.snare(t, 0.2);
    }

    // 层 2：琶音
    if (lvl >= 2 && s % song.arpEvery === 0) {
      const idx = song.arpPattern[(s / song.arpEvery) % song.arpPattern.length];
      const n = chord.tones.length;
      const midi = chord.tones[idx % n] + 12 * Math.floor(idx / n) + tr;
      this.tone(song.arpWave, midi, t, stepDur * song.arpEvery * 0.9, 0.045, { cutoff: 2600 });
    }

    // 层 3：主旋律（双振荡器微失谐，更厚）
    if (lvl >= 3) {
      for (const [at, midi, len] of song.lead[bar]) {
        if (at !== s) continue;
        const dur = stepDur * len * 0.95;
        this.tone(song.leadWave, midi + tr, t, dur, 0.07, { cutoff: 3400, attack: 0.01 });
        this.tone(song.leadWave, midi + tr, t, dur, 0.04, { cutoff: 3400, attack: 0.01, detune: 9 });
      }
    }

    // 红温警报：每拍一声高音铃
    if (target.alarm && s % 4 === 0) {
      this.tone('square', 96 + (s === 8 ? 1 : 0), t, 0.06, 0.03);
    }
  }

  /** 大招过门：军鼓滚奏 + 上行琶音 + 镲片 */
  fill(t: number, stepDur: number, transpose: number): void {
    for (let i = 0; i < 8; i++) {
      this.snare(t + i * stepDur * 0.5, 0.1 + i * 0.02);
      this.tone('square', 69 + i * 2 + transpose, t + i * stepDur * 0.5, stepDur * 0.5, 0.05);
    }
    this.crash(t + stepDur * 4);
  }
}

export class MusicEngine {
  private synth: MusicSynth | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  private theme: ThemeId | null = null;
  private pending: MusicTarget | null = null;
  private target: MusicTarget = { theme: null, intensity: 0, transpose: 0, tempoMul: 1, alarm: false };
  private step = 0;
  private nextTime = 0;
  private lastUltStamp = 0;
  private resultSince = -1;

  constructor(private readonly audio: AudioEngine) {}

  /** 每帧调用：根据游戏状态决定放哪首、开几层 */
  update(world: GameWorld): void {
    const ctx = this.audio.context;
    if (!ctx) return;
    if (!this.synth) {
      this.synth = new MusicSynth(ctx, ctx.destination);
      this.timer = setInterval(() => this.tick(), TICK_MS);
    }
    this.synth.bus.gain.setTargetAtTime(BUS_VOLUME * this.audio.musicVolume, ctx.currentTime, 0.05);

    const st = world.state;
    const boss = world.bosses.boss;
    const day = Math.max(1, Math.min(5, st.levelDay || 1));
    const next: MusicTarget = { theme: null, intensity: 2, transpose: DAY_TRANSPOSE[day - 1] ?? 0, tempoMul: 1, alarm: false };

    if (st.phase === 'MENU') {
      next.theme = 'menu';
      next.intensity = 3;
      next.transpose = 0;
      this.resultSince = -1;
    } else if (st.phase === 'VICTORY' || st.phase === 'DEFEAT') {
      // 结算：先让胜负音效独奏，2 秒后回到待机主题
      if (this.resultSince < 0) this.resultSince = ctx.currentTime;
      next.theme = ctx.currentTime - this.resultSince > 2 ? 'menu' : null;
      next.intensity = 2;
      next.transpose = 0;
    } else {
      this.resultSince = -1;
      if (boss.active) {
        next.theme = 'boss';
        next.intensity = 3;
        next.alarm = boss.enraged;
        next.tempoMul = boss.enraged ? 1.08 : 1;
      } else {
        next.theme = 'stage';
        const crowd = world.enemies.enemies.activeCount;
        next.intensity = st.elapsedSec < 5 ? 1 : st.squadCount >= 25 || crowd >= 18 || st.elapsedSec > 20 ? 3 : 2;
      }
      if (st.ultActiveTimer > 0) next.intensity = 3;
      // 大招按下瞬间插入过门
      if (st.ultStampTimer > 0 && this.lastUltStamp <= 0) {
        const song = this.theme ? SONGS[this.theme] : SONGS.stage;
        this.synth.fill(ctx.currentTime + 0.02, 60 / (song.bpm * next.tempoMul) / 4, next.transpose);
      }
    }
    this.lastUltStamp = st.ultStampTimer;

    if (next.theme !== this.theme) {
      this.pending = next;
    } else {
      this.target = next;
    }
  }

  private tick(): void {
    const synth = this.synth;
    if (!synth) return;
    const ctx = synth.ctx;
    const now = ctx.currentTime;
    // 后台节流或刚恢复时，跳过已经错过的拍子，避免一次性补播一大串音符
    if (this.nextTime < now - 0.05) this.nextTime = now + 0.03;

    while (this.nextTime < now + LOOKAHEAD_SEC) {
      // 换曲只在拍点上进行（每 4 步一拍），听起来不突兀
      if (this.pending && this.step % 4 === 0) {
        const switchingSong = this.pending.theme !== this.theme;
        this.theme = this.pending.theme;
        this.target = this.pending;
        this.pending = null;
        if (switchingSong) {
          this.step = 0;
          if (this.theme === 'boss') synth.crash(this.nextTime, 0.18);
        }
      }
      const song = this.theme ? SONGS[this.theme] : null;
      const stepDur = 60 / ((song ? song.bpm : 120) * this.target.tempoMul) / 4;
      if (song) synth.scheduleStep(song, this.step, this.nextTime, this.target, stepDur);
      this.step = (this.step + 1) % (16 * (song ? song.chords.length : 4));
      this.nextTime += stepDur;
    }
  }

  dispose(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
