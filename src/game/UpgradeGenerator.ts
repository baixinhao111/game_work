import { CHARACTERS, getCharacter } from '../data/characters';
import { PALETTE } from '../data/palette';
import { findSynergyForChoice } from '../data/synergies';
import { AFFIXES, COMMON_AFFIXES, SIDEARM_MAX, WEAPONS } from '../data/weapons';
import type { AffixId, CharacterId, Sidearm, UpgradeOption, WeaponId } from './types';

/** 生成三选一时需要知道的本局构筑 */
export interface Loadout {
  character: CharacterId;
  activeWeapon: WeaponId;
  weaponLevel: number;
  sidearms: Sidearm[];
  affixes: Record<AffixId, number>;
}

/** 能出现在补给箱里的武器（扫帚是保洁阿姨专属，不进通用池） */
const WEAPON_POOL: WeaponId[] = ['stapler', 'keyboard', 'americano', 'drone', 'headphone', 'ai_pod'];
/** 通用词条最高叠到 3 级 */
const AFFIX_CAP = 3;

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

function synTitle(load: Loadout, weapon?: WeaponId, affix?: AffixId): string | undefined {
  const syn = findSynergyForChoice(load.activeWeapon, load.affixes, weapon, affix);
  return syn ? `激活「${syn.name}」` : undefined;
}

export function mainUpOption(load: Loadout): UpgradeOption | null {
  if (load.weaponLevel >= 3) return null;
  const w = WEAPONS[load.activeWeapon];
  const evolve = load.weaponLevel === 2;
  return {
    id: `main_${load.activeWeapon}_${load.weaponLevel + 1}`,
    kind: 'MAIN_UP',
    title: evolve ? `{i:sparkle} 进化 · ${w.evolvedName}` : `{i:sparkle} 主武器强化 · ${w.shortTag} Lv.2`,
    desc: evolve ? `${w.evolvedDesc}（Lv.3 质变）` : '伤害 +20%、射速 +10%，再强化一次就能进化',
    color: PALETTE.yellow
  };
}

export function swapOption(load: Loadout, weapon: WeaponId): UpgradeOption {
  const w = WEAPONS[weapon];
  return {
    id: `swap_${weapon}`,
    kind: 'WEAPON',
    title: `{i:swap} 换装 · ${w.name} [${w.traitBadge}]`,
    desc: load.affixes.jack_of_all > 0 ? `${w.desc}；旧武器变外挂继续开火` : w.desc,
    color: w.color,
    weaponId: weapon,
    synergyTitle: synTitle(load, weapon, undefined)
  };
}

export function sidearmOption(load: Loadout, weapon: WeaponId): UpgradeOption | null {
  const w = WEAPONS[weapon];
  const have = load.sidearms.find((s) => s.id === weapon);
  if (!have && load.sidearms.length >= SIDEARM_MAX) return null;
  if (have && have.level >= 3) return null;
  return {
    id: `side_${weapon}`,
    kind: 'SIDEARM',
    title: have ? `{i:magnet} 外挂升级 · ${w.shortTag} Lv.${have.level + 1}` : `{i:magnet} 外挂 · ${w.shortTag}`,
    desc: have ? '外挂火力 +25%' : `挂在小队两侧自动开火（约主武器 25% 火力）：${w.desc}`,
    color: w.color,
    weaponId: weapon
  };
}

export function affixOption(load: Loadout, a: AffixId): UpgradeOption {
  const cfg = AFFIXES[a];
  const owner = getCharacter(load.character).exclusive.indexOf(a) >= 0;
  const lv = load.affixes[a] || 0;
  return {
    id: `affix_${a}`,
    kind: 'AFFIX',
    exclusive: owner || undefined,
    title: owner ? `{i:star} 专属 · ${cfg.name}` : `词条 · ${cfg.name}${lv > 0 ? ` Lv.${lv + 1}` : ''}`,
    desc: cfg.desc,
    color: cfg.color,
    affixId: a,
    synergyTitle: synTitle(load, undefined, a)
  };
}

function boostOption(): UpgradeOption {
  return {
    id: 'boost',
    kind: 'SQUAD_BOOST',
    title: '{i:box} 摸鱼外援空投',
    desc: '小队人数 ×1.4 且立即回复 2 层摸鱼护盾',
    color: PALETTE.mint,
    squadMult: 1.4
  };
}

