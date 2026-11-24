import { PALETTE } from '../data/palette';
import type { AudioEngine } from '../engine/AudioEngine';
import { ObjectPool } from '../engine/ObjectPool';
import { LANE_HALF_W, PLAYER_Y, projectX, SCROLL_SPEED, TRACK_BOTTOM_Y, TRACK_TOP_Y } from '../engine/Viewport';
import type { AffixId, Gate, GateConfig, WeaponId } from './types';
import type { QuipEvent } from '../data/quips';

export interface GateTriggerContext {
  squadCount: number;
  shieldCount: number;
  /** 天赋「防弹厚脸皮」减员倍率 */
  lossMult: number;
  /** 主线补给箱打爆时打开三选一；返回 true 表示已接管奖励发放 */
  openCrate?: (reward: { weapon?: WeaponId; affix?: AffixId }) => boolean;
  setSquadCount: (next: number) => void;
  /** 蓝门人数收益修正（职业被动 / 词条 / 画大饼），返回实际收益 */
  adjustGain?: (gain: number, isMult: boolean) => number;
  addShield: (delta: number) => void;
  addUltCharge: (delta: number) => void;
  setWeapon: (weaponId: NonNullable<GateConfig['rewardWeapon']>) => void;
  grantAffix: (affixId: AffixId) => void;
  addBeans: (amount: number) => void;
  triggerOverload: (durationSec: number) => void;
  spawnAmbushMini: (laneX: number, y: number) => void;
  spawnFxBurst: (x: number, y: number, color: string, count: number) => void;
  spawnFloatingText: (x: number, y: number, text: string, color: string, size?: number) => void;
  triggerHitstop: (sec: number) => void;
  triggerShake: (mag: number, sec: number) => void;
  triggerQuip: (ev: QuipEvent) => void;
  onGateFlipped: () => void;
}

/** 洗白后的蓝门可继续射击加码的上限 */
export function getGateFlipCap(g: Gate): number {
  return g.initialOp === '÷' ? 12 : Math.max(6, g.initialValue);
}

/**
 * 统一判定当前门是否会拦截并吸收子弹：
 * - 空投补给箱、未打满上限的可洗白红门/已洗白蓝门会拦截子弹；
 * - 普通增益光幕（+ / × / 盲盒 / 充能 / 过载 / 跷跷板右门）以及已打满上限的洗白门会让子弹直接穿透。
 */
export function isGateShootable(g: Gate): boolean {
  if (!g.active || g.pairLocked) return false;
  if (g.kind === 'SUPPLY_CRATE') return true;
  // 限时门：还没超时就可以射击续命
  if (g.timer > 0 && g.op === '+') return true;
  if (!g.shootableToFlip) return false;
  if (g.flippedToBlue && g.value >= getGateFlipCap(g)) return false;
  return true;
}

export class GateSystem {
  public readonly pool: ObjectPool<Gate>;
  private readonly triggeredPairIds = new Set<string>();
  private nextUid = 1;

  constructor(private readonly audio: AudioEngine) {
    this.pool = new ObjectPool<Gate>(
      () => ({
        active: false,
        uid: 0,
        configId: '',
        pairGroupId: '',
        pairLocked: false,
        laneX: 0,
        y: 0,
        width: 132,
        height: 48,
        kind: 'ADD',
        op: '+',
        value: 1,
        initialOp: '+',
        initialValue: 1,
        shootableToFlip: false,
        flippedToBlue: false,
        flipProgress: 0,
        flipHpPerStep: 14,
        flipTickCount: 0,
        moveSpeedX: 0,
        moveDir: 1,
        barrelHp: 0,
        barrelMaxHp: 0,
        linkedPartnerId: undefined,
        overloadDurationSec: 0,
        hitFlashTimer: 0,
        timer: 0,
        timedMax: 0,
        bounceScale: 1
      }),
      (g) => {
        g.pairLocked = false;
        g.flippedToBlue = false;
        g.flipProgress = 0;
        g.flipTickCount = 0;
        g.hitFlashTimer = 0;
        g.bounceScale = 1;
        g.linkedPartnerId = undefined;
        g.overloadDurationSec = 0;
        g.rewardWeapon = undefined;
        g.rewardAffix = undefined;
        g.labelOverride = undefined;
      },
      24
    );
  }

