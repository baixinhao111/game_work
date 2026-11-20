export type QuipEvent =
  | 'BAD_MATH_CHOICE'
  | 'LOW_SURVIVE'
  | 'CLUTCH_FLIP'
  | 'RED_DOOR_LOSS'
  | 'SQUAD_100'
  | 'WEAPON_UPGRADE'
  | 'SYNERGY_UNLOCKED'
  | 'OVERLOAD_EAT'
  | 'SEESAW_PRO'
  | 'ENDLESS_NEXT'
  | 'KILL_SPREE'
  | 'MYSTERY_AMBUSH'
  | 'MYSTERY_JACKPOT'
  | 'ULT_READY_IDLE'
  | 'ULT_CAST'
  | 'PPT_HIT'
  | 'BOSS_SPAWN'
  | 'CLEAN_START'
  | 'BOSS_SHIELD'
  | 'BOSS_ENRAGE'
  | 'CONTACT_LOSS';

export type QuipChannel = 'SQUAD' | 'BOSS' | 'CHAT';
export type QuipTone = 'sass' | 'hype' | 'panic' | 'boss';

export interface QuipEntry {
  channel: QuipChannel;
  tone: QuipTone;
  sender?: string;
  tag?: string;
  icon?: string;
  priority?: boolean;
  lines: readonly string[];
}

export interface ActiveQuip {
  id: number;
  channel: QuipChannel;
  tone: QuipTone;
  text: string;
  sender?: string;
  tag?: string;
  icon?: string;
  duration: number;
  remaining: number;
}

export const QUIP_CONFIG: Record<QuipEvent, QuipEntry> = {
  CLEAN_START: {
    channel: 'SQUAD',
    tone: 'sass',
    priority: true,
    lines: ['早八打卡！活着逃到 18:00！', '今天绝不加班，全员冲！']
  },
  CLUTCH_FLIP: {
    channel: 'SQUAD',
    tone: 'hype',
    priority: true,
    lines: ['需求驳回！甲方当场沉默！', '红门洗白！这波反驳漂亮！']
  },
  LOW_SURVIVE: {
    channel: 'SQUAD',
    tone: 'panic',
    priority: true,
    lines: ['就剩 1 口气也能摸过去？！', '极限残血！差点被优化！']
  },
  RED_DOOR_LOSS: {
    channel: 'SQUAD',
    tone: 'panic',
    lines: ['就当提前释放一半工位压力…', '嘶…怎么专往加班门里钻！']
  },
  CONTACT_LOSS: {
    channel: 'SQUAD',
    tone: 'panic',
    lines: ['别拉我开会！快绕开尸潮！', '同事被拖去加班了！快走位！']
  },
  PPT_HIT: {
    channel: 'SQUAD',
    tone: 'panic',
    lines: ['这大饼太硬，胃消化不了！']
  },
  SQUAD_100: {
    channel: 'SQUAD',
    tone: 'hype',
    priority: true,
    lines: ['百人摸鱼大军！谁敢拦我下班？']
  },
  OVERLOAD_EAT: {
    channel: 'SQUAD',
    tone: 'hype',
    lines: ['红温高倍率都敢吃，真狠人！']
  },
  SEESAW_PRO: {
    channel: 'SQUAD',
    tone: 'hype',
    lines: ['左边打工右边吃肉，预算拉满！']
  },
  ULT_CAST: {
    channel: 'SQUAD',
    tone: 'hype',
    priority: true,
    lines: ['已读不回！到点准时下班！', '18:00 关机走人，明天再说！']
  },
  KILL_SPREE: {
    channel: 'SQUAD',
    tone: 'hype',
    lines: ['清屏太快，老板监控都卡了！']
  },
  MYSTERY_JACKPOT: {
    channel: 'SQUAD',
    tone: 'hype',
    lines: ['带薪盲盒爆大奖！今天买彩票！']
  },

  BOSS_SPAWN: {
    channel: 'BOSS',
    tone: 'boss',
    priority: true,
    lines: ['全体起立！谁允许你下班的？！']
  },
  BOSS_SHIELD: {
    channel: 'BOSS',
    tone: 'boss',
    priority: true,
    lines: ['“会后再对齐一下”——免伤！', '临时拉个小会，先别打我！']
  },
  BOSS_ENRAGE: {
    channel: 'BOSS',
    tone: 'boss',
    priority: true,
    lines: ['17:59 了还敢摸鱼？！全员加班！', 'KPI 完不成谁也别想走！！']
  },

  BAD_MATH_CHOICE: {
    channel: 'CHAT',
    tone: 'sass',
    sender: '数学老师 · 家长群',
    tag: '@你',
    icon: '📐',
    lines: ['数学老师已连夜将你踢出群聊']
  },
  ULT_READY_IDLE: {
    channel: 'CHAT',
    tone: 'hype',
    sender: '18:00 打卡助手',
    tag: '提醒',
    icon: '⏰',
    lines: ['下班卡都亮了还不按，真打算自愿加班？']
  },
  MYSTERY_AMBUSH: {
    channel: 'CHAT',
    tone: 'panic',
    sender: '老板 · 紧急邮件',
    tag: '高优',
    icon: '📧',
    lines: ['惊喜不惊喜？附赠四个甲方小分队！']
  },
  WEAPON_UPGRADE: {
    channel: 'CHAT',
    tone: 'hype',
    sender: 'IT 运维小哥',
    tag: '到货',
    icon: '📦',
    lines: ['摸鱼装备已签收，电脑风扇准备起飞！']
  },
  SYNERGY_UNLOCKED: {
    channel: 'CHAT',
    tone: 'hype',
    priority: true,
    sender: '摸鱼战神群 (99+)',
    tag: '@所有人',
    icon: '⚡',
    lines: ['化学反应已激活！老板监控当场冒烟！']
  },
  ENDLESS_NEXT: {
    channel: 'CHAT',
    tone: 'boss',
    priority: true,
    sender: '大老板 · 周末群',
    tag: '@所有人',
    icon: '🔥',
    lines: ['打完一个 Boss 还有下一个，周末继续冲！']
  }
};
