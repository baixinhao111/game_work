import type { CharacterId, SaveData } from '../game/types';
import { rankForXp } from './ranks';

/** 加班强度：每个角色独立的难度阶梯（docs/07 §3.5，借鉴土豆兄弟的危险等级），规则逐级叠加 */
export interface OvertimeLevel {
  level: number;
  name: string;
  rule: string;
  /** 绩效经验 / 咖啡豆倍率 */
  reward: number;
}

export const OVERTIME_LEVELS: OvertimeLevel[] = [
  { level: 0, name: '正常上班', rule: '标准难度', reward: 1 },
  { level: 1, name: '偶尔加班',  rule: '怪物更耐打、尸潮更密', reward: 1.15 },
  { level: 2, name: '996', rule: '+ 每段多一扇红门', reward: 1.3 },
  { level: 3, name: '大小周', rule: '+ 精英提前出现、尸潮多一波', reward: 1.5 },
  { level: 4, name: '通宵上线', rule: '+ Boss 出招更快、更早红温', reward: 1.75 },
  { level: 5, name: '007', rule: '+ 开局人数减半', reward: 2.0 }
];

/** 每级的小怪 / Boss 血量倍率（逐级递增，满天赋的老手也要认真打） */
export const OVERTIME_ENEMY_HP = [1, 1.35, 1.6, 2.0, 2.5, 3.2];
export const OVERTIME_BOSS_HP = [1, 1.2, 1.4, 1.7, 2.1, 2.6];

/** 升到「主管」才开放加班强度 */
export const OVERTIME_UNLOCK_RANK = 3;

export function overtimeOf(save: SaveData, id: CharacterId): number {
  return Math.max(0, Math.min(5, save.overtime[id] || 0));
}

/** 该角色当前能选的最高强度：通关过的最高强度 + 1 */
export function maxOvertime(save: SaveData, id: CharacterId): number {
  if (rankForXp(save.xp) < OVERTIME_UNLOCK_RANK) return 0;
  return Math.min(5, overtimeOf(save, id) + 1);
}

export type Medal = 'none' | 'bronze' | 'silver' | 'gold';

/** 角色印章：通关强度 1 铜、3 银、5 金 */
export function medalOf(level: number): Medal {
  return level >= 5 ? 'gold' : level >= 3 ? 'silver' : level >= 1 ? 'bronze' : 'none';
}

export const MEDAL_NAME: Record<Medal, string> = { none: '', bronze: '铜章', silver: '银章', gold: '金章' };
