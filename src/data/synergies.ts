import { PALETTE } from './palette';
import type { AffixId, SynergyId, WeaponId } from '../game/types';

export interface SynergyConfig {
  id: SynergyId;
  name: string;
  /** 「武器 × 词条」反应填 weapon；「词条 × 词条」反应填 affix2 */
  weapon?: WeaponId;
  affix: AffixId;
  affix2?: AffixId;
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
  },
  mop_freeze: {
    id: 'mop_freeze',
    name: '拖地结冰',
    weapon: 'broom',
    affix: 'chill',
    desc: '扫帚扫过的地面结冰，敌人深度冻结且扇面更宽',
    color: PALETTE.mint
  },
  shatter_ice: {
    id: 'shatter_ice',
    name: '超导碎冰',
    affix: 'chill',
    affix2: 'chain_lightning',
    desc: '电弧打到被减速的敌人时伤害翻倍、必定连锁',
    color: PALETTE.mint
  },
  wildfire: {
    id: 'wildfire',
    name: '燎原',
    affix: 'overtime_burn',
    affix2: 'split',
    desc: '分裂弹继承燃烧，烧伤再提升 50%',
    color: PALETTE.red
  }
};

export const SYNERGY_LIST: SynergyConfig[] = Object.values(SYNERGIES);

export function computeActiveSynergies(
  weapon: WeaponId,
  affixes: Record<AffixId, number>
): SynergyId[] {
  const out: SynergyId[] = [];
  for (const cfg of SYNERGY_LIST) {
    const has1 = (affixes[cfg.affix] ?? 0) > 0;
    if (cfg.weapon ? cfg.weapon === weapon && has1 : has1 && (affixes[cfg.affix2!] ?? 0) > 0) {
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
  const have = (a: AffixId) => (affixes[a] ?? 0) > 0;
  for (const cfg of SYNERGY_LIST) {
    if (cfg.weapon) {
      const hasAffix = have(cfg.affix) || cfg.affix === nextAffix;
      if (cfg.weapon === testWeapon && hasAffix) {
        const alreadyActive = cfg.weapon === currentWeapon && have(cfg.affix);
        if (!alreadyActive) return cfg;
      }
    } else if (nextAffix && !(have(cfg.affix) && have(cfg.affix2!))) {
      // 词条 × 词条：这张牌补上缺的那一半
      if ((nextAffix === cfg.affix && have(cfg.affix2!)) || (nextAffix === cfg.affix2 && have(cfg.affix))) return cfg;
    }
  }
  return null;
}
