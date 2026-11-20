import type { LevelConfig } from '../../game/types';
import { boss, box, crate, div, minus, moving, overload, pair, plus, seesaw, swarm, times, ult } from './dsl';

/**
 * 周一至周五 5 天主线。
 * 每天的节奏：开局攒人 → 第一件武器 → 拐点算术门 + 红门抉择 → 精英怪/混编潮 → 词条箱 → 关底 Boss。
 * 门从出现到抵达小队约 4.2 秒，敌人约 3 秒，编排时留出读题与走位的时间。
 */

const DAY1: LevelConfig = {
  day: 1,
  weekday: '周一',
  title: '早八噩梦',
  subtitle: '高密度尸潮版',
  bossId: 'monday_alarm',
  durationSec: 56,
  timeline: [
    pair(1.0, plus(5), plus(8)),
    swarm(3.6, 'overtime_zombie', 10, 'CLUSTER', 0.8, -40),
    crate(6.0, 'LEFT', 70, { weapon: 'keyboard' }, '机械键盘', plus(6)),
    swarm(8.4, 'overtime_zombie', 16, 'STAGGERED_HORDE', 0.9),
    pair(11.5, plus(10), times(2)),
    swarm(14.0, 'cc_all', 7, 'LINE', 1.0),
    pair(17.0, minus(8, 12), plus(6)),
    swarm(18.5, 'overtime_zombie', 20, 'STAGGERED_HORDE', 1.0),
    swarm(21.5, 'client_tweak', 3, 'LINE', 0.9),
    crate(24.0, 'RIGHT', 130, { weapon: 'americano', affix: 'crit_rage' }, '冰美式+暴击', plus(10)),
    swarm(27.0, 'ddl_flame', 8, 'FLANK_S', 1.0),
    pair(29.5, minus(12, 14), plus(10)),
    swarm(31.5, 'overtime_zombie', 24, 'STAGGERED_HORDE', 1.1),
    moving(34.5, plus(12), 95),
    swarm(37.0, 'ppt_pie', 2, 'LINE', 0.9),
    swarm(38.0, 'overtime_zombie', 16, 'WEDGE', 1.1),
    pair(41.0, box(), ult(45)),
    swarm(43.5, 'cc_all', 8, 'LINE', 1.1),
    crate(46.0, 'LEFT', 170, { affix: 'split' }, '词条:复制粘贴', plus(12)),
    swarm(48.5, 'overtime_zombie', 26, 'STAGGERED_HORDE', 1.2),
    pair(51.0, div(2), plus(15)),
    swarm(52.5, 'ddl_flame', 6, 'FLANK_S', 1.1),
    boss(56.0, 'monday_alarm')
  ]
};

const DAY2: LevelConfig = {
  day: 2,
  weekday: '周二',
  title: '连环周会',
  subtitle: '会中会中会',
  bossId: 'meeting_projector',
  durationSec: 64,
  timeline: [
    pair(1.0, plus(6), plus(9)),
    swarm(3.5, 'cc_all', 6, 'LINE', 0.9),
    crate(5.5, 'RIGHT', 80, { weapon: 'drone' }, '外卖无人机', minus(4, 14)),
    swarm(8.0, 'overtime_zombie', 18, 'STAGGERED_HORDE', 1.1),
    pair(10.5, times(2), plus(8)),
    swarm(13.0, 'client_tweak', 3, 'WEDGE', 1.0),
    moving(15.5, plus(14), 110),
    swarm(17.0, 'cc_all', 8, 'LINE', 1.1),
    pair(19.5, minus(10, 15), minus(6, 15)),
    swarm(21.5, 'overtime_zombie', 22, 'STAGGERED_HORDE', 1.2),
    crate(24.5, 'LEFT', 150, { affix: 'chill' }, '词条:冰镇降压', plus(10)),
    swarm(27.0, 'client_tweak', 4, 'LINE', 1.1),
    swarm(28.0, 'ddl_flame', 8, 'FLANK_S', 1.1),
    pair(31.0, times(1.5), minus(12, 15)),
    swarm(33.5, 'overtime_zombie', 26, 'STAGGERED_HORDE', 1.25),
    seesaw(36.5, 12, 6, 14),
    swarm(38.5, 'cc_all', 10, 'LINE', 1.2),
    moving(41.0, minus(10, 15), 120),
    swarm(43.0, 'ppt_pie', 2, 'LINE', 1.0),
    swarm(44.0, 'overtime_zombie', 20, 'WEDGE', 1.3),
    crate(47.0, 'RIGHT', 200, { weapon: 'americano', affix: 'pierce' }, '冰美式+穿刺', plus(14)),
    swarm(50.0, 'client_tweak', 5, 'STAGGERED_HORDE', 1.2),
    pair(53.0, ult(50), minus(14, 16)),
    swarm(55.0, 'cc_all', 10, 'LINE', 1.3),
    swarm(57.5, 'overtime_zombie', 30, 'STAGGERED_HORDE', 1.35),
    pair(60.0, div(2, 18), plus(16)),
    boss(64.0, 'meeting_projector')
  ]
};

