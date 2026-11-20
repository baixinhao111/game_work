export interface WindowRect {
  left?: number;
  top?: number;
  right?: number;
  bottom?: number;
  width?: number;
  height?: number;
}

export interface MiniToolWindowInfo {
  pixelRatio?: number;
  screenWidth?: number;
  screenHeight?: number;
  windowWidth?: number;
  windowHeight?: number;
  statusBarHeight?: number;
  safeArea?: WindowRect;
  gestureArea?: WindowRect;
  menuButtons?: {
    capsule?: WindowRect | null;
    back?: WindowRect | null;
    me?: WindowRect | null;
    share?: WindowRect | null;
  };
}

export interface MiniToolLaunchOptions {
  miniToolEnv?: {
    buildVersion?: number | string;
    userDataPath?: string;
    windowInfo?: MiniToolWindowInfo;
  };
}

export interface MiniToolApi {
  getLaunchOptions?: () => Promise<MiniToolLaunchOptions>;
  getStorage?: (opts: { key: string; encrypt?: boolean }) => Promise<{ data: string | null }>;
  setStorage?: (opts: { key: string; data: string; encrypt?: boolean }) => Promise<{ errMsg?: string }>;
  removeStorage?: (opts: { key: string }) => Promise<{ errMsg?: string }>;
  writeTempFile?: (opts: { data: string }) => Promise<{ filePath: string }>;
  saveImageToPhotosAlbum?: (opts: { filePath: string }) => Promise<{ errMsg?: string }>;
  vibrateShort?: (opts: { type: 'light' | 'medium' | 'heavy' }) => Promise<{ errMsg?: string }>;
  vibrateLong?: () => Promise<{ errMsg?: string }>;
  getWindowInfo?: () => Promise<MiniToolWindowInfo>;
}

interface XhsGlobal {
  launchOptions?: MiniToolLaunchOptions;
  miniTool?: MiniToolApi;
}

export type VibrateIntensity = 'light' | 'medium' | 'heavy' | 'long';

const CLIENT_VER_STORAGE = 9460;
const CLIENT_VER_WINDOW = 9490;
const CLIENT_VER_VIBRATE = 9500;
const CLIENT_VER_ALBUM = 9420;

let cachedBuildVersion: number | null = null;
let pendingBuildVersionPromise: Promise<number | null> | null = null;
let lastVibrateMs = -1000;

export function getXhsGlobal(): XhsGlobal | undefined {
  if (typeof window === 'undefined') return undefined;
  return (window as unknown as { xhs?: XhsGlobal }).xhs;
}

export function getMiniToolApi(): MiniToolApi | undefined {
  const xhs = getXhsGlobal();
  return xhs && xhs.miniTool;
}

/**
 * 解析并校验客户端 buildVersion（例如 9462004 -> 合法 7+ 位正整数）
 */
export function readBuildVersion(launchOptions?: MiniToolLaunchOptions | null): number | null {
  const miniToolEnv = launchOptions && launchOptions.miniToolEnv;
  const value = miniToolEnv && miniToolEnv.buildVersion;
  if (typeof value !== 'number' && typeof value !== 'string') return null;
  if (!/^[1-9]\d{6,}$/.test(String(value))) return null;
  const version = Number(value);
  return Number.isSafeInteger(version) ? version : null;
}

/** 忽略末 3 位编译序号，换算客户端主版本号（如 9462004 -> 9462） */
export function getClientVersion(buildVersion: number | null): number | null {
  return buildVersion !== null && Number.isSafeInteger(buildVersion) && buildVersion > 0
    ? Math.floor(buildVersion / 1000)
    : null;
}

export function isClientVersionAtLeast(buildVersion: number | null, minClientVersion: number): boolean {
  const clientVersion = getClientVersion(buildVersion);
  return clientVersion !== null && clientVersion >= minClientVersion;
}

export function getCachedBuildVersion(): number | null {
  if (cachedBuildVersion !== null) return cachedBuildVersion;
  const xhs = getXhsGlobal();
  const syncVer = readBuildVersion(xhs && xhs.launchOptions);
  if (syncVer !== null) {
    cachedBuildVersion = syncVer;
  }
  return cachedBuildVersion;
}

export async function getBuildVersion(): Promise<number | null> {
  const syncVer = getCachedBuildVersion();
  if (syncVer !== null) return syncVer;
  if (pendingBuildVersionPromise) return pendingBuildVersionPromise;

  const miniTool = getMiniToolApi();
  if (!miniTool || typeof miniTool.getLaunchOptions !== 'function') {
    return null;
  }

  pendingBuildVersionPromise = miniTool
    .getLaunchOptions()
    .then((opts) => {
      const ver = readBuildVersion(opts);
      if (ver !== null) {
        cachedBuildVersion = ver;
      }
      return ver;
    })
    .catch(() => null)
    .then((res) => {
      pendingBuildVersionPromise = null;
      return res;
    });

  return pendingBuildVersionPromise;
}

export { CLIENT_VER_STORAGE };