  reset(): void {
    this.pool.releaseAll();
    this.triggeredPairIds.clear();
    this.nextUid = 1;
  }

  spawnFromConfigs(configs: GateConfig[]): void {
    for (const cfg of configs) {
      const g = this.pool.acquire();
      g.uid = this.nextUid++;
      g.configId = cfg.id;
      g.pairGroupId = cfg.pairGroupId;
      g.laneX = cfg.laneSide === 'LEFT' ? -78 : cfg.laneSide === 'RIGHT' ? 78 : 0;
      g.y = TRACK_TOP_Y - 26;
      g.kind = cfg.kind;
      g.op = cfg.initialOp;
      g.value = cfg.value;
      g.initialOp = cfg.initialOp;
      g.initialValue = cfg.value;
      g.shootableToFlip = cfg.shootableToFlip;
      g.flipHpPerStep = cfg.flipHpPerStep ?? 14;
      g.moveSpeedX = cfg.moveSpeedX ?? 0;
      g.moveDir = 1;
      g.barrelHp = cfg.barrelHp ?? 0;
      g.barrelMaxHp = cfg.barrelHp ?? 0;
      g.linkedPartnerId = cfg.linkedPartnerId;
      g.overloadDurationSec = cfg.overloadDurationSec ?? 0;
      g.rewardWeapon = cfg.rewardWeapon;
      g.rewardAffix = cfg.rewardAffix;
      g.labelOverride = cfg.labelOverride;
      g.timer = cfg.timedSec ?? 0;
      g.timedMax = cfg.timedSec ?? 0;

      if (cfg.kind === 'SUPPLY_CRATE') {
        g.width = 96;
        g.height = 54;
      } else if (cfg.kind === 'MOVING' || Boolean(cfg.moveSpeedX)) {
        g.width = 122;
        g.height = 48;
      } else {
        g.width = 134;
        g.height = 48;
      }
    }
  }

  step(dt: number, leaderLaneX: number, ctx: GateTriggerContext): void {
    const items = this.pool.activeItems;
    for (let i = 0; i < items.length; i++) {
      const g = items[i];
      if (!g.active) continue;

      g.y += SCROLL_SPEED * dt;
      if (g.hitFlashTimer > 0) g.hitFlashTimer = Math.max(0, g.hitFlashTimer - dt);
      // 限时门倒计时：归零前没被续上命，蓝门直接变红门
      if (g.timer > 0 && g.op === '+' && !g.pairLocked) {
        g.timer -= dt;
        if (g.timer <= 0) {
          g.timer = 0;
          g.op = '-';
          g.kind = 'SUB';
          g.shootableToFlip = false;
          g.labelOverride = '{i:alarm} 超时变红';
          g.hitFlashTimer = 0.12;
          g.bounceScale = 1.12;
          this.audio.playGateBad();
        }
      }
      if (g.bounceScale > 1) {
        g.bounceScale = Math.max(1, g.bounceScale - dt * 2.4);
      }

      if (g.moveSpeedX !== 0) {
        g.laneX += g.moveSpeedX * g.moveDir * dt;
        const limit = LANE_HALF_W - g.width * 0.5 - 8;
        if (g.laneX > limit) {
          g.laneX = limit;
          g.moveDir = -1;
        } else if (g.laneX < -limit) {
          g.laneX = -limit;
          g.moveDir = 1;
        }
      }

      if (g.y > TRACK_BOTTOM_Y + 40) {
        g.active = false;
      }
    }

    this.checkLeaderCross(leaderLaneX, ctx);
    this.pool.sweepInactive();
  }

