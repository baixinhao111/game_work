import { BADGES } from '../data/badges';
import { BOSSES } from '../data/enemies';
import { LEVELS } from '../data/levels';
import { PALETTE } from '../data/palette';
import { SYNERGIES } from '../data/synergies';
import { WEAPONS } from '../data/weapons';
import { EndlessDirector } from '../game/EndlessDirector';
import type { GameState, SaveData } from '../game/types';
import { ensureCanvasRoundRect } from './canvasCompat';
import type { SpriteCache } from './SpriteCache';

const BOSS_SPRITE_KEYS = {
  alarm: 'bossAlarm',
  projector: 'bossProjector',
  hydra: 'bossHydra',
  server: 'bossServer',
  kpi: 'bossKpi'
} as const;

export class PosterExporter {
  static generate(state: GameState, save: SaveData, sprites: SpriteCache): string {
    ensureCanvasRoundRect();
    const W = 750;
    const H = 1200;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d')!;

    // 1. 深炭笔记本网格底板
    ctx.fillStyle = PALETTE.bgDark;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(59, 66, 94, 0.35)';
    ctx.lineWidth = 2;
    for (let x = 0; x <= W; x += 48) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, H);
      ctx.stroke();
    }
    for (let y = 0; y <= H; y += 48) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(W, y);
      ctx.stroke();
    }

    // 2. 主手账诊断卡（硬投影 + 米白底纸）
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.roundRect(46, 52, W - 76, H - 96, 28);
    ctx.fill();

    ctx.fillStyle = PALETTE.paper;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.roundRect(34, 40, W - 76, H - 96, 28);
    ctx.fill();
    ctx.stroke();

    // 顶部荧光黄胶带贴纸
    ctx.save();
    ctx.translate(W * 0.5, 68);
    ctx.rotate(-0.025);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(-195, -24, 396, 52);
    ctx.fillStyle = PALETTE.yellow;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4.5;
    ctx.fillRect(-200, -28, 396, 52);
    ctx.strokeRect(-200, -28, 396, 52);
    ctx.fillStyle = PALETTE.ink;
    ctx.font = '900 24px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('今日摸鱼战报 · 精神状态诊断书', 0, -2);
    ctx.restore();

    // 日期 + 工牌号 + 关卡信息
    const today = new Date();
    const dateStr = `${today.getFullYear()}.${String(today.getMonth() + 1).padStart(2, '0')}.${String(today.getDate()).padStart(2, '0')}`;
    const modeLabel = state.isEndless
      ? `周末无尽加班 · 第 ${state.endlessWave} 波`
      : `DAY 0${state.levelDay} · ${LEVELS[state.levelDay - 1].weekday}「${LEVELS[state.levelDay - 1].title}」`;

    ctx.fillStyle = '#4B5068';
    ctx.font = '800 20px sans-serif';
    ctx.textAlign = 'left';
    // 海报要 toDataURL 导出，不画 SVG 图标（老 iOS WebView 会因此判定画布受污染而导出失败）
    ctx.fillText(`${dateStr}   工牌 NO.${save.workerCode}`, 70, 146);
    ctx.fillStyle = PALETTE.purple;
    ctx.font = '900 23px sans-serif';
    ctx.fillText(modeLabel, 70, 182);

    // 3. 角色 VS Boss 视觉区
    ctx.fillStyle = PALETTE.trackSurface;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(68, 208, W - 144, 186, 20);
    ctx.fill();
    ctx.stroke();

    const heroSp = sprites.get('heroSlacker');
    const bossId = state.isEndless
      ? EndlessDirector.getBossForWave(state.endlessWave)
      : LEVELS[state.levelDay - 1].bossId;
    const bossSp = sprites.get(BOSS_SPRITE_KEYS[BOSSES[bossId].style]);

    ctx.drawImage(heroSp.canvas, 130, 232, 138, 138);
    ctx.drawImage(bossSp.canvas, W - 290, 224, 152, 152);

    // VS 贴纸
    ctx.save();
    ctx.translate(W * 0.5 - 6, 300);
    ctx.rotate(-0.12);
    ctx.fillStyle = PALETTE.red;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(-42, -26, 84, 52, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = PALETTE.yellow;
    ctx.font = '900 28px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('VS', 0, 2);
    ctx.restore();

    // 4. 动态精神状态评级印章
    const victory = state.phase === 'VICTORY';
    const isSSS = state.isEndless && state.endlessWave >= 3;
    const isSSR = victory && state.squadCount >= 40 && state.stats.gatesFlipped >= 1;
    const isR = victory && state.squadCount < 15;

    let rankCode = 'SR';
    let rankTitle = '带薪如厕大师';
    let rankBg: string = PALETTE.mint;
    let rankQuote = '表面情绪稳定，背地里早已把所有红门驳回。';

    if (isSSS) {
      rankCode = 'SSS';
      rankTitle = '无尽加班卷王';
      rankBg = PALETTE.purple;
      rankQuote = `连熬 ${state.endlessWave} 波 Boss 不眨眼，老板看你都发怵。`;
    } else if (isSSR) {
      rankCode = 'SSR';
      rankTitle = '工位赛博战神';
      rankBg = PALETTE.yellow;
      rankQuote = '老板画的饼还没落地，就已经被你全数击碎。';
    } else if (isR) {
      rankCode = 'R';
      rankTitle = '咖啡因续命人';
      rankBg = PALETTE.coffee;
      rankQuote = '靠着最后一口冰美式，硬是把今天撑到了下班。';
    } else if (!victory) {
      rankCode = 'N';
      rankTitle = '当场红温被优化';
      rankBg = PALETTE.red;
      rankQuote = '需求太猛，建议先去工位喝杯水再来硬刚。';
    }

    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.roundRect(74, 422, W - 144, 152, 20);
    ctx.fill();

    ctx.fillStyle = rankBg;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 5;
    ctx.beginPath();
    ctx.roundRect(68, 416, W - 144, 152, 20);
    ctx.fill();
    ctx.stroke();

    const fgColor = rankCode === 'N' || rankCode === 'SSS' ? PALETTE.paper : PALETTE.ink;
    ctx.fillStyle = fgColor;
    ctx.font = '900 40px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(`${rankCode} · ${rankTitle}`, W * 0.5 - 4, 470);

    ctx.font = '700 22px sans-serif';
    ctx.fillText(`“${rankQuote}”`, W * 0.5 - 4, 526);

    // 5. 四项硬核战绩指标
    const buildText =
      state.synergies.length > 0
        ? SYNERGIES[state.synergies[0]].name
        : WEAPONS[state.activeWeapon].name;
    const stressIndex = Math.min(
      99.9,
      Math.max(
        38.5,
        (victory ? 76 : 45) +
          state.stats.gatesFlipped * 4.2 +
          Math.min(18, state.stats.maxSquad * 0.08) +
          (state.isEndless ? state.endlessWave * 5 : state.levelDay * 2)
      )
    ).toFixed(1);

    const cards = [
      { label: '最大集结人数', val: `${state.stats.maxSquad} 人`, bg: '#ECEAE2' },
      { label: '累计驳回红门', val: `${state.stats.gatesFlipped} 次`, bg: '#ECEAE2' },
      { label: '核心构筑流派', val: buildText, bg: '#E2FFF9' },
      { label: '今日抗压指数', val: `${stressIndex}%`, bg: '#FFF3B0' }
    ];

    const cw = (W - 160) * 0.5;
    const ch = 130;
    cards.forEach((c, idx) => {
      const col = idx % 2;
      const row = Math.floor(idx / 2);
      const x = 68 + col * (cw + 16);
      const y = 594 + row * (ch + 16);

      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.roundRect(x + 5, y + 5, cw, ch, 16);
      ctx.fill();

      ctx.fillStyle = c.bg;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(x, y, cw, ch, 16);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = '#4B5068';
      ctx.font = '800 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(c.label, x + cw * 0.5, y + 42);

      ctx.fillStyle = PALETTE.ink;
      ctx.font = '900 28px sans-serif';
      ctx.fillText(c.val, x + cw * 0.5, y + 92, cw - 22);
    });

    // 6. 已解锁工牌徽章栏
    const ownedBadges = BADGES.filter((b) => save.unlockedBadges.includes(b.id));
    ctx.fillStyle = '#ECEAE2';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.roundRect(68, 888, W - 144, 120, 16);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = PALETTE.ink;
    ctx.font = '900 20px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`已点亮工牌（${ownedBadges.length}/${BADGES.length}）`, 90, 926);

    if (ownedBadges.length === 0) {
      ctx.fillStyle = '#6A7088';
      ctx.font = '700 19px sans-serif';
      ctx.fillText('暂未解锁工牌，快去把周一 Boss 砸扁！', 90, 970);
    } else {
      ctx.font = '900 21px sans-serif';
      ctx.fillStyle = PALETTE.purple;
      const badgeLine = ownedBadges
        .slice(0, 3)
        .map((b) => `「${b.name}」`)
        .join('  ·  ');
      ctx.fillText(badgeLine, 90, 970);
    }

    // 7. 底部幽默落款
    ctx.fillStyle = '#4B5068';
    ctx.font = '800 20px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('本诊断纯属电子解压，请于每日 18:00 准点撤离工位', W * 0.5 - 4, 1054);

    ctx.fillStyle = PALETTE.ink;
    ctx.font = '900 24px sans-serif';
    ctx.fillText('《周一突围：DDL 战线》  #打工人反内卷爽游', W * 0.5 - 4, 1094);

    return canvas.toDataURL('image/png');
  }
}
