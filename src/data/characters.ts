import type { IconName } from '../ui/icons';
import type { CharacterId, SaveData, WeaponId } from '../game/types';
import { rankForXp } from './ranks';

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  /** 一句话定位 */
  role: string;
  icon: IconName;
  color: string;
  /** 专属主武器（保洁阿姨的扫帚在 S2 新增，暂以订书机占位） */
  weapon: WeaponId;
  weaponName: string;
  ultName: string;
  /** 解锁条件：职级或隐藏挑战 */
  unlock: { rank: number } | { kills: number };
  unlockHint: string;
}

/** 隐藏角色：单局击杀数门槛 */
export const CLEANER_KILLS = 1000;

export const CHARACTERS: CharacterConfig[] = [
  { id: 'intern', name: '摸鱼实习生', role: '通才 · 局内可换主武器', icon: 'person', color: '#FFE600', weapon: 'stapler', weaponName: '订书机速射', ultName: '准点下班', unlock: { rank: 1 }, unlockHint: '默认' },
  { id: 'coder', name: '格子衫程序员', role: '弹射流 · 键盘霰弹', icon: 'person', color: '#00F5D4', weapon: 'keyboard', weaponName: '机械键盘霰弹', ultName: '删库跑路', unlock: { rank: 2 }, unlockHint: '升职到「专员」解锁' },
  { id: 'designer', name: '改稿设计师', role: '控场流 · 声波冰冻', icon: 'person', color: '#9B5DE5', weapon: 'headphone', weaponName: '降噪耳机声波环', ultName: '五彩斑斓黑', unlock: { rank: 3 }, unlockHint: '升职到「主管」解锁' },
  { id: 'pm', name: '画饼产品经理', role: '成长流 · 无人机', icon: 'person', color: '#FF7A3D', weapon: 'drone', weaponName: '外卖无人机追踪弹', ultName: '画大饼', unlock: { rank: 4 }, unlockHint: '升职到「经理」解锁' },
  { id: 'sales', name: '拉单销售', role: '爆发流 · 暴击浮游炮', icon: 'person', color: '#FFC93C', weapon: 'ai_pod', weaponName: 'AI 外挂浮游炮', ultName: '冲业绩', unlock: { rank: 5 }, unlockHint: '升职到「总监」解锁' },
  { id: 'cleaner', name: '扫地僧保洁阿姨', role: '隐藏 · 横扫一切', icon: 'person', color: '#C68B59', weapon: 'stapler', weaponName: '扫帚旋风', ultName: '全部清走', unlock: { kills: CLEANER_KILLS }, unlockHint: '????：某一局打扫得特别干净' }
];

export function getCharacter(id: CharacterId): CharacterConfig {
  return CHARACTERS.find((c) => c.id === id) ?? CHARACTERS[0];
}

export function isCharacterUnlocked(c: CharacterConfig, save: SaveData): boolean {
  if ('rank' in c.unlock) return rankForXp(save.xp) >= c.unlock.rank;
  return save.bestKills >= c.unlock.kills;
}

/** 下一位还没解锁、靠升职获得的同事（菜单提示用） */
export function nextRankUnlock(save: SaveData): CharacterConfig | null {
  const rank = rankForXp(save.xp);
  for (const c of CHARACTERS) {
    if ('rank' in c.unlock && c.unlock.rank > rank) return c;
  }
  return null;
}