  damageGate(g: Gate, dmg: number, worldX: number, worldY: number, ctx: GateTriggerContext): void {
    if (!g.active || g.pairLocked) return;

    if (g.timer > 0 && g.op === '+') {
      // 射击续命：每发 +0.06 秒（有上限）
      g.timer = Math.min(g.timedMax + 2, g.timer + 0.06);
      g.hitFlashTimer = 0.03;
      return;
    }

    if (g.kind === 'SUPPLY_CRATE') {
      g.barrelHp -= dmg;
      g.hitFlashTimer = 0.06;
      g.bounceScale = 1.1;
      if (g.barrelHp <= 0) {
        g.active = false;
        this.audio.playExplosion(false);
        ctx.triggerHitstop(0.03);
        ctx.triggerShake(4.5, 0.14);
        ctx.spawnFxBurst(worldX, worldY, PALETTE.yellow, 18);

        if (!ctx.openCrate?.({ weapon: g.rewardWeapon, affix: g.rewardAffix })) {
          if (g.rewardWeapon) {
            ctx.setWeapon(g.rewardWeapon);
          }
          if (g.rewardAffix) {
            ctx.grantAffix(g.rewardAffix);
          }
          ctx.triggerQuip('WEAPON_UPGRADE');
        }
      }
      return;
    }

    if (!isGateShootable(g)) return;
    const flipCap = getGateFlipCap(g);

    g.flipProgress += dmg;
    g.hitFlashTimer = 0.06;
    g.bounceScale = 1.07;

    while (g.flipProgress >= g.flipHpPerStep) {
      g.flipProgress -= g.flipHpPerStep;
      this.audio.playGateTick(g.flipTickCount++);

      // G7 联动跷跷板门：射击左侧红门同步为右侧联动蓝门充能 +1
      if (g.linkedPartnerId) {
        const items = this.pool.activeItems;
        for (let i = 0; i < items.length; i++) {
          const partner = items[i];
          if (partner.active && !partner.pairLocked && partner.configId === g.linkedPartnerId) {
            if (partner.value < 30) {
              partner.value += 1;
              partner.bounceScale = 1.09;
              partner.hitFlashTimer = 0.04;
              ctx.spawnFxBurst(projectX(partner.laneX, partner.y), partner.y, PALETTE.yellow, 2);
            }
            break;
          }
        }
      }

      if (g.op === '-') {
        g.value -= 1;
        if (g.value <= 0) {
          g.op = '+';
          g.value = 1;
          g.kind = 'ADD';
          g.flippedToBlue = true;
          this.audio.playGateFlip();
          ctx.triggerHitstop(0.03);
          ctx.spawnFxBurst(worldX, worldY, PALETTE.mint, 16);
          ctx.spawnFloatingText(worldX, worldY - 18, '驳回洗白!', PALETTE.mint, 16);
          ctx.onGateFlipped();
          ctx.triggerQuip('CLUTCH_FLIP');
        }
      } else if (g.op === '÷') {
        // 每 8 步降级 ÷2 -> +12 洗白
        if (g.flipTickCount >= 8) {
          g.op = '+';
          g.value = 6;
          g.kind = 'ADD';
          g.flippedToBlue = true;
          this.audio.playGateFlip();
          ctx.triggerHitstop(0.03);
          ctx.spawnFxBurst(worldX, worldY, PALETTE.mint, 16);
          ctx.onGateFlipped();
          ctx.triggerQuip('CLUTCH_FLIP');
        }
      } else if (g.flippedToBlue && g.op === '+') {
        if (g.value < flipCap) {
          g.value += 1;
          if (g.value >= flipCap) {
            g.value = flipCap;
            g.flipProgress = 0;
            ctx.spawnFxBurst(worldX, worldY, PALETTE.yellow, 10);
            ctx.spawnFloatingText(worldX, worldY - 18, '已打满! 可穿透', PALETTE.yellow, 14);
            break;
          }
        }
      }
    }
  }

  private checkLeaderCross(leaderLaneX: number, ctx: GateTriggerContext): void {
    const items = this.pool.activeItems;
    // 先按 pairGroupId 分组找出所有正在跨越 PLAYER_Y 的候选门，确保只选领队最近的一扇
    const bestByPair = new Map<string, { gate: Gate; dist: number }>();

    for (let i = 0; i < items.length; i++) {
      const g = items[i];
      if (!g.active || g.pairLocked) continue;
      if (this.triggeredPairIds.has(g.pairGroupId)) continue;
      if (Math.abs(g.y - PLAYER_Y) > 18) continue;

      const halfHit = g.width * 0.5 + 8;
      const dist = Math.abs(leaderLaneX - g.laneX);
      if (dist <= halfHit) {
        const existing = bestByPair.get(g.pairGroupId);
        if (!existing || dist < existing.dist) {
          bestByPair.set(g.pairGroupId, { gate: g, dist });
        }
      }
    }

    for (const { gate } of bestByPair.values()) {
      this.applyGateEffect(gate, ctx);
    }
  }

