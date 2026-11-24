import type { IconName } from '../ui/icons';
import type { GameState, SaveData } from '../game/types';
import { codexProgress } from './codex';
import { rankForXp, MAX_RANK } from './ranks';

export interface BadgeConfig {
  id: string;
  icon: IconName;
  name: string;
  desc: string;
}

export const BADGES: BadgeConfig[] = [
  {
    id: 'monday_survivor',
    icon: 'alarm',
    name: '早八突围者',
    desc: '击碎周一《早高峰地狱闹钟》准点下班'
  },
  {
    id: 'friday_master',
    icon: 'trophy',
    name: '周五毕业生',
    desc: '通关周五《17:59 终极 KPI 巨兽》全主线毕业'
  },
  {
    id: 'client_breaker',
    icon: 'stamp',
    name: '甲方驳回专家',
    desc: '单局射穿洗白至少 3 扇红门'
  },
  {
    id: 'hundred_squad',
    icon: 'squad',
    name: '百人摸鱼团长',
    desc: '单局小队规模突破 100 人'
  },
  {
    id: 'synergy_alchemist',
    icon: 'flask',
    name: '超频炼金术士',
    desc: '成功激活任意组「武器 × 词条化学反应」'
  },
  {
    id: 'endless_king',
    icon: 'moon',
    name: '周末无尽卷王',
    desc: '在「周末无尽加班」模式挺进第 3 波以上'
  },
  // ---- v1.0 新增 ----
  { id: 'coder_friday', icon: 'burst', name: '代码跑通了', desc: '用格子衫程序员通关周五' },
  { id: 'designer_friday', icon: 'wave', name: '终稿_final_v3', desc: '用改稿设计师通关周五' },
  { id: 'pm_friday', icon: 'chart', name: '需求已上线', desc: '用画饼产品经理通关周五' },
  { id: 'sales_friday', icon: 'hongbao', name: '年度销冠', desc: '用拉单销售通关周五' },
  { id: 'cleaner_friday', icon: 'shades', name: '扫地僧', desc: '用扫地僧保洁阿姨通关周五' },
  { id: 'cleaner_unlock', icon: 'sparkle', name: '打扫得特别干净', desc: '单局击退 1000 个需求，解锁隐藏同事' },
  { id: 'evolution', icon: 'star', name: '质变', desc: '第一次让主武器进化到 Lv.3' },
  { id: 'full_sidearm', icon: 'magnet', name: '外挂齐活', desc: '同时装满 2 个外挂副武器' },
  { id: 'untouched', icon: 'shield', name: '全身而退', desc: '通关一天，全程没有被撞掉一个人' },
  { id: 'overtime_3', icon: 'flame', name: '大小周战士', desc: '在加班强度 3 通关周五' },
  { id: 'overtime_5', icon: 'warning', name: '007 福报', desc: '在加班强度 5 通关周五' },
  { id: 'all_gold', icon: 'trophy', name: '卷王之王', desc: '6 位同事全部拿到金章' },
  { id: 'codex_half', icon: 'idcard', name: '职场百科', desc: '打工图鉴收集过半' },
  { id: 'rank_ceo', icon: 'person', name: '摸鱼 CEO', desc: '职级升到 CEO' }
];

export function evaluateNewBadges(state: GameState, save: SaveData, victory: boolean): string[] {
  const owned = new Set(save.unlockedBadges);
  const newly: string[] = [];

  const grant = (id: string) => {
    if (!owned.has(id)) {
      owned.add(id);
      newly.push(id);
    }
  };

  if (victory && !state.isEndless && state.levelDay >= 1) grant('monday_survivor');
  if (victory && !state.isEndless && state.levelDay >= 5) grant('friday_master');
  if (state.stats.gatesFlipped >= 3) grant('client_breaker');
  if (state.stats.maxSquad >= 100) grant('hundred_squad');
  if (state.synergies.length >= 1) grant('synergy_alchemist');
  if (state.isEndless && state.endlessWave >= 3) grant('endless_king');

  const friday = victory && !state.isEndless && state.levelDay >= 5;
  if (friday && state.character !== 'intern') grant(`${state.character}_friday`);
  if (state.stats.kills >= 1000) grant('cleaner_unlock');
  if (state.weaponLevel >= 3) grant('evolution');
  if (state.stats.maxSidearms >= 2) grant('full_sidearm');
  if (victory && !state.isEndless && state.stats.hitsTaken === 0) grant('untouched');
  if (friday && state.overtime >= 3) grant('overtime_3');
  if (friday && state.overtime >= 5) grant('overtime_5');
  if (Object.keys(save.overtime).every((k) => (save.overtime as Record<string, number>)[k] >= 5)) grant('all_gold');
  const cp = codexProgress(save);
  if (cp.have * 2 >= cp.total) grant('codex_half');
  if (rankForXp(save.xp) >= MAX_RANK) grant('rank_ceo');

  if (newly.length > 0) {
    save.unlockedBadges = Array.from(owned);
  }
  return newly;
}
