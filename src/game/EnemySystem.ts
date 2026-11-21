import { ENEMIES } from '../data/enemies';
import type { QuipEvent } from '../data/quips';
import { ObjectPool } from '../engine/ObjectPool';
import {
  clamp,
  LANE_HALF_W,
  PLAYER_Y,
  projectX,
  SCROLL_SPEED,
  TRACK_BOTTOM_Y,
  TRACK_TOP_Y
} from '../engine/Viewport';
import type { Enemy, EnemyFormation, EnemyId, GateConfig } from './types';

const LANE_LIMIT = LANE_HALF_W - 14;

export interface EnemyStepContext {
  leaderLaneX: number;
  squadCount: number;
  /** 小队占地：领队左右半宽与上下边界（屏幕 y） */
  squadHalfW: number;
  squadTopY: number;
  squadBottomY: number;
  shieldCount: number;
  ultActiveTimer: number;
  invulnTimer: number;
  overloadEnemyTimer: number;
  setInvuln: (sec: number) => void;
  consumeShieldOrSquad: (loss: number) => void;
  spawnSupportGate: (cfg: GateConfig) => void;
  spawnFxBurst: (x: number, y: number, color: string, count: number) => void;
  spawnFloatingText: (x: number, y: number, text: string, color: string, size?: number) => void;
  triggerShake: (mag: number, sec: number) => void;
  triggerHitstop: (sec: number) => void;
  triggerQuip: (ev: QuipEvent) => void;
  sayQuip: (text: string) => void;
  onEnemyKilled: (beans: number, ult: number) => void;
  /** 敌人死亡表现（墨渍、爆开等）；byPlayer=false 表示撞上小队同归于尽 */
  onEnemyDied?: (e: Enemy, byPlayer: boolean) => void;
  onBossKilled: (beans: number) => void;
}

export class EnemySystem {
  public readonly enemies: ObjectPool<Enemy>;
  private nextUid = 1;

  constructor() {
    this.enemies = new ObjectPool<Enemy>(
      () => ({
        active: false,
        uid: 0,
        configId: 'overtime_zombie',
        behavior: 'shamble',
        laneX: 0,
        y: 0,
        vx: 0,
        hp: 10,
        maxHp: 10,
        walkSpeed: 20,
        homing: 0,
        radius: 15,
        damageToSquad: 1,
        beansReward: 1,
        ultReward: 2,
        flashTimer: 0,
        chillTimer: 0,
        deepChillTimer: 0,
        wobblePhase: 0,
        flankAmp: 0,
        splitsOnDeath: 0,
        rot: 0
      }),
      (e) => {
        e.vx = 0;
        e.flashTimer = 0;
        e.chillTimer = 0;
        e.deepChillTimer = 0;
        e.flankAmp = 0;
        e.splitsOnDeath = 0;
        e.rot = 0;
      },
      140
    );
  }

  reset(): void {
    this.enemies.releaseAll();
    this.nextUid = 1;
  }

  private spawnOne(enemyId: EnemyId, laneX: number, y: number, hpScale: number): Enemy {
    const cfg = ENEMIES[enemyId];
    const e = this.enemies.acquire();
    e.uid = this.nextUid++;
    e.configId = enemyId;
    e.behavior = cfg.behavior;
    e.laneX = clamp(laneX, -LANE_LIMIT, LANE_LIMIT);
    e.y = y;
    e.vx = 0;
    e.hp = Math.round(cfg.hp * hpScale);
    e.maxHp = e.hp;
    // 每只怪速度略有差异，避免整排“机器人齐步走”
    e.walkSpeed = cfg.walkSpeed * (0.9 + Math.random() * 0.2);
    e.homing = cfg.homing;
    e.radius = cfg.radius;
    e.damageToSquad = cfg.damageToSquad;
    e.beansReward = cfg.beansReward;
    e.ultReward = cfg.ultReward;
    e.splitsOnDeath = cfg.splitsOnDeath ?? 0;
    e.wobblePhase = Math.random() * Math.PI * 2;
    return e;
  }

