import { DAY1_DURATION_SEC, DAY1_TIMELINE } from '../data/levels/day1';
import { PALETTE } from '../data/palette';
import { AFFIXES } from '../data/weapons';
import type { AudioEngine } from '../engine/AudioEngine';
import { ObjectPool } from '../engine/ObjectPool';
import { clamp, DESIGN_W, PLAYER_Y, projectX } from '../engine/Viewport';
import { SaveManager } from '../storage/SaveManager';
import { CombatSystem, type CombatContext } from './CombatSystem';
import { EnemySystem } from './EnemySystem';
import { GateSystem } from './GateSystem';
import { QuipSystem } from './QuipSystem';
import { SquadSystem } from './SquadSystem';
import type { FloatingText, GamePhase, GameState, Particle, SaveData } from './types';

const MAX_ACTIVE_PARTICLES = 200;

export interface WorldUICallbacks {
  onPhaseChange: (phase: GamePhase, state: GameState, save: SaveData) => void;
  onQuipChange: (text: string | null) => void;
}

export class GameWorld {
  public readonly squad = new SquadSystem();
  public readonly gates: GateSystem;
  public readonly enemies: EnemySystem;
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

  constructor(
    public readonly audio: AudioEngine,
    private readonly uiCallbacks: WorldUICallbacks
  ) {
    this.save = SaveManager.load();
    this.audio.setMuted(this.save.muted);

    this.gates = new GateSystem(audio);
    this.enemies = new EnemySystem(audio);
    this.combat = new CombatSystem(audio);
    this.quips = new QuipSystem(uiCallbacks.onQuipChange);

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

    this.state = this.createInitialState('MENU');
    this.squad.rebuildRenderUnits(this.state.squadCount);
  }

  private createInitialState(phase: GamePhase): GameState {
    return {
      phase,
      levelDay: 1,
      elapsedSec: 0,
      trackDurationSec: DAY1_DURATION_SEC,
      squadCount: 4,
      shieldCount: 1,
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
      boss: this.enemies.boss,
      bossBannerTimer: 0,
      hitstopTimer: 0,
      invulnTimer: 0,
      shakeTimer: 0,
      shakeMagnitude: 0,
      comboCount: 0,
      comboTimer: 0,
      muzzleFlashTimer: 0,
      stats: {
        maxSquad: 4,
        kills: 0,
        gatesFlipped: 0,
        beansEarned: 0,
        maxCritDamage: 0
      }
    };
  }

  startNewRun(): void {
    this.gates.reset();
    this.enemies.reset();
    this.combat.reset();
    this.squad.reset();
    this.quips.reset();
    this.particles.releaseAll();
    this.floatingTexts.releaseAll();

    this.nextWaveIdx = 0;
    this.ultIdleTimer = 0;
    this.killSpreeCount = 0;
    this.killSpreeTimer = 0;

    this.state = this.createInitialState('PLAYING');
    this.squad.rebuildRenderUnits(this.state.squadCount);
    this.quips.trigger('CLEAN_START');
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
    this.gates.reset();
    this.enemies.reset();
    this.combat.reset();
    this.squad.reset();
    this.quips.reset();
    this.particles.releaseAll();
    this.floatingTexts.releaseAll();
    this.state = this.createInitialState('MENU');
    this.squad.rebuildRenderUnits(this.state.squadCount);
    this.uiCallbacks.onPhaseChange('MENU', this.state, this.save);
  }

  toggleMute(): boolean {
    const next = !this.audio.isMuted;
    this.audio.setMuted(next);
    this.save.muted = next;
    SaveManager.save(this.save);
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
    this.enemies.clearAllForUltimate(ctx);
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
    this.combat.step(dt, this.enemies, this.gates, ctx);
    this.enemies.step(dt, ctx);

    this.squad.rebuildRenderUnits(this.state.squadCount);
  }

  private stepDirector(ctx: CombatContext): void {
    while (this.nextWaveIdx < DAY1_TIMELINE.length) {
      const wave = DAY1_TIMELINE[this.nextWaveIdx];
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
        this.enemies.spawnBoss(wave.bossId, ctx);
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
      ultActiveTimer: this.state.ultActiveTimer,
      invulnTimer: this.state.invulnTimer,
      activeWeapon: this.state.activeWeapon,
      affixes: this.state.affixes,
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
      setWeapon: (weaponId) => {
        this.state.activeWeapon = weaponId;
      },
      grantAffix: (affixId) => {
        this.state.affixes[affixId] = (this.state.affixes[affixId] || 0) + 1;
        this.spawnFloatingText(
          projectX(this.squad.leaderLaneX, PLAYER_Y),
          PLAYER_Y - 46,
          `词条: ${AFFIXES[affixId].name}`,
          AFFIXES[affixId].color,
          15
        );
      },
      addBeans: (amount) => {
        this.state.stats.beansEarned += amount;
      },
      setInvuln: (sec) => {
        this.state.invulnTimer = sec;
      },
      consumeShieldOrSquad: (loss) => {
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
        this.audio.playGateBad();
        this.triggerShake(6.5, 0.18);
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
        this.enemies.spawnSwarm('client_mini', 3, 'CLUSTER', 1.0, laneX);
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
      onGateFlipped: () => {
        this.state.stats.gatesFlipped += 1;
      },
      onEnemyKilled: (beans, ult) => {
        this.state.stats.kills += 1;
        this.state.stats.beansEarned += beans;
        this.state.ultCharge = clamp(this.state.ultCharge + ult, 0, 100);
        this.state.comboCount += 1;
        this.state.comboTimer = 2.4;
        this.killSpreeCount += 1;
        this.killSpreeTimer = 4.0;
        if (this.killSpreeCount >= 22) {
          this.killSpreeCount = 0;
          this.quips.trigger('KILL_SPREE');
        }
      },
      onBossKilled: (beans) => {
        this.state.stats.beansEarned += beans;
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
    } else {
      this.audio.playDefeat();
    }

    this.save.coffeeBeans += this.state.stats.beansEarned;
    if (this.state.stats.maxSquad > this.save.bestSquad) {
      this.save.bestSquad = this.state.stats.maxSquad;
    }
    SaveManager.save(this.save);
    this.uiCallbacks.onPhaseChange(this.state.phase, this.state, this.save);
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