/** 触发小红书容器原生触感反馈（9.50+），非容器或低版本静默忽略，绝不使用 navigator.vibrate */
export function triggerMiniToolVibrate(intensity: VibrateIntensity): void {
  const now = typeof performance !== 'undefined' && typeof performance.now === 'function'
    ? performance.now()
    : Date.now();
  if (now - lastVibrateMs < 80) return;

  const ver = getCachedBuildVersion();
  if (ver === null) {
    void getBuildVersion();
    return;
  }
  if (!isClientVersionAtLeast(ver, CLIENT_VER_VIBRATE)) return;

  const miniTool = getMiniToolApi();
  if (!miniTool) return;

  lastVibrateMs = now;
  try {
    if (intensity === 'long') {
      if (typeof miniTool.vibrateLong === 'function') {
        void miniTool.vibrateLong().catch(() => {});
      }
    } else if (typeof miniTool.vibrateShort === 'function') {
      void miniTool.vibrateShort({ type: intensity }).catch(() => {});
    }
  } catch {
    // 忽略低版本或异步环境异常
  }
}

/** 将生成的 Canvas PNG 保存到系统相册（9.42+，优先经 writeTempFile 落临时文件） */
export async function saveImageToAlbum(dataUrl: string): Promise<{ ok: boolean; message: string }> {
  if (!dataUrl || typeof dataUrl !== 'string') {
    return { ok: false, message: '战报图片尚未生成，请先点击生成战报。' };
  }

  const ver = await getBuildVersion();
  const miniTool = getMiniToolApi();
  if (
    !isClientVersionAtLeast(ver, CLIENT_VER_ALBUM) ||
    !miniTool ||
    typeof miniTool.saveImageToPhotosAlbum !== 'function'
  ) {
    return {
      ok: false,
      message: '请长按上方战报图片保存（或升级至小红书 App 9.42+ 后一键存相册）'
    };
  }

  let filePath = dataUrl;
  if (typeof miniTool.writeTempFile === 'function') {
    try {
      const tempRes = await miniTool.writeTempFile({ data: dataUrl });
      if (tempRes && typeof tempRes.filePath === 'string' && tempRes.filePath.length > 0) {
        filePath = tempRes.filePath;
      }
    } catch {
      // writeTempFile 失败时降级直传 dataUrl，交由相册接口兜底判定
    }
  }

  try {
    const res = await miniTool.saveImageToPhotosAlbum({ filePath });
    if (res && res.errMsg && res.errMsg.indexOf(':ok') !== -1) {
      return { ok: true, message: '已保存到系统相册！快去发小红书晒战报吧' };
    }
    return { ok: false, message: '未完成保存，可长按上方战报图片手动保存' };
  } catch {
    return { ok: false, message: '相册授权未开启或保存失败，可长按上方图片保存' };
  }
}

function isVisibleRect(rect?: WindowRect | null): rect is WindowRect {
  return Boolean(rect && typeof rect.width === 'number' && typeof rect.height === 'number' && rect.width > 0 && rect.height > 0);
}

function applyWindowInfoMetrics(info?: MiniToolWindowInfo | null): void {
  if (!info || typeof document === 'undefined') return;
  const root = document.documentElement;
  const menuButtons = info.menuButtons || {};
  const capsule = menuButtons.capsule;
  const rects: WindowRect[] = isVisibleRect(capsule)
    ? [capsule]
    : [menuButtons.back, menuButtons.me, menuButtons.share].filter(isVisibleRect);

  const safeTop = info.safeArea && typeof info.safeArea.top === 'number' ? info.safeArea.top : 0;
  let contentTop = safeTop;
  for (let i = 0; i < rects.length; i++) {
    const bottom = rects[i].bottom;
    if (typeof bottom === 'number' && bottom > contentTop) {
      contentTop = bottom;
    }
  }

  if (contentTop > 0) {
    root.style.setProperty('--content-top', `${Math.round(contentTop) + 8}px`);
  }

  if (
    info.safeArea &&
    typeof info.safeArea.bottom === 'number' &&
    typeof info.windowHeight === 'number' &&
    info.windowHeight > 0
  ) {
    const safeBottom = Math.max(0, Math.round(info.windowHeight - info.safeArea.bottom));
    root.style.setProperty('--safe-area-inset-bottom', `${safeBottom}px`);
  }
}

/** 同步/异步读取容器窗口信息与胶囊按钮位置，避免顶部 HUD 被胶囊遮挡 */
export async function applyWindowAvoidance(): Promise<void> {
  const xhs = getXhsGlobal();
  const syncWindowInfo = xhs && xhs.launchOptions && xhs.launchOptions.miniToolEnv && xhs.launchOptions.miniToolEnv.windowInfo;
  if (syncWindowInfo) {
    applyWindowInfoMetrics(syncWindowInfo);
  }

  const ver = await getBuildVersion();
  const miniTool = getMiniToolApi();
  if (!isClientVersionAtLeast(ver, CLIENT_VER_WINDOW) || !miniTool || typeof miniTool.getWindowInfo !== 'function') {
    return;
  }

  try {
    const info = await miniTool.getWindowInfo();
    applyWindowInfoMetrics(info);
  } catch {
    // 保留安全区默认内边距
  }
}
