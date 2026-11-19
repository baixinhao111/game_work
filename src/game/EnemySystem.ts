import { BOSSES, ENEMIES } from '../data/enemies';
import { PALETTE } from '../data/palette';
import type { QuipEvent } from '../data/quips';
import type { AudioEngine } from '../engine/AudioEngine';
import { ObjectPool } from '../engine/ObjectPool';
import { clamp, LANE_HALF_W, PLAYER_Y, projectX, TRACK_BOTTOM_Y, TRACK_TOP_Y } from '../engine/Viewport';
import type {
  BossId,
  BossProjectile,
  BossRuntime,
  Enemy,
  EnemyFormation,
  EnemyId,
  GateConfig
} from './types';

export interface EnemyStepContext {
  leaderLaneX: number;
  squadCount: number;
  shieldCount: number;
  ultActiveTimer: number;
  invulnTimer: number;
  setInvuln: (sec: number) => void;
  consumeShieldOrSquad: (loss: number) => void;
  spawnSupportGate: (cfg: GateConfig) => void;
  spawnFxBurst: (x: number, y: number, color: string, count: number) => void;
  spawnFloatingText: (x: number, y: number, text: string, color: string, size?: number) => void;
  triggerShake: (mag: number, sec: number) => void;
  triggerHitstop: (sec: number) => void;
  triggerQuip: (ev: QuipEvent) => void;
  onEnemyKilled: (beans: number, ult: number) => void;
  onBossKilled: (beans: number) => void;
}

export class EnemySystem {
  public readonly enemies: ObjectPool<Enemy>;
  public readonly bossProjectiles: ObjectPool<BossProjectile>;
  public readonly boss: BossRuntime;
  private nextUid = 1;

  constructor(private readonly audio: AudioEngine) {
    this.enemies = new ObjectPool<Enemy>(
      () => ({
        active: false,
        uid: 0,
        configId: 'overtime_zombie',
        laneX: 0,
        y: 0,
        hp: 10,
        maxHp: 10,
        speedY: 100,
        radius: 15,
        damageToSquad: 1,
        beansReward: 1,
        ultReward: 2,
        flashTimer: 0,
        chillTimer: 0,
        wobblePhase: 0,
        flankAmp: 0,
        splitsOnDeath: 0,
        rot: 0
      }),
      (e) => {
        e.flashTimer = 0;
        e.chillTimer = 0;
        e.flankAmp = 0;
        e.splitsOnDeath = 0;
        e.rot = 0;
      },
      120
    );

    this.bossProjectiles = new ObjectPool<BossProjectile>(
      () => ({
        active: false,
        laneX: 0,
        y: 0,
        vx: 0,
        vy: 200,
        radius: 12,
        damage: 4,
        color: PALETTE.red,
        label: '铃!'
      }),
      (p) => {
        p.vx = 0;
        p.vy = 200;
        p.radius = 12;
        p.damage = 4;
      },
      60
    );

    this.boss = this.createEmptyBoss();
  }

  private createEmptyBoss(): BossRuntime {
    return {
      active: false,
      id: 'monday_alarm',
      name: '',
      subtitle: '',
      laneX: 0,
      y: TRACK_TOP_Y - 50,
      targetY: 205,
      moveDir: 1,
      hp: 0,
      maxHp: 1,
      radius: 44,
      flashTimer: 0,
      attackTimer: 1.5,
      waveCount: 0,
      summoned70: false,
      summoned35: false,
      ringPhase: 0
    };
  }

  reset(): void {
    this.enemies.releaseAll();
    this.bossProjectiles.releaseAll();
    Object.assign(this.boss, this.createEmptyBoss());
    this.nextUid = 1;
  }

