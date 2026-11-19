# 03 - 移动端网页版技术架构与工程规范

> **文档目的**：确立《周一突围：DDL 战线》针对手机浏览器的前端工程架构、视口适配、触控与碰撞算法、零 GC 性能架构、模块边界及兼容测试规范，保证研发阶段严格做到 60fps 流畅运行且极易维护扩展。

---

## 1. 技术栈选型与工程权衡

### 1.1 最终选型方案
**Vite + TypeScript + 原生 HTML5 Canvas 2D + Web Audio API + 轻量原生 HTML/CSS UI 覆层**

### 1.2 核心技术权衡依据

| 候选技术方案 | 放弃或采用决策 | 核心工程权衡理由 |
| :--- | :---: | :--- |
| **原生 HTML5 Canvas 2D** | ✅ **采用** | 针对“荧光便签 + 粗描边涂鸦”2D 矢量美学，Canvas 2D 配合离屏缓存比 WebGL/Three.js 开发快 3 倍，包体极轻，几乎无 WebGL 上下文丢失（Context Lost）与低端机 Shader 编译卡顿风险 |
| **Three.js / Babylon.js** | ❌ 放弃 | 引擎本身 gzip 后即超 150KB–300KB，对 H5 手机网页首屏秒开不友好；且 3D 美术生产管线成本高，与本项目波普平面手账风格不契合 |
| **Phaser / PixiJS** | ❌ 放弃 | 引入通用引擎会带入大量用不上的物理/场景树开销；而跑酷射击属于极度规则的纵深循环，手写 `2,000` 行内精简固定步长循环 + 对象池可控性极高，且整包体积可压到 **< 80KB gzip** |
| **React / Vue UI 框架** | ❌ 放弃 | 游戏内高频倒计时、血条与人数跳动直接绘在 Canvas 或由极轻量的原生 DOM 事件绑定控制，避免虚拟 DOM Diff 在 60fps 循环中产生额外 GC 与帧抖动 |
| **TypeScript + Vite** | ✅ **采用** | 提供严格的类型安全保障（关卡配置 Schema、词条状态机、对象池泛型约束），Vite 构建极快且支持内联/极简分包与局域网真机扫码调试 |

---

## 2. 移动端视口、高分屏与响应式适配规范

手机浏览器（尤其是 iOS Safari、Android Chrome 与微信内置浏览器）存在动态地址栏伸缩、刘海屏遮挡、高 DPR 过载与双指缩放干扰。工程层必须严格落实以下规范：

### 2.1 逻辑设计坐标系与宽屏兼容
- **标准逻辑分辨率**：`DESIGN_WIDTH = 390`，`DESIGN_HEIGHT = 844`（对齐主流移动设备 9:19.5 竖屏比例）。
- **核心可玩安全区**：跑道与全部关键战斗判定限制在逻辑坐标中间 `390 × 700` 区域内，顶部保留 `68px`（避让刘海与嘴替横幅/进度条），底部保留 `76px`（大招按钮与手指盲拖手势热区，防止大拇指遮挡主角）。
- **自适应缩放策略**：
  - 手机竖屏下：以 `Math.min(vw / DESIGN_WIDTH, vh / DESIGN_HEIGHT)` 等比缩放居中填充，周边露白处使用与跑道外侧统一的深炭背景 `#181A24` 自然衔接，视觉无黑边割裂感。
  - PC 桌面/平板宽屏下：自动居中渲染一个带微弱边框的竖屏手机画幅容器（最大高度占满视口），同时支持**鼠标左键拖拽**与键盘 `A/D`、`←/→`、`Space`（放大招）直接试玩调试。

