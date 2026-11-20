import type { TalentId } from '../game/types';

export interface TalentConfig {
  id: TalentId;
  icon: string;
  name: string;
  metaphor: string;
  maxLevel: number;
  describe: (level: number) => string;
}

export const TALENT_ORDER: TalentId[] = ['espresso', 'thick_skin', 'abacus', 'bonus'];

export const TALENTS: Record<TalentId, TalentConfig> = {
  espresso: {
    id: 'espresso',
    icon: '☕',
    name: '早八浓缩咖啡',
    metaphor: '开局先喝两口提神',
    maxLevel: 10,
    describe: (lv) => `开局人数 +${talentStartSquadBonus(lv)}`
  },
  thick_skin: {
    id: 'thick_skin',
    icon: '🛡️',
    name: '防弹厚脸皮',
    metaphor: '脸皮够厚，压力就追不上我',
    maxLevel: 10,
    describe: (lv) => `开局护盾 +${Math.floor(lv / 2)}，减员 -${lv * 4}%`
  },
  abacus: {
    id: 'abacus',
    icon: '🧮',
    name: '摸鱼算盘',
    metaphor: '用最低的精力打最响的算盘',
    maxLevel: 10,
    describe: (lv) => `全武器伤害 +${lv * 8}%`
  },
  bonus: {
    id: 'bonus',
    icon: '💰',
    name: '年终奖杠杆',
    metaphor: '摸鱼赚豆双倍快乐',
    maxLevel: 10,
    describe: (lv) => `咖啡豆收益 +${lv * 12}%`
  }
};

/** 单级费用：Cost(L) = 40 × 1.45^L */
export function talentCost(level: number): number {
  return Math.round(40 * Math.pow(1.45, level));
}

export function talentStartSquadBonus(level: number): number {
  return level + Math.floor(level / 2);
}

export interface TalentEffects {
  startSquadBonus: number;
  startShieldBonus: number;
  lossMult: number;
  damageMult: number;
  beanMult: number;
}

export function computeTalentEffects(t: Record<TalentId, number>): TalentEffects {
  return {
    startSquadBonus: talentStartSquadBonus(t.espresso),
    startShieldBonus: Math.floor(t.thick_skin / 2),
    lossMult: 1 - t.thick_skin * 0.04,
    damageMult: 1 + t.abacus * 0.08,
    beanMult: 1 + t.bonus * 0.12
  };
}
