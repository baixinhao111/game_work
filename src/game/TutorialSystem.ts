import { PLAYER_Y, projectX } from '../engine/Viewport';
import type { GameWorld } from './GameWorld';
import type { Gate } from './types';

export type TutorialTipId = 'drag' | 'gate' | 'crate' | 'red' | 'ult';

export interface TutorialTip {
  id: TutorialTipId;
  /** 支持 {i:名称} 图标标记 */
  text: string;
  /** 箭头指向的位置（设计坐标）；drag 提示不需要 */
  anchorX: number;
  anchorY: number;
  age: number;
}

/** 大招按钮在设计坐标里的大致位置（DOM 按钮，右下角） */
const ULT_BUTTON = { x: 302, y: 804 };
const DRAG_DONE_DISTANCE = 110;

/**
 * 首局新手引导：观察战局，在每个新机制第一次出现时弹一张贴纸提示。
 * 同一时间只显示一条，每条只出现一次；不暂停游戏，玩家照做后自动收起。
 */
export class TutorialSystem {
  active = false;
  tip: TutorialTip | null = null;
  private shown = new Set<TutorialTipId>();
  private dragAccum = 0;
  private lastTargetX = 0;
  private gateRef: Gate | null = null;
  private gateUid = -1;

  start(world: GameWorld): void {
    this.active = true;
    this.tip = null;
    this.shown.clear();
    this.dragAccum = 0;
    this.lastTargetX = world.squad.targetLaneX;
    this.gateRef = null;
  }

  stop(): void {
    this.active = false;
    this.tip = null;
  }

  update(dt: number, world: GameWorld): void {
    if (!this.active) return;
    const tx = world.squad.targetLaneX;
    this.dragAccum += Math.abs(tx - this.lastTargetX);
    this.lastTargetX = tx;

    if (this.tip) {
      this.tip.age += dt;
      this.refreshAnchor(world);
      if (this.isDone(world)) {
        this.shown.add(this.tip.id);
        this.tip = null;
      }
      return;
    }
    this.tip = this.nextTip(world);
  }

  private isDone(world: GameWorld): boolean {
    const tip = this.tip!;
    const st = world.state;
    const g = this.gateRef;
    const gateGone = !g || !g.active || g.uid !== this.gateUid || g.pairLocked;
    switch (tip.id) {
      case 'drag':
        return this.dragAccum >= DRAG_DONE_DISTANCE || tip.age > 9;
      case 'gate':
        return gateGone || g!.y > PLAYER_Y - 8;
      case 'crate':
        return gateGone || g!.y > PLAYER_Y + 10;
      case 'red':
        return gateGone || g!.flippedToBlue || g!.y > PLAYER_Y - 8;
      case 'ult':
        return st.ultCharge < 100 || tip.age > 7;
    }
  }

  private refreshAnchor(world: GameWorld): void {
    const tip = this.tip!;
    if (tip.id === 'drag' || tip.id === 'ult') return;
    const g = this.gateRef;
    if (g && g.active) {
      tip.anchorX = projectX(g.laneX, g.y);
      tip.anchorY = g.y;
    }
    void world;
  }

  private pickGate(g: Gate, id: TutorialTipId, text: string): TutorialTip {
    this.gateRef = g;
    this.gateUid = g.uid;
    return { id, text, anchorX: projectX(g.laneX, g.y), anchorY: g.y, age: 0 };
  }

  private nextTip(world: GameWorld): TutorialTip | null {
    const st = world.state;
    if (!this.shown.has('drag') && st.elapsedSec > 0.3) {
      return { id: 'drag', text: '{i:hand} 按住屏幕 左右拖动', anchorX: 0, anchorY: 0, age: 0 };
    }
    if (!this.shown.has('ult') && st.ultCharge >= 100) {
      return { id: 'ult', text: '大招满了！点右下角 准点下班', anchorX: ULT_BUTTON.x, anchorY: ULT_BUTTON.y, age: 0 };
    }

    const gates = world.gates.pool.activeItems;
    for (let i = 0; i < gates.length; i++) {
      const g = gates[i];
      if (!g.active || g.pairLocked || g.y < 230 || g.y > PLAYER_Y - 120) continue;

      if (!this.shown.has('crate') && g.kind === 'SUPPLY_CRATE') {
        return this.pickGate(g, 'crate', '{i:target} 对准空投箱开火 打爆三选一');
      }
      const red = g.shootableToFlip && (g.op === '-' || g.op === '÷') && !g.flippedToBlue;
      if (!this.shown.has('red') && red) {
        return this.pickGate(g, 'red', '{i:target} 红门别躲！站到下面狂射洗白');
      }
      if (!this.shown.has('gate') && (g.op === '+' || g.op === '×')) {
        // 找同排更划算的那扇门
        let best = g;
        let bestVal = -Infinity;
        for (let j = 0; j < gates.length; j++) {
          const o = gates[j];
          if (!o.active || o.pairGroupId !== g.pairGroupId) continue;
          const v = o.op === '+' ? o.value : o.op === '×' ? st.squadCount * (o.value - 1) : -o.value;
          if (v > bestVal) {
            bestVal = v;
            best = o;
          }
        }
        return this.pickGate(best, 'gate', '选数字大的门！人数直接涨');
      }
    }
    return null;
  }
}
