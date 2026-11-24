import { backfillXp } from '../data/ranks';
import type { CharacterId, GameSettings, SaveData, TalentId } from '../game/types';
import {
  CLIENT_VER_STORAGE,
  getBuildVersion,
  getClientVersion,
  getMiniToolApi,
  isClientVersionAtLeast
} from '../platform/MiniToolBridge';

/** 键名沿用 v3（容器存储里已有数据），版本号写在 data.version 里 */
const STORAGE_KEY = 'mbdf_save_v3';
export const SAVE_VERSION = 4;
const CHARACTER_IDS: CharacterId[] = ['intern', 'coder', 'designer', 'pm', 'sales', 'cleaner'];

function emptyOvertime(): Record<CharacterId, number> {
  return { intern: 0, coder: 0, designer: 0, pm: 0, sales: 0, cleaner: 0 };
}

export function defaultSettings(): GameSettings {
  return { musicVolume: 0.8, sfxVolume: 0.9, vibration: true, lowFx: false, colorblind: false };
}

function safeVol(v: unknown, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;
}

function parseSettings(raw: unknown): GameSettings {
  const d = defaultSettings();
  if (!raw || typeof raw !== 'object') return d;
  const r = raw as Partial<GameSettings>;
  return {
    musicVolume: safeVol(r.musicVolume, d.musicVolume),
    sfxVolume: safeVol(r.sfxVolume, d.sfxVolume),
    vibration: typeof r.vibration === 'boolean' ? r.vibration : d.vibration,
    lowFx: Boolean(r.lowFx),
    colorblind: Boolean(r.colorblind)
  };
}
const LEGACY_V2_KEY = 'mbdf_save_v2';
const LEGACY_V1_KEY = 'mbdf_save_v1';
const TALENT_IDS: TalentId[] = ['espresso', 'thick_skin', 'abacus', 'bonus'];

function genWorkerCode(): string {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    coffeeBeans: 0,
    bestSquad: 0,
    totalClears: 0,
    highestCleared: 0,
    endlessBestWave: 0,
    endlessBestScore: 0,
    unlockedBadges: [],
    workerCode: genWorkerCode(),
    talents: { espresso: 0, thick_skin: 0, abacus: 0, bonus: 0 },
    muted: false,
    tutorialDone: false,
    xp: 0,
    selectedCharacter: 'intern',
    bestKills: 0,
    settings: defaultSettings(),
    overtime: emptyOvertime(),
    overtimeSel: 0,
    codex: []
  };
}

function safeInt(v: unknown, min: number, max: number): number {
  return typeof v === 'number' && Number.isFinite(v)
    ? Math.min(max, Math.max(min, Math.floor(v)))
    : min;
}

export function parseSave(raw: string, fromV1: boolean): SaveData | null {
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

    const highestCleared = fromV1 ? (totalClears > 0 ? 1 : 0) : safeInt(parsed.highestCleared, 0, 11);
    const endlessBestWave = safeInt(parsed.endlessBestWave, 0, 999);
    const oldVersion = safeInt(parsed.version, 0, 99);
    // v3 及更早的存档没有经验：按历史进度一次性折算，老玩家直接解锁几个角色
    const xp = oldVersion >= 4 ? safeInt(parsed.xp, 0, 1e9) : backfillXp(highestCleared, totalClears, endlessBestWave);
    const selected = CHARACTER_IDS.indexOf(parsed.selectedCharacter as CharacterId) >= 0 ? (parsed.selectedCharacter as CharacterId) : 'intern';

    return {
      version: SAVE_VERSION,
      coffeeBeans: safeInt(parsed.coffeeBeans, 0, 1e9),
      bestSquad: safeInt(parsed.bestSquad, 0, 1e9),
      totalClears,
      highestCleared,
      endlessBestWave,
      endlessBestScore: safeInt(parsed.endlessBestScore, 0, 1e9),
      unlockedBadges: badges,
      workerCode,
      talents,
      muted: Boolean(parsed.muted),
      // 老存档没有这个字段：只要有任何游玩痕迹就视为老玩家，不再弹新手引导
      tutorialDone:
        Boolean(parsed.tutorialDone) ||
        totalClears > 0 ||
        safeInt(parsed.coffeeBeans, 0, 1e9) > 0 ||
        TALENT_IDS.some((id) => talents[id] > 0),
      xp,
      selectedCharacter: selected,
      bestKills: safeInt(parsed.bestKills, 0, 1e9),
      settings: parseSettings(parsed.settings),
      overtime: (() => {
        const o = emptyOvertime();
        const raw = (parsed.overtime ?? {}) as Partial<Record<CharacterId, number>>;
        for (const id of CHARACTER_IDS) o[id] = safeInt(raw[id], 0, 5);
        return o;
      })(),
      overtimeSel: safeInt(parsed.overtimeSel, 0, 5),
      codex: Array.isArray(parsed.codex)
        ? Array.from(new Set(parsed.codex.filter((x): x is string => typeof x === 'string'))).slice(0, 500)
        : []
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
