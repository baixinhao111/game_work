/**
 * 程序化芯片音乐曲谱。所有音高为 MIDI 编号（60 = C4）。
 * 一小节 16 步（16 分音符）。layer 0~3 由 MusicEngine 按战况逐层叠加：
 *   0 贝斯 + 踩镲 · 1 底鼓 + 军鼓 · 2 琶音 · 3 主旋律
 */

export type ThemeId = 'menu' | 'stage' | 'boss';

export interface ChordDef {
  /** 贝斯根音（低八度） */
  bass: number;
  /** 琶音用和弦音（中音区，由低到高） */
  tones: number[];
}

/** 旋律音符：[小节内起始步, 音高, 时值步数] */
export type LeadNote = [number, number, number];

export interface SongDef {
  bpm: number;
  chords: ChordDef[];
  /** 每小节一组旋律；长度与 chords 相同 */
  lead: LeadNote[][];
  /** 贝斯节奏：每步相对根音的半音偏移，null 为休止 */
  bassPattern: Array<number | null>;
  /** 琶音取和弦音的顺序（下标超过和弦音数时自动升八度） */
  arpPattern: number[];
  /** 琶音每隔几步发声（1 = 16 分，2 = 8 分） */
  arpEvery: number;
  kick: string;
  snare: string;
  hat: string;
  /** 主旋律 / 琶音 / 贝斯 音色 */
  leadWave: OscillatorType;
  arpWave: OscillatorType;
  bassWave: OscillatorType;
}

const A2 = 45;
const F2 = 41;
const C3 = 48;
const G2 = 43;

/** 关卡主题《打卡进行曲》：A 小调 Am–F–C–G，后四小节旋律升高进入「下班冲刺」 */
const STAGE: SongDef = {
  bpm: 140,
  chords: [
    { bass: A2, tones: [57, 60, 64] },
    { bass: F2, tones: [57, 60, 65] },
    { bass: C3, tones: [55, 60, 64] },
    { bass: G2, tones: [55, 59, 62] },
    { bass: A2, tones: [57, 60, 64] },
    { bass: F2, tones: [57, 60, 65] },
    { bass: C3, tones: [55, 60, 64] },
    { bass: G2, tones: [55, 59, 62] }
  ],
  lead: [
    [[0, 69, 2], [2, 72, 2], [4, 76, 2], [6, 81, 4], [10, 79, 2], [12, 76, 4]],
    [[0, 77, 2], [2, 76, 2], [4, 72, 4], [8, 69, 2], [10, 72, 2], [12, 74, 4]],
    [[0, 76, 2], [2, 79, 2], [4, 76, 2], [6, 72, 2], [8, 79, 3], [11, 81, 1], [12, 79, 4]],
    [[0, 74, 2], [2, 71, 2], [4, 67, 4], [8, 71, 2], [10, 74, 2], [12, 76, 4]],
    [[0, 81, 2], [2, 81, 1], [3, 79, 1], [4, 81, 2], [6, 84, 2], [8, 83, 2], [10, 81, 2], [12, 76, 4]],
    [[0, 77, 2], [2, 81, 2], [4, 84, 4], [8, 81, 2], [10, 77, 2], [12, 81, 4]],
    [[0, 79, 2], [2, 76, 2], [4, 79, 2], [6, 84, 2], [8, 83, 2], [10, 79, 2], [12, 76, 4]],
    [[0, 74, 2], [2, 79, 2], [4, 83, 2], [6, 86, 2], [8, 83, 1], [9, 81, 1], [10, 79, 2], [12, 76, 2], [14, 74, 2]]
  ],
  bassPattern: [0, null, 0, null, 12, null, 0, null, 0, null, 0, null, 12, null, 7, null],
  arpPattern: [0, 1, 2, 3, 2, 1, 0, 1, 2, 3, 2, 1, 0, 1, 2, 3],
  arpEvery: 1,
  kick: 'x...x...x...x...',
  snare: '....x.......x...',
  hat: '..x...x...x...x.',
  leadWave: 'square',
  arpWave: 'square',
  bassWave: 'triangle'
};