  spawnSwarm(
    enemyId: EnemyId,
    count: number,
    formation: EnemyFormation,
    hpScale: number,
    laneCenter?: number
  ): void {
    const cfg = ENEMIES[enemyId];
    const center = laneCenter ?? (Math.random() * 120 - 60);

    for (let i = 0; i < count; i++) {
      const e = this.enemies.acquire();
      e.uid = this.nextUid++;
      e.configId = enemyId;
      e.hp = Math.round(cfg.hp * hpScale);
      e.maxHp = e.hp;
      e.speedY = cfg.speedY;
      e.radius = cfg.radius;
      e.damageToSquad = cfg.damageToSquad;
      e.beansReward = cfg.beansReward;
      e.ultReward = cfg.ultReward;
      e.splitsOnDeath = cfg.splitsOnDeath ?? 0;
      e.wobblePhase = i * 0.65;

      if (formation === 'LINE') {
        const t = count <= 1 ? 0.5 : i / (count - 1);
        e.laneX = -126 + t * 252;
        e.y = TRACK_TOP_Y - 22 - (i % 2) * 18;
      } else if (formation === 'FLANK_S') {
        const isLeft = i % 2 === 0;
        e.laneX = isLeft ? -105 : 105;
        e.flankAmp = 38;
        e.y = TRACK_TOP_Y - 20 - Math.floor(i / 2) * 30;
      } else if (formation === 'STAGGERED_HORDE') {
        const cols = 5;
        const col = i % cols;
        const row = Math.floor(i / cols);
        const staggerShift = (row % 2) * 22 - 11;
        const baseX = -114 + (col / (cols - 1)) * 228 + staggerShift;
        e.laneX = clamp(baseX + (Math.random() * 24 - 12), -136, 136);
        e.y = TRACK_TOP_Y - 18 - row * 28 + (Math.random() * 14 - 7);
        e.speedY = cfg.speedY * (0.94 + Math.random() * 0.14);
      } else {
        const col = i % 4;
        const row = Math.floor(i / 4);
        e.laneX = clamp(center + (col - 1.5) * 38 + (Math.random() * 14 - 7), -136, 136);
        e.y = TRACK_TOP_Y - 20 - row * 34 + (Math.random() * 10 - 5);
      }
    }
  }

  spawnBoss(bossId: BossId, ctx: EnemyStepContext): void {
    const cfg = BOSSES[bossId];
    this.boss.active = true;
    this.boss.id = bossId;
    this.boss.name = cfg.name;
    this.boss.subtitle = cfg.subtitle;
    this.boss.laneX = 0;
    this.boss.y = TRACK_TOP_Y - 45;
    this.boss.targetY = 205;
    this.boss.moveDir = 1;
    this.boss.hp = cfg.hp;
    this.boss.maxHp = cfg.hp;
    this.boss.radius = cfg.radius;
    this.boss.flashTimer = 0;
    this.boss.attackTimer = 1.4;
    this.boss.waveCount = 0;
    this.boss.summoned70 = false;
    this.boss.summoned35 = false;
    this.boss.ringPhase = 0;

    ctx.triggerShake(6, 0.25);
    ctx.triggerQuip('BOSS_SPAWN');
  }

  killEnemy(e: Enemy, ctx: EnemyStepContext): void {
    if (!e.active) return;
    e.active = false;
    const fxX = projectX(e.laneX, e.y);
    const fxY = e.y;
    const cfg = ENEMIES[e.configId];
    ctx.spawnFxBurst(fxX, fxY, cfg.color, e.configId === 'ppt_pie' ? 14 : 7);
    ctx.onEnemyKilled(e.beansReward, e.ultReward);

    if (e.splitsOnDeath > 0) {
      for (let k = 0; k < e.splitsOnDeath; k++) {
        const mini = this.enemies.acquire();
        const miniCfg = ENEMIES.client_mini;
        mini.uid = this.nextUid++;
        mini.configId = 'client_mini';
        mini.hp = miniCfg.hp;
        mini.maxHp = miniCfg.hp;
        mini.speedY = miniCfg.speedY;
        mini.radius = miniCfg.radius;
        mini.damageToSquad = miniCfg.damageToSquad;
        mini.beansReward = miniCfg.beansReward;
        mini.ultReward = miniCfg.ultReward;
        mini.laneX = clamp(e.laneX + (k === 0 ? -24 : 24), -138, 138);
        mini.y = e.y - 6;
        mini.wobblePhase = k * 1.5;
      }
    }
  }

