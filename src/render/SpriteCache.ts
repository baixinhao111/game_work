import { PALETTE } from '../data/palette';
import type { BossStyle, CharacterId } from '../game/types';

export interface CachedSprite {
  canvas: HTMLCanvasElement;
  flashCanvas: HTMLCanvasElement;
  rageCanvas: HTMLCanvasElement;
  logicalW: number;
  logicalH: number;
  /** false 表示仍是占位图（图片未加载或加载失败） */
  loaded: boolean;
}

const CORE_SPECS = [
  { key: 'heroSlacker', file: 'hero_slacker.webp', w: 48, h: 48, fallbackColor: PALETTE.mint },
  { key: 'heroStriker', file: 'hero_striker.webp', w: 60, h: 60, fallbackColor: PALETTE.yellow },
  { key: 'heroMech', file: 'hero_mech.webp', w: 74, h: 74, fallbackColor: PALETTE.purple },
  { key: 'enemyZombie', file: 'enemy_zombie.webp', w: 48, h: 48, fallbackColor: PALETTE.mint },
  { key: 'enemyMailImp', file: 'enemy_mail_imp.webp', w: 52, h: 52, fallbackColor: PALETTE.paper },
  {
    key: 'enemyClientMonster',
    file: 'enemy_client_monster.webp',
    w: 62,
    h: 62,
    fallbackColor: PALETTE.purple
  },
  { key: 'enemyPptGolem', file: 'enemy_ppt_golem.webp', w: 72, h: 72, fallbackColor: PALETTE.yellow },
  { key: 'enemyDdlFlame', file: 'enemy_ddl_flame.webp', w: 52, h: 52, fallbackColor: PALETTE.red },
  { key: 'propCrate', file: 'prop_crate.webp', w: 72, h: 72, fallbackColor: PALETTE.coffee }
] as const;

const BOSS_SPECS = [
  { key: 'bossAlarm', style: 'alarm', file: 'boss_alarm.webp', w: 136, h: 136, fallbackColor: PALETTE.red },
  {
    key: 'bossProjector',
    style: 'projector',
    file: 'boss_projector.webp',
    w: 150,
    h: 150,
    fallbackColor: PALETTE.purple
  },
  { key: 'bossHydra', style: 'hydra', file: 'boss_hydra.webp', w: 156, h: 156, fallbackColor: PALETTE.purple },
  { key: 'bossServer', style: 'server', file: 'boss_server.webp', w: 150, h: 150, fallbackColor: PALETTE.red },
  { key: 'bossKpi', style: 'kpi', file: 'boss_kpi.webp', w: 166, h: 166, fallbackColor: PALETTE.yellow }
] as const;

/** v1.0 角色的小队单位（实习生沿用 heroSlacker）；选中后再按需加载 */
const CHAR_SPECS = [
  { key: 'heroCoder', char: 'coder', file: 'hero_coder.webp', w: 50, h: 50, fallbackColor: PALETTE.mint },
  { key: 'heroDesigner', char: 'designer', file: 'hero_designer.webp', w: 50, h: 50, fallbackColor: PALETTE.purple },
  { key: 'heroPm', char: 'pm', file: 'hero_pm.webp', w: 50, h: 50, fallbackColor: PALETTE.yellow },
  { key: 'heroSales', char: 'sales', file: 'hero_sales.webp', w: 50, h: 50, fallbackColor: PALETTE.yellow },
  { key: 'heroCleaner', char: 'cleaner', file: 'hero_cleaner.webp', w: 52, h: 52, fallbackColor: PALETTE.coffee }
] as const;

export const CHARACTER_SPRITE: Record<CharacterId, SpriteKey> = {
  intern: 'heroSlacker',
  coder: 'heroCoder',
  designer: 'heroDesigner',
  pm: 'heroPm',
  sales: 'heroSales',
  cleaner: 'heroCleaner'
};

export type SpriteKey =
  | (typeof CORE_SPECS)[number]['key']
  | (typeof BOSS_SPECS)[number]['key']
  | (typeof CHAR_SPECS)[number]['key']
  | 'enemyUnread';

export class SpriteCache {
  private readonly map = new Map<SpriteKey, CachedSprite>();
  private readonly bossLoads = new Map<BossStyle, Promise<void>>();
  private readonly charLoads = new Map<CharacterId, Promise<void>>();

  constructor() {
    for (const spec of CORE_SPECS) {
      this.map.set(spec.key, this.createPlaceholder(spec.w, spec.h, spec.fallbackColor));
    }
    for (const spec of BOSS_SPECS) {
      this.map.set(spec.key, this.createPlaceholder(spec.w, spec.h, spec.fallbackColor));
    }
    for (const spec of CHAR_SPECS) {
      this.map.set(spec.key, this.createPlaceholder(spec.w, spec.h, spec.fallbackColor));
    }
    this.map.set('enemyUnread', this.createUnreadSprite());
  }