  spawnSwarm(
    enemyId: EnemyId,
    count: number,
    formation: EnemyFormation,
    hpScale: number,
    laneCenter?: number
  ): void {
    const top = TRACK_TOP_Y - 24;
    const jitter = (amp: number) => (Math.random() * 2 - 1) * amp;

    if (formation === 'LINE') {
      // 整排人墙：超过 7 只自动分两排交错，迫使玩家集火开路
      const perRow = Math.min(7, count);
      for (let i = 0; i < count; i++) {
        const row = Math.floor(i / perRow);
        const col = i % perRow;
        const rowCount = Math.min(perRow, count - row * perRow);
        const t = rowCount <= 1 ? 0.5 : col / (rowCount - 1);
        const x = -LANE_LIMIT + 8 + t * (LANE_LIMIT * 2 - 16) + (row % 2) * 18;
        this.spawnOne(enemyId, x, top - row * 40, hpScale);
      }
      return;
    }

    if (formation === 'FLANK_S') {
      for (let i = 0; i < count; i++) {
        const isLeft = i % 2 === 0;
        const e = this.spawnOne(enemyId, isLeft ? -110 : 110, top - Math.floor(i / 2) * 42, hpScale);
        e.flankAmp = 46;
        e.wobblePhase = isLeft ? 0 : Math.PI;
      }
      return;
    }

    if (formation === 'COLUMN') {
      const cx = laneCenter ?? jitter(90);
      for (let i = 0; i < count; i++) {
        this.spawnOne(enemyId, cx + jitter(6), top - i * 36, hpScale);
      }
      return;
    }

    if (formation === 'WEDGE') {
      // V 字楔形，尖端朝向玩家
      const cx = laneCenter ?? jitter(40);
      this.spawnOne(enemyId, cx, top, hpScale);
      for (let i = 1; i < count; i++) {
        const rank = Math.ceil(i / 2);
        const side = i % 2 === 0 ? 1 : -1;
        this.spawnOne(enemyId, cx + side * rank * 26, top - rank * 26, hpScale);
      }
      return;
    }

    if (formation === 'STAGGERED_HORDE') {
      // 4 列错位尸潮，只占跑道约 2/3 宽，留出一侧可绕行的缝隙
      const cx = laneCenter ?? jitter(58);
      const cols = 4;
      const spacing = 50;
      for (let i = 0; i < count; i++) {
        const col = i % cols;
        const row = Math.floor(i / cols);
        const stagger = (row % 2) * spacing * 0.5 - spacing * 0.25;
        const x = cx + (col - (cols - 1) * 0.5) * spacing + stagger + jitter(8);
        this.spawnOne(enemyId, x, top - row * 30 + jitter(6), hpScale);
      }
      return;
    }

    // CLUSTER
    const cx = laneCenter ?? jitter(80);
    for (let i = 0; i < count; i++) {
      const col = i % 4;
      const row = Math.floor(i / 4);
      this.spawnOne(enemyId, cx + (col - 1.5) * 34 + jitter(6), top - row * 32 + jitter(5), hpScale);
    }
  }

  killEnemy(e: Enemy, ctx: EnemyStepContext, giveReward = true): void {
    if (!e.active) return;
    e.active = false;
    const fxX = projectX(e.laneX, e.y);
    const cfg = ENEMIES[e.configId];
    ctx.spawnFxBurst(fxX, e.y, cfg.color, e.configId === 'ppt_pie' ? 14 : e.configId === 'unread_dot' ? 4 : 7);
    ctx.onEnemyDied?.(e, giveReward);
    if (giveReward) ctx.onEnemyKilled(e.beansReward, e.ultReward);

    if (giveReward && e.splitsOnDeath > 0) {
      for (let k = 0; k < e.splitsOnDeath; k++) {
        const mini = this.spawnOne('client_mini', e.laneX + (k === 0 ? -24 : 24), e.y - 6, 1);
        mini.vx = k === 0 ? -60 : 60;
      }
    }
  }