  damageBoss(dmg: number, worldX: number, worldY: number, ctx: EnemyStepContext): void {
    if (!this.boss.active) return;
    this.boss.hp -= dmg;
    this.boss.flashTimer = 0.06;

    const hpRatio = this.boss.hp / this.boss.maxHp;
    if (hpRatio <= 0.7 && !this.boss.summoned70) {
      this.boss.summoned70 = true;
      this.spawnSwarm('overtime_zombie', 14, 'STAGGERED_HORDE', 1.0);
      ctx.spawnSupportGate({
        id: 'boss_aid_1',
        pairGroupId: 'boss_aid_1',
        laneSide: Math.random() < 0.5 ? 'LEFT' : 'RIGHT',
        kind: 'ADD',
        initialOp: '+',
        value: 8,
        shootableToFlip: false
      });
      ctx.spawnFloatingText(worldX, worldY - 30, '闹钟贪睡召唤!', PALETTE.yellow, 15);
    }

    if (hpRatio <= 0.35 && !this.boss.summoned35) {
      this.boss.summoned35 = true;
      this.spawnSwarm('ddl_flame', 6, 'FLANK_S', 1.0, 0);
      this.spawnSwarm('cc_all', 6, 'LINE', 1.0, 0);
      ctx.spawnFloatingText(worldX, worldY - 30, '早高峰红温连响!!', PALETTE.red, 16);
    }

    if (this.boss.hp <= 0) {
      this.boss.hp = 0;
      this.boss.active = false;
      this.audio.playExplosion(true);
      ctx.triggerHitstop(0.045);
      ctx.triggerShake(9, 0.25);
      ctx.spawnFxBurst(worldX, worldY, PALETTE.yellow, 28);
      ctx.spawnFxBurst(worldX, worldY, PALETTE.mint, 18);
      ctx.onBossKilled(BOSSES[this.boss.id].beansReward);
    }
  }

