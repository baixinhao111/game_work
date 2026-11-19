import { PALETTE } from '../data/palette';
import {
  DESIGN_H,
  DESIGN_W,
  LANE_HALF_W,
  PLAYER_Y,
  TRACK_BOTTOM_Y,
  TRACK_TOP_Y,
  depthScale,
  projectX
} from '../engine/Viewport';
import type { GameWorld } from '../game/GameWorld';
import type { Enemy, Gate } from '../game/types';
import type { CachedSprite, SpriteCache } from './SpriteCache';

const CLOCK_MARKS = ['09:00', '11:00', '13:00', '15:00', '17:30', '18:00'];

export class Renderer {
  private readonly sortedEnemiesScratch: Enemy[] = [];
  private scrollOffset = 0;

  constructor(private readonly sprites: SpriteCache) {}

  render(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const state = world.state;
    if (state.phase === 'PLAYING') {
      this.scrollOffset = (this.scrollOffset + 2.4) % 90;
    }

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
    this.drawLayer4Squad(ctx, world);
    this.drawLayer5Projectiles(ctx, world);
    this.drawLayer6FxAndText(ctx, world);
    this.drawLayer7Overlay(ctx, world);

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

    ctx.strokeStyle = world.enemies.boss.active ? PALETTE.red : PALETTE.mint;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(topL - 2, TRACK_TOP_Y);
    ctx.lineTo(botL - 2, TRACK_BOTTOM_Y);
    ctx.moveTo(topR + 2, TRACK_TOP_Y);
    ctx.lineTo(botR + 2, TRACK_BOTTOM_Y);
    ctx.stroke();
  }

