import { evaluateNewBadges } from '../data/badges';
import { applyRunXp, computeRunXp } from '../data/ranks';
import { getCharacter, isCharacterUnlocked, type CharacterConfig } from '../data/characters';
import { CODEX_XP } from '../data/codex';
import { maxOvertime, OVERTIME_BOSS_HP, OVERTIME_ENEMY_HP, OVERTIME_LEVELS } from '../data/overtime';
import { generateUpgrades, type Loadout } from './UpgradeGenerator';
import { BOSSES } from '../data/enemies';
import { getLevel, isChapterFinal, LEVELS } from '../data/levels';
import { PALETTE } from '../data/palette';
import { computeActiveSynergies, SYNERGIES } from '../data/synergies';
import { computeTalentEffects, type TalentEffects } from '../data/talents';
import { AFFIXES, SIDEARM_MAX, WEAPONS, weaponDisplayName } from '../data/weapons';
import type { AudioEngine } from '../engine/AudioEngine';
import { ObjectPool } from '../engine/ObjectPool';
import { clamp, DESIGN_W, LEADER_MAX_X, PLAYER_Y, projectX, SCROLL_SPEED, TRACK_TOP_Y } from '../engine/Viewport';

/** 分岔隔离带半宽（领队只能在这条线外侧） */
const FORK_GAP = 26;
import { SaveManager } from '../storage/SaveManager';
import { TutorialSystem } from './TutorialSystem';
import { HordeDirector } from './HordeDirector';
import { ImpactFx } from './ImpactFx';
import { BossSystem } from './BossSystem';
import { CombatSystem, type CombatContext } from './CombatSystem';
import { ENDLESS_WAVE_DURATION_SEC, EndlessDirector } from './EndlessDirector';
import { EnemySystem } from './EnemySystem';
import { GateSystem } from './GateSystem';
import { QuipSystem } from './QuipSystem';
import { SquadSystem } from './SquadSystem';
import type { ActiveQuip } from '../data/quips';
import type {
  AffixId,
  ForkState,
  GateConfig,
  WeaponId,
  FloatingText,
  GamePhase,
  GameState,
  LevelConfig,
  LevelWaveConfig,
  Particle,
  SaveData
} from './types';

const MAX_ACTIVE_PARTICLES = 200;
/** 省电画质下的粒子上限 */
const MAX_ACTIVE_PARTICLES_LOW = 70;

export interface WorldUICallbacks {
  onPhaseChange: (phase: GamePhase, state: GameState, save: SaveData) => void;
  onQuipChange: (quip: ActiveQuip | null) => void;
  onEnsureBoss?: (dayOrBossId: { bossId: keyof typeof BOSSES }) => void;
}

export class GameWorld {
  public readonly squad = new SquadSystem();
  /** 首局新手引导 */
  public readonly tutorial = new TutorialSystem();
  /** 打击 / 击杀反馈 */
  public readonly fx: ImpactFx = new ImpactFx(this);
  /** 尸潮导演：随时间越刷越多的炮灰 */
  private readonly horde = new HordeDirector();
  public readonly gates: GateSystem;
  public readonly enemies: EnemySystem;
  public readonly bosses: BossSystem;
  public readonly combat: CombatSystem;
  public readonly quips: QuipSystem;

  public readonly particles: ObjectPool<Particle>;
  public readonly floatingTexts: ObjectPool<FloatingText>;

  public save: SaveData;
  public state: GameState;

  private nextWaveIdx = 0;
  private ultIdleTimer = 0;
  private killSpreeCount = 0;
  private killSpreeTimer = 0;
  private contactQuipTimer = 0;
  /** 菜单里选中的关卡（1–5） */
  public selectedDay = 1;
  /** 菜单里选中的加班强度 */
  public selectedOvertime = 0;
  public level: LevelConfig = LEVELS[0];
  private activeTimeline: LevelWaveConfig[] = LEVELS[0].timeline;
  private talentFx: TalentEffects;
  /** 本局出战角色 */
  public char: CharacterConfig = getCharacter('intern');
  /** 分岔路线（第二章） */
  public fork: ForkState | null = null;
  /** 「转正答辩」通过蓝门计数 / 「带薪病假」计时 */
  private blueGateCounter = 0;
  private sickLeaveTimer = 0;

  constructor(
    public readonly audio: AudioEngine,
    private readonly uiCallbacks: WorldUICallbacks
  ) {
    this.save = SaveManager.load();
    this.audio.setMuted(this.save.muted);
    this.audio.applySettings(this.save.settings);

    this.talentFx = computeTalentEffects(this.save.talents);
    this.selectedDay = Math.min(LEVELS.length, this.save.highestCleared + 1);
    const search = typeof window !== 'undefined' && window.location ? window.location.search : '';
    const debugDay = Number(new URLSearchParams(search).get('level'));
    if (debugDay >= 1 && debugDay <= LEVELS.length) this.selectedDay = debugDay;

    this.gates = new GateSystem(audio);
    this.enemies = new EnemySystem();
    this.bosses = new BossSystem(audio, this.enemies);
    this.combat = new CombatSystem(audio);
    this.quips = new QuipSystem(audio, uiCallbacks.onQuipChange);

    this.particles = new ObjectPool<Particle>(
      () => ({
        active: false,
        x: 0,
        y: 0,
        vx: 0,
        vy: 0,
        size: 5,
        life: 0,
        maxLife: 0.4,
        color: PALETTE.yellow,
        shape: 'square',
        rot: 0,
        vRot: 0
      }),
      (p) => {
        p.life = 0;
        p.rot = 0;
      },
      260
    );

    this.floatingTexts = new ObjectPool<FloatingText>(
      () => ({
        active: false,
        x: 0,
        y: 0,
        vy: -42,
        text: '',
        color: PALETTE.paper,
        size: 14,
        life: 0,
        maxLife: 0.7,
        scalePop: 1.25
      }),
      (f) => {
        f.life = 0;
        f.scalePop = 1.25;
      },
      80
    );

    this.state = this.createInitialState('MENU', false);
    this.squad.rebuildRenderUnits(this.state.squadCount);
  }

