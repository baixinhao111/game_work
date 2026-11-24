/**
 * 无头数值平衡模拟器：直接驱动真实的 GameWorld 逻辑（不渲染），用不同水平的机器人玩家
 * 批量跑关卡，统计胜率、Boss 战时长、终局人数与咖啡豆产出。
 *
 * 用法：npm run sim -- [runsPerCase]
 */
import { LEVELS } from '../src/data/levels';
import { AudioEngine } from '../src/engine/AudioEngine';
import { LEADER_MAX_X, PLAYER_Y, SCROLL_SPEED } from '../src/engine/Viewport';
import { GameWorld } from '../src/game/GameWorld';
import type { CharacterId, Gate, TalentId } from '../src/game/types';

// ---- 浏览器环境桩 ----
const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v)
  },
  location: { search: '' }
};

type BotKind = 'wiggle' | 'casual' | 'skilled';

const DT = 1 / 60;
const MAX_SEC = 240;

function gateValue(g: Gate, squad: number, shields: number): number {
  switch (g.op) {
    case '+':
      return g.value;
    case '×':
      return squad * (g.value - 1);
    case '-':
      return shields > 0 ? -1 : -Math.min(squad - 1, g.value);
    case '÷':
      return shields > 0 ? -1 : -(squad - Math.floor(squad / g.value));
    case 'BOX':
      return squad * 0.35 + 4;
    case 'ULT':
      return 10;
    default:
      return 0;
  }
}

class Bot {
  private target = 0;
  private thinkTimer = 0;
  private t = 0;

  constructor(
    private readonly kind: BotKind,
    private readonly world: GameWorld
  ) {}

  step(dt: number): void {
    const w = this.world;
    this.t += dt;
    const squad = w.squad;

    if (this.kind === 'wiggle') {
      this.target = Math.sin(this.t / 0.9) * 120;
    } else {
      this.thinkTimer -= dt;
      if (this.thinkTimer <= 0) {
        // casual：反应慢、常看错门、躲避半吊子；skilled：反应快、算账准
        this.thinkTimer = this.kind === 'skilled' ? 0.12 : 0.32;
        this.target = this.choose();
      }
    }

    const maxSpeed = this.kind === 'skilled' ? 620 : 420;
    const delta = this.target - squad.targetLaneX;
    squad.addTargetDelta(Math.max(-maxSpeed * dt, Math.min(maxSpeed * dt, delta)));

    const st = w.state;
    if (st.ultCharge >= 100) {
      const crowd = w.enemies.enemies.activeCount;
      const wantUlt =
        this.kind === 'wiggle'
          ? Math.random() < 0.01
          : w.bosses.boss.active
            ? w.bosses.projectiles.activeCount > 6 || st.squadCount < 25
            : crowd >= (this.kind === 'skilled' ? 18 : 12);
      if (wantUlt) w.triggerUltimate();
    }
  }

  private choose(): number {
    const w = this.world;
    const st = w.state;
    const skilled = this.kind === 'skilled';
    const halfW = w.squad.footprintHalfW;
    let bestX = 0;
    let bestScore = -Infinity;

    // 找到最近一排尚未通过的门
    let nearestGroupY = -Infinity;
    const gates = w.gates.pool.activeItems.filter((g) => g.active && !g.pairLocked && g.y < PLAYER_Y - 6);
    for (const g of gates) {
      if (g.y > nearestGroupY && g.kind !== 'SUPPLY_CRATE') nearestGroupY = g.y;
    }
    const rowGates = gates.filter((g) => Math.abs(g.y - nearestGroupY) < 30 && g.y > PLAYER_Y - 420);
    const crates = gates.filter((g) => g.kind === 'SUPPLY_CRATE' && g.y > PLAYER_Y - 480);

    for (let x = -LEADER_MAX_X; x <= LEADER_MAX_X; x += 8) {
      let score = 0;

      for (const g of rowGates) {
        if (Math.abs(x - g.laneX) <= g.width * 0.5 + 6) {
          let v = gateValue(g, st.squadCount, st.shieldCount);
          if (!skilled) v = g.op === '+' || g.op === '×' ? 10 + Math.random() * 6 : v * 0.5;
          score += v * (skilled ? 3 : 2);
        }
      }

      // 补给箱：站在下面才能打爆
      for (const g of crates) {
        if (Math.abs(x - g.laneX) < 40) score += skilled ? 30 : 15;
      }

      // 敌人：会撞上的扣分，正前方能打到的轻微加分
      for (const e of w.enemies.enemies.activeItems) {
        if (!e.active) continue;
        const timeToHit = (PLAYER_Y - e.y) / (SCROLL_SPEED + e.walkSpeed);
        if (timeToHit < 0) continue;
        const predX = e.laneX + e.vx * Math.min(timeToHit, 0.6);
        const dx = Math.abs(predX - x);
        if (timeToHit < 1.6 && dx < halfW + e.radius) {
          score -= e.damageToSquad * (skilled ? 9 : 5) * (1.6 - timeToHit);
        } else if (dx < 40) {
          score += 0.6;
        }
      }

      // Boss 弹幕与地面技能
      for (const p of w.bosses.projectiles.activeItems) {
        if (!p.active || p.vy <= 0) continue;
        const tt = (PLAYER_Y - p.y) / p.vy;
        if (tt < 0 || tt > (skilled ? 1.2 : 0.8)) continue;
        const px = p.laneX + p.vx * tt;
        if (Math.abs(px - x) < 40) score -= skilled ? 60 : 35;
      }
      for (const h of w.bosses.hazards.activeItems) {
        if (!h.active) continue;
        if (Math.abs(h.laneX - x) < h.halfWidth + 18) score -= skilled ? 80 : 45;
      }
      const boss = w.bosses.boss;
      // 玩家会主动对准 Boss 输出
      if (boss.active) score += Math.abs(boss.laneX - x) < boss.radius * 0.8 ? (skilled ? 14 : 6) : -Math.abs(boss.laneX - x) * 0.05;

      // 移动成本：人类不会无理由大幅横跳
      score -= Math.abs(x - w.squad.targetLaneX) * 0.02;
      if (!skilled) score += Math.random() * 6;

      if (score > bestScore) {
        bestScore = score;
        bestX = x;
      }
    }
    return bestX;
  }
}