const DAY3: LevelConfig = {
  day: 3,
  weekday: '周三',
  title: '甲方狂想曲',
  subtitle: '改回第一版',
  bossId: 'client_hydra',
  durationSec: 70,
  timeline: [
    pair(1.0, plus(8), minus(4, 12)),
    swarm(3.5, 'client_mini', 8, 'CLUSTER', 1.0),
    crate(5.5, 'LEFT', 90, { weapon: 'keyboard', affix: 'ricochet' }, '键盘+甩锅弹射', plus(8)),
    swarm(8.5, 'client_tweak', 4, 'LINE', 1.1),
    pair(11.0, minus(10, 15), times(2)),
    swarm(13.0, 'overtime_zombie', 24, 'STAGGERED_HORDE', 1.3),
    pair(16.0, minus(12, 16), minus(8, 16)),
    swarm(18.0, 'client_tweak', 5, 'WEDGE', 1.2),
    crate(21.0, 'RIGHT', 170, { weapon: 'headphone' }, '降噪耳机', plus(12)),
    swarm(23.5, 'ddl_flame', 10, 'FLANK_S', 1.2),
    pair(26.0, overload(2.0, 4.0), plus(18)),
    swarm(28.0, 'client_mini', 12, 'STAGGERED_HORDE', 1.3),
    swarm(29.5, 'ppt_pie', 2, 'LINE', 1.2),
    pair(32.5, minus(18, 18), div(2, 20)),
    swarm(34.5, 'overtime_zombie', 28, 'STAGGERED_HORDE', 1.4),
    crate(37.5, 'LEFT', 220, { affix: 'chain_lightning' }, '词条:高压电弧', plus(12)),
    swarm(40.0, 'client_tweak', 6, 'STAGGERED_HORDE', 1.3),
    moving(43.0, plus(16), 105),
    swarm(45.0, 'cc_all', 10, 'LINE', 1.4),
    pair(48.0, box(), ult(45)),
    swarm(50.0, 'ddl_flame', 10, 'FLANK_S', 1.35),
    swarm(52.0, 'overtime_zombie', 30, 'WEDGE', 1.5),
    pair(55.0, minus(16, 18), plus(20)),
    swarm(57.0, 'ppt_pie', 3, 'LINE', 1.3),
    crate(60.0, 'RIGHT', 260, { affix: 'crit_rage' }, '词条:键盘侠暴走', plus(16)),
    swarm(62.5, 'client_tweak', 6, 'LINE', 1.4),
    pair(65.5, plus(20), minus(14, 16)),
    boss(70.0, 'client_hydra')
  ]
};

const DAY4: LevelConfig = {
  day: 4,
  weekday: '周四',
  title: '线上救火夜',
  subtitle: '502 不眠之夜',
  bossId: 'p0_lava',
  durationSec: 78,
  timeline: [
    pair(1.0, plus(8), plus(12)),
    swarm(3.0, 'ddl_flame', 6, 'FLANK_S', 1.1),
    crate(5.0, 'RIGHT', 100, { weapon: 'ai_pod' }, 'AI 浮游炮', plus(8)),
    swarm(7.5, 'overtime_zombie', 24, 'STAGGERED_HORDE', 1.4),
    pair(10.0, times(2), minus(10, 16)),
    swarm(12.0, 'cc_all', 10, 'LINE', 1.4),
    swarm(14.0, 'ddl_flame', 10, 'FLANK_S', 1.3),
    pair(16.5, minus(14, 18), plus(14)),
    swarm(18.5, 'client_tweak', 5, 'WEDGE', 1.4),
    crate(21.0, 'LEFT', 190, { affix: 'kill_haste' }, '词条:越摸越顺', plus(14)),
    swarm(23.5, 'overtime_zombie', 30, 'STAGGERED_HORDE', 1.5),
    moving(26.0, minus(12, 18), 130),
    swarm(28.0, 'ppt_pie', 3, 'LINE', 1.4),
    pair(31.0, times(1.5), plus(26)),
    swarm(33.0, 'ddl_flame', 12, 'FLANK_S', 1.4),
    swarm(35.0, 'cc_all', 12, 'LINE', 1.5),
    seesaw(38.0, 16, 8, 16),
    swarm(40.0, 'overtime_zombie', 32, 'WEDGE', 1.6),
    crate(43.0, 'RIGHT', 260, { weapon: 'americano', affix: 'vamp_shield' }, '冰美式+摸鱼盾', plus(16)),
    swarm(45.5, 'client_tweak', 7, 'STAGGERED_HORDE', 1.5),
    pair(48.5, box(), plus(18)),
    swarm(50.5, 'ddl_flame', 12, 'FLANK_S', 1.5),
    swarm(52.5, 'overtime_zombie', 34, 'STAGGERED_HORDE', 1.7),
    pair(55.5, minus(18, 20), plus(24)),
    swarm(57.5, 'ppt_pie', 4, 'LINE', 1.5),
    crate(60.5, 'LEFT', 300, { affix: 'split' }, '词条:复制粘贴', plus(18)),
    swarm(63.0, 'cc_all', 14, 'LINE', 1.6),
    pair(66.0, ult(50), plus(30)),
    swarm(68.0, 'client_tweak', 8, 'WEDGE', 1.6),
    swarm(70.0, 'overtime_zombie', 36, 'STAGGERED_HORDE', 1.8),
    pair(73.5, plus(22), minus(24, 22)),
    boss(78.0, 'p0_lava')
  ]
};

