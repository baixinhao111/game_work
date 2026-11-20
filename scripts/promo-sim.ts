/**
 * 宣传视频真实引擎录制导出器：
 * 直接驱动真实 GameWorld / SquadSystem / GateSystem / CombatSystem / EnemySystem / BossSystem / QuipSystem，
 * 导出 3 段高能实机帧序列（30fps，每帧步进两次 1/60s）供 `promo-render.py` 高精渲染。
 */
import { writeFileSync } from 'node:fs';
import { BOSSES } from '../src/data/enemies';
import { AudioEngine } from '../src/engine/AudioEngine';
import { PLAYER_Y, projectX } from '../src/engine/Viewport';
import { GameWorld } from '../src/game/GameWorld';
import { getGateFlipCap, isGateShootable } from '../src/game/GateSystem';
import { WEAPONS } from '../src/data/weapons';

const mem = new Map<string, string>();
(globalThis as unknown as { window: unknown }).window = {
  localStorage: {
    getItem: (k: string) => mem.get(k) ?? null,
    setItem: (k: string, v: string) => void mem.set(k, v),
    removeItem: (k: string) => {
      mem.delete(k);
    }
  },
  location: { search: '' }
};

function createWorld(): GameWorld {
  const world = new GameWorld(new AudioEngine(true), {
    onPhaseChange: () => {},
    onQuipChange: () => {}
  });
  return world;
}

