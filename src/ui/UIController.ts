import { BADGES } from '../data/badges';
import { CHARACTERS, getCharacter, isCharacterUnlocked, nextRankUnlock, CLEANER_KILLS } from '../data/characters';
import { RANKS, rankProgress, rankForXp } from '../data/ranks';
import { AFFIXES, weaponDisplayName } from '../data/weapons';
import { BOSSES } from '../data/enemies';
import { LEVELS } from '../data/levels';
import type { ActiveQuip } from '../data/quips';
import { SYNERGIES } from '../data/synergies';
import { talentCost, TALENT_ORDER, TALENTS } from '../data/talents';
import { WEAPONS } from '../data/weapons';
import { EndlessDirector } from '../game/EndlessDirector';
import type { CharacterId, DamageSource, GamePhase, GameState, RunXpResult, SaveData, TalentId } from '../game/types';
import { saveImageToAlbum } from '../platform/MiniToolBridge';
import { hydrateIcons, iconSvg, richHtml } from './icons';

/** 角色半身像 / 小队形象 */
const faceImg = (id: CharacterId, cls = '') => `<img class="${cls}" src="./assets/sprites/face_${id}.webp" alt="" />`;
const heroFile = (id: CharacterId) => (id === 'intern' ? 'hero_slacker.webp' : `hero_${id}.webp`);

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
  /** 首次打开：开场页点一下即开始新手引导局 */
  onIntroStart: () => void;
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
  /** 设置已在 save.settings 上修改，需要应用并保存 */
  onSettingsChanged: () => void;
  onReplayTutorial: () => void;
  /** 在同事名册里选出战角色 */
  onSelectCharacter: (id: CharacterId) => void;
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
  private readonly menuClears = document.getElementById('menu-clears')!;
  private readonly settingsOverlay = document.getElementById('settings-overlay')!;
  private readonly rosterOverlay = document.getElementById('roster-overlay')!;
  private readonly promoOverlay = document.getElementById('promo-overlay')!;
  /** 结算动画的定时器（重新渲染 / 离开结算时清掉） */
  private resultTimers: number[] = [];
  /** 结算动画结束后要弹出的升职卡片队列 */
  private pendingPromos: number[] = [];
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
  private readonly dockMsg = document.getElementById('dock-msg')!;
  private readonly dsSquad = document.getElementById('ds-squad')!;
  private readonly dsKills = document.getElementById('ds-kills')!;
  private readonly dsCombo = document.getElementById('ds-combo')!;
  private readonly dsOverload = document.getElementById('ds-overload')!;
  private readonly dockPickupBar = document.getElementById('dock-pickup-bar')!;
  private readonly dockPickupTitle = document.getElementById('dock-pickup-title')!;
  private readonly dockPickupSub = document.getElementById('dock-pickup-sub')!;
  /** 本局角色的大招名（开局时由 syncPhase 设置） */
  private ultName = '准点下班';
  /** 当前显示中的工作群消息（QuipSystem 到期时传 null） */
  private chatActive = false;
  private lastPickupKey = '';
  private readonly quipAvatarIcon = document.getElementById('quip-avatar-icon')!;
  private readonly quipSender = document.getElementById('quip-sender')!;
  private readonly quipTag = document.getElementById('quip-tag')!;
  private readonly quipText = document.getElementById('quip-text')!;

  private readonly resultRankTag = document.getElementById('result-rank-tag')!;
  private readonly resultTitle = document.getElementById('result-title')!;
  private readonly resultComment = document.getElementById('result-comment')!;
  private readonly resultNewBadges = document.getElementById('result-new-badges')!;
  private readonly resMaxSquad = document.getElementById('res-max-squad')!;
  private readonly xpLines = document.getElementById('xp-lines')!;
  private readonly xpTotal = document.getElementById('xp-total')!;
  private readonly xpRank = document.getElementById('xp-rank')!;
  private readonly xpCount = document.getElementById('xp-count')!;
  private readonly xpFill = document.getElementById('xp-fill')!;
  private readonly xpGain = document.getElementById('xp-gain')!;
  private readonly recapBuild = document.getElementById('recap-build')!;
  private readonly recapBars = document.getElementById('recap-bars')!;
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

    // 设置
    const openSettings = () => this.openSettings();
    document.getElementById('btn-settings')!.addEventListener('click', openSettings);
    document.getElementById('btn-settings-pause')!.addEventListener('click', openSettings);
    document.getElementById('btn-settings-close')!.addEventListener('click', () => {
      this.settingsOverlay.classList.add('hidden');
    });
    document.getElementById('btn-replay-tutorial')!.addEventListener('click', () => {
      this.settingsOverlay.classList.add('hidden');
      this.actions.onUnlockAudio();
      this.actions.onReplayTutorial();
    });
    const bindRange = (id: string, key: 'musicVolume' | 'sfxVolume') => {
      const input = document.getElementById(id) as HTMLInputElement;
      input.addEventListener('input', () => {
        const save = this.actions.getSave();
        save.settings[key] = Number(input.value) / 100;
        document.getElementById(`${id}-val`)!.textContent = `${input.value}%`;
        this.actions.onSettingsChanged();
      });
    };
    bindRange('set-music', 'musicVolume');
    bindRange('set-sfx', 'sfxVolume');
    const bindToggle = (id: string, key: 'vibration' | 'lowFx' | 'colorblind') => {
      const btn = document.getElementById(id)!;
      btn.addEventListener('click', () => {
        const save = this.actions.getSave();
        save.settings[key] = !save.settings[key];
        btn.setAttribute('aria-pressed', String(save.settings[key]));
        this.actions.onUnlockAudio();
        this.actions.onSettingsChanged();
      });
    };
    bindToggle('set-vibration', 'vibration');
    bindToggle('set-lowfx', 'lowFx');
    bindToggle('set-colorblind', 'colorblind');

    // 同事名册
    const openRoster = () => {
      this.renderRoster(this.actions.getSave());
      this.rosterOverlay.classList.remove('hidden');
    };
    document.getElementById('rank-card')!.addEventListener('click', openRoster);
    document.getElementById('char-slot')!.addEventListener('click', openRoster);
    document.getElementById('roster-grid')!.addEventListener('click', (ev) => {
      const btn = (ev.target as HTMLElement).closest('button[data-char]') as HTMLButtonElement | null;
      if (!btn || btn.disabled) return;
      this.actions.onSelectCharacter(btn.dataset.char as CharacterId);
      const save = this.actions.getSave();
      this.renderRoster(save);
      this.renderMenu(save);
    });
    document.getElementById('btn-roster-close')!.addEventListener('click', () => {
      this.rosterOverlay.classList.add('hidden');
    });

    // 升职弹窗：可能连升几级，依次展示
    document.getElementById('btn-promo-ok')!.addEventListener('click', () => {
      this.promoOverlay.classList.add('hidden');
      this.showNextPromo();
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
    // 开场页只属于菜单阶段；任何方式开局都要收起它
    if (phase !== 'MENU') document.getElementById('intro-overlay')!.classList.add('hidden');
    this.lastState = state;
    if (phase !== 'VICTORY' && phase !== 'DEFEAT') {
      this.clearResultTimers();
      this.pendingPromos = [];
      this.promoOverlay.classList.add('hidden');
    }
    if (phase !== 'MENU' && phase !== 'PAUSED') this.settingsOverlay.classList.add('hidden');
    if (phase !== 'MENU') this.rosterOverlay.classList.add('hidden');
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
      this.clearResultTimers();
      this.populateResult(phase === 'VICTORY', state, save);
      this.playXpAnimation(state.xpResult);
    } else if (phase === 'PLAYING') {
      this.ultName = getCharacter(state.character).ultName;
      if (state.isEndless) {
        this.hudDayBadge.textContent = `无尽加班 · 第 ${state.endlessWave} 波`;
      } else {
        const lv = LEVELS[state.levelDay - 1];
        this.hudDayBadge.textContent = `${lv.weekday} · ${lv.title}`;
      }
    }
  }

  /** 首次打开：显示极简开场页，点任意处开始新手引导局 */
  showIntro(): void {
    const intro = document.getElementById('intro-overlay')!;
    intro.classList.remove('hidden');
    const start = () => {
      intro.removeEventListener('click', start);
      intro.classList.add('hidden');
      this.actions.onUnlockAudio();
      this.actions.onIntroStart();
    };
    intro.addEventListener('click', start);
  }

  private renderMenu(save: SaveData): void {
    // 功能按进度逐个出现：首局后出现天赋 / 工牌，通关周一后出现无尽模式
    const veteran = save.tutorialDone;
    document.getElementById('btn-talents')!.classList.toggle('hidden', !veteran);
    document.getElementById('btn-badges')!.classList.toggle('hidden', !veteran);
    document.getElementById('btn-endless')!.classList.toggle('hidden', save.highestCleared < 1);
    document.getElementById('menu-dock')!.classList.toggle('hidden', !veteran);
    this.menuBeans.textContent = String(save.coffeeBeans);
    this.menuClears.textContent = `已通关 ${save.highestCleared}/${LEVELS.length}`;
    this.endlessBestHint.textContent =
      save.endlessBestWave > 0 ? `最高第 ${save.endlessBestWave} 波` : '无限波次';
    this.badgeCountHint.textContent = `${save.unlockedBadges.length}/${BADGES.length}`;

    // 工牌：职级 + 经验条
    const prog = rankProgress(save.xp);
    document.getElementById('rank-title')!.textContent = prog.rank.title;
    document.getElementById('rank-no')!.textContent = `工牌 NO.${save.workerCode}`;
    document.getElementById('rank-xp-fill')!.style.width = `${(prog.ratio * 100).toFixed(1)}%`;
    document.getElementById('rank-next')!.textContent = prog.next
      ? `距「${prog.next.title}」还差 ${prog.need - prog.have} 绩效`
      : `已登顶 · 累计绩效 ${save.xp}`;
    (document.getElementById('rank-card') as HTMLElement).style.borderColor = '';
    document.getElementById('rank-avatar')!.style.background = prog.rank.frame;

    // 出战同事 + 下一位解锁提示
    const ch = getCharacter(save.selectedCharacter);
    const face = faceImg(ch.id, 'face');
    const rankAvatar = document.getElementById('rank-avatar')!;
    if (rankAvatar.dataset.char !== ch.id) {
      rankAvatar.dataset.char = ch.id;
      rankAvatar.innerHTML = face;
      document.getElementById('char-slot-avatar')!.innerHTML = face;
      (document.querySelector('.hero-me') as HTMLImageElement).src = `./assets/sprites/${heroFile(ch.id)}`;
    }
    document.getElementById('char-slot-avatar')!.style.background = ch.color;
    document.getElementById('char-slot-name')!.textContent = ch.name;
    document.getElementById('char-slot-sub')!.textContent = `${ch.weaponName} · 大招「${ch.ultName}」`;
    const next = nextRankUnlock(save);
    document.getElementById('char-slot-next')!.textContent = next
      ? `${RANKS[('rank' in next.unlock ? next.unlock.rank : 1) - 1].title}解锁\n${next.name}`
      : '';

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
    this.talentEntryHint.textContent = affordable > 0 ? `${affordable}` : '';
  }

  private openSettings(): void {
    const st = this.actions.getSave().settings;
    const music = Math.round(st.musicVolume * 100);
    const sfx = Math.round(st.sfxVolume * 100);
    (document.getElementById('set-music') as HTMLInputElement).value = String(music);
    (document.getElementById('set-sfx') as HTMLInputElement).value = String(sfx);
    document.getElementById('set-music-val')!.textContent = `${music}%`;
    document.getElementById('set-sfx-val')!.textContent = `${sfx}%`;
    document.getElementById('set-vibration')!.setAttribute('aria-pressed', String(st.vibration));
    document.getElementById('set-lowfx')!.setAttribute('aria-pressed', String(st.lowFx));
    document.getElementById('set-colorblind')!.setAttribute('aria-pressed', String(st.colorblind));
    // 局内暂停时不提供「重玩引导」（会直接开新局）
    const inMenu = !this.lastState || this.lastState.phase === 'MENU';
    document.getElementById('btn-replay-tutorial')!.classList.toggle('hidden', !inMenu);
    this.settingsOverlay.classList.remove('hidden');
  }

  private renderRoster(save: SaveData): void {
    const rank = rankForXp(save.xp);
    document.getElementById('roster-ranks')!.innerHTML = RANKS.map(
      (r) => `<span class="${r.level < rank ? 'done' : r.level === rank ? 'now' : ''}">${r.title}</span>`
    ).join('');
    const prog = rankProgress(save.xp);
    document.getElementById('roster-desc')!.textContent = prog.next
      ? `当前「${prog.rank.title}」· 累计绩效 ${save.xp}，再拿 ${prog.need - prog.have} 升「${prog.next.title}」。每局结算都涨绩效，输了也涨。`
      : `已经是 CEO 了！累计绩效 ${save.xp}。`;
    document.getElementById('roster-grid')!.innerHTML = CHARACTERS.map((c) => {
      const open = isCharacterUnlocked(c, save);
      const current = c.id === save.selectedCharacter;
      const hidden = !open && 'kills' in c.unlock;
      const avatar = open ? faceImg(c.id, 'face') : hidden ? iconSvg('lock') : faceImg(c.id, 'face silhouette');
      const state = current
        ? '出战中'
        : open
          ? '点击上岗'
          : hidden
            ? `最高击杀 ${Math.min(save.bestKills, CLEANER_KILLS)}/${CLEANER_KILLS}`
            : c.unlockHint;
      const detail = open
        ? `<span class="roster-detail"><b>${c.passiveName}</b>${c.passiveDesc}<br /><b>${c.ultName}</b>${c.ultDesc}</span>`
        : '';
      return `<button type="button" class="roster-item ${current ? 'current' : ''} ${open ? '' : 'locked'}" data-char="${c.id}" ${open ? '' : 'disabled'}>
        <span class="char-slot-avatar" style="background:${open ? c.color : ''}">${avatar}</span>
        <b>${hidden ? '？？？' : c.name}</b>
        <small>${hidden ? c.unlockHint : `${c.role} · ${c.weaponName}`}</small>
        ${detail}
        <span class="roster-state">${state}</span>
      </button>`;
    }).join('');
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
        (u, idx) => `<button type="button" class="upgrade-card${u.exclusive ? ' is-exclusive' : ''}${u.kind === 'MAIN_UP' ? ' is-main' : ''}" data-upidx="${idx}">
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
    const lvTag = state.weaponLevel >= 3 ? `{i:star}${wCfg.evolvedName}` : `${wCfg.shortTag} Lv.${state.weaponLevel}`;
    const sideTag = state.sidearms.map((sd) => `+${WEAPONS[sd.id].shortTag}`).join(' ');
    setRich(this.hudWeaponBadge, sideTag ? `${lvTag} · ${sideTag}` : `${lvTag} · ${wCfg.traitBadge}`);
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

    this.syncDock(state);

    const pct = Math.floor(state.ultCharge);
    this.ultFill.style.width = `${pct}%`;
    if (pct >= 100) {
      this.btnUlt.disabled = false;
      this.btnUlt.classList.add('ready');
      this.ultLabel.textContent = this.ultName === '准点下班' ? '18:00 准点下班!' : `${this.ultName}!`;
    } else {
      this.btnUlt.disabled = true;
      this.btnUlt.classList.remove('ready');
      this.ultLabel.textContent = `${this.ultName === '准点下班' ? '下班蓄力' : this.ultName} ${pct}%`;
    }
  }

  setQuip(quip: ActiveQuip | null): void {
    this.chatActive = !!quip;
    if (!quip) return;
    this.quipAvatarIcon.innerHTML = iconSvg(quip.icon ?? 'chat');
    this.quipSender.textContent = quip.sender ?? '摸鱼战神群';
    this.quipTag.textContent = quip.tag ?? '@你';
    this.quipText.textContent = quip.text;
    this.quipBanner.dataset.tone = quip.tone;
  }

  /** 底部操作坞消息槽：拾取横幅 > 工作群消息 > 实时战况，同一时间只显示一种 */
  private syncDock(state: GameState): void {
    const bn = state.banner;
    const mode = bn ? 'pickup' : this.chatActive ? 'chat' : 'stats';
    if (this.dockMsg.dataset.mode !== mode) this.dockMsg.dataset.mode = mode;
    if (bn) {
      const key = bn.title + '|' + bn.sub;
      if (key !== this.lastPickupKey) {
        this.lastPickupKey = key;
        this.dockPickupTitle.innerHTML = richHtml(bn.title);
        this.dockPickupSub.textContent = bn.sub;
        this.dockPickupBar.style.background = bn.color;
      }
    } else {
      this.lastPickupKey = '';
    }
    if (mode !== 'stats') return;
    setRich(this.dsSquad, `{i:squad} ${state.squadCount}`);
    setRich(this.dsKills, `{i:target} ${state.stats.kills}`);
    const combo = state.comboCount;
    this.dsCombo.classList.toggle('hidden', combo < 5);
    if (combo >= 5) {
      setRich(this.dsCombo, `{i:flame} ${combo} 连杀`);
      this.dsCombo.classList.toggle('hot', combo >= 30);
    }
    const ov = state.overloadEnemyTimer;
    this.dsOverload.classList.toggle('hidden', ov <= 0);
    // 连杀和过载同时出现时，击杀数让位，避免挤出槽位
    this.dsKills.classList.toggle('hidden', ov > 0 && combo >= 5);
    if (ov > 0) setRich(this.dsOverload, `{i:bolt} 过载 ${ov.toFixed(1)}s`);
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
    // 有「下一天」时它是主按钮，「再来一局」降为次要
    document.getElementById('btn-retry')!.className = hasNext ? 'secondary-btn' : 'cta-btn';

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

    this.resMaxSquad.textContent = `${state.stats.maxSquad}`;
    this.resFlipped.textContent = `${state.stats.gatesFlipped}`;
    this.resKills.textContent = `${state.stats.kills}`;
    this.resBeans.innerHTML = `+${state.stats.beansEarned}`;
    this.renderRecap(state);
  }

  /** 本局复盘：构筑标签 + 伤害来源条 */
  private renderRecap(state: GameState): void {
    const tags: string[] = [`<span class="tag">${state.weaponLevel >= 3 ? iconSvg('star') + ' ' : ''}${weaponDisplayName(state.activeWeapon, state.weaponLevel)}${state.weaponLevel === 2 ? ' Lv.2' : ''}</span>`];
    for (const sd of state.sidearms) tags.push(`<span class="tag">外挂 ${WEAPONS[sd.id].shortTag}${sd.level > 1 ? ` Lv.${sd.level}` : ''}</span>`);
    (Object.keys(state.affixes) as (keyof typeof state.affixes)[]).forEach((id) => {
      const lv = state.affixes[id];
      if (lv > 0) tags.push(`<span class="tag">${AFFIXES[id].name}${lv > 1 ? ` ×${lv}` : ''}</span>`);
    });
    for (const id of state.synergies) tags.push(`<span class="tag syn">${iconSvg('flask')} ${SYNERGIES[id].name}</span>`);
    this.recapBuild.innerHTML = tags.join('');

    const dmg = state.stats.damage;
    const total = dmg.weapon + dmg.sidearm + dmg.affix + dmg.synergy + dmg.ult;
    const rows: { id: DamageSource; label: string; color: string }[] = [
      { id: 'weapon', label: '主武器', color: '#FF7A3D' },
      { id: 'sidearm', label: '外挂', color: 'var(--purple)' },
      { id: 'affix', label: '词条', color: 'var(--mint)' },
      { id: 'synergy', label: '化学反应', color: 'var(--purple)' },
      { id: 'ult', label: '大招', color: 'var(--yellow)' }
    ];
    this.recapBars.innerHTML =
      total <= 0
        ? '<div class="recap-bar"><span class="lbl">还没打出伤害</span></div>'
        : rows
            .filter((r) => dmg[r.id] > 0 || r.id === 'weapon')
            .map((r) => {
              const pct = Math.round((dmg[r.id] / total) * 100);
              return `<div class="recap-bar"><span class="lbl">${r.label}</span><span class="bar"><i data-w="${pct}" style="background:${r.color}"></i></span><span class="pct">${pct}%</span></div>`;
            })
            .join('');
    // 下一帧再设宽度，触发过渡动画
    this.resultTimers.push(
      window.setTimeout(() => {
        const bars = this.recapBars.querySelectorAll('i[data-w]');
        for (let i = 0; i < bars.length; i++) {
          const el = bars[i] as HTMLElement;
          el.style.width = `${el.dataset.w}%`;
        }
      }, 60)
    );
  }

  private clearResultTimers(): void {
    for (const t of this.resultTimers) window.clearTimeout(t);
    this.resultTimers = [];
  }

  /** 绩效考核动画：逐条亮出经验来源，再把经验条从旧值推到新值；升职时弹任命书 */
  private playXpAnimation(res: RunXpResult | null): void {
    this.pendingPromos = [];
    if (!res) return;
    const later = (ms: number, fn: () => void) => this.resultTimers.push(window.setTimeout(fn, ms));

    this.xpTotal.textContent = `+${res.total}`;
    this.xpLines.innerHTML = res.lines
      .map((l) => `<li><span>${l.label}</span><b>+${l.xp}</b></li>`)
      .join('');
    this.xpRank.classList.remove('promoted');

    const setBar = (xpBase: number, xpNow: number, animate: boolean) => {
      const p = rankProgress(xpNow);
      const baseInRank = Math.max(p.rank.xp, xpBase);
      const span = p.next ? p.next.xp - p.rank.xp : 1;
      const baseRatio = p.next ? (baseInRank - p.rank.xp) / span : 1;
      const nowRatio = p.ratio;
      this.xpFill.style.transition = animate ? '' : 'none';
      this.xpGain.style.transition = animate ? '' : 'none';
      this.xpFill.style.width = `${(baseRatio * 100).toFixed(1)}%`;
      this.xpGain.style.left = `${(baseRatio * 100).toFixed(1)}%`;
      this.xpGain.style.width = `${(Math.max(0, nowRatio - baseRatio) * 100).toFixed(1)}%`;
      this.xpRank.textContent = p.rank.title;
      this.xpCount.textContent = p.next ? `${xpNow - p.rank.xp} / ${span}` : `CEO · ${xpNow}`;
    };

    // 初始：旧经验
    setBar(res.xpBefore, res.xpBefore, false);
    const lis = this.xpLines.querySelectorAll('li');
    let t = 250;
    for (let i = 0; i < lis.length; i++) {
      const li = lis[i];
      later(t, () => li.classList.add('on'));
      t += 170;
    }

    // 跨职级：先推满当前职级，再从新职级的 0 开始
    let xpCursor = res.xpBefore;
    for (let r = res.rankBefore; r < res.rankAfter; r++) {
      const target = RANKS[r].xp; // 下一职级门槛
      const from = xpCursor;
      later(t, () => {
        setBar(from, target - 0.001, true);
      });
      t += 750;
      const newRank = r + 1;
      later(t, () => {
        setBar(target, target, false);
        this.xpRank.classList.add('promoted');
        this.pendingPromos.push(newRank);
      });
      t += 120;
      xpCursor = target;
    }
    const from = xpCursor;
    later(t, () => setBar(from, res.xpAfter, true));
    t += 800;
    if (res.rankAfter > res.rankBefore) later(t, () => this.showNextPromo());
  }

  private showNextPromo(): void {
    const lv = this.pendingPromos.shift();
    if (lv === undefined) return;
    const r = RANKS[lv - 1];
    document.getElementById('promo-title')!.textContent = r.title;
    const ch = r.unlocks ? CHARACTERS.find((c) => c.id === r.unlocks) : null;
    const extra = r.reward.replace(/^新同事：[^·]+(· )?/, '').trim();
    document.getElementById('promo-unlock')!.innerHTML = ch
      ? `<div class="promo-char"><span class="char-slot-avatar" style="background:${ch.color}">${faceImg(ch.id, 'face')}</span><span><small>解锁新同事</small><b>${ch.name}</b>${ch.role}</span></div>${extra ? `<div style="margin-top:6px">${extra}</div>` : ''}`
      : r.reward;
    this.promoOverlay.classList.remove('hidden');
    this.actions.onUnlockAudio();
  }
}
