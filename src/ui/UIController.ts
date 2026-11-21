import { BADGES } from '../data/badges';
import { BOSSES } from '../data/enemies';
import { LEVELS } from '../data/levels';
import type { ActiveQuip } from '../data/quips';
import { SYNERGIES } from '../data/synergies';
import { talentCost, TALENT_ORDER, TALENTS } from '../data/talents';
import { WEAPONS } from '../data/weapons';
import { EndlessDirector } from '../game/EndlessDirector';
import type { GamePhase, GameState, SaveData, TalentId } from '../game/types';
import { saveImageToAlbum } from '../platform/MiniToolBridge';
import { hydrateIcons, iconSvg, richHtml } from './icons';

/** 只在内容变化时写 innerHTML（syncHUD 每帧调用，避免反复重建 DOM） */
function setRich(el: HTMLElement, text: string): void {
  if (el.dataset.rich === text) return;
  el.dataset.rich = text;
  el.innerHTML = richHtml(text);
}

const BOSS_IMAGES = {
  alarm: 'boss_alarm.webp',
  projector: 'boss_projector.webp',
  hydra: 'boss_hydra.webp',
  server: 'boss_server.webp',
  kpi: 'boss_kpi.webp'
} as const;

export interface UIActions {
  onStart: () => void;
  onStartEndless: () => void;
  onUnlockAudio: () => void;
  onPause: () => void;
  onResume: () => void;
  onRestart: () => void;
  onReturnMenu: () => void;
  onToggleMute: () => boolean;
  onTriggerUlt: () => void;
  onSelectDay: (day: number) => void;
  onNextDay: () => void;
  onPickUpgrade: (index: number) => void;
  onGeneratePoster: () => string;
  onBuyTalent: (id: TalentId) => boolean;
  getSave: () => SaveData;
  getSelectedDay: () => number;
}

export class UIController {
  private readonly hudLayer = document.getElementById('hud-layer')!;
  private readonly menuOverlay = document.getElementById('menu-overlay')!;
  private readonly pauseOverlay = document.getElementById('pause-overlay')!;
  private readonly resultOverlay = document.getElementById('result-overlay')!;
  private readonly upgradeOverlay = document.getElementById('upgrade-overlay')!;
  private readonly posterOverlay = document.getElementById('poster-overlay')!;
  private readonly badgeOverlay = document.getElementById('badge-overlay')!;
  private readonly debugOverlay = document.getElementById('debug-overlay')!;

  private readonly menuBeans = document.getElementById('menu-beans')!;
  private readonly menuBestSquad = document.getElementById('menu-best-squad')!;
  private readonly menuClears = document.getElementById('menu-clears')!;
  private readonly dayPicker = document.getElementById('day-picker')!;
  private readonly stageDay = document.getElementById('stage-day')!;
  private readonly stageName = document.getElementById('stage-name')!;
  private readonly stageBoss = document.getElementById('stage-boss')!;
  private readonly endlessBestHint = document.getElementById('endless-best-hint')!;
  private readonly talentEntryHint = document.getElementById('talent-entry-hint')!;
  private readonly badgeCountHint = document.getElementById('badge-count-hint')!;
  private readonly talentOverlay = document.getElementById('talent-overlay')!;
  private readonly talentList = document.getElementById('talent-list')!;
  private readonly talentBeans = document.getElementById('talent-beans')!;
  private readonly badgeGrid = document.getElementById('badge-grid')!;
  private readonly upgradeWaveTag = document.getElementById('upgrade-wave-tag')!;
  private readonly upgradeList = document.getElementById('upgrade-list')!;
  private readonly posterImg = document.getElementById('poster-img') as HTMLImageElement;
  private readonly posterTip = document.getElementById('poster-tip');

  private readonly btnNextDay = document.getElementById('btn-next-day')!;
  private readonly hudDayBadge = document.getElementById('hud-day-badge')!;
  private readonly hudWeaponBadge = document.getElementById('hud-weapon-badge')!;
  private readonly hudShieldBadge = document.getElementById('hud-shield-badge')!;
  private readonly hudSynergyBadge = document.getElementById('hud-synergy-badge')!;
  private readonly hudProgressFill = document.getElementById('hud-progress-fill')!;
  private readonly hudClock = document.getElementById('hud-clock')!;
  private readonly btnMute = document.getElementById('btn-mute')!;
  private readonly btnUlt = document.getElementById('btn-ult') as HTMLButtonElement;
  private readonly ultFill = document.getElementById('ult-fill')!;
  private readonly ultLabel = document.getElementById('ult-label')!;

