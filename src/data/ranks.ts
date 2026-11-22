import type { CharacterId, GameState, RunXpResult, SaveData, XpLine } from '../game/types';
import { LEVELS } from './levels';

export interface RankConfig {
  /** 1 起 */
  level: number;
  title: string;
  /** 达到该职级所需的累计经验 */
  xp: number;
  /** 升到该职级时的奖励说明（升职卡片上展示） */
  reward: string;
  /** 升到该职级时解锁的角色 */
  unlocks?: CharacterId;
  /** 工牌边框颜色 */
  frame: string;
}

export const RANKS: RankConfig[] = [
  { level: 1, title: '实习生', xp: 0, reward: '入职报到', unlocks: 'intern', frame: '#F8F7F2' },
  { level: 2, title: '专员', xp: 150, reward: '新同事：格子衫程序员', unlocks: 'coder', frame: '#00F5D4' },
  { level: 3, title: '主管', xp: 1200, reward: '新同事：改稿设计师 · 工牌升级银边 · 开放加班强度', unlocks: 'designer', frame: '#C9D2E3' },
  { level: 4, title: '经理', xp: 2800, reward: '新同事：画饼产品经理', unlocks: 'pm', frame: '#9B5DE5' },
  { level: 5, title: '总监', xp: 5500, reward: '新同事：拉单销售 · 工牌升级金边', unlocks: 'sales', frame: '#FFC93C' },
  { level: 6, title: '副总裁', xp: 8000, reward: '战报称号「副总裁亲自摸鱼」', frame: '#FF7A3D' },
  { level: 7, title: 'CEO', xp: 11000, reward: '全局咖啡豆 +10% · 战报彩色封面', frame: '#FF3366' }
];

export const MAX_RANK = RANKS.length;

/** 累计经验 → 职级（1 起） */
export function rankForXp(xp: number): number {
  let lv = 1;
  for (const r of RANKS) if (xp >= r.xp) lv = r.level;
  return lv;
}

/** 当前职级内的进度：已得 / 所需（满级时 need = 0） */
export function rankProgress(xp: number): { rank: RankConfig; next: RankConfig | null; have: number; need: number; ratio: number } {
  const lv = rankForXp(xp);
  const rank = RANKS[lv - 1];
  const next = lv < MAX_RANK ? RANKS[lv] : null;
  if (!next) return { rank, next, have: xp - rank.xp, need: 0, ratio: 1 };
  const have = xp - rank.xp;
  const need = next.xp - rank.xp;
  return { rank, next, have, need, ratio: Math.min(1, have / need) };
}

/**
 * 一局的绩效经验（docs/06 §2.1）：输了也一定涨经验。
 * - 进度百分比 × 60；击杀每 20 只 +1；击败 Boss +40；通关 +30；首次通关某一天 +80；无尽每过 1 波 +25
 */
export function computeRunXp(state: GameState, victory: boolean, firstClear: boolean): XpLine[] {
  const lines: XpLine[] = [];
  if (state.isEndless) {
    const waves = Math.max(0, state.endlessWave - 1);
    if (waves > 0) lines.push({ label: `熬过 ${waves} 波加班`, xp: waves * 25 });
    const p = Math.min(1, state.elapsedSec / Math.max(1, state.trackDurationSec));
    const part = Math.round(p * 30);
    if (part > 0) lines.push({ label: '最后一波进度', xp: part });
  } else {
    const p = victory ? 1 : Math.min(1, state.elapsedSec / Math.max(1, state.trackDurationSec));
    const prog = Math.round(p * 60);
    if (prog > 0) lines.push({ label: `关卡进度 ${Math.round(p * 100)}%`, xp: prog });
    if (victory) {
      lines.push({ label: '击败 Boss', xp: 40 });
      lines.push({ label: '准点下班', xp: 30 });
      if (firstClear) lines.push({ label: `首次通关${LEVELS[state.levelDay - 1].weekday}`, xp: 80 });
    }
  }
  const killXp = Math.floor(state.stats.kills / 20);
  if (killXp > 0) lines.push({ label: `击退 ${state.stats.kills} 个需求`, xp: killXp });
  return lines;
}

export function applyRunXp(save: SaveData, lines: XpLine[]): RunXpResult {
  const total = lines.reduce((a, l) => a + l.xp, 0);
  const xpBefore = save.xp;
  const xpAfter = xpBefore + total;
  save.xp = xpAfter;
  return { lines, total, xpBefore, xpAfter, rankBefore: rankForXp(xpBefore), rankAfter: rankForXp(xpAfter) };
}

/** v3 老存档折算初始经验：按通关天数、通关次数与无尽纪录一次性补发 */
export function backfillXp(highestCleared: number, totalClears: number, endlessBestWave: number): number {
  return highestCleared * 80 + totalClears * 150 + Math.max(0, endlessBestWave - 1) * 25;
}
