import { drawIcon, drawRichText, measureRichText, type IconName } from '../ui/icons';
import { PALETTE } from '../data/palette';
import type { ActiveQuip } from '../data/quips';
import { WEAPONS } from '../data/weapons';
import {
  clamp,
  DESIGN_H,
  DESIGN_W,
  LANE_HALF_W,
  PLAYER_Y,
  TRACK_BOTTOM_Y,
  TRACK_TOP_Y,
  SCROLL_SPEED,
  depthScale,
  projectX
} from '../engine/Viewport';
import { getGateFlipCap, isGateShootable } from '../game/GateSystem';
import type { GameWorld } from '../game/GameWorld';
import type { BossRuntime, BossShotKind, Enemy, Gate } from '../game/types';
import { ensureCanvasRoundRect } from './canvasCompat';
import type { CachedSprite, SpriteCache } from './SpriteCache';

const CLOCK_MARKS = ['09:00', '11:00', '13:00', '15:00', '17:30', '18:00'];
/** Boss 主题色：蓄力光晕、出招闪光、弹道预告 */
const BOSS_ACCENT = {
  alarm: '#FFE600',
  projector: '#7FF7FF',
  hydra: '#C77DFF',
  server: '#FF8A3D',
  kpi: '#FFC93C'
} as const;

const BOSS_SPRITES = {
  alarm: 'bossAlarm',
  projector: 'bossProjector',
  hydra: 'bossHydra',
  server: 'bossServer',
  kpi: 'bossKpi'
} as const;

export class Renderer {
  private readonly sortedEnemiesScratch: Enemy[] = [];
  private scrollOffset = 0;
  /** 色弱友好：门除颜色外再加纹理区分（红门斜纹、蓝门波点） */
  private colorblind = false;

  constructor(private readonly sprites: SpriteCache) {
    ensureCanvasRoundRect();
  }

  render(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const state = world.state;
    this.colorblind = world.save.settings.colorblind;
    // 路面滚动与门/敌人使用同一速度，避免“地面和物体速度对不上”的漂浮感
    this.scrollOffset = (state.elapsedSec * SCROLL_SPEED) % 90;

    ctx.save();
    if (state.shakeTimer > 0) {
      const mag = state.shakeMagnitude * Math.min(1, state.shakeTimer / 0.15);
      const sx = (Math.random() * 2 - 1) * mag;
      const sy = (Math.random() * 2 - 1) * mag;
      ctx.translate(sx, sy);
    }

    this.drawLayer0Track(ctx, world);
    this.drawLayer1GroundHints(ctx, world);
    this.drawLayer2Gates(ctx, world);
    this.drawLayer3EnemiesAndBoss(ctx, world);
    this.drawDeathPops(ctx, world);
    this.drawLayer4Squad(ctx, world);
    this.drawLayer5Projectiles(ctx, world);
    this.drawLayer6FxAndText(ctx, world);
    this.drawLayer7Overlay(ctx, world);
    this.drawImpactOverlay(ctx, world);
    this.drawTutorial(ctx, world);

    ctx.restore();
  }