function captureFrame(world: GameWorld) {
  const st = world.state;
  const w = world as unknown as {
    particles: { activeItems: Array<{ active: boolean; x: number; y: number; size: number; life: number; maxLife: number; color: string; shape: string; rot: number }> };
    floatingTexts: { activeItems: Array<{ active: boolean; x: number; y: number; text: string; color: string; size: number; life: number; maxLife: number; scalePop: number }> };
  };

  const gates = world.gates.pool.activeItems
    .filter((g) => g.active)
    .map((g) => {
      const cap = getGateFlipCap(g);
      let progress = 0;
      if (g.op === '÷') {
        progress = Math.min(1, (g.flipTickCount + Math.min(1, g.flipProgress / Math.max(1, g.flipHpPerStep))) / 8);
      } else if (g.op === '-') {
        progress = Math.min(1, g.flipProgress / Math.max(1, g.flipHpPerStep));
      } else if (g.flippedToBlue && g.op === '+') {
        progress = Math.min(1, g.value / Math.max(1, cap));
      }
      return {
        laneX: g.laneX,
        y: g.y,
        width: g.width,
        height: g.height,
        kind: g.kind,
        op: g.op,
        value: g.value,
        shootable: isGateShootable(g),
        flippedToBlue: g.flippedToBlue,
        flipCap: cap,
        progress,
        moveSpeedX: g.moveSpeedX,
        labelOverride: g.labelOverride ?? null,
        rewardWeapon: g.rewardWeapon ?? null,
        rewardAffix: g.rewardAffix ?? null,
        barrelRatio: g.kind === 'SUPPLY_CRATE' ? Math.max(0, g.barrelHp / Math.max(1, g.barrelMaxHp)) : 0,
        pairLocked: g.pairLocked,
        hitFlash: g.hitFlashTimer > 0,
        bounceScale: g.bounceScale
      };
    });

  const enemies = world.enemies.enemies.activeItems
    .filter((e) => e.active)
    .map((e) => ({
      configId: e.configId,
      laneX: e.laneX,
      y: e.y,
      flash: e.flashTimer > 0,
      chill: e.chillTimer > 0 || e.deepChillTimer > 0,
      rot: e.rot,
      wobble: e.wobblePhase
    }));

  const bullets = world.combat.bullets.activeItems
    .filter((b) => b.active)
    .map((b) => ({
      laneX: b.laneX,
      y: b.y,
      vx: b.vx,
      vy: b.vy,
      kind: b.kind,
      color: b.color,
      radius: b.radius,
      keyLabel: b.keyLabel,
      rot: b.rot,
      isCrit: b.isCrit
    }));

  const boss = world.bosses.boss.active
    ? {
        active: true,
        style: world.bosses.boss.style,
        name: world.bosses.boss.name,
        laneX: world.bosses.boss.laneX,
        y: world.bosses.boss.y,
        hp: world.bosses.boss.hp,
        maxHp: world.bosses.boss.maxHp,
        radius: world.bosses.boss.radius,
        enraged: world.bosses.boss.enraged,
        shieldTimer: world.bosses.boss.shieldTimer,
        flash: world.bosses.boss.flashTimer > 0
      }
    : { active: false };

  const bossProjs = world.bosses.projectiles.activeItems
    .filter((p) => p.active)
    .map((p) => ({
      laneX: p.laneX,
      y: p.y,
      radius: p.radius,
      color: p.color,
      label: p.label
    }));

  const hazards = world.bosses.hazards.activeItems
    .filter((h) => h.active)
    .map((h) => ({
      kind: h.kind,
      laneX: h.laneX,
      y: h.y,
      halfWidth: h.halfWidth,
      warnTimer: h.warnTimer,
      warnMax: h.warnMax,
      activeTimer: h.activeTimer
    }));

  const units = world.squad.renderUnits.map((u) => ({
    dx: u.dx,
    dy: u.dy,
    tier: u.tier,
    phase: u.phase
  }));

  const arcs = world.combat.arcs.map((a) => ({
    x1: a.x1,
    y1: a.y1,
    x2: a.x2,
    y2: a.y2,
    superconduct: Boolean(a.superconduct),
    alpha: Math.min(1, a.life / 0.08)
  }));

  const particles = w.particles.activeItems
    .filter((p) => p.active)
    .map((p) => ({
      x: p.x,
      y: p.y,
      size: p.size,
      color: p.color,
      shape: p.shape,
      rot: p.rot,
      alpha: Math.max(0, 1 - p.life / p.maxLife)
    }));

  const floatingTexts = w.floatingTexts.activeItems
    .filter((f) => f.active)
    .map((f) => ({
      x: f.x,
      y: f.y,
      text: f.text,
      color: f.color,
      size: f.size,
      scalePop: f.scalePop,
      alpha: Math.max(0, 1 - f.life / f.maxLife)
    }));

  const wCfg = WEAPONS[st.activeWeapon];
  const weaponHud =
    st.affixes.ricochet > 0 ? `${wCfg.shortTag} · ${wCfg.traitBadge} +弹射` : `${wCfg.shortTag} · ${wCfg.traitBadge}`;

  return {
    phase: st.phase,
    elapsedSec: Number(st.elapsedSec.toFixed(3)),
    squadCount: st.squadCount,
    shieldCount: st.shieldCount,
    leaderLaneX: Number(world.squad.leaderLaneX.toFixed(2)),
    footprintTopDy: Number(world.squad.footprintTopDy.toFixed(2)),
    weaponId: st.activeWeapon,
    weaponHud,
    comboCount: st.comboCount,
    ultCharge: Math.floor(st.ultCharge),
    ultStampTimer: Number(st.ultStampTimer.toFixed(3)),
    hurtFlashTimer: Number(st.hurtFlashTimer.toFixed(3)),
    overloadTimer: Number(st.overloadEnemyTimer.toFixed(3)),
    muzzleFlash: st.muzzleFlashTimer > 0,
    banner: st.banner
      ? {
          title: st.banner.title,
          sub: st.banner.sub,
          color: st.banner.color,
          timer: Number(st.banner.timer.toFixed(3))
        }
      : null,
    squadBubble: world.quips.squadBubble
      ? {
          text: world.quips.squadBubble.text,
          tone: world.quips.squadBubble.tone,
          age: Number((world.quips.squadBubble.duration - world.quips.squadBubble.remaining).toFixed(3)),
          remaining: Number(world.quips.squadBubble.remaining.toFixed(3))
        }
      : null,
    bossBubble: world.quips.bossBubble
      ? {
          text: world.quips.bossBubble.text,
          tone: world.quips.bossBubble.tone,
          age: Number((world.quips.bossBubble.duration - world.quips.bossBubble.remaining).toFixed(3)),
          remaining: Number(world.quips.bossBubble.remaining.toFixed(3))
        }
      : null,
    chatToast: world.quips.chatToast
      ? {
          text: world.quips.chatToast.text,
          tone: world.quips.chatToast.tone,
          sender: world.quips.chatToast.sender ?? '摸鱼战神群 (99+)',
          tag: world.quips.chatToast.tag ?? '@你',
          age: Number((world.quips.chatToast.duration - world.quips.chatToast.remaining).toFixed(3)),
          remaining: Number(world.quips.chatToast.remaining.toFixed(3))
        }
      : null,
    units,
    gates,
    enemies,
    bullets,
    boss,
    bossProjs,
    hazards,
    arcs,
    particles,
    floatingTexts
  };
}

function stepFrame(world: GameWorld): void {
  const internal = world as unknown as {
    stepEffectsOnly: (dt: number) => void;
  };
  for (let sub = 0; sub < 2; sub++) {
    if (world.state.phase === 'PLAYING') {
      world.step(1 / 60);
    } else {
      world.quips.step(1 / 60);
      internal.stepEffectsOnly(1 / 60);
      if (world.state.ultStampTimer > 0) {
        world.state.ultStampTimer = Math.max(0, world.state.ultStampTimer - 1 / 60);
      }
      if (world.state.banner) {
        world.state.banner.timer -= 1 / 60;
        if (world.state.banner.timer <= 0) world.state.banner = null;
      }
    }
  }
}