### 2.2 高分屏 DPR 封顶与 CSS 锁定
- **DPR 封顶规则**：部分高端手机 `window.devicePixelRatio` 高达 `3` 或 `4`，直接乘算会导致 Canvas 像素填充面积暴涨 9–16 倍并引发手机发热降频。必须强制封顶：
  ```ts
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  ```
- **HTML Meta 与 CSS 硬锁定**：
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  ```
  ```css
  html, body {
    margin: 0;
    padding: 0;
    width: 100%;
    height: 100vh;
    height: 100dvh;
    height: var(--app-height, 100dvh); /* JS 兜底兼容老旧微信内核 */
    overflow: hidden;
    background-color: #181A24;
    touch-action: none;
    overscroll-behavior: none;
    -webkit-user-select: none;
    user-select: none;
    -webkit-touch-callout: none;
  }
  ```
- **安全区（Safe Area）与防橡皮筋滚动**：
  - 所有 HTML HUD 覆层（暂停按钮、右下角大招按钮、顶栏进度条）均应用 `padding-top: env(safe-area-inset-top)` 与 `padding-bottom: env(safe-area-inset-bottom)`，外部容器设 `pointer-events: none`，仅可点击按钮设 `pointer-events: auto`。
  - 监听 `window.addEventListener('resize', syncViewport)` 同步 `--app-height = ${window.innerHeight}px`，并全局在游戏进行态拦截非交互面板外的 `touchmove`（`{ passive: false }` 调用 `e.preventDefault()`），彻底根除 iOS/微信下拉露出“网页由 xx 提供”网页橡皮筋效应。

---

## 3. 触控手感与防误触碰撞工程设计

### 3.1 相对位移拖拽（Relative Delta Drag）
传统休闲网页常犯的错误是让角色“瞬移到手指 X 坐标”，这会导致手指挡住主角、点下瞬间人物闪现撞门。本项目采用**相对位移映射**：
- **单指针追踪锁定**：记录首个按下的 `activePointerId = e.pointerId`，忽略第二根手指意外碰触屏幕，直到对应的 `pointerup` / `pointercancel` 释放。
- **拖拽计算公式**：
  $$\Delta x_{\text{logical}} = \frac{(x_{\text{curr}} - x_{\text{prev}})_{\text{client}}}{\text{renderScale}} \times S_{\text{sens}}$$
  $$X_{\text{target}} = \text{clamp}\left(X_{\text{target}} + \Delta x_{\text{logical}},\ X_{\text{min}},\ X_{\text{max}}\right)$$
  - 灵敏度系数 $S_{\text{sens}} = 1.25$：确保单手大拇指在窄屏上只需小幅度横向滑动即可覆盖跑道全宽。
  - 平滑追随插值：实际领队坐标每固定步按 $X_{\text{lead}} \leftarrow X_{\text{lead}} + (X_{\text{target}} - X_{\text{lead}}) \times \min(1, 28 \cdot \Delta t)$ 极速收敛，消除快速甩手时的像素跳跃感同时保持零粘滞延迟。

### 3.2 解决品类顽疾：领队锚点 + 同排双门互斥锁
直接回应《01 号调研报告》中的**边缘刮蹭误判（Collateral Error）**痛点：
1. **单一领队碰撞锚点（Single Leader Anchor）**：
   - 全队 100 名小人的数字门触发判定与障碍柱碰撞判定，**仅检测领队中心点 $X_{\text{lead}}$ 附近半径 $R_{\text{core}} = 10\text{px}$ 的小胶囊体**。
   - 外围跟随小人在视觉上会弹性绕开跑道边界，哪怕外围小人的手肘擦到旁边红门边缘，只要领队核心没跨入，**绝不触发扣血**，赋予玩家极佳的宽容度与心理公平感。
2. **同排门组互斥锁（Gate Pair Mutex Lock）**：
   - 关卡数据中处于同一纵深 `rowY` 的左右两扇门共享同一个 `pairGroupId`（如 `"row_04"`）。
   - 游戏维护一个轻量集合 `triggeredPairIds`（或门实例 `pairLocked` 布尔标记）：一旦领队穿过任意一扇门，立即将该 `pairGroupId` 下所有兄弟门设为 `locked = true` 并伴随轻微灰暗退场动画，**从算法底层保证 100% 不可能在同一排“同时吃两扇门”或穿门边缘重复结算**。
3. **高效弹幕碰撞检测**：
   - 子弹与怪物/空投桶/门全部使用轻量 2D 圆-矩形或圆-圆平方距离检测（避免每帧开方 `Math.sqrt`）。
   - 若同屏敌人 $> 60$ 个，按跑道纵向 $Y$ 轴每 `80px` 分桶裁剪（Spatial Y-Bucketing），将单帧碰撞检测次数稳定控制在 `< 1,500` 次纯整数/浮点乘法以内。

---

## 4. 游戏主循环与内存零 GC 架构

### 4.1 固定时间步长循环与切后台保护
```ts
const FIXED_DT = 1 / 60; // 16.6667ms
let accumulator = 0;
let lastTimestamp = 0;