/** Boss 主题《红温警报》：E 小调 Em–C–D–B，B 大三和弦制造紧张，16 分贝斯推进 */
const BOSS: SongDef = {
  bpm: 158,
  chords: [
    { bass: 40, tones: [64, 67, 71] },
    { bass: 36, tones: [64, 67, 72] },
    { bass: 38, tones: [62, 66, 69] },
    { bass: 35, tones: [63, 66, 71] },
    { bass: 40, tones: [64, 67, 71] },
    { bass: 36, tones: [64, 67, 72] },
    { bass: 38, tones: [62, 66, 69] },
    { bass: 35, tones: [63, 66, 71] }
  ],
  lead: [
    [[0, 76, 3], [3, 79, 3], [6, 83, 2], [8, 81, 2], [10, 79, 2], [12, 78, 2], [14, 79, 2]],
    [[0, 76, 3], [3, 79, 3], [6, 84, 2], [8, 83, 2], [10, 79, 2], [12, 76, 4]],
    [[0, 78, 3], [3, 81, 3], [6, 86, 2], [8, 84, 2], [10, 81, 2], [12, 78, 4]],
    [[0, 87, 2], [2, 83, 2], [4, 78, 2], [6, 75, 2], [8, 71, 4], [12, 83, 1], [13, 84, 1], [14, 83, 1], [15, 84, 1]],
    [[0, 76, 3], [3, 79, 3], [6, 83, 2], [8, 81, 2], [10, 79, 2], [12, 78, 2], [14, 79, 2]],
    [[0, 76, 3], [3, 79, 3], [6, 84, 2], [8, 83, 2], [10, 79, 2], [12, 76, 4]],
    [[0, 78, 3], [3, 81, 3], [6, 86, 2], [8, 84, 2], [10, 81, 2], [12, 78, 4]],
    [[0, 76, 2], [2, 78, 2], [4, 79, 2], [6, 81, 2], [8, 83, 8]]
  ],
  bassPattern: [0, 0, 12, 0, 0, 0, 12, 0, 0, 0, 12, 0, 0, 12, 0, 12],
  arpPattern: [0, 1, 2, 1, 3, 2, 1, 2, 0, 1, 2, 1, 3, 2, 4, 3],
  arpEvery: 1,
  kick: 'x...x...x...x.x.',
  snare: '....x.......x...',
  hat: 'xxxxxxxxxxxxxxxx',
  leadWave: 'sawtooth',
  arpWave: 'square',
  bassWave: 'square'
};

/** 菜单主题《工位待机》：Lo-fi 七和弦下行 Fmaj7–Em7–Dm7–Cmaj7 */
const MENU: SongDef = {
  bpm: 104,
  chords: [
    { bass: 41, tones: [57, 60, 64] },
    { bass: 40, tones: [55, 59, 62] },
    { bass: 38, tones: [53, 57, 60] },
    { bass: 36, tones: [52, 55, 59] }
  ],
  lead: [
    [[0, 69, 4], [4, 72, 2], [6, 76, 6], [12, 74, 4]],
    [[0, 71, 4], [4, 74, 2], [6, 76, 8]],
    [[0, 69, 4], [4, 65, 2], [6, 69, 2], [8, 72, 8]],
    [[0, 67, 6], [6, 64, 2], [8, 67, 8]]
  ],
  bassPattern: [0, null, null, null, null, null, 7, null, 0, null, null, null, null, null, null, null],
  arpPattern: [0, 1, 2, 3, 2, 1, 2, 3],
  arpEvery: 2,
  kick: 'x.......x.......',
  snare: '............x...',
  hat: '..x...x...x...x.',
  leadWave: 'triangle',
  arpWave: 'triangle',
  bassWave: 'triangle'
};

export const SONGS: Record<ThemeId, SongDef> = { menu: MENU, stage: STAGE, boss: BOSS };

/** 每天换个调，五关听起来不重样（半音数） */
export const DAY_TRANSPOSE = [0, 2, -2, 3, 5];
