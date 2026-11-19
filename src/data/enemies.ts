import { PALETTE } from './palette';
import type { BossConfig, BossId, EnemyConfig, EnemyId } from '../game/types';

export const ENEMIES: Record<EnemyId, EnemyConfig> = {
  overtime_zombie: {
    id: 'overtime_zombie',
    name: '熬夜加班丧尸',
    hp: 18,
    speedY: 104,
    radius: 17,
    damageToSquad: 1,
    beansReward: 1,
    ultReward: 1.8,
    color: PALETTE.mint
  },
  cc_all: {
    id: 'cc_all',
    name: '催命邮件恶魔',
    hp: 34,
    speedY: 132,
    radius: 18,
    damageToSquad: 2,
    beansReward: 2,
    ultReward: 2.5,
    color: PALETTE.mint
  },
  client_tweak: {
    id: 'client_tweak',
    name: '甲方改稿怪',
    hp: 88,
    speedY: 94,
    radius: 23,
    damageToSquad: 4,
    beansReward: 4,
    ultReward: 5,
    color: PALETTE.purple,
    splitsOnDeath: 2
  },
  client_mini: {
    id: 'client_mini',
    name: '再调一版',
    hp: 20,
    speedY: 122,
    radius: 15,
    damageToSquad: 1,
    beansReward: 1,
    ultReward: 1.5,
    color: PALETTE.purple
  },
  ppt_pie: {
    id: 'ppt_pie',
    name: 'PPT 巨型大饼',
    hp: 185,
    speedY: 74,
    radius: 28,
    damageToSquad: 7,
    beansReward: 8,
    ultReward: 9,
    color: PALETTE.yellow
  },
  ddl_flame: {
    id: 'ddl_flame',
    name: '红温 DDL 刺客',
    hp: 28,
    speedY: 148,
    radius: 18,
    damageToSquad: 2,
    beansReward: 2,
    ultReward: 2.5,
    color: PALETTE.red
  }
};

export const BOSSES: Record<BossId, BossConfig> = {
  monday_alarm: {
    id: 'monday_alarm',
    name: '07:00 早高峰地狱闹钟',
    subtitle: 'DAY 01 BOSS · 夺命连环响',
    hp: 2100,
    radius: 48,
    beansReward: 70
  }
};
