import type { LevelWaveConfig } from '../../game/types';

export const DAY1_DURATION_SEC = 55;

export const DAY1_TIMELINE: LevelWaveConfig[] = [
  // 0–15s：双蓝门开局 + 两波大密度熬夜丧尸 + 机械键盘霰弹箱
  {
    timeOffsetSec: 1.2,
    type: 'GATE_PAIR',
    gates: [
      {
        id: 'd1_g1_l',
        pairGroupId: 'd1_row_1',
        laneSide: 'LEFT',
        kind: 'ADD',
        initialOp: '+',
        value: 6,
        shootableToFlip: false
      },
      {
        id: 'd1_g1_r',
        pairGroupId: 'd1_row_1',
        laneSide: 'RIGHT',
        kind: 'ADD',
        initialOp: '+',
        value: 10,
        shootableToFlip: false
      }
    ]
  },
  {
    timeOffsetSec: 3.8,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'overtime_zombie',
      count: 18,
      formation: 'STAGGERED_HORDE',
      hpScale: 0.9
    }
  },
  {
    timeOffsetSec: 7.5,
    type: 'BARREL',
    gates: [
      {
        id: 'd1_barrel_1',
        pairGroupId: 'd1_barrel_1',
        laneSide: 'LEFT',
        kind: 'SUPPLY_CRATE',
        initialOp: 'CRATE',
        value: 1,
        shootableToFlip: false,
        barrelHp: 75,
        rewardWeapon: 'keyboard',
        labelOverride: '机械键盘'
      },
      {
        id: 'd1_g2_r',
        pairGroupId: 'd1_row_2',
        laneSide: 'RIGHT',
        kind: 'ADD',
        initialOp: '+',
        value: 12,
        shootableToFlip: false
      }
    ]
  },
  {
    timeOffsetSec: 10.5,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'overtime_zombie',
      count: 22,
      formation: 'STAGGERED_HORDE',
      hpScale: 1.0
    }
  },

  // 15–35s：拐点算术门 + 催命邮件恶魔 + 洗白红门 + 甲方改稿精英 + 冰美式空投箱 + DDL刺客
  {
    timeOffsetSec: 14.5,
    type: 'GATE_PAIR',
    gates: [
      {
        id: 'd1_g3_l',
        pairGroupId: 'd1_row_3',
        laneSide: 'LEFT',
        kind: 'ADD',
        initialOp: '+',
        value: 16,
        shootableToFlip: false
      },
      {
        id: 'd1_g3_r',
        pairGroupId: 'd1_row_3',
        laneSide: 'RIGHT',
        kind: 'MULT',
        initialOp: '×',
        value: 2,
        shootableToFlip: false
      }
    ]
  },
  {
    timeOffsetSec: 18.0,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'cc_all',
      count: 16,
      formation: 'STAGGERED_HORDE',
      hpScale: 1.0
    }
  },
  {
    timeOffsetSec: 21.5,
    type: 'GATE_PAIR',
    gates: [
      {
        id: 'd1_g4_l',
        pairGroupId: 'd1_row_4',
        laneSide: 'LEFT',
        kind: 'SUB',
        initialOp: '-',
        value: 10,
        shootableToFlip: true,
        flipHpPerStep: 13
      },
      {
        id: 'd1_g4_r',
        pairGroupId: 'd1_row_4',
        laneSide: 'RIGHT',
        kind: 'ADD',
        initialOp: '+',
        value: 10,
        shootableToFlip: false
      }
    ]
  },
  {
    timeOffsetSec: 24.5,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'overtime_zombie',
      count: 26,
      formation: 'STAGGERED_HORDE',
      hpScale: 1.05
    }
  },
  {
    timeOffsetSec: 25.5,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'client_tweak',
      count: 4,
      formation: 'LINE',
      hpScale: 1.0
    }
  },
  {
    timeOffsetSec: 28.5,
    type: 'BARREL',
    gates: [
      {
        id: 'd1_barrel_2',
        pairGroupId: 'd1_barrel_2',
        laneSide: 'RIGHT',
        kind: 'SUPPLY_CRATE',
        initialOp: 'CRATE',
        value: 1,
        shootableToFlip: false,
        barrelHp: 135,
        rewardWeapon: 'americano',
        rewardAffix: 'crit_rage',
        labelOverride: '冰美式+暴击'
      },
      {
        id: 'd1_g5_l_static',
        pairGroupId: 'd1_row_5_a',
        laneSide: 'LEFT',
        kind: 'ADD',
        initialOp: '+',
        value: 12,
        shootableToFlip: false
      }
    ]
  },
  {
    timeOffsetSec: 31.5,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'ddl_flame',
      count: 12,
      formation: 'FLANK_S',
      hpScale: 1.0
    }
  },

  // 35–54s：滑轨门 + 30只丧尸巨潮 + 盲盒/充能门 + PPT大饼混编潮 + 分裂词条空投箱 + 终极倍率门
  {
    timeOffsetSec: 34.5,
    type: 'GATE_PAIR',
    gates: [
      {
        id: 'd1_g5_moving',
        pairGroupId: 'd1_row_5_b',
        laneSide: 'CENTER',
        kind: 'MOVING',
        initialOp: '+',
        value: 20,
        shootableToFlip: false,
        moveSpeedX: 95
      }
    ]
  },
  {
    timeOffsetSec: 37.0,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'overtime_zombie',
      count: 30,
      formation: 'STAGGERED_HORDE',
      hpScale: 1.15
    }
  },
  {
    timeOffsetSec: 40.5,
    type: 'GATE_PAIR',
    gates: [
      {
        id: 'd1_g6_l',
        pairGroupId: 'd1_row_6',
        laneSide: 'LEFT',
        kind: 'MYSTERY_BOX',
        initialOp: 'BOX',
        value: 1,
        shootableToFlip: false,
        labelOverride: '??? 未读邮件'
      },
      {
        id: 'd1_g6_r',
        pairGroupId: 'd1_row_6',
        laneSide: 'RIGHT',
        kind: 'ULT_CHARGE',
        initialOp: 'ULT',
        value: 45,
        shootableToFlip: false,
        labelOverride: '下班充能 +45%'
      }
    ]
  },
  {
    timeOffsetSec: 43.2,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'ppt_pie',
      count: 3,
      formation: 'LINE',
      hpScale: 1.0
    }
  },
  {
    timeOffsetSec: 44.0,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'overtime_zombie',
      count: 20,
      formation: 'STAGGERED_HORDE',
      hpScale: 1.15
    }
  },
  {
    timeOffsetSec: 47.0,
    type: 'BARREL',
    gates: [
      {
        id: 'd1_barrel_3',
        pairGroupId: 'd1_barrel_3',
        laneSide: 'LEFT',
        kind: 'SUPPLY_CRATE',
        initialOp: 'CRATE',
        value: 1,
        shootableToFlip: false,
        barrelHp: 185,
        rewardAffix: 'split',
        labelOverride: '词条:复制粘贴'
      },
      {
        id: 'd1_g7_aid',
        pairGroupId: 'd1_row_7_aid',
        laneSide: 'RIGHT',
        kind: 'ADD',
        initialOp: '+',
        value: 15,
        shootableToFlip: false
      }
    ]
  },
  {
    timeOffsetSec: 50.2,
    type: 'GATE_PAIR',
    gates: [
      {
        id: 'd1_g8_l',
        pairGroupId: 'd1_row_8',
        laneSide: 'LEFT',
        kind: 'SUB',
        initialOp: '-',
        value: 14,
        shootableToFlip: true,
        flipHpPerStep: 15
      },
      {
        id: 'd1_g8_r',
        pairGroupId: 'd1_row_8',
        laneSide: 'RIGHT',
        kind: 'MULT',
        initialOp: '×',
        value: 2,
        shootableToFlip: false
      }
    ]
  },
  {
    timeOffsetSec: 52.3,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'overtime_zombie',
      count: 28,
      formation: 'STAGGERED_HORDE',
      hpScale: 1.2
    }
  },
  {
    timeOffsetSec: 52.8,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'ddl_flame',
      count: 6,
      formation: 'FLANK_S',
      hpScale: 1.1
    }
  },

  // 55s 终点 Boss 战：《07:00 早高峰地狱闹钟》
  {
    timeOffsetSec: 55.0,
    type: 'BOSS',
    bossId: 'monday_alarm'
  }
];