function tick(now: number) {
  if (!lastTimestamp) lastTimestamp = now;
  let frameTime = (now - lastTimestamp) / 1000;
  lastTimestamp = now;

  // 防止切后台或电话打断后 frameTime 爆炸导致“螺旋死亡”
  if (frameTime > 0.1) frameTime = 0.1;

  if (gameState.phase === 'PLAYING') {
    accumulator += frameTime;
    while (accumulator >= FIXED_DT) {
      stepSimulation(FIXED_DT);
      accumulator -= FIXED_DT;
    }
  }

  renderScene(ctx, accumulator / FIXED_DT);
  rafId = requestAnimationFrame(tick);
}
```
- 监听 `document.addEventListener('visibilitychange', ...)`：当手机锁屏、切回微信聊天或接听电话时，自动进入 `PAUSED` 状态并挂起 `AudioContext`，切回后不直接突然死亡。

### 4.2 泛型对象池（零热路径 Garbage Collection）
在 `60fps` 运转过程中，严禁在子弹发射、怪物生成、粒子喷溅、飘字弹出时执行 `new Object()` 或高频 `.splice()`，否则几分钟后 V8/JSC 垃圾回收就会引起 `30–60ms` 明显掉帧卡顿：

```ts
export class ObjectPool<T extends { active: boolean }> {
  private pool: T[] = [];
  private activeList: T[] = [];

  constructor(
    private readonly factory: () => T,
    private readonly reset: (item: T) => void,
    prewarmCount: number
  ) {
    for (let i = 0; i < prewarmCount; i++) {
      const obj = this.factory();
      obj.active = false;
      this.pool.push(obj);
    }
  }

  acquire(): T {
    const item = this.pool.length > 0 ? this.pool.pop()! : this.factory();
    this.reset(item);
    item.active = true;
    this.activeList.push(item);
    return item;
  }

