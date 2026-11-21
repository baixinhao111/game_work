import type { Poolable } from '../engine/ObjectPool';

export type GamePhase =
  | 'MENU'
  | 'PLAYING'
  | 'PAUSED'
  | 'UPGRADE_PICK'
  | 'VICTORY'
  | 'DEFEAT';

export type WeaponId =
  | 'stapler'
  | 'keyboard'
  | 'americano'
  | 'drone'
  | 'headphone'
  | 'ai_pod';

export type AffixId =
  | 'split'
  | 'ricochet'
  | 'pierce'
  | 'chill'
  | 'chain_lightning'
  | 'crit_rage'
  | 'kill_haste'
  | 'vamp_shield';

export type SynergyId =
  | 'superconduct'
  | 'keyboard_rain'
  | 'swarm_delivery'
  | 'absolute_zero'
  | 'gpt_overclock';

export type EnemyId =
  | 'overtime_zombie'
  | 'cc_all'
  | 'client_tweak'
  | 'client_mini'
  | 'ppt_pie'
  | 'ddl_flame';

/**
 * 敌人移动行为：
 * - shamble：丧尸式蹒跚，进入中场后缓慢朝小队横向靠拢，带左右摇摆
 * - march：保持队形整排直推（邮件人墙），不追踪
 * - homing：持续追踪小队
 * - heavy：重装匀速碾压，几乎不转向
 * - snake：先 S 型蛇皮走位，进入近场后锁定小队冲刺
 */
export type EnemyBehavior = 'shamble' | 'march' | 'homing' | 'heavy' | 'snake';

export type BossId = 'monday_alarm' | 'meeting_projector' | 'client_hydra' | 'p0_lava' | 'kpi_titan';

export type BossStyle = 'alarm' | 'projector' | 'hydra' | 'server' | 'kpi';

export type BossMove =
  | 'ring_gap'
  | 'fan3'
  | 'fan5'
  | 'fan7'
  | 'laser2'
  | 'laser3'
  | 'bomb1'
  | 'bomb3'
  | 'barrier'
  | 'cross'
  | 'slam'
  | 'summon';

export type GateKind =
  | 'ADD'
  | 'MULT'
  | 'SUB'
  | 'DIV'
  | 'SUPPLY_CRATE'
  | 'MYSTERY_BOX'
  | 'MOVING'
  | 'OVERLOAD'
  | 'SEESAW'
  | 'ULT_CHARGE';

export type GateOp = '+' | '-' | '×' | '÷' | 'BOX' | 'ULT' | 'CRATE';

export type TalentId = 'espresso' | 'thick_skin' | 'abacus' | 'bonus';

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  shortTag: string;
  traitBadge: string;
  desc: string;
  damageMultiplier: number;
  fireRatePerSec: number;
  projectileSpeed: number;
  basePierce: number;
  pellets: number;
  spreadRad: number;
  color: string;
}

export interface AffixConfig {
  id: AffixId;
  name: string;
  desc: string;
  color: string;
}

export interface EnemyConfig {
  id: EnemyId;
  name: string;
  hp: number;
  /** 相对路面的自主前进速度（实际屏幕速度 = 跑道滚动速度 + walkSpeed） */
  walkSpeed: number;
  /** 最大横向追踪速度（px/s） */
  homing: number;
  behavior: EnemyBehavior;
  radius: number;
  damageToSquad: number;
  beansReward: number;
  ultReward: number;
  color: string;
  splitsOnDeath?: number;
}

export interface BossSummon {
  enemyId: EnemyId;
  count: number;
  formation: EnemyFormation;
}

export interface BossConfig {
  id: BossId;
  name: string;
  subtitle: string;
  banner: string;
  spawnQuip: string;
  style: BossStyle;
  hp: number;
  radius: number;
  beansReward: number;
  /** 常态招式循环 */
  moves: BossMove[];
  /** 红温阶段招式循环 */
  enragedMoves: BossMove[];
  attackInterval: number;
  enragedInterval: number;
  /** 低于该血量比例进入红温 */
  enrageAt: number;
  /** 到达这些血量比例时进入短暂“开会免伤”并召唤护卫 */
  shieldAt: number[];
  shieldSummon: BossSummon;
  /** summon 招式使用的召唤配置 */
  moveSummon: BossSummon;
}

export interface GateConfig {
  id: string;
  pairGroupId: string;
  laneSide: 'LEFT' | 'RIGHT' | 'CENTER';
  kind: GateKind;
  initialOp: GateOp;
  value: number;
  shootableToFlip: boolean;
  flipHpPerStep?: number;
  moveSpeedX?: number;
  barrelHp?: number;
  linkedPartnerId?: string;
  overloadDurationSec?: number;
  rewardWeapon?: WeaponId;
  rewardAffix?: AffixId;
  labelOverride?: string;
}

export type EnemyFormation = 'LINE' | 'CLUSTER' | 'FLANK_S' | 'STAGGERED_HORDE' | 'COLUMN' | 'WEDGE';

export interface LevelWaveConfig {
  timeOffsetSec: number;
  type: 'GATE_PAIR' | 'ENEMY_SWARM' | 'BARREL' | 'BOSS';
  gates?: GateConfig[];
  enemySpawn?: {
    enemyId: EnemyId;
    count: number;
    formation: EnemyFormation;
    hpScale: number;
    laneCenter?: number;
  };
  bossId?: BossId;
}

export interface LevelConfig {
  day: number;
  weekday: string;
  title: string;
  subtitle: string;
  bossId: BossId;
  durationSec: number;
  timeline: LevelWaveConfig[];
}

export type BulletKind = 'stapler' | 'keycap' | 'beam' | 'split' | 'drone' | 'wave' | 'pod';

