import type { IconName } from '../ui/icons';
import type { AffixId, CharacterId, SaveData, WeaponId } from '../game/types';
import { rankForXp } from './ranks';

/** 角色带进一局的数值修正（被动的优势与代价，docs/06 §1.2） */
export interface CharacterMods {
  /** 能否在局内换主武器（只有实习生能） */
  canSwapMain: boolean;
  startShield: number;
  startSquad: number;
  damageMult: number;
  fireRateMult: number;
  /** 蓝门（+ / ×）人数收益倍率 */
  blueGateMult: number;
  beanMult: number;
  critBonus: number;
  /** 子弹自带减速秒数（设计师） */
  baseChill: number;
  /** 弹射 / 分裂弹伤害倍率（程序员） */
  bounceDamageMult: number;
  /** 小怪撞上小队时被直接扫掉、不减员的概率（保洁阿姨） */
  sweepChance: number;
  /** 自带的弹射次数（程序员；不算词条，不触发化学反应） */
  baseBounces: number;
  /** 大招充能速度（控场 / 保命型大招充得慢） */
  ultChargeMult: number;
}

export type UltKind = 'clear_double' | 'drop_db' | 'freeze' | 'big_pie' | 'rush' | 'sweep_all';

export interface CharacterConfig {
  id: CharacterId;
  name: string;
  /** 一句话定位 */
  role: string;
  icon: IconName;
  color: string;
  weapon: WeaponId;
  weaponName: string;
  passiveName: string;
  passiveDesc: string;
  ultName: string;
  ultDesc: string;
  ult: UltKind;
  /** 大招印章副标题 */
  ultStampSub: string;
  mods: CharacterMods;
  /** 通用词条的抽取权重（默认 1） */
  affixBias: Partial<Record<AffixId, number>>;
  exclusive: [AffixId, AffixId];
  unlock: { rank: number } | { kills: number };
  unlockHint: string;
}

/** 隐藏角色：单局击杀数门槛 */
export const CLEANER_KILLS = 1000;

const BASE: CharacterMods = {
  canSwapMain: false,
  startShield: 0,
  startSquad: 0,
  damageMult: 1,
  fireRateMult: 1,
  blueGateMult: 1,
  beanMult: 1,
  critBonus: 0,
  baseChill: 0,
  bounceDamageMult: 1,
  sweepChance: 0,
  baseBounces: 0,
  ultChargeMult: 1
};

