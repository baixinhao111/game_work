import type { IconName } from '../ui/icons';
import type { SaveData } from '../game/types';
import { CHARACTERS, isCharacterUnlocked } from './characters';
import { BOSSES, ENEMIES } from './enemies';
import { SYNERGY_LIST } from './synergies';
import { AFFIXES, WEAPONS } from './weapons';

/** 打工图鉴（docs/07 §3.6）：首次遇到 / 获得时点亮，没发现的显示剪影和「????」 */
export type CodexTab = 'char' | 'foe' | 'gear' | 'skill' | 'combo';

export interface CodexEntry {
  key: string;
  tab: CodexTab;
  name: string;
  desc: string;
  icon: IconName;
  /** 图鉴里的贴图（相对 assets/sprites） */
  img?: string;
  /** 未发现时的提示（化学反应给半个配方） */
  hint?: string;
}

export const CODEX_TABS: { id: CodexTab; name: string }[] = [
  { id: 'char', name: '同事' },
  { id: 'foe', name: '牛马克星' },
  { id: 'gear', name: '工位装备' },
  { id: 'skill', name: '职场技能' },
  { id: 'combo', name: '化学反应' }
];

/** 新发现一条图鉴奖励的绩效经验 */
export const CODEX_XP = 5;

const ENEMY_IMG: Partial<Record<string, string>> = {
  overtime_zombie: 'enemy_zombie.webp',
  cc_all: 'enemy_mail_imp.webp',
  client_tweak: 'enemy_client_monster.webp',
  client_mini: 'enemy_client_monster.webp',
  ppt_pie: 'enemy_ppt_golem.webp',
  ddl_flame: 'enemy_ddl_flame.webp'
};
const BOSS_IMG: Record<string, string> = {
  alarm: 'boss_alarm.webp',
  projector: 'boss_projector.webp',
  hydra: 'boss_hydra.webp',
  server: 'boss_server.webp',
  kpi: 'boss_kpi.webp'
};

export const CODEX: CodexEntry[] = [
  ...CHARACTERS.map((c) => ({ key: `c:${c.id}`, tab: 'char' as const, name: c.name, desc: `${c.passiveName}：${c.passiveDesc}`, icon: c.icon, img: `face_${c.id}.webp`, hint: c.unlockHint })),
  ...Object.values(ENEMIES).map((e) => ({ key: `e:${e.id}`, tab: 'foe' as const, name: e.name, desc: `血量 ${e.hp} · 撞上小队 -${e.damageToSquad} 人`, icon: 'anger' as IconName, img: ENEMY_IMG[e.id] })),
  ...Object.entries(BOSSES).map(([id, b]) => ({ key: `b:${id}`, tab: 'foe' as const, name: b.name, desc: b.subtitle, icon: 'warning' as IconName, img: BOSS_IMG[b.style] })),
  ...Object.values(WEAPONS).map((w) => ({ key: `w:${w.id}`, tab: 'gear' as const, name: w.name, desc: w.desc, icon: 'target' as IconName })),
  ...Object.values(WEAPONS).map((w) => ({ key: `v:${w.id}`, tab: 'gear' as const, name: `进化 · ${w.evolvedName}`, desc: w.evolvedDesc, icon: 'star' as IconName, hint: `${w.shortTag}强化到 Lv.3` })),
  ...Object.values(AFFIXES).map((a) => ({ key: `a:${a.id}`, tab: 'skill' as const, name: a.name, desc: a.desc, icon: 'sparkle' as IconName })),
  ...SYNERGY_LIST.map((s) => ({
    key: `s:${s.id}`,
    tab: 'combo' as const,
    name: s.name,
    desc: s.desc,
    icon: 'flask' as IconName,
    hint: s.weapon ? `${WEAPONS[s.weapon].shortTag} + ？？？` : `${AFFIXES[s.affix].name} + ？？？`
  }))
];

/** 角色条目由解锁状态决定，其余看存档里的发现记录 */
export function isDiscovered(e: CodexEntry, save: SaveData): boolean {
  if (e.tab === 'char') {
    const c = CHARACTERS.find((x) => `c:${x.id}` === e.key);
    return !!c && isCharacterUnlocked(c, save);
  }
  return save.codex.indexOf(e.key) >= 0;
}

export function codexProgress(save: SaveData): { have: number; total: number } {
  let have = 0;
  for (const e of CODEX) if (isDiscovered(e, save)) have++;
  return { have, total: CODEX.length };
}