  private createInitialState(phase: GamePhase, isEndless: boolean): GameState {
    const m = this.char.mods;
    const startSquad = Math.max(1, 4 + this.talentFx.startSquadBonus + m.startSquad);
    const affixes = {} as Record<AffixId, number>;
    for (const k of Object.keys(AFFIXES) as AffixId[]) affixes[k] = 0;
    return {
      phase,
      levelDay: isEndless ? 1 : this.level.day,
      isEndless,
      endlessWave: 1,
      endlessScore: 0,
      elapsedSec: 0,
      trackDurationSec: isEndless ? ENDLESS_WAVE_DURATION_SEC : this.level.durationSec,
      squadCount: startSquad,
      shieldCount: clamp(1 + this.talentFx.startShieldBonus + m.startShield, 0, 5),
      ultCharge: 0,
      ultActiveTimer: 0,
      ultStampTimer: 0,
      activeWeapon: this.char.weapon,
      character: this.char.id,
      weaponLevel: 1,
      sidearms: [],
      freezeTimer: 0,
      rushTimer: 0,
      gateBoostCharges: 0,
      affixes,
      synergies: [],
      pendingUpgrades: [],
      upgradeSource: 'ENDLESS_BOSS',
      newlyUnlockedBadges: [],
      xpResult: null,
      overtime: 0,
      newCodex: [],
      overtimeUnlocked: null,
      boss: this.bosses.boss,
      bossBannerTimer: 0,
      hitstopTimer: 0,
      invulnTimer: 0,
      hurtFlashTimer: 0,
      overloadEnemyTimer: 0,
      podOverclockTimer: 0,
      shakeTimer: 0,
      shakeMagnitude: 0,
      comboCount: 0,
      comboTimer: 0,
      hasteStacks: 0,
      vampKillCounter: 0,
      muzzleFlashTimer: 0,
      banner: null,
      stats: {
        maxSquad: startSquad,
        kills: 0,
        gatesFlipped: 0,
        beansEarned: 0,
        maxCritDamage: 0,
        bossTimeSec: 0,
        damage: { weapon: 0, sidearm: 0, affix: 0, synergy: 0, ult: 0 },
        hitsTaken: 0,
        maxSidearms: 0,
        kpiRoads: 0,
        stolenBack: 0
      }
    };
  }

  selectDay(day: number): void {
    const maxDay = Math.min(LEVELS.length, this.save.highestCleared + 1);
    this.selectedDay = clamp(Math.floor(day), 1, maxDay);
  }

  /** 省电画质（少粒子、无墨渍、低分辨率） */
  get lowFx(): boolean {
    return this.save.settings.lowFx;
  }

  /** 设置变更后调用：同步音量 / 震动，并写入存档 */
  applySettings(persist = false): void {
    this.audio.applySettings(this.save.settings);
    if (persist) void SaveManager.save(this.save);
  }

  /** 设置页「重看新手引导」：直接开一局周一教学局 */
  replayTutorial(): void {
    this.save.tutorialDone = false;
    this.startNewRun(1, { tutorial: true });
  }

  refreshTalents(): void {
    this.talentFx = computeTalentEffects(this.save.talents);
  }

  /** 按容器 Storage 协议异步水合存档，不回退浏览器的 localStorage（除非明确低版本 < 9.46.0） */
  async hydrateSave(): Promise<void> {
    const res = await SaveManager.hydrate();
    if (!res.loaded) return;
    this.save = res.data;
    this.refreshTalents();
    this.audio.setMuted(this.save.muted);
    this.applySettings();
    this.selectedDay = Math.min(LEVELS.length, this.save.highestCleared + 1);
    this.selectedOvertime = this.save.overtimeSel;
    if (this.state.phase === 'MENU') {
      this.uiCallbacks.onPhaseChange('MENU', this.state, this.save);
    }
  }

  private resetWorldSubsystems(): void {
    this.fx.reset();
    this.horde.reset();
    this.gates.reset();
    this.enemies.reset();
    this.bosses.reset();
    this.combat.reset();
    this.squad.reset();
    this.quips.reset();
    this.particles.releaseAll();
    this.floatingTexts.releaseAll();

    this.nextWaveIdx = 0;
    this.ultIdleTimer = 0;
    this.killSpreeCount = 0;
    this.killSpreeTimer = 0;
    this.contactQuipTimer = 0;
    this.blueGateCounter = 0;
    this.sickLeaveTimer = 0;
    this.fork = null;
  }

  /**
   * 加班强度（规则逐级叠加，docs/07 §3.5）：
   * 每级怪物 / Boss 血量递增；2 每段多一扇红门 · 3 精英提前、多一波尸潮 · 4 Boss 更快更早红温 · 5 开局人数减半
   */
  private applyOvertime(level: number): void {
    const L = Math.max(0, Math.min(5, level));
    this.state.overtime = L;
    this.enemies.hpMult = OVERTIME_ENEMY_HP[L];
    this.enemies.speedMult = 1 + 0.04 * L;
    this.bosses.hpMult = OVERTIME_BOSS_HP[L];
    this.bosses.rateMult = L >= 4 ? 0.85 : 1;
    this.bosses.enrageBonus = L >= 4 ? 0.12 : 0;
    if (L >= 3 && !this.state.isEndless) {
      // 精英波提前 3 秒
      this.activeTimeline = this.activeTimeline
        .map((w) =>
          w.type === 'ENEMY_SWARM' && w.enemySpawn && (w.enemySpawn.enemyId === 'ppt_pie' || w.enemySpawn.enemyId === 'client_tweak')
            ? { ...w, timeOffsetSec: Math.max(2, w.timeOffsetSec - 3) }
            : w
        )
        .sort((a, b) => a.timeOffsetSec - b.timeOffsetSec);
    }
    if (L >= 5) {
      this.state.squadCount = Math.max(1, Math.ceil(this.state.squadCount / 2));
      this.state.stats.maxSquad = this.state.squadCount;
    }
  }

  /** 打工图鉴：首次发现记一笔，结算时并入存档并奖励绩效 */
  discover(key: string): void {
    if (this.save.codex.indexOf(key) >= 0 || this.state.newCodex.indexOf(key) >= 0) return;
    this.state.newCodex.push(key);
    if (this.state.phase === 'PLAYING' && !this.tutorial.active) {
      this.spawnFloatingText(DESIGN_W * 0.5, 210, '图鉴 +1', PALETTE.paper, 13);
    }
  }

  /** 开局前确定出战角色：没解锁的回退到实习生；新手引导局固定用实习生 */
  private pickCharacter(tutorial = false): void {
    const want = getCharacter(this.save.selectedCharacter);
    this.char = !tutorial && isCharacterUnlocked(want, this.save) ? want : getCharacter('intern');
  }

