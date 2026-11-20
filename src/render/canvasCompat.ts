/**
 * Chrome 61 / WebView 61 不支持 CanvasRenderingContext2D.prototype.roundRect（Chrome 99 才加入）。
 * 在首个 2D 上下文绘制前注入轻量级圆角矩形兜底，保证所有卡片、气泡与 HUD 绘制兼容旧内核。
 */
export function ensureCanvasRoundRect(): void {
  if (typeof CanvasRenderingContext2D === 'undefined') return;
  const proto = CanvasRenderingContext2D.prototype as unknown as {
    roundRect?: (x: number, y: number, w: number, h: number, radii?: number | number[]) => void;
  };
  if (typeof proto.roundRect === 'function') return;

  proto.roundRect = function roundRectCompat(
    this: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    radii: number | number[] = 0
  ): void {
    const absW = Math.abs(w);
    const absH = Math.abs(h);
    const rawR = Array.isArray(radii) ? (radii.length > 0 ? radii[0] : 0) : radii;
    const r = Math.max(0, Math.min(Number(rawR) || 0, absW * 0.5, absH * 0.5));

    const x0 = w >= 0 ? x : x + w;
    const y0 = h >= 0 ? y : y + h;

    this.moveTo(x0 + r, y0);
    this.lineTo(x0 + absW - r, y0);
    this.arcTo(x0 + absW, y0, x0 + absW, y0 + r, r);
    this.lineTo(x0 + absW, y0 + absH - r);
    this.arcTo(x0 + absW, y0 + absH, x0 + absW - r, y0 + absH, r);
    this.lineTo(x0 + r, y0 + absH);
    this.arcTo(x0, y0 + absH, x0, y0 + absH - r, r);
    this.lineTo(x0, y0 + r);
    this.arcTo(x0, y0, x0 + r, y0, r);
    this.closePath();
  };
}
