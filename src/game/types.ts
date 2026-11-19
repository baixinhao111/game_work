import type { Poolable } from '../engine/ObjectPool';

export type GamePhase = 'MENU' | 'PLAYING' | 'PAUSED' | 'VICTORY' | 'DEFEAT';

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

export type EnemyId =
  | 'overtime_zombie'
  | 'cc_all'
  | 'client_tweak'
  | 'client_mini'
  | 'ppt_pie'
  | 'ddl_flame';

export type BossId = 'monday_alarm';

export type GateKind =
  | 'ADD'
  | 'MULT'
  | 'SUB'
  | 'DIV'
  | 'SUPPLY_CRATE'
  | 'MYSTERY_BOX'
  | 'MOVING'
  | 'ULT_CHARGE';

export type GateOp = '+' | '-' | '×' | '÷' | 'BOX' | 'ULT' | 'CRATE';

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  shortTag: string;
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
  speedY: number;
  radius: number;
  damageToSquad: number;
  beansReward: number;
  ultReward: number;
  color: string;
  splitsOnDeath?: number;
}

export interface BossConfig {
  id: BossId;
  name: string;
  subtitle: string;
  hp: number;
  radius: number;
  beansReward: number;
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
  rewardWeapon?: WeaponId;
  rewardAffix?: AffixId;
  labelOverride?: string;
}

export type EnemyFormation = 'LINE' | 'CLUSTER' | 'FLANK_S' | 'STAGGERED_HORDE';

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

export interface Bullet extends Poolable {
  laneX: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  pierceLeft: number;
  color: string;
  kind: 'stapler' | 'keycap' | 'beam' | 'split';
  isCrit: boolean;
  hasSplit: boolean;
  chillDuration: number;
  hitIds: Set<number>;
  keyLabel: string;
  rot: number;
}

export interface Enemy extends Poolable {
  uid: number;
  configId: EnemyId;
  laneX: number;
  y: number;
  hp: number;
  maxHp: number;
  speedY: number;
  radius: number;
  damageToSquad: number;
  beansReward: number;
  ultReward: number;
  flashTimer: number;
  chillTimer: number;
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
  damage: number;
  color: string;
  label: string;
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

export interface BossRuntime {
  active: boolean;
  id: BossId;
  name: string;
  subtitle: string;
  laneX: number;
  y: number;
  targetY: number;
  moveDir: 1 | -1;
  hp: number;
  maxHp: number;
  radius: number;
  flashTimer: number;
  attackTimer: number;
  waveCount: number;
  summoned70: boolean;
  summoned35: boolean;
  ringPhase: number;
}

export interface SquadUnitRender {
  dx: number;
  dy: number;
  tier: 1 | 5 | 10;
  phase: number;
}

export interface GameState {
  phase: GamePhase;
  levelDay: 1;
  elapsedSec: number;
  trackDurationSec: number;
  squadCount: number;
  shieldCount: number;
  ultCharge: number;
  ultActiveTimer: number;
  ultStampTimer: number;
  activeWeapon: WeaponId;
  affixes: Record<AffixId, number>;
  boss: BossRuntime;
  bossBannerTimer: number;
  hitstopTimer: number;
  invulnTimer: number;
  shakeTimer: number;
  shakeMagnitude: number;
  comboCount: number;
  comboTimer: number;
  muzzleFlashTimer: number;
  stats: {
    maxSquad: number;
    kills: number;
    gatesFlipped: number;
    beansEarned: number;
    maxCritDamage: number;
  };
}

export interface SaveData {
  version: number;
  coffeeBeans: number;
  bestSquad: number;
  totalClears: number;
  muted: boolean;
}
