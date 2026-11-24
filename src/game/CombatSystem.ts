import { PALETTE } from '../data/palette';
import type { CharacterMods } from '../data/characters';
import { SIDEARM_BASE, WEAPON_LEVEL_DAMAGE, WEAPON_LEVEL_RATE, WEAPONS } from '../data/weapons';
import type { AudioEngine } from '../engine/AudioEngine';
import { ObjectPool } from '../engine/ObjectPool';
import { ENGAGE_Y, LANE_HALF_W, PLAYER_Y, TRACK_TOP_Y, projectX } from '../engine/Viewport';
import type { BossSystem } from './BossSystem';
import type { EnemyStepContext, EnemySystem } from './EnemySystem';
import type { GateSystem, GateTriggerContext } from './GateSystem';
import { isGateShootable } from './GateSystem';
import type { AffixId, Bullet, BulletKind, DamageSource, Enemy, LightningArc, Sidearm, SynergyId, WeaponId } from './types';

/** 子弹的伤害来源（结算复盘用） */
function bulletSource(b: Bullet): DamageSource {
  if (b.sidearm) return 'sidearm';
  if (b.synergyPowered) return 'synergy';
  return b.kind === 'split' ? 'affix' : 'weapon';
}

const MAX_ACTIVE_BULLETS = 180;
/** 单兵基础 DPS；总火力 = BASE × N^FIRE_EXPONENT × 武器倍率，人数越多边际收益越低 */
const BASE_UNIT_DPS = 26;
const FIRE_EXPONENT = 0.68;
const KEYCAPS = ['Ctrl', 'Esc', 'Z', 'F5', 'Del'];
const POD_OFFSET = 36;
/** 外挂挂在小队两侧的横向偏移 */
const SIDEARM_OFFSET = 50;

const KIND_OF: Record<WeaponId, BulletKind> = {
  stapler: 'stapler',
  keyboard: 'keycap',
  americano: 'beam',
  drone: 'drone',
  headphone: 'wave',
  ai_pod: 'pod',
  broom: 'broom'
};

export interface CombatContext extends EnemyStepContext, GateTriggerContext {
  activeWeapon: WeaponId;
  affixes: Record<AffixId, number>;
  activeSynergies: readonly SynergyId[];
  podOverclockTimer: number;
  /** 天赋「摸鱼算盘」伤害倍率 */
  damageMult: number;
  /** 词条「越摸越顺」射速倍率 */
  hasteMult: number;
  onCritDamage: (dmg: number) => void;
  /** 结算复盘：按来源累计伤害 */
  recordDamage: (src: DamageSource, amount: number) => void;
  /** 角色被动 */
  mods: CharacterMods;
  /** 主武器等级 1~3 */
  weaponLevel: number;
  sidearms: readonly Sidearm[];
  /** 销售大招：射速 ×2.5、必定暴击 */
  rushTimer: number;
  onFiredShot: () => void;
  triggerPodOverclock: () => void;
}

