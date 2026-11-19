import { PALETTE } from '../data/palette';
import { WEAPONS } from '../data/weapons';
import type { AudioEngine } from '../engine/AudioEngine';
import { ObjectPool } from '../engine/ObjectPool';
import { LANE_HALF_W, PLAYER_Y, projectX, TRACK_BOTTOM_Y, TRACK_TOP_Y } from '../engine/Viewport';
import type { AffixId, Gate, GateConfig } from './types';
import type { QuipEvent } from '../data/quips';

const TRACK_SCROLL_SPEED = 136;

export interface GateTriggerContext {
  squadCount: number;
  shieldCount: number;
  setSquadCount: (next: number) => void;
  addShield: (delta: number) => void;
  addUltCharge: (delta: number) => void;
  setWeapon: (weaponId: NonNullable<GateConfig['rewardWeapon']>) => void;
  grantAffix: (affixId: AffixId) => void;
  addBeans: (amount: number) => void;
  spawnAmbushMini: (laneX: number, y: number) => void;
  spawnFxBurst: (x: number, y: number, color: string, count: number) => void;
  spawnFloatingText: (x: number, y: number, text: string, color: string, size?: number) => void;
  triggerHitstop: (sec: number) => void;
  triggerShake: (mag: number, sec: number) => void;
  triggerQuip: (ev: QuipEvent) => void;
  onGateFlipped: () => void;
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
        hitFlashTimer: 0,
        bounceScale: 1
      }),
      (g) => {
        g.pairLocked = false;
        g.flippedToBlue = false;
        g.flipProgress = 0;
        g.flipTickCount = 0;
        g.hitFlashTimer = 0;
        g.bounceScale = 1;
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
      g.rewardWeapon = cfg.rewardWeapon;
      g.rewardAffix = cfg.rewardAffix;
      g.labelOverride = cfg.labelOverride;

      if (cfg.kind === 'SUPPLY_CRATE') {
        g.width = 96;
        g.height = 54;
      } else if (cfg.kind === 'MOVING') {
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

      g.y += TRACK_SCROLL_SPEED * dt;
      if (g.hitFlashTimer > 0) g.hitFlashTimer = Math.max(0, g.hitFlashTimer - dt);
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

        if (g.rewardWeapon) {
          ctx.setWeapon(g.rewardWeapon);
          const wName = WEAPONS[g.rewardWeapon].name;
          ctx.spawnFloatingText(worldX, worldY - 12, `解锁 ${wName}!`, PALETTE.yellow, 15);
        }
        if (g.rewardAffix) {
          ctx.grantAffix(g.rewardAffix);
        }
        ctx.triggerQuip('WEAPON_UPGRADE');
      }
      return;
    }

    if (!g.shootableToFlip) return;
    if (g.flippedToBlue && g.value >= 20) return;

    g.flipProgress += dmg;
    g.hitFlashTimer = 0.06;
    g.bounceScale = 1.07;

    while (g.flipProgress >= g.flipHpPerStep) {
      g.flipProgress -= g.flipHpPerStep;
      this.audio.playGateTick(g.flipTickCount++);

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
          g.value = 12;
          g.kind = 'ADD';
          g.flippedToBlue = true;
          this.audio.playGateFlip();
          ctx.triggerHitstop(0.03);
          ctx.spawnFxBurst(worldX, worldY, PALETTE.mint, 16);
          ctx.onGateFlipped();
          ctx.triggerQuip('CLUTCH_FLIP');
        }
      } else if (g.flippedToBlue && g.op === '+') {
        if (g.value < 20) {
          g.value += 1;
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
      const next = prevSquad + g.value;
      ctx.setSquadCount(next);
      ctx.addUltCharge(10);
      this.audio.playGateGood();
      ctx.spawnFxBurst(fxX, fxY, PALETTE.mint, 14);
      ctx.spawnFloatingText(fxX, fxY, `+${g.value} 人`, PALETTE.mint, 18);

      if (
        missedMultSibling &&
        prevSquad * missedMultSibling.value > prevSquad + g.value
      ) {
        ctx.triggerQuip('BAD_MATH_CHOICE');
      }
    } else if (g.op === '×') {
      const next = Math.round(prevSquad * g.value);
      const gain = next - prevSquad;
      ctx.setSquadCount(next);
      ctx.addUltCharge(12);
      this.audio.playGateGood();
      ctx.spawnFxBurst(fxX, fxY, PALETTE.yellow, 18);
      ctx.spawnFloatingText(fxX, fxY, `×${g.value} (+${gain})`, PALETTE.yellow, 19);
    } else if (g.op === '-' || g.op === '÷') {
      if (ctx.shieldCount > 0) {
        ctx.addShield(-1);
        this.audio.playGateGood();
        ctx.spawnFxBurst(fxX, fxY, PALETTE.mint, 12);
        ctx.spawnFloatingText(fxX, fxY, '厚脸皮抵消!', PALETTE.mint, 16);
      } else {
        const next =
          g.op === '-'
            ? Math.max(1, prevSquad - g.value)
            : Math.max(1, Math.floor(prevSquad / Math.max(2, g.value)));
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
      ctx.setSquadCount(prev * 2);
      this.audio.playGateFlip();
      ctx.spawnFxBurst(fxX, fxY, PALETTE.yellow, 22);
      ctx.spawnFloatingText(fxX, fxY, '盲盒暴富 ×2!!', PALETTE.yellow, 19);
      ctx.triggerQuip('MYSTERY_JACKPOT');
    } else if (roll < 0.7) {
      const affixes: AffixId[] = ['crit_rage', 'split', 'chill'];
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
