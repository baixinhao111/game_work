import type { IconName } from '../ui/icons';
import type { GameState, SaveData } from '../game/types';

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
  }
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

  if (newly.length > 0) {
    save.unlockedBadges = Array.from(owned);
  }
  return newly;
}
