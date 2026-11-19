import type { SaveData } from '../game/types';

const STORAGE_KEY = 'mbdf_save_v1';

const DEFAULT_SAVE: SaveData = {
  version: 1,
  coffeeBeans: 0,
  bestSquad: 0,
  totalClears: 0,
  muted: false
};

export class SaveManager {
  static load(): SaveData {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) return { ...DEFAULT_SAVE };
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      return {
        version: 1,
        coffeeBeans:
          typeof parsed.coffeeBeans === 'number' && Number.isFinite(parsed.coffeeBeans)
            ? Math.max(0, Math.floor(parsed.coffeeBeans))
            : 0,
        bestSquad:
          typeof parsed.bestSquad === 'number' && Number.isFinite(parsed.bestSquad)
            ? Math.max(0, Math.floor(parsed.bestSquad))
            : 0,
        totalClears:
          typeof parsed.totalClears === 'number' && Number.isFinite(parsed.totalClears)
            ? Math.max(0, Math.floor(parsed.totalClears))
            : 0,
        muted: Boolean(parsed.muted)
      };
    } catch {
      return { ...DEFAULT_SAVE };
    }
  }

  static save(data: SaveData): void {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    } catch {
      // Safari 无痕模式或存储受限时静默忽略
    }
  }
}
