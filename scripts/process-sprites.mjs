import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

// 原图目录可用 SPRITE_RAW_DIR 覆盖；默认读取 gen-sprites.mjs 的输出目录 art/raw
const ARTIFACT_DIR = path.resolve(process.env.SPRITE_RAW_DIR ?? 'art/raw');
const OUT_DIR = path.resolve('public/assets/sprites');
const PREVIEW_PATH = path.join(ARTIFACT_DIR, 'sprites_preview.png');

const MANIFEST = [
  { name: 'hero_slacker', src: 'hero_slacker_1795073989989.jpg', size: 256 },
  { name: 'hero_striker', src: 'hero_striker_v2_1795074012048.jpg', size: 256 },
  { name: 'hero_mech', src: 'hero_mech_v2_1795074014540.jpg', size: 256 },
  { name: 'enemy_zombie', src: 'enemy_zombie_1795073993226.jpg', size: 256 },
  { name: 'prop_crate', src: 'prop_crate_1795073998904.jpg', size: 256 },
  { name: 'enemy_mail_imp', src: 'enemy_mail_imp_1795074038174.jpg', size: 256 },
  { name: 'enemy_client_monster', src: 'enemy_client_monster_1795074041716.jpg', size: 256 },
  { name: 'enemy_ppt_golem', src: 'enemy_ppt_golem_1795074090208.jpg', size: 256 },
  { name: 'enemy_ddl_flame', src: 'enemy_ddl_flame_1795074040862.jpg', size: 256 },
  { name: 'boss_alarm', src: 'boss_alarm_1795074048025.jpg', size: 384 },
  { name: 'boss_projector', src: 'boss_projector.png', size: 384 },
  { name: 'boss_hydra', src: 'boss_hydra.png', size: 384 },
  { name: 'boss_server', src: 'boss_server.png', size: 384 },
  { name: 'boss_kpi', src: 'boss_kpi.png', size: 384 },
  // v1.0 角色：小队单位（背影）+ 选择界面半身像
  { name: 'hero_coder', src: 'hero_coder.png', size: 256 },
  { name: 'hero_designer', src: 'hero_designer.png', size: 256 },
  { name: 'hero_pm', src: 'hero_pm.png', size: 256 },
  { name: 'hero_sales', src: 'hero_sales.png', size: 256 },
  { name: 'hero_cleaner', src: 'hero_cleaner.png', size: 256 },
  { name: 'face_intern', src: 'face_intern.png', size: 192 },
  { name: 'face_coder', src: 'face_coder.png', size: 192 },
  { name: 'face_designer', src: 'face_designer.png', size: 192 },
  { name: 'face_pm', src: 'face_pm.png', size: 192 },
  { name: 'face_sales', src: 'face_sales.png', size: 192 },
  { name: 'face_cleaner', src: 'face_cleaner.png', size: 192 }
];

function getImageSize(filePath) {
  const stdout = execFileSync(
    'ffprobe',
    [
      '-v',
      'error',
      '-select_streams',
      'v:0',
      '-show_entries',
      'stream=width,height',
      '-of',
      'json',
      filePath
    ],
    { encoding: 'utf8' }
  );
  const parsed = JSON.parse(stdout);
  const stream = parsed.streams[0];
  return { width: stream.width, height: stream.height };
}

function decodeToRgba(filePath) {
  const { width, height } = getImageSize(filePath);
  const buf = execFileSync(
    'ffmpeg',
    ['-v', 'error', '-i', filePath, '-f', 'rawvideo', '-pix_fmt', 'rgba', 'pipe:1'],
    { maxBuffer: 128 * 1024 * 1024 }
  );
  return { width, height, data: new Uint8Array(buf) };
}

function sampleCornerBackground(data, width, height) {
  const samplesR = [];
  const samplesG = [];
  const samplesB = [];
  const patches = [
    [2, 2],
    [width - 6, 2],
    [2, height - 6],
    [width - 6, height - 6]
  ];
  for (const [px, py] of patches) {
    for (let dy = 0; dy < 4; dy++) {
      for (let dx = 0; dx < 4; dx++) {
        const x = Math.max(0, Math.min(width - 1, px + dx));
        const y = Math.max(0, Math.min(height - 1, py + dy));
        const idx = (y * width + x) * 4;
        samplesR.push(data[idx]);
        samplesG.push(data[idx + 1]);
        samplesB.push(data[idx + 2]);
      }
    }
  }
  samplesR.sort((a, b) => a - b);
  samplesG.sort((a, b) => a - b);
  samplesB.sort((a, b) => a - b);
  const mid = Math.floor(samplesR.length / 2);
  return [samplesR[mid], samplesG[mid], samplesB[mid]];
}