  /** 当前构筑（生成三选一用） */
  get loadout(): Loadout {
    const st = this.state;
    return { character: st.character, activeWeapon: st.activeWeapon, weaponLevel: st.weaponLevel, sidearms: st.sidearms, affixes: st.affixes };
  }

  startNewRun(day = this.selectedDay, opts: { tutorial?: boolean } = {}): void {
    this.selectedDay = day;
    this.level = getLevel(day);
    this.activeTimeline = this.level.timeline;
    this.refreshTalents();
    this.resetWorldSubsystems();
    this.pickCharacter(opts.tutorial);
    this.enemies.seen.clear();

    this.state = this.createInitialState('PLAYING', false);
    this.applyOvertime(opts.tutorial ? 0 : Math.min(this.selectedOvertime, maxOvertime(this.save, this.char.id)));
    this.discover(`w:${this.state.activeWeapon}`);
    if (opts.tutorial) {
      // 教学局：多送 2 层护盾，前 15 秒的怪血量打折（见 stepDirector），先让新玩家爽起来
      this.tutorial.start(this);
      this.state.shieldCount = clamp(this.state.shieldCount + 2, 0, 5);
    } else {
      this.tutorial.stop();
    }
    this.uiCallbacks.onEnsureBoss?.({ bossId: this.level.bossId });
    this.squad.rebuildRenderUnits(this.state.squadCount);
    this.quips.trigger('CLEAN_START');
    this.uiCallbacks.onPhaseChange('PLAYING', this.state, this.save);
  }

  startEndlessRun(): void {
    this.tutorial.stop();
    this.refreshTalents();
    this.resetWorldSubsystems();
    this.pickCharacter();
    this.enemies.seen.clear();
    this.activeTimeline = EndlessDirector.generateWaveTimeline(1);
    this.state = this.createInitialState('PLAYING', true);
    this.applyOvertime(0);
    this.discover(`w:${this.state.activeWeapon}`);
    this.uiCallbacks.onEnsureBoss?.({ bossId: EndlessDirector.getBossForWave(1) });
    this.squad.rebuildRenderUnits(this.state.squadCount);
    this.quips.trigger('CLEAN_START');
    this.uiCallbacks.onPhaseChange('PLAYING', this.state, this.save);
  }

  /** 无尽模式击败 Boss 后选择三选一肉鸽强化并进入下一波 */
  pickUpgrade(index: number): void {
    if (this.state.phase !== 'UPGRADE_PICK') return;
    const opt = this.state.pendingUpgrades[index];
    if (!opt) return;

    this.state.pendingUpgrades = [];
    if (opt.kind === 'WEAPON' && opt.weaponId) {
      this.swapMainWeapon(opt.weaponId);
    } else if (opt.kind === 'MAIN_UP') {
      this.upgradeMainWeapon();
    } else if (opt.kind === 'SIDEARM' && opt.weaponId) {
      this.addSidearm(opt.weaponId);
    } else if (opt.kind === 'AFFIX' && opt.affixId) {
      this.state.affixes[opt.affixId] = (this.state.affixes[opt.affixId] || 0) + 1;
      this.discover(`a:${opt.affixId}`);
      const a = AFFIXES[opt.affixId];
      this.showBanner(`${opt.exclusive ? '{i:star} 专属' : '{i:sparkle}'} ${a.name}`, a.desc, a.color);
    } else if (opt.kind === 'SQUAD_BOOST') {
      this.state.squadCount = Math.round(this.state.squadCount * (opt.squadMult ?? 1.4));
      this.state.shieldCount = clamp(this.state.shieldCount + 2, 0, 5);
      this.state.stats.maxSquad = Math.max(this.state.stats.maxSquad, this.state.squadCount);
      this.showBanner('{i:box} 摸鱼外援空投', '小队扩编且补满护盾！', PALETTE.mint);
    }

    this.syncSynergies();

    // 主线补给箱：选完直接回到战斗
    if (this.state.upgradeSource === 'CRATE') {
      this.state.phase = 'PLAYING';
      this.quips.trigger('WEAPON_UPGRADE');
      this.uiCallbacks.onPhaseChange('PLAYING', this.state, this.save);
      return;
    }

    // 开启下一波无尽加班
    this.state.endlessWave += 1;
    this.state.elapsedSec = 0;
    this.state.hitstopTimer = 0;
    this.state.overloadEnemyTimer = 0;
    this.nextWaveIdx = 0;
    this.gates.reset();
    this.enemies.reset();
    this.combat.reset();
    this.activeTimeline = EndlessDirector.generateWaveTimeline(this.state.endlessWave);
    this.uiCallbacks.onEnsureBoss?.({ bossId: EndlessDirector.getBossForWave(this.state.endlessWave) });

    this.state.phase = 'PLAYING';
    this.audio.playGateGood();
    this.quips.trigger('ENDLESS_NEXT');
    this.squad.rebuildRenderUnits(this.state.squadCount);
    this.uiCallbacks.onPhaseChange('PLAYING', this.state, this.save);
  }

  /** 实习生换主武器；有「万金油」时旧武器变成外挂 */
  private swapMainWeapon(weaponId: WeaponId): void {
    const st = this.state;
    if (weaponId === st.activeWeapon) return;
    const old = st.activeWeapon;
    st.activeWeapon = weaponId;
    st.sidearms = st.sidearms.filter((sd) => sd.id !== weaponId);
    if (st.affixes.jack_of_all > 0 && !st.sidearms.some((sd) => sd.id === old)) {
      if (st.sidearms.length >= SIDEARM_MAX) st.sidearms.shift();
      st.sidearms.push({ id: old, level: 1 });
    }
    const w = WEAPONS[weaponId];
    this.discover(`w:${weaponId}`);
    if (st.weaponLevel >= 3) this.discover(`v:${weaponId}`);
    this.showBanner(`{i:swap} 换装 · ${weaponDisplayName(weaponId, st.weaponLevel)}`, w.desc, PALETTE.yellow);
  }

  /** 主武器强化：Lv.3 进化（顿帧 + 印章） */
  private upgradeMainWeapon(): void {
    const st = this.state;
    if (st.weaponLevel >= 3) return;
    st.weaponLevel += 1;
    const w = WEAPONS[st.activeWeapon];
    if (st.weaponLevel === 3) {
      this.discover(`v:${st.activeWeapon}`);
      st.hitstopTimer = Math.max(st.hitstopTimer, 0.08);
      this.fx.stamp('进 化 !', PALETTE.yellow);
      this.audio.playMilestone();
      this.showBanner(`{i:sparkle} 进化 · ${w.evolvedName}`, w.evolvedDesc, PALETTE.yellow);
    } else {
      this.showBanner(`{i:sparkle} ${w.shortTag} Lv.${st.weaponLevel}`, '伤害 +20%、射速 +10%', PALETTE.yellow);
    }
  }