  /** 程序员大招「删库跑路」：场上所有红门直接洗白成蓝门，返回洗白数量 */
  flipAllRed(): number {
    let n = 0;
    const items = this.pool.activeItems;
    for (let i = 0; i < items.length; i++) {
      const g = items[i];
      if (!g.active || g.pairLocked) continue;
      if (g.op !== '-' && g.op !== '÷') continue;
      g.op = '+';
      g.value = g.initialOp === '÷' ? 8 : Math.max(4, Math.round(g.initialValue * 0.6));
      g.kind = 'ADD';
      g.flippedToBlue = true;
      g.hitFlashTimer = 0.12;
      g.bounceScale = 1.15;
      n++;
    }
    if (n > 0) this.audio.playGateFlip();
    return n;
  }

  private applyGateEffect(g: Gate, ctx: GateTriggerContext): void {
    if (g.kind === 'SUPPLY_CRATE') {
      // 直接撞上未打爆的补给桶：桶碎裂但不处罚玩家，只是错过奖励
      g.active = false;
      const sx = projectX(g.laneX, PLAYER_Y);
      ctx.spawnFxBurst(sx, PLAYER_Y, PALETTE.coffee, 10);
      ctx.spawnFloatingText(sx, PLAYER_Y - 26, '差一点打爆!', PALETTE.paper, 13);
      return;
    }

    // 互斥锁：锁定同排所有兄弟门
    this.triggeredPairIds.add(g.pairGroupId);
    const items = this.pool.activeItems;
    let missedMultSibling: Gate | null = null;
    for (let i = 0; i < items.length; i++) {
      const other = items[i];
      if (other.active && other.pairGroupId === g.pairGroupId) {
        other.pairLocked = true;
        if (other !== g && other.op === '×') {
          missedMultSibling = other;
        }
      }
    }

    g.active = false;
    const fxX = projectX(g.laneX, PLAYER_Y);
    const fxY = PLAYER_Y - 24;
    const prevSquad = ctx.squadCount;

    if (g.op === '+') {
      const gain = ctx.adjustGain ? ctx.adjustGain(g.value, false) : g.value;
      const next = prevSquad + gain;
      ctx.setSquadCount(next);
      ctx.addUltCharge(10);
      this.audio.playGateGood();
      ctx.spawnFxBurst(fxX, fxY, PALETTE.mint, 14);
      ctx.spawnFloatingText(fxX, fxY, `+${gain} 人`, PALETTE.mint, 18);

      if (g.kind === 'SEESAW' && g.value >= g.initialValue + 4) {
        ctx.triggerQuip('SEESAW_PRO');
      } else if (
        missedMultSibling &&
        prevSquad * missedMultSibling.value > prevSquad + g.value
      ) {
        ctx.triggerQuip('BAD_MATH_CHOICE');
      }
    } else if (g.op === '×') {
      const rawGain = Math.round(prevSquad * g.value) - prevSquad;
      const gain = ctx.adjustGain ? ctx.adjustGain(rawGain, true) : rawGain;
      const next = prevSquad + gain;
      ctx.setSquadCount(next);
      ctx.addUltCharge(12);
      if (g.kind === 'OVERLOAD') {
        this.audio.playGateFlip();
        ctx.triggerOverload(g.overloadDurationSec || 4.5);
        ctx.spawnFxBurst(fxX, fxY, PALETTE.purple, 22);
        ctx.spawnFloatingText(fxX, fxY, `高压过载 ×${g.value}!!`, PALETTE.yellow, 19);
        ctx.triggerQuip('OVERLOAD_EAT');
      } else {
        this.audio.playGateGood();
        ctx.spawnFxBurst(fxX, fxY, PALETTE.yellow, 18);
        ctx.spawnFloatingText(fxX, fxY, `×${g.value} (+${gain})`, PALETTE.yellow, 19);
      }
    } else if (g.op === '-' || g.op === '÷') {
      if (ctx.shieldCount > 0) {
        ctx.addShield(-1);
        this.audio.playGateGood();
        ctx.spawnFxBurst(fxX, fxY, PALETTE.mint, 12);
        ctx.spawnFloatingText(fxX, fxY, '厚脸皮抵消!', PALETTE.mint, 16);
      } else {
        const rawNext =
          g.op === '-'
            ? prevSquad - g.value
            : Math.floor(prevSquad / Math.max(2, g.value));
        const rawLoss = Math.max(0, prevSquad - rawNext);
        const next = Math.max(1, prevSquad - Math.round(rawLoss * ctx.lossMult));
        const lost = prevSquad - next;
        ctx.setSquadCount(next);
        this.audio.playGateBad();
        ctx.triggerShake(5, 0.16);
        ctx.spawnFxBurst(fxX, fxY, PALETTE.red, 16);
        ctx.spawnFloatingText(fxX, fxY, lost > 0 ? `-${lost} 人` : '险胜保底 1 人', PALETTE.red, 17);
        ctx.triggerQuip(next === 1 && prevSquad > 1 ? 'LOW_SURVIVE' : 'RED_DOOR_LOSS');
      }
    } else if (g.op === 'ULT') {
      ctx.addUltCharge(g.value);
      ctx.addShield(1);
      this.audio.playGateGood();
      ctx.spawnFxBurst(fxX, fxY, PALETTE.yellow, 16);
      ctx.spawnFloatingText(fxX, fxY, `下班充能 +${g.value}%`, PALETTE.yellow, 16);
    } else if (g.op === 'BOX') {
      this.resolveMysteryBox(fxX, fxY, g.laneX, ctx);
    }

    if (prevSquad < 100 && ctx.squadCount >= 100) {
      ctx.triggerQuip('SQUAD_100');
    }
  }

