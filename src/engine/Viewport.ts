export const DESIGN_W = 390;
export const DESIGN_H = 844;
export const TRACK_TOP_Y = 110;
export const TRACK_BOTTOM_Y = 760;
export const PLAYER_Y = 650;
export const LANE_HALF_W = 160;
export const LEADER_MAX_X = 142;
/** 跑道（门、路面刻度）向玩家滚动的速度 px/s */
export const SCROLL_SPEED = 136;
/** 开火线：敌人越过这条线（完全淡入画面）后才能被子弹命中，保证每只怪都先被看见再倒下 */
export const ENGAGE_Y = TRACK_TOP_Y + 28;

export function clamp(val: number, min: number, max: number): number {
  return val < min ? min : val > max ? max : val;
}

export function depthScale(y: number): number {
  const t = clamp((y - TRACK_TOP_Y) / (PLAYER_Y - TRACK_TOP_Y), 0, 1.15);
  return 0.76 + 0.26 * t;
}

export function projectX(laneX: number, y: number): number {
  return DESIGN_W * 0.5 + laneX * depthScale(y);
}

export class Viewport {
  public dpr = 1;
  /** 渲染分辨率上限（省电画质下降到 1.25） */
  public maxDpr = 2;
  public scale = 1;
  public cssScale = 1;
  public offsetX = 0;
  public offsetY = 0;
  public cssWidth = DESIGN_W;
  public cssHeight = DESIGN_H;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly ctx: CanvasRenderingContext2D
  ) {}

  sync(): void {
    const appEl = this.canvas.parentElement;
    const vw = appEl ? appEl.clientWidth : window.innerWidth;
    const vh = appEl ? appEl.clientHeight : window.innerHeight;

    document.documentElement.style.setProperty('--app-height', `${window.innerHeight}px`);

    this.cssWidth = Math.max(1, vw);
    this.cssHeight = Math.max(1, vh);
    this.dpr = Math.min(window.devicePixelRatio || 1, this.maxDpr);

    const backingW = Math.round(this.cssWidth * this.dpr);
    const backingH = Math.round(this.cssHeight * this.dpr);
    if (this.canvas.width !== backingW || this.canvas.height !== backingH) {
      this.canvas.width = backingW;
      this.canvas.height = backingH;
    }

    const scaleX = backingW / DESIGN_W;
    const scaleY = backingH / DESIGN_H;
    this.scale = Math.min(scaleX, scaleY);
    this.cssScale = this.scale / this.dpr;
    this.offsetX = (backingW - DESIGN_W * this.scale) * 0.5;
    this.offsetY = (backingH - DESIGN_H * this.scale) * 0.5;
  }

  beginFrame(): void {
    this.ctx.setTransform(1, 0, 0, 1, 0, 0);
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.ctx.setTransform(this.scale, 0, 0, this.scale, this.offsetX, this.offsetY);
  }
}
