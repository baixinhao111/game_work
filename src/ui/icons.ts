/**
 * 《周一突围》手绘贴纸风图标库：粗墨描边 + 游戏调色板，替代系统 emoji
 * （系统 emoji 在不同机型上长得不一样，也和霓虹波普画风不搭）。
 *
 * 文案里写 `{i:名称}` 即可插入图标：
 *   - DOM：richHtml(text) / iconSvg(name)
 *   - Canvas：drawRichText(ctx, text, x, y)
 */

const K = '#0F111A'; // 墨
const Y = '#FFE600'; // 荧光黄
const M = '#00F5D4'; // 薄荷
const R = '#FF3366'; // 警报红
const P = '#9B5DE5'; // 紫
const C = '#C68B59'; // 咖啡
const W = '#F8F7F2'; // 纸白
const SKIN = '#FFD3A8';

/** 粗描边双层线（墨色底 + 彩色线），小尺寸下也清楚 */
const dbl = (d: string, color: string, w = 2.6) =>
  `<path d="${d}" fill="none" stroke="${K}" stroke-width="${w + 2.4}"/><path d="${d}" fill="none" stroke="${color}" stroke-width="${w}"/>`;

const ICONS = {
  gear: `<path d="M10.3 2.5h3.4l.6 2.6 2 1.1 2.5-.9 1.7 2.9-2 1.8v2.2l2 1.8-1.7 2.9-2.5-.9-2 1.1-.6 2.6h-3.4l-.6-2.6-2-1.1-2.5.9-1.7-2.9 2-1.8V11L3.4 9.2l1.7-2.9 2.5.9 2-1.1z" fill="${W}"/><circle cx="12" cy="12" r="3.2" fill="${Y}"/>`,
  star: `<path d="M12 2.8l2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9z" fill="${Y}"/>`,
  chart: `<rect x="3.5" y="12" width="4" height="8" rx="1" fill="${M}"/><rect x="10" y="6" width="4" height="14" rx="1" fill="${Y}"/><rect x="16.5" y="9" width="4" height="11" rx="1" fill="${R}"/>`,
  person: `<circle cx="12" cy="7.5" r="4" fill="${SKIN}"/><path d="M4.5 21c.5-5 3.6-7.6 7.5-7.6s7 2.6 7.5 7.6z" fill="${M}"/>`,
  home: `<path d="M3.5 11.5L12 4l8.5 7.5" fill="none"/><path d="M6 10v10h12V10" fill="${W}"/><rect x="10" y="14" width="4" height="6" fill="${Y}"/>`,
  retry: `${dbl('M18.5 8.5A7.5 7.5 0 1 0 19.5 13', Y, 2.6)}<path d="M15 4.5l4.5 4-5 2z" fill="${Y}"/>`,
  play: `<path d="M7 4.5v15l12-7.5z" fill="${Y}"/>`,
    speaker: `<path d="M3 9h4l5-4v14l-5-4H3z" fill="${Y}"/><path d="M15.5 9.5a3.5 3.5 0 0 1 0 5M18 7a7 7 0 0 1 0 10" fill="none"/>`,
  mute: `<path d="M3 9h4l5-4v14l-5-4H3z" fill="${Y}"/>${dbl('M15.5 9l5 6M20.5 9l-5 6', R, 2.2)}`,
  pause: `<rect x="5" y="4" width="5" height="16" rx="1.5" fill="${W}"/><rect x="14" y="4" width="5" height="16" rx="1.5" fill="${W}"/>`,
  bean: `<g transform="rotate(32 12 12)"><ellipse cx="12" cy="12" rx="6.5" ry="9.3" fill="${C}"/><path d="M11 3.5c2.6 3.6-1.8 8.6 1 17" fill="none"/></g>`,
  cup: `<path d="M9 2.8c-1 1.4 1 2.4 0 3.8M12.5 2.8c-1 1.4 1 2.4 0 3.8" fill="none"/><path d="M4.5 9.5h12v5.2a5.3 5.3 0 0 1-5.3 5.3h-1.4a5.3 5.3 0 0 1-5.3-5.3z" fill="${W}"/><path d="M16.5 11h1.6a2.6 2.6 0 0 1 0 5.2h-1.8" fill="none"/><rect x="6" y="10.6" width="9" height="2.2" fill="${C}" stroke="none"/>`,
  shield: `<path d="M12 2.5l8 3v6c0 5-3.5 8.5-8 10-4.5-1.5-8-5-8-10v-6z" fill="${M}"/><ellipse cx="11" cy="12" rx="3.7" ry="2.3" fill="${W}" stroke-width="1.6"/><path d="M14.5 12l2.8-2.2v4.4z" fill="${W}" stroke-width="1.6"/><circle cx="9.6" cy="11.6" r="0.75" fill="${K}" stroke="none"/>`,
  flask: `<path d="M7 15h10l2.3 3.7a1.3 1.3 0 0 1-1.1 2H5.8a1.3 1.3 0 0 1-1.1-2z" fill="${P}" stroke="none"/><path d="M9 3h6M10 3v6l-5.2 9a1.9 1.9 0 0 0 1.6 2.9h11.2a1.9 1.9 0 0 0 1.6-2.9L14 9V3" fill="none"/><circle cx="10.5" cy="17" r="1.1" fill="${W}" stroke-width="1.2"/><circle cx="13.6" cy="13.2" r="0.9" fill="${W}" stroke-width="1.2"/>`,
  bolt: `<path d="M13.5 2L4.5 14h6.2l-1.2 8L19 10h-6.2z" fill="${Y}"/>`,
  flame: `<path d="M12 2c1 4 6.5 6 6.5 12.2a6.5 6.5 0 0 1-13 0c0-3.2 2.2-5.2 3.2-6.2 0 2 1 3.2 2.1 3.2 0-4-1-6.2 1.2-9.2z" fill="${R}"/><path d="M12 13c1.6 1.5 3.1 2.6 3.1 4.6a3.1 3.1 0 0 1-6.2 0c0-1.5 1-2.6 1.6-3.6.3 1 .8 1.6 1.5 1.6z" fill="${Y}" stroke-width="1.5"/>`,
  moon: `<path d="M15.5 3a8.6 8.6 0 1 0 5.8 13.6A7.2 7.2 0 0 1 15.5 3z" fill="${Y}"/><path d="M5.5 3.5l.7 1.6 1.6.7-1.6.7-.7 1.6-.7-1.6-1.6-.7 1.6-.7z" fill="${W}" stroke-width="1.2"/>`,
  squad: `<circle cx="6" cy="8.5" r="2.6" fill="${W}"/><circle cx="18" cy="8.5" r="2.6" fill="${W}"/><path d="M1.8 17.5c.4-3 2-4.6 4.2-4.6M22.2 17.5c-.4-3-2-4.6-4.2-4.6" fill="none"/><path d="M5.8 21.5c0-4 2.8-6.6 6.2-6.6s6.2 2.6 6.2 6.6z" fill="${M}"/><circle cx="12" cy="9.8" r="3.7" fill="${SKIN}"/><path d="M8.2 9.5a3.8 3.8 0 0 1 7.6 0" fill="none" stroke="${Y}" stroke-width="2"/>`,
  calendar: `<rect x="3.5" y="5" width="17" height="15.5" rx="2" fill="${W}"/><path d="M3.5 7a2 2 0 0 1 2-2h13a2 2 0 0 1 2 2v3h-17z" fill="${R}"/><path d="M8 3v4M16 3v4" fill="none"/><path d="M8.5 15.2l2.4 2.4 4.6-4.8" fill="none" stroke-width="2.3"/>`,
  idcard: `<path d="M8 1.5l4 5 4-5" fill="none" stroke="${K}" stroke-width="4"/><path d="M8 1.5l4 5 4-5" fill="none" stroke="${Y}" stroke-width="1.8"/><rect x="5" y="7" width="14" height="15" rx="2" fill="${W}"/><rect x="10" y="5.8" width="4" height="2.6" rx="0.8" fill="${Y}" stroke-width="1.5"/><rect x="7.8" y="10.5" width="4.6" height="5.2" rx="1" fill="${M}" stroke-width="1.5"/><path d="M14.5 11.6h2.4M14.5 14.6h2.4M8 18.8h8" fill="none" stroke-width="1.6"/>`,
  camera: `<path d="M8 7.5l1.5-3h5L16 7.5" fill="${W}"/><rect x="2.5" y="7" width="19" height="13" rx="2.5" fill="${W}"/><circle cx="12" cy="13.5" r="4.2" fill="${M}"/><circle cx="12" cy="13.5" r="1.7" fill="${K}" stroke="none"/><circle cx="18" cy="10" r="1" fill="${R}" stroke-width="1.2"/>`,
  chat: `<path d="M4 4.5h16A1.5 1.5 0 0 1 21.5 6v9.5A1.5 1.5 0 0 1 20 17h-8.5L6 21.2V17H4a1.5 1.5 0 0 1-1.5-1.5V6A1.5 1.5 0 0 1 4 4.5z" fill="${W}"/><circle cx="8" cy="10.8" r="1.3" fill="${K}" stroke="none"/><circle cx="12" cy="10.8" r="1.3" fill="${K}" stroke="none"/><circle cx="16" cy="10.8" r="1.3" fill="${K}" stroke="none"/>`,
  lock: `<path d="M7.8 11V8a4.2 4.2 0 0 1 8.4 0v3" fill="none" stroke-width="2.4"/><rect x="4.5" y="10.5" width="15" height="11" rx="2" fill="${Y}"/><circle cx="12" cy="15.2" r="1.4" fill="${K}" stroke="none"/><path d="M12 15.5v2.6" fill="none"/>`,
  check: dbl('M4.5 12.5l5 5L19.5 6.5', M, 3),
  swap: `${dbl('M4 9h14', Y)}${dbl('M14.5 5.5L18 9l-3.5 3.5', Y)}${dbl('M20 15H6', M)}${dbl('M9.5 11.5L6 15l3.5 3.5', M)}`,
  sparkle: `<path d="M11 2l2.2 7.6L21 12l-7.8 2.4L11 22l-2.2-7.6L1 12l7.8-2.4z" fill="${Y}"/><path d="M19.5 2.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" fill="${W}" stroke-width="1.2"/>`,
  box: `<path d="M3 8l9-4 9 4v10l-9 4-9-4z" fill="${C}"/><path d="M3 8l9 4 9-4M12 12v10" fill="none"/><path d="M7.5 6l9 4v3" fill="none" stroke="${Y}" stroke-width="2"/>`,
  target: `<circle cx="12" cy="12" r="9.5" fill="${R}"/><circle cx="12" cy="12" r="6" fill="${W}"/><circle cx="12" cy="12" r="2.6" fill="${R}"/>`,
  arrow: `${dbl('M3 12h14', W, 3)}${dbl('M12.5 6l6 6-6 6', W, 3)}`,
  burst: `<path d="M12.0 1.5L13.9 7.4L19.4 4.6L16.6 10.1L22.5 12.0L16.6 13.9L19.4 19.4L13.9 16.6L12.0 22.5L10.1 16.6L4.6 19.4L7.4 13.9L1.5 12.0L7.4 10.1L4.6 4.6L10.1 7.4Z" fill="${Y}"/><circle cx="12" cy="12" r="2.6" fill="${R}" stroke-width="1.4"/>`,
  magnet: `<path d="M5.5 3.5h5v8.5a1.5 1.5 0 0 0 3 0V3.5h5V12a6.5 6.5 0 0 1-13 0z" fill="${R}"/><path d="M5.5 3.5h5v3.5h-5zM13.5 3.5h5v3.5h-5z" fill="${W}"/>`,
  homing: `${dbl('M3.5 20c2.5-8 8-4.5 9.5-9.5S17 4 20 4', M, 2.4)}${dbl('M15.8 3.2L20 4l-1 4.2', M, 2.4)}`,
  wave: `${dbl('M2 9c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.2 5 0', M, 2.3)}${dbl('M2 15c2.5-3 5-3 7.5 0s5 3 7.5 0 3.5-2.2 5 0', M, 2.3)}`,
  abacus: `<rect x="3" y="3" width="18" height="18" rx="2" fill="${C}"/><path d="M3 8.5h18M3 12h18M3 15.5h18" fill="none" stroke-width="1.4"/><circle cx="7.5" cy="8.5" r="1.9" fill="${Y}" stroke-width="1.4"/><circle cx="11" cy="8.5" r="1.9" fill="${Y}" stroke-width="1.4"/><circle cx="14" cy="12" r="1.9" fill="${M}" stroke-width="1.4"/><circle cx="17.3" cy="12" r="1.9" fill="${M}" stroke-width="1.4"/><circle cx="7.5" cy="15.5" r="1.9" fill="${R}" stroke-width="1.4"/>`,
  hongbao: `<rect x="5" y="2.5" width="14" height="19" rx="2" fill="${R}"/><path d="M5 7.6c3.2 2.8 10.8 2.8 14 0" fill="none"/><circle cx="12" cy="10.2" r="2.8" fill="${Y}" stroke-width="1.7"/>`,
  warning: `<path d="M12 2.8l10 17.6H2z" fill="${Y}"/><path d="M12 9.2v5" fill="none" stroke-width="2.6"/><circle cx="12" cy="17.2" r="1.25" fill="${K}" stroke="none"/>`,
  alarm: `<path d="M7 20l-1.6 2M17 20l1.6 2" fill="none"/><circle cx="5.5" cy="5" r="2.4" fill="${Y}"/><circle cx="18.5" cy="5" r="2.4" fill="${Y}"/><circle cx="12" cy="13" r="8" fill="${R}"/><circle cx="12" cy="13" r="5.6" fill="${W}"/><path d="M12 9.6V13l2.6 1.6" fill="none"/>`,
  mail: `<rect x="2.5" y="5.5" width="19" height="13" rx="1.8" fill="${W}"/><path d="M3 7l9 6.5L21 7" fill="none"/><circle cx="12" cy="13.4" r="2" fill="${R}" stroke-width="1.5"/>`,
  trophy: `<path d="M7 5H4.5v1.5A3 3 0 0 0 7.2 9.6M17 5h2.5v1.5a3 3 0 0 1-2.7 3.1" fill="none"/><path d="M7 3h10v5a5 5 0 0 1-10 0z" fill="${Y}"/><path d="M12 13v4" fill="none"/><rect x="7.5" y="17" width="9" height="4" rx="1" fill="${C}"/>`,
  stamp: `<circle cx="12" cy="4.8" r="2.6" fill="${R}"/><path d="M9.6 7.2h4.8l1.2 5.8H8.4z" fill="${C}"/><rect x="4" y="13" width="16" height="4.2" rx="1" fill="${R}"/>${dbl('M5 21h14', R, 1.8)}`,
  megaphone: `<path d="M3 9.5h3.5L15.5 4.5v15l-9-5H3z" fill="${Y}"/><path d="M6.5 14.5l1.6 5h2.6l-1.1-4" fill="${W}"/><path d="M18.2 9.2l2.6-1.6M18.8 12h3M18.2 14.8l2.6 1.6" fill="none"/>`,
  anger: dbl('M9 3v2.5A3.5 3.5 0 0 1 5.5 9H3M15 3v2.5A3.5 3.5 0 0 0 18.5 9H21M9 21v-2.5A3.5 3.5 0 0 0 5.5 15H3M15 21v-2.5a3.5 3.5 0 0 1 3.5-3.5H21', R, 2.4),
  shades: `<path d="M10.5 10.2h3" fill="none"/><path d="M2.5 8.8h8.2l-.9 5.4a2.1 2.1 0 0 1-2.1 1.8H5.4a2.1 2.1 0 0 1-2.1-1.7z" fill="${K}"/><path d="M13.3 8.8h8.2l-.8 5.5a2.1 2.1 0 0 1-2.1 1.7h-2.3a2.1 2.1 0 0 1-2.1-1.8z" fill="${K}"/><path d="M4.8 10.6l2-.8M15.6 10.6l2-.8" fill="none" stroke="${W}" stroke-width="1.3"/>`,
  hand: `<path d="M9 21.5v-5.5l-2.6-2.6a1.6 1.6 0 0 1 2.3-2.3L10 12.4V4a1.5 1.5 0 0 1 3 0v6.2h1.4a1.5 1.5 0 0 1 1.5 1.5v.5h.8a1.5 1.5 0 0 1 1.5 1.5v4l-1.6 3.8z" fill="${SKIN}"/><path d="M13 10.2v2.4M15.9 12.2v1.6" fill="none" stroke-width="1.4"/>`,
  ruler: `<path d="M3 21V4.5L19.5 21z" fill="${Y}"/><path d="M7 17v-4.6l4.6 4.6z" fill="${W}" stroke-width="1.5"/><path d="M3 8h2M3 11.5h2M3 15h2M6.5 21v-2M10 21v-2" fill="none" stroke-width="1.4"/>`
} as const;

