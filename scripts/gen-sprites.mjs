/**
 * 用 OpenRouter 上的 Seedream 生成角色素材原图（纯绿底），之后交给 process-sprites.mjs 抠图压缩。
 *
 * 用法：
 *   OPENROUTER_API_KEY=sk-... node scripts/gen-sprites.mjs [name ...]
 * 不传 name 则生成清单里全部条目；原图保存在 art/raw/<name>.png（已在 .gitignore 中忽略）。
 */
import fs from 'node:fs';
import path from 'node:path';

const MODEL = process.env.SPRITE_MODEL ?? 'bytedance-seed/seedream-5-5';
const RAW_DIR = path.resolve('art/raw');

const STYLE =
  'Style: bold cartoon sticker art, thick black outlines, cel shading, saturated neon-pop colors, ' +
  'mobile game asset, single character only. Plain solid pure green (#00FF00) background, ' +
  'no shadow on background, no extra floating debris, no border, no watermark.';

export const PROMPTS = {
  boss_projector:
    'Game boss sprite, full body, centered, front-facing 3/4 view: a giant angry floating office projector monster ' +
    'with a glowing mint-green lens eye, purple plastic body, little robotic arms holding a red laser pointer, ' +
    'a small white sticker on top reading 周会.',
  boss_hydra:
    'Game boss sprite, full body, centered, front-facing: a three-headed purple hydra serpent monster made of ' +
    'crumpled design sticky notes, each head wearing tiny glasses and grinning smugly, ' +
    'the middle head is red and angry, holding colorful marker pens, office client from hell.',
  boss_server:
    'Game boss sprite, full body, centered, front-facing: a furious server rack cabinet monster on fire, ' +
    'blinking red and mint LED rows as teeth, red 502 error popup window as its face, flames and smoke on top, ' +
    'stubby metal legs and cable tentacle arms.',
  boss_kpi:
    'Game boss sprite, full body, centered, front-facing: a towering corporate titan monster in a dark navy suit ' +
    'and red tie, its body built from golden bar charts and rising arrows, glowing red core on chest reading OKR, ' +
    'huge fists, menacing grin, final boss energy.'
};

async function generate(name) {
  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENROUTER_API_KEY ?? ''}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: MODEL,
      modalities: ['image'],
      messages: [{ role: 'user', content: `${PROMPTS[name]} ${STYLE}` }]
    })
  });
  const data = await res.json();
  const url = data?.choices?.[0]?.message?.images?.[0]?.image_url?.url;
  if (!res.ok || !url) {
    throw new Error(`${name}: HTTP ${res.status} ${JSON.stringify(data?.error ?? data).slice(0, 300)}`);
  }
  const out = path.join(RAW_DIR, `${name}.png`);
  fs.writeFileSync(out, Buffer.from(url.split(',', 2)[1], 'base64'));
  console.log(`✓ ${name} -> ${path.relative(process.cwd(), out)} (cost $${data.usage?.cost ?? '?'})`);
}

const names = process.argv.slice(2).length ? process.argv.slice(2) : Object.keys(PROMPTS);
fs.mkdirSync(RAW_DIR, { recursive: true });
const results = await Promise.allSettled(names.map(generate));
for (const r of results) if (r.status === 'rejected') console.error('✗', r.reason.message);
