import { boss, box, crate, div, minus, moving, overload, pair, plus, seesaw, swarm, times, ult } from '../data/levels/dsl';
import { PALETTE } from '../data/palette';
import { findSynergyForChoice } from '../data/synergies';
import { AFFIXES, WEAPONS } from '../data/weapons';
import type { AffixId, BossId, LevelWaveConfig, UpgradeOption, WeaponId } from './types';

const BOSS_ROTATION: BossId[] = [
  'monday_alarm',
  'meeting_projector',
  'client_hydra',
  'p0_lava',
  'kpi_titan'
];

const WEAPON_POOL: WeaponId[] = ['keyboard', 'americano', 'drone', 'headphone', 'ai_pod'];
const AFFIX_POOL: AffixId[] = [
  'crit_rage',
  'split',
  'chill',
  'ricochet',
  'pierce',
  'chain_lightning',
  'kill_haste',
  'vamp_shield'
];

export const ENDLESS_WAVE_DURATION_SEC = 26;

export class EndlessDirector {
  static getBossForWave(waveNum: number): BossId {
    return BOSS_ROTATION[(waveNum - 1) % BOSS_ROTATION.length];
  }

  static generateWaveTimeline(waveNum: number): LevelWaveConfig[] {
    const hpScale = 1 + (waveNum - 1) * 0.32;
    const bossId = this.getBossForWave(waveNum);
    const leftOrRight: 'LEFT' | 'RIGHT' = waveNum % 2 === 1 ? 'LEFT' : 'RIGHT';
    const wPick = WEAPON_POOL[(waveNum - 1) % WEAPON_POOL.length];
    const aPick = AFFIX_POOL[(waveNum - 1) % AFFIX_POOL.length];

    const gateA =
      waveNum % 3 === 1
        ? pair(1.2, plus(8 + waveNum * 2), times(1.5))
        : waveNum % 3 === 2
          ? seesaw(1.2, 10 + waveNum * 2, 6, 14)
          : pair(1.2, overload(2.2, 4.2), plus(12 + waveNum * 2));

    const gateB =
      waveNum % 2 === 1
        ? moving(10.5, minus(10 + waveNum * 2, 14 + waveNum), 105)
        : pair(10.5, div(2, 16 + waveNum), plus(14 + waveNum * 2));

    return [
      gateA,
      swarm(3.5, 'overtime_zombie', Math.min(34, 16 + waveNum * 3), 'STAGGERED_HORDE', hpScale),
      crate(6.5, leftOrRight, 110 + waveNum * 35, { weapon: wPick }, WEAPONS[wPick].shortTag, plus(8 + waveNum)),
      swarm(9.0, waveNum % 2 === 0 ? 'ddl_flame' : 'cc_all', Math.min(16, 8 + waveNum), waveNum % 2 === 0 ? 'FLANK_S' : 'LINE', hpScale),
      gateB,
      swarm(13.5, 'client_tweak', Math.min(8, 3 + Math.floor(waveNum / 2)), 'WEDGE', hpScale),
      pair(16.2, box(), ult(45)),
      crate(19.0, leftOrRight === 'LEFT' ? 'RIGHT' : 'LEFT', 140 + waveNum * 40, { affix: aPick }, `词条:${AFFIXES[aPick].name}`, minus(10 + waveNum, 15)),
      swarm(21.5, 'ppt_pie', Math.min(5, 2 + Math.floor(waveNum / 2)), 'LINE', hpScale),
      swarm(22.5, 'overtime_zombie', Math.min(36, 18 + waveNum * 3), 'STAGGERED_HORDE', hpScale),
      boss(ENDLESS_WAVE_DURATION_SEC, bossId)
    ];
  }