  // 采用 Swap-and-Pop O(1) 回收，彻底消除 array.splice 移位开销
  sweepInactive(): void {
    let i = this.activeList.length;
    while (i--) {
      const item = this.activeList[i];
      if (!item.active) {
        const lastIdx = this.activeList.length - 1;
        if (i !== lastIdx) {
          this.activeList[i] = this.activeList[lastIdx];
        }
        this.activeList.pop();
        this.pool.push(item);
      }
    }
  }
}
```
- **预热分配额度**：子弹池 `200`、敌人池 `120`、粒子池 `260`、伤害飘字池 `80`。

---

## 5. 模块划分、代码目录树与核心接口草案

### 5.1 工程目录结构规划
```text
/
├── index.html                  # 移动端 viewport-fit=cover、安全区 CSS 变量与启动挂载点
├── package.json                # 极简依赖：vite, typescript (零运行时重型依赖)
├── tsconfig.json               # strict: true 严格类型配置
├── vite.config.ts              # 产物优化、局域网 --host 调试支持
├── docs/                       # 调研、GDD、架构、路线图文档
└── src/
    ├── main.ts                 # 入口初始化、错误兜底收集、视口同步与状态机引导
    ├── engine/                 # 跨玩法无关底层引擎层
    │   ├── Loop.ts             # 固定步长 RAF 主循环 + visibilitychange 自动暂停
    │   ├── ObjectPool.ts       # 泛型 Swap-Pop 对象池
    │   ├── InputManager.ts     # PointerEvent 相对拖拽追踪 + PC 键盘/鼠标兼容层
    │   ├── AudioEngine.ts      # Web Audio API 同步解锁 + 程序化音效合成器
    │   └── Viewport.ts         # 390x844 逻辑映射、DPR<=2 缩放与安全区计算
    ├── game/                   # 玩法逻辑与仿真状态机层（纯数值计算，不碰 DOM）
    │   ├── GameWorld.ts        # 关卡进程、Boss 状态切换、暂停与胜负判定
    │   ├── SquadSystem.ts      # 费马螺线坐标计算、视觉代理与 5/10 合体算法
    │   ├── WeaponSystem.ts     # 6 大武器发射器、亚线性 DPS 计算与子弹合并
    │   ├── AffixSystem.ts      # 8 个词条触发器与 5 组化学反应检测
    │   ├── GateSystem.ts       # 8 种门机关逻辑、红门受击翻蓝与互斥锁
    │   ├── EnemySystem.ts      # 普通怪 AI、5 大 Boss 阶段状态机与弹幕攻击
    │   ├── QuipSystem.ts       # 嘴替弹幕事件触发器与 4s 全局冷却管线
    │   └── Director.ts         # 时间轴波次生成与无尽加班模式动态难度调度
    ├── data/                   # 纯静态数据配置表（策划调优中心）
    │   ├── palette.ts          # Neo-Pop Hex 颜色常量与字体规范
    │   ├── weapons.ts          # 武器属性与词条组合配方表
    │   ├── enemies.ts          # 敌人属性表与 5 大 Boss 行为配置
    │   ├── quips.ts            # 嘴替吐槽文案库与触发权重
    │   ├── talents.ts          # 4 项局外永久天赋费用与收益曲线
    │   └── levels/             # 周一至周五 5 关标准化时间轴数据
    ├── render/                 # Canvas 2D 渲染管线与离屏图集
    │   ├── Renderer.ts         # 8 层渲染调度、微顿帧与弹簧震屏后处理
    │   ├── SpriteCache.ts      # 离屏 Canvas 预渲染带粗描边与硬投影的波普元件
    │   ├── TrackRenderer.ts    # 透视日程网格跑道、滚动时钟刻度与安全区衬底
    │   ├── EntityRenderer.ts   # 摸鱼小人/突击手/机甲、门框、怪物、Boss 矢量绘制
    │   └── PosterExporter.ts   # 局末「今日摸鱼战报」750x1200 离屏海报合成导出
    ├── ui/                     # 轻量 HTML/CSS 界面覆层与交互弹窗
    │   ├── HUDController.ts    # 大招按钮、进度条、嘴替气泡与状态切换
    │   ├── MenuOverlay.ts      # 主界面（周一~周五选关、无尽入口、天赋工坊）
    │   └── ResultModal.ts      # 结算面板与长按保存战报弹窗
    └── storage/                # 持久化模块
        └── SaveManager.ts      # localStorage 读写、版本迁移与损坏容错兜底
```

### 5.2 核心 TypeScript 接口草案

```ts
export type GamePhase = 'MENU' | 'PLAYING' | 'PAUSED' | 'UPGRADE_PICK' | 'VICTORY' | 'DEFEAT';

export type WeaponId =
  | 'stapler'      // 订书机速射
  | 'keyboard'     // 机械键盘霰弹
  | 'americano'    // 冰美式穿透射线
  | 'drone'        // 外卖无人机追踪弹
  | 'headphone'    // 降噪耳机声波环
  | 'ai_pod';      // AI外挂浮游炮

export type AffixId =
  | 'split' | 'ricochet' | 'pierce' | 'chill'
  | 'chain_lightning' | 'crit_rage' | 'kill_haste' | 'vamp_shield';

export type GateKind =
  | 'ADD' | 'MULT' | 'SUB' | 'DIV'
  | 'SUPPLY_CRATE' | 'MYSTERY_BOX' | 'MOVING'
  | 'OVERLOAD' | 'SEESAW' | 'ULT_CHARGE';

export interface WeaponConfig {
  id: WeaponId;
  name: string;
  damageMultiplier: number;
  fireRatePerSec: number;
  projectileSpeed: number;
  basePierce: number;
  color: string;
  synergyPair?: { affix: AffixId; title: string; desc: string };
}

export interface GateConfig {
  id: string;
  pairGroupId: string;       // 同排双门互斥锁标识
  laneSide: 'LEFT' | 'RIGHT' | 'CENTER';
  kind: GateKind;
  initialOp: '+' | '-' | '×' | '÷' | 'BOX' | 'ULT';
  value: number;
  shootableToFlip: boolean;  // 是否允许射击翻蓝
  flipHpPerStep?: number;    // 每改变1点数字或进度所需承受子弹伤害
  moveSpeedX?: number;       // 滑轨门横向速度
  linkedPartnerId?: string;  // 跷跷板联动目标门ID
  rewardWeapon?: WeaponId;
  rewardAffix?: AffixId;
}

