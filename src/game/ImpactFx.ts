import { ENEMIES } from '../data/enemies';
import { PALETTE } from '../data/palette';
import { projectX, SCROLL_SPEED } from '../engine/Viewport';
import type { Enemy, EnemyId } from './types';
import type { GameWorld } from './GameWorld';

export interface Decal {
  x: number;
  y: number;
  color: string;
  size: number;
  rot: number;
  variant: number;
  life: number;
  maxLife: number;
}

export interface DeathPop {
  x: number;
  y: number;
  configId: EnemyId;
  t: number;
  dur: number;
  big: boolean;
}

export interface Blast {
  x: number;
  y: number;
  r: number;
  color: string;
  t: number;
  dur: number;
}

export interface FxStamp {
  text: string;
  color: string;
  t: number;
  dur: number;
}

const MAX_DECALS = 70;
const MAX_POPS = 60;
const ELITES: ReadonlySet<EnemyId> = new Set<EnemyId>(['ppt_pie', 'client_tweak']);
const MILESTONES = [50, 100, 200, 300, 500, 800];

/**
 * 打击与击杀反馈：地面墨渍、死亡爆开、击杀音效连击、大怪顿帧白闪、里程碑 / 清屏印章、尸潮警报。
 * 只存表现数据，不影响玩法数值；渲染由 Renderer 读取这里的数组完成。
 */
export class ImpactFx {
  readonly decals: Decal[] = [];
  readonly pops: DeathPop[] = [];
  readonly blasts: Blast[] = [];
  stampFx: FxStamp | null = null;
  /** 屏幕白闪剩余时间 */
  flash = 0;
  /** 「尸潮来袭」警报条剩余时间 */
  surgeBanner = 0;
  private decalCursor = 0;
  private killsThisStep = 0;
  private nextMilestone = 0;

  constructor(private readonly world: GameWorld) {}

  reset(): void {
    this.decals.length = 0;
    this.pops.length = 0;
    this.blasts.length = 0;
    this.stampFx = null;
    this.flash = 0;
    this.surgeBanner = 0;
    this.decalCursor = 0;
    this.killsThisStep = 0;
    this.nextMilestone = 0;
  }

  /** 敌人死亡（被玩家击杀时 byPlayer = true；撞上小队同归于尽时 false） */
  onEnemyDied(e: Enemy, byPlayer: boolean): void {
    const x = projectX(e.laneX, e.y);
    const cfg = ENEMIES[e.configId];
    const big = ELITES.has(e.configId);

    const low = this.world.lowFx;
    if (!low && this.pops.length < MAX_POPS) {
      this.pops.push({ x, y: e.y, configId: e.configId, t: 0, dur: big ? 0.2 : 0.13, big });
    }

    // 地面墨渍：环形缓冲，满了就覆盖最旧的（省电画质下不留墨渍）
    if (low) {
      if (byPlayer) this.killsThisStep++;
      if (byPlayer && big) this.onBigKill();
      return;
    }
    const decal: Decal = {
      x,
      y: e.y + e.radius * 0.5,
      color: cfg.color,
      size: e.radius * (big ? 2.6 : 1.7) * (0.85 + Math.random() * 0.3),
      rot: (Math.random() - 0.5) * 0.7,
      variant: Math.floor(Math.random() * 3),
      life: 0,
      maxLife: big ? 3.2 : 2.2
    };
    if (this.decals.length < MAX_DECALS) {
      this.decals.push(decal);
    } else {
      this.decals[this.decalCursor] = decal;
      this.decalCursor = (this.decalCursor + 1) % MAX_DECALS;
    }

    if (!byPlayer) return;
    this.killsThisStep++;

    if (big) this.onBigKill();
  }

  /** 大怪：顿帧 + 白闪 + 震屏 + 闷响 */
  private onBigKill(): void {
    const st = this.world.state;
    st.hitstopTimer = Math.max(st.hitstopTimer, 0.05);
    st.shakeMagnitude = Math.max(st.shakeMagnitude, 6);
    st.shakeTimer = Math.max(st.shakeTimer, 0.16);
    this.flash = Math.max(this.flash, 0.08);
    this.world.audio.playExplosion(true);
  }

  /** 爆炸冲击波：Boss 炸弹、登场落地、死亡连环爆 */
  addBlast(x: number, y: number, r: number, color: string): void {
    if (this.blasts.length >= 24) this.blasts.shift();
    this.blasts.push({ x, y, r, color, t: 0, dur: 0.42 });
  }

  /** 地面焦痕（深色墨渍，跟随路面滚动淡出） */
  addScorch(x: number, y: number, size: number): void {
    if (this.world.lowFx) return;
    const decal: Decal = { x, y, color: '#2A1620', size, rot: (Math.random() - 0.5) * 0.4, variant: Math.floor(Math.random() * 3), life: 0, maxLife: 3.5 };
    if (this.decals.length < MAX_DECALS) this.decals.push(decal);
    else {
      this.decals[this.decalCursor] = decal;
      this.decalCursor = (this.decalCursor + 1) % MAX_DECALS;
    }
  }

  onKillCount(kills: number): void {
    while (this.nextMilestone < MILESTONES.length && kills >= MILESTONES[this.nextMilestone]) {
      const n = MILESTONES[this.nextMilestone];
      this.nextMilestone++;
      this.stamp(`割草 ${n}!`, n >= 300 ? PALETTE.red : PALETTE.yellow);
      this.world.audio.playMilestone();
      this.world.audio.vibrate([12, 30, 18]);
    }
  }

  stamp(text: string, color: string = PALETTE.mint): void {
    this.stampFx = { text, color, t: 0, dur: 0.85 };
    const st = this.world.state;
    st.shakeMagnitude = Math.max(st.shakeMagnitude, 5);
    st.shakeTimer = Math.max(st.shakeTimer, 0.14);
    this.flash = Math.max(this.flash, 0.06);
  }

  /** 每个逻辑步结束时调用：结算击杀音效与地面元素滚动 */
  step(dt: number): void {
    const st = this.world.state;
    const k = this.killsThisStep;
    this.killsThisStep = 0;
    if (k >= 6) {
      // 一口气割倒一片：碎裂声 + 轻微震屏
      this.world.audio.playCrunch();
      st.shakeMagnitude = Math.max(st.shakeMagnitude, 3);
      st.shakeTimer = Math.max(st.shakeTimer, 0.08);
    } else if (k > 0) {
      this.world.audio.playKill(st.comboCount);
    }

    if (this.flash > 0) this.flash = Math.max(0, this.flash - dt);
    if (this.surgeBanner > 0) this.surgeBanner = Math.max(0, this.surgeBanner - dt);
    if (this.stampFx) {
      this.stampFx.t += dt;
      if (this.stampFx.t >= this.stampFx.dur) this.stampFx = null;
    }

    const scroll = SCROLL_SPEED * dt;
    for (let i = 0; i < this.decals.length; i++) {
      const d = this.decals[i];
      d.life += dt;
      d.y += scroll;
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) {
      const b = this.blasts[i];
      b.t += dt;
      if (b.t >= b.dur) this.blasts.splice(i, 1);
    }
    for (let i = this.pops.length - 1; i >= 0; i--) {
      const p = this.pops[i];
      p.t += dt;
      p.y += scroll;
      if (p.t >= p.dur) this.pops.splice(i, 1);
    }
  }
}