  /**
   * 主线补给箱三选一：第 1 张固定是关卡设计的奖励（保持关卡节奏），
   * 其余从通用池里补齐，且尽量包含一张能凑成化学反应的牌。
   */
  static generateCrateUpgrades(
    activeWeapon: WeaponId,
    affixes: Record<AffixId, number>,
    designed: { weapon?: WeaponId; affix?: AffixId }
  ): UpgradeOption[] {
    const out: UpgradeOption[] = [];
    const weapon = designed.weapon && designed.weapon !== activeWeapon ? designed.weapon : undefined;
    const affix = designed.affix;
    if (weapon && affix) {
      const w = WEAPONS[weapon];
      const a = AFFIXES[affix];
      const syn = findSynergyForChoice(activeWeapon, affixes, weapon, affix);
      out.push({
        id: `crate_combo_${weapon}_${affix}`,
        kind: 'WEAPON',
        title: `换装+词条 · ${w.shortTag} + ${a.name}`,
        desc: `${w.desc}；${a.desc}`,
        color: w.color,
        weaponId: weapon,
        affixId: affix,
        synergyTitle: syn ? `激活「${syn.name}」` : undefined
      });
    } else if (weapon) {
      const w = WEAPONS[weapon];
      const syn = findSynergyForChoice(activeWeapon, affixes, weapon, undefined);
      out.push({
        id: `crate_w_${weapon}`,
        kind: 'WEAPON',
        title: `换装 · ${w.name} [${w.traitBadge}]`,
        desc: w.desc,
        color: w.color,
        weaponId: weapon,
        synergyTitle: syn ? `激活「${syn.name}」` : undefined
      });
    } else if (affix) {
      const a = AFFIXES[affix];
      const syn = findSynergyForChoice(activeWeapon, affixes, undefined, affix);
      out.push({
        id: `crate_a_${affix}`,
        kind: 'AFFIX',
        title: `词条 · ${a.name}`,
        desc: a.desc,
        color: a.color,
        affixId: affix,
        synergyTitle: syn ? `激活「${syn.name}」` : undefined
      });
    }

    const taken = (o: UpgradeOption) =>
      out.some((x) => (o.weaponId && x.weaponId === o.weaponId) || (o.affixId && x.affixId === o.affixId) || x.kind === o.kind && o.kind === 'SQUAD_BOOST');
    // 多抽几轮通用选项，优先放进能触发化学反应的
    const pool: UpgradeOption[] = [];
    for (let i = 0; i < 4; i++) pool.push(...this.generateUpgrades(activeWeapon, affixes));
    pool.sort((a, b) => Number(Boolean(b.synergyTitle)) - Number(Boolean(a.synergyTitle)));
    for (const o of pool) {
      if (out.length >= 3) break;
      if (!taken(o)) out.push({ ...o, id: `crate_${o.id}` });
    }
    return out;
  }

  static generateUpgrades(activeWeapon: WeaponId, affixes: Record<AffixId, number>): UpgradeOption[] {
    const options: UpgradeOption[] = [];

    // 1. 优先寻找能立即凑成化学反应的词条或武器
    const sortedAffixes = [...AFFIX_POOL].sort(() => Math.random() - 0.5);
    const synergyAffix = sortedAffixes.find((a) => findSynergyForChoice(activeWeapon, affixes, undefined, a) !== null);
    const chosenAffix1 = synergyAffix ?? sortedAffixes[0];
    const syn1 = findSynergyForChoice(activeWeapon, affixes, undefined, chosenAffix1);
    const a1Cfg = AFFIXES[chosenAffix1];
    options.push({
      id: `up_a_${chosenAffix1}`,
      kind: 'AFFIX',
      title: `词条 · ${a1Cfg.name}`,
      desc: a1Cfg.desc,
      color: a1Cfg.color,
      affixId: chosenAffix1,
      synergyTitle: syn1 ? `激活「${syn1.name}」` : undefined
    });

    // 2. 武器卡（不同当前主武器的随机一把）
    const otherWeapons = WEAPON_POOL.filter((w) => w !== activeWeapon);
    const chosenWeapon = otherWeapons[Math.floor(Math.random() * otherWeapons.length)];
    const syn2 = findSynergyForChoice(activeWeapon, affixes, chosenWeapon, undefined);
    const wCfg = WEAPONS[chosenWeapon];
    options.push({
      id: `up_w_${chosenWeapon}`,
      kind: 'WEAPON',
      title: `换装 · ${wCfg.name} [${wCfg.traitBadge}]`,
      desc: wCfg.desc,
      color: wCfg.color,
      weaponId: chosenWeapon,
      synergyTitle: syn2 ? `激活「${syn2.name}」` : undefined
    });

    // 3. 第二个词条或扩军护盾包
    const chosenAffix2 = sortedAffixes.find((a) => a !== chosenAffix1) ?? sortedAffixes[1];
    if (Math.random() < 0.55) {
      const syn3 = findSynergyForChoice(activeWeapon, affixes, undefined, chosenAffix2);
      const a2Cfg = AFFIXES[chosenAffix2];
      options.push({
        id: `up_a2_${chosenAffix2}`,
        kind: 'AFFIX',
        title: `词条 · ${a2Cfg.name}`,
        desc: a2Cfg.desc,
        color: a2Cfg.color,
        affixId: chosenAffix2,
        synergyTitle: syn3 ? `激活「${syn3.name}」` : undefined
      });
    } else {
      options.push({
        id: 'up_boost',
        kind: 'SQUAD_BOOST',
        title: '摸鱼外援空投',
        desc: '小队人数 ×1.4 且立即回复 2 层摸鱼护盾',
        color: PALETTE.mint,
        squadMult: 1.4
      });
    }

    return options;
  }
}