  clearAll(ctx: EnemyStepContext): void {
    const items = this.enemies.activeItems;
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) continue;
      // 大招清屏不触发甲方分裂，避免“清完屏又冒出一堆”
      e.splitsOnDeath = 0;
      this.killEnemy(e, ctx);
    }
    this.enemies.sweepInactive();
  }

  step(dt: number, ctx: EnemyStepContext): void {
    const items = this.enemies.activeItems;
    const leader = ctx.leaderLaneX;

    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) continue;

      if (e.flashTimer > 0) e.flashTimer = Math.max(0, e.flashTimer - dt);
      if (e.chillTimer > 0) e.chillTimer = Math.max(0, e.chillTimer - dt);
      if (e.deepChillTimer > 0) e.deepChillTimer = Math.max(0, e.deepChillTimer - dt);

      const deepChilled = e.deepChillTimer > 0;
      const chilled = e.chillTimer > 0;
      const chillMult = deepChilled ? 0.4 : chilled ? 0.65 : 1.0;
      const overloadMult = ctx.overloadEnemyTimer > 0 ? 1.4 : 1.0;
      const speedMult = chillMult * overloadMult;
      e.wobblePhase += dt * (e.behavior === 'snake' ? 4.2 : 6.5) * speedMult;

      // 纵向：路面滚动 + 自主冲锋
      const scrollMult = deepChilled ? 0.68 : chilled ? 0.85 : ctx.overloadEnemyTimer > 0 ? 1.2 : 1.0;
      e.y += (SCROLL_SPEED * scrollMult + e.walkSpeed * speedMult) * dt;

      // 横向：按行为算出期望横移速度，再平滑过渡，避免瞬间折返的“抽搐感”
      const toLeader = leader - e.laneX;
      const engaged = e.y > TRACK_TOP_Y + 90;
      let desiredVx = 0;
      switch (e.behavior) {
        case 'shamble':
          desiredVx = engaged ? clamp(toLeader * 0.9, -e.homing, e.homing) : 0;
          desiredVx += Math.sin(e.wobblePhase * 0.5) * 12;
          break;
        case 'homing':
          desiredVx = engaged ? clamp(toLeader * 1.4, -e.homing, e.homing) : 0;
          break;
        case 'heavy':
          desiredVx = clamp(toLeader * 0.3, -e.homing, e.homing);
          break;
        case 'snake':
          if (e.y < PLAYER_Y - 230) {
            desiredVx = Math.cos(e.wobblePhase) * e.flankAmp * 2.4;
          } else {
            desiredVx = clamp(toLeader * 3, -e.homing, e.homing);
          }
          break;
        case 'march':
        default:
          desiredVx = 0;
      }
      desiredVx *= speedMult;
      e.vx += (desiredVx - e.vx) * Math.min(1, 5 * dt);
      e.laneX = clamp(e.laneX + e.vx * dt, -LANE_LIMIT, LANE_LIMIT);
      e.rot = clamp(e.vx / 400, -0.18, 0.18);

      // 与小队实际占地范围碰撞（不再只判领队一个点）
      if (
        e.y + e.radius * 0.6 >= ctx.squadTopY &&
        e.y - e.radius * 0.6 <= ctx.squadBottomY &&
        Math.abs(e.laneX - leader) <= ctx.squadHalfW + e.radius * 0.5
      ) {
        if (ctx.ultActiveTimer > 0) {
          this.killEnemy(e, ctx);
          continue;
        }
        // 撞上即同归于尽：敌人消失、小队减员。不再有“无敌帧白嫖”，每只都算数
        this.killEnemy(e, ctx, false);
        if (e.configId === 'ppt_pie') ctx.triggerQuip('PPT_HIT');
        ctx.consumeShieldOrSquad(e.damageToSquad);
        continue;
      }

      if (e.y > TRACK_BOTTOM_Y + 35) {
        e.active = false;
      }
    }

    this.separate(items);
    this.enemies.sweepInactive();
  }

  /** 轻量横向排斥，防止怪物叠成一坨（n 通常 < 80，O(n²) 可接受） */
  private separate(items: readonly Enemy[]): void {
    for (let i = 0; i < items.length; i++) {
      const a = items[i];
      if (!a.active) continue;
      for (let j = i + 1; j < items.length; j++) {
        const b = items[j];
        if (!b.active) continue;
        const minD = (a.radius + b.radius) * 0.8;
        const dy = a.y - b.y;
        if (dy > minD || dy < -minD) continue;
        const dx = a.laneX - b.laneX;
        if (dx > minD || dx < -minD) continue;
        const dist = Math.sqrt(dx * dx + dy * dy) || 0.01;
        if (dist >= minD) continue;
        const push = (minD - dist) * 0.25;
        const nx = dx === 0 ? (i % 2 === 0 ? 1 : -1) : dx / dist;
        a.laneX = clamp(a.laneX + nx * push, -LANE_LIMIT, LANE_LIMIT);
        b.laneX = clamp(b.laneX - nx * push, -LANE_LIMIT, LANE_LIMIT);
      }
    }
  }
}
