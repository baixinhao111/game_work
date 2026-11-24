import { PALETTE } from './palette';
import type { AffixConfig, AffixId, WeaponConfig, WeaponId } from '../game/types';

export const WEAPONS: Record<WeaponId, WeaponConfig> = {
  stapler: {
    id: 'stapler',
    evolvedName: '工业钉枪',
    evolvedDesc: '钉子 +2 穿透，伤害与射速大幅提升',
    desc: '均衡直线速射，穿透 1',
    name: '订书机速射',
    shortTag: '订书机',
    traitBadge: '{i:arrow}直线',
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
    evolvedName: 'RGB 光轴风暴',
    evolvedDesc: '键帽 5 → 7 发，RGB 跑马灯配色',
    desc: '5 发扇形键帽（无追踪），专治密集尸潮',
    name: '机械键盘霰弹',
    shortTag: '键盘霰弹',
    traitBadge: '{i:burst}散弹',
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
    evolvedName: '液氮冷萃',
    evolvedDesc: '射线变粗，命中附带冷冻减速',
    desc: '高伤直线射线，一次扎穿 3 个目标',
    name: '冰美式穿透射线',
    shortTag: '冰美式',
    traitBadge: '{i:bolt}穿透',
    damageMultiplier: 1.75,
    fireRatePerSec: 3.4,
    projectileSpeed: 760,
    basePierce: 3,
    pellets: 1,
    spreadRad: 0.015,
    color: PALETTE.coffee
  },
  drone: {
    id: 'drone',
    evolvedName: '骑手军团',
    evolvedDesc: '多一路外卖无人机同时出击',
    desc: '全程自动拐弯追踪最近敌人或 Boss',
    name: '外卖无人机追踪弹',
    shortTag: '追踪外卖',
    traitBadge: '{i:homing}追踪',
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
    evolvedName: '主动降噪力场',
    evolvedDesc: '声波环可以抵消 Boss 的弹幕',
    desc: '直线宽幅声波环，穿透 4 层敌人',
    name: '降噪耳机声波环',
    shortTag: '声波环',
    traitBadge: '{i:wave}穿4层',
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
    evolvedName: '多智能体集群',
    evolvedDesc: '浮游炮 2 门 → 4 门，各自锁敌',
    desc: '左右两翼浮游炮出手瞬间自动锁敌',
    name: 'AI 外挂浮游炮',
    shortTag: 'AI浮游炮',
    traitBadge: '{i:magnet}自瞄',
    damageMultiplier: 0.85,
    fireRatePerSec: 6.0,
    projectileSpeed: 680,
    basePierce: 1,
    pellets: 2,
    spreadRad: 0.08,
    color: PALETTE.purple
  },
  broom: {
    id: 'broom',
    evolvedName: '气旋吸尘器',
    evolvedDesc: '横扫时把小怪往中间吸，一扫一大片',
    desc: '近距离宽扇面横扫，穿透 2 层，射程短',
    name: '扫帚旋风',
    shortTag: '扫帚',
    traitBadge: '{i:wave}横扫',
    damageMultiplier: 0.78,
    fireRatePerSec: 3.0,
    projectileSpeed: 430,
    basePierce: 2,
    pellets: 3,
    spreadRad: 0.9,
    rangeSec: 1.05,
    color: PALETTE.coffee
  }
};

/** 主武器等级加成：Lv.1 / Lv.2 / Lv.3（进化） */
export const WEAPON_LEVEL_DAMAGE = [1, 1.2, 1.45];
export const WEAPON_LEVEL_RATE = [1, 1.1, 1.2];
/** 外挂副武器：相对主武器的伤害比例，每升一级 +25% */
export const SIDEARM_BASE = 0.25;
export const SIDEARM_MAX = 2;

export function weaponDisplayName(id: WeaponId, level: number): string {
  const w = WEAPONS[id];
  return level >= 3 ? w.evolvedName : w.name;
}

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
  },
  sick_leave: {
    id: 'sick_leave',
    name: '带薪病假',
    desc: '每 12 秒自动补回 2 名同事（随等级增加）',
    color: PALETTE.mint
  },
  overtime_burn: {
    id: 'overtime_burn',
    name: '加班燃烧',
    desc: '命中点燃目标，2 秒内持续掉血',
    color: PALETTE.red
  },
  // ---- 职业专属词条（只有对应角色能抽到，每张只能拿一次） ----
  jack_of_all: { id: 'jack_of_all', name: '万金油', desc: '换主武器时，旧武器自动变成外挂继续开火', color: PALETTE.yellow },
  regularize: { id: 'regularize', name: '转正答辩', desc: '每通过 3 扇蓝门 +1 护盾', color: PALETTE.mint },
  stack_overflow: { id: 'stack_overflow', name: 'Stack Overflow', desc: '弹射次数翻倍', color: PALETTE.purple },
  ctrl_cv: { id: 'ctrl_cv', name: 'Ctrl+C/V', desc: '分裂弹多复制一发', color: PALETTE.mint },
  premium_gray: { id: 'premium_gray', name: '高级灰', desc: '被减速的敌人受到伤害 +30%', color: PALETTE.paper },
  pixel_align: { id: 'pixel_align', name: '像素级对齐', desc: '声波环宽度 +40%', color: PALETTE.mint },
  scope_creep: { id: 'scope_creep', name: '需求变更', desc: '「+」蓝门人数额外随机 +0~30%', color: PALETTE.yellow },
  prd_rush: { id: 'prd_rush', name: 'PRD 加急', desc: '外卖无人机多派一路', color: PALETTE.yellow },
  big_client: { id: 'big_client', name: '大客户', desc: '暴击伤害再 +60%', color: PALETTE.red },
  double_commission: { id: 'double_commission', name: '提成翻倍', desc: '击杀掉落的咖啡豆 ×2', color: PALETTE.coffee },
  floor_wax: { id: 'floor_wax', name: '地板打蜡', desc: '所有命中让敌人滑倒减速 1 秒', color: PALETTE.mint },
  trash_sort: { id: 'trash_sort', name: '垃圾分类', desc: '撞上来被顺手扫掉的小怪掉 2 颗豆，10% 概率 +1 护盾', color: PALETTE.coffee }
};

/** 通用词条池（所有角色都能抽到，按职业倾向加权） */
export const COMMON_AFFIXES: AffixId[] = [
  'crit_rage',
  'split',
  'chill',
  'ricochet',
  'pierce',
  'chain_lightning',
  'kill_haste',
  'vamp_shield',
  'sick_leave',
  'overtime_burn'
];