  private drawLayer1GroundHints(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    // 大招全屏荧光滤镜
    if (world.state.ultActiveTimer > 0) {
      ctx.fillStyle = 'rgba(0, 245, 212, 0.1)';
      ctx.fillRect(0, TRACK_TOP_Y, DESIGN_W, TRACK_BOTTOM_Y - TRACK_TOP_Y);
    }

    // Boss 警戒光带
    if (world.enemies.boss.active) {
      const pulse = 0.08 + 0.07 * Math.sin(world.state.elapsedSec * 8);
      ctx.fillStyle = `rgba(255, 51, 102, ${pulse.toFixed(3)})`;
      ctx.fillRect(28, 150, DESIGN_W - 56, 110);
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

    if (world.enemies.boss.active) {
      const b = world.enemies.boss;
      const bx = projectX(b.laneX, b.y);
      ctx.beginPath();
      ctx.ellipse(bx, b.y + 44, 52, 16, 0, 0, Math.PI * 2);
      ctx.fill();
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

      if (g.kind === 'MOVING') {
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

      if (g.kind === 'SUPPLY_CRATE') {
        this.drawCrateGate(ctx, g, sx, g.y, s, world.state.elapsedSec);
      } else {
        this.drawMathGate(ctx, g, sx, g.y, s);
      }

      ctx.restore();
    }
  }

  private drawCrateGate(
    ctx: CanvasRenderingContext2D,
    g: Gate,
    sx: number,
    sy: number,
    s: number,
    timeSec: number
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

    // 血条与显眼贴纸奖励牌
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

    const tag = g.labelOverride ?? '空投补给';
    ctx.font = `900 ${Math.round(12 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4;
    ctx.strokeText(tag, sx, sy - 45 * s);
    ctx.fillStyle = PALETTE.yellow;
    ctx.fillText(tag, sx, sy - 45 * s);
  }

  private drawMathGate(
    ctx: CanvasRenderingContext2D,
    g: Gate,
    sx: number,
    sy: number,
    s: number
  ): void {
    const w = g.width * s;
    const h = g.height * s;
    const x0 = sx - w * 0.5;
    const y0 = sy - h * 0.5;

    let mainColor: string = PALETTE.mint;
    let fillColor = 'rgba(0, 245, 212, 0.25)';
    let tagText = '摸鱼增员';
    if (g.op === '-' || g.op === '÷') {
      mainColor = PALETTE.red;
      fillColor = 'rgba(255, 51, 102, 0.30)';
      tagText = g.shootableToFlip ? '狂射洗白!' : '加班减员';
    } else if (g.op === 'BOX') {
      mainColor = PALETTE.purple;
      fillColor = 'rgba(155, 93, 229, 0.34)';
      tagText = '神秘盲盒';
    } else if (g.op === 'ULT') {
      mainColor = PALETTE.yellow;
      fillColor = 'rgba(255, 230, 0, 0.28)';
      tagText = '下班充能';
    } else if (g.kind === 'MOVING') {
      tagText = '滑轨门';
    } else if (g.flippedToBlue) {
      tagText = '驳回成功!';
    }

    // 3D 全息投影底座光影
    ctx.fillStyle = 'rgba(10, 12, 20, 0.45)';
    ctx.beginPath();
    ctx.roundRect(x0 + 4, y0 + 6, w, h, 10);
    ctx.fill();

    // 外圈发光框（同心粗线替代 shadowBlur）
    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 6;
    ctx.globalAlpha *= 0.26;
    ctx.beginPath();
    ctx.roundRect(x0 - 2, y0 - 2, w + 4, h + 4, 11);
    ctx.stroke();
    ctx.globalAlpha = g.pairLocked ? 0.22 : 1;

    // 门体玻璃填充 + 高光斜线纹理
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 9);
    ctx.clip();

    ctx.fillStyle = g.hitFlashTimer > 0 ? 'rgba(248, 247, 242, 0.65)' : fillColor;
    ctx.fillRect(x0, y0, w, h);

    // 玻璃斜向高光反光条
    ctx.fillStyle = 'rgba(255, 255, 255, 0.14)';
    ctx.beginPath();
    ctx.moveTo(x0 + 12 * s, y0);
    ctx.lineTo(x0 + 34 * s, y0);
    ctx.lineTo(x0 + 16 * s, y0 + h);
    ctx.lineTo(x0 - 6 * s, y0 + h);
    ctx.closePath();
    ctx.fill();

    if (g.op === '-' || g.op === '÷') {
      // 危险斜条纹底纹
      ctx.fillStyle = 'rgba(255, 51, 102, 0.18)';
      for (let rx = x0 - h; rx < x0 + w; rx += 18 * s) {
        ctx.beginPath();
        ctx.moveTo(rx, y0 + h);
        ctx.lineTo(rx + 8 * s, y0 + h);
        ctx.lineTo(rx + h + 8 * s, y0);
        ctx.lineTo(rx + h, y0);
        ctx.closePath();
        ctx.fill();
      }
    }
    ctx.restore();

    // 粗墨外边框 + 内亮线
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(x0, y0, w, h, 9);
    ctx.stroke();

    ctx.strokeStyle = mainColor;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.roundRect(x0 + 2, y0 + 2, w - 4, h - 4, 7);
    ctx.stroke();

    // 金属门柱立柱
    ctx.fillStyle = PALETTE.ink;
    ctx.fillRect(x0 - 5, y0 - 5, 10, h + 10);
    ctx.fillRect(x0 + w - 5, y0 - 5, 10, h + 10);
    ctx.fillStyle = mainColor;
    ctx.fillRect(x0 - 2.5, y0 - 2, 5, h + 4);
    ctx.fillRect(x0 + w - 2.5, y0 - 2, 5, h + 4);

    // 顶部迷你中文铭牌
    const tagW = Math.min(w - 14, 70 * s);
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.roundRect(sx - tagW * 0.5, y0 - 9 * s, tagW, 15 * s, 5);
    ctx.fill();
    ctx.fillStyle = mainColor;
    ctx.font = `900 ${Math.round(9.5 * s)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(tagText, sx, y0 - 1.5 * s);

    // 红门可射穿洗白充能条
    if (g.shootableToFlip && (g.op === '-' || g.op === '÷')) {
      const progress = Math.min(1, g.flipProgress / Math.max(1, g.flipHpPerStep));
      ctx.fillStyle = PALETTE.ink;
      ctx.fillRect(x0 + 10, y0 + h - 8, w - 20, 5);
      ctx.fillStyle = PALETTE.mint;
      ctx.fillRect(x0 + 10, y0 + h - 8, (w - 20) * progress, 5);
    }

    // 门面大数字算式
    let label = g.labelOverride ?? `${g.op}${g.value}`;
    if (g.flippedToBlue && g.op === '+') {
      label = `+${g.value}`;
    } else if (g.op === '-' || g.op === '÷') {
      label = `${g.op}${g.value}`;
    } else if (g.op === '+' || g.op === '×') {
      label = `${g.op}${g.value}`;
    }

    const fontSize = label.length > 5 ? Math.round(14 * s) : Math.round(24 * s);
    ctx.font = `900 ${fontSize}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 4.5;
    ctx.strokeText(label, sx, sy + 2 * s);
    ctx.fillStyle = PALETTE.paper;
    ctx.fillText(label, sx, sy + 2 * s);
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
      const tilt = stride * (e.configId === 'ppt_pie' ? 0.08 : 0.11);
      const squashY = 1 - Math.abs(stride) * 0.06;
      const squashX = 1 + Math.abs(stride) * 0.05;

      ctx.save();
      ctx.translate(sx, e.y);
      ctx.rotate(tilt);
      ctx.scale(squashX, squashY);
      const w = sp.logicalW * s;
      const h = sp.logicalH * s;
      ctx.drawImage(img, -w * 0.5, -h * 0.5, w, h);

      if (e.chillTimer > 0) {
        ctx.strokeStyle = PALETTE.mint;
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, e.radius * s + 3, 0, Math.PI * 2);
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

    const boss = world.enemies.boss;
    if (boss.active) {
      const sp = this.sprites.get('bossAlarm');
      const bx = projectX(boss.laneX, boss.y);
      const enraged = boss.hp < boss.maxHp * 0.4;
      const vib = Math.sin(boss.ringPhase) * (enraged ? 4.2 : 2.5);
      const pulse = 1 + Math.sin(world.state.elapsedSec * (enraged ? 12 : 6)) * 0.03;
      const img = boss.flashTimer > 0 ? sp.flashCanvas : sp.canvas;

      ctx.save();
      ctx.translate(bx + vib, boss.y);
      ctx.scale(pulse, 2 - pulse);
      ctx.drawImage(img, -sp.logicalW * 0.5, -sp.logicalH * 0.5, sp.logicalW, sp.logicalH);
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
        ctx.strokeStyle = PALETTE.coffee;
        ctx.lineWidth = b.radius * 2.4 * s;
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
        ctx.fillStyle = b.isCrit ? PALETTE.yellow : PALETTE.paper;
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

    const bProjs = world.enemies.bossProjectiles.activeItems;
    for (let i = 0; i < bProjs.length; i++) {
      const p = bProjs[i];
      if (!p.active) continue;
      const s = depthScale(p.y);
      const sx = projectX(p.laneX, p.y);
      const r = p.radius * s;

      ctx.fillStyle = PALETTE.red;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.arc(sx, p.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      ctx.fillStyle = PALETTE.yellow;
      ctx.beginPath();
      ctx.arc(sx, p.y, r * 0.44, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  private drawLayer6FxAndText(ctx: CanvasRenderingContext2D, world: GameWorld): void {
    const particles = world.particles.activeItems;
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      if (!p.active) continue;
      const alpha = Math.max(0, 1 - p.life / p.maxLife);
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      ctx.fillStyle = p.color;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 1.6;
      const s = p.size * (0.4 + 0.7 * alpha);
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
      ctx.restore();
    }

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
      const badgeY = PLAYER_Y - 40;
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
    }

    // 实时连杀贴纸徽章
    if (state.phase === 'PLAYING' && state.comboCount >= 5) {
      const pop = 1 + Math.min(0.15, (state.comboTimer / 2.4) * 0.12);
      ctx.save();
      ctx.translate(DESIGN_W - 62, 166);
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
      ctx.fillText(`🔥 ${state.comboCount} 连杀!`, 0, 0.5);
      ctx.restore();
    }

    // 顶部 Boss 血条
    const boss = world.enemies.boss;
    if (boss.active) {
      const bw = 278;
      const bx = (DESIGN_W - bw) * 0.5;
      const by = 114;

      ctx.fillStyle = PALETTE.ink;
      ctx.beginPath();
      ctx.roundRect(bx - 3, by - 3, bw + 6, 22, 8);
      ctx.fill();

      ctx.fillStyle = '#33202E';
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, 16, 6);
      ctx.fill();

      ctx.fillStyle = PALETTE.red;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw * Math.max(0, boss.hp / boss.maxHp), 16, 6);
      ctx.fill();

      ctx.fillStyle = PALETTE.paper;
      ctx.strokeStyle = PALETTE.ink;
      ctx.lineWidth = 3;
      ctx.font = '900 11px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const hpText = `${boss.name}  ${Math.ceil(boss.hp)}/${boss.maxHp}`;
      ctx.strokeText(hpText, DESIGN_W * 0.5, by + 8);
      ctx.fillText(hpText, DESIGN_W * 0.5, by + 8);
    }

    // Boss 登场警报条
    if (state.bossBannerTimer > 0) {
      ctx.save();
      ctx.translate(DESIGN_W * 0.5, 320);
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
      ctx.fillText('⚠️ 07:00 早高峰闹钟突脸！', 0, 0);
      ctx.restore();
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
}