  clearAllForUltimate(ctx: EnemyStepContext): void {
    const items = this.enemies.activeItems;
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) continue;
      this.killEnemy(e, ctx);
    }
    this.enemies.sweepInactive();

    const projs = this.bossProjectiles.activeItems;
    for (let i = 0; i < projs.length; i++) {
      const p = projs[i];
      if (!p.active) continue;
      p.active = false;
      ctx.spawnFxBurst(projectX(p.laneX, p.y), p.y, PALETTE.mint, 4);
    }
    this.bossProjectiles.sweepInactive();

    if (this.boss.active) {
      this.damageBoss(220, projectX(this.boss.laneX, this.boss.y), this.boss.y, ctx);
    }
  }

  step(dt: number, ctx: EnemyStepContext): void {
    const items = this.enemies.activeItems;
    for (let i = 0; i < items.length; i++) {
      const e = items[i];
      if (!e.active) continue;

      if (e.flashTimer > 0) e.flashTimer = Math.max(0, e.flashTimer - dt);
      if (e.chillTimer > 0) e.chillTimer = Math.max(0, e.chillTimer - dt);

      const speedMult = e.chillTimer > 0 ? 0.65 : 1.0;
      e.y += e.speedY * speedMult * dt;
      e.wobblePhase += dt * (e.configId === 'ddl_flame' ? 5.6 : 4.5);
      e.rot = 0;

      if (e.flankAmp > 0) {
        e.laneX = clamp(e.laneX + Math.cos(e.wobblePhase) * e.flankAmp * dt * 2.2, -138, 138);
      }

      // 检测与领队/小队中心碰撞
      if (Math.abs(e.y - PLAYER_Y) <= e.radius + 18 && Math.abs(e.laneX - ctx.leaderLaneX) <= e.radius + 26) {
        if (ctx.ultActiveTimer > 0) {
          this.killEnemy(e, ctx);
          continue;
        }
        e.active = false;
        if (ctx.invulnTimer <= 0) {
          ctx.setInvuln(0.35);
          if (e.configId === 'ppt_pie') {
            ctx.triggerQuip('PPT_HIT');
          }
          ctx.consumeShieldOrSquad(e.damageToSquad);
        }
        continue;
      }

      if (e.y > TRACK_BOTTOM_Y + 35) {
        e.active = false;
      }
    }
    this.enemies.sweepInactive();

    this.stepBoss(dt);
    this.stepBossProjectiles(dt, ctx);
  }

  private stepBoss(dt: number): void {
    if (!this.boss.active) return;

    if (this.boss.flashTimer > 0) {
      this.boss.flashTimer = Math.max(0, this.boss.flashTimer - dt);
    }

    if (this.boss.y < this.boss.targetY) {
      this.boss.y = Math.min(this.boss.targetY, this.boss.y + 120 * dt);
    } else {
      const patrolSpeed = this.boss.hp < this.boss.maxHp * 0.4 ? 92 : 64;
      this.boss.laneX += patrolSpeed * this.boss.moveDir * dt;
      if (this.boss.laneX > 92) {
        this.boss.laneX = 92;
        this.boss.moveDir = -1;
      } else if (this.boss.laneX < -92) {
        this.boss.laneX = -92;
        this.boss.moveDir = 1;
      }
    }

    this.boss.ringPhase += dt * (this.boss.hp < this.boss.maxHp * 0.4 ? 26 : 16);
    this.boss.attackTimer -= dt;
    if (this.boss.attackTimer <= 0) {
      const enraged = this.boss.hp < this.boss.maxHp * 0.4;
      this.boss.attackTimer = enraged ? 1.55 : 2.1;
      this.fireBossWave();
    }
  }

  private fireBossWave(): void {
    this.boss.waveCount++;
    // 轮流在左 / 中 / 右留下约 96px 宽的安全通道供玩家躲避
    const gapModes = [-82, 0, 82];
    const gapCenter = gapModes[this.boss.waveCount % gapModes.length];
    const gapHalf = 48;

    for (let x = -LANE_HALF_W + 24; x <= LANE_HALF_W - 24; x += 32) {
      if (Math.abs(x - gapCenter) < gapHalf) continue;
      const p = this.bossProjectiles.acquire();
      p.laneX = x;
      p.y = this.boss.y + 26;
      p.vx = 0;
      p.vy = 205;
      p.radius = 11;
      p.damage = 3;
      p.color = PALETTE.red;
      p.label = '07:00';
    }
  }

  private stepBossProjectiles(dt: number, ctx: EnemyStepContext): void {
    const items = this.bossProjectiles.activeItems;
    for (let i = 0; i < items.length; i++) {
      const p = items[i];
      if (!p.active) continue;

      p.laneX += p.vx * dt;
      p.y += p.vy * dt;

      if (
        Math.abs(p.y - PLAYER_Y) <= p.radius + 14 &&
        Math.abs(p.laneX - ctx.leaderLaneX) <= p.radius + 16
      ) {
        p.active = false;
        if (ctx.ultActiveTimer > 0) {
          ctx.spawnFxBurst(projectX(p.laneX, p.y), p.y, PALETTE.mint, 5);
          continue;
        }
        if (ctx.invulnTimer <= 0) {
          ctx.setInvuln(0.35);
          ctx.consumeShieldOrSquad(p.damage);
        }
        continue;
      }

      if (p.y > TRACK_BOTTOM_Y + 30) {
        p.active = false;
      }
    }
    this.bossProjectiles.sweepInactive();
  }
}
