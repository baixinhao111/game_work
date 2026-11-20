import { BOSSES } from '../data/enemies';
import { PALETTE } from '../data/palette';
import type { AudioEngine } from '../engine/AudioEngine';
import { ObjectPool } from '../engine/ObjectPool';
import { clamp, LANE_HALF_W, PLAYER_Y, projectX, TRACK_BOTTOM_Y, TRACK_TOP_Y } from '../engine/Viewport';
import type { EnemyStepContext, EnemySystem } from './EnemySystem';
import type { BossHazard, BossId, BossMove, BossProjectile, BossRuntime } from './types';

const BOSS_HOME_Y = 240;
const SHIELD_SEC = 1.6;
/** Boss 弹幕只判定小队“核心”区域，保证大部队也能靠走位躲开 */
const CORE_HALF_W = 22;

export class BossSystem {
  public readonly boss: BossRuntime;
  public readonly projectiles: ObjectPool<BossProjectile>;
  public readonly hazards: ObjectPool<BossHazard>;
  private minionHpScale = 1;
  private lastGap = 0;
  private slamFired = false;

  constructor(
    private readonly audio: AudioEngine,
    private readonly enemies: EnemySystem
  ) {
    this.projectiles = new ObjectPool<BossProjectile>(
      () => ({
        active: false,
        laneX: 0,
        y: 0,
        vx: 0,
        vy: 200,
        radius: 11,
        damage: 2,
        pctDamage: 0.05,
        color: PALETTE.red,
        label: ''
      }),
      (p) => {
        p.vx = 0;
        p.vy = 200;
        p.radius = 11;
      },
      90
    );

    this.hazards = new ObjectPool<BossHazard>(
      () => ({
        active: false,
        kind: 'laser',
        laneX: 0,
        y: PLAYER_Y,
        halfWidth: 24,
        warnTimer: 1,
        warnMax: 1,
        activeTimer: 0.4,
        damage: 3,
        pctDamage: 0.1,
        hasHit: false
      }),
      (h) => {
        h.hasHit = false;
      },
      12
    );

    this.boss = this.createEmpty();
  }

  private createEmpty(): BossRuntime {
    return {
      active: false,
      id: 'monday_alarm',
      style: 'alarm',
      name: '',
      subtitle: '',
      laneX: 0,
      y: TRACK_TOP_Y - 50,
      targetY: BOSS_HOME_Y,
      homeY: BOSS_HOME_Y,
      moveDir: 1,
      hp: 0,
      maxHp: 1,
      radius: 48,
      flashTimer: 0,
      attackTimer: 2,
      moveIdx: 0,
      waveCount: 0,
      enraged: false,
      shieldTimer: 0,
      shieldsUsed: 0,
      slamTimer: 0,
      ringPhase: 0,
      age: 0
    };
  }

  reset(): void {
    this.projectiles.releaseAll();
    this.hazards.releaseAll();
    Object.assign(this.boss, this.createEmpty());
  }

  spawn(bossId: BossId, minionHpScale: number, ctx: EnemyStepContext): void {
    const cfg = BOSSES[bossId];
    Object.assign(this.boss, this.createEmpty());
    this.minionHpScale = minionHpScale;
    this.boss.active = true;
    this.boss.id = bossId;
    this.boss.style = cfg.style;
    this.boss.name = cfg.name;
    this.boss.subtitle = cfg.subtitle;
    this.boss.laneX = 0;
    this.boss.y = TRACK_TOP_Y - 60;
    this.boss.hp = cfg.hp;
    this.boss.maxHp = cfg.hp;
    this.boss.radius = cfg.radius;
    this.boss.attackTimer = 2.2;
    this.slamFired = false;

    ctx.triggerShake(6, 0.25);
    ctx.sayQuip(cfg.spawnQuip);
  }