  /** 按出战角色按需加载小队单位贴图（自动去重） */
  ensureCharacter(id: CharacterId): Promise<void> {
    const existing = this.charLoads.get(id);
    if (existing) return existing;
    const spec = CHAR_SPECS.find((c) => c.char === id);
    if (!spec) return Promise.resolve();
    const task = this.loadAndCache(spec).catch(() => {
      // 加载失败时渲染层回退到实习生贴图
    });
    this.charLoads.set(id, task);
    return task;
  }

  get(key: SpriteKey): CachedSprite {
    return this.map.get(key)!;
  }

  /** 首屏仅加载核心 9 张战斗精灵，避免浪费流量拉取后续关卡 Boss 大图 */
  async loadCore(): Promise<void> {
    await Promise.all(
      CORE_SPECS.map((spec) =>
        this.loadAndCache(spec).catch(() => {
          // 保留内置占位图
        })
      )
    );
  }

  /** 按当前选中/进行中关卡按需加载对应 Boss 贴图（自动去重） */
  ensureBoss(style: BossStyle): Promise<void> {
    const existing = this.bossLoads.get(style);
    if (existing) return existing;

    const spec = BOSS_SPECS.find((b) => b.style === style);
    if (!spec) return Promise.resolve();

    const task = this.loadAndCache(spec).catch(() => {
      // 保留矢量兜底与占位图
    });
    this.bossLoads.set(style, task);
    return task;
  }

  private async loadAndCache(spec: {
    key: SpriteKey;
    file: string;
    w: number;
    h: number;
  }): Promise<void> {
    const img = await this.loadImage(`./assets/sprites/${spec.file}`);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth || spec.w * 2;
    canvas.height = img.naturalHeight || spec.h * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    this.map.set(spec.key, {
      canvas,
      flashCanvas: this.createTintVariant(canvas, PALETTE.paper),
      rageCanvas: this.createRageVariant(canvas),
      logicalW: spec.w,
      logicalH: spec.h,
      loaded: true
    });
  }

  private loadImage(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error(`Failed to load sprite: ${url}`));
      img.src = url;
    });
  }

  /** 「未读红点 99+」炮灰：纯代码绘制，不占包体 */
  private createUnreadSprite(): CachedSprite {
    const L = 34;
    const canvas = document.createElement('canvas');
    canvas.width = L * 3;
    canvas.height = L * 3;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(3, 3);
    const cx = L / 2;
    const cy = L / 2 - 1;
    // 硬投影
    ctx.fillStyle = PALETTE.ink;
    ctx.beginPath();
    ctx.arc(cx + 2, cy + 2, 13, 0, Math.PI * 2);
    ctx.fill();
    // 红色气泡 + 小尾巴
    ctx.fillStyle = PALETTE.red;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.arc(cx, cy, 13, 0, Math.PI * 2);
    ctx.moveTo(cx - 4, cy + 12);
    ctx.lineTo(cx - 8, cy + 17);
    ctx.lineTo(cx + 2, cy + 12.5);
    ctx.fill();
    ctx.stroke();
    // 高光
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.beginPath();
    ctx.ellipse(cx - 5, cy - 7, 4, 2.2, -0.5, 0, Math.PI * 2);
    ctx.fill();
    // 怒眉
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx - 8, cy - 4);
    ctx.lineTo(cx - 3, cy - 2);
    ctx.moveTo(cx + 8, cy - 4);
    ctx.lineTo(cx + 3, cy - 2);
    ctx.stroke();
    // 99+
    ctx.fillStyle = PALETTE.paper;
    ctx.font = '900 10px sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineWidth = 2.6;
    ctx.strokeText('99+', cx, cy + 4);
    ctx.fillText('99+', cx, cy + 4);
    return {
      canvas,
      flashCanvas: this.createTintVariant(canvas, PALETTE.paper),
      rageCanvas: this.createRageVariant(canvas),
      logicalW: L,
      logicalH: L,
      loaded: true
    };
  }

  private createPlaceholder(logicalW: number, logicalH: number, color: string): CachedSprite {
    const canvas = document.createElement('canvas');
    canvas.width = logicalW * 2;
    canvas.height = logicalH * 2;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(2, 2);
    ctx.fillStyle = color;
    ctx.strokeStyle = PALETTE.ink;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(logicalW * 0.5, logicalH * 0.5, logicalW * 0.34, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    return {
      canvas,
      flashCanvas: this.createTintVariant(canvas, PALETTE.paper),
      rageCanvas: this.createRageVariant(canvas),
      logicalW,
      logicalH,
      loaded: false
    };
  }

  private createTintVariant(src: HTMLCanvasElement, fillStyle: string): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = fillStyle;
    ctx.fillRect(0, 0, out.width, out.height);
    return out;
  }

  private createRageVariant(src: HTMLCanvasElement): HTMLCanvasElement {
    const out = document.createElement('canvas');
    out.width = src.width;
    out.height = src.height;
    const ctx = out.getContext('2d')!;
    ctx.drawImage(src, 0, 0);
    ctx.globalCompositeOperation = 'source-atop';
    ctx.fillStyle = 'rgba(255, 51, 102, 0.44)';
    ctx.fillRect(0, 0, out.width, out.height);
    return out;
  }
}