interface RunResult {
  win: boolean;
  timeSec: number;
  bossTime: number;
  bossHpLeft: number;
  maxSquad: number;
  endSquad: number;
  beans: number;
  kills: number;
  xp: number;
  ults: number;
}

/** 熟练玩家：化学反应 > 主武器强化 > 专属词条 > 随机；新手随便点 */
function pickCard(world: GameWorld, kind: BotKind): number {
  const opts = world.state.pendingUpgrades;
  if (kind !== 'skilled') return Math.floor(Math.random() * opts.length);
  const order = [
    opts.findIndex((o) => o.synergyTitle),
    opts.findIndex((o) => o.kind === 'MAIN_UP'),
    opts.findIndex((o) => o.exclusive)
  ];
  for (const i of order) if (i >= 0) return i;
  return Math.floor(Math.random() * opts.length);
}

function runOnce(day: number, kind: BotKind, talentLv: number): RunResult {
  mem.clear();
  const talents: Record<TalentId, number> = {
    espresso: talentLv,
    thick_skin: talentLv,
    abacus: talentLv,
    bonus: talentLv
  };
  mem.set(
    'mbdf_save_v2',
    JSON.stringify({ version: 2, coffeeBeans: 0, bestSquad: 0, totalClears: 0, highestCleared: 5, talents, muted: true })
  );
  const audio = new AudioEngine(true);
  const world = new GameWorld(audio, { onPhaseChange: () => {}, onQuipChange: () => {} });
  world.save.talents = talents;
  world.save.highestCleared = 5;
  world.save.muted = true;
  // 指定角色（CHAR=coder 等）：直接视为已解锁
  world.save.xp = 1e6;
  world.save.bestKills = 1e6;
  world.save.selectedCharacter = (process.env.CHAR || 'intern') as CharacterId;
  world.startNewRun(day);
  const bot = new Bot(kind, world);
  let ults = 0;
  const origUlt = world.triggerUltimate.bind(world);
  world.triggerUltimate = () => {
    if (world.state.ultCharge >= 100) ults++;
    origUlt();
  };

  let t = 0;
  let lastSquad = world.state.squadCount;
  const trace = process.env.TRACE === '1';
  while ((world.state.phase === 'PLAYING' || world.state.phase === 'UPGRADE_PICK') && t < MAX_SEC) {
    if (world.state.phase === 'UPGRADE_PICK') {
      // 熟练玩家优先选能触发化学反应的牌；新手随便点
      world.pickUpgrade(pickCard(world, kind));
      continue;
    }
    bot.step(DT);
    world.step(DT);
    t += DT;
    if (trace && world.state.squadCount !== lastSquad) {
      const d = world.state.squadCount - lastSquad;
      if (Math.abs(d) >= 3) console.log(`  t=${t.toFixed(1)} squad ${lastSquad} -> ${world.state.squadCount} (${d > 0 ? '+' : ''}${d})`);
      lastSquad = world.state.squadCount;
    }
  }
  const st = world.state;
  return {
    win: st.phase === 'VICTORY',
    timeSec: t,
    bossTime: st.stats.bossTimeSec,
    bossHpLeft: world.bosses.boss.active ? world.bosses.boss.hp / world.bosses.boss.maxHp : 0,
    maxSquad: st.stats.maxSquad,
    endSquad: st.squadCount,
    beans: st.stats.beansEarned,
    kills: st.stats.kills,
    xp: st.xpResult ? st.xpResult.total : 0,
    ults
  };
}

