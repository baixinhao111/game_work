import { PALETTE } from './palette';
import type { AffixId, SynergyId, WeaponId } from '../game/types';

export interface SynergyConfig {
  id: SynergyId;
  name: string;
  weapon: WeaponId;
  affix: AffixId;
  desc: string;
  color: string;
}

export const SYNERGIES: Record<SynergyId, SynergyConfig> = {
  superconduct: {
    id: 'superconduct',
    name: '超导冰咖清屏',
    weapon: 'americano',
    affix: 'chain_lightning',
    desc: '冰美式射线必触发高压电弧，跳数+2、电伤提升',
    color: PALETTE.mint
  },
  keyboard_rain: {
    id: 'keyboard_rain',
    name: '弹幕键盘雨',
    weapon: 'keyboard',
    affix: 'ricochet',
    desc: '键帽弹跳+2 且撞墙反弹回场内疯狂清潮',
    color: PALETTE.yellow
  },
  swarm_delivery: {
    id: 'swarm_delivery',
    name: '蜂群配送风暴',
    weapon: 'drone',
    affix: 'split',
    desc: '追踪外卖弹命中后分裂出两架小型追踪无人机',
    color: PALETTE.yellow
  },
  absolute_zero: {
    id: 'absolute_zero',
    name: '绝对零度静音区',
    weapon: 'headphone',
    affix: 'chill',
    desc: '声波环扩大35%且附带60%极限冷静减速',
    color: PALETTE.mint
  },
  gpt_overclock: {
    id: 'gpt_overclock',
    name: 'GPT 狂暴算力',
    weapon: 'ai_pod',
    affix: 'crit_rage',
    desc: '浮游炮暴击进入金色超频，射速+25%激光如雨',
    color: PALETTE.purple
  }
};

export const SYNERGY_LIST: SynergyConfig[] = Object.values(SYNERGIES);

export function computeActiveSynergies(
  weapon: WeaponId,
  affixes: Record<AffixId, number>
): SynergyId[] {
  const out: SynergyId[] = [];
  for (const cfg of SYNERGY_LIST) {
    if (cfg.weapon === weapon && (affixes[cfg.affix] ?? 0) > 0) {
      out.push(cfg.id);
    }
  }
  return out;
}

export function findSynergyForChoice(
  currentWeapon: WeaponId,
  affixes: Record<AffixId, number>,
  nextWeapon?: WeaponId,
  nextAffix?: AffixId
): SynergyConfig | null {
  const testWeapon = nextWeapon ?? currentWeapon;
  for (const cfg of SYNERGY_LIST) {
    const hasAffix = (affixes[cfg.affix] ?? 0) > 0 || cfg.affix === nextAffix;
    if (cfg.weapon === testWeapon && hasAffix) {
      const alreadyActive = cfg.weapon === currentWeapon && (affixes[cfg.affix] ?? 0) > 0;
      if (!alreadyActive) return cfg;
    }
  }
  return null;
}