  /** 外挂副武器：新装或升级（最多 2 个，满了替换最早的） */
  private addSidearm(weaponId: WeaponId): void {
    const st = this.state;
    const w = WEAPONS[weaponId];
    const have = st.sidearms.find((sd) => sd.id === weaponId);
    if (have) {
      have.level = Math.min(3, have.level + 1);
      this.showBanner(`{i:magnet} 外挂 ${w.shortTag} Lv.${have.level}`, '外挂火力 +25%', w.color);
      return;
    }
    if (st.sidearms.length >= SIDEARM_MAX) st.sidearms.shift();
    st.sidearms.push({ id: weaponId, level: 1 });
    st.stats.maxSidearms = Math.max(st.stats.maxSidearms, st.sidearms.length);
    this.discover(`w:${weaponId}`);
    this.showBanner(`{i:magnet} 外挂 · ${w.shortTag}`, '挂在小队两侧自动开火', w.color);
  }

  pause(): void {
    if (this.state.phase !== 'PLAYING') return;
    this.state.phase = 'PAUSED';
    this.audio.suspend();
    this.uiCallbacks.onPhaseChange('PAUSED', this.state, this.save);
  }

  resume(): void {
    if (this.state.phase !== 'PAUSED') return;
    this.state.phase = 'PLAYING';
    this.audio.resumeIfPlaying();
    this.uiCallbacks.onPhaseChange('PLAYING', this.state, this.save);
  }

  returnToMenu(): void {
    this.completeTutorial();
    this.resetWorldSubsystems();
    this.activeTimeline = this.level.timeline;
    this.state = this.createInitialState('MENU', false);
    this.squad.rebuildRenderUnits(this.state.squadCount);
    this.uiCallbacks.onPhaseChange('MENU', this.state, this.save);
  }

  toggleMute(): boolean {
    const next = !this.audio.isMuted;
    this.audio.setMuted(next);
    this.save.muted = next;
    void SaveManager.save(this.save);
    return next;
  }

  triggerUltimate(): void {
    if (this.state.phase !== 'PLAYING' || this.state.ultCharge < 100) return;
    const st = this.state;
    st.ultCharge = 0;
    st.ultStampTimer = 0.95;
    st.hitstopTimer = 0.045;
    this.ultIdleTimer = 0;

    this.audio.playUltimate();
    this.triggerShake(9, 0.24);
    this.quips.trigger('ULT_CAST');
    this.spawnFxBurst(DESIGN_W * 0.5, PLAYER_Y - 120, this.char.color, 28);
    this.spawnFxBurst(DESIGN_W * 0.5, PLAYER_Y - 120, PALETTE.mint, 22);

    switch (this.char.ult) {
      case 'clear_double':
        st.ultActiveTimer = 3.5;
        this.ultClear();
        break;
      case 'drop_db': {
        st.ultActiveTimer = 1.2;
        this.ultClear();
        const n = this.gates.flipAllRed();
        if (n > 0) this.state.stats.gatesFlipped += n;
        break;
      }
      case 'freeze':
        st.freezeTimer = 3;
        st.ultActiveTimer = 0.6;
        break;
      case 'big_pie': {
        // 画大饼：接下来 3 扇「+」门翻倍（次数刷新、不叠加，避免滚雪球）+ 3 秒画饼充饥无敌
        st.gateBoostCharges = 2;
        st.invulnTimer = Math.max(st.invulnTimer, 1.5);
        st.ultActiveTimer = 0.6;
        this.spawnFloatingText(projectX(this.squad.leaderLaneX, PLAYER_Y), PLAYER_Y - 40, '下 2 扇蓝门 +30%!', PALETTE.yellow, 17);
        break;
      }
      case 'rush':
        st.rushTimer = 6;
        st.ultActiveTimer = 0.6;
        break;
      case 'sweep_all': {
        st.ultActiveTimer = 1.2;
        const decals = this.fx.decals.length;
        this.ultClear();
        const beans = Math.min(40, decals);
        if (beans > 0) {
          st.stats.beansEarned += beans;
          this.spawnFloatingText(DESIGN_W * 0.5, PLAYER_Y - 90, `墨渍换豆 +${beans}`, PALETTE.coffee, 17);
        }
        this.fx.decals.length = 0;
        break;
      }
    }
  }

  /** 清屏类大招：清掉全部小怪与 Boss 弹幕，并对 Boss 造成伤害 */
  private ultClear(): void {
    const ctx = this.buildCombatContext();
    // 结算复盘：大招清掉的血量 + 对 Boss 的伤害都算在「大招」名下
    let ultDmg = 0;
    const list = this.enemies.enemies.activeItems;
    for (let i = 0; i < list.length; i++) if (list[i].active) ultDmg += Math.max(0, list[i].hp);
    const boss = this.bosses.boss;
    const bossHpBefore = boss.active ? boss.hp : 0;
    this.enemies.clearAll(ctx);
    this.bosses.ultBlast(ctx);
    if (boss.active) ultDmg += Math.max(0, bossHpBefore - boss.hp);
    this.state.stats.damage.ult += ultDmg;
  }