function rgbDist(r1, g1, b1, r2, g2, b2) {
  const dr = r1 - r2;
  const dg = g1 - g2;
  const db = b1 - b2;
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function removeBackground(rgba) {
  const { width, height, data } = rgba;
  const total = width * height;
  const [bgR, bgG, bgB] = sampleCornerBackground(data, width, height);
  const isGreenBg = bgG > bgR + 40 && bgG > bgB + 40;
  const isMagentaBg = !isGreenBg && bgR > bgG + 40 && bgB > bgG + 40;

  const isBg = new Uint8Array(total);
  const visited = new Uint8Array(total);
  const queue = new Int32Array(total);
  let head = 0;
  let tail = 0;

  const BG_THRESH = 84;

  const tryPush = (idx) => {
    if (visited[idx]) return;
    const p = idx * 4;
    const d = rgbDist(data[p], data[p + 1], data[p + 2], bgR, bgG, bgB);
    if (d <= BG_THRESH) {
      visited[idx] = 1;
      isBg[idx] = 1;
      queue[tail++] = idx;
    }
  };

  for (let x = 0; x < width; x++) {
    tryPush(x);
    tryPush((height - 1) * width + x);
  }
  for (let y = 0; y < height; y++) {
    tryPush(y * width);
    tryPush(y * width + (width - 1));
  }

  while (head < tail) {
    const cur = queue[head++];
    const cx = cur % width;
    const cy = (cur - cx) / width;

    if (cx > 0) tryPush(cur - 1);
    if (cx < width - 1) tryPush(cur + 1);
    if (cy > 0) tryPush(cur - width);
    if (cy < height - 1) tryPush(cur + width);
  }

  // 清除手臂/腿间被完全围住的纯背景色块
  for (let idx = 0; idx < total; idx++) {
    if (isBg[idx]) continue;
    const p = idx * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const d = rgbDist(r, g, b, bgR, bgG, bgB);
    if (isMagentaBg && d <= 54 && (r + b) * 0.5 - g > 95) {
      isBg[idx] = 1;
    } else if (isGreenBg && d <= 54 && g - Math.max(r, b) > 90) {
      isBg[idx] = 1;
    }
  }

  for (let idx = 0; idx < total; idx++) {
    if (isBg[idx]) {
      data[idx * 4 + 3] = 0;
    }
  }

  // 1px~2px 边缘羽化与溢色去除（Despill）
  const edgeMask = new Uint8Array(total);
  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      if (isBg[idx]) continue;
      if (
        isBg[idx - 1] ||
        isBg[idx + 1] ||
        isBg[idx - width] ||
        isBg[idx + width]
      ) {
        edgeMask[idx] = 1;
      }
    }
  }

  for (let idx = 0; idx < total; idx++) {
    if (!edgeMask[idx]) continue;
    const p = idx * 4;
    const r = data[p];
    const g = data[p + 1];
    const b = data[p + 2];
    const d = rgbDist(r, g, b, bgR, bgG, bgB);

    if (d < 130) {
      const t = Math.max(0, Math.min(1, (d - 60) / 70));
      data[p + 3] = Math.round(t * 255);
    }

    if (isMagentaBg && r > g && b > g) {
      const cap = g + 18;
      if (r > cap && b > cap) {
        data[p] = Math.min(r, cap);
        data[p + 2] = Math.min(b, cap);
      }
    } else if (isGreenBg && g > r && g > b) {
      const cap = Math.max(r, b) + 14;
      data[p + 1] = Math.min(g, cap);
    }
  }
}