  /** 返回本次是否真正造成伤害（开会免伤期间返回 false） */
  damage(dmg: number, worldX: number, worldY: number, ctx: EnemyStepContext): boolean {
    const b = this.boss;
    if (!b.active || b.y < TRACK_TOP_Y + 20) return false;
    if (b.shieldTimer > 0) return false;

    const cfg = BOSSES[b.id];
    b.hp -= dmg;
    b.flashTimer = 0.06;

    // 阶段护盾：血量卡在阈值，进入短暂“开会免伤”并召唤护卫，防止强力构筑一秒蒸发 Boss
    const nextShield = cfg.shieldAt[b.shieldsUsed];
    if (nextShield !== undefined && b.hp <= b.maxHp * nextShield) {
      b.hp = b.maxHp * nextShield;
      b.shieldsUsed++;
      b.shieldTimer = SHIELD_SEC;
      b.attackTimer = Math.max(b.attackTimer, SHIELD_SEC + 0.4);
      const s = cfg.shieldSummon;
      this.enemies.spawnSwarm(s.enemyId, s.count, s.formation, this.minionHpScale);
      this.audio.playGateFlip();
      ctx.triggerShake(5, 0.2);
      ctx.spawnFloatingText(worldX, worldY - 60, '临时开会 · 免伤中!', PALETTE.yellow, 16);
      ctx.triggerQuip('BOSS_SHIELD');
    }

    if (!b.enraged && b.hp <= b.maxHp * cfg.enrageAt) {
      b.enraged = true;
      ctx.triggerShake(7, 0.3);
      ctx.spawnFloatingText(worldX, worldY - 40, '红温狂暴!!', PALETTE.red, 18);
      ctx.triggerQuip('BOSS_ENRAGE');
    }

    if (b.hp <= 0) {
      b.hp = 0;
      b.active = false;
      this.clearProjectiles(ctx);
      this.audio.playExplosion(true);
      ctx.triggerHitstop(0.06);
      ctx.triggerShake(10, 0.35);
      ctx.spawnFxBurst(worldX, worldY, PALETTE.yellow, 30);
      ctx.spawnFxBurst(worldX, worldY, PALETTE.mint, 20);
      ctx.spawnFxBurst(worldX, worldY, PALETTE.red, 14);
      ctx.onBossKilled(cfg.beansReward);
    }
    return true;
  }

  /** 大招：清空弹幕与地面技能，并对 Boss 造成最大血量 7% 的冲击 */
  ultBlast(ctx: EnemyStepContext): void {
    this.clearProjectiles(ctx);
    if (this.boss.active) {
      this.damage(this.boss.maxHp * 0.07, projectX(this.boss.laneX, this.boss.y), this.boss.y, ctx);
    }
  }

