import type { SaveData, TalentId } from '../game/types';
import {
  CLIENT_VER_STORAGE,
  getBuildVersion,
  getClientVersion,
  getMiniToolApi,
  isClientVersionAtLeast
} from '../platform/MiniToolBridge';

const STORAGE_KEY = 'mbdf_save_v3';
const LEGACY_V2_KEY = 'mbdf_save_v2';
const LEGACY_V1_KEY = 'mbdf_save_v1';
const TALENT_IDS: TalentId[] = ['espresso', 'thick_skin', 'abacus', 'bonus'];

function genWorkerCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function defaultSave(): SaveData {
  return {
    version: 3,
    coffeeBeans: 0,
    bestSquad: 0,
    totalClears: 0,
    highestCleared: 0,
    endlessBestWave: 0,
    endlessBestScore: 0,
    unlockedBadges: [],
    workerCode: genWorkerCode(),
    talents: { espresso: 0, thick_skin: 0, abacus: 0, bonus: 0 },
    muted: false
  };
}

function safeInt(v: unknown, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.floor(v)))
    : min;
}

function parseSave(raw: string, fromV1: boolean): SaveData | null {
  try {
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const talents = defaultSave().talents;
    for (const id of TALENT_IDS) {
      talents[id] = safeInt(parsed.talents && parsed.talents[id], 0, 10);
    }
    const totalClears = safeInt(parsed.totalClears, 0, 1e9);
    const badges = Array.isArray(parsed.unlockedBadges)
      ? Array.from(new Set(parsed.unlockedBadges.filter((x): x is string => typeof x === 'string')))
      : [];
    const workerCode =
      typeof parsed.workerCode === 'string' && /^\d{4}$/.test(parsed.workerCode)
        ? parsed.workerCode
        : genWorkerCode();

    return {
      version: 3,
      coffeeBeans: safeInt(parsed.coffeeBeans, 0, 1e9),
      bestSquad: safeInt(parsed.bestSquad, 0, 1e9),
      totalClears,
      highestCleared: fromV1 ? (totalClears > 0 ? 1 : 0) : safeInt(parsed.highestCleared, 0, 5),
      endlessBestWave: safeInt(parsed.endlessBestWave, 0, 999),
      endlessBestScore: safeInt(parsed.endlessBestScore, 0, 1e9),
      unlockedBadges: badges,
      workerCode,
      talents,
      muted: Boolean(parsed.muted)
    };
  } catch {
    return null;
  }
}

/** 仅在老版本迁移时一次性读取历史 localStorage 存档，读取成功并核对后删除旧键 */
function readLegacyBrowserSave(): { data: SaveData; keys: string[] } | null {
  try {
    if (typeof window === 'undefined' || !window.localStorage) return null;
    const keysFound: string[] = [];
    let raw = window.localStorage.getItem(STORAGE_KEY);
    let fromV1 = false;
    if (raw) {
      keysFound.push(STORAGE_KEY);
    } else {
      raw = window.localStorage.getItem(LEGACY_V2_KEY);
      if (raw) {
        keysFound.push(LEGACY_V2_KEY);
      } else {
        raw = window.localStorage.getItem(LEGACY_V1_KEY);
        if (raw) {
          fromV1 = true;
          keysFound.push(LEGACY_V1_KEY);
        }
      }
    }
    if (!raw) return null;
    const data = parseSave(raw, fromV1);
    if (!data) return null;
    return { data, keys: keysFound };
  } catch {
    return null;
  }
}

export class SaveManager {
  /** 同步首帧默认存档；版本未知时不提前读取浏览器 localStorage，待 hydrate() 按容器版本异步水合 */
  static load(): SaveData {
    return defaultSave();
  }

  /**
   * 严格按在线文档 §2.4 & §3.7 读取持久化存档：
   * - Path A（客户端 >= 9.46.0 且 Storage 可用）：使用 miniTool.getStorage / setStorage（含一次性旧数据迁移核验）；
   * - Path B（明确取得有效版本号且 < 9.46.0）：老版本兼容读取 localStorage；
   * - Path C（版本未知、缺 SDK/方法或调用失败）：不回退浏览器存储，安全保留默认内存存档。
   */
  static async hydrate(): Promise<{ data: SaveData; loaded: boolean }> {
    const buildVersion = await getBuildVersion();
    const clientVersion = getClientVersion(buildVersion);
    const miniTool = getMiniToolApi();

    // Path A: 客户端 9.46.0+ 容器 Storage
    if (
      isClientVersionAtLeast(buildVersion, CLIENT_VER_STORAGE) &&
      miniTool &&
      typeof miniTool.getStorage === 'function' &&
      typeof miniTool.setStorage === 'function'
    ) {
      try {
        const res = await miniTool.getStorage({ key: STORAGE_KEY });
        if (res && typeof res.data === 'string' && res.data.length > 0) {
          const parsed = parseSave(res.data, false);
          if (parsed) return { data: parsed, loaded: true };
          return { data: defaultSave(), loaded: false };
        }

        // 容器尚无数据时，尝试一次性迁移旧版浏览器存储
        const legacy = readLegacyBrowserSave();
        if (legacy) {
          const serialized = JSON.stringify(legacy.data);
          const writeRes = await miniTool.setStorage({ key: STORAGE_KEY, data: serialized });
          if (writeRes && writeRes.errMsg === 'setStorage:ok') {
            const verifyRes = await miniTool.getStorage({ key: STORAGE_KEY });
            if (verifyRes && verifyRes.data === serialized) {
              try {
                for (let i = 0; i < legacy.keys.length; i++) {
                  window.localStorage.removeItem(legacy.keys[i]);
                }
              } catch {
                // 清理失败不影响已迁移成功的容器存储
              }
              return { data: legacy.data, loaded: true };
            }
          }
          return { data: legacy.data, loaded: false };
        }

        return { data: defaultSave(), loaded: true };
      } catch {
        return { data: defaultSave(), loaded: false };
      }
    }

    // Path B: 明确确认属于 < 9.46.0 的老版本客户端兼容分支
    if (clientVersion !== null && clientVersion < CLIENT_VER_STORAGE) {
      const legacy = readLegacyBrowserSave();
      if (legacy) return { data: legacy.data, loaded: true };
      return { data: defaultSave(), loaded: false };
    }

    // Path C: 版本未知 / 非容器预览 / SDK 缺失 —— 不触碰 localStorage
    return { data: defaultSave(), loaded: false };
  }

  static async save(data: SaveData): Promise<boolean> {
    let serialized: string;
    try {
      serialized = JSON.stringify(data);
    } catch {
      return false;
    }

    const buildVersion = await getBuildVersion();
    const clientVersion = getClientVersion(buildVersion);
    const miniTool = getMiniToolApi();

    if (
      isClientVersionAtLeast(buildVersion, CLIENT_VER_STORAGE) &&
      miniTool &&
      typeof miniTool.setStorage === 'function'
    ) {
      try {
        const res = await miniTool.setStorage({ key: STORAGE_KEY, data: serialized });
        return Boolean(res && res.errMsg === 'setStorage:ok');
      } catch {
        return false;
      }
    }

    if (clientVersion !== null && clientVersion < CLIENT_VER_STORAGE) {
      try {
        if (typeof window !== 'undefined' && window.localStorage) {
          window.localStorage.setItem(STORAGE_KEY, serialized);
          return true;
        }
      } catch {
        return false;
      }
    }

    return false;
  }
}
