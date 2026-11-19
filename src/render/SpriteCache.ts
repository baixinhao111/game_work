import { PALETTE } from '../data/palette';

export interface CachedSprite {
  canvas: HTMLCanvasElement;
  flashCanvas: HTMLCanvasElement;
  logicalW: number;
  logicalH: number;
}

const SPRITE_SPECS = [
  { key: 'heroSlacker', file: 'hero_slacker.png', w: 48, h: 48, fallbackColor: PALETTE.mint },
  { key: 'heroStriker', file: 'hero_striker.png', w: 60, h: 60, fallbackColor: PALETTE.yellow },
  { key: 'heroMech', file: 'hero_mech.png', w: 74, h: 74, fallbackColor: PALETTE.purple },
  { key: 'enemyZombie', file: 'enemy_zombie.png', w: 48, h: 48, fallbackColor: PALETTE.mint },
  { key: 'enemyMailImp', file: 'enemy_mail_imp.png', w: 52, h: 52, fallbackColor: PALETTE.paper },
  {
    key: 'enemyClientMonster',
    file: 'enemy_client_monster.png',
    w: 62,
    h: 62,
    fallbackColor: PALETTE.purple
  },
  { key: 'enemyPptGolem', file: 'enemy_ppt_golem.png', w: 72, h: 72, fallbackColor: PALETTE.yellow },
  { key: 'enemyDdlFlame', file: 'enemy_ddl_flame.png', w: 52, h: 52, fallbackColor: PALETTE.red },
  { key: 'propCrate', file: 'prop_crate.png', w: 72, h: 72, fallbackColor: PALETTE.coffee },
  { key: 'bossAlarm', file: 'boss_alarm.png', w: 136, h: 136, fallbackColor: PALETTE.red }
] as const;

export type SpriteKey = (typeof SPRITE_SPECS)[number]['key'];

export class SpriteCache {
  private readonly map = new Map<SpriteKey, CachedSprite>();

  constructor() {
    for (const spec of SPRITE_SPECS) {
      this.map.set(spec.key, this.createPlaceholder(spec.w, spec.h, spec.fallbackColor));
    }
  }

  get(key: SpriteKey): CachedSprite {
    return this.map.get(key)!;
  }

  async loadAll(): Promise<void> {
    await Promise.allSettled(
      SPRITE_SPECS.map(async (spec) => {
        const img = await this.loadImage(`/assets/sprites/${spec.file}`);
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth || spec.w * 2;
        canvas.height = img.naturalHeight || spec.h * 2;
        const ctx = canvas.getContext('2d')!;
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

        const flashCanvas = this.createFlashVariant(canvas);
        this.map.set(spec.key, {
          canvas,
          flashCanvas,
          logicalW: spec.w,
          logicalH: spec.h
        });
      })
    );
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
      flashCanvas: this.createFlashVariant(canvas),
      logicalW,
      logicalH
    };
  }

  private createFlashVariant(src: HTMLCanvasElement): HTMLCanvasElement {
    const flash = document.createElement('canvas');
    flash.width = src.width;
    flash.height = src.height;
    const fCtx = flash.getContext('2d')!;
    fCtx.drawImage(src, 0, 0);
    fCtx.globalCompositeOperation = 'source-atop';
    fCtx.fillStyle = PALETTE.paper;
    fCtx.fillRect(0, 0, flash.width, flash.height);
    return flash;
  }
}