// =====================================================================
// Segment A (210 frames = 7.0s): Day 1 走位 -> 破箱换键盘 -> 狂射洗白红门
// =====================================================================
function recordSegmentA() {
  const world = createWorld();
  world.startNewRun(1);
  (world as unknown as { nextWaveIdx: number }).nextWaveIdx = 999; // 自定义快节奏开局编排
  world.state.squadCount = 10;
  world.state.shieldCount = 2;
  world.squad.rebuildRenderUnits(10);

  // 立即放入第一对蓝门 + 丧尸潮
  world.gates.spawnFromConfigs([
    { id: 'pa_l', pairGroupId: 'pa_1', laneSide: 'LEFT', kind: 'ADD', initialOp: '+', value: 6, shootableToFlip: false },
    { id: 'pa_r', pairGroupId: 'pa_1', laneSide: 'RIGHT', kind: 'ADD', initialOp: '+', value: 12, shootableToFlip: false }
  ]);
  for (const g of world.gates.pool.activeItems) {
    if (g.active) g.y = 410;
  }
  world.enemies.spawnSwarm('overtime_zombie', 10, 'STAGGERED_HORDE', 0.45, 30);
  for (const e of world.enemies.enemies.activeItems) {
    if (e.active) e.y += 220;
  }

  const frames = [];
  for (let f = 0; f < 210; f++) {
    const t = f / 30;
    if (f === 18) {
      // 左侧空投机械键盘 + 右侧 +8 门
      world.gates.spawnFromConfigs([
        {
          id: 'pa_crate',
          pairGroupId: 'pa_crate_g',
          laneSide: 'LEFT',
          kind: 'SUPPLY_CRATE',
          initialOp: 'CRATE',
          value: 1,
          shootableToFlip: false,
          barrelHp: 34,
          rewardWeapon: 'keyboard',
          labelOverride: '机械键盘'
        },
        {
          id: 'pa_c_other',
          pairGroupId: 'pa_crate_other',
          laneSide: 'RIGHT',
          kind: 'ADD',
          initialOp: '+',
          value: 8,
          shootableToFlip: false
        }
      ]);
      for (const g of world.gates.pool.activeItems) {
        if (g.configId === 'pa_crate' || g.configId === 'pa_c_other') g.y = 210;
      }
      world.enemies.spawnSwarm('overtime_zombie', 10, 'STAGGERED_HORDE', 0.5, 45);
    }

    if (f === 60) {
      // 可射击洗白红门（左 -6，可洗白；右 +6）
      world.gates.spawnFromConfigs([
        {
          id: 'pa_red',
          pairGroupId: 'pa_red_g',
          laneSide: 'LEFT',
          kind: 'SUB',
          initialOp: '-',
          value: 6,
          shootableToFlip: true,
          flipHpPerStep: 7
        },
        {
          id: 'pa_blue',
          pairGroupId: 'pa_red_g',
          laneSide: 'RIGHT',
          kind: 'ADD',
          initialOp: '+',
          value: 6,
          shootableToFlip: false
        }
      ]);
      world.enemies.spawnSwarm('cc_all', 6, 'LINE', 0.55, 65);
    }

    if (f === 125) {
      world.enemies.spawnSwarm('ddl_flame', 6, 'FLANK_S', 0.6, 55);
    }

    // 丝滑走位曲线：先吃右 +12，再横拉到左边打爆机械键盘，随后稳守左侧狂射洗白红门
    if (t < 1.9) {
      world.squad.targetLaneX = 76;
    } else if (t < 4.5) {
      world.squad.targetLaneX = -78;
    } else {
      world.squad.targetLaneX = -78 + Math.sin((t - 4.5) * 2.2) * 10;
    }

    stepFrame(world);
    frames.push(captureFrame(world));
  }
  return {
    name: 'segA',
    flippedCount: world.state.stats.gatesFlipped,
    endSquad: world.state.squadCount,
    frames
  };
}

