import { WEAPONS } from '../data/weapons';
import type { GamePhase, GameState, SaveData } from '../game/types';

export interface UIActions {
  onStart: () => void;
  onUnlockAudio: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnMenu: () => void;
  onToggleMute: () => boolean;
  onTriggerUlt: () => void;
}

export class UIController {
  private readonly hudLayer = document.getElementById('hud-layer')!;
  private readonly menuOverlay = document.getElementById('menu-overlay')!;
  private readonly pauseOverlay = document.getElementById('pause-overlay')!;
  private readonly resultOverlay = document.getElementById('result-overlay')!;
  private readonly debugOverlay = document.getElementById('debug-overlay')!;

  private readonly menuBeans = document.getElementById('menu-beans')!;
  private readonly menuBestSquad = document.getElementById('menu-best-squad')!;
  private readonly menuClears = document.getElementById('menu-clears')!;

  private readonly hudWeaponBadge = document.getElementById('hud-weapon-badge')!;
  private readonly hudShieldBadge = document.getElementById('hud-shield-badge')!;
  private readonly hudProgressFill = document.getElementById('hud-progress-fill')!;
  private readonly hudClock = document.getElementById('hud-clock')!;
  private readonly btnMute = document.getElementById('btn-mute')!;
  private readonly btnUlt = document.getElementById('btn-ult') as HTMLButtonElement;
  private readonly ultFill = document.getElementById('ult-fill')!;
  private readonly ultLabel = document.getElementById('ult-label')!;

  private readonly quipBanner = document.getElementById('quip-banner')!;
  private readonly quipText = document.getElementById('quip-text')!;

  private readonly resultRankTag = document.getElementById('result-rank-tag')!;
  private readonly resultTitle = document.getElementById('result-title')!;
  private readonly resultComment = document.getElementById('result-comment')!;
  private readonly resMaxSquad = document.getElementById('res-max-squad')!;
  private readonly resFlipped = document.getElementById('res-flipped')!;
  private readonly resKills = document.getElementById('res-kills')!;
  private readonly resBeans = document.getElementById('res-beans')!;

  public readonly debugEnabled: boolean;
  private readonly debugErrors: string[] = [];

  constructor(private readonly actions: UIActions, initialMuted: boolean) {
    this.debugEnabled = new URLSearchParams(window.location.search).get('debug') === '1';
    if (this.debugEnabled) {
      this.debugOverlay.classList.remove('hidden');
      window.addEventListener('error', (ev) => {
        this.pushDebugError(ev.message || 'Unknown error');
      });
      window.addEventListener('unhandledrejection', (ev) => {
        this.pushDebugError(String(ev.reason));
      });
    }

    this.btnMute.textContent = initialMuted ? '🔇' : '🔊';
    this.bindEvents();
  }

