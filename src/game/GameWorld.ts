import { evaluateNewBadges } from '../data/badges';
import { BOSSES } from '../data/enemies';
import { getLevel, LEVELS } from '../data/levels';
import { PALETTE } from '../data/palette';
import { computeActiveSynergies, SYNERGIES } from '../data/synergies';
import { computeTalentEffects, type TalentEffects } from '../data/talents';
import { AFFIXES, WEAPONS } from '../data/weapons';
import type { AudioEngine } from '../engine/AudioEngine';
import { ObjectPool } from '../engine/ObjectPool';
import { clamp, DESIGN_W, PLAYER_Y, projectX } from '../engine/Viewport';
import { SaveManager } from '../storage/SaveManager';
import { BossSystem } from './BossSystem';
import { CombatSystem, type CombatContext } from './CombatSystem';
import { ENDLESS_WAVE_DURATION_SEC, EndlessDirector } from './EndlessDirector';
import { EnemySystem } from './EnemySystem';
import { GateSystem } from './GateSystem';
import { QuipSystem } from './QuipSystem';
import { SquadSystem } from './SquadSystem';
import type { ActiveQuip } from '../data/quips';
import type {
  FloatingText,
  GamePhase,
  GameState,
  LevelConfig,
  LevelWaveConfig,
  Particle,
  SaveData
} from './types';

const MAX_ACTIVE_PARTICLES = 200;

export interface WorldUICallbacks {
  onPhaseChange: (phase: GamePhase, state: GameState, save: SaveData) => void;
  onQuipChange: (quip: ActiveQuip | null) => void;
  onEnsureBoss?: (dayOrBossId: { bossId: keyof typeof BOSSES }) => void;
}

export class GameWorld {
  public readonly squad = new SquadSystem();
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
  public level: LevelConfig = LEVELS[0];
  private activeTimeline: LevelWaveConfig[] = LEVELS[0].timeline;
  private talentFx: TalentEffects;

