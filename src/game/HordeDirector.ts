import { clamp } from '../engine/Viewport';
import type { EnemyFormation } from './types';
import type { GameWorld } from './GameWorld';

/** 场上敌人超过这个数就暂停补刷（性能与可读性上限） */
const MAX_ON_FIELD = 230;
const FORMATIONS: EnemyFormation[] = ['CLUSTER', 'STAGGERED_HORDE', 'WEDGE', 'COLUMN', 'STAGGERED_HORDE'];
/** 主线关卡里两次尸潮高峰的进度位置 */
const SURGE_AT = [0.42, 0.78];
const SURGE_AT_HARD = [0.3, 0.55, 0.8];

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

/**
 * 尸潮导演：在关卡脚本波次之间持续补刷「未读红点」炮灰，
 * 随关卡进度越刷越快、越刷越多，中后段再来两次尸潮高峰——让割草的量感一直往上走。
 */
export class HordeDirector {
  private trickleTimer = 2.5;
  private surgeIdx = 0;
  /** 尸潮高峰：剩余的批次与倒计时 */
  private surgeBursts = 0;
  private surgeBurstTimer = 0;
  /** 高峰后检测「清屏」 */
  private clearWatch = -1;
  private lastEndlessWave = 0;

  reset(): void {
    this.trickleTimer = 2.5;
    this.surgeIdx = 0;
    this.surgeBursts = 0;
    this.surgeBurstTimer = 0;
    this.clearWatch = -1;
    this.lastEndlessWave = 0;
  }

  step(dt: number, world: GameWorld): void {
    const st = world.state;
    if (st.phase !== 'PLAYING') return;
    const tutorial = world.tutorial.active;
    if (tutorial && st.elapsedSec < 15) return;

    const E = world.enemies;
    const day = Math.max(1, st.levelDay || 1);
    const wave = st.isEndless ? st.endlessWave : 0;
    // 进度 0~1：主线按关卡时长，无尽按每波时长
    const p = clamp(st.elapsedSec / Math.max(1, st.trackDurationSec), 0, 1);
    const dayScale = st.isEndless ? 1 + 0.1 * wave : 1 + 0.1 * (day - 1);
    const hpScale = st.isEndless ? 1 + 0.15 * wave : 1 + 0.12 * (day - 1);
    const bossOn = world.bosses.boss.active;
    // 小队越强刷得越多（最多 2.5 倍）：火力上来后怪也要成片压上来，才有割草的量感
    const powerBoost = clamp(1 + st.squadCount / 120, 1, 2.5);
    // 加班强度：尸潮更密
    const otDensity = 1 + 0.12 * st.overtime;

    if (st.isEndless && wave !== this.lastEndlessWave) {
      this.lastEndlessWave = wave;
      this.surgeIdx = 0;
    }

    // —— 尸潮高峰 ——
    // 加班强度 3+：多一波尸潮高峰
    const surgeList = st.isEndless ? [0.55] : st.overtime >= 3 ? SURGE_AT_HARD : SURGE_AT;
    if (!bossOn && this.surgeIdx < surgeList.length && p >= surgeList[this.surgeIdx]) {
      this.surgeIdx++;
      this.surgeBursts = 3;
      this.surgeBurstTimer = 0.9; // 先给 0.9 秒警报，再开刷
      world.announceSurge();
    }
    if (this.surgeBursts > 0) {
      this.surgeBurstTimer -= dt;
      if (this.surgeBurstTimer <= 0) {
        const n = Math.round(18 * dayScale * powerBoost * otDensity * (tutorial ? 0.6 : 1));
        const center = (Math.random() - 0.5) * 90;
        E.spawnSwarm('unread_dot', n, 'STAGGERED_HORDE', hpScale, center);
        if (this.surgeBursts === 2) E.spawnSwarm('ddl_flame', 4, 'FLANK_S', hpScale);
        this.surgeBursts--;
        this.surgeBurstTimer = 0.55;
        if (this.surgeBursts === 0) this.clearWatch = 2.6;
      }
      return;
    }

    // —— 高峰后：迅速清空就盖「清屏」章 ——
    if (this.clearWatch > 0) {
      this.clearWatch -= dt;
      if (E.enemies.activeCount <= 4) {
        this.clearWatch = -1;
        world.fx.stamp('清 屏 !');
      } else if (this.clearWatch <= 0) {
        this.clearWatch = -1;
      }
    }

    // —— 持续补刷 ——
    // Boss 登场前最后一段不再补刷，让场地清空、给 Boss 登场留舞台
    if (!bossOn && p > 0.9) return;
    this.trickleTimer -= dt;
    if (this.trickleTimer > 0) return;
    if (E.enemies.activeCount >= MAX_ON_FIELD) {
      this.trickleTimer = 0.5;
      return;
    }
    let interval: number;
    let size: number;
    if (bossOn) {
      // Boss 战只零星补几只，给大招留「弹药」，不抢玩家躲弹幕的注意力
      interval = 4.0;
      size = 4;
    } else {
      // 前期轻、后期重：进度做 1.6 次方缓入，开局只刷零星几只，中后段火力起来了再上量
      const ramp = Math.pow(p, 1.6);
      interval = lerp(3.0, 1.1, ramp) / (st.isEndless ? 1 + 0.06 * wave : 1) / (1 + 0.06 * st.overtime);
      size = Math.round(lerp(2, 12, ramp) * dayScale * powerBoost * otDensity);
    }
    if (tutorial) size = Math.max(3, Math.round(size * 0.6));
    this.trickleTimer = interval;
    const formation = FORMATIONS[Math.floor(Math.random() * FORMATIONS.length)];
    E.spawnSwarm('unread_dot', size, formation, hpScale, (Math.random() - 0.5) * 140);
  }
}