export type IconName = keyof typeof ICONS;

export function isIconName(name: string): name is IconName {
  return Object.prototype.hasOwnProperty.call(ICONS, name);
}

function svgMarkup(name: IconName, size?: number): string {
  const dims = size ? ` width="${size}" height="${size}"` : '';
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"${dims}>` +
    `<g stroke="${K}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round">${ICONS[name]}</g></svg>`
  );
}

/** DOM 用：内联 SVG 字符串（随文字大小缩放，见 .ic 样式） */
export function iconSvg(name: IconName, extraClass = ''): string {
  return svgMarkup(name).replace('<svg ', `<svg class="ic${extraClass ? ' ' + extraClass : ''}" aria-hidden="true" `);
}

const TOKEN = /\{i:([a-z]+)\}/g;

/** 兼容 Chrome 61：不用 String.prototype.matchAll */
function eachToken(text: string, fn: (name: string, index: number, length: number) => void): void {
  const re = new RegExp(TOKEN.source, 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) fn(m[1], m.index, m[0].length);
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);
}

/** DOM 用：转义文本并把 {i:名称} 换成图标 */
export function richHtml(text: string): string {
  let out = '';
  let last = 0;
  eachToken(text, (name, index, length) => {
    out += escapeHtml(text.slice(last, index));
    out += isIconName(name) ? iconSvg(name) : '';
    last = index + length;
  });
  return out + escapeHtml(text.slice(last));
}

