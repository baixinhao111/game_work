import { AudioEngine } from './engine/AudioEngine';
import { InputManager } from './engine/InputManager';
import { GameLoop } from './engine/Loop';
import { Viewport } from './engine/Viewport';
import { GameWorld } from './game/GameWorld';
import { Renderer } from './render/Renderer';
import { SpriteCache } from './render/SpriteCache';
import { SaveManager } from './storage/SaveManager';
import { UIController } from './ui/UIController';

function bootstrap(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement | null;
  if (!canvas) throw new Error('Canvas element #game-canvas not found');
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Failed to initialize 2D context');

  const initialSave = SaveManager.load();
  const audio = new AudioEngine(initialSave.muted);
  const viewport = new Viewport(canvas, ctx);
  const spriteCache = new SpriteCache();
  void spriteCache.loadAll();
  const renderer = new Renderer(spriteCache);

  let ui!: UIController;
  const world = new GameWorld(audio, {
    onPhaseChange: (phase, state, save) => {
      ui.syncPhase(phase, state, save);
      ui.syncHUD(state);
    },
    onQuipChange: (text) => {
      ui.setQuip(text);
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

  ui = new UIController(
    {
      onStart: () => {
        input.resetState();
        world.startNewRun();
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
        world.startNewRun();
      },
      onReturnMenu: () => {
        input.resetState();
        world.returnToMenu();
      },
      onToggleMute: () => world.toggleMute(),
      onTriggerUlt: () => {
        world.triggerUltimate();
      }
    },
    initialSave.muted
  );

  ui.syncPhase(world.state.phase, world.state, world.save);

  const syncViewport = () => viewport.sync();
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

bootstrap();