function cropSquareAndScale(rgba, targetSize, outPath) {
  const { width, height, data } = rgba;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a > 12) {
        if (x < minX) minX = x;
        if (x > maxX) maxX = x;
        if (y < minY) minY = y;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < minX || maxY < minY) {
    throw new Error(`No foreground pixels found for ${outPath}`);
  }

  const bw = maxX - minX + 1;
  const bh = maxY - minY + 1;
  const side = Math.ceil(Math.max(bw, bh) * 1.1);
  const cx = Math.round((minX + maxX) * 0.5);
  const cy = Math.round((minY + maxY) * 0.5);
  const startX = cx - Math.floor(side / 2);
  const startY = cy - Math.floor(side / 2);

  const squareBuf = Buffer.alloc(side * side * 4);
  for (let sy = 0; sy < side; sy++) {
    const srcY = startY + sy;
    if (srcY < 0 || srcY >= height) continue;
    for (let sx = 0; sx < side; sx++) {
      const srcX = startX + sx;
      if (srcX < 0 || srcX >= width) continue;
      const srcIdx = (srcY * width + srcX) * 4;
      const dstIdx = (sy * side + sx) * 4;
      squareBuf[dstIdx] = data[srcIdx];
      squareBuf[dstIdx + 1] = data[srcIdx + 1];
      squareBuf[dstIdx + 2] = data[srcIdx + 2];
      squareBuf[dstIdx + 3] = data[srcIdx + 3];
    }
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${side}x${side}`,
      '-i',
      'pipe:0',
      '-vf',
      `scale=${targetSize}:${targetSize}:flags=lanczos`,
      '-y',
      outPath
    ],
    { input: squareBuf }
  );
}

function buildCheckerPreview(outPaths) {
  const cell = 200;
  const cols = 5;
  const rows = Math.max(2, Math.ceil(outPaths.length / cols));
  const W = cols * cell;
  const H = rows * cell;
  const canvas = Buffer.alloc(W * H * 4);

  // 棋盘格底纹方便肉眼看清任何白边/洋红边/绿边残留
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const idx = (y * W + x) * 4;
      const dark = ((x >> 4) + (y >> 4)) % 2 === 0;
      const v = dark ? 44 : 74;
      canvas[idx] = v;
      canvas[idx + 1] = v + 2;
      canvas[idx + 2] = v + 10;
      canvas[idx + 3] = 255;
    }
  }

  for (let i = 0; i < outPaths.length; i++) {
    const rawBuf = execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-i',
        outPaths[i],
        '-vf',
        `scale=${cell}:${cell}:flags=lanczos`,
        '-f',
        'rawvideo',
        '-pix_fmt',
        'rgba',
        'pipe:1'
      ],
      { maxBuffer: 16 * 1024 * 1024 }
    );
    const gx = (i % cols) * cell;
    const gy = Math.floor(i / cols) * cell;
    for (let y = 0; y < cell; y++) {
      for (let x = 0; x < cell; x++) {
        const sIdx = (y * cell + x) * 4;
        const a = rawBuf[sIdx + 3] / 255;
        if (a <= 0) continue;
        const dIdx = ((gy + y) * W + (gx + x)) * 4;
        canvas[dIdx] = Math.round(rawBuf[sIdx] * a + canvas[dIdx] * (1 - a));
        canvas[dIdx + 1] = Math.round(rawBuf[sIdx + 1] * a + canvas[dIdx + 1] * (1 - a));
        canvas[dIdx + 2] = Math.round(rawBuf[sIdx + 2] * a + canvas[dIdx + 2] * (1 - a));
      }
    }
  }

  fs.mkdirSync(path.dirname(PREVIEW_PATH), { recursive: true });
  execFileSync(
    'ffmpeg',
    [
      '-v',
      'error',
      '-f',
      'rawvideo',
      '-pix_fmt',
      'rgba',
      '-s',
      `${W}x${H}`,
      '-i',
      'pipe:0',
      '-y',
      PREVIEW_PATH
    ],
    { input: canvas }
  );
  console.log(`Preview collage written to ${PREVIEW_PATH}`);
}

export function processSingle(inPath, outPath, size) {
  const rgba = decodeToRgba(inPath);
  removeBackground(rgba);
  cropSquareAndScale(rgba, size, outPath);
}

const args = process.argv.slice(2);
if (args[0] === '--all') {
  const outPaths = [];
  for (const item of MANIFEST) {
    const inPath = path.join(ARTIFACT_DIR, item.src);
    const outPath = path.join(OUT_DIR, `${item.name}.png`);
    if (!fs.existsSync(inPath)) {
      console.warn(`Skip ${item.name}: raw sprite not found (${inPath})`);
      continue;
    }
    processSingle(inPath, outPath, item.size);
    outPaths.push(outPath);
    console.log(`Processed ${item.name}.png (${item.size}x${item.size})`);
  }
  buildCheckerPreview(outPaths);
} else if (args.length >= 2) {
  const size = Number(args[2] || 256);
  processSingle(args[0], args[1], size);
  console.log(`Processed ${args[1]} (${size}x${size})`);
}
