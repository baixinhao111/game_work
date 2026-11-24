#!/usr/bin/env bash
# 各角色并行跑平衡模拟：先打包一次，再并行执行同一份产物（避免并行写同一个文件）
# 用法：scripts/sim-chars.sh <runs> <day> <bot:tal>
set -e
RUNS=${1:-16}; DAY=${2:-5}; CASEV=${3:-casual:0}
npx esbuild scripts/balance-sim.ts --bundle --platform=node --format=esm --log-level=warning --outfile=node_modules/.cache/balance-sim.mjs
for c in intern coder designer pm sales cleaner; do
  (CHAR=$c CASE=$CASEV node node_modules/.cache/balance-sim.mjs "$RUNS" "$DAY" | tail -1 | sed "s/^/$(printf '%-9s' $c)/") &
done
wait