  private readonly quipBanner = document.getElementById('quip-banner')!;
  private readonly quipAvatarIcon = document.getElementById('quip-avatar-icon')!;
  private readonly quipSender = document.getElementById('quip-sender')!;
  private readonly quipTag = document.getElementById('quip-tag')!;
  private readonly quipText = document.getElementById('quip-text')!;

  private readonly resultRankTag = document.getElementById('result-rank-tag')!;
  private readonly resultTitle = document.getElementById('result-title')!;
  private readonly resultComment = document.getElementById('result-comment')!;
  private readonly resultNewBadges = document.getElementById('result-new-badges')!;
  private readonly resMaxSquad = document.getElementById('res-max-squad')!;
  private readonly resFlipped = document.getElementById('res-flipped')!;
  private readonly resKills = document.getElementById('res-kills')!;
  private readonly resBeans = document.getElementById('res-beans')!;

  public readonly debugEnabled: boolean;
  private readonly debugErrors: string[] = [];
  private lastState: GameState | null = null;
  private lastPosterUrl = '';

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

    hydrateIcons(document);
    this.btnMute.innerHTML = iconSvg(initialMuted ? 'mute' : 'speaker');
    this.bindEvents();
  }

  private bindEvents(): void {
    const startBtn = document.getElementById('btn-start')!;
    const endlessBtn = document.getElementById('btn-endless')!;
    const unlockOnly = () => this.actions.onUnlockAudio();

    for (const btn of [startBtn, endlessBtn]) {
      btn.addEventListener('touchstart', unlockOnly, { passive: true });
      btn.addEventListener('touchend', unlockOnly, { passive: true });
    }

    startBtn.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      this.actions.onStart();
    });

    endlessBtn.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      this.actions.onStartEndless();
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

    this.btnNextDay.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      this.actions.onNextDay();
    });

    const openTalents = () => this.openTalents();
    document.getElementById('btn-talents')!.addEventListener('click', openTalents);
    document.getElementById('btn-talents-result')!.addEventListener('click', openTalents);
    document.getElementById('btn-talents-close')!.addEventListener('click', () => {
      this.talentOverlay.classList.add('hidden');
      const save = this.actions.getSave();
      this.renderMenu(save);
      if (this.lastState && (this.lastState.phase === 'VICTORY' || this.lastState.phase === 'DEFEAT')) {
        this.populateResult(this.lastState.phase === 'VICTORY', this.lastState, save);
      }
    });

    document.getElementById('btn-badges')!.addEventListener('click', () => {
      this.renderBadges(this.actions.getSave());
      this.badgeOverlay.classList.remove('hidden');
    });
    document.getElementById('btn-badges-close')!.addEventListener('click', () => {
      this.badgeOverlay.classList.add('hidden');
    });

    document.getElementById('btn-poster')!.addEventListener('click', () => {
      this.lastPosterUrl = this.actions.onGeneratePoster();
      this.posterImg.src = this.lastPosterUrl;
      if (this.posterTip) {
        this.posterTip.innerHTML = richHtml('{i:camera} 点击下方按钮保存至系统相册（或长按上方战报保存）');
      }
      this.posterOverlay.classList.remove('hidden');
    });
    document.getElementById('btn-poster-close')!.addEventListener('click', () => {
      this.posterOverlay.classList.add('hidden');
    });
    const posterSaveBtn = document.getElementById('btn-poster-download') as HTMLButtonElement;
    posterSaveBtn.addEventListener('click', () => {
      if (!this.lastPosterUrl) return;
      posterSaveBtn.disabled = true;
      void saveImageToAlbum(this.lastPosterUrl).then((res) => {
        posterSaveBtn.disabled = false;
        if (this.posterTip) {
          this.posterTip.textContent = res.message;
        }
      });
    });

    this.upgradeList.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('button[data-upidx]') as HTMLButtonElement | null;
      if (!btn) return;
      this.actions.onUnlockAudio();
      this.actions.onPickUpgrade(Number(btn.dataset.upidx));
    });

    this.dayPicker.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('button[data-day]') as HTMLButtonElement | null;
      if (!btn || btn.disabled) return;
      this.actions.onSelectDay(Number(btn.dataset.day));
      this.renderMenu(this.actions.getSave());
    });

    this.talentList.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('button[data-talent]') as HTMLButtonElement | null;
      if (!btn || btn.disabled) return;
      if (this.actions.onBuyTalent(btn.dataset.talent as TalentId)) {
        this.renderTalents(this.actions.getSave());
      }
    });

    this.btnMute.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      const muted = this.actions.onToggleMute();
      this.btnMute.innerHTML = iconSvg(muted ? 'mute' : 'speaker');
    });

    this.btnUlt.addEventListener('click', () => {
      this.actions.onUnlockAudio();
      this.actions.onTriggerUlt();
    });
  }

  syncPhase(phase: GamePhase, state: GameState, save: SaveData): void {
    this.lastState = state;
    this.menuOverlay.classList.toggle('hidden', phase !== 'MENU');
    this.pauseOverlay.classList.toggle('hidden', phase !== 'PAUSED');
    this.upgradeOverlay.classList.toggle('hidden', phase !== 'UPGRADE_PICK');
    this.resultOverlay.classList.toggle('hidden', phase !== 'VICTORY' && phase !== 'DEFEAT');
    this.hudLayer.classList.toggle('hidden', phase === 'MENU');
    if (phase === 'MENU') {
      this.posterOverlay.classList.add('hidden');
      this.renderMenu(save);
    } else if (phase === 'UPGRADE_PICK') {
      this.renderUpgrades(state);
    } else if (phase === 'VICTORY' || phase === 'DEFEAT') {
      this.populateResult(phase === 'VICTORY', state, save);
    } else if (phase === 'PLAYING') {
      if (state.isEndless) {
        this.hudDayBadge.textContent = `无尽加班 · 第 ${state.endlessWave} 波`;
      } else {
        const lv = LEVELS[state.levelDay - 1];
        this.hudDayBadge.textContent = `${lv.weekday} · ${lv.title}`;
      }
    }
  }

  private renderMenu(save: SaveData): void {
    this.menuBeans.textContent = String(save.coffeeBeans);
    this.menuBestSquad.textContent = String(save.bestSquad);
    this.menuClears.textContent = `${save.totalClears} 次`;
    this.endlessBestHint.textContent =
      save.endlessBestWave > 0 ? `最高第${save.endlessBestWave}波 · ${save.endlessBestScore}分` : '无限波次肉鸽';
    this.badgeCountHint.textContent = `${save.unlockedBadges.length}/${BADGES.length}`;

    const selected = this.actions.getSelectedDay();
    const unlocked = Math.min(LEVELS.length, save.highestCleared + 1);
    this.dayPicker.innerHTML = LEVELS.map((lv) => {
      const locked = lv.day > unlocked;
      const cls = ['day-chip', lv.day === selected ? 'active' : '', lv.day <= save.highestCleared ? 'cleared' : '']
        .filter(Boolean)
        .join(' ');
      return `<button type="button" class="${cls}" data-day="${lv.day}" ${locked ? 'disabled' : ''} aria-pressed="${lv.day === selected}">${lv.weekday.slice(1)}<small>${locked ? iconSvg('lock') : lv.day <= save.highestCleared ? iconSvg('check') : 'NEW'}</small></button>`;
    }).join('');

    const lv = LEVELS[selected - 1];
    this.stageDay.textContent = `DAY 0${lv.day} · ${lv.weekday}`;
    this.stageName.textContent = `${lv.title}（${lv.subtitle}）`;
    this.stageBoss.textContent = `关底 Boss：${BOSSES[lv.bossId].name}`;
    const bossImg = document.getElementById('menu-boss-img') as HTMLImageElement | null;
    if (bossImg) {
      bossImg.src = `./assets/sprites/${BOSS_IMAGES[BOSSES[lv.bossId].style]}`;
      bossImg.alt = BOSSES[lv.bossId].name;
    }

    const affordable = TALENT_ORDER.filter(
      (id) => save.talents[id] < TALENTS[id].maxLevel && save.coffeeBeans >= talentCost(save.talents[id])
    ).length;
    this.talentEntryHint.textContent = affordable > 0 ? `可升级 ${affordable}` : '';
  }

  private renderUpgrades(state: GameState): void {
    const title = document.getElementById('upgrade-title')!;
    const desc = document.getElementById('upgrade-desc')!;
    if (state.upgradeSource === 'CRATE') {
      this.upgradeWaveTag.innerHTML = richHtml('{i:box} 空投补给到货！');
      title.textContent = '三选一 · 挑件摸鱼装备';
      desc.textContent = '带「激活」标记的能凑出化学反应，火力直接质变！';
    } else {
      const bossId = EndlessDirector.getBossForWave(state.endlessWave);
      this.upgradeWaveTag.textContent = `第 ${state.endlessWave} 波「${BOSSES[bossId].name}」已击碎！`;
      title.textContent = '选择你的加班外挂';
      desc.textContent = '选完立刻迎战下一波更凶猛的加班潮！';
    }
    this.upgradeList.innerHTML = state.pendingUpgrades
      .map(
        (u, idx) => `<button type="button" class="upgrade-card" data-upidx="${idx}">
          <div class="upgrade-card-top">
            <span class="upgrade-title">${richHtml(u.title)}</span>
            ${u.synergyTitle ? `<span class="upgrade-synergy-pill">${iconSvg('flask')} ${u.synergyTitle}</span>` : ''}
          </div>
          <span class="upgrade-desc">${u.desc}</span>
        </button>`
      )
      .join('');
  }

  private renderBadges(save: SaveData): void {
    const owned = new Set(save.unlockedBadges);
    this.badgeGrid.innerHTML = BADGES.map((b) => {
      const unlocked = owned.has(b.id);
      return `<div class="badge-card ${unlocked ? '' : 'locked'}">
        <div class="badge-icon">${iconSvg(unlocked ? b.icon : 'lock')}</div>
        <div class="badge-name">${b.name}</div>
        <div class="badge-desc">${b.desc}</div>
      </div>`;
    }).join('');
  }

  private openTalents(): void {
    this.renderTalents(this.actions.getSave());
    this.talentOverlay.classList.remove('hidden');
  }

  private renderTalents(save: SaveData): void {
    this.talentBeans.textContent = String(save.coffeeBeans);
    this.talentList.innerHTML = TALENT_ORDER.map((id) => {
      const cfg = TALENTS[id];
      const lv = save.talents[id];
      const maxed = lv >= cfg.maxLevel;
      const cost = talentCost(lv);
      const pips = Array.from({ length: cfg.maxLevel }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('');
      const now = lv > 0 ? cfg.describe(lv) : '尚未解锁';
      const next = maxed ? '已满级' : `下一级：${cfg.describe(lv + 1)}`;
      return `<div class="talent-row">
        <div class="talent-icon">${iconSvg(cfg.icon)}</div>
        <div>
          <div class="talent-name">${cfg.name}<span class="talent-lv">Lv.${lv}</span></div>
          <div class="talent-desc">${now} · ${next}</div>
          <div class="talent-pips">${pips}</div>
        </div>
        <button type="button" class="talent-buy" data-talent="${id}" ${maxed || save.coffeeBeans < cost ? 'disabled' : ''}>${maxed ? 'MAX' : `${cost} ${iconSvg('bean')}`}</button>
      </div>`;
    }).join('');
  }

  syncHUD(state: GameState): void {
    if (state.phase !== 'PLAYING' && state.phase !== 'PAUSED' && state.phase !== 'UPGRADE_PICK') return;

    const wCfg = WEAPONS[state.activeWeapon];
    setRich(
      this.hudWeaponBadge,
      state.affixes.ricochet > 0
        ? `${wCfg.shortTag} · ${wCfg.traitBadge} +弹射`
        : `${wCfg.shortTag} · ${wCfg.traitBadge}`
    );
    this.hudWeaponBadge.style.borderLeftColor = wCfg.color;

    if (state.shieldCount > 0) {
      this.hudShieldBadge.classList.remove('hidden');
      setRich(this.hudShieldBadge, `{i:shield} ${state.shieldCount}`);
    } else {
      this.hudShieldBadge.classList.add('hidden');
    }

    if (state.synergies.length > 0) {
      this.hudSynergyBadge.classList.remove('hidden');
      setRich(this.hudSynergyBadge, `{i:flask} ${SYNERGIES[state.synergies[0]].name}`);
    } else {
      this.hudSynergyBadge.classList.add('hidden');
    }

    const ratio = Math.min(1, state.elapsedSec / Math.max(1, state.trackDurationSec));
    this.hudProgressFill.style.width = `${(ratio * 100).toFixed(1)}%`;

    if (state.isEndless) {
      this.hudClock.textContent = `W${state.endlessWave} · ${state.endlessScore}`;
    } else {
      const totalMinutes = Math.round(ratio * 9 * 60);
      const hh = 9 + Math.floor(totalMinutes / 60);
      const mm = totalMinutes % 60;
      this.hudClock.textContent = `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
    }

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

  setQuip(quip: ActiveQuip | null): void {
    if (!quip) {
      this.quipBanner.classList.add('hidden');
      this.quipBanner.classList.remove('pop-in');
      return;
    }
    this.quipAvatarIcon.innerHTML = iconSvg(quip.icon ?? 'chat');
    this.quipSender.textContent = quip.sender ?? '摸鱼战神群';
    this.quipTag.textContent = quip.tag ?? '@你';
    this.quipText.textContent = quip.text;
    this.quipBanner.dataset.tone = quip.tone;
    this.quipBanner.classList.remove('hidden', 'pop-in');
    void this.quipBanner.offsetWidth;
    this.quipBanner.classList.add('pop-in');
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

  private populateResult(victory: boolean, state: GameState, save: SaveData): void {
    const lv = LEVELS[state.levelDay - 1];
    const hasNext = !state.isEndless && victory && lv.day < LEVELS.length;
    this.btnNextDay.classList.toggle('hidden', !hasNext);
    if (hasNext) this.btnNextDay.textContent = `下一天：${LEVELS[lv.day].weekday} · ${LEVELS[lv.day].title} ▶`;

    if (state.newlyUnlockedBadges.length > 0) {
      const names = state.newlyUnlockedBadges
        .map((id) => BADGES.find((b) => b.id === id))
        .filter(Boolean)
        .map((b) => `{i:${b!.icon}}${b!.name}`)
        .join('、');
      this.resultNewBadges.innerHTML = richHtml(`{i:sparkle} 解锁新工牌：${names}`);
      this.resultNewBadges.classList.remove('hidden');
    } else {
      this.resultNewBadges.classList.add('hidden');
    }

    if (state.isEndless) {
      this.resultRankTag.className = state.endlessWave >= 3 ? 'sticky-tag mint' : 'sticky-tag';
      this.resultRankTag.textContent = `无尽加班 · 第 ${state.endlessWave} 波`;
      this.resultTitle.textContent = `总分 ${state.endlessScore}`;
      this.resultComment.textContent =
        state.endlessWave >= 3
          ? '能在周末连熬这么多波加班，工位战神非你莫属！'
          : '周末加班火力凶猛，多拿三选一词条凑出化学反应就能质变清屏！';
    } else if (victory) {
      const isSSR = state.squadCount >= 40 && state.stats.gatesFlipped >= 1 && state.stats.bossTimeSec < 35;
      this.resultRankTag.className = 'sticky-tag mint';
      this.resultRankTag.textContent = isSSR ? 'SSR · 工位赛博战神' : 'SR · 带薪突围大师';
      this.resultTitle.textContent = lv.day === LEVELS.length ? '周五 17:59 · 周末到手！' : '18:00 准点下班！';
      this.resultComment.textContent = isSSR
        ? `${lv.weekday}的 Boss 还没反应过来就被你按在地上摩擦，今日适合立刻关机走人。`
        : `靠着最后一口冰美式与神走位，成功把${lv.weekday}扛到了下班！`;
    } else {
      this.resultRankTag.className = 'sticky-tag warn';
      this.resultRankTag.textContent = 'N · 当场红温被优化';
      const reachedBoss = state.elapsedSec >= state.trackDurationSec;
      this.resultTitle.textContent = reachedBoss ? `倒在了 ${BOSSES[lv.bossId].name} 面前…` : `${lv.weekday}的加班潮太凶猛…`;
      const canUpgrade = TALENT_ORDER.some(
        (id) => save.talents[id] < 10 && save.coffeeBeans >= talentCost(save.talents[id])
      );
      this.resultComment.textContent = canUpgrade
        ? '咖啡豆够升级天赋了！先去强化一下再来。'
        : reachedBoss
          ? '盯住地面红色预警、从弹幕缺口钻过去；Boss“开会免伤”时先清掉它叫来的小弟。'
          : '尸潮别正面硬吃，从侧面绕过去再输出；红门射穿可以洗白成蓝门！';
    }

    this.resMaxSquad.textContent = `${state.stats.maxSquad} 人`;
    this.resFlipped.textContent = `${state.stats.gatesFlipped} 次`;
    this.resKills.textContent = `${state.stats.kills}`;
    this.resBeans.innerHTML = `+${state.stats.beansEarned} ${iconSvg('bean')}`;
  }
}