  private resolveMysteryBox(fxX: number, fxY: number, laneX: number, ctx: GateTriggerContext): void {
    const roll = Math.random();
    if (roll < 0.4) {
      const prev = ctx.squadCount;
      ctx.setSquadCount(Math.round(prev * 1.5) + 2);
      this.audio.playGateFlip();
      ctx.spawnFxBurst(fxX, fxY, PALETTE.yellow, 22);
      ctx.spawnFloatingText(fxX, fxY, '盲盒暴富 ×1.5!!', PALETTE.yellow, 19);
      ctx.triggerQuip('MYSTERY_JACKPOT');
    } else if (roll < 0.7) {
      const affixes: AffixId[] = [
        'crit_rage',
        'split',
        'chill',
        'ricochet',
        'pierce',
        'chain_lightning',
        'kill_haste',
        'vamp_shield'
      ];
      const picked = affixes[Math.floor(Math.random() * affixes.length)];
      ctx.grantAffix(picked);
      this.audio.playGateFlip();
      ctx.spawnFxBurst(fxX, fxY, PALETTE.purple, 18);
      ctx.triggerQuip('MYSTERY_JACKPOT');
    } else if (roll < 0.9) {
      ctx.setSquadCount(ctx.squadCount + 8);
      ctx.addShield(1);
      this.audio.playGateGood();
      ctx.spawnFxBurst(fxX, fxY, PALETTE.mint, 14);
      ctx.spawnFloatingText(fxX, fxY, '盲盒 +8人 +1盾', PALETTE.mint, 16);
    } else {
      ctx.addBeans(15);
      ctx.spawnAmbushMini(laneX, PLAYER_Y - 170);
      this.audio.playGateBad();
      ctx.spawnFxBurst(fxX, fxY, PALETTE.purple, 16);
      ctx.spawnFloatingText(fxX, fxY, '老板突击邮件!', PALETTE.red, 16);
      ctx.triggerQuip('MYSTERY_AMBUSH');
    }
  }
}