const DAY5: LevelConfig = {
  day: 5,
  weekday: '周五',
  title: '冲刺 17:59',
  subtitle: '全机制集大成',
  bossId: 'kpi_titan',
  durationSec: 86,
  timeline: [
    pair(1.0, plus(10), plus(14)),
    swarm(3.0, 'overtime_zombie', 22, 'STAGGERED_HORDE', 1.5),
    crate(5.0, 'LEFT', 110, { weapon: 'keyboard', affix: 'pierce' }, '键盘+穿刺', plus(10)),
    swarm(7.5, 'cc_all', 10, 'LINE', 1.5),
    pair(10.0, times(2), minus(12, 18)),
    swarm(12.0, 'ddl_flame', 12, 'FLANK_S', 1.5),
    swarm(14.0, 'client_tweak', 6, 'WEDGE', 1.6),
    pair(17.0, minus(16, 20), minus(10, 20)),
    swarm(19.0, 'overtime_zombie', 32, 'STAGGERED_HORDE', 1.7),
    crate(22.0, 'RIGHT', 220, { weapon: 'drone', affix: 'split' }, '无人机+复制粘贴', plus(16)),
    swarm(24.5, 'ppt_pie', 3, 'LINE', 1.6),
    moving(27.0, plus(20), 120),
    swarm(29.0, 'cc_all', 14, 'LINE', 1.7),
    swarm(31.0, 'ddl_flame', 14, 'FLANK_S', 1.6),
    pair(33.5, div(2, 24), plus(30)),
    swarm(35.5, 'overtime_zombie', 36, 'WEDGE', 1.9),
    crate(38.5, 'LEFT', 280, { affix: 'chain_lightning' }, '词条:高压电弧', plus(18)),
    swarm(41.0, 'client_tweak', 8, 'STAGGERED_HORDE', 1.8),
    pair(44.0, overload(2.0, 4.5), box()),
    swarm(46.0, 'ppt_pie', 4, 'LINE', 1.8),
    swarm(47.0, 'client_mini', 14, 'CLUSTER', 1.8),
    pair(50.0, minus(22, 22), plus(26)),
    swarm(52.0, 'ddl_flame', 14, 'FLANK_S', 1.8),
    swarm(54.0, 'overtime_zombie', 38, 'STAGGERED_HORDE', 2.0),
    crate(57.0, 'RIGHT', 340, { weapon: 'americano', affix: 'crit_rage' }, '冰美式+暴击', plus(20)),
    swarm(59.5, 'cc_all', 16, 'LINE', 1.9),
    moving(62.0, minus(16, 20), 140),
    swarm(64.0, 'client_tweak', 9, 'WEDGE', 1.9),
    pair(67.0, ult(55), plus(24)),
    swarm(69.0, 'ppt_pie', 4, 'LINE', 2.0),
    swarm(70.5, 'overtime_zombie', 40, 'STAGGERED_HORDE', 2.1),
    pair(73.5, minus(26, 24), plus(34)),
    swarm(75.5, 'ddl_flame', 16, 'FLANK_S', 2.0),
    swarm(78.0, 'cc_all', 16, 'LINE', 2.0),
    pair(81.0, plus(28), ult(50)),
    boss(86.0, 'kpi_titan')
  ]
};

export const LEVELS: LevelConfig[] = [DAY1, DAY2, DAY3, DAY4, DAY5];

export function getLevel(day: number): LevelConfig {
  return LEVELS[Math.max(0, Math.min(LEVELS.length - 1, day - 1))];
}