export const CHARACTERS: CharacterConfig[] = [
  {
    id: 'intern', name: '摸鱼实习生', role: '通才 · 局内可换主武器', icon: 'person', color: '#FFE600',
    weapon: 'stapler', weaponName: '订书机速射',
    passiveName: '新人光环', passiveDesc: '开局多 1 层护盾；补给箱可以随时换主武器',
    ultName: '准点下班', ultDesc: '清屏，并在 3.5 秒内火力翻倍', ult: 'clear_double', ultStampSub: '已 读 不 回 · 全 屏 清 空',
    mods: { ...BASE, canSwapMain: true, startShield: 1 },
    affixBias: {}, exclusive: ['jack_of_all', 'regularize'],
    unlock: { rank: 1 }, unlockHint: '默认'
  },
  {
    id: 'coder', name: '格子衫程序员', role: '弹射流 · 键盘霰弹', icon: 'person', color: '#00F5D4',
    weapon: 'keyboard', weaponName: '机械键盘霰弹',
    passiveName: '递归思维', passiveDesc: '子弹自带 1 次弹射，弹射 / 分裂伤害 +25% · 代价：蓝门人数 -10%',
    ultName: '删库跑路', ultDesc: '清屏，并把场上所有红门直接洗白成蓝门', ult: 'drop_db', ultStampSub: 'rm -rf / · 红 门 全 洗 白',
    mods: { ...BASE, bounceDamageMult: 1.25, blueGateMult: 0.9, baseBounces: 1 },
    affixBias: { ricochet: 3, split: 3, chain_lightning: 1.5 }, exclusive: ['stack_overflow', 'ctrl_cv'],
    unlock: { rank: 2 }, unlockHint: '升职到「专员」解锁'
  },
  {
    id: 'designer', name: '改稿设计师', role: '控场流 · 声波冰冻', icon: 'person', color: '#9B5DE5',
    weapon: 'headphone', weaponName: '降噪耳机声波环',
    passiveName: '审美降压', passiveDesc: '所有子弹自带轻度减速 · 代价：伤害 -25%',
    ultName: '五彩斑斓黑', ultDesc: '时间冻结 3 秒（敌人和 Boss 弹幕定格），期间伤害 ×1.5', ult: 'freeze', ultStampSub: '时 间 冻 结 · 慢 慢 改',
    mods: { ...BASE, baseChill: 0.6, damageMult: 0.75, ultChargeMult: 0.65 },
    affixBias: { chill: 3, pierce: 2, chain_lightning: 1.5 }, exclusive: ['premium_gray', 'pixel_align'],
    unlock: { rank: 3 }, unlockHint: '升职到「主管」解锁'
  },
  {
    id: 'pm', name: '画饼产品经理', role: '成长流 · 无人机', icon: 'person', color: '#FF7A3D',
    weapon: 'drone', weaponName: '外卖无人机追踪弹',
    passiveName: '需求放大', passiveDesc: '「+」蓝门人数 +15% · 代价：射速 -10%',
    ultName: '画大饼', ultDesc: '接下来 2 扇「+」蓝门人数再 +30%，并画饼充饥 1.5 秒无敌', ult: 'big_pie', ultStampSub: '饼 已 画 好 · 人 马 到 位',
    mods: { ...BASE, blueGateMult: 1.15, fireRateMult: 0.9, ultChargeMult: 0.7 },
    affixBias: { split: 3, sick_leave: 2, kill_haste: 1.5 }, exclusive: ['scope_creep', 'prd_rush'],
    unlock: { rank: 4 }, unlockHint: '升职到「经理」解锁'
  },
  {
    id: 'sales', name: '拉单销售', role: '爆发流 · 暴击浮游炮', icon: 'person', color: '#FFC93C',
    weapon: 'ai_pod', weaponName: 'AI 外挂浮游炮',
    passiveName: '提成到手', passiveDesc: '咖啡豆 +30%、暴击率 +10% · 代价：开局少 3 人',
    ultName: '冲业绩', ultDesc: '6 秒内射速 ×2.5 且必定暴击', ult: 'rush', ultStampSub: '本 月 业 绩 · 冲 冲 冲',
    mods: { ...BASE, beanMult: 1.3, critBonus: 0.1, startSquad: -3 },
    affixBias: { crit_rage: 3, kill_haste: 3, overtime_burn: 1.5 }, exclusive: ['big_client', 'double_commission'],
    unlock: { rank: 5 }, unlockHint: '升职到「总监」解锁'
  },
  {
    id: 'cleaner', name: '扫地僧保洁阿姨', role: '隐藏 · 近身横扫', icon: 'person', color: '#C68B59',
    weapon: 'broom', weaponName: '扫帚旋风',
    passiveName: '扫帚横扫', passiveDesc: '小怪撞上小队时 30% 被直接扫掉、不减员 · 代价：扫帚射程短',
    ultName: '全部清走', ultDesc: '清屏、清空 Boss 弹幕，地上的墨渍全部变成咖啡豆', ult: 'sweep_all', ultStampSub: '地 板 已 拖 · 请 绕 行',
    mods: { ...BASE, sweepChance: 0.3, ultChargeMult: 0.85 },
    affixBias: { chill: 3, vamp_shield: 2, sick_leave: 2 }, exclusive: ['floor_wax', 'trash_sort'],
    unlock: { kills: CLEANER_KILLS }, unlockHint: '????：某一局打扫得特别干净'
  }
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

/** 这张词条是谁的专属（通用词条返回 null） */
export function exclusiveOwner(a: AffixId): CharacterId | null {
  for (const c of CHARACTERS) if (c.exclusive.indexOf(a) >= 0) return c.id;
  return null;
}