  constructor(
    public readonly audio: AudioEngine,
    private readonly uiCallbacks: WorldUICallbacks
  ) {
    this.save = SaveManager.load();
    this.audio.setMuted(this.save.muted);

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
    const startSquad = 4 + this.talentFx.startSquadBonus;
    return {
      phase,
      levelDay: isEndless ? 1 : this.level.day,
      isEndless,
      endlessWave: 1,
      endlessScore: 0,
      elapsedSec: 0,
      trackDurationSec: isEndless ? ENDLESS_WAVE_DURATION_SEC : this.level.durationSec,
      squadCount: startSquad,
      shieldCount: clamp(1 + this.talentFx.startShieldBonus, 0, 5),
      ultCharge: 0,
      ultActiveTimer: 0,
      ultStampTimer: 0,
      activeWeapon: 'stapler',
      affixes: {
        split: 0,
        ricochet: 0,
        pierce: 0,
        chill: 0,
        chain_lightning: 0,
        crit_rage: 0,
        kill_haste: 0,
        vamp_shield: 0
      },
      synergies: [],
      pendingUpgrades: [],
      upgradeSource: 'ENDLESS_BOSS',
      newlyUnlockedBadges: [],
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
        bossTimeSec: 0
      }
    };
  }

  selectDay(day: number): void {
    const maxDay = Math.min(LEVELS.length, this.save.highestCleared + 1);
    this.selectedDay = clamp(Math.floor(day), 1, maxDay);
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
    this.selectedDay = Math.min(LEVELS.length, this.save.highestCleared + 1);
    if (this.state.phase === 'MENU') {
      this.uiCallbacks.onPhaseChange('MENU', this.state, this.save);
    }
  }

  private resetWorldSubsystems(): void {
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
  }

  startNewRun(day = this.selectedDay): void {
    this.selectedDay = day;
    this.level = getLevel(day);
    this.activeTimeline = this.level.timeline;
    this.refreshTalents();
    this.resetWorldSubsystems();

    this.state = this.createInitialState('PLAYING', false);
    this.uiCallbacks.onEnsureBoss?.({ bossId: this.level.bossId });
    this.squad.rebuildRenderUnits(this.state.squadCount);
    this.quips.trigger('CLEAN_START');
    this.uiCallbacks.onPhaseChange('PLAYING', this.state, this.save);
  }

  startEndlessRun(): void {
    this.refreshTalents();
    this.resetWorldSubsystems();
    this.activeTimeline = EndlessDirector.generateWaveTimeline(1);
    this.state = this.createInitialState('PLAYING', true);
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
    if (opt.kind === 'WEAPON' && opt.weaponId && opt.affixId) {
      // 补给箱组合牌：换武器 + 词条
      this.state.activeWeapon = opt.weaponId;
      this.state.affixes[opt.affixId] = (this.state.affixes[opt.affixId] || 0) + 1;
      const w = WEAPONS[opt.weaponId];
      const a = AFFIXES[opt.affixId];
      this.showBanner(`{i:swap} ${w.shortTag} + {i:sparkle} ${a.name}`, a.desc, PALETTE.yellow);
    } else if (opt.kind === 'WEAPON' && opt.weaponId) {
      this.state.activeWeapon = opt.weaponId;
      const w = WEAPONS[opt.weaponId];
      this.showBanner(`{i:swap} 换装 · ${w.name} (${w.traitBadge})`, w.desc, PALETTE.yellow);
    } else if (opt.kind === 'AFFIX' && opt.affixId) {
      this.state.affixes[opt.affixId] = (this.state.affixes[opt.affixId] || 0) + 1;
      const a = AFFIXES[opt.affixId];
      this.showBanner(`{i:sparkle} ${a.name}`, a.desc, a.color);
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
    this.state.ultCharge = 0;
    this.state.ultActiveTimer = 3.5;
    this.state.ultStampTimer = 0.95;
    this.state.hitstopTimer = 0.045;
    this.ultIdleTimer = 0;

    this.audio.playUltimate();
    this.triggerShake(9, 0.24);
    this.quips.trigger('ULT_CAST');
    this.spawnFxBurst(DESIGN_W * 0.5, PLAYER_Y - 120, PALETTE.yellow, 28);
    this.spawnFxBurst(DESIGN_W * 0.5, PLAYER_Y - 120, PALETTE.mint, 22);

    const ctx = this.buildCombatContext();
    this.enemies.clearAll(ctx);
    this.bosses.ultBlast(ctx);
  }

  step(dt: number): void {
    if (this.state.phase !== 'PLAYING') return;

    this.quips.step(dt);
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

    this.squad.step(dt);

    const ctx = this.buildCombatContext();
    this.stepDirector(ctx);
    this.gates.step(dt, this.squad.leaderLaneX, ctx);
    this.combat.step(dt, this.enemies, this.bosses, this.gates, ctx);
    this.enemies.step(dt, ctx);
    this.bosses.step(dt, ctx);

    this.squad.rebuildRenderUnits(this.state.squadCount);
  }

  private stepDirector(ctx: CombatContext): void {
    const timeline = this.activeTimeline;
    while (this.nextWaveIdx < timeline.length) {
      const wave = timeline[this.nextWaveIdx];
      if (this.state.elapsedSec < wave.timeOffsetSec) break;
      this.nextWaveIdx++;

      if (wave.type === 'GATE_PAIR' || wave.type === 'BARREL') {
        if (wave.gates) this.gates.spawnFromConfigs(wave.gates);
      } else if (wave.type === 'ENEMY_SWARM' && wave.enemySpawn) {
        this.enemies.spawnSwarm(
          wave.enemySpawn.enemyId,
          wave.enemySpawn.count,
          wave.enemySpawn.formation,
          wave.enemySpawn.hpScale,
          wave.enemySpawn.laneCenter
        );
      } else if (wave.type === 'BOSS' && wave.bossId) {
        this.state.bossBannerTimer = 2.4;
        const hpScale = this.state.isEndless
          ? 1 + (this.state.endlessWave - 1) * 0.32
          : 1 + (this.level.day - 1) * 0.3;
        this.bosses.spawn(wave.bossId, hpScale, ctx);
      }
    }
  }

  private syncSynergies(): void {
    const prevSet = new Set(this.state.synergies);
    const nextList = computeActiveSynergies(this.state.activeWeapon, this.state.affixes);
    this.state.synergies = nextList;

    for (const id of nextList) {
      if (!prevSet.has(id)) {
        const cfg = SYNERGIES[id];
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
      damageMult: this.talentFx.damageMult,
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
        this.state.ultCharge = clamp(this.state.ultCharge + delta, 0, 100);
      },
      openCrate: (reward) => {
        // 无尽模式保持固定掉落（它在 Boss 后已有三选一），只有主线补给箱弹三选一
        if (this.state.isEndless || this.state.phase !== 'PLAYING') return false;
        const options = EndlessDirector.generateCrateUpgrades(this.state.activeWeapon, this.state.affixes, reward);
        if (options.length === 0) return false;
        this.state.pendingUpgrades = options;
        this.state.upgradeSource = 'CRATE';
        this.state.phase = 'UPGRADE_PICK';
        this.audio.playGateFlip();
        this.uiCallbacks.onPhaseChange('UPGRADE_PICK', this.state, this.save);
        return true;
      },
      setWeapon: (weaponId) => {
        this.state.activeWeapon = weaponId;
        const w = WEAPONS[weaponId];
        this.showBanner(`{i:swap} 换装 · ${w.name} (${w.traitBadge})`, w.desc, PALETTE.yellow);
        this.syncSynergies();
      },
      grantAffix: (affixId) => {
        this.state.affixes[affixId] = (this.state.affixes[affixId] || 0) + 1;
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
      onEnemyKilled: (beans, ult) => {
        this.state.stats.kills += 1;
        this.state.stats.beansEarned += beans;
        if (this.state.isEndless) this.state.endlessScore += 10 * this.state.endlessWave;
        this.state.ultCharge = clamp(this.state.ultCharge + ult, 0, 100);
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
          this.state.pendingUpgrades = EndlessDirector.generateUpgrades(
            this.state.activeWeapon,
            this.state.affixes
          );
          this.state.upgradeSource = 'ENDLESS_BOSS';
          this.state.phase = 'UPGRADE_PICK';
          this.audio.playVictory();
          this.uiCallbacks.onPhaseChange('UPGRADE_PICK', this.state, this.save);
          return;
        }
        this.finishRun(true);
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

  private finishRun(victory: boolean): void {
    if (this.state.phase === 'VICTORY' || this.state.phase === 'DEFEAT') return;
    this.state.phase = victory ? 'VICTORY' : 'DEFEAT';

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

    this.state.stats.beansEarned = Math.round(this.state.stats.beansEarned * this.talentFx.beanMult);
    this.save.coffeeBeans += this.state.stats.beansEarned;
    if (this.state.stats.maxSquad > this.save.bestSquad) {
      this.save.bestSquad = this.state.stats.maxSquad;
    }
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
      if (this.particles.activeCount >= MAX_ACTIVE_PARTICLES) break;
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
