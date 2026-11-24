import type {
  AffixId,
  BossId,
  EnemyFormation,
  EnemyId,
  GateConfig,
  LevelWaveConfig,
  WeaponId
} from '../../game/types';

/**
 * 关卡编排小工具：把“第 t 秒出现什么”写成一行，方便策划快速调整节奏。
 */

type GateSpec = Omit<GateConfig, 'id' | 'pairGroupId' | 'laneSide'>;

let gateUid = 0;
const nextId = (prefix: string) => `${prefix}_${++gateUid}`;

export const plus = (value: number): GateSpec => ({
  kind: 'ADD',
  initialOp: '+',
  value,
  shootableToFlip: false
});

export const times = (value: number): GateSpec => ({
  kind: 'MULT',
  initialOp: '×',
  value,
  shootableToFlip: false
});

/** 红色减员门，可射击“驳回”：每 flipHp 点伤害 -1，降到 0 翻成蓝门 */
export const minus = (value: number, flipHp = 14): GateSpec => ({
  kind: 'SUB',
  initialOp: '-',
  value,
  shootableToFlip: true,
  flipHpPerStep: flipHp
});

/** 红色除法门：累计 8 档伤害洗白成 +12 */
export const div = (value: number, flipHp = 16): GateSpec => ({
  kind: 'DIV',
  initialOp: '÷',
  value,
  shootableToFlip: true,
  flipHpPerStep: flipHp
});

export const box = (label = '??? 未读邮件'): GateSpec => ({
  kind: 'MYSTERY_BOX',
  initialOp: 'BOX',
  value: 1,
  shootableToFlip: false,
  labelOverride: label
});

export const ult = (value: number): GateSpec => ({
  kind: 'ULT_CHARGE',
  initialOp: 'ULT',
  value,
  shootableToFlip: false,
  labelOverride: `下班充能 +${value}%`
});

/** 高压过载风险门：高倍率收益 + 触发全场敌人短暂红温加速 */
export const overload = (mult = 2.5, durationSec = 4.5): GateSpec => ({
  kind: 'OVERLOAD',
  initialOp: '×',
  value: mult,
  shootableToFlip: false,
  overloadDurationSec: durationSec,
  labelOverride: '{i:bolt} 高压过载'
});

/** 联动跷跷板门：射击左侧红门不仅减罚，还会同步给右侧蓝门充能加码 */
export function seesaw(t: number, redVal = 12, blueInitVal = 5, flipHp = 13): LevelWaveConfig {
  const group = nextId('ss');
  const leftId = nextId('g_l');
  const rightId = nextId('g_r');
  return {
    timeOffsetSec: t,
    type: 'GATE_PAIR',
    gates: [
      {
        id: leftId,
        pairGroupId: group,
        laneSide: 'LEFT',
        kind: 'SEESAW',
        initialOp: '-',
        value: redVal,
        shootableToFlip: true,
        flipHpPerStep: flipHp,
        linkedPartnerId: rightId,
        labelOverride: '联动打工!'
      },
      {
        id: rightId,
        pairGroupId: group,
        laneSide: 'RIGHT',
        kind: 'SEESAW',
        initialOp: '+',
        value: blueInitVal,
        shootableToFlip: false,
        labelOverride: '预算加码'
      }
    ]
  };
}

export function pair(t: number, left: GateSpec, right: GateSpec): LevelWaveConfig {
  const group = nextId('row');
  return {
    timeOffsetSec: t,
    type: 'GATE_PAIR',
    gates: [
      { ...left, id: nextId('g'), pairGroupId: group, laneSide: 'LEFT' },
      { ...right, id: nextId('g'), pairGroupId: group, laneSide: 'RIGHT' }
    ]
  };
}

/** 横向来回滑动的单扇门 */
export function moving(t: number, spec: GateSpec, speed = 95): LevelWaveConfig {
  const group = nextId('mv');
  return {
    timeOffsetSec: t,
    type: 'GATE_PAIR',
    gates: [{ ...spec, kind: spec.kind === 'ADD' ? 'MOVING' : spec.kind, id: nextId('g'), pairGroupId: group, laneSide: 'CENTER', moveSpeedX: speed }]
  };
}

/** 空投补给箱（需要打爆才拿奖励）+ 另一侧可选的一扇门 */
export function crate(
  t: number,
  side: 'LEFT' | 'RIGHT',
  hp: number,
  reward: { weapon?: WeaponId; affix?: AffixId },
  label: string,
  other?: GateSpec
): LevelWaveConfig {
  const gates: GateConfig[] = [
    {
      id: nextId('crate'),
      pairGroupId: nextId('crate_grp'),
      laneSide: side,
      kind: 'SUPPLY_CRATE',
      initialOp: 'CRATE',
      value: 1,
      shootableToFlip: false,
      barrelHp: hp,
      rewardWeapon: reward.weapon,
      rewardAffix: reward.affix,
      labelOverride: label
    }
  ];
  if (other) {
    gates.push({
      ...other,
      id: nextId('g'),
      pairGroupId: nextId('solo'),
      laneSide: side === 'LEFT' ? 'RIGHT' : 'LEFT'
    });
  }
  return { timeOffsetSec: t, type: 'BARREL', gates };
}

export function swarm(
  t: number,
  enemyId: EnemyId,
  count: number,
  formation: EnemyFormation,
  hpScale = 1,
  laneCenter?: number
): LevelWaveConfig {
  return {
    timeOffsetSec: t,
    type: 'ENEMY_SWARM',
    enemySpawn: { enemyId, count, formation, hpScale, laneCenter }
  };
}

export function boss(t: number, bossId: BossId): LevelWaveConfig {
  return { timeOffsetSec: t, type: 'BOSS', bossId };
}

/** 限时门：倒计时归零前是蓝门，超时变红门；射它可以续时间 */
export const timed = (value: number, sec = 2.4): GateSpec => ({ ...plus(value), timedSec: sec });

/** 第二章分岔路线：隔离带持续 duration 秒，KPI 路在 kpiSide 一侧 */
export function fork(t: number, duration: number, kpiSide: 'LEFT' | 'RIGHT' = 'LEFT'): LevelWaveConfig {
  return { timeOffsetSec: t, type: 'FORK', fork: { duration, kpiSide } };
}
