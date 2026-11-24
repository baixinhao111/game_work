import './styles/main.css';
import { BOSSES } from './data/enemies';
import { getLevel, LEVELS } from './data/levels';
import { talentCost, TALENTS } from './data/talents';
import { AudioEngine } from './engine/AudioEngine';
import { MusicEngine } from './engine/MusicEngine';
import { preloadIcons } from './ui/icons';
import { InputManager } from './engine/InputManager';
import { GameLoop } from './engine/Loop';
import { Viewport } from './engine/Viewport';
import { GameWorld } from './game/GameWorld';
import { applyWindowAvoidance } from './platform/MiniToolBridge';
import { ensureCanvasRoundRect } from './render/canvasCompat';
import { PosterExporter } from './render/PosterExporter';
import { Renderer } from './render/Renderer';
import { SpriteCache } from './render/SpriteCache';
import { SaveManager } from './storage/SaveManager';
import { UIController } from './ui/UIController';

/** 按照 css-compatibility.md §4 通过实际布局测量 Flex gap 是否生效 */
function detectFlexGapSupport(): void {
  try {
    if (typeof document === 'undefined' || !document.body) return;
    const flex = document.createElement('div');
    flex.style.position = 'absolute';
    flex.style.visibility = 'hidden';
    flex.style.display = 'flex';
    flex.style.flexDirection = 'column';
    flex.style.rowGap = '1px';
    flex.appendChild(document.createElement('div'));
    flex.appendChild(document.createElement('div'));
    document.body.appendChild(flex);
    const supported = flex.scrollHeight === 1;
    if (flex.parentNode) flex.parentNode.removeChild(flex);
    if (supported) {
      document.documentElement.classList.add('supports-flex-gap');
    }
  } catch {
    // 不支持则沿用 margin 基线
  }
}

function showBootFallback(err: unknown): void {
  const app = typeof document !== 'undefined' ? document.getElementById('app') : null;
  if (!app) return;
  const msg = document.createElement('div');
  msg.style.padding = '24px';
  msg.style.color = '#f8f7f2';
  msg.style.textAlign = 'center';
  msg.style.fontWeight = '700';
  msg.textContent = '页面初始化失败，请关闭小工具后重新打开。';
  app.appendChild(msg);
  if (typeof console !== 'undefined' && console.error) {
    console.error('Bootstrap failed:', err);
  }
}