/**
 * 生涯模式（CAREER=casual|skilled）：从空存档开始，每局打最高解锁关（通关后循环打无尽 / 最高关），
 * 结算后贪心买天赋，记录升到每个职级用了几局——验证 docs/07 §5 的解锁节奏。
 */
function runCareer(kind: BotKind, totalRuns: number): void {
  mem.clear();
  const audio = new AudioEngine(true);
  const world = new GameWorld(audio, { onPhaseChange: () => {}, onQuipChange: () => {} });
  world.save.muted = true;
  world.save.tutorialDone = true;
  const reached: Record<number, number> = { 1: 0 };
  let clearedAt = 0;
  for (let n = 1; n <= totalRuns; n++) {
    const day = Math.min(LEVELS.length, world.save.highestCleared + 1);
    world.startNewRun(day);
    const bot = new Bot(kind, world);
    let t = 0;
    while ((world.state.phase === 'PLAYING' || world.state.phase === 'UPGRADE_PICK') && t < MAX_SEC) {
      if (world.state.phase === 'UPGRADE_PICK') {
        world.pickUpgrade(pickCard(world, kind));
        continue;
      }
      bot.step(DT);
      world.step(DT);
      t += DT;
    }
    const res = world.state.xpResult;
    if (res) for (let r = res.rankBefore + 1; r <= res.rankAfter; r++) reached[r] = n;
    if (!clearedAt && world.save.highestCleared >= LEVELS.length) clearedAt = n;
    // 贪心买天赋：总挑最便宜的
    for (;;) {
      const ids = (Object.keys(world.save.talents) as TalentId[]).filter((id) => world.save.talents[id] < 10);
      if (!ids.length) break;
      ids.sort((a, b) => world.save.talents[a] - world.save.talents[b]);
      const id = ids[0];
      const cost = Math.round(40 * Math.pow(1.45, world.save.talents[id]));
      if (world.save.coffeeBeans < cost) break;
      world.save.coffeeBeans -= cost;
      world.save.talents[id] += 1;
    }
    world.refreshTalents();
  }
  console.log(`career ${kind}: ${totalRuns} runs, xp ${world.save.xp}, first full clear at run ${clearedAt || '-'}`);
  console.log('rank reached at run: ' + Object.keys(reached).map((r) => `${r}@${reached[Number(r)]}`).join('  '));
}

if (process.env.CAREER) {
  runCareer(process.env.CAREER as BotKind, Number(process.argv[2] ?? 40));
  process.exit(0);
}

const runs = Number(process.argv[2] ?? 12);
const onlyDay = Number(process.argv[3] ?? 0);
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

const cases: Array<[BotKind, number]> = process.env.CASE ? [[process.env.CASE.split(':')[0] as BotKind, Number(process.env.CASE.split(':')[1])]] : [
  ['wiggle', 0],
  ['casual', 0],
  ['casual', 3],
  ['skilled', 0],
  ['skilled', 3],
  ['skilled', 6]
];

console.log('day | bot        tal | win%  | bossSec | endBossHp | maxSq | endSq | beans | kills |  xp  | ults');
for (const level of LEVELS) {
  if (onlyDay && level.day !== onlyDay) continue;
  for (const [kind, tal] of cases) {
    const rs: RunResult[] = [];
    for (let i = 0; i < runs; i++) rs.push(runOnce(level.day, kind, tal));
    const wins = rs.filter((r) => r.win);
    const losses = rs.filter((r) => !r.win);
    console.log(
      [
        ` ${level.day} `,
        ` ${kind.padEnd(8)} ${String(tal).padStart(2)} `,
        ` ${String(Math.round((wins.length / runs) * 100)).padStart(3)}% `,
        ` ${avg(wins.map((r) => r.bossTime)).toFixed(1).padStart(6)}  `,
        ` ${(avg(losses.map((r) => r.bossHpLeft)) * 100).toFixed(0).padStart(6)}%   `,
        ` ${avg(rs.map((r) => r.maxSquad)).toFixed(0).padStart(4)} `,
        ` ${avg(wins.map((r) => r.endSquad)).toFixed(0).padStart(4)} `,
        ` ${avg(rs.map((r) => r.beans)).toFixed(0).padStart(4)} `,
        ` ${avg(rs.map((r) => r.kills)).toFixed(0).padStart(4)} `,
        ` ${avg(rs.map((r) => r.xp)).toFixed(0).padStart(4)} `,
        ` ${avg(rs.map((r) => r.ults)).toFixed(1).padStart(4)}`
      ].join('|')
    );
  }
}