  private drawLayer0Track(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    // 赛博都市夜空霓虹渐变底板
    const bgGrad = ctx.createLinearGradient(0, 0, 0, DESIGN_H);
    bgGrad.addColorStop(0, '#0F1222');
    bgGrad.addColorStop(0.45, '#191E36');
    bgGrad.addColorStop(1, '#221B3A');
    ctx.fillStyle = bgGrad;
    ctx.fillRect(-20, -20, DESIGN_W + 40, DESIGN_H + 40);

    // 跑道外侧流动都市光斑速度线
    ctx.fillStyle = 'rgba(0, 245, 212, 0.08)';
    for (let i = 0; i < 6; i++) {
      const y = ((i * 150 + this.scrollOffset * 2.2) % (DESIGN_H + 80)) - 40;
      ctx.fillRect(6, y, 4, 34);
      ctx.fillRect(DESIGN_W - 10, y + 50, 4, 34);
    }

    const topL = projectX(-LANE_HALF_W, TRACK_TOP_Y);
    const topR = projectX(LANE_HALF_W, TRACK_TOP_Y);
    const botL = projectX(-LANE_HALF_W, TRACK_BOTTOM_Y);
    const botR = projectX(LANE_HALF_W, TRACK_BOTTOM_Y);

    // 跑道主体基底
    ctx.fillStyle = '#1D2134';
    ctx.beginPath();
    ctx.moveTo(topL, TRACK_TOP_Y);
    ctx.lineTo(topR, TRACK_TOP_Y);
    ctx.lineTo(botR, TRACK_BOTTOM_Y);
    ctx.lineTo(botL, TRACK_BOTTOM_Y);
    ctx.closePath();
    ctx.fill();

    // 跑道表面交替深浅透视路带（强烈高速奔跑感）
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(topL, TRACK_TOP_Y);
    ctx.lineTo(topR, TRACK_TOP_Y);
    ctx.lineTo(botR, TRACK_BOTTOM_Y);
    ctx.lineTo(botL, TRACK_BOTTOM_Y);
    ctx.closePath();
    ctx.clip();

    const bandH = 45;
    const bandShift = this.scrollOffset % (bandH * 2);
    let bandIdx = 0;
    for (let y = TRACK_TOP_Y - bandH * 2 + bandShift; y < TRACK_BOTTOM_Y; y += bandH) {
      if (bandIdx % 2 === 0) {
        const y2 = y + bandH;
        const x1L = projectX(-LANE_HALF_W, y);
        const x1R = projectX(LANE_HALF_W, y);
        const x2L = projectX(-LANE_HALF_W, y2);
        const x2R = projectX(LANE_HALF_W, y2);
        ctx.fillStyle = 'rgba(46, 54, 84, 0.34)';
        ctx.beginPath();
        ctx.moveTo(x1L, y);
        ctx.lineTo(x1R, y);
        ctx.lineTo(x2R, y2);
        ctx.lineTo(x2L, y2);
        ctx.closePath();
        ctx.fill();
      }
      bandIdx++;
    }

    // 中央双虚线车道与外侧辅线
    ctx.strokeStyle = 'rgba(248, 247, 242, 0.14)';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 14]);
    ctx.lineDashOffset = -this.scrollOffset * 1.5;
    ctx.beginPath();
    ctx.moveTo(projectX(-3, TRACK_TOP_Y), TRACK_TOP_Y);
    ctx.lineTo(projectX(-3, TRACK_BOTTOM_Y), TRACK_BOTTOM_Y);
    ctx.moveTo(projectX(3, TRACK_TOP_Y), TRACK_TOP_Y);
    ctx.lineTo(projectX(3, TRACK_BOTTOM_Y), TRACK_BOTTOM_Y);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.lineWidth = 1.5;
    for (const lane of [-80, 80]) {
      ctx.beginPath();
      ctx.moveTo(projectX(lane, TRACK_TOP_Y), TRACK_TOP_Y);
      ctx.lineTo(projectX(lane, TRACK_BOTTOM_Y), TRACK_BOTTOM_Y);
      ctx.stroke();
    }

    // 滚动时间刻度 + 发光霓虹路桩
    let markIdx = 0;
    ctx.font = '800 10px sans-serif';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    for (let y = TRACK_TOP_Y + this.scrollOffset; y < TRACK_BOTTOM_Y; y += 90) {
      const lx = projectX(-LANE_HALF_W, y);
      const rx = projectX(LANE_HALF_W, y);
      ctx.fillStyle = 'rgba(248, 247, 242, 0.25)';
      ctx.fillText(CLOCK_MARKS[markIdx % CLOCK_MARKS.length], lx + 10, y - 6);

      // 路侧发光路桩
      const postColor = markIdx % 2 === 0 ? PALETTE.mint : PALETTE.yellow;
      ctx.fillStyle = postColor;
      ctx.fillRect(lx + 1, y - 4, 5, 8);
      ctx.fillRect(rx - 6, y - 4, 5, 8);
      markIdx++;
    }

    // 顶部地平线霓虹雾效（让门与丧尸潮自然涌出）
    const fogGrad = ctx.createLinearGradient(0, TRACK_TOP_Y, 0, TRACK_TOP_Y + 62);
    fogGrad.addColorStop(0, 'rgba(15, 18, 34, 0.92)');
    fogGrad.addColorStop(1, 'rgba(15, 18, 34, 0)');
    ctx.fillStyle = fogGrad;
    ctx.fillRect(0, TRACK_TOP_Y, DESIGN_W, 62);

    ctx.restore();

    // 跑道金属黑边护栏 + 薄荷青光边
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(topL, TRACK_TOP_Y);
    ctx.lineTo(botL, TRACK_BOTTOM_Y);
    ctx.moveTo(topR, TRACK_TOP_Y);
    ctx.lineTo(botR, TRACK_BOTTOM_Y);
    ctx.stroke();

    ctx.strokeStyle = world.bosses.boss.active ? PALETTE.red : PALETTE.mint;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(topL - 2, TRACK_TOP_Y);
    ctx.lineTo(botL - 2, TRACK_BOTTOM_Y);
    ctx.moveTo(topR + 2, TRACK_TOP_Y);
    ctx.lineTo(botR + 2, TRACK_BOTTOM_Y);
    ctx.stroke();
  }

  private drawLayer1GroundHints(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    this.drawDecals(ctx, world);
    // 大招全屏荧光滤镜
    if (world.state.ultActiveTimer > 0) {
      ctx.fillStyle = 'rgba(0, 245, 212, 0.1)';
      ctx.fillRect(0, TRACK_TOP_Y, DESIGN_W, TRACK_BOTTOM_Y - TRACK_TOP_Y);
    }

    // Boss 警戒光带
    if (world.bosses.boss.active) {
      const pulse = 0.08 + 0.07 * Math.sin(world.state.elapsedSec * 8);
      ctx.fillStyle = `rgba(255, 51, 102, ${pulse.toFixed(3)})`;
      ctx.fillRect(28, 180, DESIGN_W - 56, 120);
    }

    // 领队脚底瞄准指示环 + 微弱前方准星线
    const lx = projectX(world.squad.leaderLaneX, PLAYER_Y);
    ctx.save();
    ctx.strokeStyle = 'rgba(0, 245, 212, 0.25)';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 8]);
    ctx.beginPath();
    ctx.moveTo(lx, PLAYER_Y - 28);
    ctx.lineTo(lx, TRACK_TOP_Y + 40);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.fillStyle = 'rgba(0, 245, 212, 0.18)';
    ctx.beginPath();
    ctx.ellipse(lx, PLAYER_Y + 14, 24, 9, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 所有实体的接地椭圆投影（统一一次 fillStyle 减少上下文切换）
    ctx.fillStyle = 'rgba(10, 12, 20, 0.52)';
    const enemies = world.enemies.enemies.activeItems;
    for (let i = 0; i < enemies.length; i++) {
      const e = enemies[i];
      if (!e.active) continue;
      const s = depthScale(e.y);
      const sx = projectX(e.laneX, e.y);
      ctx.beginPath();
      ctx.ellipse(sx, e.y + e.radius * 0.72 * s, e.radius * 0.85 * s, 5.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    const units = world.squad.renderUnits;
    for (let i = 0; i < units.length; i++) {
      const u = units[i];
      const y = PLAYER_Y + u.dy;
      const sx = projectX(world.squad.leaderLaneX + u.dx, y);
      const s = depthScale(y);
      const rx = u.tier === 10 ? 22 : u.tier === 5 ? 16 : 12;
      ctx.beginPath();
      ctx.ellipse(sx, y + 15 * s, rx * s, 5.5 * s, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    if (world.bosses.boss.active) {
      const b = world.bosses.boss;
      const bx = projectX(b.laneX, b.y);
      ctx.beginPath();
      ctx.ellipse(bx, b.y + 44, 52, 16, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    this.drawBossHazards(ctx, world);
  }

  /** Boss 地面技能：激光柱（细线蓄能 → 三层光柱）/ 炸弹（瞄准框 + 抛物线落弹） */
  private drawBossHazards(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const hazards = world.bosses.hazards.activeItems;
    const boss = world.bosses.boss;
    const t = world.state.elapsedSec;
    const beamColor = boss.style === 'projector' ? '#7FF7FF' : boss.style === 'kpi' ? '#FFC93C' : PALETTE.red;
    for (let i = 0; i < hazards.length; i++) {
      const h = hazards[i];
      if (!h.active) continue;
      const warn = h.warnTimer > 0;
      const prog = warn ? 1 - h.warnTimer / h.warnMax : 1;

      if (h.kind === 'laser') {
        const topY = TRACK_TOP_Y + 6;
        const botY = TRACK_BOTTOM_Y;
        const xTop = projectX(h.laneX, topY);
        const xBot = projectX(h.laneX, botY);
        const column = (halfW: number) => {
          const wt = halfW * depthScale(topY);
          const wb = halfW * depthScale(botY);
          ctx.beginPath();
          ctx.moveTo(xTop - wt, topY);
          ctx.lineTo(xTop + wt, topY);
          ctx.lineTo(xBot + wb, botY);
          ctx.lineTo(xBot - wb, botY);
          ctx.closePath();
        };
        ctx.save();
        if (warn) {
          // 蓄能：危险区淡红底 + 中央细线由细变粗、越来越快地闪
          ctx.globalAlpha = 0.1 + 0.16 * prog;
          ctx.fillStyle = beamColor;
          column(h.halfWidth);
          ctx.fill();
          const flick = Math.floor(t * (8 + prog * 22)) % 2 === 0;
          ctx.globalAlpha = flick ? 0.95 : 0.45;
          ctx.strokeStyle = beamColor;
          ctx.lineWidth = 1.5 + prog * 4;
          ctx.setLineDash([12, 8]);
          ctx.lineDashOffset = -t * 120;
          ctx.beginPath();
          ctx.moveTo(xTop, topY);
          ctx.lineTo(xBot, botY);
          ctx.stroke();
          ctx.setLineDash([]);
          // 顶端蓄能光球
          ctx.globalAlpha = 0.6 + 0.4 * prog;
          ctx.fillStyle = beamColor;
          ctx.beginPath();
          ctx.arc(xTop, topY + 6, 5 + prog * 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = PALETTE.paper;
          ctx.beginPath();
          ctx.arc(xTop, topY + 6, 2 + prog * 5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          // 发射：外发光 + 主光柱 + 白色内芯（宽度抖动）
          const life = h.activeTimer;
          const jitter = 0.85 + 0.15 * Math.sin(t * 90 + i);
          ctx.globalAlpha = 0.28;
          ctx.fillStyle = beamColor;
          column(h.halfWidth * 1.9 * jitter);
          ctx.fill();
          ctx.globalAlpha = 0.9;
          column(h.halfWidth * jitter);
          ctx.fill();
          ctx.strokeStyle = PALETTE.ink;
          ctx.lineWidth = 3;
          ctx.stroke();
          ctx.globalAlpha = 1;
          ctx.fillStyle = PALETTE.paper;
          column(h.halfWidth * 0.36 * jitter);
          ctx.fill();
          // 顶端光斑 + 底部冲击圈
          ctx.fillStyle = PALETTE.paper;
          ctx.beginPath();
          ctx.arc(xTop, topY + 4, 14 * jitter, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = Math.min(1, life / 0.2);
          ctx.strokeStyle = beamColor;
          ctx.lineWidth = 4;
          ctx.beginPath();
          ctx.ellipse(xBot, PLAYER_Y + 18, h.halfWidth * 1.6 + (1 - life / 0.42) * 30, 10, 0, 0, Math.PI * 2);
          ctx.stroke();
        }
        ctx.restore();
      } else {
        const x = projectX(h.laneX, h.y);
        const s = depthScale(h.y);
        const r = h.halfWidth * s;
        ctx.save();
        if (warn) {
          // 落点：红色危险区 + 收缩圈 + 旋转瞄准框
          ctx.fillStyle = `rgba(255, 51, 102, ${(0.12 + 0.22 * prog).toFixed(3)})`;
          ctx.beginPath();
          ctx.ellipse(x, h.y + 6, r, r * 0.42, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = PALETTE.red;
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.strokeStyle = PALETTE.yellow;
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.ellipse(x, h.y + 6, r * (1 - prog * 0.85), r * 0.42 * (1 - prog * 0.85), 0, 0, Math.PI * 2);
          ctx.stroke();
          ctx.translate(x, h.y + 6);
          ctx.scale(1, 0.42);
          ctx.rotate(t * 3);
          ctx.strokeStyle = PALETTE.red;
          ctx.lineWidth = 4;
          for (let k = 0; k < 4; k++) {
            ctx.rotate(Math.PI / 2);
            ctx.beginPath();
            ctx.arc(0, 0, r + 8, -0.35, 0.35);
            ctx.stroke();
          }
          ctx.restore();
          ctx.save();
          // 炸弹从 Boss 处抛物线砸下来
          const ease = prog * prog;
          const sx = projectX(boss.active ? boss.laneX : h.laneX, boss.active ? boss.y : TRACK_TOP_Y);
          const sy = boss.active ? boss.y + 20 : TRACK_TOP_Y;
          const bxp = sx + (x - sx) * ease;
          const byp = sy + (h.y - sy) * ease - Math.sin(prog * Math.PI) * 90;
          const bs = 10 + 6 * ease;
          ctx.fillStyle = PALETTE.ink;
          ctx.beginPath();
          ctx.arc(bxp, byp, bs, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = '#4A4F66';
          ctx.beginPath();
          ctx.arc(bxp - bs * 0.35, byp - bs * 0.35, bs * 0.35, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = PALETTE.coffee;
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.moveTo(bxp + bs * 0.5, byp - bs * 0.7);
          ctx.quadraticCurveTo(bxp + bs, byp - bs * 1.4, bxp + bs * 0.6, byp - bs * 1.8);
          ctx.stroke();
          ctx.fillStyle = Math.floor(t * 20) % 2 === 0 ? PALETTE.yellow : PALETTE.red;
          ctx.beginPath();
          ctx.arc(bxp + bs * 0.6, byp - bs * 1.8, 3.5, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.globalAlpha = Math.min(1, h.activeTimer / 0.18);
          ctx.fillStyle = PALETTE.yellow;
          ctx.beginPath();
          ctx.ellipse(x, h.y + 6, r * 1.2, r * 0.55, 0, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }
  }

  private drawLayer2Gates(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const items = world.gates.pool.activeItems;
    for (let i = 0; i < items.length; i++) {
      const g = items[i];
      if (!g.active) continue;

      const s = depthScale(g.y) * g.bounceScale;
      const sx = projectX(g.laneX, g.y);

      ctx.save();
      if (g.pairLocked) {
        ctx.globalAlpha = 0.22;
      }

      if (g.moveSpeedX !== 0) {
        const leftWall = projectX(-LANE_HALF_W + 14, g.y);
        const rightWall = projectX(LANE_HALF_W - 14, g.y);
        ctx.strokeStyle = PALETTE.yellow;
        ctx.lineWidth = 2.5;
        ctx.setLineDash([7, 6]);
        ctx.beginPath();
        ctx.moveTo(leftWall, g.y + 8);
        ctx.lineTo(rightWall, g.y + 8);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (g.linkedPartnerId) {
        const all = world.gates.pool.activeItems;
        for (let j = 0; j < all.length; j++) {
          const partner = all[j];
          if (partner.active && !partner.pairLocked && partner.configId === g.linkedPartnerId) {
            const px = projectX(partner.laneX, partner.y);
            ctx.save();
            ctx.strokeStyle = PALETTE.yellow;
            ctx.lineWidth = 3;
            ctx.setLineDash([8, 6]);
            ctx.lineDashOffset = -world.state.elapsedSec * 55;
            ctx.beginPath();
            ctx.moveTo(sx, g.y - 26 * s);
            ctx.quadraticCurveTo((sx + px) * 0.5, g.y - 46 * s, px, partner.y - 26 * s);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.restore();
            break;
          }
        }
      }

      if (g.kind === 'SUPPLY_CRATE') {
        this.drawCrateGate(ctx, g, sx, g.y, s, world.state.elapsedSec, !world.state.isEndless);
      } else {
        this.drawMathGate(ctx, g, sx, g.y, s, world.state.elapsedSec);
      }

      ctx.restore();
    }
  }

  private drawTargetReticle(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    r: number,
    color: string
  ): void {
    ctx.save();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = Math.max(2, r * 0.45);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(1.4, r * 0.28);
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.moveTo(x - r * 1.45, y);
    ctx.lineTo(x - r * 0.55, y);
    ctx.moveTo(x + r * 0.55, y);
    ctx.lineTo(x + r * 1.45, y);
    ctx.moveTo(x, y - r * 1.45);
    ctx.lineTo(x, y - r * 0.55);
    ctx.moveTo(x, y + r * 0.55);
    ctx.lineTo(x, y + r * 1.45);
    ctx.stroke();
    ctx.restore();
  }

  private drawCrateGate(
    ctx: CanvasRenderingContext2D,
    g: Gate,
    sx: number,
    sy: number,
    s: number,
    timeSec: number,
    threeChoice = false
  ): void {
    const sp = this.sprites.get('propCrate');
    const drawImg = g.hitFlashTimer > 0 ? sp.flashCanvas : sp.canvas;
    const hover = Math.sin(timeSec * 6) * 2.5;
    const w = sp.logicalW * s;
    const h = sp.logicalH * s;

    // 脚底亮黄光圈提示可打爆
    ctx.strokeStyle = PALETTE.yellow;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(sx, sy + 20 * s, 30 * s, 10 * s, 0, 0, Math.PI * 2);
    ctx.stroke();

    ctx.drawImage(drawImg, sx - w * 0.5, sy - h * 0.5 + hover, w, h);

    // 血条 + 左侧靶心标志（强化“可射击靶标”视觉语言）
    const barW = 68 * s;
    const ratio = Math.max(0, g.barrelHp / Math.max(1, g.barrelMaxHp));
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.roundRect(sx - barW * 0.5 - 2, sy - 42 * s, barW + 4, 11, 4);
    ctx.fill();
    ctx.fillStyle = PALETTE.yellow;
    ctx.beginPath();
    ctx.roundRect(sx - barW * 0.5, sy - 42 * s + 2, barW * ratio, 7, 3);
    ctx.fill();

    this.drawTargetReticle(ctx, sx - barW * 0.5 - 10 * s, sy - 42 * s + 5.5, 4.8 * s, PALETTE.yellow);

    const tag = g.labelOverride ?? '空投补给';
    ctx.font = `900 ${Math.round(12 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4;
    ctx.strokeText(tag, sx, sy - 45 * s);
    ctx.fillStyle = PALETTE.yellow;
    ctx.fillText(tag, sx, sy - 45 * s);

    // 顶部类型徽章：明确区分「🔄 换枪」还是「✨ +词条 · 不换枪」
    let pillText = '';
    let pillColor: string = PALETTE.yellow;
    if (threeChoice) {
      // 主线：打爆后三选一（关卡设计的奖励是其中一张）
      pillText = '{i:box} 打爆三选一';
      pillColor = PALETTE.yellow;
    } else if (g.rewardWeapon) {
      pillText = `{i:swap} 换枪 · ${WEAPONS[g.rewardWeapon].traitBadge}`;
      pillColor = PALETTE.yellow;
    } else if (g.rewardAffix) {
      pillText = '{i:sparkle} +词条 · 不换枪';
      pillColor = PALETTE.mint;
    }
    if (pillText) {
      ctx.font = `900 ${Math.round(9.5 * s)}px sans-serif`;
      const pillW = Math.max(78 * s, measureRichText(ctx, pillText) + 12 * s);
      const pillH = 15 * s;
      const pillY = sy - 61 * s - pillH;
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.roundRect(sx - pillW * 0.5, pillY, pillW, pillH, 5);
      ctx.fill();
      ctx.strokeStyle = pillColor;
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = pillColor;
      ctx.textBaseline = 'middle';
      drawRichText(ctx, pillText, sx, pillY + pillH * 0.5 + 0.5);
    }
  }

  /** 色弱模式纹理：坏门 = 粗交叉斜纹，好门 = 波点（在门体裁剪区域内绘制） */
  private drawColorblindPattern(
    ctx: CanvasRenderingContext2D,
    bad: boolean,
    x0: number,
    y0: number,
    w: number,
    h: number,
    s: number
  ): void {
    ctx.save();
    ctx.globalAlpha = 0.55;
    if (bad) {
      ctx.strokeStyle = PALETTE.paper;
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      const step = 12 * s;
      for (let rx = x0 - h; rx < x0 + w + h; rx += step) {
        ctx.moveTo(rx, y0 + h);
        ctx.lineTo(rx + h, y0);
        ctx.moveTo(rx, y0);
        ctx.lineTo(rx + h, y0 + h);
      }
      ctx.stroke();
    } else {
      ctx.fillStyle = PALETTE.paper;
      const step = 11 * s;
      ctx.beginPath();
      for (let yy = y0 + step * 0.5; yy < y0 + h; yy += step) {
        const odd = Math.round((yy - y0) / step) % 2;
        for (let xx = x0 + step * (odd ? 1 : 0.5); xx < x0 + w; xx += step) {
          ctx.moveTo(xx + 2.2 * s, yy);
          ctx.arc(xx, yy, 2.2 * s, 0, Math.PI * 2);
        }
      }
      ctx.fill();
    }
    ctx.restore();
  }

  private drawMathGate(
    ctx: CanvasRenderingContext2D,
    g: Gate,
    sx: number,
    sy: number,
    s: number,
    timeSec: number
  ): void {
    const w = g.width * s;
    const h = g.height * s;
    const x0 = sx - w * 0.5;
    const y0 = sy - h * 0.5;
    const shootable = isGateShootable(g);
    const flipCap = getGateFlipCap(g);

    let mainColor: string = PALETTE.mint;
    let fillColor = 'rgba(0, 245, 212, 0.17)';
    let tagText = '摸鱼增员';
    if (g.op === '-' || g.op === '÷') {
      mainColor = PALETTE.red;
      fillColor = shootable ? 'rgba(44, 14, 24, 0.86)' : 'rgba(255, 51, 102, 0.22)';
      tagText = g.labelOverride
        ? shootable
          ? `{i:target} ${g.labelOverride}`
          : g.labelOverride
        : shootable
          ? '{i:target} 狂射洗白'
          : '加班减员';
    } else if (g.kind === 'OVERLOAD') {
      mainColor = PALETTE.yellow;
      fillColor = 'rgba(20, 14, 34, 0.76)';
      tagText = g.labelOverride ?? '{i:bolt} 高压过载';
    } else if (g.kind === 'SEESAW') {
      mainColor = PALETTE.mint;
      fillColor = 'rgba(0, 245, 212, 0.17)';
      tagText = g.labelOverride ?? '联动加码';
    } else if (g.op === 'BOX') {
      mainColor = PALETTE.purple;
      fillColor = 'rgba(155, 93, 229, 0.24)';
      tagText = '神秘盲盒';
    } else if (g.op === 'ULT') {
      mainColor = PALETTE.yellow;
      fillColor = 'rgba(255, 230, 0, 0.20)';
      tagText = '下班充能';
    } else if (g.flippedToBlue) {
      if (shootable) {
        mainColor = PALETTE.mint;
        fillColor = 'rgba(10, 36, 40, 0.84)';
        tagText = `{i:target} 续射加码 (${g.value}/${flipCap})`;
      } else {
        mainColor = PALETTE.mint;
        fillColor = 'rgba(0, 245, 212, 0.20)';
        tagText = '已满额 · 穿透';
      }
    } else if (g.moveSpeedX !== 0) {
      tagText = '滑轨门';
    }

    // 投影底座光影：实心靶门厚重，光幕门轻盈
    ctx.fillStyle = shootable ? 'rgba(10, 12, 20, 0.58)' : 'rgba(10, 12, 20, 0.25)';
    ctx.beginPath();
    ctx.roundRect(x0 + (shootable ? 4 : 2), y0 + (shootable ? 6 : 4), w, h, 10);
    ctx.fill();

    // 外圈发光框（同心粗线替代 shadowBlur）
    ctx.save();
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = shootable ? 5 : 4;
    ctx.globalAlpha *= shootable ? 0.24 : 0.18;
    ctx.beginPath();
    ctx.roundRect(x0 - 2, y0 - 2, w + 4, h + 4, 11);
    ctx.stroke();
    ctx.restore();

    // 门体填充 + 内部动态纹理
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 9);
    ctx.clip();

    ctx.fillStyle = g.hitFlashTimer > 0 ? 'rgba(248, 247, 242, 0.72)' : fillColor;
    ctx.fillRect(x0, y0, w, h);

    if (shootable) {
      // 可射击装甲靶门：高对比斜条纹
      ctx.fillStyle = g.op === '-' || g.op === '÷' ? 'rgba(255, 51, 102, 0.22)' : 'rgba(0, 245, 212, 0.16)';
      for (let rx = x0 - h; rx < x0 + w; rx += 18 * s) {
        ctx.beginPath();
        ctx.moveTo(rx, y0 + h);
        ctx.lineTo(rx + 8 * s, y0 + h);
        ctx.lineTo(rx + h + 8 * s, y0);
        ctx.lineTo(rx + h, y0);
        ctx.closePath();
        ctx.fill();
      }
    } else {
      // 可穿透全息光幕门：动态扫描光带 + 上浮能量折线（暗示子弹可直穿）
      const scanSpan = w + 40 * s;
      const scanX = x0 + ((timeSec * 55 * s) % scanSpan) - 20 * s;
      ctx.fillStyle = 'rgba(255, 255, 255, 0.13)';
      ctx.beginPath();
      ctx.moveTo(scanX, y0);
      ctx.lineTo(scanX + 18 * s, y0);
      ctx.lineTo(scanX + 4 * s, y0 + h);
      ctx.lineTo(scanX - 14 * s, y0 + h);
      ctx.closePath();
      ctx.fill();

      const chevOffset = (timeSec * 28 * s) % (16 * s);
      ctx.strokeStyle = mainColor;
      ctx.globalAlpha *= 0.22;
      ctx.lineWidth = 1.6;
      ctx.beginPath();
      for (let cy = y0 + h + 8 * s - chevOffset; cy > y0 - 8 * s; cy -= 16 * s) {
        ctx.moveTo(sx - 18 * s, cy + 5 * s);
        ctx.lineTo(sx, cy);
        ctx.lineTo(sx + 18 * s, cy + 5 * s);
      }
      ctx.stroke();
    }
    if (this.colorblind) this.drawColorblindPattern(ctx, g.op === '-' || g.op === '÷', x0, y0, w, h, s);
    ctx.restore();

    if (shootable) {
      // 实心装甲靶门边框 + 护角钢板 + 粗重铆钉立柱 + 左侧靶心
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(x0, y0, w, h, 9);
      ctx.stroke();

      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2.4;
      ctx.beginPath();
      ctx.roundRect(x0 + 2.5, y0 + 2.5, w - 5, h - 5, 7);
      ctx.stroke();

      // 四角 L 型护角铁片
      const cLen = 9 * s;
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(x0, y0 + cLen);
      ctx.lineTo(x0, y0);
      ctx.lineTo(x0 + cLen, y0);
      ctx.moveTo(x0 + w - cLen, y0);
      ctx.lineTo(x0 + w, y0);
      ctx.lineTo(x0 + w, y0 + cLen);
      ctx.moveTo(x0, y0 + h - cLen);
      ctx.lineTo(x0, y0 + h);
      ctx.lineTo(x0 + cLen, y0 + h);
      ctx.moveTo(x0 + w - cLen, y0 + h);
      ctx.lineTo(x0 + w, y0 + h);
      ctx.lineTo(x0 + w, y0 + h - cLen);
      ctx.stroke();

      // 粗重立柱 + 铆钉
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(x0 - 6, y0 - 5, 12, h + 10);
      ctx.fillRect(x0 + w - 6, y0 - 5, 12, h + 10);
      ctx.fillStyle = mainColor;
      ctx.fillRect(x0 - 3, y0 - 2, 6, h + 4);
      ctx.fillRect(x0 + w - 3, y0 - 2, 6, h + 4);
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(x0 - 1.5, y0 + 4, 3, 3);
      ctx.fillRect(x0 - 1.5, y0 + h - 7, 3, 3);
      ctx.fillRect(x0 + w - 1.5, y0 + 4, 3, 3);
      ctx.fillRect(x0 + w - 1.5, y0 + h - 7, 3, 3);

      // 门内左侧矢量准星靶标
      this.drawTargetReticle(ctx, x0 + 18 * s, sy, 6.2 * s, mainColor);
    } else {
      // 可穿透光幕门：动态虚线能量框 + 细窄霓虹发生器立柱
      ctx.save();
      ctx.strokeStyle = mainColor;
      ctx.lineWidth = 2.4;
      ctx.setLineDash([7 * s, 5 * s]);
      ctx.lineDashOffset = -timeSec * 24;
      ctx.beginPath();
      ctx.roundRect(x0 + 1, y0 + 1, w - 2, h - 2, 9);
      ctx.stroke();
      ctx.restore();

      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(x0 - 3, y0 - 2, 6, h + 4);
      ctx.fillRect(x0 + w - 3, y0 - 2, 6, h + 4);
      ctx.fillStyle = mainColor;
      ctx.fillRect(x0 - 1.5, y0, 3, h);
      ctx.fillRect(x0 + w - 1.5, y0, 3, h);
      ctx.beginPath();
      ctx.arc(x0, y0 - 2, 3.2 * s, 0, Math.PI * 2);
      ctx.fill();
      ctx.beginPath();
      ctx.arc(x0 + w, y0 - 2, 3.2 * s, 0, Math.PI * 2);
      ctx.fill();
    }

    // 顶部迷你中文铭牌（动态测量宽度，确保文字不被裁剪）
    ctx.font = `900 ${Math.round(9.5 * s)}px sans-serif`;
    const measuredTag = measureRichText(ctx, tagText);
    const tagW = Math.min(w - 6, Math.max(66 * s, measuredTag + 14 * s));
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.roundRect(sx - tagW * 0.5, y0 - 9 * s, tagW, 15 * s, 5);
    ctx.fill();
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 1.2;
    ctx.stroke();
    ctx.fillStyle = mainColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawRichText(ctx, tagText, sx, y0 - 1.5 * s, { maxWidth: tagW - 6 });

    // 可射击门底部洗白/加码进度条
    if (shootable) {
      let progress = 0;
      let barColor: string = PALETTE.mint;
      if (g.op === '÷') {
        const curStep = Math.min(1, g.flipProgress / Math.max(1, g.flipHpPerStep));
        progress = Math.min(1, (g.flipTickCount + curStep) / 8);
      } else if (g.op === '-') {
        progress = Math.min(1, g.flipProgress / Math.max(1, g.flipHpPerStep));
      } else if (g.flippedToBlue && g.op === '+') {
        progress = Math.min(1, g.value / Math.max(1, flipCap));
        barColor = PALETTE.yellow;
      }
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.roundRect(x0 + 10, y0 + h - 9, w - 20, 6, 3);
      ctx.fill();
      if (progress > 0) {
        ctx.fillStyle = barColor;
        ctx.beginPath();
        ctx.roundRect(x0 + 11, y0 + h - 8, Math.max(4, (w - 22) * progress), 4, 2);
        ctx.fill();
      }
    }

    // 门面大数字算式（红门如带 labelOverride，已在顶部铭牌显示，此处仍显示清晰算式）
    let label =
      g.op === '-' || g.op === '÷'
        ? `${g.op}${g.value}`
        : (g.labelOverride ?? `${g.op}${g.value}`);
    if (g.flippedToBlue && g.op === '+') {
      label = `+${g.value}`;
    } else if (g.op === '+' || g.op === '×') {
      label = `${g.op}${g.value}`;
    }

    const fontSize = label.length > 5 ? Math.round(14 * s) : Math.round(24 * s);
    ctx.font = `900 ${fontSize}px sans-serif`;
    const labelW = ctx.measureText(label).width;
    const labelX = shootable && sx - labelW * 0.5 < x0 + 27 * s ? sx + 7 * s : sx;
    const labelY = shootable ? sy : sy + 1.5 * s;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4.5;
    ctx.strokeText(label, labelX, labelY);
    ctx.fillStyle = PALETTE.paper;
    ctx.fillText(label, labelX, labelY);
  }

  private drawLayer3EnemiesAndBoss(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    this.sortedEnemiesScratch.length = 0;
    const activeEnemies = world.enemies.enemies.activeItems;
    for (let i = 0; i < activeEnemies.length; i++) {
      if (activeEnemies[i].active) this.sortedEnemiesScratch.push(activeEnemies[i]);
    }
    this.sortedEnemiesScratch.sort((a, b) => a.y - b.y);

    for (let i = 0; i < this.sortedEnemiesScratch.length; i++) {
      const e = this.sortedEnemiesScratch[i];
      const sp = this.getEnemySprite(e.configId);
      const scaleMult = e.configId === 'client_mini' ? 0.66 : 1.0;
      const s = depthScale(e.y) * scaleMult;
      const sx = projectX(e.laneX, e.y);
      const img = e.flashTimer > 0 ? sp.flashCanvas : sp.canvas;

      const stride = Math.sin(e.wobblePhase);
      const tilt = stride * (e.configId === 'ppt_pie' ? 0.05 : 0.08) + e.rot;
      // 从地平线雾中渐显，而不是在顶部突然出现
      const fade = Math.max(0, Math.min(1, (e.y - (TRACK_TOP_Y - 20)) / 46));
      if (fade <= 0) continue;
      const squashY = 1 - Math.abs(stride) * 0.06;
      const squashX = 1 + Math.abs(stride) * 0.05;

      ctx.save();
      ctx.globalAlpha = fade;
      ctx.translate(sx, e.y);
      ctx.rotate(tilt);
      ctx.scale(squashX, squashY);
      const w = sp.logicalW * s;
      const h = sp.logicalH * s;
      ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h);

      if (e.deepChillTimer > 0) {
        ctx.strokeStyle = PALETTE.mint;
        ctx.lineWidth = 3.2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * s + 5, 0, Math.PI * 2);
        ctx.stroke();
      } else if (e.chillTimer > 0) {
        ctx.strokeStyle = PALETTE.mint;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * s + 3, 0, Math.PI * 2);
        ctx.stroke();
      }
      if (world.state.overloadEnemyTimer > 0) {
        ctx.strokeStyle = PALETTE.red;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * s + 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      if (e.configId === 'ppt_pie' || e.configId === 'client_tweak') {
        const bw = 38 * depthScale(e.y);
        const topY = e.y - sp.logicalH * 0.45 * depthScale(e.y) - 6;
        ctx.fillStyle = PALETTE.ink;
        ctx.fillRect(sx - bw * 0.5 - 1.5, topY - 1.5, bw + 3, 7);
        ctx.fillStyle = PALETTE.red;
        ctx.fillRect(sx - bw * 0.5, topY, bw * Math.max(0, e.hp / e.maxHp), 4);
      }
    }

    const boss = world.bosses.boss;
    if (boss.active) {
      const bx = projectX(boss.laneX, boss.y);
      const t = world.state.elapsedSec;
      const vib = Math.sin(boss.ringPhase) * (boss.enraged ? 4.2 : 2.2);
      const pulse = 1 + Math.sin(t * (boss.enraged ? 12 : 6)) * 0.03;
      const accent = BOSS_ACCENT[boss.style];
      const WIND = 0.4;
      const windK =
        boss.dying <= 0 && boss.landed && boss.shieldTimer <= 0 && boss.attackTimer < WIND
          ? 1 - Math.max(0, boss.attackTimer) / WIND
          : 0;
      const fireK = boss.fireFlash / 0.22;
      const dieShakeX = boss.dying > 0 ? (Math.random() - 0.5) * 12 : 0;
      const dieShakeY = boss.dying > 0 ? (Math.random() - 0.5) * 8 : 0;

      // 蓄力：背后主题色光晕 + 向中心收拢的火星
      if (windK > 0) {
        const gr = boss.radius * (1.3 + 0.6 * windK);
        const g = ctx.createRadialGradient(bx, boss.y, boss.radius * 0.3, bx, boss.y, gr);
        g.addColorStop(0, accent + 'CC');
        g.addColorStop(1, accent + '00');
        ctx.globalAlpha = 0.25 + 0.6 * windK;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(bx, boss.y, gr, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2 + t * 4;
          const rr = boss.radius * (2.1 - 1.4 * windK);
          ctx.fillStyle = k % 2 ? accent : PALETTE.paper;
          ctx.beginPath();
          ctx.arc(bx + Math.cos(a) * rr, boss.y + Math.sin(a) * rr * 0.7, 3 + 3 * windK, 0, Math.PI * 2);
          ctx.fill();
        }
        // 扇形弹：提前画出虚线弹道
        const next = world.bosses.peekNextMove();
        if (next && next.startsWith('fan')) {
          const count = next === 'fan3' ? 3 : next === 'fan5' ? 5 : 7;
          const spread = next === 'fan3' ? 0.42 : next === 'fan5' ? 0.62 : 0.86;
          const base = Math.atan2(world.squad.leaderLaneX - boss.laneX, PLAYER_Y - boss.y);
          ctx.strokeStyle = accent;
          ctx.globalAlpha = 0.25 + 0.5 * windK;
          ctx.lineWidth = 2;
          ctx.setLineDash([8, 10]);
          ctx.lineDashOffset = -t * 80;
          for (let k = 0; k < count; k++) {
            const a = base - spread / 2 + (k / (count - 1)) * spread;
            const L = 560;
            ctx.beginPath();
            ctx.moveTo(bx, boss.y + 30);
            ctx.lineTo(projectX(boss.laneX + Math.sin(a) * L, boss.y + Math.cos(a) * L), boss.y + Math.cos(a) * L);
            ctx.stroke();
          }
          ctx.setLineDash([]);
          ctx.globalAlpha = 1;
        }
      }

      ctx.save();
      ctx.translate(bx + vib + dieShakeX, boss.y - fireK * 9 + dieShakeY);
      const swell = 1 + 0.07 * windK + (boss.dying > 0 ? 0.06 : 0);
      ctx.scale(pulse * swell, (2 - pulse) * swell);
      const sp = this.sprites.get(BOSS_SPRITES[boss.style]);
      if (sp.loaded || boss.style === 'alarm') {
        const img = boss.enraged && Math.floor(t * 8) % 2 === 0 ? sp.rageCanvas : sp.canvas;
        ctx.drawImage(img, -sp.logicalW * 0.5, -sp.logicalH * 0.5, sp.logicalW, sp.logicalH);
        // 受击闪白：持续被打时整只 Boss 会一直是白的、看不清，改成约 6Hz 闪烁的半透明白色叠层
        if (boss.flashTimer > 0 && Math.floor(t * 12) % 2 === 0) {
          ctx.globalAlpha = 0.42;
          ctx.drawImage(sp.flashCanvas, -sp.logicalW * 0.5, -sp.logicalH * 0.5, sp.logicalW, sp.logicalH);
          ctx.globalAlpha = 1;
        }
      } else {
        // 图片加载失败时的矢量兜底
        this.drawVectorBoss(ctx, boss, t);
      }
      ctx.restore();

      // 出招闪光：Boss 下方炸开一圈星芒
      if (fireK > 0) {
        const mx = bx;
        const my = boss.y + boss.radius * 0.75;
        const r = 14 + 26 * (1 - fireK);
        ctx.globalAlpha = fireK;
        ctx.fillStyle = PALETTE.paper;
        ctx.beginPath();
        for (let k = 0; k < 16; k++) {
          const a = (k / 16) * Math.PI * 2;
          const rr = k % 2 === 0 ? r : r * 0.45;
          ctx.lineTo(mx + Math.cos(a) * rr, my + Math.sin(a) * rr);
        }
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.arc(mx, my, r * 0.35, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }

      // 开会免伤护盾
      if (boss.shieldTimer > 0) {
        ctx.save();
        ctx.strokeStyle = PALETTE.mint;
        ctx.lineWidth = 4;
        ctx.setLineDash([10, 7]);
        ctx.lineDashOffset = -t * 40;
        ctx.globalAlpha = 0.6 + 0.3 * Math.sin(t * 16);
        ctx.beginPath();
        ctx.arc(bx, boss.y, boss.radius + 16, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
        this.drawSticker(ctx, bx, boss.y - boss.radius - 26, '开会中 · 免伤', PALETTE.mint, PALETTE.ink, 12);
        ctx.restore();
      }
    }
  }

  /** 首局新手引导：拖动手势 / 指向目标的贴纸提示 */
  private drawTutorial(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const tip = world.tutorial.tip;
    if (!tip || world.state.phase !== 'PLAYING') return;
    const t = world.state.elapsedSec;
    const appear = Math.min(1, tip.age / 0.2);

    ctx.save();
    ctx.globalAlpha = appear;
    ctx.font = '900 15px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    const bubble = (cx: number, cy: number) => {
      const w = Math.min(DESIGN_W - 24, measureRichText(ctx, tip.text) + 30);
      const h = 34;
      const x = Math.max(12 + w / 2, Math.min(DESIGN_W - 12 - w / 2, cx));
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.roundRect(x - w / 2 + 4, cy - h / 2 + 4, w, h, 10);
      ctx.fill();
      ctx.fillStyle = PALETTE.paper;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(x - w / 2, cy - h / 2, w, h, 10);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.ink;
      drawRichText(ctx, tip.text, x, cy + 0.5, { maxWidth: w - 16 });
    };

    if (tip.id === 'drag') {
      // 小队下方：左右滑动的手 + 双向箭头轨道
      const lx = projectX(world.squad.leaderLaneX, PLAYER_Y);
      const y = PLAYER_Y + 62;
      ctx.strokeStyle = 'rgba(248, 247, 242, 0.55)';
      ctx.lineWidth = 4;
      ctx.setLineDash([10, 8]);
      ctx.beginPath();
      ctx.moveTo(lx - 80, y);
      ctx.lineTo(lx + 80, y);
      ctx.stroke();
      ctx.setLineDash([]);
      drawIcon(ctx, 'arrow', lx + 92, y, 22);
      ctx.save();
      ctx.translate(lx - 92, y);
      ctx.scale(-1, 1);
      drawIcon(ctx, 'arrow', 0, 0, 22);
      ctx.restore();
      drawIcon(ctx, 'hand', lx + Math.sin(t * 3.2) * 70, y + 14, 46);
      bubble(DESIGN_W / 2, PLAYER_Y - 150);
    } else {
      // 目标光环 + 弹跳箭头 + 气泡
      const ax = tip.anchorX;
      const ay = tip.anchorY;
      const pulse = 1 + 0.12 * Math.sin(t * 7);
      ctx.strokeStyle = PALETTE.yellow;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.arc(ax, ay, 44 * pulse, 0, Math.PI * 2);
      ctx.stroke();
      const above = tip.id !== 'ult';
      const bob = Math.abs(Math.sin(t * 5)) * 8;
      const arrowY = above ? ay - 60 - bob : ay - 64 - bob;
      ctx.save();
      ctx.translate(ax, arrowY);
      ctx.rotate(Math.PI / 2);
      drawIcon(ctx, 'arrow', 0, 0, 30);
      ctx.restore();
      bubble(ax, arrowY - 36);
    }
    ctx.restore();
  }

  /** 贴纸风小标签：深墨硬投影 + 粗描边 */
  private drawSticker(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    text: string,
    bg: string,
    fg: string,
    size: number
  ): void {
    ctx.font = `900 ${size}px sans-serif`;
    const w = measureRichText(ctx, text) + 16;
    const h = size + 10;
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.roundRect(x - w / 2 + 3, y - h / 2 + 3, w, h, 6);
    ctx.fill();
    ctx.fillStyle = bg;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.roundRect(x - w / 2, y - h / 2, w, h, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawRichText(ctx, text, x, y + 0.5);
  }

  /** 周二至周五 Boss：纯 Canvas 矢量绘制（粗描边 + 45° 贴纸硬投影） */
  private drawVectorBoss(ctx: CanvasRenderingContext2D, boss: BossRuntime, t: number): void {
    const flash = boss.flashTimer > 0;
    const ink = PALETTE.ink;
    const fill = (c: string) => (flash ? PALETTE.paper : c);
    const shape = (draw: () => void, color: string) => {
      ctx.save();
      ctx.translate(4, 4);
      ctx.fillStyle = ink;
      ctx.beginPath();
      draw();
      ctx.fill();
      ctx.restore();
      ctx.fillStyle = fill(color);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      draw();
      ctx.fill();
      ctx.stroke();
    };
    const label = (text: string, x: number, y: number, size: number, color: string = ink) => {
      ctx.fillStyle = color;
      ctx.font = `900 ${size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(text, x, y);
    };

    if (boss.style === 'projector') {
      // 投影光锥
      ctx.save();
      ctx.globalAlpha = 0.16 + 0.06 * Math.sin(t * 8);
      ctx.fillStyle = PALETTE.paper;
      ctx.beginPath();
      ctx.moveTo(-14, 20);
      ctx.lineTo(14, 20);
      ctx.lineTo(70, 160);
      ctx.lineTo(-70, 160);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
      shape(() => ctx.roundRect(-58, -34, 116, 62, 12), PALETTE.purple);
      shape(() => ctx.roundRect(-46, -50, 92, 20, 6), PALETTE.paper);
      label('周 会', 0, -40, 12);
      shape(() => ctx.arc(0, 2, 22, 0, Math.PI * 2), PALETTE.ink);
      ctx.fillStyle = fill(PALETTE.mint);
      ctx.beginPath();
      ctx.arc(0, 2, 14, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.paper;
      ctx.beginPath();
      ctx.arc(-5, -3, 4, 0, Math.PI * 2);
      ctx.fill();
      for (const side of [-1, 1]) {
        ctx.fillStyle = Math.floor(t * 6 + side) % 2 === 0 ? PALETTE.red : PALETTE.yellow;
        ctx.beginPath();
        ctx.arc(side * 42, -12, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      }
      return;
    }

    if (boss.style === 'hydra') {
      const heads = [
        { x: -46, y: -16, tag: '大气点' },
        { x: 0, y: -34, tag: '五彩黑' },
        { x: 46, y: -16, tag: '改回V1' }
      ];
      shape(() => ctx.ellipse(0, 26, 54, 30, 0, 0, Math.PI * 2), PALETTE.purple);
      for (let i = 0; i < heads.length; i++) {
        const h = heads[i];
        const sway = Math.sin(t * 3 + i * 1.7) * 6;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 12;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(h.x * 0.4, 18);
        ctx.quadraticCurveTo(h.x * 0.9, 0, h.x + sway, h.y);
        ctx.stroke();
        ctx.strokeStyle = fill(PALETTE.purple);
        ctx.lineWidth = 7;
        ctx.stroke();
        shape(() => ctx.arc(h.x + sway, h.y, 20, 0, Math.PI * 2), i === 1 ? PALETTE.red : PALETTE.purple);
        ctx.fillStyle = PALETTE.yellow;
        ctx.beginPath();
        ctx.arc(h.x + sway - 7, h.y - 4, 4, 0, Math.PI * 2);
        ctx.arc(h.x + sway + 7, h.y - 4, 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(h.x + sway, h.y + 5, 7, 0.15 * Math.PI, 0.85 * Math.PI);
        ctx.stroke();
        this.drawSticker(ctx, h.x + sway, h.y - 30, h.tag, PALETTE.paper, ink, 9);
      }
      return;
    }

    if (boss.style === 'server') {
      // 机柜顶部报错火焰
      for (let i = -2; i <= 2; i++) {
        const fh = 18 + Math.sin(t * 12 + i * 2) * 7;
        ctx.fillStyle = i % 2 === 0 ? PALETTE.red : PALETTE.yellow;
        ctx.strokeStyle = ink;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(i * 18 - 10, -46);
        ctx.quadraticCurveTo(i * 18, -46 - fh * 2, i * 18 + 10, -46);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      }
      shape(() => ctx.roundRect(-48, -48, 96, 100, 8), '#2B3150');
      for (let r = 0; r < 4; r++) {
        ctx.fillStyle = PALETTE.ink;
        ctx.fillRect(-38, -36 + r * 22, 76, 14);
        for (let k = 0; k < 4; k++) {
          const on = Math.floor(t * 9 + r * 3 + k * 5) % 3 !== 0;
          ctx.fillStyle = on ? (r === 1 ? PALETTE.red : PALETTE.mint) : '#3B425E';
          ctx.fillRect(-34 + k * 9, -32 + r * 22, 5, 6);
        }
      }
      this.drawSticker(ctx, 14, -10, '502', PALETTE.red, PALETTE.paper, 14);
      this.drawSticker(ctx, -8, 34, 'OOM', PALETTE.yellow, ink, 11);
      return;
    }

    // kpi 巨兽：西装身躯 + 胸口柱状图 + OKR 核心
    shape(() => {
      ctx.moveTo(-60, 50);
      ctx.lineTo(-44, -26);
      ctx.lineTo(44, -26);
      ctx.lineTo(60, 50);
      ctx.closePath();
    }, '#2B3150');
    shape(() => ctx.arc(0, -42, 22, 0, Math.PI * 2), PALETTE.yellow);
    ctx.fillStyle = ink;
    ctx.fillRect(-10, -48, 6, 6);
    ctx.fillRect(4, -48, 6, 6);
    ctx.fillRect(-8, -36, 16, 3);
    shape(() => {
      ctx.moveTo(-6, -22);
      ctx.lineTo(6, -22);
      ctx.lineTo(3, 6);
      ctx.lineTo(0, 12);
      ctx.lineTo(-3, 6);
      ctx.closePath();
    }, PALETTE.red);
    const bars = [16, 26, 36];
    for (let i = 0; i < bars.length; i++) {
      const bh = bars[i] + Math.sin(t * 5 + i) * 3;
      ctx.fillStyle = fill(PALETTE.yellow);
      ctx.strokeStyle = ink;
      ctx.lineWidth = 2;
      ctx.fillRect(14 + i * 11, 40 - bh, 8, bh);
      ctx.strokeRect(14 + i * 11, 40 - bh, 8, bh);
    }
    shape(() => ctx.arc(-24, 16, 15, 0, Math.PI * 2), boss.enraged ? PALETTE.red : PALETTE.mint);
    label('OKR', -24, 12, 8);
    label('100%', -24, 21, 8);
    for (const side of [-1, 1]) {
      const swing = Math.sin(t * 4 + side) * 0.3;
      ctx.save();
      ctx.translate(side * 50, -14);
      ctx.rotate(side * (0.5 + swing));
      shape(() => ctx.roundRect(-8, 0, 16, 44, 6), '#2B3150');
      ctx.restore();
    }
  }

  /** Boss 弹幕贴图缓存：本体 + 外发光，按造型和颜色预渲染一次 */
  private readonly shotCache = new Map<string, { body: HTMLCanvasElement; glow: HTMLCanvasElement }>();

  private getBossShot(kind: BossShotKind, color: string): { body: HTMLCanvasElement; glow: HTMLCanvasElement } {
    const key = kind + '|' + color;
    const hit = this.shotCache.get(key);
    if (hit) return hit;
    const S = 64;
    const mk = () => {
      const c = document.createElement('canvas');
      c.width = c.height = S;
      return c;
    };
    const glow = mk();
    const gg = glow.getContext('2d')!;
    const grad = gg.createRadialGradient(32, 32, 2, 32, 32, 32);
    grad.addColorStop(0, color);
    grad.addColorStop(0.35, color + 'AA');
    grad.addColorStop(1, color + '00');
    gg.fillStyle = grad;
    gg.fillRect(0, 0, S, S);

    const body = mk();
    const g = body.getContext('2d')!;
    g.lineJoin = 'round';
    g.lineCap = 'round';
    const ink = PALETTE.ink;
    if (kind === 'bellwave') {
      // 三道向前凸的声波弧：一排排开时连成一面「声浪墙」
      for (const [r, w] of [[12, 4], [20, 5], [28, 4]] as const) {
        g.strokeStyle = ink;
        g.lineWidth = w + 4;
        g.beginPath();
        g.arc(32, 6, r, Math.PI * 0.12, Math.PI * 0.88);
        g.stroke();
        g.strokeStyle = color;
        g.lineWidth = w;
        g.stroke();
      }
    } else if (kind === 'slide') {
      // 一页 PPT：紫色标题栏 + 文字行 + 小柱状图
      g.fillStyle = '#E9FDFF';
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.beginPath();
      g.roundRect(10, 15, 44, 34, 4);
      g.fill();
      g.stroke();
      g.fillStyle = PALETTE.purple;
      g.fillRect(11.5, 16.5, 41, 7);
      g.fillStyle = '#9AA0B8';
      g.fillRect(15, 28, 18, 3);
      g.fillRect(15, 34, 14, 3);
      g.fillStyle = color;
      g.fillRect(38, 36, 4, 9);
      g.fillRect(44, 31, 4, 14);
      g.strokeStyle = ink;
      g.lineWidth = 1.5;
      g.strokeRect(38, 36, 4, 9);
      g.strokeRect(44, 31, 4, 14);
    } else if (kind === 'note') {
      // 便利贴：折角 + 潦草红字
      g.fillStyle = color;
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(14, 14);
      g.lineTo(50, 14);
      g.lineTo(50, 40);
      g.lineTo(40, 50);
      g.lineTo(14, 50);
      g.closePath();
      g.fill();
      g.stroke();
      g.fillStyle = 'rgba(15,17,26,0.25)';
      g.beginPath();
      g.moveTo(50, 40);
      g.lineTo(40, 40);
      g.lineTo(40, 50);
      g.closePath();
      g.fill();
      g.strokeStyle = PALETTE.red;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(19, 24);
      g.quadraticCurveTo(26, 19, 33, 25);
      g.quadraticCurveTo(39, 30, 45, 23);
      g.moveTo(19, 34);
      g.lineTo(36, 34);
      g.stroke();
    } else if (kind === 'fireball') {
      // 火尾在后（本地 -y），火球在前
      g.fillStyle = '#FF3366';
      g.strokeStyle = ink;
      g.lineWidth = 2.5;
      g.beginPath();
      g.moveTo(20, 30);
      g.quadraticCurveTo(24, 10, 32, 2);
      g.quadraticCurveTo(40, 10, 44, 30);
      g.closePath();
      g.fill();
      g.stroke();
      const fg = g.createRadialGradient(30, 36, 2, 32, 38, 16);
      fg.addColorStop(0, '#FFF7B0');
      fg.addColorStop(0.45, PALETTE.yellow);
      fg.addColorStop(1, color);
      g.fillStyle = fg;
      g.beginPath();
      g.arc(32, 38, 15, 0, Math.PI * 2);
      g.fill();
      g.stroke();
    } else {
      // KPI 金币
      g.fillStyle = color;
      g.strokeStyle = ink;
      g.lineWidth = 3;
      g.beginPath();
      g.arc(32, 32, 20, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.strokeStyle = '#B9821A';
      g.lineWidth = 2;
      g.beginPath();
      g.arc(32, 32, 14, 0, Math.PI * 2);
      g.stroke();
      g.fillStyle = ink;
      g.font = '900 15px sans-serif';
      g.textAlign = 'center';
      g.textBaseline = 'middle';
      g.fillText('K', 32, 33);
      g.fillStyle = 'rgba(255,255,255,0.55)';
      g.beginPath();
      g.ellipse(25, 24, 5, 3, -0.6, 0, Math.PI * 2);
      g.fill();
    }
    const out = { body, glow };
    this.shotCache.set(key, out);
    return out;
  }

  /** 墨渍贴图缓存：每种颜色 3 种形状，预渲染一次后直接贴图 */
  private readonly splatCache = new Map<string, HTMLCanvasElement[]>();

  private getSplats(color: string): HTMLCanvasElement[] {
    let list = this.splatCache.get(color);
    if (list) return list;
    list = [];
    for (let v = 0; v < 3; v++) {
      const c = document.createElement('canvas');
      c.width = c.height = 96;
      const g = c.getContext('2d')!;
      let seed = 17 + v * 31 + color.length * 7;
      const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
      g.fillStyle = color;
      g.beginPath();
      // 不规则主斑块
      for (let k = 0; k <= 14; k++) {
        const a = (k / 14) * Math.PI * 2;
        const r = 26 + rnd() * 12;
        const x = 48 + Math.cos(a) * r;
        const y = 48 + Math.sin(a) * r * 0.62;
        if (k === 0) g.moveTo(x, y);
        else g.lineTo(x, y);
      }
      g.closePath();
      g.fill();
      // 溅射小点
      for (let k = 0; k < 7; k++) {
        const a = rnd() * Math.PI * 2;
        const d = 34 + rnd() * 12;
        g.beginPath();
        g.arc(48 + Math.cos(a) * d, 48 + Math.sin(a) * d * 0.62, 2 + rnd() * 4, 0, Math.PI * 2);
        g.fill();
      }
      // 深色内芯，增加层次
      g.globalAlpha = 0.28;
      g.fillStyle = PALETTE.ink;
      g.beginPath();
      g.ellipse(48, 48, 14, 9, 0, 0, Math.PI * 2);
      g.fill();
      list.push(c);
    }
    this.splatCache.set(color, list);
    return list;
  }

  private drawDecals(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const decals = world.fx.decals;
    for (let i = 0; i < decals.length; i++) {
      const d = decals[i];
      if (d.life >= d.maxLife || d.y > TRACK_BOTTOM_Y + 30) continue;
      const fadeIn = Math.min(1, d.life / 0.08);
      const fadeOut = 1 - Math.max(0, (d.life - d.maxLife * 0.55) / (d.maxLife * 0.45));
      ctx.globalAlpha = 0.5 * fadeIn * fadeOut;
      const img = this.getSplats(d.color)[d.variant];
      const sz = d.size * depthScale(d.y) * (0.75 + 0.25 * fadeIn);
      ctx.translate(d.x, d.y);
      ctx.rotate(d.rot);
      ctx.drawImage(img, -sz, -sz * 0.62, sz * 2, sz * 1.24);
      ctx.rotate(-d.rot);
      ctx.translate(-d.x, -d.y);
    }
    ctx.globalAlpha = 1;
  }

  /** 死亡爆开：白闪放大消散 + 冲击波圈；以及 Boss 招式 / 登场 / 死亡的爆炸冲击波 */
  private drawDeathPops(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const blasts = world.fx.blasts;
    for (let i = 0; i < blasts.length; i++) {
      const b = blasts[i];
      const k = b.t / b.dur;
      const e = 1 - (1 - k) * (1 - k);
      const r = b.r * (0.25 + 0.9 * e);
      ctx.globalAlpha = (1 - k) * 0.55;
      ctx.fillStyle = b.color;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, r * 0.8, r * 0.55, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1 - k;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 9 * (1 - k) + 1;
      ctx.beginPath();
      ctx.ellipse(b.x, b.y, r, r * 0.62, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = PALETTE.paper;
      ctx.lineWidth = 5 * (1 - k) + 0.5;
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const pops = world.fx.pops;
    for (let i = 0; i < pops.length; i++) {
      const p = pops[i];
      const k = p.t / p.dur;
      const sp = this.getEnemySprite(p.configId);
      const s = depthScale(p.y) * (1 + k * (p.big ? 0.9 : 0.6));
      const w = sp.logicalW * s;
      const h = sp.logicalH * s;
      ctx.globalAlpha = 1 - k;
      ctx.drawImage(sp.flashCanvas, p.x - w / 2, p.y - h / 2, w, h);
      ctx.strokeStyle = p.big ? PALETTE.yellow : PALETTE.paper;
      ctx.lineWidth = (p.big ? 5 : 3) * (1 - k);
      ctx.beginPath();
      ctx.arc(p.x, p.y, (p.big ? 30 : 14) + k * (p.big ? 46 : 22), 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  /** 屏幕级冲击：速度线、白闪、尸潮警报、清屏 / 里程碑印章 */
  private drawImpactOverlay(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const fx = world.fx;
    const st = world.state;
    const t = st.elapsedSec;

    // 高连杀速度线：从屏幕两侧向内收束
    if (st.phase === 'PLAYING' && st.comboCount >= 25) {
      const k = Math.min(1, (st.comboCount - 25) / 50);
      ctx.strokeStyle = `rgba(255, 230, 0, ${(0.1 + 0.18 * k).toFixed(3)})`;
      ctx.lineWidth = 3;
      for (let i = 0; i < 14; i++) {
        const y = ((i * 97 + t * 900) % (DESIGN_H + 200)) - 100;
        const len = 40 + ((i * 53) % 60);
        const side = i % 2 === 0 ? 0 : DESIGN_W;
        const dir = i % 2 === 0 ? 1 : -1;
        ctx.beginPath();
        ctx.moveTo(side, y);
        ctx.lineTo(side + dir * (22 + 20 * k), y + len);
        ctx.stroke();
      }
    }

    if (fx.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${(fx.flash / 0.08) * 0.35})`;
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    }

    if (fx.surgeBanner > 0) {
      // 跑道顶端一条细窄的闪烁警报带 + 两侧泛红；不横在怪物进场的中段
      const k = fx.surgeBanner;
      const a = Math.min(1, k / 0.3);
      const blink = Math.floor(t * 10) % 2 === 0;
      ctx.save();
      ctx.globalAlpha = a;
      const g = ctx.createLinearGradient(0, 0, 40, 0);
      g.addColorStop(0, 'rgba(255, 51, 102, 0.45)');
      g.addColorStop(1, 'rgba(255, 51, 102, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(0, TRACK_TOP_Y, 40, TRACK_BOTTOM_Y - TRACK_TOP_Y);
      ctx.save();
      ctx.translate(DESIGN_W, 0);
      ctx.scale(-1, 1);
      ctx.fillRect(0, TRACK_TOP_Y, 40, TRACK_BOTTOM_Y - TRACK_TOP_Y);
      ctx.restore();
      ctx.fillStyle = blink ? PALETTE.red : '#C2143F';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.roundRect(DESIGN_W * 0.5 - 120, TRACK_TOP_Y + 2, 240, 26, 8);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = PALETTE.yellow;
      ctx.font = '900 14px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawRichText(ctx, '{i:warning} 未读 99+ 尸潮来袭!', DESIGN_W * 0.5, TRACK_TOP_Y + 15.5);
      ctx.restore();
    }

    const sf = fx.stampFx;
    if (sf) {
      const p = sf.t / sf.dur;
      const scale = p < 0.12 ? 2 - (p / 0.12) * 1.0 : 1;
      const alpha = p > 0.75 ? (1 - p) / 0.25 : 1;
      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(DESIGN_W * 0.5, PLAYER_Y + world.squad.footprintTopDy - 78);
      ctx.rotate(-0.08);
      ctx.scale(scale, scale);
      ctx.font = '900 34px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 9;
      ctx.strokeText(sf.text, 3, 3);
      ctx.strokeText(sf.text, 0, 0);
      ctx.fillStyle = sf.color;
      ctx.fillText(sf.text, 0, 0);
      ctx.restore();
    }
  }

  private getEnemySprite(id: Enemy['configId']): CachedSprite {
    switch (id) {
      case 'cc_all':
        return this.sprites.get('enemyMailImp');
      case 'client_tweak':
      case 'client_mini':
        return this.sprites.get('enemyClientMonster');
      case 'ppt_pie':
        return this.sprites.get('enemyPptGolem');
      case 'ddl_flame':
        return this.sprites.get('enemyDdlFlame');
      case 'unread_dot':
        return this.sprites.get('enemyUnread');
      default:
        return this.sprites.get('enemyZombie');
    }
  }

  private drawLayer4Squad(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const units = world.squad.renderUnits;
    const t = world.state.elapsedSec;

    ctx.save();
    if (world.state.invulnTimer > 0 && Math.floor(t * 20) % 2 === 0) {
      ctx.globalAlpha = 0.55;
    }

    for (let i = units.length - 1; i >= 0; i--) {
      const u = units[i];
      const y = PLAYER_Y + u.dy;
      const sx = projectX(world.squad.leaderLaneX + u.dx, y);
      const sp =
        u.tier === 10
          ? this.sprites.get('heroMech')
          : u.tier === 5
            ? this.sprites.get('heroStriker')
            : this.sprites.get('heroSlacker');

      const s = depthScale(y);
      const runWave = Math.sin(t * 14 + u.phase);
      const bob = -Math.abs(runWave) * 3.2;
      const tilt = runWave * 0.065;
      const w = sp.logicalW * s;
      const h = sp.logicalH * s;

      ctx.save();
      ctx.translate(sx, y + bob);
      ctx.rotate(tilt);
      ctx.drawImage(sp.canvas, -w * 0.5, -h * 0.5, w, h);
      ctx.restore();
    }

    ctx.restore();

    const lx = projectX(world.squad.leaderLaneX, PLAYER_Y);
    if (world.state.activeWeapon === 'ai_pod') {
      for (const side of [-1, 1]) {
        const px = projectX(world.squad.leaderLaneX + side * 36, PLAYER_Y);
        const py = PLAYER_Y - 30 + Math.sin(t * 6 + side) * 3;
        ctx.fillStyle = PALETTE.ink;
        ctx.beginPath();
        ctx.roundRect(px - 9 + 2, py - 7 + 2, 18, 14, 4);
        ctx.fill();
        ctx.fillStyle = PALETTE.purple;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(px - 9, py - 7, 18, 14, 4);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = PALETTE.mint;
        ctx.fillRect(px - 4, py - 2, 8, 3);
      }
    }
    if (world.state.shieldCount > 0) {
      ctx.strokeStyle = PALETTE.mint;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(lx, PLAYER_Y - 2, 30, 0, Math.PI * 2);
      ctx.stroke();
    }

    if (world.state.ultActiveTimer > 0) {
      ctx.strokeStyle = PALETTE.yellow;
      ctx.lineWidth = 3.5;
      ctx.beginPath();
      ctx.arc(lx, PLAYER_Y - 2, 36 + Math.sin(t * 18) * 3, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private drawLayer5Projectiles(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    // 枪口焰闪烁
    if (world.state.muzzleFlashTimer > 0 && world.state.phase === 'PLAYING') {
      const lx = projectX(world.squad.leaderLaneX, PLAYER_Y);
      const flashScale = world.state.muzzleFlashTimer / 0.07;
      ctx.save();
      ctx.globalAlpha = flashScale * 0.85;
      ctx.fillStyle = PALETTE.yellow;
      ctx.beginPath();
      ctx.ellipse(lx, PLAYER_Y - 28, 16 * flashScale, 8 * flashScale, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = PALETTE.paper;
      ctx.beginPath();
      ctx.arc(lx, PLAYER_Y - 28, 6 * flashScale, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    const bullets = world.combat.bullets.activeItems;
    for (let i = 0; i < bullets.length; i++) {
      const b = bullets[i];
      if (!b.active) continue;
      const s = depthScale(b.y);
      const sx = projectX(b.laneX, b.y);

      if (b.kind === 'beam') {
        ctx.strokeStyle = b.synergyPowered ? PALETTE.mint : PALETTE.coffee;
        ctx.lineWidth = b.radius * (b.synergyPowered ? 2.8 : 2.4) * s;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(sx, b.y);
        ctx.lineTo(sx, b.y + 22 * s);
        ctx.stroke();

        ctx.strokeStyle = b.isCrit ? PALETTE.yellow : PALETTE.paper;
        ctx.lineWidth = b.radius * 1.0 * s;
        ctx.beginPath();
        ctx.moveTo(sx, b.y);
        ctx.lineTo(sx, b.y + 20 * s);
        ctx.stroke();
      } else if (b.kind === 'keycap') {
        const size = 15 * s;
        ctx.save();
        ctx.translate(sx, b.y);
        ctx.rotate(b.rot);
        ctx.fillStyle = b.isCrit || b.synergyPowered ? PALETTE.yellow : PALETTE.paper;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.roundRect(-size * 0.5, -size * 0.5, size, size, 3.5);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = PALETTE.ink;
        ctx.font = `900 ${Math.round(6.5 * s)}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(b.keyLabel, 0, 0.5);
        ctx.restore();
      } else if (b.kind === 'wave') {
        // 降噪耳机声波环（绝对零度静音区叠加冰晶双环）
        const r = b.radius * s;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 5;
        ctx.beginPath();
        ctx.arc(sx, b.y + r * 0.6, r, Math.PI * 1.15, Math.PI * 1.85);
        ctx.stroke();
        ctx.strokeStyle = b.isCrit ? PALETTE.yellow : PALETTE.mint;
        ctx.lineWidth = 3;
        ctx.stroke();
        if (b.synergyPowered) {
          ctx.strokeStyle = PALETTE.paper;
          ctx.lineWidth = 1.6;
          ctx.beginPath();
          ctx.arc(sx, b.y + r * 0.6, r * 0.78, Math.PI * 1.18, Math.PI * 1.82);
          ctx.stroke();
        }
      } else if (b.kind === 'drone') {
        // 外卖无人机：黄色小包裹 + 旋翼
        ctx.save();
        ctx.translate(sx, b.y);
        ctx.rotate(b.rot);
        const size = 11 * s;
        ctx.fillStyle = b.isCrit ? PALETTE.red : PALETTE.yellow;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 2;
        ctx.fillRect(-size / 2, -size / 2, size, size);
        ctx.strokeRect(-size / 2, -size / 2, size, size);
        ctx.strokeStyle = PALETTE.paper;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(-size, -size * 0.75);
        ctx.lineTo(size, -size * 0.75);
        ctx.stroke();
        ctx.restore();
      } else if (b.kind === 'pod') {
        ctx.fillStyle = b.isCrit ? PALETTE.yellow : PALETTE.purple;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(sx, b.y, 4.5 * s, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
      } else {
        // 带速度拖尾的订书针/分裂弹
        ctx.strokeStyle = 'rgba(255, 230, 0, 0.35)';
        ctx.lineWidth = 3 * s;
        ctx.beginPath();
        ctx.moveTo(sx, b.y);
        ctx.lineTo(sx - b.vx * 0.025, b.y + 18 * s);
        ctx.stroke();

        ctx.fillStyle = b.color;
        ctx.strokeStyle = PALETTE.ink;
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.roundRect(sx - 3 * s, b.y - 7 * s, 6 * s, 14 * s, 2);
        ctx.fill();
        ctx.stroke();
      }
    }

    const bProjs = world.bosses.projectiles.activeItems;
    for (let i = 0; i < bProjs.length; i++) {
      const p = bProjs[i];
      if (!p.active) continue;
      const s = depthScale(p.y);
      const sx = projectX(p.laneX, p.y);
      const size = p.radius * (p.kind === 'bellwave' ? 3.6 : p.kind === 'fireball' ? 3.3 : 2.7) * s;
      const sp = this.getBossShot(p.kind, p.color);
      // 拖尾残影
      for (let k = 3; k >= 1; k--) {
        const gx = projectX(p.laneX - p.vx * 0.03 * k, p.y - p.vy * 0.03 * k);
        const gy = p.y - p.vy * 0.03 * k;
        const gs = size * (1.5 - k * 0.18);
        ctx.globalAlpha = 0.32 / k;
        ctx.drawImage(sp.glow, gx - gs / 2, gy - gs / 2, gs, gs);
      }
      // 外发光（呼吸）
      const breathe = 1 + 0.12 * Math.sin(p.age * 14 + i);
      const gsz = size * 1.9 * breathe;
      ctx.globalAlpha = 0.85;
      ctx.drawImage(sp.glow, sx - gsz / 2, p.y - gsz / 2, gsz, gsz);
      ctx.globalAlpha = 1;
      // 本体：铃声波 / 火球朝飞行方向；便利贴 / 幻灯片自转；金币翻转
      const heading = Math.atan2(p.vy, p.vx) - Math.PI / 2;
      ctx.save();
      ctx.translate(sx, p.y);
      if (p.kind === 'bellwave' || p.kind === 'fireball') ctx.rotate(heading);
      else if (p.kind !== 'coin') ctx.rotate(p.rot);
      const flip = p.kind === 'coin' ? Math.max(0.18, Math.abs(Math.cos(p.rot))) : 1;
      if (flip !== 1) ctx.scale(flip, 1);
      ctx.drawImage(sp.body, -size / 2, -size / 2, size, size);
      ctx.restore();
    }
  }

  private drawLayer6FxAndText(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    // 高压电弧连锁
    const arcs = world.combat.arcs;
    if (arcs.length > 0) {
      ctx.save();
      ctx.lineJoin = 'round';
      for (const a of arcs) {
        const mx = (a.x1 + a.x2) / 2 + (Math.random() - 0.5) * 18;
        const my = (a.y1 + a.y2) / 2 + (Math.random() - 0.5) * 18;
        ctx.globalAlpha = Math.min(1, a.life / 0.08);
        const paletteArc = a.superconduct
          ? ([
              [PALETTE.ink, 6],
              [PALETTE.mint, 3.8],
              [PALETTE.yellow, 1.5]
            ] as const)
          : ([
              [PALETTE.ink, 5],
              [PALETTE.purple, 3],
              [PALETTE.paper, 1.2]
            ] as const);
        for (const [color, w] of paletteArc) {
          ctx.strokeStyle = color;
          ctx.lineWidth = w;
          ctx.beginPath();
          ctx.moveTo(a.x1, a.y1);
          ctx.lineTo(mx, my);
          ctx.lineTo(a.x2, a.y2);
          ctx.stroke();
        }
      }
      ctx.restore();
    }

    // 粒子：逐个手动逆变换还原，避免每粒子 save/restore 的开销（大批割草时粒子很多）
    const particles = world.particles.activeItems;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 1.6;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p.active) continue;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.globalAlpha = alpha;
      ctx.fillStyle = p.color;
      const s = p.size * (0.4 + 0.7 * alpha);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      if (p.shape === 'star') {
        ctx.beginPath();
        for (let k = 0; k < 4; k++) {
          const ang = (k * Math.PI) / 2;
          ctx.lineTo(Math.cos(ang) * s, Math.sin(ang) * s);
          ctx.lineTo(Math.cos(ang + Math.PI / 4) * s * 0.4, Math.sin(ang + Math.PI / 4) * s * 0.4);
        }
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
      } else {
        ctx.fillRect(-s * 0.5, -s * 0.5, s, s);
        ctx.strokeRect(-s * 0.5, -s * 0.5, s, s);
      }
      ctx.rotate(-p.rot);
      ctx.translate(-p.x, -p.y);
    }
    ctx.globalAlpha = 1;

    const texts = world.floatingTexts.activeItems;
    for (let i = 0; i < texts.length; i++) {
      const f = texts[i];
      if (!f.active) continue;
      const alpha = Math.max(0, 1 - f.life / f.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(f.x, f.y);
      ctx.scale(f.scalePop, f.scalePop);
      ctx.font = `900 ${f.size}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4;
      ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color;
      ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  private drawLayer7Overlay(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const state = world.state;

    // 领队头顶精确人数荧光黄胶囊牌
    if (state.phase === 'PLAYING' || state.phase === 'PAUSED') {
      const lx = projectX(world.squad.leaderLaneX, PLAYER_Y);
      // 人数牌放在小队头顶，而不是压在人群中间
      const badgeY = Math.max(PLAYER_Y - 120, PLAYER_Y + world.squad.footprintTopDy - 22);
      const label = `${state.squadCount}`;
      const badgeW = Math.max(42, 20 + label.length * 11);

      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.roundRect(lx - badgeW * 0.5 + 2.5, badgeY - 13 + 2.5, badgeW, 26, 13);
      ctx.fill();

      ctx.fillStyle = PALETTE.yellow;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2.6;
      ctx.beginPath();
      ctx.roundRect(lx - badgeW * 0.5, badgeY - 13, badgeW, 26, 13);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = PALETTE.ink;
      ctx.font = '900 15px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label, lx, badgeY + 0.5);

      if (world.quips.squadBubble) {
        this.drawSquadQuipBubble(ctx, world, world.quips.squadBubble, lx, badgeY);
      }
    }

    // 底部状态带（小队脚下）：高压过载计时 / 连杀；拾取横幅出现时让位
    const statusY = 742;
    const bannerOn = !!state.banner;
    if (state.phase === 'PLAYING' && state.overloadEnemyTimer > 0 && !bannerOn) {
      this.drawSticker(
        ctx,
        100,
        statusY,
        `{i:bolt} 高压过载 · 怪物狂飙 ${state.overloadEnemyTimer.toFixed(1)}s`,
        PALETTE.purple,
        PALETTE.yellow,
        11
      );
    }

    // 实时连杀贴纸徽章（放在顶部工作群通知与 Boss 血条下方，避免遮挡）
    if (state.phase === 'PLAYING' && state.comboCount >= 5 && !bannerOn) {
      const pop = 1 + Math.min(0.15, (state.comboTimer / 2.4) * 0.12);
      ctx.save();
      ctx.translate(DESIGN_W - 62, statusY);
      ctx.rotate(0.06);
      ctx.scale(pop, pop);

      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.roundRect(-48 + 3, -15 + 3, 96, 30, 8);
      ctx.fill();

      ctx.fillStyle = state.comboCount >= 30 ? PALETTE.red : PALETTE.yellow;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.roundRect(-48, -15, 96, 30, 8);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = state.comboCount >= 30 ? PALETTE.paper : PALETTE.ink;
      ctx.font = '900 13px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawRichText(ctx, `{i:flame} ${state.comboCount} 连杀!`, 0, 0.5);
      ctx.restore();
    }

    // 顶部 Boss 血条
    const boss = world.bosses.boss;
    if (boss.active) {
      const bw = 278;
      const bx = (DESIGN_W - bw) * 0.5;
      // 放在工作群消息通知下方，避免通知卡片遮住 Boss 血条
      const by = 156;

      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.roundRect(bx - 3, by - 3, bw + 6, 22, 8);
      ctx.fill();

      ctx.fillStyle = '#33202E';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 16, 6);
      ctx.fill();

      ctx.fillStyle = boss.shieldTimer > 0 ? PALETTE.mint : boss.enraged ? PALETTE.yellow : PALETTE.red;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 16, 6);
      ctx.fill();

      ctx.fillStyle = PALETTE.paper;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 3;
      ctx.font = '900 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hpText = `${boss.name}  ${Math.round((boss.hp / boss.maxHp) * 100)}%${boss.enraged ? ' · 红温' : ''}`;
      ctx.strokeText(hpText, DESIGN_W * 0.5, by + 8);
      ctx.fillText(hpText, DESIGN_W * 0.5, by + 8);

      if ((state.phase === 'PLAYING' || state.phase === 'PAUSED') && world.quips.bossBubble) {
        this.drawBossQuipBubble(ctx, world, world.quips.bossBubble);
      }
    }

    // Boss 登场警报条
    if (state.bossBannerTimer > 0) {
      ctx.save();
      ctx.translate(DESIGN_W * 0.5, 392);
      ctx.rotate(-0.04);
      ctx.fillStyle = PALETTE.red;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4;
      ctx.fillRect(-170, -24, 340, 48);
      ctx.strokeRect(-170, -24, 340, 48);

      ctx.fillStyle = PALETTE.yellow;
      ctx.font = '900 18px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      drawRichText(ctx, world.bossBannerText, 0, 0);
      ctx.restore();
    }

    // 拿到武器 / 词条：居中贴纸横幅，取代容易被弹幕淹没的小飘字
    if (state.banner) {
      const bn = state.banner;
      const age = 1.9 - bn.timer;
      const inT = Math.min(1, age / 0.18);
      const outA = bn.timer < 0.3 ? bn.timer / 0.3 : 1;
      const scale = 0.6 + 0.4 * (1 - Math.pow(1 - inT, 3)) + (inT < 1 ? 0 : 0);
      ctx.save();
      ctx.globalAlpha = outA;
      ctx.translate(DESIGN_W * 0.5, 734);
      ctx.rotate(-0.02);
      ctx.scale(scale, scale);
      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.roundRect(-150 + 5, -34 + 5, 300, 68, 12);
      ctx.fill();
      ctx.fillStyle = PALETTE.paper;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.roundRect(-150, -34, 300, 68, 12);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = bn.color;
      ctx.fillRect(-150, -34, 12, 68);
      ctx.strokeRect(-150, -34, 12, 68);
      ctx.fillStyle = PALETTE.ink;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = '900 19px sans-serif';
      drawRichText(ctx, bn.title, 6, -11, { maxWidth: 270 });
      ctx.fillStyle = '#4A4F66';
      ctx.font = '800 12px sans-serif';
      ctx.fillText(bn.sub, 6, 15, 270);
      ctx.restore();
    }

    // 受击红色暗角
    if (state.hurtFlashTimer > 0) {
      const a = (state.hurtFlashTimer / 0.25) * 0.35;
      const g = ctx.createRadialGradient(DESIGN_W / 2, DESIGN_H / 2, DESIGN_H * 0.28, DESIGN_W / 2, DESIGN_H / 2, DESIGN_H * 0.62);
      g.addColorStop(0, 'rgba(255, 51, 102, 0)');
      g.addColorStop(1, `rgba(255, 51, 102, ${a.toFixed(3)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, DESIGN_W, DESIGN_H);
    }

    // 大招拍下印章特效
    if (state.ultStampTimer > 0) {
      const progress = 1 - state.ultStampTimer / 0.95;
      const stampScale = progress < 0.15 ? 1.8 - progress * 5.2 : 1.02;
      const alpha = progress > 0.7 ? (1 - progress) / 0.3 : 1;

      ctx.save();
      ctx.globalAlpha = Math.max(0, alpha);
      ctx.translate(DESIGN_W * 0.5, 380);
      ctx.rotate(-0.12);
      ctx.scale(stampScale, stampScale);

      ctx.fillStyle = PALETTE.yellow;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 5;
      ctx.beginPath();
      ctx.roundRect(-145, -42, 290, 84, 12);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = PALETTE.ink;
      ctx.font = '900 22px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('18:00 准点下班', 0, -11);

      ctx.fillStyle = PALETTE.red;
      ctx.font = '900 16px sans-serif';
      ctx.fillText('已 读 不 回 · 全 屏 清 空', 0, 17);
      ctx.restore();
    }
  }

  /** 将中文短句按宽度平衡折行（最多 2 行），确保漫画气泡比例匀称 */
  private wrapComicLines(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
    if (ctx.measureText(text).width <= maxW || text.length <= 6) {
      return [text];
    }

    const mid = Math.floor(text.length * 0.5);
    const minIdx = Math.max(3, Math.floor(text.length * 0.28));
    const maxIdx = Math.min(text.length - 3, Math.ceil(text.length * 0.72));
    let bestIdx = -1;
    let bestDist = Infinity;

    for (let i = minIdx; i <= maxIdx; i++) {
      const ch = text[i];
      if (ch === '！' || ch === '？' || ch === '，' || ch === '：' || ch === '…' || ch === '—' || ch === ' ') {
        const splitPos = ch === ' ' ? i : i + 1;
        const d = Math.abs(splitPos - mid);
        if (d < bestDist) {
          const left = text.slice(0, splitPos).trim();
          const right = text.slice(splitPos).trim();
          if (left && right && ctx.measureText(left).width <= maxW && ctx.measureText(right).width <= maxW) {
            bestDist = d;
            bestIdx = splitPos;
          }
        }
      }
    }

    if (bestIdx > 0) {
      return [text.slice(0, bestIdx).trim(), text.slice(bestIdx).trim()];
    }

    let cut = Math.ceil(text.length * 0.52);
    while (cut > 3 && ctx.measureText(text.slice(0, cut)).width > maxW) {
      cut -= 1;
    }
    return [text.slice(0, cut), text.slice(cut)];
  }

  /** 小队头顶 Neo-Pop 漫画对话气泡（SQUAD 通道） */
  private drawSquadQuipBubble(
    ctx: CanvasRenderingContext2D,
    _world: GameWorld,
    quip: ActiveQuip,
    lx: number,
    badgeY: number
  ): void {
    const age = Math.max(0, quip.duration - quip.remaining);
    let popScale = 1;
    if (age < 0.1) {
      popScale = 0.62 + (age / 0.1) * 0.45;
    } else if (age < 0.16) {
      popScale = 1.07 - ((age - 0.1) / 0.06) * 0.07;
    }
    const alpha = quip.remaining < 0.25 ? Math.max(0, quip.remaining / 0.25) : 1;
    const shakeX = quip.tone === 'panic' && age < 0.24 ? Math.sin(age * 65) * 3.5 : 0;

    const accent =
      quip.tone === 'hype' ? PALETTE.yellow : quip.tone === 'panic' ? PALETTE.red : PALETTE.mint;
    const badgeIcon: IconName = quip.tone === 'hype' ? 'bolt' : quip.tone === 'panic' ? 'anger' : 'shades';

    ctx.save();
    ctx.font = '900 11.5px sans-serif';
    const lines = this.wrapComicLines(ctx, quip.text, 152);
    let maxLineW = 0;
    for (let i = 0; i < lines.length; i++) {
      maxLineW = Math.max(maxLineW, ctx.measureText(lines[i]).width);
    }

    const bw = Math.min(204, Math.max(92, Math.ceil(maxLineW) + 34));
    const bh = lines.length === 1 ? 30 : 44;
    const bx = clamp(lx, bw * 0.5 + 10, DESIGN_W - bw * 0.5 - 10) + shakeX;
    const by = badgeY - 24 - bh * 0.5;
    const hw = bw * 0.5;
    const hh = bh * 0.5;
    const relTailX = clamp(lx - bx, -hw + 18, hw - 18);

    ctx.globalAlpha = alpha;
    ctx.translate(bx, by);
    ctx.scale(popScale, popScale);

    // 粗墨投影
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.roundRect(-hw + 3, -hh + 3, bw, bh, 9);
    ctx.fill();

    // 米白泡体
    ctx.fillStyle = PALETTE.paper;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, bw, bh, 9);
    ctx.fill();

    // 左侧情绪色条
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, bw, bh, 9);
    ctx.clip();
    ctx.fillStyle = accent;
    ctx.fillRect(-hw, -hh, 6, bh);
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(-hw + 6, -hh, 1.5, bh);
    ctx.restore();

    // 泡体黑框
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.roundRect(-hw, -hh, bw, bh, 9);
    ctx.stroke();

    // 指向小队领队的下尖角（用米白盖住底边接缝，再描两侧黑线）
    ctx.fillStyle = PALETTE.paper;
    ctx.beginPath();
    ctx.moveTo(relTailX - 6, hh - 1.5);
    ctx.lineTo(relTailX, hh + 8.5);
    ctx.lineTo(relTailX + 6, hh - 1.5);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(relTailX - 6, hh);
    ctx.lineTo(relTailX, hh + 8.5);
    ctx.lineTo(relTailX + 6, hh);
    ctx.stroke();

    // 情绪角标与吐槽台词
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawIcon(ctx, badgeIcon, -hw + 16, 0.5, 15);

    ctx.fillStyle = PALETTE.ink;
    ctx.font = '900 11.5px sans-serif';
    if (lines.length === 1) {
      ctx.fillText(lines[0], 8, 0.5, bw - 30);
    } else {
      ctx.fillText(lines[0], 8, -7, bw - 30);
      ctx.fillText(lines[1], 8, 7.5, bw - 30);
    }

    ctx.restore();
  }

  /** Boss 脚下锯齿大反派喊话框（BOSS 通道） */
  private drawBossQuipBubble(
    ctx: CanvasRenderingContext2D,
    world: GameWorld,
    quip: ActiveQuip
  ): void {
    const boss = world.bosses.boss;
    if (!boss.active) return;

    const bossX = projectX(boss.laneX, boss.y);
    const age = Math.max(0, quip.duration - quip.remaining);
    let popScale = 1;
    if (age < 0.1) {
      popScale = 0.62 + (age / 0.1) * 0.46;
    } else if (age < 0.16) {
      popScale = 1.08 - ((age - 0.1) / 0.06) * 0.08;
    }
    const alpha = quip.remaining < 0.25 ? Math.max(0, quip.remaining / 0.25) : 1;
    const shakeX = age < 0.28 ? Math.sin(age * 70) * 3 : 0;

    ctx.save();
    ctx.font = '900 12px sans-serif';
    const lines = this.wrapComicLines(ctx, quip.text, 178);
    let maxLineW = 0;
    for (let i = 0; i < lines.length; i++) {
      maxLineW = Math.max(maxLineW, ctx.measureText(lines[i]).width);
    }

    const bw = Math.min(234, Math.max(114, Math.ceil(maxLineW) + 38));
    const bh = lines.length === 1 ? 32 : 46;
    const bx = clamp(bossX, bw * 0.5 + 12, DESIGN_W - bw * 0.5 - 12) + shakeX;
    const by = Math.min(PLAYER_Y - 165, Math.max(216, boss.y + boss.radius + 28));
    const hw = bw * 0.5;
    const hh = bh * 0.5;
    const relTailX = clamp(bossX - bx, -hw + 22, hw - 22);

    ctx.globalAlpha = alpha;
    ctx.translate(bx, by);
    ctx.scale(popScale, popScale);

    const traceShoutPoly = (ox: number, oy: number) => {
      ctx.beginPath();
      ctx.moveTo(-hw + ox, -hh + oy);
      ctx.lineTo(-hw * 0.5 + ox, -hh - 3.5 + oy);
      ctx.lineTo(0 + ox, -hh + oy);
      ctx.lineTo(hw * 0.5 + ox, -hh - 3.5 + oy);
      ctx.lineTo(hw + ox, -hh + oy);
      ctx.lineTo(hw + 4.5 + ox, -hh * 0.35 + oy);
      ctx.lineTo(hw + ox, 0 + oy);
      ctx.lineTo(hw + 4.5 + ox, hh * 0.4 + oy);
      ctx.lineTo(hw + ox, hh + oy);
      ctx.lineTo(hw * 0.48 + ox, hh + 3.5 + oy);
      ctx.lineTo(0 + ox, hh + oy);
      ctx.lineTo(-hw * 0.48 + ox, hh + 3.5 + oy);
      ctx.lineTo(-hw + ox, hh + oy);
      ctx.lineTo(-hw - 4.5 + ox, hh * 0.4 + oy);
      ctx.lineTo(-hw + ox, 0 + oy);
      ctx.lineTo(-hw - 4.5 + ox, -hh * 0.35 + oy);
      ctx.closePath();
    };

    // 偏移硬黑影
    traceShoutPoly(3, 3);
    ctx.fillStyle = PALETTE.ink;
    ctx.fill();

    // 暗红紫反派底框 + 双重描边
    traceShoutPoly(0, 0);
    ctx.fillStyle = '#24101C';
    ctx.fill();
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4.6;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.strokeStyle = PALETTE.red;
    ctx.lineWidth = 2.4;
    ctx.stroke();

    // 指向上方 Boss 的尖刺喊话尾（底座下探至 -hh + 4 覆盖锯齿顶边接缝，并带黑色外描边）
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4.6;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(relTailX - 7, -hh + 0.5);
    ctx.lineTo(relTailX, -hh - 12);
    ctx.lineTo(relTailX + 7, -hh + 0.5);
    ctx.stroke();

    ctx.fillStyle = '#24101C';
    ctx.beginPath();
    ctx.moveTo(relTailX - 7, -hh + 4);
    ctx.lineTo(relTailX, -hh - 12);
    ctx.lineTo(relTailX + 7, -hh + 4);
    ctx.closePath();
    ctx.fill();

    ctx.strokeStyle = PALETTE.red;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.moveTo(relTailX - 7, -hh + 1.5);
    ctx.lineTo(relTailX, -hh - 12);
    ctx.lineTo(relTailX + 7, -hh + 1.5);
    ctx.stroke();

    // 反派喇叭角标与醒目荧光黄台词
    const shoutIcon: IconName =
      quip.text.includes('免伤') || quip.text.includes('加班') || quip.text.includes('通宵') ? 'anger' : 'megaphone';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    drawIcon(ctx, shoutIcon, -hw + 16, 0.5, 16);

    ctx.fillStyle = PALETTE.yellow;
    ctx.font = '900 12px sans-serif';
    if (lines.length === 1) {
      ctx.fillText(lines[0], 9, 0.5, bw - 34);
    } else {
      ctx.fillText(lines[0], 9, -7.5, bw - 34);
      ctx.fillText(lines[1], 9, 8, bw - 34);
    }

    ctx.restore();
  }
}
