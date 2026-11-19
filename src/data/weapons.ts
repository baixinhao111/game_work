import { PALETTE } from './palette';
import type { AffixConfig, AffixId, WeaponConfig, WeaponId } from '../game/types';

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  stapler: {
    id: 'stapler',
    name: '订书机速射',
    shortTag: '订书机',
    damageMultiplier: 1.0,
    fireRatePerSec: 7.5,
    projectileSpeed: 640,
    basePierce: 1,
    pellets: 1,
    spreadRad: 0.03,
    color: PALETTE.paper
  },
  keyboard: {
    id: 'keyboard',
    name: '机械键盘霰弹',
    shortTag: '键盘霰弹',
    damageMultiplier: 0.62,
    fireRatePerSec: 2.35,
    projectileSpeed: 560,
    basePierce: 1,
    pellets: 5,
    spreadRad: 0.36,
    color: PALETTE.yellow
  },
  americano: {
    id: 'americano',
    name: '冰美式穿透射线',
    shortTag: '冰美式射线',
    damageMultiplier: 1.75,
    fireRatePerSec: 3.4,
    projectileSpeed: 760,
    basePierce: 3,
    pellets: 1,
    spreadRad: 0.015,
    color: PALETTE.coffee
  },
  // 以下为 M3 预留武器原型，接口已完成对齐
  drone: {
    id: 'drone',
    name: '外卖无人机追踪弹',
    shortTag: '追踪外卖',
    damageMultiplier: 1.25,
    fireRatePerSec: 4.5,
    projectileSpeed: 540,
    basePierce: 1,
    pellets: 1,
    spreadRad: 0.05,
    color: PALETTE.yellow
  },
  headphone: {
    id: 'headphone',
    name: '降噪耳机声波环',
    shortTag: '声波脉冲',
    damageMultiplier: 1.4,
    fireRatePerSec: 2.0,
    projectileSpeed: 480,
    basePierce: 4,
    pellets: 1,
    spreadRad: 0,
    color: PALETTE.mint
  },
  ai_pod: {
    id: 'ai_pod',
    name: 'AI 外挂浮游炮',
    shortTag: 'AI 浮游炮',
    damageMultiplier: 0.85,
    fireRatePerSec: 6.0,
    projectileSpeed: 680,
    basePierce: 1,
    pellets: 2,
    spreadRad: 0.08,
    color: PALETTE.purple
  }
};

export const AFFIXES: Record<AffixId, AffixConfig> = {
  crit_rage: {
    id: 'crit_rage',
    name: '键盘侠暴走',
    desc: '22% 暴击率，造成 2.2 倍红温爆伤',
    color: PALETTE.yellow
  },
  split: {
    id: 'split',
    name: '复制粘贴',
    desc: '命中目标后左右分裂 2 发弹幕',
    color: PALETTE.mint
  },
  chill: {
    id: 'chill',
    name: '冰镇降压',
    desc: '命中后使目标冷静减速 35%',
    color: PALETTE.coffee
  },
  ricochet: {
    id: 'ricochet',
    name: '甩锅弹射',
    desc: '命中后弹跳至附近目标',
    color: PALETTE.purple
  },
  pierce: {
    id: 'pierce',
    name: '带薪穿刺',
    desc: '全部弹幕额外 +2 穿透',
    color: PALETTE.paper
  },
  chain_lightning: {
    id: 'chain_lightning',
    name: '高压电弧',
    desc: '命中触发连锁电击',
    color: PALETTE.purple
  },
  kill_haste: {
    id: 'kill_haste',
    name: '越摸越顺',
    desc: '击杀持续提升射速',
    color: PALETTE.mint
  },
  vamp_shield: {
    id: 'vamp_shield',
    name: '防弹摸鱼盾',
    desc: '击杀回复摸鱼护盾',
    color: PALETTE.mint
  }
};
