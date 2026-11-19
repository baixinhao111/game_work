import { PALETTE } from '../data/palette';
import { WEAPONS } from '../data/weapons';
import type { AudioEngine } from '../engine/AudioEngine';
import { ObjectPool } from '../engine/ObjectPool';
import { LANE_HALF_W, PLAYER_Y, projectX, TRACK_TOP_Y } from '../engine/Viewport';
import type { EnemyStepContext, EnemySystem } from './EnemySystem';
import type { GateSystem, GateTriggerContext } from './GateSystem';
import type { AffixId, Bullet, WeaponId } from './types';

const MAX_ACTIVE_BULLETS = 180;
const BASE_UNIT_DPS = 28;
const KEYCAPS = ['Ctrl', 'Esc', 'Z', 'F5', 'Del'];

export interface CombatContext extends EnemyStepContext, GateTriggerContext {
  activeWeapon: WeaponId;
  affixes: Record<AffixId, number>;
  onCritDamage: (dmg: number) => void;
  onFiredShot: () => void;
}

export class CombatSystem {
  public readonly bullets: ObjectPool<Bullet>;
  private fireCooldown = 0;

  constructor(private readonly audio: AudioEngine) {
    this.bullets = new ObjectPool<Bullet>(
      () => ({
        active: false,
        laneX: 0,
        y: 0,
        vx: 0,
        vy: -600,
        damage: 10,
        radius: 5,
        pierceLeft: 1,
        color: PALETTE.paper,
        kind: 'stapler',
        isCrit: false,
        hasSplit: false,
        chillDuration: 0,
        hitIds: new Set<number>(),
        keyLabel: 'F5',
        rot: 0
      }),
      (b) => {
        b.isCrit = false;
        b.hasSplit = false;
        b.chillDuration = 0;
        b.pierceLeft = 1;
        b.rot = 0;
        b.hitIds.clear();
      },
      200
    );
  }

  reset(): void {
    this.bullets.releaseAll();
    this.fireCooldown = 0;
  }

  step(
    dt: number,
    enemies: EnemySystem,
    gates: GateSystem,
    ctx: CombatContext
  ): void {
    this.stepAutoFire(dt, ctx);
    this.stepBullets(dt, enemies, gates, ctx);
  }

  private stepAutoFire(dt: number, ctx: CombatContext): void {
    const weapon = WEAPONS[ctx.activeWeapon];
    const ultRateMult = ctx.ultActiveTimer > 0 ? 2.0 : 1.0;
    const rate = weapon.fireRatePerSec * ultRateMult;

    this.fireCooldown -= dt;
    if (this.fireCooldown > 0) return;
    this.fireCooldown = 1 / rate;

    // 亚线性火力公式：EffectiveDPS = BaseDPS * (N^0.75) * WeaponMult * UltMult
    const effectiveDps =
      BASE_UNIT_DPS *
      Math.pow(Math.max(1, ctx.squadCount), 0.75) *
      weapon.damageMultiplier *
      ultRateMult;

    let streams =
      ctx.squadCount >= 80
        ? 5
        : ctx.squadCount >= 35
          ? 4
          : ctx.squadCount >= 14
            ? 3
            : ctx.squadCount >= 5
              ? 2
              : 1;

    const totalNeeded = streams * weapon.pellets;
    const available = MAX_ACTIVE_BULLETS - this.bullets.activeCount;
    if (available <= 0) return;

    let mergeScale = 1;
    if (totalNeeded > available) {
      streams = Math.max(1, Math.floor(available / weapon.pellets));
      mergeScale = totalNeeded / Math.max(1, streams * weapon.pellets);
    }

    const perBulletDmg =
      (effectiveDps / rate / Math.max(1, streams * weapon.pellets)) * mergeScale;
    const isMerged = ctx.squadCount > 24 || mergeScale > 1.05;
    const pierceBonus = ctx.affixes.pierce > 0 ? 2 * ctx.affixes.pierce : 0;
    const chillSec = ctx.affixes.chill > 0 ? 2.0 : 0;
    const critChance = ctx.affixes.crit_rage > 0 ? 0.22 : 0.05;

    this.audio.playShoot(ctx.activeWeapon);
    ctx.onFiredShot();

    for (let s = 0; s < streams; s++) {
      const streamOffset = streams === 1 ? 0 : (s - (streams - 1) * 0.5) * 14;
      for (let p = 0; p < weapon.pellets; p++) {
        if (this.bullets.activeCount >= MAX_ACTIVE_BULLETS) break;

        const b = this.bullets.acquire();
        const angle =
          weapon.pellets === 1
            ? (Math.random() - 0.5) * weapon.spreadRad
            : -weapon.spreadRad * 0.5 + (p / Math.max(1, weapon.pellets - 1)) * weapon.spreadRad;

        const isCrit = Math.random() < critChance;
        b.laneX = ctx.leaderLaneX + streamOffset;
        b.y = PLAYER_Y - 18;
        b.vx = Math.sin(angle) * weapon.projectileSpeed;
        b.vy = -Math.cos(angle) * weapon.projectileSpeed;
        b.isCrit = isCrit;
        b.damage = perBulletDmg * (isCrit ? 2.2 : 1.0);
        b.pierceLeft = weapon.basePierce + pierceBonus;
        b.chillDuration = chillSec;
        b.color = isCrit ? PALETTE.yellow : weapon.color;

        if (ctx.activeWeapon === 'keyboard') {
          b.kind = 'keycap';
          b.radius = isMerged ? 8 : 6.5;
          b.keyLabel = KEYCAPS[p % KEYCAPS.length];
        } else if (ctx.activeWeapon === 'americano') {
          b.kind = 'beam';
          b.radius = isMerged ? 7.5 : 6;
        } else {
          b.kind = 'stapler';
          b.radius = isMerged ? 6.5 : 4.8;
        }
      }
    }
  }