export interface Bullet extends Poolable {
  laneX: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  pierceLeft: number;
  bouncesLeft: number;
  wallBouncesLeft: number;
  color: string;
  kind: BulletKind;
  isCrit: boolean;
  hasSplit: boolean;
  chillDuration: number;
  deepChillDuration: number;
  synergyPowered: boolean;
  hitIds: Set<number>;
  keyLabel: string;
  rot: number;
  age: number;
}

export interface Enemy extends Poolable {
  uid: number;
  configId: EnemyId;
  behavior: EnemyBehavior;
  laneX: number;
  y: number;
  vx: number;
  hp: number;
  maxHp: number;
  walkSpeed: number;
  homing: number;
  radius: number;
  damageToSquad: number;
  beansReward: number;
  ultReward: number;
  flashTimer: number;
  chillTimer: number;
  deepChillTimer: number;
  wobblePhase: number;
  flankAmp: number;
  splitsOnDeath: number;
  rot: number;
}

export interface Gate extends Poolable {
  uid: number;
  configId: string;
  pairGroupId: string;
  pairLocked: boolean;
  laneX: number;
  y: number;
  width: number;
  height: number;
  kind: GateKind;
  op: GateOp;
  value: number;
  initialOp: GateOp;
  initialValue: number;
  shootableToFlip: boolean;
  flippedToBlue: boolean;
  flipProgress: number;
  flipHpPerStep: number;
  flipTickCount: number;
  moveSpeedX: number;
  moveDir: 1 | -1;
  barrelHp: number;
  barrelMaxHp: number;
  linkedPartnerId?: string;
  overloadDurationSec: number;
  rewardWeapon?: WeaponId;
  rewardAffix?: AffixId;
  labelOverride?: string;
  hitFlashTimer: number;
  bounceScale: number;
}

export interface BossProjectile extends Poolable {
  laneX: number;
  y: number;
  vx: number;
  vy: number;
  radius: number;
  /** 固定伤害 */
  damage: number;
  /** 按当前小队人数比例追加的伤害 */
  pctDamage: number;
  color: string;
  label: string;
}

/** Boss 地面技能：竖向激光柱 / 点名红圈炸弹 */
export interface BossHazard extends Poolable {
  kind: 'laser' | 'bomb';
  laneX: number;
  y: number;
  halfWidth: number;
  warnTimer: number;
  warnMax: number;
  activeTimer: number;
  damage: number;
  pctDamage: number;
  hasHit: boolean;
}

export interface Particle extends Poolable {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  color: string;
  shape: 'square' | 'star' | 'ring';
  rot: number;
  vRot: number;
}

export interface FloatingText extends Poolable {
  x: number;
  y: number;
  vy: number;
  text: string;
  color: string;
  size: number;
  life: number;
  maxLife: number;
  scalePop: number;
}

export interface LightningArc {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  superconduct?: boolean;
}

export interface BossRuntime {
  active: boolean;
  id: BossId;
  style: BossStyle;
  name: string;
  subtitle: string;
  laneX: number;
  y: number;
  targetY: number;
  homeY: number;
  moveDir: 1 | -1;
  hp: number;
  maxHp: number;
  radius: number;
  flashTimer: number;
  attackTimer: number;
  moveIdx: number;
  waveCount: number;
  enraged: boolean;
  shieldTimer: number;
  shieldsUsed: number;
  slamTimer: number;
  ringPhase: number;
  age: number;
}

export interface SquadUnitRender {
  dx: number;
  dy: number;
  tier: 1 | 5 | 10;
  phase: number;
}

export interface PickupBanner {
  title: string;
  sub: string;
  color: string;
  timer: number;
}

export interface UpgradeOption {
  id: string;
  kind: 'WEAPON' | 'AFFIX' | 'SQUAD_BOOST';
  title: string;
  desc: string;
  color: string;
  weaponId?: WeaponId;
  affixId?: AffixId;
  squadMult?: number;
  synergyTitle?: string;
}

export interface GameState {
  phase: GamePhase;
  levelDay: number;
  isEndless: boolean;
  endlessWave: number;
  endlessScore: number;
  elapsedSec: number;
  trackDurationSec: number;
  squadCount: number;
  shieldCount: number;
  ultCharge: number;
  ultActiveTimer: number;
  ultStampTimer: number;
  activeWeapon: WeaponId;
  affixes: Record<AffixId, number>;
  synergies: SynergyId[];
  pendingUpgrades: UpgradeOption[];
  /** 三选一来源：无尽 Boss 后 / 主线补给箱 */
  upgradeSource: 'ENDLESS_BOSS' | 'CRATE';
  newlyUnlockedBadges: string[];
  boss: BossRuntime;
  bossBannerTimer: number;
  hitstopTimer: number;
  invulnTimer: number;
  hurtFlashTimer: number;
  overloadEnemyTimer: number;
  podOverclockTimer: number;
  shakeTimer: number;
  shakeMagnitude: number;
  comboCount: number;
  comboTimer: number;
  hasteStacks: number;
  vampKillCounter: number;
  muzzleFlashTimer: number;
  banner: PickupBanner | null;
  stats: {
    maxSquad: number;
    kills: number;
    gatesFlipped: number;
    beansEarned: number;
    maxCritDamage: number;
    bossTimeSec: number;
  };
}

export interface SaveData {
  version: number;
  coffeeBeans: number;
  bestSquad: number;
  totalClears: number;
  /** 已通关的最高天数（0 = 还没通关周一） */
  highestCleared: number;
  endlessBestWave: number;
  endlessBestScore: number;
  unlockedBadges: string[];
  workerCode: string;
  talents: Record<TalentId, number>;
  muted: boolean;
  /** 是否已完成首局新手引导 */
  tutorialDone: boolean;
}