export interface LevelWaveConfig {
  timeOffsetSec: number;     // 相对本关开跑的触发秒数
  type: 'GATE_PAIR' | 'ENEMY_SWARM' | 'BARREL' | 'BOSS';
  gates?: GateConfig[];
  enemySpawn?: {
    enemyId: 'unread_99' | 'cc_all' | 'client_tweak' | 'ppt_pie' | 'req_assassin';
    count: number;
    formation: 'LINE' | 'CLUSTER' | 'FLANK_S';
    hpScale: number;
  };
  bossId?: 'monday_alarm' | 'tuesday_meeting' | 'wednesday_hydra' | 'thursday_p0' | 'friday_kpi';
}

export interface GameState {
  phase: GamePhase;
  levelDay: 1 | 2 | 3 | 4 | 5 | 6; // 6 代表周末无尽加班模式
  elapsedSec: number;
  distanceMeters: number;
  squadCount: number;              // 精确逻辑人数（最小保底或归零判定）
  shieldCount: number;
  ultCharge: number;               // 0..100
  ultActiveTimer: number;          // 大招持续无敌倒计时
  activeWeapon: WeaponId;
  subWeapon: WeaponId | null;
  affixes: Record<AffixId, number>;
  synergiesUnlocked: string[];
  stats: {
    maxSquad: number;
    kills: number;
    gatesFlipped: number;          // 驳回翻蓝的红门次数
    beansEarned: number;
    maxCritDamage: number;
  };
}

export interface SaveData {
  version: number;
  coffeeBeans: number;
  highestUnlockedDay: number;      // 1..6 (6 = 解锁周末无尽)
  endlessBestScore: number;
  talents: {
    espressoStart: number;         // 早八浓缩咖啡 (0..10)
    thickSkinShield: number;       // 防弹厚脸皮 (0..10)
    slackingAbacus: number;        // 摸鱼算盘 (0..10)
    bonusLeverage: number;         // 年终奖杠杆 (0..10)
  };
  unlockedBadges: string[];
}
```

---

## 6. 数据驱动关卡设计（Level Timeline Schema）

所有关卡逻辑均声明在 `src/data/levels/day1.ts` ~ `day5.ts` 的纯数据数组中，无需修改引擎代码即可由策划调整每一秒的节奏与门组合：

```ts
// 示例：周一关卡片段（15秒 ~ 30秒区间）
export const DAY1_TIMELINE: LevelWaveConfig[] = [
  {
    timeOffsetSec: 15.0,
    type: 'GATE_PAIR',
    gates: [
      {
        id: 'd1_g3_l',
        pairGroupId: 'd1_row_3',
        laneSide: 'LEFT',
        kind: 'ADD',
        initialOp: '+',
        value: 12,
        shootableToFlip: false
      },
      {
        id: 'd1_g3_r',
        pairGroupId: 'd1_row_3',
        laneSide: 'RIGHT',
        kind: 'SUB',
        initialOp: '-',
        value: 8,
        shootableToFlip: true, // 射击可先减扣再翻蓝为正数
        flipHpPerStep: 12
      }
    ]
  },
  {
    timeOffsetSec: 19.5,
    type: 'ENEMY_SWARM',
    enemySpawn: {
      enemyId: 'unread_99',
      count: 14,
      formation: 'CLUSTER',
      hpScale: 1.0
    }
  }
];
```

---

## 7. 渲染管线与离屏缓存优化

### 7.1 八层严格绘制管线（每帧渲染顺序）
1. **Layer 0 — 深炭底板与透视日程跑道**：渐变深底 `#181A24` → 梯形跑道 `#222536` → 滚动网格线与 `09:00–18:00` 刻度文字。
2. **Layer 1 — 地面贴纸投影与预警线**：全实体统一的右下方 `45°` 硬阴影（批量绘制减少 `fillStyle` 状态切换）与 Boss 红色激光/炸弹落点预警圈。
3. **Layer 2 — 滑轨与数字门 / 空投桶**：门柱、半透明发光膜、裂纹纹理与超大粗体算式文本。
4. **Layer 3 — 敌方怪物与 Boss 本体**：按 Y 轴由远及近绘制（Painter's Algorithm），带受击 `60ms` 白闪叠层与 Boss 血条。
5. **Layer 4 — 咖啡因小队（Fermat 螺线阵型）**：先画外围小人/突击手，最后高亮绘制中心领队与护盾气泡。
6. **Layer 5 — 弹幕、激光与电弧特效**：按武器类型分组批处理绘制，减少 `ctx.strokeStyle` / `ctx.shadowBlur` 切换（**热路径禁用昂贵的实时 `ctx.shadowBlur`，改用同心半透明粗线模拟荧光外发光**）。
7. **Layer 6 — 粒子碎屑与暴击飘字**：涂鸦五角星、键帽碎片、数字缩放动画。
8. **Layer 7 — 全屏后处理与屏幕空间反馈**：大招「准点下班」全屏印章拍击特效、红温边缘暗角警告、全队人数大胶囊牌。