  step(dt: number): void {
    if (this.state.phase !== 'PLAYING') return;
    // Boss 死亡演出：整体慢动作
    if (this.bosses.boss.active && this.bosses.boss.dying > 0) dt *= 0.45;

    this.quips.step(dt);
    this.tutorial.update(dt, this);
    this.stepEffectsOnly(dt);

    if (this.state.hitstopTimer > 0) {
      this.state.hitstopTimer = Math.max(0, this.state.hitstopTimer - dt);
      return;
    }

    this.state.elapsedSec += dt;
    if (this.state.invulnTimer > 0) this.state.invulnTimer = Math.max(0, this.state.invulnTimer - dt);
    if (this.state.ultActiveTimer > 0) this.state.ultActiveTimer = Math.max(0, this.state.ultActiveTimer - dt);
    if (this.state.ultStampTimer > 0) this.state.ultStampTimer = Math.max(0, this.state.ultStampTimer - dt);
    if (this.state.bossBannerTimer > 0) this.state.bossBannerTimer = Math.max(0, this.state.bossBannerTimer - dt);
    if (this.state.hurtFlashTimer > 0) this.state.hurtFlashTimer = Math.max(0, this.state.hurtFlashTimer - dt);
    if (this.state.overloadEnemyTimer > 0) {
      this.state.overloadEnemyTimer = Math.max(0, this.state.overloadEnemyTimer - dt);
    }
    if (this.state.podOverclockTimer > 0) {
      this.state.podOverclockTimer = Math.max(0, this.state.podOverclockTimer - dt);
    }
    if (this.contactQuipTimer > 0) this.contactQuipTimer -= dt;
    if (this.state.banner) {
      this.state.banner.timer -= dt;
      if (this.state.banner.timer <= 0) this.state.banner = null;
    }
    if (this.state.hasteStacks > 0) this.state.hasteStacks = Math.max(0, this.state.hasteStacks - dt * 2.5);
    if (this.bosses.boss.active) this.state.stats.bossTimeSec += dt;
    if (this.state.muzzleFlashTimer > 0) {
      this.state.muzzleFlashTimer = Math.max(0, this.state.muzzleFlashTimer - dt);
    }
    if (this.state.comboTimer > 0) {
      this.state.comboTimer -= dt;
      if (this.state.comboTimer <= 0) {
        this.state.comboTimer = 0;
        this.state.comboCount = 0;
      }
    }

    if (this.state.ultCharge >= 100) {
      this.ultIdleTimer += dt;
      if (this.ultIdleTimer >= 5.0) {
        this.ultIdleTimer = 0;
        this.quips.trigger('ULT_READY_IDLE');
      }
    }

    if (this.killSpreeTimer > 0) {
      this.killSpreeTimer -= dt;
      if (this.killSpreeTimer <= 0) this.killSpreeCount = 0;
    }

    if (this.state.rushTimer > 0) this.state.rushTimer = Math.max(0, this.state.rushTimer - dt);
    // 带薪病假：定时补人
    if (this.state.affixes.sick_leave > 0) {
      this.sickLeaveTimer += dt;
      if (this.sickLeaveTimer >= 12) {
        this.sickLeaveTimer = 0;
        const add = 2 * this.state.affixes.sick_leave;
        this.state.squadCount += add;
        this.state.stats.maxSquad = Math.max(this.state.stats.maxSquad, this.state.squadCount);
        this.spawnFloatingText(projectX(this.squad.leaderLaneX, PLAYER_Y), PLAYER_Y - 44, `病假归队 +${add}`, PALETTE.mint, 14);
      }
    }

    this.squad.step(dt);

    const ctx = this.buildCombatContext();
    if (this.state.freezeTimer > 0) {
      // 五彩斑斓黑：除了小队和子弹，整个世界定格（关卡时间也停住）
      this.state.freezeTimer = Math.max(0, this.state.freezeTimer - dt);
      this.state.elapsedSec -= dt;
      this.combat.step(dt, this.enemies, this.bosses, this.gates, ctx);
      this.enemies.step(0, ctx);
    } else {
      this.stepDirector(ctx);
      this.gates.step(dt, this.squad.leaderLaneX, ctx);
      this.combat.step(dt, this.enemies, this.bosses, this.gates, ctx);
      this.enemies.step(dt, ctx);
      this.bosses.step(dt, ctx);
      this.horde.step(dt, this);
      this.stepFork(dt);
    }

    this.squad.rebuildRenderUnits(this.state.squadCount);
  }

  /** 分岔隔离带：随路面滚动；头部到达小队时锁边，尾部过去后解锁；隔离带两侧的怪不会越线 */
  private stepFork(dt: number): void {
    const f = this.fork;
    if (!f) return;
    f.headY += SCROLL_SPEED * dt;
    f.tailY += SCROLL_SPEED * dt;
    if (f.side === 0 && f.headY >= PLAYER_Y - 12) {
      f.side = this.squad.leaderLaneX < 0 ? -1 : 1;
      if (f.side < 0) this.squad.setBounds(-LEADER_MAX_X, -FORK_GAP);
      else this.squad.setBounds(FORK_GAP, LEADER_MAX_X);
      const kpi = (f.kpiSide === 'LEFT') === f.side < 0;
      if (kpi) this.state.stats.kpiRoads += 1;
      this.showBanner(kpi ? '{i:flame} 走上 KPI 路' : '{i:cup} 拐进摸鱼路', kpi ? '怪多精英多，收益也高' : '稳稳当当，收益一般', kpi ? PALETTE.red : PALETTE.mint);
    }
    if (f.tailY >= PLAYER_Y + 30) {
      this.squad.clearBounds();
      this.fork = null;
      return;
    }
    const list = this.enemies.enemies.activeItems;
    for (let i = 0; i < list.length; i++) {
      const e = list[i];
      if (!e.active || e.y > f.headY || e.y < f.tailY) continue;
      const lim = FORK_GAP - 4 + e.radius * 0.4;
      if (Math.abs(e.laneX) < lim) e.laneX = (e.laneX < 0 ? -1 : 1) * lim;
    }
  }

  private stepDirector(ctx: CombatContext): void {
    const timeline = this.activeTimeline;
    while (this.nextWaveIdx < timeline.length) {
      const wave = timeline[this.nextWaveIdx];
      if (this.state.elapsedSec < wave.timeOffsetSec) break;
      this.nextWaveIdx++;

      if (wave.type === 'GATE_PAIR' || wave.type === 'BARREL') {
        if (wave.gates) this.gates.spawnFromConfigs(this.state.overtime >= 2 ? this.addRedGate(wave.gates) : wave.gates);
      } else if (wave.type === 'ENEMY_SWARM' && wave.enemySpawn) {
        this.enemies.spawnSwarm(
          wave.enemySpawn.enemyId,
          wave.enemySpawn.count,
          wave.enemySpawn.formation,
          wave.enemySpawn.hpScale * (this.tutorial.active && wave.timeOffsetSec < 15 ? 0.6 : 1),
          wave.enemySpawn.laneCenter
        );
      } else if (wave.type === 'FORK' && wave.fork) {
        // 分岔：隔离带从路的尽头滚下来，抵达小队时锁定所在的一侧
        this.fork = {
          headY: TRACK_TOP_Y - 20,
          tailY: TRACK_TOP_Y - 20 - wave.fork.duration * SCROLL_SPEED,
          kpiSide: wave.fork.kpiSide,
          side: 0
        };
        this.quips.say(`前方分岔！${wave.fork.kpiSide === 'LEFT' ? '左' : '右'}边 KPI 路怪多但收益高，另一边摸鱼路稳一点`, 'CHAT', 'hype');
      } else if (wave.type === 'BOSS' && wave.bossId) {
        this.state.bossBannerTimer = 2.4;
        this.discover(`b:${wave.bossId}`);
        const hpScale = this.state.isEndless
          ? 1 + (this.state.endlessWave - 1) * 0.32
          : 1 + (this.level.day - 1) * 0.3;
        this.bosses.spawn(wave.bossId, hpScale, ctx);
      }
    }
  }

