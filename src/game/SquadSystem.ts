import { clamp, LANE_HALF_W, LEADER_MAX_X } from '../engine/Viewport';
import type { SquadUnitRender } from './types';

const GOLDEN_ANGLE_RAD = 2.399963229728653; // ~137.5°
const MAX_VISUAL_UNITS = 45;

export class SquadSystem {
  public leaderLaneX = 0;
  public targetLaneX = 0;
  public readonly renderUnits: SquadUnitRender[] = [];
  /** 小队实际占地范围（相对领队），用于敌人碰撞与人数牌定位 */
  public footprintHalfW = 14;
  public footprintTopDy = -16;
  public footprintBottomDy = 14;

  reset(): void {
    this.leaderLaneX = 0;
    this.targetLaneX = 0;
  }

  addTargetDelta(deltaLaneX: number): void {
    this.targetLaneX = clamp(this.targetLaneX + deltaLaneX, -LEADER_MAX_X, LEADER_MAX_X);
  }

  step(dt: number): void {
    const followAlpha = Math.min(1, 28 * dt);
    this.leaderLaneX += (this.targetLaneX - this.leaderLaneX) * followAlpha;
  }

  /**
   * 费马螺线排布 + 5合1 / 10合1 视觉代理合体压缩（严格 <= 45 个单位）
   */
  rebuildRenderUnits(squadCount: number): void {
    this.renderUnits.length = 0;
    this.footprintHalfW = 14;
    this.footprintTopDy = -16;
    this.footprintBottomDy = 14;
    const count = Math.max(0, Math.floor(squadCount));
    if (count <= 0) return;

    const tiers: Array<1 | 5 | 10> = [];

    if (count <= 24) {
      for (let i = 0; i < count; i++) tiers.push(1);
    } else if (count <= 74) {
      const fives = Math.floor(count / 5);
      const ones = count % 5;
      for (let i = 0; i < fives && tiers.length < MAX_VISUAL_UNITS; i++) tiers.push(5);
      for (let i = 0; i < ones && tiers.length < MAX_VISUAL_UNITS; i++) tiers.push(1);
    } else {
      const tens = Math.min(MAX_VISUAL_UNITS, Math.floor(count / 10));
      const rem = count - tens * 10;
      const fives = Math.floor(rem / 5);
      const ones = rem % 5;
      for (let i = 0; i < tens && tiers.length < MAX_VISUAL_UNITS; i++) tiers.push(10);
      for (let i = 0; i < fives && tiers.length < MAX_VISUAL_UNITS; i++) tiers.push(5);
      for (let i = 0; i < ones && tiers.length < MAX_VISUAL_UNITS; i++) tiers.push(1);
    }

    const wallPad = 14;
    for (let i = 0; i < tiers.length; i++) {
      let dx = 0;
      let dy = 0;
      if (i > 0) {
        const theta = i * GOLDEN_ANGLE_RAD;
        const r = 13.5 * Math.sqrt(i);
        dx = r * Math.cos(theta);
        dy = r * Math.sin(theta) * 0.65;
      }
      // 确保边缘单位贴墙弹性收缩而不越出跑道
      const worldX = clamp(this.leaderLaneX + dx, -LANE_HALF_W + wallPad, LANE_HALF_W - wallPad);
      dx = worldX - this.leaderLaneX;

      const unitR = tiers[i] === 10 ? 20 : tiers[i] === 5 ? 15 : 11;
      if (Math.abs(dx) + unitR > this.footprintHalfW) this.footprintHalfW = Math.abs(dx) + unitR;
      if (dy - unitR < this.footprintTopDy) this.footprintTopDy = dy - unitR;
      if (dy + unitR > this.footprintBottomDy) this.footprintBottomDy = dy + unitR;

      this.renderUnits.push({
        dx,
        dy,
        tier: tiers[i],
        phase: i * 0.7
      });
    }
  }
}