  private clearProjectiles(ctx: EnemyStepContext): void {
    const projs = this.projectiles.activeItems;
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      if (!p.active) continue;
      p.active = false;
      ctx.spawnFxBurst(projectX(p.laneX, p.y), p.y, PALETTE.mint, 3);
    }
    this.projectiles.sweepInactive();
    this.hazards.releaseAll();
  }

  step(dt: number, ctx: EnemyStepContext): void {
    this.stepBoss(dt, ctx);
    this.stepProjectiles(dt, ctx);
    this.stepHazards(dt, ctx);
  }

  private stepBoss(dt: number, ctx: EnemyStepContext): void {
    const b = this.boss;
    if (!b.active) return;
    const cfg = BOSSES[b.id];
    b.age += dt;

    if (b.flashTimer > 0) b.flashTimer = Math.max(0, b.flashTimer - dt);
    if (b.shieldTimer > 0) b.shieldTimer = Math.max(0, b.shieldTimer - dt);

    if (b.slamTimer > 0) {
      b.slamTimer -= dt;
      if (!this.slamFired && b.slamTimer <= 0.75) {
        this.slamFired = true;
        ctx.triggerShake(8, 0.22);
        this.fireRingGap(0.9);
      }
      if (b.slamTimer <= 0) {
        b.slamTimer = 0;
        b.targetY = b.homeY;
      }
    }

    // 纵向：入场 / 冲锋 / 回位
    const dy = b.targetY - b.y;
    if (Math.abs(dy) > 1) {
      const vy = b.slamTimer > 0 ? 420 : 130;
      b.y += clamp(dy, -vy * dt, vy * dt);
    }

    // 横向巡游
    if (b.y >= b.homeY - 4) {
      const patrolSpeed = b.enraged ? 88 : 60;
      b.laneX += patrolSpeed * b.moveDir * dt;
      if (b.laneX > 92) {
        b.laneX = 92;
        b.moveDir = -1;
      } else if (b.laneX < -92) {
        b.laneX = -92;
        b.moveDir = 1;
      }
    }

    b.ringPhase += dt * (b.enraged ? 24 : 14);

    if (b.y < b.homeY - 4 || b.shieldTimer > 0) return;
    b.attackTimer -= dt;
    if (b.attackTimer <= 0) {
      const moves = b.enraged ? cfg.enragedMoves : cfg.moves;
      const move = moves[b.moveIdx % moves.length];
      b.moveIdx++;
      b.attackTimer = b.enraged ? cfg.enragedInterval : cfg.attackInterval;
      this.performMove(move, ctx);
    }
  }

  private performMove(move: BossMove, ctx: EnemyStepContext): void {
    const b = this.boss;
    b.waveCount++;
    switch (move) {
      case 'ring_gap':
        this.fireRingGap(1);
        break;
      case 'fan3':
        this.fireFan(ctx.leaderLaneX, 3, 0.42);
        break;
      case 'fan5':
        this.fireFan(ctx.leaderLaneX, 5, 0.62);
        break;
      case 'fan7':
        this.fireFan(ctx.leaderLaneX, 7, 0.86);
        break;
      case 'laser2':
        this.spawnLasers(ctx.leaderLaneX, 2);
        break;
      case 'laser3':
        this.spawnLasers(ctx.leaderLaneX, 3);
        break;
      case 'bomb1':
        this.spawnBomb(ctx.leaderLaneX);
        break;
      case 'bomb3':
        this.spawnBomb(ctx.leaderLaneX);
        this.spawnBomb(ctx.leaderLaneX - 82);
        this.spawnBomb(ctx.leaderLaneX + 82);
        break;
      case 'barrier': {
        const side = ctx.leaderLaneX < 0 ? 'LEFT' : 'RIGHT';
        const value = Math.max(6, Math.round(4 + ctx.squadCount * 0.12));
        ctx.spawnSupportGate({
          id: `barrier_${b.waveCount}`,
          pairGroupId: `barrier_${b.waveCount}`,
          laneSide: side,
          kind: 'SUB',
          initialOp: '-',
          value,
          shootableToFlip: true,
          flipHpPerStep: 14,
          labelOverride: '502 故障墙'
        });
        this.fireCross(0.6);
        break;
      }
      case 'cross':
        this.fireCross(1);
        break;
      case 'slam':
        b.slamTimer = 1.5;
        b.targetY = 340;
        this.slamFired = false;
        ctx.spawnFloatingText(projectX(b.laneX, b.y), b.y + 70, '冲锋!', PALETTE.red, 16);
        break;
      case 'summon': {
        const s = BOSSES[b.id].moveSummon;
        this.enemies.spawnSwarm(s.enemyId, s.count, s.formation, this.minionHpScale);
        break;
      }
    }
  }

  private acquireProjectile(): BossProjectile | null {
    if (this.projectiles.activeCount >= 85) return null;
    return this.projectiles.acquire();
  }

  private fireRingGap(speedScale: number): void {
    const b = this.boss;
    const gaps = [-96, -32, 32, 96];
    let gap = gaps[Math.floor(Math.random() * gaps.length)];
    if (gap === this.lastGap) gap = gaps[(gaps.indexOf(gap) + 2) % gaps.length];
    this.lastGap = gap;
    const gapHalf = 46;

    for (let x = -LANE_HALF_W + 20; x <= LANE_HALF_W - 20; x += 30) {
      if (Math.abs(x - gap) < gapHalf) continue;
      const p = this.acquireProjectile();
      if (!p) return;
      p.laneX = x;
      p.y = b.y + 28;
      p.vx = 0;
      p.vy = (b.enraged ? 225 : 195) / speedScale;
      p.radius = 11;
      p.damage = 2;
      p.pctDamage = 0.05;
      p.color = PALETTE.red;
      p.label = '';
    }
  }

  private fireFan(targetX: number, count: number, spread: number): void {
    const b = this.boss;
    const baseAng = Math.atan2(targetX - b.laneX, PLAYER_Y - b.y);
    const speed = b.enraged ? 250 : 225;
    for (let i = 0; i < count; i++) {
      const p = this.acquireProjectile();
      if (!p) return;
      const ang = baseAng + (count === 1 ? 0 : -spread * 0.5 + (i / (count - 1)) * spread);
      p.laneX = b.laneX;
      p.y = b.y + 30;
      p.vx = Math.sin(ang) * speed;
      p.vy = Math.cos(ang) * speed;
      p.radius = 9;
      p.damage = 2;
      p.pctDamage = 0.035;
      p.color = PALETTE.purple;
      p.label = '';
    }
  }

  /** 两侧交叉火线：左右各一串斜向弹幕在中线交汇 */
  private fireCross(density: number): void {
    const b = this.boss;
    const n = Math.round(5 * density);
    for (let k = 0; k < n; k++) {
      for (const side of [-1, 1]) {
        const p = this.acquireProjectile();
        if (!p) return;
        p.laneX = side * (LANE_HALF_W - 26);
        p.y = b.y - k * 30;
        p.vx = -side * 74;
        p.vy = 215;
        p.radius = 10;
        p.damage = 2;
        p.pctDamage = 0.04;
        p.color = PALETTE.coffee;
        p.label = '';
      }
    }
  }

  private spawnLasers(leaderX: number, count: number): void {
    const xs: number[] = [clamp(leaderX, -LANE_HALF_W + 26, LANE_HALF_W - 26)];
    let guard = 0;
    while (xs.length < count && guard++ < 40) {
      const x = -LANE_HALF_W + 26 + Math.random() * (LANE_HALF_W * 2 - 52);
      if (xs.every((o) => Math.abs(o - x) > 70)) xs.push(x);
    }
    for (const x of xs) {
      if (this.hazards.activeCount >= 12) return;
      const h = this.hazards.acquire();
      h.kind = 'laser';
      h.laneX = x;
      h.y = PLAYER_Y;
      h.halfWidth = 24;
      h.warnMax = this.boss.enraged ? 0.95 : 1.15;
      h.warnTimer = h.warnMax;
      h.activeTimer = 0.42;
      h.damage = 3;
      h.pctDamage = 0.09;
    }
  }

  private spawnBomb(x: number): void {
    if (this.hazards.activeCount >= 12) return;
    const h = this.hazards.acquire();
    h.kind = 'bomb';
    h.laneX = clamp(x, -LANE_HALF_W + 34, LANE_HALF_W - 34);
    h.y = PLAYER_Y;
    h.halfWidth = 40;
    h.warnMax = this.boss.enraged ? 1.05 : 1.25;
    h.warnTimer = h.warnMax;
    h.activeTimer = 0.18;
    h.damage = 3;
    h.pctDamage = 0.1;
  }

  private hitSquad(fixed: number, pct: number, ctx: EnemyStepContext): void {
    if (ctx.invulnTimer > 0) return;
    ctx.setInvuln(0.4);
    const loss = Math.max(1, Math.round(fixed + pct * ctx.squadCount));
    ctx.consumeShieldOrSquad(loss);
  }

  private stepProjectiles(dt: number, ctx: EnemyStepContext): void {
    const items = this.projectiles.activeItems;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active) continue;

      p.laneX += p.vx * dt;
      p.y += p.vy * dt;

      if (
        Math.abs(p.y - PLAYER_Y) <= p.radius + 14 &&
        Math.abs(p.laneX - ctx.leaderLaneX) <= p.radius + CORE_HALF_W
      ) {
        p.active = false;
        if (ctx.ultActiveTimer > 0) {
          ctx.spawnFxBurst(projectX(p.laneX, p.y), p.y, PALETTE.mint, 5);
          continue;
        }
        this.hitSquad(p.damage, p.pctDamage, ctx);
        continue;
      }

      if (p.y > TRACK_BOTTOM_Y + 30 || Math.abs(p.laneX) > LANE_HALF_W + 30) {
        p.active = false;
      }
    }
    this.projectiles.sweepInactive();
  }

  private stepHazards(dt: number, ctx: EnemyStepContext): void {
    const items = this.hazards.activeItems;
    for (let i = 0; i < items.length; i++) {
      const h = items[i];
      if (!h.active) continue;

      if (h.warnTimer > 0) {
        h.warnTimer -= dt;
        if (h.warnTimer <= 0) {
          this.audio.playExplosion(h.kind === 'bomb');
          if (h.kind === 'bomb') {
            ctx.triggerShake(4, 0.12);
            ctx.spawnFxBurst(projectX(h.laneX, h.y), h.y, PALETTE.red, 14);
          }
        }
        continue;
      }

      if (!h.hasHit && ctx.ultActiveTimer <= 0 && Math.abs(ctx.leaderLaneX - h.laneX) <= h.halfWidth + 8) {
        h.hasHit = true;
        this.hitSquad(h.damage, h.pctDamage, ctx);
      }

      h.activeTimer -= dt;
      if (h.activeTimer <= 0) h.active = false;
    }
    this.hazards.sweepInactive();
  }
}