### 7.2 离屏 Canvas 预渲染策略（`SpriteCache`）
- 复杂的矢量粗描边贴纸元件（如基础摸鱼小人 2 帧跑步态、冰美式突击手、机械键盘机甲、饮水机空投桶、`99+` 怪物、常用键帽图标）在游戏初始化阶段预渲染到独立的 `HTMLCanvasElement` / `OffscreenCanvas`（尺寸 `2x` 以匹配 DPR 清晰度），主循环中仅需调用一次极快的 `ctx.drawImage(cachedCanvas, ...)`，将单帧 Canvas API 调用次数压降 **80% 以上**。

---

## 8. 性能预算与多端兼容性 Checklist

### 8.1 性能预算硬指标（Performance Budgets）
| 监控指标 | 预算红线 | 保障手段 |
| :--- | :--- | :--- |
| **目标帧率** | 稳定 **60 FPS**（低端安卓最低不低于 50 FPS） | 禁用热路径 `shadowBlur`、使用 `SpriteCache`、`DPR <= 2` |
| **同屏最大小队渲染实体** | **≤ 45 个** | 逻辑人数 `>24` 启动 5 合 1 / 10 合 1 代理压缩 |
| **同屏最大活跃子弹** | **≤ 180 枚** | 子弹合并放大伤害系数 + `ObjectPool` 对象池硬上限保护 |
| **同屏最大活跃粒子** | **≤ 200 个** | 超过上限时强制复用最老粒子，防止大招爆屏瞬间卡顿 |
| **首屏资源体积（JS+CSS）** | **< 80 KB (gzip)** | 零重型框架、100% 矢量绘制与程序化 Web Audio 音效 |
| **单帧 JS 仿真与渲染耗时** | **< 8 ms / 帧**（留足 8ms 余量给浏览器合成与散热） | Y 轴分桶碰撞检测、消除热路径 `new` 与 `.splice()` |

### 8.2 iOS Safari / Android Chrome / 微信内置浏览器兼容性 Checklist
- [ ] **Web Audio 同步解锁**：在首屏“打卡上班（开始游戏）”按钮同时绑定 `touchstart` 与 `touchend`（兼顾 `click`），**必须在该事件回调同步调用栈内**执行 `audioCtx.resume()` 并播放 1 采样点静音 Buffer，禁止套在 `setTimeout` 或异步 `Promise` 之后（否则微信 X5 内核会永久静音）。
- [ ] **动态高度与虚拟键盘/工具栏防抖**：使用 `100dvh` 搭配 `resize` 更新 `--app-height`，确保 Safari 上下工具栏收放时不裁剪大招按钮或顶部嘴替条。
- [ ] **防系统默认手势劫持**：禁用长按弹出图片菜单（`-webkit-touch-callout: none`）、禁用双击放大、拦截 `touchmove` 防止微信向下拖拽露黑底。
- [ ] **震动与剪切板 API 优雅降级**：调用 `navigator.vibrate` 前检测存在性并包裹 `try/catch`；分享战报海报使用可直接长按保存的 `<img>` 兜底，不依赖受限于权限的 `navigator.share` 或 `ClipboardItem`。
- [ ] **微信环境无 DevTools 调试兜底**：内置 URL 参数开关（如 `?debug=1`），在屏幕左下角挂载微型透明错误捕获与 FPS/对象池占用悬浮面板，方便在真机微信里直接排查偶发报错或帧率瓶颈。