  /** 加班强度 2：一半的「两扇都是蓝门」的门段，把较差的那扇换成需要射穿的红门 */
  private addRedGate(gates: GateConfig[]): GateConfig[] {
    if (gates.length !== 2 || Math.random() < 0.5) return gates;
    const blue = (g: GateConfig) => g.initialOp === '+' || g.initialOp === '×';
    if (!blue(gates[0]) || !blue(gates[1])) return gates;
    const k = gates[0].initialOp === '+' && (gates[1].initialOp === '×' || gates[0].value <= gates[1].value) ? 0 : 1;
    const g = gates[k];
    if (g.initialOp !== '+') return gates;
    const red: GateConfig = { ...g, kind: 'SUB', initialOp: '-', value: Math.max(4, g.value), shootableToFlip: true, flipHpPerStep: 14 };
    return k === 0 ? [red, gates[1]] : [gates[0], red];
  }

  private syncSynergies(): void {
    const prevSet = new Set(this.state.synergies);
    const nextList = computeActiveSynergies(this.state.activeWeapon, this.state.affixes);
    this.state.synergies = nextList;

    for (const id of nextList) {
      if (!prevSet.has(id)) {
        const cfg = SYNERGIES[id];
        this.discover(`s:${id}`);
        this.state.hitstopTimer = Math.max(this.state.hitstopTimer, 0.04);
        this.audio.playGateFlip();
        this.showBanner(`{i:flask} 化学反应 · ${cfg.name}`, cfg.desc, PALETTE.purple);
        this.quips.trigger('SYNERGY_UNLOCKED');
        break;
      }
    }
  }

  private stepEffectsOnly(dt: number): void {
    if (this.state.shakeTimer > 0) {
      this.state.shakeTimer = Math.max(0, this.state.shakeTimer - dt);
    }

    this.fx.step(dt);

    const pItems = this.particles.activeItems;
    for (let i = 0; i < pItems.length; i++) {
      const p = pItems[i];
      if (!p.active) continue;
      p.life += dt;
      if (p.life >= p.maxLife) {
        p.active = false;
        continue;
      }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 260 * dt;
      p.rot += p.vRot * dt;
    }
    this.particles.sweepInactive();

    const fItems = this.floatingTexts.activeItems;
    for (let i = 0; i < fItems.length; i++) {
      const f = fItems[i];
      if (!f.active) continue;
      f.life += dt;
      if (f.life >= f.maxLife) {
        f.active = false;
        continue;
      }
      f.y += f.vy * dt;
      if (f.scalePop > 1) {
        f.scalePop = Math.max(1, f.scalePop - dt * 2.5);
      }
    }
    this.floatingTexts.sweepInactive();
  }