export class CombatSystem {
  public readonly bullets: ObjectPool<Bullet>;
  public readonly arcs: LightningArc[] = [];
  private fireCooldown = 0;
  private critTextCooldown = 0;
  private sideCooldowns = [0.3, 0.55];

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
        bouncesLeft: 0,
        wallBouncesLeft: 0,
        color: PALETTE.paper,
        kind: 'stapler',
        isCrit: false,
        hasSplit: false,
        chillDuration: 0,
        deepChillDuration: 0,
        synergyPowered: false,
        hitIds: new Set<number>(),
        keyLabel: 'F5',
        rot: 0,
        age: 0,
        maxAge: 0,
        evolved: false,
        sidearm: false,
        burn: 0,
        bounced: false
      }),
      (b) => {
        b.isCrit = false;
        b.hasSplit = false;
        b.chillDuration = 0;
        b.deepChillDuration = 0;
        b.synergyPowered = false;
        b.pierceLeft = 1;
        b.bouncesLeft = 0;
        b.wallBouncesLeft = 0;
        b.rot = 0;
        b.age = 0;
        b.maxAge = 0;
        b.evolved = false;
        b.sidearm = false;
        b.burn = 0;
        b.bounced = false;
        b.hitIds.clear();
      },
      200
    );
  }

  reset(): void {
    this.bullets.releaseAll();
    this.arcs.length = 0;
    this.fireCooldown = 0;
    this.critTextCooldown = 0;
    this.sideCooldowns = [0.3, 0.55];
  }

  step(dt: number, enemies: EnemySystem, boss: BossSystem, gates: GateSystem, ctx: CombatContext): void {
    if (this.critTextCooldown > 0) this.critTextCooldown -= dt;
    for (let i = this.arcs.length - 1; i >= 0; i--) {
      this.arcs[i].life -= dt;
      if (this.arcs[i].life <= 0) this.arcs.splice(i, 1);
    }
    this.stepAutoFire(dt, enemies, ctx);
    this.fireSidearms(dt, enemies, ctx);
    this.stepBullets(dt, enemies, boss, gates, ctx);
  }

  private findNearestEnemy(
    enemies: EnemySystem,
    laneX: number,
    y: number,
    maxDist: number,
    exclude?: Set<number>
  ): Enemy | null {
    const list = enemies.enemies.activeItems;
    let best: Enemy | null = null;
    let bestD = maxDist * maxDist;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active || e.y < ENGAGE_Y) continue;
      if (exclude && exclude.has(e.uid)) continue;
      const dx = e.laneX - laneX;
      const dy = e.y - y;
      const d = dx * dx + dy * dy;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  private stepAutoFire(dt: number, enemies: EnemySystem, ctx: CombatContext): void {
    const wid = ctx.activeWeapon;
    const weapon = WEAPONS[wid];
    const lv = Math.max(1, Math.min(3, ctx.weaponLevel || 1));
    const evolved = lv >= 3;
    const syn = ctx.activeSynergies;
    const hasKeyboardRain = syn.includes('keyboard_rain');
    const hasAbsoluteZero = syn.includes('absolute_zero');
    const hasSuperconduct = syn.includes('superconduct');
    const hasSwarmDelivery = syn.includes('swarm_delivery');
    const hasGptOverclock = syn.includes('gpt_overclock');
    const hasMopFreeze = syn.includes('mop_freeze');
    const A = ctx.affixes;

    const ultRateMult = ctx.ultActiveTimer > 0 ? 2.0 : 1.0;
    const podMult = hasGptOverclock && ctx.podOverclockTimer > 0 ? 1.25 : 1.0;
    const rush = ctx.rushTimer > 0;
    // 射速相关倍率同时进入 DPS，保证「射得快」= 「打得多」而单发伤害不变
    const rateMult = WEAPON_LEVEL_RATE[lv - 1] * ctx.mods.fireRateMult * ultRateMult * ctx.hasteMult * podMult * (rush ? 2.5 : 1);
    const rate = weapon.fireRatePerSec * rateMult;

    this.fireCooldown -= dt;
    if (this.fireCooldown > 0) return;
    this.fireCooldown = 1 / rate;

    const effectiveDps =
      BASE_UNIT_DPS *
      Math.pow(Math.max(1, ctx.squadCount), FIRE_EXPONENT) *
      weapon.damageMultiplier *
      WEAPON_LEVEL_DAMAGE[lv - 1] *
      rateMult *
      ctx.damageMult;

    let pellets = weapon.pellets;
    if (evolved && wid === 'keyboard') pellets += 2;
    if (evolved && wid === 'ai_pod') pellets = 4;
    if (hasMopFreeze && wid === 'broom') pellets += 2;

    let streams =
      ctx.squadCount >= 80 ? 5 : ctx.squadCount >= 35 ? 4 : ctx.squadCount >= 14 ? 3 : ctx.squadCount >= 5 ? 2 : 1;
    if (wid === 'headphone' || wid === 'ai_pod' || wid === 'broom') {
      streams = Math.min(streams, wid === 'headphone' ? 3 : 2);
    }
    if (wid === 'drone') streams += (evolved ? 1 : 0) + (A.prd_rush > 0 ? 1 : 0);

    const totalNeeded = streams * pellets;
    const available = MAX_ACTIVE_BULLETS - this.bullets.activeCount;
    if (available <= 0) return;

    let mergeScale = 1;
    if (totalNeeded > available) {
      streams = Math.max(1, Math.floor(available / pellets));
      mergeScale = totalNeeded / Math.max(1, streams * pellets);
    }

    const perBulletDmg = (effectiveDps / rate / Math.max(1, streams * pellets)) * mergeScale;
    const isMerged = ctx.squadCount > 24 || mergeScale > 1.05;
    const pierceBonus = 2 * A.pierce + (evolved && wid === 'stapler' ? 2 : 0);
    let chillSec = A.chill > 0 ? 1.6 + A.chill * 0.4 : 0;
    chillSec = Math.max(chillSec, ctx.mods.baseChill, A.floor_wax > 0 ? 1.0 : 0, evolved && wid === 'americano' ? 1.2 : 0);
    const critChance = rush ? 1 : Math.min(0.6, 0.05 + 0.17 * A.crit_rage + ctx.mods.critBonus);
    const critMult = 2.2 + (A.big_client > 0 ? 0.6 : 0);
    const bounces = (A.ricochet + ctx.mods.baseBounces + (hasKeyboardRain ? 2 : 0)) * (A.stack_overflow > 0 ? 2 : 1);
    const burn = A.overtime_burn > 0 ? 0.22 * A.overtime_burn : 0;
    const spread = weapon.spreadRad * (hasMopFreeze && wid === 'broom' ? 1.3 : 1);

    this.audio.playShoot(wid === 'broom' ? 'headphone' : wid);
    ctx.onFiredShot();

    const kind = KIND_OF[wid];

    for (let s = 0; s < streams; s++) {
      const streamOffset = streams === 1 ? 0 : (s - (streams - 1) * 0.5) * 14;
      for (let p = 0; p < pellets; p++) {
        if (this.bullets.activeCount >= MAX_ACTIVE_BULLETS) break;

        let originX = ctx.leaderLaneX + streamOffset;
        let angle =
          pellets === 1 ? (Math.random() - 0.5) * spread : -spread * 0.5 + (p / Math.max(1, pellets - 1)) * spread;

        if (kind === 'pod') {
          const side = p % 2 === 0 ? -1 : 1;
          const far = p >= 2 ? 1.8 : 1;
          originX = ctx.leaderLaneX + side * POD_OFFSET * far + streamOffset * 0.4;
          const target = this.findNearestEnemy(enemies, originX, PLAYER_Y - 200, 420);
          if (target) {
            angle = Math.atan2(target.laneX - originX, PLAYER_Y - 30 - target.y);
            angle = Math.max(-0.7, Math.min(0.7, angle)) + (Math.random() - 0.5) * weapon.spreadRad;
          }
        }

        const b = this.bullets.acquire();
        const isCrit = Math.random() < critChance;
        b.laneX = originX;
        b.y = PLAYER_Y - (kind === 'pod' ? 30 : 18);
        b.vx = Math.sin(angle) * weapon.projectileSpeed;
        b.vy = -Math.cos(angle) * weapon.projectileSpeed;
        b.isCrit = isCrit;
        b.damage = perBulletDmg * (isCrit ? critMult : 1.0);
        b.pierceLeft = weapon.basePierce + pierceBonus;
        b.bouncesLeft = bounces;
        b.wallBouncesLeft = hasKeyboardRain && kind === 'keycap' ? 2 : 0;
        b.chillDuration = chillSec;
        b.deepChillDuration = (hasAbsoluteZero && kind === 'wave') || (hasMopFreeze && kind === 'broom') ? 2.4 : 0;
        b.synergyPowered =
          (hasSuperconduct && kind === 'beam') ||
          (hasKeyboardRain && kind === 'keycap') ||
          (hasSwarmDelivery && kind === 'drone') ||
          (hasAbsoluteZero && kind === 'wave') ||
          (hasMopFreeze && kind === 'broom') ||
          (hasGptOverclock && kind === 'pod' && ctx.podOverclockTimer > 0);
        b.color = b.synergyPowered && kind === 'pod' ? PALETTE.yellow : isCrit ? PALETTE.yellow : weapon.color;
        b.kind = kind;
        b.age = 0;
        b.maxAge = weapon.rangeSec ?? 0;
        b.evolved = evolved;
        b.burn = burn;

        switch (kind) {
          case 'keycap':
            b.radius = isMerged ? 8 : 6.5;
            b.keyLabel = KEYCAPS[p % KEYCAPS.length];
            break;
          case 'beam':
            b.radius = (isMerged ? 7.5 : 6) * (evolved ? 1.4 : 1);
            break;
          case 'wave':
            b.radius = Math.round(
              (isMerged ? 17 : 14) * (hasAbsoluteZero ? 1.35 : 1) * (A.pixel_align > 0 ? 1.4 : 1) * (evolved ? 1.2 : 1)
            );
            break;
          case 'drone':
            b.radius = isMerged ? 7 : 6;
            break;
          case 'pod':
            b.radius = b.synergyPowered ? 6.5 : 5;
            break;
          case 'broom':
            b.radius = (isMerged ? 18 : 15) * (evolved ? 1.15 : 1);
            break;
          default:
            b.radius = (isMerged ? 6.5 : 4.8) * (evolved ? 1.2 : 1);
        }
      }
    }
  }

  /** 外挂副武器：挂在小队两侧，按自己的射速开火，伤害约为主武器的 35%（每级 +25%） */
  private fireSidearms(dt: number, enemies: EnemySystem, ctx: CombatContext): void {
    const list = ctx.sidearms;
    if (!list || list.length === 0) return;
    const A = ctx.affixes;
    for (let i = 0; i < list.length && i < 2; i++) {
      const sd = list[i];
      const w = WEAPONS[sd.id];
      this.sideCooldowns[i] -= dt;
      if (this.sideCooldowns[i] > 0) continue;
      const rate = w.fireRatePerSec * 0.85 * ctx.hasteMult * (ctx.rushTimer > 0 ? 1.6 : 1);
      this.sideCooldowns[i] = 1 / rate;
      if (this.bullets.activeCount >= MAX_ACTIVE_BULLETS - 6) continue;

      const dps =
        BASE_UNIT_DPS *
        Math.pow(Math.max(1, ctx.squadCount), FIRE_EXPONENT) *
        w.damageMultiplier *
        ctx.damageMult *
        SIDEARM_BASE *
        (1 + 0.25 * (sd.level - 1));
      const pellets = Math.min(w.pellets, 3);
      const per = dps / rate / pellets;
      const side = i === 0 ? -1 : 1;
      const originX = ctx.leaderLaneX + side * SIDEARM_OFFSET;
      const kind = KIND_OF[sd.id];
      const critChance = Math.min(0.6, 0.05 + 0.17 * A.crit_rage + ctx.mods.critBonus);
      for (let p = 0; p < pellets; p++) {
        let angle = pellets === 1 ? (Math.random() - 0.5) * w.spreadRad : -w.spreadRad * 0.5 + (p / (pellets - 1)) * w.spreadRad;
        if (kind === 'pod') {
          const t = this.findNearestEnemy(enemies, originX, PLAYER_Y - 200, 420);
          if (t) angle = Math.max(-0.7, Math.min(0.7, Math.atan2(t.laneX - originX, PLAYER_Y - 30 - t.y)));
        }
        const b = this.bullets.acquire();
        const isCrit = Math.random() < critChance;
        b.laneX = originX;
        b.y = PLAYER_Y - 14;
        b.vx = Math.sin(angle) * w.projectileSpeed;
        b.vy = -Math.cos(angle) * w.projectileSpeed;
        b.isCrit = isCrit;
        b.damage = per * (isCrit ? 2.2 : 1);
        b.pierceLeft = w.basePierce + A.pierce;
        b.bouncesLeft = 0;
        b.wallBouncesLeft = 0;
        b.chillDuration = A.chill > 0 || ctx.mods.baseChill > 0 ? 1.2 : 0;
        b.deepChillDuration = 0;
        b.synergyPowered = false;
        b.color = isCrit ? PALETTE.yellow : w.color;
        b.kind = kind;
        b.keyLabel = KEYCAPS[p % KEYCAPS.length];
        b.age = 0;
        b.maxAge = w.rangeSec ?? 0;
        b.sidearm = true;
        b.radius = kind === 'wave' ? 11 : kind === 'broom' ? 12 : kind === 'keycap' ? 5.5 : 4.2;
      }
    }
  }

  private stepBullets(
    dt: number,
    enemies: EnemySystem,
    bossSys: BossSystem,
    gates: GateSystem,
    ctx: CombatContext
  ): void {
    const items = this.bullets.activeItems;
    const enemyList = enemies.enemies.activeItems;
    const gateList = gates.pool.activeItems;
    const boss = bossSys.boss;
    const hasSuperconduct = ctx.activeSynergies.includes('superconduct');
    const hasSwarmDelivery = ctx.activeSynergies.includes('swarm_delivery');
    const hasGptOverclock = ctx.activeSynergies.includes('gpt_overclock');

    for (let i = 0; i < items.length; i++) {
      const b = items[i];
      if (!b.active) continue;
      b.age += dt;
      if (b.maxAge > 0 && b.age > b.maxAge) {
        b.active = false;
        continue;
      }
      // 主动降噪力场（耳机进化）：声波环抵消 Boss 弹幕
      if (b.kind === 'wave' && b.evolved && !b.sidearm) {
        const projs = bossSys.projectiles.activeItems;
        for (let k = 0; k < projs.length; k++) {
          const pj = projs[k];
          if (!pj.active) continue;
          const dx = pj.laneX - b.laneX;
          const dy = pj.y - b.y;
          const rr = b.radius + pj.radius + 4;
          if (dx * dx + dy * dy <= rr * rr) {
            pj.active = false;
            ctx.spawnFxBurst(projectX(pj.laneX, pj.y), pj.y, PALETTE.mint, 4);
          }
        }
      }

      if (b.kind === 'drone' && b.age > 0.06) {
        let tx: number | null = null;
        let ty = 0;
        const target = this.findNearestEnemy(enemies, b.laneX, b.y, 340, b.hitIds);
        if (target) {
          tx = target.laneX;
          ty = target.y;
        } else if (boss.active) {
          tx = boss.laneX;
          ty = boss.y;
        }
        if (tx !== null) {
          const speed = Math.hypot(b.vx, b.vy);
          const desired = Math.atan2(tx - b.laneX, ty - b.y);
          const current = Math.atan2(b.vx, b.vy);
          let diff = desired - current;
          while (diff > Math.PI) diff -= Math.PI * 2;
          while (diff < -Math.PI) diff += Math.PI * 2;
          const turn = Math.max(-7 * dt, Math.min(7 * dt, diff));
          const next = current + turn;
          b.vx = Math.sin(next) * speed;
          b.vy = Math.cos(next) * speed;
        }
        b.rot = Math.atan2(b.vx, -b.vy);
      }

      b.laneX += b.vx * dt;
      b.y += b.vy * dt;
      if (b.kind === 'keycap') b.rot += dt * 7.5;

      // 弹幕键盘雨：键帽碰到跑道左右边界时向场内反弹
      if (b.wallBouncesLeft > 0 && Math.abs(b.laneX) >= LANE_HALF_W - 6) {
        b.laneX = Math.sign(b.laneX) * (LANE_HALF_W - 7);
        b.vx = -b.vx;
        b.wallBouncesLeft -= 1;
        b.color = PALETTE.yellow;
      }

      if (b.y < TRACK_TOP_Y - 40 || b.y > PLAYER_Y + 60 || Math.abs(b.laneX) > LANE_HALF_W + 20) {
        b.active = false;
        continue;
      }

      // 1. Boss
      if (boss.active) {
        const dx = b.laneX - boss.laneX;
        const dy = b.y - boss.y;
        const hitR = boss.radius + b.radius;
        if (dx * dx + dy * dy <= hitR * hitR) {
          const hitX = projectX(b.laneX, b.y);
          const bossX = projectX(boss.laneX, boss.y);
          const hpBefore = boss.hp;
          const applied = bossSys.damage(b.damage, bossX, boss.y, ctx);
          if (applied) {
            ctx.recordDamage(bulletSource(b), Math.max(0, hpBefore - boss.hp));
            if (hasGptOverclock && b.kind === 'pod' && b.isCrit) ctx.triggerPodOverclock();
            if (b.isCrit) this.showCrit(ctx, b.damage, hitX, b.y - 10);
            ctx.spawnFxBurst(hitX, b.y, b.color, 2);
          } else {
            ctx.spawnFxBurst(hitX, b.y, PALETTE.paper, 1);
          }
          b.active = false;
          continue;
        }
      }

      // 2. 普通 / 精英怪
      for (let j = 0; j < enemyList.length; j++) {
        const e = enemyList[j];
        if (!e.active || b.hitIds.has(e.uid)) continue;
        if (e.y < ENGAGE_Y) continue; // 还没完全进入画面的怪不吃子弹
        if (Math.abs(b.y - e.y) > e.radius + 20) continue;

        const dx = b.laneX - e.laneX;
        const dy = b.y - e.y;
        const hitR = e.radius + b.radius;
        if (dx * dx + dy * dy > hitR * hitR) continue;

        b.hitIds.add(e.uid);
        this.applyHit(e, b.damage, b.isCrit, b.chillDuration, b.deepChillDuration, enemies, ctx, bulletSource(b), b.burn);
        // 气旋吸尘器（扫帚进化）：把被扫到的小怪往小队正前方吸
        if (b.kind === 'broom' && b.evolved && e.active) e.laneX += (ctx.leaderLaneX - e.laneX) * 0.3;

        if (hasGptOverclock && b.kind === 'pod' && b.isCrit) {
          ctx.triggerPodOverclock();
        }

        if (ctx.affixes.split > 0 && !b.hasSplit && !b.sidearm) {
          this.spawnSplitBullets(b, ctx, hasSwarmDelivery && b.kind === 'drone');
        }
        if (ctx.affixes.chain_lightning > 0) {
          this.tryChainLightning(e, b.damage, enemies, ctx, hasSuperconduct && b.kind === 'beam');
        }

        // 甩锅弹射：命中后转向下一个目标，不消耗穿透
        if (b.bouncesLeft > 0) {
          const next = this.findNearestEnemy(enemies, b.laneX, b.y, 170, b.hitIds);
          if (next) {
            b.bouncesLeft--;
            if (!b.bounced) {
              b.bounced = true;
              b.damage *= ctx.mods.bounceDamageMult;
            }
            const speed = Math.max(420, Math.hypot(b.vx, b.vy));
            const ang = Math.atan2(next.laneX - b.laneX, next.y - b.y);
            b.vx = Math.sin(ang) * speed;
            b.vy = Math.cos(ang) * speed;
            b.color = PALETTE.purple;
            break;
          }
        }

        b.pierceLeft -= 1;
        if (b.pierceLeft <= 0) {
          b.active = false;
          break;
        }
      }

      if (!b.active) continue;

      // 3. 可射击红门与补给箱（普通光幕门与已打满的洗白门直接放行子弹）
      for (let k = 0; k < gateList.length; k++) {
        const g = gateList[k];
        if (!isGateShootable(g)) continue;

        if (Math.abs(b.y - g.y) <= g.height * 0.5 + b.radius && Math.abs(b.laneX - g.laneX) <= g.width * 0.5) {
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

  private applyHit(
    e: Enemy,
    dmg: number,
    isCrit: boolean,
    chill: number,
    deepChill: number,
    enemies: EnemySystem,
    ctx: CombatContext,
    src: DamageSource,
    burn = 0
  ): void {
    // 高级灰：被减速的敌人多吃 30% 伤害
    if (ctx.affixes.premium_gray > 0 && (e.chillTimer > 0 || e.deepChillTimer > 0)) dmg *= 1.3;
    if (burn > 0) {
      e.burnTimer = 2;
      e.burnDps = Math.max(e.burnDps, dmg * burn);
    }
    ctx.recordDamage(src, Math.min(dmg, Math.max(0, e.hp)));
    e.hp -= dmg;
    e.flashTimer = 0.06;
    if (chill > 0) e.chillTimer = Math.max(e.chillTimer, chill);
    if (deepChill > 0) e.deepChillTimer = Math.max(e.deepChillTimer, deepChill);
    if (isCrit) this.showCrit(ctx, dmg, projectX(e.laneX, e.y), e.y - 14);
    if (e.hp <= 0) {
      enemies.killEnemy(e, ctx);
    } else {
      // 命中击退：伤害占血量比例越高退得越远，重装单位只退一点
      const heavy = e.configId === 'ppt_pie' || e.configId === 'client_tweak';
      const knock = Math.min(7, Math.max(1.5, (dmg / e.maxHp) * 26)) * (heavy ? 0.35 : 1) * (isCrit ? 1.6 : 1);
      e.y -= knock;
    }
  }

  /** 暴击飘字节流，避免满屏数字糊住画面 */
  private showCrit(ctx: CombatContext, dmg: number, x: number, y: number): void {
    const n = Math.round(dmg);
    ctx.onCritDamage(n);
    if (this.critTextCooldown > 0) return;
    this.critTextCooldown = 0.12;
    ctx.spawnFloatingText(x, y, `${n}!`, PALETTE.yellow, 15);
  }

  private tryChainLightning(
    origin: Enemy,
    dmg: number,
    enemies: EnemySystem,
    ctx: CombatContext,
    isSuperconduct: boolean
  ): void {
    const lvl = ctx.affixes.chain_lightning;
    // 超导碎冰：被减速的敌人必定连锁、电伤翻倍
    const shatter = ctx.activeSynergies.includes('shatter_ice');
    const originChilled = origin.chillTimer > 0 || origin.deepChillTimer > 0;
    if (!isSuperconduct && !(shatter && originChilled) && Math.random() > 0.16 + 0.08 * (lvl - 1)) return;
    const visited = new Set<number>([origin.uid]);
    let from = origin;
    const hops = (isSuperconduct ? 4 : 2) + lvl;
    const dmgScale = isSuperconduct ? 0.75 : 0.55;
    for (let k = 0; k < hops; k++) {
      const next = this.findNearestEnemy(enemies, from.laneX, from.y, isSuperconduct ? 170 : 130, visited);
      if (!next) break;
      visited.add(next.uid);
      if (this.arcs.length < 24) {
        this.arcs.push({
          x1: projectX(from.laneX, from.y),
          y1: from.y,
          x2: projectX(next.laneX, next.y),
          y2: next.y,
          life: 0.15,
          superconduct: isSuperconduct
        });
      }
      const iced = shatter && (next.chillTimer > 0 || next.deepChillTimer > 0);
      this.applyHit(next, dmg * dmgScale * (iced ? 2 : 1), false, 0, 0, enemies, ctx, isSuperconduct || iced ? 'synergy' : 'affix');
      from = next;
    }
  }

  private spawnSplitBullets(parent: Bullet, ctx: CombatContext, swarmDrone: boolean): void {
    const level = ctx.affixes.split;
    const angles = level >= 2 ? [-0.5, -0.2, 0.2, 0.5] : [-0.42, 0.42];
    if (ctx.affixes.ctrl_cv > 0) angles.push(0);
    const wildfire = ctx.activeSynergies.includes('wildfire');
    for (const ang of angles) {
      if (this.bullets.activeCount >= MAX_ACTIVE_BULLETS) break;
      const s = this.bullets.acquire();
      s.laneX = parent.laneX;
      s.y = parent.y;
      s.vx = Math.sin(ang) * 500;
      s.vy = -Math.cos(ang) * 500;
      s.damage = parent.damage * (swarmDrone ? 0.5 : 0.45) * ctx.mods.bounceDamageMult;
      s.radius = swarmDrone ? 5 : 4;
      s.pierceLeft = 1;
      s.bouncesLeft = 0;
      s.wallBouncesLeft = 0;
      s.color = wildfire ? PALETTE.red : swarmDrone ? PALETTE.yellow : PALETTE.mint;
      s.kind = swarmDrone ? 'drone' : 'split';
      s.hasSplit = true;
      s.isCrit = false;
      s.chillDuration = parent.chillDuration;
      s.deepChillDuration = parent.deepChillDuration;
      s.synergyPowered = swarmDrone || wildfire;
      s.burn = wildfire ? Math.max(0.22, parent.burn) * 1.5 : 0;
      s.age = 0;
      parent.hitIds.forEach((id) => s.hitIds.add(id));
    }
  }
}