/** 去掉图标标记，得到纯文字（用于 aria-label、分享文案等） */
export function plainText(text: string): string {
  return text.replace(TOKEN, '').trim();
}

/** 页面里 <i data-ic="名称"></i> 占位符 → 图标 */
export function hydrateIcons(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>('i[data-ic]').forEach((el) => {
    const name = el.dataset.ic ?? '';
    if (isIconName(name)) el.outerHTML = iconSvg(name);
  });
}

// ---------------- Canvas ----------------

const RASTER = 96;
const images = new Map<IconName, HTMLImageElement>();

function iconImage(name: IconName): HTMLImageElement | null {
  let img = images.get(name);
  if (!img) {
    if (typeof Image === 'undefined') return null;
    img = new Image(RASTER, RASTER);
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svgMarkup(name, RASTER));
    images.set(name, img);
  }
  return img.complete && img.naturalWidth > 0 ? img : null;
}

/** 启动时预加载全部图标，避免首次出现时闪一下 */
export function preloadIcons(): void {
  (Object.keys(ICONS) as IconName[]).forEach((n) => iconImage(n));
}

/** 直接在画布上画一个图标（中心对齐） */
export function drawIcon(ctx: CanvasRenderingContext2D, name: IconName, cx: number, cy: number, size: number): void {
  const img = iconImage(name);
  if (img) ctx.drawImage(img, cx - size / 2, cy - size / 2, size, size);
}

