export type QuipEvent =
  | 'BAD_MATH_CHOICE'
  | 'LOW_SURVIVE'
  | 'CLUTCH_FLIP'
  | 'RED_DOOR_LOSS'
  | 'SQUAD_100'
  | 'WEAPON_UPGRADE'
  | 'KILL_SPREE'
  | 'MYSTERY_AMBUSH'
  | 'MYSTERY_JACKPOT'
  | 'ULT_READY_IDLE'
  | 'ULT_CAST'
  | 'PPT_HIT'
  | 'BOSS_SPAWN'
  | 'CLEAN_START';

export const QUIP_MESSAGES: Record<QuipEvent, readonly string[]> = {
  BAD_MATH_CHOICE: ['数学老师已连夜将你踢出群聊'],
  LOW_SURVIVE: ['就剩口气了居然也能摸过去？'],
  CLUTCH_FLIP: ['需求驳回成功！甲方当场沉默！', '强行洗白红门！这手反驳太漂亮了'],
  RED_DOOR_LOSS: ['别慌，就当提前释放了一半工位压力'],
  SQUAD_100: ['百人摸鱼大军已集结，谁敢拦我下班？'],
  WEAPON_UPGRADE: ['摸鱼装备升级！电脑风扇都要起飞了'],
  KILL_SPREE: ['这清屏速度，老板监控都跟不上你'],
  MYSTERY_AMBUSH: ['拆开老板邮件：惊喜不惊喜？意外不意外？'],
  MYSTERY_JACKPOT: ['带薪盲盒爆大奖！今天适合买彩票！'],
  ULT_READY_IDLE: ['下班卡都亮了还不按，真打算自愿加班？'],
  ULT_CAST: ['已读不回！到点下班！天塌了明天再说！'],
  PPT_HIT: ['饼太大了，胃不好消化不了啊！'],
  BOSS_SPAWN: ['早高峰闹钟突脸！全体起立集火砸表！'],
  CLEAN_START: ['早八打卡成功！目标：18:00 活着逃出工位']
};