  private stepBullets(
    dt: number,
    enemies: EnemySystem,
    gates: GateSystem,
    ctx: CombatContext
  ): void {
    const items = this.bullets.activeItems;
    const enemyList = enemies.enemies.activeItems;
    const gateList = gates.pool.activeItems;
    const boss = enemies.boss;

    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      if (!b.active) continue;

      b.laneX += b.vx * dt;
      b.y += b.vy * dt;
      if (b.kind === 'keycap') b.rot += dt * 7.5;

      if (b.y < TRACK_TOP_Y - 40 || Math.abs(b.laneX) > LANE_HALF_W + 20) {
        b.active = false;
        continue;
      }

      // 1. 检测 Boss 命中
      if (boss.active) {
        const dx = b.laneX - boss.laneX;
        const dy = b.y - boss.y;
        const hitR = boss.radius + b.radius;
        if (dx * dx + dy * dy <= hitR * hitR) {
          const hitX = projectX(b.laneX, b.y);
          const bossX = projectX(boss.laneX, boss.y);
          if (b.isCrit) {
            ctx.onCritDamage(Math.round(b.damage));
            ctx.spawnFloatingText(hitX, b.y - 10, `${Math.round(b.damage)}!`, PALETTE.yellow, 15);
          }
          enemies.damageBoss(b.damage, bossX, boss.y, ctx);
          ctx.spawnFxBurst(hitX, b.y, b.color, 3);
          b.active = false;
          continue;
        }
      }

      // 2. 检测普通/精英怪命中
      for (let j = 0; j < enemyList.length; j++) {
        const e = enemyList[j];
        if (!e.active || b.hitIds.has(e.uid)) continue;
        if (Math.abs(b.y - e.y) > e.radius + 18) continue;

        const dx = b.laneX - e.laneX;
        const dy = b.y - e.y;
        const hitR = e.radius + b.radius;
        if (dx * dx + dy * dy <= hitR * hitR) {
          b.hitIds.add(e.uid);
          e.hp -= b.damage;
          e.flashTimer = 0.06;
          if (b.chillDuration > 0) {
            e.chillTimer = Math.max(e.chillTimer, b.chillDuration);
          }

          if (b.isCrit) {
            const dmgNum = Math.round(b.damage);
            ctx.onCritDamage(dmgNum);
            ctx.spawnFloatingText(projectX(e.laneX, e.y), e.y - 14, `${dmgNum}!`, PALETTE.yellow, 15);
          }

          if (e.hp <= 0) {
            enemies.killEnemy(e, ctx);
          }

          if (ctx.affixes.split > 0 && !b.hasSplit) {
            this.spawnSplitBullets(b);
          }

          b.pierceLeft -= 1;
          if (b.pierceLeft <= 0) {
            b.active = false;
            break;
          }
        }
      }

      if (!b.active) continue;

      // 3. 检测可射击红门与补给桶
      for (let k = 0; k < gateList.length; k++) {
        const g = gateList[k];
        if (!g.active || g.pairLocked) continue;
        if (g.kind !== 'SUPPLY_CRATE' && !g.shootableToFlip) continue;

        if (
          Math.abs(b.y - g.y) <= g.height * 0.5 + b.radius &&
          Math.abs(b.laneX - g.laneX) <= g.width * 0.5
        ) {
          const gx = projectX(b.laneX, g.y);
          gates.damageGate(g, b.damage, gx, g.y, ctx);
          ctx.spawnFxBurst(gx, g.y, g.kind === 'SUPPLY_CRATE' ? PALETTE.yellow : PALETTE.mint, 2);
          b.active = false;
          break;
        }
      }
    }

    this.bullets.sweepInactive();
  }

  private spawnSplitBullets(parent: Bullet): void {
    const angles = [-0.42, 0.42];
    for (const ang of angles) {
      if (this.bullets.activeCount >= MAX_ACTIVE_BULLETS) break;
      const s = this.bullets.acquire();
      s.laneX = parent.laneX;
      s.y = parent.y;
      s.vx = Math.sin(ang) * 500;
      s.vy = -Math.cos(ang) * 500;
      s.damage = parent.damage * 0.45;
      s.radius = 4;
      s.pierceLeft = 1;
      s.color = PALETTE.mint;
      s.kind = 'split';
      s.hasSplit = true;
      s.chillDuration = parent.chillDuration;
      parent.hitIds.forEach((id) => s.hitIds.add(id));
    }
  }
}
