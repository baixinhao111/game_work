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
  // ---- v1.0 角色：小队单位（背影）----
  hero_coder: 'Game character sprite for a top-down runner, full body, seen from BEHIND in a 3/4 back view, running forward and slightly to the right up the screen, same chibi proportions as a mobile hero unit (big head, short legs), centered, a young male programmer in a red-and-navy plaid flannel shirt and jeans, messy black hair, black-rim glasses, a laptop backpack covered in stickers, holding a chunky glowing RGB mechanical keyboard like a shotgun.',
  hero_designer: 'Game character sprite for a top-down runner, full body, seen from BEHIND in a 3/4 back view, running forward and slightly to the right up the screen, same chibi proportions as a mobile hero unit (big head, short legs), centered, a young female designer with a lavender bob haircut and a black beret, oversized purple sweater, huge white noise-cancelling headphones emitting mint-green sound wave rings, holding a stylus pen.',
  hero_pm: 'Game character sprite for a top-down runner, full body, seen from BEHIND in a 3/4 back view, running forward and slightly to the right up the screen, same chibi proportions as a mobile hero unit (big head, short legs), centered, a product manager in an orange quarter-zip vest over a white shirt and khaki pants, holding a tablet showing a giant pie chart, a small yellow food-delivery drone carrying a box hovering above his shoulder.',
  hero_sales: 'Game character sprite for a top-down runner, full body, seen from BEHIND in a 3/4 back view, running forward and slightly to the right up the screen, same chibi proportions as a mobile hero unit (big head, short legs), centered, a confident salesperson in a sharp mustard-gold blazer and black pants, slicked-back hair, a phone headset, holding a briefcase, two small purple robotic AI hover pods floating beside the shoulders.',
  hero_cleaner: 'Game character sprite for a top-down runner, full body, seen from BEHIND in a 3/4 back view, running forward and slightly to the right up the screen, same chibi proportions as a mobile hero unit (big head, short legs), centered, a sturdy cheerful middle-aged Chinese cleaning lady in a light-blue cleaning uniform with a white apron, hair bun in a hairnet, swinging a big straw broom with a swirling dust wind trail.',
  // ---- v1.0 角色：选择界面半身像（正面）----
  face_intern: 'Character select portrait, bust shot from the chest up, front-facing, big expressive cartoon face, centered, slight 3/4 angle, sticker style with a clean silhouette, a tired but cheeky young office intern in a mint-green hoodie with big yellow headphones around the neck, dark eye circles, sipping an iced americano through a straw, mischievous grin.',
  face_coder: 'Character select portrait, bust shot from the chest up, front-facing, big expressive cartoon face, centered, slight 3/4 angle, sticker style with a clean silhouette, a young male programmer in a red-and-navy plaid flannel shirt, messy black hair, black-rim glasses reflecting green code, smug confident smirk, holding up an RGB mechanical keyboard.',
  face_designer: 'Character select portrait, bust shot from the chest up, front-facing, big expressive cartoon face, centered, slight 3/4 angle, sticker style with a clean silhouette, a young female designer with a lavender bob and black beret, oversized purple sweater, white headphones, rolling her eyes with an unimpressed artsy expression, holding a color palette.',
  face_pm: 'Character select portrait, bust shot from the chest up, front-facing, big expressive cartoon face, centered, slight 3/4 angle, sticker style with a clean silhouette, a product manager in an orange quarter-zip vest, overly enthusiastic big smile, pointing at a tablet with a huge pie chart, tiny yellow delivery drone next to his head.',
  face_sales: 'Character select portrait, bust shot from the chest up, front-facing, big expressive cartoon face, centered, slight 3/4 angle, sticker style with a clean silhouette, a confident salesperson in a mustard-gold blazer, slicked-back hair, phone headset, winking and giving a thumbs up, gold coin sparkle.',
  face_cleaner: 'Character select portrait, bust shot from the chest up, front-facing, big expressive cartoon face, centered, slight 3/4 angle, sticker style with a clean silhouette, a sturdy cheerful middle-aged Chinese cleaning lady in a light-blue uniform and white apron, hair bun in a hairnet, holding a straw broom like a kung fu master, calm wise smile.',
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
      image_config: { aspect_ratio: '1:1' },
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