function bootstrap(): void {
  ensureCanvasRoundRect();
  detectFlexGapSupport();

  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Canvas element #game-canvas not found');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to initialize 2D context');

  const initialSave = SaveManager.load();
  const audio = new AudioEngine(initialSave.muted);
  const music = new MusicEngine(audio);
  preloadIcons();
  // 首次触碰页面任意位置即解锁音频，让菜单待机音乐尽早响起（iOS / 容器须在手势同步栈内解锁）
  const unlockOnce = () => {
    audio.unlock();
    if (audio.context) {
      document.removeEventListener('touchend', unlockOnce);
      document.removeEventListener('click', unlockOnce);
    }
  };
  document.addEventListener('touchend', unlockOnce, { passive: true });
  document.addEventListener('click', unlockOnce);
  const viewport = new Viewport(canvas, ctx);
  const spriteCache = new SpriteCache();
  void spriteCache.loadCore();
  const renderer = new Renderer(spriteCache);

  let ui!: UIController;
  const world = new GameWorld(audio, {
    onPhaseChange: (phase, state, save) => {
      ui.syncPhase(phase, state, save);
      ui.syncHUD(state);
    },
    onQuipChange: (quip) => {
      ui.setQuip(quip);
    },
    onEnsureBoss: ({ bossId }) => {
      void spriteCache.ensureBoss(BOSSES[bossId].style);
    }
  });

  const input = new InputManager(canvas, viewport, {
    isPlaying: () => world.state.phase === 'PLAYING',
    onDragDelta: (deltaLaneX) => {
      world.squad.addTargetDelta(deltaLaneX);
    },
    onTriggerUltimate: () => {
      world.triggerUltimate();
    },
    onUnlockAudio: () => {
      audio.unlock();
    }
  });

  const ensureBossForDay = (day: number) => {
    const bossId = getLevel(day).bossId;
    void spriteCache.ensureBoss(BOSSES[bossId].style);
  };
  ensureBossForDay(world.selectedDay);

  ui = new UIController(
    {
      onStart: () => {
        input.resetState();
        void spriteCache.ensureCharacter(world.save.selectedCharacter);
        ensureBossForDay(world.selectedDay);
        world.startNewRun(world.selectedDay);
      },
      onIntroStart: () => {
        input.resetState();
        world.startNewRun(1, { tutorial: true });
      },
      onStartEndless: () => {
        input.resetState();
        void spriteCache.ensureCharacter(world.save.selectedCharacter);
        world.startEndlessRun();
      },
      onUnlockAudio: () => {
        audio.unlock();
      },
      onPause: () => {
        world.pause();
      },
      onResume: () => {
        input.resetState();
        world.resume();
      },
      onRestart: () => {
        input.resetState();
        if (world.state.isEndless) {
          world.startEndlessRun();
        } else {
          ensureBossForDay(world.level.day);
          world.startNewRun(world.level.day);
        }
      },
      onReturnMenu: () => {
        input.resetState();
        world.returnToMenu();
      },
      onToggleMute: () => world.toggleMute(),
      onTriggerUlt: () => {
        world.triggerUltimate();
      },
      onSelectDay: (day) => {
        world.selectDay(day);
        ensureBossForDay(world.selectedDay);
      },
      onNextDay: () => {
        input.resetState();
        const nextDay = Math.min(LEVELS.length, world.level.day + 1);
        ensureBossForDay(nextDay);
        world.startNewRun(nextDay);
      },
      onPickUpgrade: (index) => {
        input.resetState();
        world.pickUpgrade(index);
      },
      onGeneratePoster: () => PosterExporter.generate(world.state, world.save, spriteCache),
      onBuyTalent: (id) => {
        const save = world.save;
        const lv = save.talents[id];
        if (lv >= TALENTS[id].maxLevel) return false;
        const cost = talentCost(lv);
        if (save.coffeeBeans < cost) return false;
        save.coffeeBeans -= cost;
        save.talents[id] = lv + 1;
        void SaveManager.save(save);
        world.refreshTalents();
        audio.playGateGood();
        return true;
      },
      onSettingsChanged: () => {
        world.applySettings(true);
        applyQuality();
      },
      onSelectCharacter: (id) => {
        world.save.selectedCharacter = id;
        void spriteCache.ensureCharacter(id);
        void SaveManager.save(world.save);
        audio.playGateGood();
      },
      onReplayTutorial: () => {
        input.resetState();
        world.replayTutorial();
      },
      getSave: () => world.save,
      getSelectedDay: () => world.selectedDay
    },
    initialSave.muted
  );

  if (ui.debugEnabled) {
    (window as unknown as { __world: GameWorld }).__world = world;
  }

  ui.syncPhase(world.state.phase, world.state, world.save);
  void world.hydrateSave().then(() => {
    applyQuality();
    void spriteCache.ensureCharacter(world.save.selectedCharacter);
    ensureBossForDay(world.selectedDay);
    // 新玩家跳过菜单：显示开场页，点一下直接开打周一
    if (!world.save.tutorialDone && world.state.phase === 'MENU') ui.showIntro();
  });

  const syncViewport = () => {
    viewport.sync();
    void applyWindowAvoidance();
  };
  /** 省电画质：渲染分辨率上限降到 1.25 */
  function applyQuality(): void {
    const next = world.lowFx ? 1.25 : 2;
    if (viewport.maxDpr !== next) {
      viewport.maxDpr = next;
      viewport.sync();
    }
  }
  window.addEventListener('resize', syncViewport);
  syncViewport();
  input.attach();

  const loop = new GameLoop({
    isPlaying: () => world.state.phase === 'PLAYING',
    onStep: (dt) => {
      input.stepKeyboard(dt);
      world.step(dt);
    },
    onRender: (_alpha) => {
      viewport.beginFrame();
      renderer.render(ctx, world);
      ui.syncHUD(world.state);
      music.update(world);
      if (ui.debugEnabled) {
        ui.updateDebug(
          [
            `FPS: ${loop.currentFps} | DPR: ${viewport.dpr}`,
            `Squad: ${world.state.squadCount} (Vis: ${world.squad.renderUnits.length})`,
            `Bullets: ${world.combat.bullets.activeCount}/${world.combat.bullets.pooledCount}`,
            `Enemies: ${world.enemies.enemies.activeCount} | Gates: ${world.gates.pool.activeCount}`,
            `Particles: ${world.particles.activeCount}`
          ].join('\n')
        );
      }
    },
    onAutoPause: () => {
      world.pause();
    }
  });

  loop.start();
}

try {
  bootstrap();
} catch (err) {
  showBootFallback(err);
}