// =====================================================================
// Segment B (180 frames = 6.0s): 化学反应超导连锁 + 过载破百机甲 + 追踪外卖
// =====================================================================
function recordSegmentB() {
  const world = createWorld();
  world.startNewRun(4);
  (world as unknown as { nextWaveIdx: number }).nextWaveIdx = 999;
  world.state.squadCount = 52;
  world.state.activeWeapon = 'americano';
  world.state.affixes.chain_lightning = 1;
  world.state.affixes.split = 1;
  world.state.affixes.crit_rage = 1;
  (world as unknown as { syncSynergies: () => void }).syncSynergies();
  world.state.banner = null;
  world.squad.rebuildRenderUnits(52);

  world.enemies.spawnSwarm('overtime_zombie', 22, 'STAGGERED_HORDE', 1.25);
  world.enemies.spawnSwarm('ppt_pie', 2, 'LINE', 1.1);
  for (const e of world.enemies.enemies.activeItems) {
    if (e.active) e.y += 170;
  }

  world.gates.spawnFromConfigs([
    {
      id: 'pb_ov',
      pairGroupId: 'pb_1',
      laneSide: 'RIGHT',
      kind: 'OVERLOAD',
      initialOp: '×',
      value: 2.5,
      shootableToFlip: false,
      overloadDurationSec: 4.5,
      labelOverride: '⚡ 高压过载'
    },
    {
      id: 'pb_l',
      pairGroupId: 'pb_1',
      laneSide: 'LEFT',
      kind: 'MYSTERY_BOX',
      initialOp: 'BOX',
      value: 1,
      shootableToFlip: false,
      labelOverride: '??? 未读邮件'
    }
  ]);
  for (const g of world.gates.pool.activeItems) {
    if (g.active) g.y = 260;
  }

  const frames = [];
  for (let f = 0; f < 180; f++) {
    const t = f / 30;
    if (f === 32) {
      world.enemies.spawnSwarm('ddl_flame', 10, 'FLANK_S', 1.2);
      world.enemies.spawnSwarm('client_tweak', 5, 'WEDGE', 1.2);
    }
    if (f === 90) {
      // 切换外卖无人机追踪弹展示拐弯追踪弹幕
      world.state.activeWeapon = 'drone';
      world.state.affixes.split = 1;
      (world as unknown as { syncSynergies: () => void }).syncSynergies();
      world.enemies.spawnSwarm('cc_all', 12, 'LINE', 1.2);
      world.enemies.spawnSwarm('overtime_zombie', 20, 'STAGGERED_HORDE', 1.3);
    }

    if (t < 3.0) {
      world.squad.targetLaneX = 76;
    } else {
      world.squad.targetLaneX = Math.sin((t - 3.0) * 3.2) * 84;
    }

    stepFrame(world);
    frames.push(captureFrame(world));
  }
  return {
    name: 'segB',
    maxSquad: world.state.stats.maxSquad,
    synergies: world.state.synergies,
    frames
  };
}

// =====================================================================
// Segment C (204 frames = 6.8s): 终极 KPI 巨兽 Boss 战 + 18:00 准点下班清屏大招
// =====================================================================
function recordSegmentC() {
  const world = createWorld();
  world.startNewRun(5);
  (world as unknown as { nextWaveIdx: number }).nextWaveIdx = 999;
  world.state.squadCount = 74;
  world.state.shieldCount = 2;
  world.state.activeWeapon = 'keyboard';
  world.state.affixes.ricochet = 1;
  world.state.affixes.crit_rage = 1;
  world.state.ultCharge = 92;
  world.squad.rebuildRenderUnits(74);

  const ctx = (world as unknown as { buildCombatContext: () => never }).buildCombatContext();
  world.state.bossBannerTimer = 1.4;
  world.bosses.spawn('kpi_titan', 1.15, ctx);
  world.bosses.boss.y = 190;
  world.bosses.boss.shieldsUsed = BOSSES.kpi_titan.shieldAt.length;
  world.bosses.boss.attackTimer = 0.35;

  const frames = [];
  for (let f = 0; f < 204; f++) {
    const t = f / 30;
    // 在大招前夕把血量压低并攒满大招，在大招瞬间完成壮观斩杀清屏
    if (f < 84 && world.bosses.boss.active) {
      world.state.ultCharge = Math.min(100, 92 + (f / 50) * 8);
      if (f === 48) {
        world.bosses.boss.enraged = true;
        world.quips.trigger('BOSS_ENRAGE');
      }
      if (f === 80) {
        world.bosses.boss.hp = Math.min(world.bosses.boss.hp, world.bosses.boss.maxHp * 0.04);
      }
    }

    if (f === 84) {
      world.state.ultCharge = 100;
      world.triggerUltimate();
    }

    // 战中风骚走位躲弹幕
    world.squad.targetLaneX = f < 84 ? Math.sin(t * 3.4) * 92 : 0;

    stepFrame(world);
    frames.push(captureFrame(world));
  }
  return {
    name: 'segC',
    phaseEnd: world.state.phase,
    bossName: BOSSES.kpi_titan.name,
    frames
  };
}

const segA = recordSegmentA();
const segB = recordSegmentB();
const segC = recordSegmentC();

const payload = { segA, segB, segC };
writeFileSync('/tmp/promo-sim-data.json', JSON.stringify(payload));
console.log(
  `✓ Promo sim exported: segA(flipped=${segA.flippedCount}, squad=${segA.endSquad}), segB(maxSquad=${segB.maxSquad}, synergies=${segB.synergies.join(',')}), segC(endPhase=${segC.phaseEnd})`
);
console.log(`✓ Total frames: A=${segA.frames.length}, B=${segB.frames.length}, C=${segC.frames.length}`);