  private buildCombatContext(): CombatContext {
    return {
      leaderLaneX: this.squad.leaderLaneX,
      squadCount: this.state.squadCount,
      shieldCount: this.state.shieldCount,
      squadHalfW: this.squad.footprintHalfW,
      squadTopY: PLAYER_Y + this.squad.footprintTopDy,
      squadBottomY: PLAYER_Y + this.squad.footprintBottomDy,
      ultActiveTimer: this.state.ultActiveTimer,
      invulnTimer: this.state.invulnTimer,
      overloadEnemyTimer: this.state.overloadEnemyTimer,
      podOverclockTimer: this.state.podOverclockTimer,
      activeWeapon: this.state.activeWeapon,
      affixes: this.state.affixes,
      activeSynergies: this.state.synergies,
      damageMult: this.talentFx.damageMult * this.char.mods.damageMult * (this.state.freezeTimer > 0 ? 1.5 : 1),
      mods: this.char.mods,
      weaponLevel: this.state.weaponLevel,
      sidearms: this.state.sidearms,
      rushTimer: this.state.rushTimer,
      sweepChance: this.char.mods.sweepChance,
      stealSquad: (n) => {
        if (this.state.shieldCount > 0) {
          this.state.shieldCount -= 1;
          return 0;
        }
        const got = Math.max(0, Math.min(n, this.state.squadCount - 1));
        this.state.squadCount -= got;
        if (got > 0) {
          this.state.stats.hitsTaken += 1;
          this.audio.playGateBad();
        }
        return got;
      },
      returnSquad: (n) => {
        this.state.squadCount += n;
        this.state.stats.stolenBack += n;
        this.state.stats.maxSquad = Math.max(this.state.stats.maxSquad, this.state.squadCount);
        this.audio.playGateGood();
      },
      onSwept: () => {
        if (this.state.affixes.trash_sort > 0) {
          this.state.stats.beansEarned += 2;
          if (Math.random() < 0.1 && this.state.shieldCount < 5) this.state.shieldCount += 1;
        }
      },
      adjustGain: (gain, isMult) => {
        // 蓝门收益：职业倍率 → 需求变更随机加成 → 画大饼翻倍；顺带给「转正答辩」计数
        // × 门本身就会滚雪球，职业倍率只按 40% 生效，翻倍也只作用于 + 门
        const m = this.char.mods.blueGateMult;
        let g = gain * (isMult ? 1 + (m - 1) * 0.4 : m);
        if (this.state.affixes.scope_creep > 0) g *= 1 + Math.random() * (isMult ? 0.15 : 0.3);
        if (!isMult && this.state.gateBoostCharges > 0) {
          this.state.gateBoostCharges -= 1;
          g *= 1.3;
        }
        if (this.state.affixes.regularize > 0) {
          this.blueGateCounter += 1;
          if (this.blueGateCounter % 3 === 0 && this.state.shieldCount < 5) this.state.shieldCount += 1;
        }
        return Math.max(1, Math.round(g));
      },
      lossMult: this.talentFx.lossMult,
      hasteMult: 1 + Math.min(20, this.state.hasteStacks) * 0.025 * this.state.affixes.kill_haste,
      setSquadCount: (next) => {
        this.state.squadCount = Math.max(0, Math.floor(next));
        if (this.state.squadCount > this.state.stats.maxSquad) {
          this.state.stats.maxSquad = this.state.squadCount;
        }
      },
      addShield: (delta) => {
        this.state.shieldCount = clamp(this.state.shieldCount + delta, 0, 5);
      },
      addUltCharge: (delta) => {
        this.state.ultCharge = clamp(this.state.ultCharge + delta * this.char.mods.ultChargeMult, 0, 100);
      },
      openCrate: (reward) => {
        // 无尽模式保持固定掉落（它在 Boss 后已有三选一），只有主线补给箱弹三选一
        if (this.state.isEndless || this.state.phase !== 'PLAYING') return false;
        const options = generateUpgrades(this.loadout, reward);
        if (options.length === 0) return false;
        this.state.pendingUpgrades = options;
        this.state.upgradeSource = 'CRATE';
        this.state.phase = 'UPGRADE_PICK';
        this.audio.playGateFlip();
        this.uiCallbacks.onPhaseChange('UPGRADE_PICK', this.state, this.save);
        return true;
      },
      setWeapon: (weaponId) => {
        // 无尽模式的固定掉落：实习生换主武器；专精角色同款 → 强化，其他 → 外挂
        if (weaponId === this.state.activeWeapon) this.upgradeMainWeapon();
        else if (this.char.mods.canSwapMain) this.swapMainWeapon(weaponId);
        else this.addSidearm(weaponId);
        this.syncSynergies();
      },
      grantAffix: (affixId) => {
        this.state.affixes[affixId] = (this.state.affixes[affixId] || 0) + 1;
        this.discover(`a:${affixId}`);
        const a = AFFIXES[affixId];
        const lv = this.state.affixes[affixId];
        this.showBanner(`{i:sparkle} ${a.name}${lv > 1 ? ` Lv.${lv}` : ''}`, a.desc, a.color);
        this.syncSynergies();
      },
      addBeans: (amount) => {
        this.state.stats.beansEarned += amount;
      },
      triggerOverload: (durationSec) => {
        this.state.overloadEnemyTimer = Math.max(this.state.overloadEnemyTimer, durationSec);
      },
      triggerPodOverclock: () => {
        this.state.podOverclockTimer = 2.5;
      },
      setInvuln: (sec) => {
        this.state.invulnTimer = sec;
      },
      consumeShieldOrSquad: (rawLoss) => {
        if (this.state.phase !== 'PLAYING') return;
        const loss = Math.max(1, Math.round(rawLoss * this.talentFx.lossMult));
        const px = projectX(this.squad.leaderLaneX, PLAYER_Y);
        if (this.state.shieldCount > 0) {
          this.state.shieldCount -= 1;
          this.audio.playGateGood();
          this.spawnFxBurst(px, PLAYER_Y, PALETTE.mint, 12);
          this.spawnFloatingText(px, PLAYER_Y - 30, '护盾格挡!', PALETTE.mint, 15);
          return;
        }

        const next = Math.max(0, this.state.squadCount - loss);
        this.state.squadCount = next;
        this.state.stats.hitsTaken += 1;
        this.state.hurtFlashTimer = 0.25;
        this.audio.playGateBad();
        this.triggerShake(4 + Math.min(4, loss * 0.5), 0.16);
        if (this.contactQuipTimer <= 0 && this.state.squadCount > 0) {
          this.contactQuipTimer = 14;
          this.quips.trigger('CONTACT_LOSS');
        }
        this.spawnFxBurst(px, PLAYER_Y, PALETTE.red, 14);
        this.spawnFloatingText(px, PLAYER_Y - 28, `-${loss}`, PALETTE.red, 17);

        if (next <= 0) {
          this.finishRun(false);
        }
      },
      spawnSupportGate: (cfg) => {
        this.gates.spawnFromConfigs([cfg]);
      },
      spawnAmbushMini: (laneX, _y) => {
        this.enemies.spawnSwarm('client_mini', 4, 'CLUSTER', 1.0, laneX);
      },
      spawnFxBurst: (x, y, color, count) => {
        this.spawnFxBurst(x, y, color, count);
      },
      spawnFloatingText: (x, y, text, color, size = 14) => {
        this.spawnFloatingText(x, y, text, color, size);
      },
      triggerShake: (mag, sec) => {
        this.triggerShake(mag, sec);
      },
      triggerHitstop: (sec) => {
        this.state.hitstopTimer = Math.max(this.state.hitstopTimer, sec);
      },
      triggerQuip: (ev) => {
        this.quips.trigger(ev);
      },
      sayQuip: (text) => {
        this.quips.say(text);
      },
      onGateFlipped: () => {
        this.state.stats.gatesFlipped += 1;
      },
      flashScreen: (sec) => {
        this.fx.flash = Math.max(this.fx.flash, sec);
      },
      spawnBlast: (x, y, r, color) => {
        this.fx.addBlast(x, y, r, color);
      },
      spawnScorch: (x, y, size) => {
        this.fx.addScorch(x, y, size);
      },
      onEnemyDied: (e, byPlayer) => {
        this.fx.onEnemyDied(e, byPlayer);
      },
      onEnemyKilled: (beans, ult) => {
        this.state.stats.kills += 1;
        this.fx.onKillCount(this.state.stats.kills);
        this.state.stats.beansEarned += this.state.affixes.double_commission > 0 ? beans * 2 : beans;
        if (this.state.isEndless) this.state.endlessScore += 10 * this.state.endlessWave;
        this.state.ultCharge = clamp(this.state.ultCharge + ult * this.char.mods.ultChargeMult, 0, 100);
        this.state.comboCount += 1;
        this.state.comboTimer = 2.4;
        this.killSpreeCount += 1;
        this.killSpreeTimer = 4.0;
        if (this.state.affixes.kill_haste > 0) {
          this.state.hasteStacks = Math.min(20, this.state.hasteStacks + 1);
        }
        if (this.state.affixes.vamp_shield > 0) {
          this.state.vampKillCounter += 1;
          const need = Math.max(12, 30 - 6 * (this.state.affixes.vamp_shield - 1));
          if (this.state.vampKillCounter >= need) {
            this.state.vampKillCounter = 0;
            if (this.state.shieldCount < 5) {
              this.state.shieldCount += 1;
              const px = projectX(this.squad.leaderLaneX, PLAYER_Y);
              this.spawnFloatingText(px, PLAYER_Y - 50, '+1 摸鱼盾', PALETTE.mint, 14);
            }
          }
        }
        if (this.killSpreeCount >= 22) {
          this.killSpreeCount = 0;
          this.quips.trigger('KILL_SPREE');
        }
      },
      onBossKilled: (beans) => {
        this.state.stats.beansEarned += beans;
        if (this.state.isEndless) {
          this.state.endlessScore += 200 * this.state.endlessWave;
          this.state.pendingUpgrades = generateUpgrades(this.loadout);
          this.state.upgradeSource = 'ENDLESS_BOSS';
          this.state.phase = 'UPGRADE_PICK';
          this.audio.playVictory();
          this.uiCallbacks.onPhaseChange('UPGRADE_PICK', this.state, this.save);
          return;
        }
        this.finishRun(true);
      },
      recordDamage: (src, amount) => {
        this.state.stats.damage[src] += amount;
      },
      onCritDamage: (dmg) => {
        if (dmg > this.state.stats.maxCritDamage) {
          this.state.stats.maxCritDamage = dmg;
        }
      },
      onFiredShot: () => {
        this.state.muzzleFlashTimer = 0.07;
      }
    };
  }