/** 按职业倾向加权抽通用词条；能凑出化学反应的权重 ×4 */
function weightedAffix(load: Loadout, exclude: Set<AffixId>): AffixId | null {
  const bias = getCharacter(load.character).affixBias;
  const pool: { a: AffixId; w: number }[] = [];
  for (const a of COMMON_AFFIXES) {
    if (exclude.has(a) || (load.affixes[a] || 0) >= AFFIX_CAP) continue;
    let w = bias[a] ?? 1;
    if (findSynergyForChoice(load.activeWeapon, load.affixes, undefined, a)) w *= 4;
    pool.push({ a, w });
  }
  const total = pool.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  for (const x of pool) {
    r -= x.w;
    if (r <= 0) return x.a;
  }
  return pool.length ? pool[pool.length - 1].a : null;
}

/**
 * 三选一（主线补给箱 / 无尽 Boss 后通用）：
 * - 关卡设计的奖励放第 1 张：武器 → 实习生是「换装」，专精角色是「外挂」或「主武器强化」；
 * - 其余从「主武器强化 / 外挂 / 加权词条 / 专属词条 / 外援」里补齐，优先能触发化学反应的牌。
 */
export function generateUpgrades(load: Loadout, designed: { weapon?: WeaponId; affix?: AffixId } = {}): UpgradeOption[] {
  const ch = getCharacter(load.character);
  const out: UpgradeOption[] = [];
  const key = (o: UpgradeOption) => `${o.kind}:${o.weaponId ?? ''}:${o.affixId ?? ''}`;
  const push = (o: UpgradeOption | null) => {
    if (o && out.length < 3 && !out.some((x) => key(x) === key(o) || (o.kind === 'MAIN_UP' && x.kind === 'MAIN_UP'))) out.push(o);
  };

  // 1. 关卡设计的奖励
  if (designed.weapon) {
    if (designed.weapon === load.activeWeapon) push(mainUpOption(load));
    else if (ch.mods.canSwapMain) push(swapOption(load, designed.weapon));
    else push(sidearmOption(load, designed.weapon) ?? mainUpOption(load));
  }
  if (designed.affix && (load.affixes[designed.affix] || 0) < AFFIX_CAP) push(affixOption(load, designed.affix));

  // 2. 候选池
  const cands: UpgradeOption[] = [];
  const main = mainUpOption(load);
  if (main && Math.random() < 0.75) cands.push(main);
  const ownExclusive = ch.exclusive.filter((a) => !(load.affixes[a] > 0));
  if (ownExclusive.length && Math.random() < 0.45) cands.push(affixOption(load, pick(ownExclusive)));
  const others = WEAPON_POOL.filter((w) => w !== load.activeWeapon);
  if (ch.mods.canSwapMain) {
    cands.push(swapOption(load, pick(others)));
  } else {
    const upgradable = load.sidearms.filter((s) => s.level < 3).map((s) => s.id);
    const fresh = load.sidearms.length < SIDEARM_MAX ? others.filter((w) => !load.sidearms.some((s) => s.id === w)) : [];
    const sw = fresh.length && (Math.random() < 0.6 || !upgradable.length) ? pick(fresh) : upgradable.length ? pick(upgradable) : null;
    if (sw) cands.push(sidearmOption(load, sw)!);
  }
  const used = new Set<AffixId>(out.map((o) => o.affixId!).filter(Boolean));
  for (let i = 0; i < 2; i++) {
    const a = weightedAffix(load, used);
    if (a) {
      used.add(a);
      cands.push(affixOption(load, a));
    }
  }
  if (Math.random() < 0.3) cands.push(boostOption());

  // 化学反应优先，其次随机
  cands.sort((a, b) => Number(Boolean(b.synergyTitle)) - Number(Boolean(a.synergyTitle)) || Math.random() - 0.5);
  for (const o of cands) push(o);
  if (out.length < 3) push(boostOption());
  return out.slice(0, 3);
}

/** 只给模拟器 / 测试用：所有角色 id */
export const ALL_CHARACTERS: CharacterId[] = CHARACTERS.map((c) => c.id);