/** 画布用：测量含 {i:名称} 文字的宽度（图标按字号 1.35 倍计） */
export function measureRichText(ctx: CanvasRenderingContext2D, text: string): number {
  if (text.indexOf('{i:') === -1) return ctx.measureText(text).width;
  const fontPx = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 12);
  let icons = 0;
  eachToken(text, () => {
    icons++;
  });
  return ctx.measureText(plainText(text.replace(TOKEN, ''))).width + icons * fontPx * 1.35;
}

interface RichOpts {
  /** 是否先描边再填充（与现有贴纸字一致） */
  stroke?: boolean;
  maxWidth?: number;
}

/**
 * 画布用：绘制含 {i:名称} 的文字。沿用调用方当前的 font / fillStyle / strokeStyle / lineWidth /
 * textAlign / textBaseline，图标高度约为字号的 1.2 倍并与文字垂直居中。
 */
export function drawRichText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, opts: RichOpts = {}): void {
  if (text.indexOf('{i:') === -1) {
    if (opts.stroke) ctx.strokeText(text, x, y, opts.maxWidth);
    ctx.fillText(text, x, y, opts.maxWidth);
    return;
  }
  const fontPx = Number(/(\d+(?:\.\d+)?)px/.exec(ctx.font)?.[1] ?? 12);
  const iconSize = fontPx * 1.2;
  const gap = fontPx * 0.15;
  const parts: Array<{ icon?: IconName; text?: string; w: number }> = [];
  let last = 0;
  eachToken(text, (name, index, length) => {
    const seg = text.slice(last, index);
    if (seg) parts.push({ text: seg, w: ctx.measureText(seg).width });
    if (isIconName(name)) parts.push({ icon: name, w: iconSize + gap });
    last = index + length;
  });
  const tail = text.slice(last);
  if (tail) parts.push({ text: tail, w: ctx.measureText(tail).width });

  const total = parts.reduce((a, p) => a + p.w, 0);
  const align = ctx.textAlign;
  const baseline = ctx.textBaseline;
  let start = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
  // 图标的垂直中心：按文字基线换算
  const midY = baseline === 'middle' ? y : baseline === 'top' ? y + fontPx / 2 : baseline === 'bottom' ? y - fontPx / 2 : y - fontPx * 0.35;

  ctx.save();
  const squeeze = opts.maxWidth && total > opts.maxWidth ? opts.maxWidth / total : 1;
  if (squeeze < 1) {
    ctx.translate(x, 0);
    ctx.scale(squeeze, 1);
    ctx.translate(-x, 0);
    start = align === 'center' ? x - total / 2 : align === 'right' || align === 'end' ? x - total : x;
  }
  ctx.textAlign = 'left';
  for (const p of parts) {
    if (p.icon) {
      drawIcon(ctx, p.icon, start + iconSize / 2, midY, iconSize);
    } else if (p.text) {
      if (opts.stroke) ctx.strokeText(p.text, start, y);
      ctx.fillText(p.text, start, y);
    }
    start += p.w;
  }
  ctx.restore();
}