  /** 尸潮高峰来袭：警报条 + 警报音 + 震动 */
  announceSurge(): void {
    this.fx.surgeBanner = 1.7;
    this.audio.playGateBad();
    this.audio.vibrate([20, 40, 20]);
    this.triggerShake(4, 0.2);
  }

  /** 首局结束（或中途退出）即视为完成新手引导 */
  private completeTutorial(): void {
    if (!this.tutorial.active) return;
    this.tutorial.stop();
    this.save.tutorialDone = true;
    void SaveManager.save(this.save);
  }

  private finishRun(victory: boolean): void {
    if (this.state.phase === 'VICTORY' || this.state.phase === 'DEFEAT') return;
    if (this.tutorial.active) {
      this.tutorial.stop();
      this.save.tutorialDone = true;
    }
    this.state.phase = victory ? 'VICTORY' : 'DEFEAT';
    const firstClear = victory && !this.state.isEndless && this.level.day > this.save.highestCleared;

    if (victory) {
      this.audio.playVictory();
      this.save.totalClears += 1;
      if (!this.state.isEndless && this.level.day > this.save.highestCleared) {
        this.save.highestCleared = this.level.day;
      }
      if (!this.state.isEndless && this.level.day < LEVELS.length) {
        this.selectedDay = this.level.day + 1;
      }
    } else {
      this.audio.playDefeat();
    }

    if (this.state.isEndless) {
      if (this.state.endlessWave > this.save.endlessBestWave) {
        this.save.endlessBestWave = this.state.endlessWave;
      }
      if (this.state.endlessScore > this.save.endlessBestScore) {
        this.save.endlessBestScore = this.state.endlessScore;
      }
    }

    // 加班强度：在强度 N 通关周五 → 记下该角色的最高强度（印章），并解锁 N+1
    const ot = this.state.overtime;
    if (victory && !this.state.isEndless && isChapterFinal(this.level.day)) {
      const prevMax = maxOvertime(this.save, this.char.id);
      if (ot > (this.save.overtime[this.char.id] || 0)) this.save.overtime[this.char.id] = ot;
      const newMax = maxOvertime(this.save, this.char.id);
      if (newMax > prevMax) this.state.overtimeUnlocked = newMax;
    }
    const otReward = OVERTIME_LEVELS[ot].reward;

    this.state.stats.beansEarned = Math.round(
      this.state.stats.beansEarned * this.talentFx.beanMult * this.char.mods.beanMult * otReward
    );
    this.save.coffeeBeans += this.state.stats.beansEarned;
    if (this.state.stats.maxSquad > this.save.bestSquad) {
      this.save.bestSquad = this.state.stats.maxSquad;
    }
    if (this.state.stats.kills > this.save.bestKills) this.save.bestKills = this.state.stats.kills;

    // 打工图鉴：并入本局遇到的敌人 + 新发现条目
    this.enemies.seen.forEach((id) => this.discover(`e:${id}`));
    const fresh = this.state.newCodex.filter((k) => this.save.codex.indexOf(k) < 0);
    this.save.codex.push(...fresh);

    const lines = computeRunXp(this.state, victory, firstClear);
    if (otReward > 1) {
      const base = lines.reduce((a, l) => a + l.xp, 0);
      lines.push({ label: `加班强度 ${ot} · 绩效 ×${otReward}`, xp: Math.round(base * (otReward - 1)) });
    }
    if (fresh.length > 0) lines.push({ label: `图鉴新发现 ×${fresh.length}`, xp: fresh.length * CODEX_XP });
    this.state.xpResult = applyRunXp(this.save, lines);
    this.state.newlyUnlockedBadges = evaluateNewBadges(this.state, this.save, victory);
    void SaveManager.save(this.save);
    this.uiCallbacks.onPhaseChange(this.state.phase, this.state, this.save);
  }

  private showBanner(title: string, sub: string, color: string): void {
    this.state.banner = { title, sub, color, timer: 1.9 };
  }

  get bossBannerText(): string {
    const bossId = this.state.isEndless
      ? EndlessDirector.getBossForWave(this.state.endlessWave)
      : this.level.bossId;
    return BOSSES[bossId].banner;
  }

  private triggerShake(mag: number, sec: number): void {
    this.state.shakeMagnitude = Math.max(this.state.shakeMagnitude, mag);
    this.state.shakeTimer = Math.max(this.state.shakeTimer, sec);
  }

  private spawnFxBurst(x: number, y: number, color: string, count: number): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.activeCount >= (this.lowFx ? MAX_ACTIVE_PARTICLES_LOW : MAX_ACTIVE_PARTICLES)) break;
      const p = this.particles.acquire();
      const ang = Math.random() * Math.PI * 2;
      const spd = 65 + Math.random() * 170;
      p.x = x;
      p.y = y;
      p.vx = Math.cos(ang) * spd;
      p.vy = Math.sin(ang) * spd - 60;
      p.size = 4 + Math.random() * 5;
      p.maxLife = 0.25 + Math.random() * 0.25;
      p.color = color;
      p.shape = i % 3 === 0 ? 'star' : 'square';
      p.vRot = (Math.random() - 0.5) * 14;
    }
  }

  private spawnFloatingText(x: number, y: number, text: string, color: string, size = 14): void {
    const f = this.floatingTexts.acquire();
    f.x = clamp(x, 48, DESIGN_W - 48);
    f.y = y;
    f.vy = -44;
    f.text = text;
    f.color = color;
    f.size = size;
    f.maxLife = 0.72;
    f.scalePop = 1.32;
  }
}