  private bindEvents(): void {
    const startBtn = document.getElementById('btn-start')!;
    // 同步绑定 touchstart + touchend + click 解锁音频，兼容 iOS Safari 与微信 X5
    const unlockOnly = () => this.actions.onUnlockAudio();
    startBtn.addEventListener('touchstart', unlockOnly, { passive: true });
    startBtn.addEventListener('touchend', unlockOnly, { passive: true });
    startBtn.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      this.actions.onStart();
    });

    document.getElementById('btn-pause')!.addEventListener('click', () => {
      this.actions.onPause();
    });

    document.getElementById('btn-resume')!.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      this.actions.onResume();
    });

    document.getElementById('btn-restart-pause')!.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      this.actions.onRestart();
    });

    document.getElementById('btn-home-pause')!.addEventListener('click', () => {
      this.actions.onReturnMenu();
    });

    document.getElementById('btn-retry')!.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      this.actions.onRestart();
    });

    document.getElementById('btn-home-result')!.addEventListener('click', () => {
      this.actions.onReturnMenu();
    });

    this.btnMute.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      const muted = this.actions.onToggleMute();
      this.btnMute.textContent = muted ? '🔇' : '🔊';
    });

    this.btnUlt.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      this.actions.onTriggerUlt();
    });
  }

  syncPhase(phase: GamePhase, state: GameState, save: SaveData): void {
    this.menuOverlay.classList.toggle('hidden', phase !== 'MENU');
    this.pauseOverlay.classList.toggle('hidden', phase !== 'PAUSED');
    this.resultOverlay.classList.toggle('hidden', phase !== 'VICTORY' && phase !== 'DEFEAT');
    this.hudLayer.classList.toggle('hidden', phase === 'MENU');

    if (phase === 'MENU') {
      this.menuBeans.textContent = String(save.coffeeBeans);
      this.menuBestSquad.textContent = String(save.bestSquad);
      this.menuClears.textContent = `${save.totalClears} 次`;
    } else if (phase === 'VICTORY' || phase === 'DEFEAT') {
      this.populateResult(phase === 'VICTORY', state);
    }
  }

  syncHUD(state: GameState): void {
    if (state.phase !== 'PLAYING' && state.phase !== 'PAUSED') return;

    const wCfg = WEAPONS[state.activeWeapon];
    this.hudWeaponBadge.textContent = wCfg.shortTag;

    if (state.shieldCount > 0) {
      this.hudShieldBadge.classList.remove('hidden');
      this.hudShieldBadge.textContent = `🛡️ ${state.shieldCount}`;
    } else {
      this.hudShieldBadge.classList.add('hidden');
    }

    const ratio = Math.min(1, state.elapsedSec / Math.max(1, state.trackDurationSec));
    this.hudProgressFill.style.width = `${(ratio * 100).toFixed(1)}%`;

    // 从 09:00 映射到 18:00
    const totalMinutes = Math.round(ratio * 9 * 60);
    const hh = 9 + Math.floor(totalMinutes / 60);
    const mm = totalMinutes % 60;
    this.hudClock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;

    const pct = Math.floor(state.ultCharge);
    this.ultFill.style.width = `${pct}%`;
    if (pct >= 100) {
      this.btnUlt.disabled = false;
      this.btnUlt.classList.add('ready');
      this.ultLabel.textContent = '18:00 准点下班!';
    } else {
      this.btnUlt.disabled = true;
      this.btnUlt.classList.remove('ready');
      this.ultLabel.textContent = `下班蓄力 ${pct}%`;
    }
  }

  setQuip(text: string | null): void {
    if (!text) {
      this.quipBanner.classList.add('hidden');
      return;
    }
    this.quipText.textContent = text;
    this.quipBanner.classList.remove('hidden');
  }

  updateDebug(info: string): void {
    if (!this.debugEnabled) return;
    const errPart = this.debugErrors.length > 0 ? `\nERR: ${this.debugErrors.slice(-2).join(' | ')}` : '';
    this.debugOverlay.textContent = info + errPart;
  }

  private pushDebugError(msg: string): void {
    this.debugErrors.push(msg);
    if (this.debugErrors.length > 5) this.debugErrors.shift();
  }

  private populateResult(victory: boolean, state: GameState): void {
    if (victory) {
      const isSSR = state.stats.maxSquad >= 60 && state.stats.gatesFlipped >= 1;
      this.resultRankTag.className = 'sticky-tag mint';
      this.resultRankTag.textContent = isSSR ? 'SSR · 工位赛博战神' : 'SR · 带薪突围大师';
      this.resultTitle.textContent = '18:00 准点下班！';
      this.resultComment.textContent = isSSR
        ? '闹钟还没响完就被你按在地上摩擦，今日适合立刻关机走人。'
        : '靠着最后一口冰美式与神走位，成功把周一扛到了下班！';
    } else {
      this.resultRankTag.className = 'sticky-tag warn';
      this.resultRankTag.textContent = 'N · 当场红温被优化';
      this.resultTitle.textContent = '加班丧尸潮太凶猛…';
      this.resultComment.textContent = '多打爆黄色空投箱解锁机械键盘/冰美式，并集中火力把红门射穿洗白成蓝门！';
    }

    this.resMaxSquad.textContent = `${state.stats.maxSquad} 人`;
    this.resFlipped.textContent = `${state.stats.gatesFlipped} 次`;
    this.resKills.textContent = `${state.stats.kills}`;
    this.resBeans.textContent = `+${state.stats.beansEarned} ☕`;
  }
}
