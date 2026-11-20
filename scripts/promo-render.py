#!/usr/bin/env python3
"""
Render an editorial Indie-Anime / Visual-Novel Xiaohongshu 3:4 cover (`1080x1440`)
and a story-driven 40.00s vertical video (`1080x1920`, 1200 frames @ 30fps,
central 3:4 safe framing y=240..1680) mixing bespoke illustrations, VN dialogue,
and real `GameWorld` gameplay footage from `/tmp/promo-sim-data.json`.
"""

import json
import math
import re
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont

ROOT = Path("/Users/baixinhao/Downloads/smallgame")
SPRITE_DIR = ROOT / "public" / "assets" / "sprites"
ART_DIR = ROOT / "promo" / "art"
SIM_PATH = Path("/tmp/promo-sim-data.json")
AUDIO_PATH = Path("/tmp/promo-audio.wav")
OUT_DIR = ROOT / "promo"
OUT_VIDEO = OUT_DIR / "monday-breakout-xhs-promo.mp4"
OUT_COVER = OUT_DIR / "xhs-cover-3x4.png"

W, H = 1080, 1920
SAFE_Y0, SAFE_Y1 = 240, 1680  # Central 1080x1440 3:4 safe zone
FPS = 30
TOTAL_FRAMES = 1200  # 40.00s @ 30fps

# Editorial + Neo-Pop Game Palette
C_BG_DARK = (16, 18, 28)
C_TRACK = (34, 37, 54)
C_YELLOW = (255, 224, 102)
C_YELLOW_BRIGHT = (255, 230, 0)
C_MINT = (0, 245, 212)
C_RED = (255, 68, 102)
C_PURPLE = (168, 114, 242)
C_COFFEE = (198, 139, 89)
C_PAPER = (248, 247, 242)
C_MUTED_PAPER = (214, 212, 206)
C_INK = (15, 17, 26)
C_BOSS_PLUM = (36, 16, 28)

# Verified macOS Fonts
FONT_SERIF_PATH = "/System/Library/Fonts/Supplemental/Songti.ttc"
FONT_SERIF_BLACK_IDX = 0
FONT_SERIF_BOLD_IDX = 1
FONT_SANS_PATH = "/System/Library/Fonts/Hiragino Sans GB.ttc"
FONT_SANS_BOLD_IDX = 2  # W6
FONT_SANS_REG_IDX = 0   # W3
FONT_MONO_PATH = "/System/Library/Fonts/SFNSMono.ttf"
FONT_LATIN_PATH = "/System/Library/Fonts/Supplemental/DIN Alternate Bold.ttf"

_FONT_CACHE: dict[tuple[str, int], ImageFont.FreeTypeFont] = {}


def _get_font(tag: str, path: str, idx: int, size: int) -> ImageFont.FreeTypeFont:
    size = max(1, int(round(size)))
    key = (tag, size)
    if key not in _FONT_CACHE:
        _FONT_CACHE[key] = ImageFont.truetype(path, size, index=idx)
    return _FONT_CACHE[key]


def font(size: int, heavy: bool = True) -> ImageFont.FreeTypeFont:
    """In-game HUD/billboard sans font."""
    if heavy:
        return _get_font("SANS_B", FONT_SANS_PATH, FONT_SANS_BOLD_IDX, size)
    return _get_font("SANS_R", FONT_SANS_PATH, FONT_SANS_REG_IDX, size)


def font_serif(size: int, black: bool = True) -> ImageFont.FreeTypeFont:
    return _get_font("SERIF_K" if black else "SERIF_B", FONT_SERIF_PATH, FONT_SERIF_BLACK_IDX if black else FONT_SERIF_BOLD_IDX, size)


def font_sans_bold(size: int) -> ImageFont.FreeTypeFont:
    return _get_font("SANS_B", FONT_SANS_PATH, FONT_SANS_BOLD_IDX, size)


def font_sans_reg(size: int) -> ImageFont.FreeTypeFont:
    return _get_font("SANS_R", FONT_SANS_PATH, FONT_SANS_REG_IDX, size)


def font_mono(size: int) -> ImageFont.FreeTypeFont:
    return _get_font("MONO", FONT_MONO_PATH, 0, size)


def font_latin(size: int) -> ImageFont.FreeTypeFont:
    return _get_font("LATIN", FONT_LATIN_PATH, 0, size)


def hex_to_rgb(h: str) -> tuple[int, int, int]:
    h = h.lstrip("#")
    if len(h) == 6:
        return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))
    return C_PAPER


_EMOJI_RE = re.compile(
    r"[\U00010000-\U0010FFFF\u2600-\u27BF\uFE00-\uFE0F\u200D\u20E3\u2B50\u27A1]+"
)


def strip_emoji(s: str) -> str:
    return _EMOJI_RE.sub("", s).strip()


def clamp(v: float, lo: float, hi: float) -> float:
    return lo if v < lo else hi if v > hi else v


def ease_out_back(t: float) -> float:
    t = clamp(t, 0.0, 1.0)
    c1 = 1.70158
    c3 = c1 + 1.0
    return max(0.32, 1.0 + c3 * ((t - 1.0) ** 3) + c1 * ((t - 1.0) ** 2))


def ease_out_cubic(t: float) -> float:
    t = clamp(t, 0.0, 1.0)
    return 1.0 - (1.0 - t) ** 3


def ease_in_out_sine(t: float) -> float:
    t = clamp(t, 0.0, 1.0)
    return 0.5 * (1.0 - math.cos(math.pi * t))


# ============================================================
# Sprite Loader & Cache
# ============================================================
SPRITE_FILES = {
    "heroSlacker": "hero_slacker.webp",
    "heroStriker": "hero_striker.webp",
    "heroMech": "hero_mech.webp",
    "enemyZombie": "enemy_zombie.webp",
    "enemyMailImp": "enemy_mail_imp.webp",
    "enemyClientMonster": "enemy_client_monster.webp",
    "enemyPptGolem": "enemy_ppt_golem.webp",
    "enemyDdlFlame": "enemy_ddl_flame.webp",
    "propCrate": "prop_crate.webp",
    "alarm": "boss_alarm.webp",
    "projector": "boss_projector.webp",
    "hydra": "boss_hydra.webp",
    "server": "boss_server.webp",
    "kpi": "boss_kpi.webp",
}

BASE_SPRITES: dict[str, Image.Image] = {}
FLASH_SPRITES: dict[str, Image.Image] = {}
RAGE_SPRITES: dict[str, Image.Image] = {}
SCALED_CACHE: dict[tuple[str, str, int, int], Image.Image] = {}

for k, fn in SPRITE_FILES.items():
    im = Image.open(SPRITE_DIR / fn).convert("RGBA")
    BASE_SPRITES[k] = im
    arr = np.array(im, dtype=np.uint8)
    flash_arr = arr.copy()
    flash_arr[..., 0] = C_PAPER[0]
    flash_arr[..., 1] = C_PAPER[1]
    flash_arr[..., 2] = C_PAPER[2]
    FLASH_SPRITES[k] = Image.fromarray(flash_arr, "RGBA")
    rage_arr = arr.astype(np.float32)
    rage_arr[..., 0] = rage_arr[..., 0] * 0.56 + C_RED[0] * 0.44
    rage_arr[..., 1] = rage_arr[..., 1] * 0.56 + C_RED[1] * 0.44
    rage_arr[..., 2] = rage_arr[..., 2] * 0.56 + C_RED[2] * 0.44
    RAGE_SPRITES[k] = Image.fromarray(np.clip(rage_arr, 0, 255).astype(np.uint8), "RGBA")


def get_sprite(key: str, variant: str, w: int, h: int, rot_deg: float = 0.0) -> Image.Image:
    w = max(8, int(round(w)))
    h = max(8, int(round(h)))
    qw = max(8, (w // 2) * 2)
    qh = max(8, (h // 2) * 2)
    cache_key = (key, variant, qw, qh)
    img = SCALED_CACHE.get(cache_key)
    if img is None:
        src = BASE_SPRITES[key] if variant == "base" else FLASH_SPRITES[key] if variant == "flash" else RAGE_SPRITES[key]
        img = src.resize((qw, qh), Image.Resampling.BILINEAR)
        SCALED_CACHE[cache_key] = img
    if abs(rot_deg) > 1.0:
        return img.rotate(-rot_deg, resample=Image.Resampling.BILINEAR, expand=True)
    return img


def paste_centered(dst: Image.Image, src: Image.Image, cx: float, cy: float, alpha_mult: float = 1.0) -> None:
    if alpha_mult <= 0.02:
        return
    if alpha_mult < 0.99:
        src = src.copy()
        a = src.getchannel("A").point(lambda p: int(p * alpha_mult))
        src.putalpha(a)
    x0 = int(round(cx - src.width * 0.5))
    y0 = int(round(cy - src.height * 0.5))
    dst.paste(src, (x0, y0), src)


# ============================================================
# Art Loader, Scrims, Atmospheric Backdrops & Editorial Type
# ============================================================
def aspect_fill(im: Image.Image, tw: int, th: int, apply_grain: bool = False) -> Image.Image:
    iw, ih = im.size
    scale = max(tw / iw, th / ih)
    nw, nh = int(round(iw * scale)), int(round(ih * scale))
    resized = im.resize((nw, nh), Image.Resampling.LANCZOS)
    x0 = (nw - tw) // 2
    y0 = (nh - th) // 2
    cropped = resized.crop((x0, y0, x0 + tw, y0 + th))
    if apply_grain:
        rng = np.random.default_rng(42)
        arr = np.array(cropped, dtype=np.int16)
        noise = rng.normal(0.0, 3.6, size=(th, tw, 1)).astype(np.int16)
        arr = np.clip(arr + noise, 0, 255).astype(np.uint8)
        cropped = Image.fromarray(arr, "RGB")
    return cropped


def make_atmospheric_stage(src_3x4: Image.Image, dim: float = 0.34, blur_r: float = 42.0) -> Image.Image:
    bg = aspect_fill(src_3x4, W, H, apply_grain=False).filter(ImageFilter.GaussianBlur(radius=blur_r))
    arr = (np.array(bg, dtype=np.float32) * dim).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def make_vertical_scrim(w: int, h: int, top_alpha: int, top_end: int, bot_start: int, bot_alpha: int) -> Image.Image:
    alpha = np.zeros((h, w), dtype=np.uint8)
    if top_alpha > 0 and top_end > 0:
        ramp = (np.linspace(1.0, 0.0, top_end) ** 1.35 * top_alpha).astype(np.uint8)
        alpha[:top_end, :] = ramp[:, None]
    if bot_alpha > 0 and bot_start < h:
        ramp_b = (np.linspace(0.0, 1.0, h - bot_start) ** 1.35 * bot_alpha).astype(np.uint8)
        alpha[bot_start:, :] = np.maximum(alpha[bot_start:, :], ramp_b[:, None])
    scrim = Image.new("RGBA", (w, h), (10, 12, 20, 0))
    scrim.putalpha(Image.fromarray(alpha, "L"))
    return scrim


ART_RAW = {k: Image.open(ART_DIR / f"{k}.png").convert("RGB") for k in ["cover_keyart", "cover_viral_keyart", "scene1_desk", "scene2_ambush", "scene3_awakening"]}
# High-res 3:4 masters with subtle cohesive film grain
ART_3X4 = {k: aspect_fill(v, 1080, 1440, apply_grain=True).convert("RGBA") for k, v in ART_RAW.items()}
# Upscaled slightly larger buffers (1180x1574) for smooth zero-blur Ken Burns motion inside y=240..1680
ART_KB = {k: aspect_fill(v, 1188, 1584, apply_grain=True) for k, v in ART_RAW.items()}
STAGE_BG = {k: make_atmospheric_stage(v, dim=0.33, blur_r=44.0) for k, v in ART_RAW.items()}
STAGE_BG_GAME_MINT = make_atmospheric_stage(ART_RAW["cover_keyart"], dim=0.22, blur_r=48.0)
STAGE_BG_GAME_CRIMSON = make_atmospheric_stage(ART_RAW["scene2_ambush"], dim=0.24, blur_r=48.0)
STAGE_BG_GAME_AWAKEN = make_atmospheric_stage(ART_RAW["scene3_awakening"], dim=0.24, blur_r=48.0)

# Pre-baked portrait badges for VN dialogue boxes
VN_AVATARS: dict[str, Image.Image] = {}
for av_key, sp_key, accent in [("hero", "heroSlacker", C_MINT), ("hydra", "hydra", C_PURPLE), ("kpi", "kpi", C_RED)]:
    av = Image.new("RGBA", (128, 128), (0, 0, 0, 0))
    ad = ImageDraw.Draw(av)
    ad.ellipse((4, 4, 124, 124), fill=(22, 25, 38, 255))
    sp = get_sprite(sp_key, "base", 96, 96)
    paste_centered(av, sp, 64, 66)
    # Mask circle clean
    mask = Image.new("L", (128, 128), 0)
    ImageDraw.Draw(mask).ellipse((4, 4, 124, 124), fill=255)
    av.putalpha(mask)
    ad = ImageDraw.Draw(av)
    ad.ellipse((4, 4, 124, 124), outline=(*accent, 235), width=3)
    VN_AVATARS[av_key] = av

# Soft vignette overlay for dramatic scenes
VIGNETTE_CRIMSON = Image.new("RGBA", (W, 1440), (0, 0, 0, 0))
yy_v, xx_v = np.mgrid[0:1440, 0:W].astype(np.float32)
r_v = np.sqrt(((xx_v - W * 0.5) / (W * 0.52)) ** 2 + ((yy_v - 720) / 720.0) ** 2)
vig_a = (np.clip((r_v - 0.65) / 0.65, 0.0, 1.0) ** 1.6 * 135).astype(np.uint8)
VIGNETTE_CRIMSON = Image.new("RGBA", (W, 1440), (140, 14, 46, 0))
VIGNETTE_CRIMSON.putalpha(Image.fromarray(vig_a, "L"))


def soft_text(
    draw: ImageDraw.ImageDraw,
    pos: tuple[float, float],
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int] | tuple[int, int, int, int],
    anchor: str = "lm",
    shadow_alpha: int = 165,
    shadow_off: tuple[int, int] = (0, 3),
) -> None:
    x, y = pos
    if shadow_alpha > 0:
        draw.text((x + shadow_off[0], y + shadow_off[1]), text, font=fnt, fill=(8, 10, 18, shadow_alpha), anchor=anchor)
    draw.text((x, y), text, font=fnt, fill=fill, anchor=anchor)


def compose_cinema_art(stage: Image.Image, kb_img: Image.Image, zoom: float = 1.0, pan_y: float = 0.0, crimson_tint: float = 0.0) -> None:
    """Places a crisp 1080x1440 Ken-Burns art window squarely inside the 3:4 safe zone y=240..1680."""
    kw, kh = kb_img.size
    crop_w = 1080.0 / zoom
    crop_h = 1440.0 / zoom
    cx = kw * 0.5
    cy = kh * 0.5 + pan_y
    x0 = clamp(cx - crop_w * 0.5, 0, kw - crop_w)
    y0 = clamp(cy - crop_h * 0.5, 0, kh - crop_h)
    patch = kb_img.crop((x0, y0, x0 + crop_w, y0 + crop_h)).resize((W, 1440), Image.Resampling.BILINEAR).convert("RGBA")
    if crimson_tint > 0.02:
        vig = VIGNETTE_CRIMSON.copy()
        va = vig.getchannel("A").point(lambda p: int(p * crimson_tint))
        vig.putalpha(va)
        patch = Image.alpha_composite(patch, vig)
    # Bottom subtle dark readability gradient inside the 3:4 safe window (does not touch mid/upper art)
    scrim = make_vertical_scrim(W, 1440, top_alpha=125, top_end=210, bot_start=980, bot_alpha=165)
    patch = Image.alpha_composite(patch, scrim)
    stage.paste(patch, (0, SAFE_Y0))
    d = ImageDraw.Draw(stage)
    # Hairline editorial cinema rules framing the 3:4 frame cleanly
    d.line((0, SAFE_Y0, W, SAFE_Y0), fill=(248, 247, 242, 65), width=1)
    d.line((0, SAFE_Y1, W, SAFE_Y1), fill=(248, 247, 242, 65), width=1)


def wrap_cjk_lines(draw: ImageDraw.ImageDraw, text: str, fnt: ImageFont.FreeTypeFont, max_w: float) -> list[str]:
    lines: list[str] = []
    cur = ""
    for ch in text:
        cand = cur + ch
        bw = draw.textbbox((0, 0), cand, font=fnt)[2]
        if cur and bw > max_w:
            lines.append(cur)
            cur = ch
        else:
            cur = cand
    if cur:
        lines.append(cur)
    return lines


def draw_vn_dialogue(
    stage: Image.Image,
    avatar_key: str,
    speaker: str,
    full_text: str,
    accent: tuple[int, int, int],
    reveal_chars: int,
    t_now: float,
    compact: bool = False,
) -> None:
    """Visual-Novel frosted dark dialogue box inside the central 3:4 safe zone."""
    ov = Image.new("RGBA", stage.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(ov)

    if not compact:
        x0, y0, x1, y1 = 56, 1384, 1024, 1620
        d.rounded_rectangle((x0 + 4, y0 + 8, x1 + 4, y1 + 8), radius=22, fill=(4, 6, 12, 130))
        d.rounded_rectangle((x0, y0, x1, y1), radius=22, fill=(14, 17, 28, 228), outline=(*accent, 210), width=2)
        d.rounded_rectangle((x0 + 6, y0 + 6, x1 - 6, y1 - 6), radius=17, outline=(248, 247, 242, 24), width=1)

        # Avatar portrait
        av = VN_AVATARS[avatar_key]
        ov.paste(av, (x0 + 24, y0 + 54), av)

        # Speaker tag pill sitting cleanly on top-left of text area
        f_spk = font_sans_bold(24)
        sb = d.textbbox((0, 0), speaker, font=f_spk)
        sw = (sb[2] - sb[0]) + 34
        tx0 = x0 + 180
        d.rounded_rectangle((tx0, y0 - 19, tx0 + sw, y0 + 21), radius=11, fill=(22, 26, 40, 248), outline=(*accent, 235), width=2)
        d.text((tx0 + sw * 0.5, y0 + 1), speaker, font=f_spk, fill=accent, anchor="mm")

        # Typewriter text wrapped against FULL line first so words never jump mid-typing
        f_body = font_sans_reg(33)
        wrapped = wrap_cjk_lines(d, full_text, f_body, max_w=748.0)
        rem = max(0, reveal_chars)
        for li, line in enumerate(wrapped[:2]):
            if rem <= 0:
                break
            vis = line[:rem]
            rem -= len(line)
            soft_text(d, (tx0, y0 + 70 + li * 54), vis, f_body, (248, 247, 242, 255), anchor="lm", shadow_alpha=110, shadow_off=(0, 2))

        if reveal_chars >= len(full_text):
            bob = math.sin(t_now * 7.5) * 4.0
            cx, cy = x1 - 38, y1 - 28 + bob
            d.polygon([(cx - 8, cy - 5), (cx + 8, cy - 5), (cx, cy + 6)], fill=(*accent, 230))
    else:
        # Compact floating strip cleanly below the phone frame in Scene 5 (y=1526..1646)
        x0, y0, x1, y1 = 76, 1526, 1004, 1646
        d.rounded_rectangle((x0 + 3, y0 + 6, x1 + 3, y1 + 6), radius=20, fill=(4, 6, 12, 120))
        d.rounded_rectangle((x0, y0, x1, y1), radius=20, fill=(14, 17, 28, 232), outline=(*accent, 200), width=2)
        av = VN_AVATARS[avatar_key].resize((86, 86), Image.Resampling.BILINEAR)
        ov.paste(av, (x0 + 20, y0 + 17), av)

        tx0 = x0 + 128
        f_spk = font_sans_bold(22)
        d.text((tx0, y0 + 32), speaker, font=f_spk, fill=accent, anchor="lm")
        f_body = font_sans_reg(32)
        vis = full_text[: max(0, reveal_chars)]
        soft_text(d, (tx0, y0 + 78), vis, f_body, (248, 247, 242, 255), anchor="lm", shadow_alpha=100, shadow_off=(0, 2))

    stage.alpha_composite(ov)


# ============================================================
# Vector Drawing Primitives (for authentic GameWorld frames)
# ============================================================
def stroke_text(
    draw: ImageDraw.ImageDraw,
    pos: tuple[float, float],
    text: str,
    fnt: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    outline: tuple[int, int, int] = C_INK,
    stroke_w: int = 5,
    anchor: str = "mm",
    shadow: tuple[int, int] | None = None,
) -> None:
    x, y = pos
    if shadow is not None:
        draw.text((x + shadow[0], y + shadow[1]), text, font=fnt, fill=C_INK, anchor=anchor)
    draw.text((x, y), text, font=fnt, fill=fill, anchor=anchor, stroke_width=stroke_w, stroke_fill=outline)


def draw_sticker_pill(
    draw: ImageDraw.ImageDraw,
    cx: float,
    cy: float,
    text: str,
    fnt: ImageFont.FreeTypeFont,
    bg: tuple[int, int, int],
    fg: tuple[int, int, int],
    pad_x: int = 26,
    pad_y: int = 12,
    radius: int = 16,
    border: int = 5,
    shadow_off: int = 7,
) -> tuple[int, int, int, int]:
    bbox = draw.textbbox((0, 0), text, font=fnt)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    bw, bh = tw + pad_x * 2, th + pad_y * 2
    x0, y0 = int(cx - bw * 0.5), int(cy - bh * 0.5)
    x1, y1 = x0 + bw, y0 + bh
    if shadow_off > 0:
        draw.rounded_rectangle((x0 + shadow_off, y0 + shadow_off, x1 + shadow_off, y1 + shadow_off), radius=radius, fill=C_INK)
    draw.rounded_rectangle((x0, y0, x1, y1), radius=radius, fill=bg, outline=C_INK, width=border)
    draw.text((cx, cy), text, font=fnt, fill=fg, anchor="mm")
    return (x0, y0, x1, y1)


def draw_reticle_icon(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, color: tuple[int, int, int]) -> None:
    lw = max(2, int(r * 0.35))
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=C_INK, width=lw + 2)
    draw.ellipse((cx - r, cy - r, cx + r, cy + r), outline=color, width=lw)
    for dx, dy in [(-1, 0), (1, 0), (0, -1), (0, 1)]:
        draw.line((cx + dx * r * 0.55, cy + dy * r * 0.55, cx + dx * r * 1.45, cy + dy * r * 1.45), fill=color, width=lw)


def draw_star_poly(draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, rot: float, fill: tuple[int, int, int]) -> None:
    pts = []
    for k in range(8):
        ang = rot + k * math.pi / 4.0
        rr = r if k % 2 == 0 else r * 0.42
        pts.append((cx + math.cos(ang) * rr, cy + math.sin(ang) * rr))
    draw.polygon(pts, fill=fill, outline=C_INK, width=2)


def draw_dashed_rounded_rect(
    draw: ImageDraw.ImageDraw,
    box: tuple[float, float, float, float],
    color: tuple[int, int, int],
    width: int = 3,
    dash: float = 12.0,
    gap: float = 9.0,
    phase: float = 0.0,
) -> None:
    x0, y0, x1, y1 = box
    edges = [((x0, y0), (x1, y0)), ((x1, y0), (x1, y1)), ((x1, y1), (x0, y1)), ((x0, y1), (x0, y0))]
    step = dash + gap
    for (ax, ay), (bx, by) in edges:
        dist = math.hypot(bx - ax, by - ay)
        if dist < 1:
            continue
        ux, uy = (bx - ax) / dist, (by - ay) / dist
        d = (phase % step) - step
        while d < dist:
            s0 = max(0.0, d)
            s1 = min(dist, d + dash)
            if s1 > s0:
                draw.line((ax + ux * s0, ay + uy * s0, ax + ux * s1, ay + uy * s1), fill=color, width=width)
            d += step


# ============================================================
# Authentic GameWorld Viewport Renderer (crops active arena)
# ============================================================
GAME_W = 390
GAME_Y0 = 82.0
GAME_H = 682.0
PLAYER_Y = 650.0
TRACK_TOP_Y = 110.0
TRACK_BOTTOM_Y = 760.0
LANE_HALF_W = 160.0
SCROLL_SPEED = 136.0
CLOCK_MARKS = ["09:00", "11:00", "13:00", "15:00", "17:30", "18:00"]


def depth_scale(y: float) -> float:
    t = clamp((y - TRACK_TOP_Y) / (PLAYER_Y - TRACK_TOP_Y), 0.0, 1.15)
    return 0.76 + 0.26 * t


def project_x(lane_x: float, y: float) -> float:
    return GAME_W * 0.5 + lane_x * depth_scale(y)


def render_game_viewport(
    fr: dict,
    vp_w: int = 632,
    vp_h: int = 1104,
    show_finger: bool = True,
    tap_ult_prog: float = 0.0,
) -> Image.Image:
    S = vp_w / float(GAME_W)

    def gx(x: float) -> float:
        return x * S

    def gy(y: float) -> float:
        return (y - GAME_Y0) * S

    im = Image.new("RGBA", (vp_w, vp_h), (24, 26, 36, 255))
    draw = ImageDraw.Draw(im)

    # 1. Perspective Road Surface
    tlx, trx = gx(project_x(-LANE_HALF_W, TRACK_TOP_Y)), gx(project_x(LANE_HALF_W, TRACK_TOP_Y))
    blx, brx = gx(project_x(-LANE_HALF_W, TRACK_BOTTOM_Y)), gx(project_x(LANE_HALF_W, TRACK_BOTTOM_Y))
    ty, by = gy(TRACK_TOP_Y), gy(TRACK_BOTTOM_Y)
    draw.polygon([(tlx, ty), (trx, ty), (brx, by), (blx, by)], fill=(*C_TRACK, 255))

    scroll = (fr["elapsedSec"] * SCROLL_SPEED) % 90.0
    for step_y in np.arange(TRACK_TOP_Y + scroll, TRACK_BOTTOM_Y, 90.0):
        lx0, rx0 = gx(project_x(-LANE_HALF_W, step_y)), gx(project_x(LANE_HALF_W, step_y))
        py = gy(step_y)
        draw.line((lx0, py, rx0, py), fill=(46, 51, 77, 160), width=max(2, int(2 * S)))

    for step_y in np.arange(TRACK_TOP_Y + (scroll % 45.0), TRACK_BOTTOM_Y, 45.0):
        py1 = gy(step_y)
        py2 = gy(min(TRACK_BOTTOM_Y, step_y + 20.0))
        cx = gx(GAME_W * 0.5)
        draw.line((cx - 4 * S, py1, cx - 4 * S, py2), fill=(110, 120, 155, 130), width=max(2, int(2 * S)))
        draw.line((cx + 4 * S, py1, cx + 4 * S, py2), fill=(110, 120, 155, 130), width=max(2, int(2 * S)))

    f_clock = font(int(10 * S), False)
    for idx in range(len(CLOCK_MARKS)):
        cy_mark = TRACK_TOP_Y + ((idx * 135.0 + fr["elapsedSec"] * SCROLL_SPEED * 0.65) % (TRACK_BOTTOM_Y - TRACK_TOP_Y))
        lx_mark = gx(project_x(-LANE_HALF_W + 10, cy_mark))
        draw.text((lx_mark, gy(cy_mark)), CLOCK_MARKS[idx], font=f_clock, fill=(130, 140, 175, 190), anchor="lm")

    draw.line((tlx, ty, blx, by), fill=(*C_MINT, 255), width=max(3, int(3.5 * S)))
    draw.line((trx, ty, brx, by), fill=(*C_MINT, 255), width=max(3, int(3.5 * S)))

    # Boss ground hazards
    for hz in fr.get("hazards", []):
        hx = gx(project_x(hz["laneX"], PLAYER_Y))
        if hz["kind"] == "laser":
            hw = hz["halfWidth"] * S
            if hz["warnTimer"] > 0:
                prog = 1.0 - clamp(hz["warnTimer"] / max(0.01, hz["warnMax"]), 0.0, 1.0)
                draw.rectangle((hx - hw, ty, hx + hw, gy(PLAYER_Y + 40)), fill=(255, 51, 102, 48))
                in_w = hw * prog
                draw.rectangle((hx - in_w, ty, hx + in_w, gy(PLAYER_Y + 40)), fill=(255, 230, 0, 85))
                draw.line((hx, ty, hx, gy(PLAYER_Y + 40)), fill=(*C_RED, 220), width=max(2, int(2 * S)))
            else:
                draw.rectangle((hx - hw, ty, hx + hw, gy(PLAYER_Y + 50)), fill=(*C_RED, 230))
                draw.rectangle((hx - hw * 0.45, ty, hx + hw * 0.45, gy(PLAYER_Y + 50)), fill=(*C_YELLOW_BRIGHT, 255))
        else:
            r = hz["halfWidth"] * S
            hy = gy(hz["y"])
            draw.ellipse((hx - r, hy - r * 0.42, hx + r, hy + r * 0.42), fill=(255, 51, 102, 75), outline=(*C_RED, 255), width=3)

    # 2. Gates & Supply Crates
    gates_sorted = sorted(fr["gates"], key=lambda g: g["y"])
    for g in gates_sorted:
        ds = depth_scale(g["y"]) * g.get("bounceScale", 1.0) * S
        sx = gx(project_x(g["laneX"], g["y"]))
        sy = gy(g["y"])
        alpha_m = 0.25 if g["pairLocked"] else 1.0

        if g["kind"] == "SUPPLY_CRATE":
            sp = get_sprite("propCrate", "flash" if g["hitFlash"] else "base", 72 * ds, 72 * ds)
            draw.ellipse((sx - 30 * ds, sy + 10 * ds, sx + 30 * ds, sy + 28 * ds), outline=(*C_YELLOW_BRIGHT, 255), width=max(2, int(2.5 * S)))
            paste_centered(im, sp, sx, sy, alpha_m)
            bw = 68 * ds
            bx0, by0 = sx - bw * 0.5, sy - 42 * ds
            draw.rounded_rectangle((bx0 - 2, by0, bx0 + bw + 2, by0 + 11 * S), radius=4, fill=C_INK)
            draw.rounded_rectangle((bx0, by0 + 2 * S, bx0 + bw * g["barrelRatio"], by0 + 9 * S), radius=3, fill=C_YELLOW_BRIGHT)
            draw_reticle_icon(draw, bx0 - 10 * ds, by0 + 5.5 * S, 4.8 * ds, C_YELLOW_BRIGHT)

            tag = strip_emoji(g["labelOverride"] or "空投补给")
            stroke_text(draw, (sx, sy - 46 * ds), tag, font(int(12 * ds)), C_YELLOW_BRIGHT, C_INK, stroke_w=max(2, int(3 * S)), anchor="mb")
            if g["rewardWeapon"]:
                pill_t = "换枪 · 5发散弹" if g["rewardWeapon"] == "keyboard" else "换枪 · 追踪弹"
                draw_sticker_pill(draw, sx, sy - 68 * ds, pill_t, font(int(9 * ds)), C_INK, C_YELLOW_BRIGHT, pad_x=int(8 * ds), pad_y=int(3 * ds), radius=5, border=2, shadow_off=0)
            continue

        gw, gh = g["width"] * ds, g["height"] * ds
        x0, y0, x1, y1 = sx - gw * 0.5, sy - gh * 0.5, sx + gw * 0.5, sy + gh * 0.5
        shootable = g["shootable"]

        main_col = C_MINT
        fill_col = (0, 245, 212, 52 if not shootable else 200)
        tag_text = "摸鱼增员"
        if g["op"] in ("-", "÷"):
            main_col = C_RED
            fill_col = (44, 14, 24, 224) if shootable else (255, 51, 102, 65)
            tag_text = strip_emoji(f"目标 · {g['labelOverride']}") if g["labelOverride"] else ("狂射洗白!" if shootable else "加班减员")
        elif g["kind"] == "OVERLOAD":
            main_col = C_YELLOW_BRIGHT
            fill_col = (24, 16, 42, 215)
            tag_text = "高压过载"
        elif g["op"] == "BOX":
            main_col = C_PURPLE
            fill_col = (155, 93, 229, 70)
            tag_text = "神秘盲盒"
        elif g["op"] == "ULT":
            main_col = C_YELLOW_BRIGHT
            fill_col = (255, 230, 0, 60)
            tag_text = "下班充能"
        elif g["flippedToBlue"]:
            main_col = C_MINT
            fill_col = (10, 38, 44, 218) if shootable else (0, 245, 212, 62)
            tag_text = f"洗白加码 ({g['value']}/{g['flipCap']})" if shootable else "已满额 · 穿透"

        if g["hitFlash"]:
            fill_col = (248, 247, 242, 195)
        if g["pairLocked"]:
            fill_col = (*fill_col[:3], int(fill_col[3] * 0.35))

        draw.rounded_rectangle((x0, y0, x1, y1), radius=int(9 * ds), fill=fill_col)

        if shootable:
            draw.rounded_rectangle((x0, y0, x1, y1), radius=int(9 * ds), outline=C_INK, width=max(3, int(4 * S)))
            draw.rounded_rectangle((x0 + 2.5, y0 + 2.5, x1 - 2.5, y1 - 2.5), radius=int(7 * ds), outline=main_col, width=max(2, int(2.5 * S)))
            draw.rectangle((x0 - 5 * S, y0 - 4 * S, x0 + 5 * S, y1 + 4 * S), fill=main_col, outline=C_INK, width=2)
            draw.rectangle((x1 - 5 * S, y0 - 4 * S, x1 + 5 * S, y1 + 4 * S), fill=main_col, outline=C_INK, width=2)
            draw_reticle_icon(draw, x0 + 18 * ds, sy, 6.2 * ds, main_col)

            pb_x0, pb_x1 = x0 + 10 * S, x1 - 10 * S
            pb_y0, pb_y1 = y1 - 9 * S, y1 - 3 * S
            draw.rounded_rectangle((pb_x0, pb_y0, pb_x1, pb_y1), radius=3, fill=C_INK)
            bar_col = C_YELLOW_BRIGHT if (g["flippedToBlue"] and g["op"] == "+") else C_MINT
            if g["progress"] > 0.02:
                pw = max(5, (pb_x1 - pb_x0 - 2) * g["progress"])
                draw.rounded_rectangle((pb_x0 + 1, pb_y0 + 1, pb_x0 + 1 + pw, pb_y1 - 1), radius=2, fill=bar_col)
        else:
            draw_dashed_rounded_rect(draw, (x0 + 1, y0 + 1, x1 - 1, y1 - 1), main_col, width=max(2, int(2.5 * S)), dash=9 * ds, gap=6 * ds, phase=-fr["elapsedSec"] * 32)
            draw.rectangle((x0 - 2.5 * S, y0, x0 + 2.5 * S, y1), fill=main_col, outline=C_INK, width=1)
            draw.rectangle((x1 - 2.5 * S, y0, x1 + 2.5 * S, y1), fill=main_col, outline=C_INK, width=1)

        f_tag = font(max(9, int(9.5 * ds)))
        draw_sticker_pill(draw, sx, y0 - 2 * ds, tag_text, f_tag, C_INK, main_col, pad_x=int(8 * ds), pad_y=int(2.5 * ds), radius=5, border=2, shadow_off=0)

        raw_lbl = f"+{g['value']}" if (g["flippedToBlue"] and g["op"] == "+") else (f"{g['op']}{g['value']}" if g["op"] in ("+", "×", "-", "÷") else (g["labelOverride"] or g["op"]))
        lbl = strip_emoji(raw_lbl)
        f_lbl = font(int((14 if len(lbl) > 5 else 24) * ds))
        lx = sx + (6 * ds if shootable else 0)
        stroke_text(draw, (lx, sy + 1 * ds), lbl, f_lbl, C_PAPER, C_INK, stroke_w=max(2, int(4 * S)), anchor="mm")

    # 3. Enemies & Boss
    enemies_sorted = sorted(fr["enemies"], key=lambda e: e["y"])
    e_key_map = {
        "overtime_zombie": ("enemyZombie", 48),
        "cc_all": ("enemyMailImp", 52),
        "client_tweak": ("enemyClientMonster", 62),
        "client_mini": ("enemyClientMonster", 42),
        "ppt_pie": ("enemyPptGolem", 72),
        "ddl_flame": ("enemyDdlFlame", 52),
    }
    for e in enemies_sorted:
        ds = depth_scale(e["y"]) * S
        sx = gx(project_x(e["laneX"], e["y"]))
        sy = gy(e["y"])
        skey, base_sz = e_key_map.get(e["configId"], ("enemyZombie", 48))
        fade = clamp((e["y"] - (TRACK_TOP_Y - 20)) / 46.0, 0.0, 1.0)
        if fade <= 0.02:
            continue
        sp = get_sprite(skey, "flash" if e["flash"] else "base", base_sz * ds, base_sz * ds, math.degrees(math.sin(e["wobble"]) * 0.07 + e["rot"]))
        paste_centered(im, sp, sx, sy, fade)

    boss = fr["boss"]
    if boss and boss.get("active"):
        ds = depth_scale(boss["y"]) * S
        bx, by_b = gx(project_x(boss["laneX"], boss["y"])), gy(boss["y"])
        bsz = 166 if boss["style"] == "kpi" else 148
        variant = "flash" if boss["flash"] else "rage" if boss["enraged"] else "base"
        bsp = get_sprite(boss["style"], variant, bsz * ds, bsz * ds)
        if boss["shieldTimer"] > 0:
            rr = (boss["radius"] + 16) * ds
            draw.ellipse((bx - rr, by_b - rr, bx + rr, by_b + rr), outline=(*C_MINT, 240), width=max(3, int(4 * S)))
        paste_centered(im, bsp, bx, by_b)

    # 4. Squad Fermat Spiral Units
    units_sorted = sorted(fr["units"], key=lambda u: u["dy"])
    for u in units_sorted:
        ux = fr["leaderLaneX"] + u["dx"]
        uy = PLAYER_Y + u["dy"]
        ds = depth_scale(uy) * S
        sx, sy = gx(project_x(ux, uy)), gy(uy)
        skey = "heroMech" if u["tier"] == 10 else "heroStriker" if u["tier"] == 5 else "heroSlacker"
        base_sz = 68 if u["tier"] == 10 else 58 if u["tier"] == 5 else 46
        rot_deg = math.degrees(math.sin(u["phase"] + fr["elapsedSec"] * 12.0) * 0.06)
        sp = get_sprite(skey, "base", base_sz * ds, base_sz * ds, rot_deg)
        paste_centered(im, sp, sx, sy)

    # 5. Projectiles & Boss Projectiles
    for b in fr["bullets"]:
        ds = depth_scale(b["y"]) * S
        bx, by_p = gx(project_x(b["laneX"], b["y"])), gy(b["y"])
        col = hex_to_rgb(b["color"])
        r = b["radius"] * ds
        kind = b["kind"]
        if kind == "keycap":
            kw = max(14, r * 2.4)
            draw.rounded_rectangle((bx - kw * 0.5, by_p - kw * 0.42, bx + kw * 0.5, by_p + kw * 0.42), radius=3, fill=C_PAPER, outline=C_INK, width=2)
            draw.text((bx, by_p), b["keyLabel"][:4], font=font(max(7, int(r * 0.90))), fill=C_INK, anchor="mm")
        elif kind == "beam":
            draw.rounded_rectangle((bx - 3 * ds, by_p - 12 * ds, bx + 3 * ds, by_p + 12 * ds), radius=2, fill=col, outline=C_INK, width=2)
        elif kind == "drone":
            ang = math.atan2(b["vx"], -b["vy"])
            draw.line((bx - math.sin(ang) * 14 * ds, by_p + math.cos(ang) * 14 * ds, bx, by_p), fill=(*C_YELLOW_BRIGHT, 200), width=max(2, int(3.5 * ds)))
            draw.ellipse((bx - r, by_p - r, bx + r, by_p + r), fill=C_YELLOW_BRIGHT, outline=C_INK, width=2)
        elif kind == "wave":
            draw.arc((bx - r * 1.4, by_p - r * 0.7, bx + r * 1.4, by_p + r * 0.7), 190, 350, fill=C_MINT, width=max(3, int(4 * ds)))
        else:
            draw.ellipse((bx - r, by_p - r * 1.3, bx + r, by_p + r * 1.3), fill=col, outline=C_INK, width=2)

    for bp in fr["bossProjs"]:
        ds = depth_scale(bp["y"]) * S
        bx, by_p = gx(project_x(bp["laneX"], bp["y"])), gy(bp["y"])
        r = bp["radius"] * ds
        col = hex_to_rgb(bp["color"])
        draw.ellipse((bx - r, by_p - r, bx + r, by_p + r), fill=col, outline=C_INK, width=max(2, int(2.5 * S)))
        draw.ellipse((bx - r * 0.42, by_p - r * 0.42, bx + r * 0.42, by_p + r * 0.42), fill=C_YELLOW_BRIGHT)

    # 6. Lightning Arcs, Particles & Floating Texts
    for a in fr["arcs"]:
        x1, y1, x2, y2 = gx(a["x1"]), gy(a["y1"]), gx(a["x2"]), gy(a["y2"])
        mx, my = (x1 + x2) * 0.5 + 8 * S, (y1 + y2) * 0.5 - 8 * S
        c_main = C_MINT if a["superconduct"] else C_PURPLE
        draw.line([(x1, y1), (mx, my), (x2, y2)], fill=C_INK, width=max(4, int(5.5 * S)))
        draw.line([(x1, y1), (mx, my), (x2, y2)], fill=c_main, width=max(2, int(3.2 * S)))
        draw.line([(x1, y1), (mx, my), (x2, y2)], fill=C_YELLOW_BRIGHT if a["superconduct"] else C_PAPER, width=max(1, int(1.5 * S)))

    for p in fr["particles"]:
        px, py = gx(p["x"]), gy(p["y"])
        sz = p["size"] * (0.4 + 0.7 * p["alpha"]) * S
        col = hex_to_rgb(p["color"])
        if p["shape"] == "star":
            draw_star_poly(draw, px, py, sz * 1.15, p["rot"], col)
        else:
            draw.rectangle((px - sz * 0.5, py - sz * 0.5, px + sz * 0.5, py + sz * 0.5), fill=col, outline=C_INK, width=1)

    for ft in fr["floatingTexts"]:
        fx, fy = gx(ft["x"]), gy(ft["y"])
        fnt = font(max(11, int(ft["size"] * ft["scalePop"] * S)))
        stroke_text(draw, (fx, fy), strip_emoji(ft["text"]), fnt, hex_to_rgb(ft["color"]), C_INK, stroke_w=max(2, int(3 * S)), anchor="mm")

    # 7. Leader Squad Badge & 3-Channel Quips
    lx = gx(project_x(fr["leaderLaneX"], PLAYER_Y))
    badge_y = gy(max(PLAYER_Y - 120.0, PLAYER_Y + fr["footprintTopDy"] - 22.0))
    draw_sticker_pill(draw, lx, badge_y, str(fr["squadCount"]), font(int(15 * S)), C_YELLOW_BRIGHT, C_INK, pad_x=int(12 * S), pad_y=int(4 * S), radius=int(13 * S), border=max(2, int(2.5 * S)), shadow_off=int(3 * S))

    sb = fr.get("squadBubble")
    if sb:
        accent = C_YELLOW_BRIGHT if sb["tone"] == "hype" else C_RED if sb["tone"] == "panic" else C_MINT
        f_sb = font(int(11.5 * S))
        sb_txt = strip_emoji(sb["text"])
        bbox = draw.textbbox((0, 0), sb_txt, font=f_sb)
        tw = bbox[2] - bbox[0]
        bw = min(int(230 * S), max(int(110 * S), tw + int(34 * S)))
        bh = int(32 * S)
        bx_c = clamp(lx, bw * 0.5 + 10 * S, vp_w - bw * 0.5 - 10 * S)
        by_c = badge_y - 26 * S - bh * 0.5
        hw, hh = bw * 0.5, bh * 0.5
        draw.rounded_rectangle((bx_c - hw + 3 * S, by_c - hh + 3 * S, bx_c + hw + 3 * S, by_c + hh + 3 * S), radius=int(9 * S), fill=C_INK)
        draw.rounded_rectangle((bx_c - hw, by_c - hh, bx_c + hw, by_c + hh), radius=int(9 * S), fill=C_PAPER, outline=C_INK, width=max(2, int(2.5 * S)))
        draw.rectangle((bx_c - hw + 3, by_c - hh + 3, bx_c - hw + 9 * S, by_c + hh - 3), fill=accent)
        tx = clamp(lx, bx_c - hw + 18 * S, bx_c + hw - 18 * S)
        draw.polygon([(tx - 6 * S, by_c + hh - 2), (tx, by_c + hh + 9 * S), (tx + 6 * S, by_c + hh - 2)], fill=C_PAPER)
        draw.line([(tx - 6 * S, by_c + hh), (tx, by_c + hh + 9 * S), (tx + 6 * S, by_c + hh)], fill=C_INK, width=max(2, int(2.5 * S)))
        draw.text((bx_c + 4 * S, by_c), sb_txt, font=f_sb, fill=C_INK, anchor="mm")

    bb = fr.get("bossBubble")
    if bb and boss and boss.get("active"):
        bx_boss = gx(project_x(boss["laneX"], boss["y"]))
        by_boss = gy(boss["y"] + boss["radius"] + 26)
        f_bb = font(int(11.5 * S))
        bb_txt = strip_emoji(bb["text"])
        bbox = draw.textbbox((0, 0), bb_txt, font=f_bb)
        tw = bbox[2] - bbox[0]
        bw = min(int(260 * S), max(int(130 * S), tw + int(32 * S)))
        bh = int(34 * S)
        bx_c = clamp(bx_boss, bw * 0.5 + 12 * S, vp_w - bw * 0.5 - 12 * S)
        hw, hh = bw * 0.5, bh * 0.5
        pts = [
            (bx_c - hw, by_boss - hh),
            (bx_c, by_boss - hh - 4 * S),
            (bx_c + hw, by_boss - hh),
            (bx_c + hw + 5 * S, by_boss),
            (bx_c + hw, by_boss + hh),
            (bx_c, by_boss + hh + 4 * S),
            (bx_c - hw, by_boss + hh),
            (bx_c - hw - 5 * S, by_boss),
        ]
        draw.polygon([(px + 3 * S, py + 3 * S) for px, py in pts], fill=C_INK)
        draw.polygon(pts, fill=C_BOSS_PLUM, outline=C_RED, width=max(3, int(3 * S)))
        tx = clamp(bx_boss, bx_c - hw + 20 * S, bx_c + hw - 20 * S)
        draw.polygon([(tx - 7 * S, by_boss - hh + 2), (tx, by_boss - hh - 11 * S), (tx + 7 * S, by_boss - hh + 2)], fill=C_BOSS_PLUM, outline=C_RED, width=2)
        draw.text((bx_c, by_boss), bb_txt, font=f_bb, fill=C_YELLOW_BRIGHT, anchor="mm")

    # 8. Compact Viewport HUD
    draw_sticker_pill(draw, gx(76), 24 * S, "周一·突围", font(int(11.5 * S)), C_YELLOW_BRIGHT, C_INK, pad_x=int(10 * S), pad_y=int(4 * S), radius=int(7 * S), border=2, shadow_off=int(2.5 * S))
    wh_clean = strip_emoji(fr["weaponHud"])
    draw_sticker_pill(draw, gx(185), 24 * S, wh_clean, font(int(10.5 * S)), C_PAPER, C_INK, pad_x=int(9 * S), pad_y=int(4 * S), radius=int(7 * S), border=2, shadow_off=int(2.5 * S))

    if fr["comboCount"] >= 5:
        draw_sticker_pill(draw, vp_w - 56 * S, 64 * S, f"{fr['comboCount']} 连杀!", font(int(11.5 * S)), C_RED if fr["comboCount"] >= 25 else C_YELLOW_BRIGHT, C_PAPER if fr["comboCount"] >= 25 else C_INK, pad_x=int(10 * S), pad_y=int(4 * S), radius=int(7 * S), border=2, shadow_off=int(2.5 * S))

    ct = fr.get("chatToast")
    if ct:
        cw = vp_w - 36 * S
        cx0, cy0, cx1, cy1 = 18 * S, 48 * S, 18 * S + cw, 48 * S + 44 * S
        draw.rounded_rectangle((cx0 + 3 * S, cy0 + 3 * S, cx1 + 3 * S, cy1 + 3 * S), radius=int(10 * S), fill=C_INK)
        draw.rounded_rectangle((cx0, cy0, cx1, cy1), radius=int(10 * S), fill=C_PAPER, outline=C_INK, width=max(2, int(2.5 * S)))
        draw.rounded_rectangle((cx0 + 7 * S, cy0 + 8 * S, cx0 + 34 * S, cy1 - 8 * S), radius=int(6 * S), fill=C_YELLOW_BRIGHT, outline=C_INK, width=2)
        draw.text((cx0 + 20.5 * S, cy0 + 22 * S), "群", font=font(int(11 * S)), fill=C_INK, anchor="mm")
        draw.ellipse((cx0 + 29 * S, cy0 + 5 * S, cx0 + 37 * S, cy0 + 13 * S), fill=C_RED, outline=C_INK, width=1)
        draw.text((cx0 + 42 * S, cy0 + 13 * S), strip_emoji(f"{ct['sender']}  [{ct['tag']}]"), font=font(int(9.5 * S)), fill=C_PURPLE, anchor="lm")
        draw.text((cx1 - 10 * S, cy0 + 13 * S), "刚刚", font=font(int(9 * S)), fill=(110, 118, 138), anchor="rm")
        draw.text((cx0 + 42 * S, cy0 + 30 * S), strip_emoji(ct["text"]), font=font(int(10.5 * S)), fill=C_INK, anchor="lm")

    if boss and boss.get("active"):
        bw = 264 * S
        bx0, by0 = (vp_w - bw) * 0.5, 48 * S if not ct else 98 * S
        draw.rounded_rectangle((bx0 - 2 * S, by0 - 2 * S, bx0 + bw + 2 * S, by0 + 18 * S), radius=6, fill=C_INK)
        draw.rounded_rectangle((bx0, by0, bx0 + bw, by0 + 14 * S), radius=4, fill=(51, 32, 46))
        hp_r = clamp(boss["hp"] / max(1.0, boss["maxHp"]), 0.0, 1.0)
        b_col = C_MINT if boss["shieldTimer"] > 0 else C_YELLOW_BRIGHT if boss["enraged"] else C_RED
        if hp_r > 0.01:
            draw.rounded_rectangle((bx0, by0, bx0 + bw * hp_r, by0 + 14 * S), radius=4, fill=b_col)
        stroke_text(draw, (vp_w * 0.5, by0 + 7 * S), f"{strip_emoji(boss['name'])}  {int(round(hp_r * 100))}%", font(int(10 * S)), C_PAPER, C_INK, stroke_w=2, anchor="mm")

    bn = fr.get("banner")
    if bn:
        clean_title = strip_emoji(bn["title"])
        draw_sticker_pill(draw, vp_w * 0.5, gy(235), clean_title, font(int(14 * S)), C_PAPER, C_INK, pad_x=int(18 * S), pad_y=int(10 * S), radius=int(10 * S), border=3, shadow_off=int(5 * S))

    ub_w, ub_h = 154 * S, 42 * S
    ux0, uy0 = vp_w - ub_w - 14 * S, vp_h - ub_h - 14 * S
    pct = fr["ultCharge"] / 100.0
    ready = fr["ultCharge"] >= 100
    if tap_ult_prog > 0:
        pulse = 1.0 + 0.09 * math.sin(tap_ult_prog * math.pi)
        ux0 -= (ub_w * (pulse - 1.0)) * 0.5
        uy0 -= (ub_h * (pulse - 1.0)) * 0.5
        ub_w *= pulse
        ub_h *= pulse
    draw.rounded_rectangle((ux0 + 3 * S, uy0 + 3 * S, ux0 + ub_w + 3 * S, uy0 + ub_h + 3 * S), radius=int(10 * S), fill=C_INK)
    draw.rounded_rectangle((ux0, uy0, ux0 + ub_w, uy0 + ub_h), radius=int(10 * S), fill=C_YELLOW_BRIGHT if ready else (43, 47, 68), outline=C_INK, width=max(2, int(2.5 * S)))
    if not ready and pct > 0.02:
        draw.rounded_rectangle((ux0 + 2, uy0 + 2, ux0 + (ub_w - 4) * pct, uy0 + ub_h - 2), radius=int(8 * S), fill=C_MINT)
    ult_txt = "18:00 准点下班!" if ready else f"下班蓄力 {fr['ultCharge']}%"
    if ready:
        draw.text((ux0 + ub_w * 0.5, uy0 + ub_h * 0.5), ult_txt, font=font(int(11.5 * S)), fill=C_INK, anchor="mm")
    else:
        stroke_text(draw, (ux0 + ub_w * 0.5, uy0 + ub_h * 0.5), ult_txt, font(int(11.5 * S)), C_PAPER, C_INK, stroke_w=2, anchor="mm")

    if tap_ult_prog > 0:
        fx, fy = ux0 + ub_w * 0.55 + (1.0 - tap_ult_prog) * 38 * S, uy0 + ub_h * 0.55 + (1.0 - tap_ult_prog) * 38 * S
        ring_r = (14 + 26 * tap_ult_prog) * S
        draw.ellipse((fx - ring_r, fy - ring_r, fx + ring_r, fy + ring_r), outline=(*C_YELLOW_BRIGHT, int(255 * (1.0 - tap_ult_prog * 0.7))), width=max(2, int(4 * S)))
        draw.ellipse((fx - 13 * S, fy - 13 * S, fx + 13 * S, fy + 13 * S), fill=(255, 255, 255, 230), outline=C_INK, width=3)
    elif show_finger:
        fx = gx(project_x(fr["leaderLaneX"], PLAYER_Y + 46))
        fy = gy(PLAYER_Y + 48)
        draw.line((gx(GAME_W * 0.22), fy, gx(GAME_W * 0.78), fy), fill=(255, 255, 255, 55), width=max(2, int(2.5 * S)))
        draw.ellipse((fx - 18 * S, fy - 18 * S, fx + 18 * S, fy + 18 * S), fill=(0, 245, 212, 85), outline=(*C_MINT, 200), width=2)
        draw.ellipse((fx - 11 * S, fy - 11 * S, fx + 11 * S, fy + 11 * S), fill=(255, 255, 255, 225), outline=C_INK, width=3)

    if fr["ultStampTimer"] > 0:
        prog = 1.0 - fr["ultStampTimer"] / 0.95
        sc = 1.6 - prog * 3.8 if prog < 0.15 else 1.03
        stamp_w, stamp_h = int(310 * S * sc), int(92 * S * sc)
        sx0, sy0 = (vp_w - stamp_w) * 0.5, vp_h * 0.42 - stamp_h * 0.5
        draw.rounded_rectangle((sx0 + 6 * S, sy0 + 6 * S, sx0 + stamp_w + 6 * S, sy0 + stamp_h + 6 * S), radius=int(12 * S), fill=C_INK)
        draw.rounded_rectangle((sx0, sy0, sx0 + stamp_w, sy0 + stamp_h), radius=int(12 * S), fill=C_YELLOW_BRIGHT, outline=C_INK, width=max(4, int(5 * S)))
        draw.text((vp_w * 0.5, vp_h * 0.42 - 14 * S * sc), "18:00 准点下班", font=font(int(23 * S * sc)), fill=C_INK, anchor="mm")
        draw.text((vp_w * 0.5, vp_h * 0.42 + 18 * S * sc), "已 读 不 回 · 全 屏 清 空", font=font(int(15 * S * sc)), fill=C_RED, anchor="mm")

    return im


# Pre-bake sleek titanium-obsidian phone bezel per viewport size for super crisp anti-aliased shadows
_PHONE_SHELL_CACHE: dict[tuple[int, int, tuple[int, int, int]], Image.Image] = {}


def compose_sleek_phone(
    stage: Image.Image,
    vp: Image.Image,
    cx: float,
    cy: float,
    scale: float = 1.0,
    tilt_deg: float = 0.0,
    rim_accent: tuple[int, int, int] = C_MINT,
) -> None:
    vpw, vph = vp.size
    key = (vpw, vph, rim_accent)
    pad = 42
    bezel = 14
    bw, bh = vpw + bezel * 2, vph + bezel * 2
    shell = _PHONE_SHELL_CACHE.get(key)
    if shell is None:
        cw, ch = bw + pad * 2, bh + pad * 2
        shadow = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
        sd = ImageDraw.Draw(shadow)
        sd.rounded_rectangle((pad + 4, pad + 18, pad + bw + 4, pad + bh + 18), radius=46, fill=(0, 0, 0, 155))
        shadow = shadow.filter(ImageFilter.GaussianBlur(radius=18))
        fd = ImageDraw.Draw(shadow)
        # Sleek matte titanium-obsidian chassis
        fd.rounded_rectangle((pad, pad, pad + bw, pad + bh), radius=44, fill=(18, 20, 30, 255), outline=(248, 247, 242, 75), width=2)
        fd.rounded_rectangle((pad + 3, pad + 3, pad + bw - 3, pad + bh - 3), radius=41, outline=(*rim_accent, 65), width=1)
        _PHONE_SHELL_CACHE[key] = shadow
        shell = shadow

    frame_im = shell.copy()
    # Clip viewport inside sleek inner bezel radius
    mask = Image.new("L", (vpw, vph), 0)
    ImageDraw.Draw(mask).rounded_rectangle((0, 0, vpw, vph), radius=31, fill=255)
    frame_im.paste(vp, (pad + bezel, pad + bezel), mask)
    fd = ImageDraw.Draw(frame_im)
    # Minimal Dynamic-Island camera pill
    ncx = pad + bw * 0.5
    fd.rounded_rectangle((ncx - 42, pad + bezel + 6, ncx + 42, pad + bezel + 18), radius=6, fill=(10, 12, 18, 255))

    if abs(scale - 1.0) > 0.008:
        frame_im = frame_im.resize((int(frame_im.width * scale), int(frame_im.height * scale)), Image.Resampling.BILINEAR)
    if abs(tilt_deg) > 0.15:
        frame_im = frame_im.rotate(-tilt_deg, resample=Image.Resampling.BILINEAR, expand=True)
    paste_centered(stage, frame_im, cx, cy)


def draw_editorial_caption(stage: Image.Image, line1: str, line2: str = "", y1: float = 294, y2: float = 346) -> None:
    """Clean editorial Songti headline + W3 subline sitting cleanly inside top of 3:4 zone."""
    d = ImageDraw.Draw(stage)
    soft_text(d, (W * 0.5, y1), line1, font_serif(42, black=False), (248, 247, 242, 255), anchor="mm", shadow_alpha=180, shadow_off=(0, 3))
    if line2:
        soft_text(d, (W * 0.5, y2), line2, font_sans_reg(26), (222, 224, 232, 235), anchor="mm", shadow_alpha=155, shadow_off=(0, 2))


# ============================================================
# High-CTR Viral 3:4 Xiaohongshu Cover (1080 x 1440)
# ============================================================
def render_cover_3x4(sample_game_frame: dict) -> None:
    CW, CH = 1080, 1440
    im = ART_3X4["cover_viral_keyart"].copy()
    scrim = make_vertical_scrim(CW, CH, top_alpha=215, top_end=535, bot_start=1160, bot_alpha=195)
    im = Image.alpha_composite(im, scrim)

    # 1. Top Authentic 17:59 Work Chat Notification Card (instant Pavlovian workplace hook)
    ov = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    od = ImageDraw.Draw(ov)
    cx0, cy0, cx1, cy1 = 52, 52, 1028, 168
    sh = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((cx0 + 2, cy0 + 8, cx1 + 2, cy1 + 8), radius=24, fill=(0, 0, 0, 155))
    sh = sh.filter(ImageFilter.GaussianBlur(radius=10))
    im = Image.alpha_composite(im, sh)

    od.rounded_rectangle((cx0, cy0, cx1, cy1), radius=24, fill=(250, 250, 252, 245))
    # Subtle inner border highlight
    od.rounded_rectangle((cx0, cy0, cx1, cy1), radius=24, outline=(255, 255, 255, 255), width=2)
    # Left crimson app badge + unread notification dot
    od.rounded_rectangle((cx0 + 24, cy0 + 22, cx0 + 96, cy0 + 94), radius=18, fill=(255, 46, 84, 255))
    od.text((cx0 + 60, cy0 + 58), "急", font=font_sans_bold(38), fill=(255, 255, 255, 255), anchor="mm")
    od.ellipse((cx0 + 84, cy0 + 14, cx0 + 104, cy0 + 34), fill=(255, 46, 84, 255), outline=(250, 250, 252, 255), width=3)

    od.text((cx0 + 118, cy0 + 40), "老板 · 工作群 (99+)", font=font_sans_bold(26), fill=(42, 46, 62, 255), anchor="lm")
    od.text((cx1 - 26, cy0 + 40), "17:59 · 刚刚", font=font_sans_bold(23), fill=(240, 42, 78, 255), anchor="rm")
    od.text((cx0 + 118, cy0 + 84), "小改第 18 版，今晚必须发，明天要用", font=font_sans_bold(30), fill=(15, 17, 26, 255), anchor="lm")
    im = Image.alpha_composite(im, ov)

    # 2. Giant High-Contrast 2-Line Curiosity Headline (reads effortlessly at tiny feed thumbnail width)
    d = ImageDraw.Draw(im)
    f_h1 = font_sans_bold(82)
    f_h2 = font_sans_bold(84)
    soft_text(d, (56, 248), "17:59 逼我加班？", f_h1, (255, 255, 255, 255), anchor="lm", shadow_alpha=215, shadow_off=(0, 5))

    x_cur = 56.0
    for seg_txt, seg_col in [
        ("我把", (255, 255, 255, 255)),
        ("老板", (255, 230, 0, 255)),
        ("做成了 ", (255, 255, 255, 255)),
        ("Boss！", (0, 245, 212, 255)),
    ]:
        soft_text(d, (x_cur, 352), seg_txt, f_h2, seg_col, anchor="lm", shadow_alpha=215, shadow_off=(0, 5))
        x_cur += d.textlength(seg_txt, font=f_h2)

    soft_text(d, (58, 432), "实机可玩 · 一巴掌拍出「18:00 准点下班」", font_sans_bold(30), (242, 244, 248, 245), anchor="lm", shadow_alpha=200, shadow_off=(0, 4))

    # 3. Bottom-Right Sleek Real-Gameplay Mini Preview Card (tilted cleanly in dark desk foreground)
    vp_mini = render_game_viewport(sample_game_frame, vp_w=264, vp_h=460, show_finger=False)
    pad = 24
    bezel = 9
    bw, bh = vp_mini.width + bezel * 2, vp_mini.height + bezel * 2
    cw_p, ch_p = bw + pad * 2, bh + pad * 2
    mini_phone = Image.new("RGBA", (cw_p, ch_p), (0, 0, 0, 0))
    ImageDraw.Draw(mini_phone).rounded_rectangle((pad + 3, pad + 10, pad + bw + 3, pad + bh + 10), radius=30, fill=(0, 0, 0, 175))
    mini_phone = mini_phone.filter(ImageFilter.GaussianBlur(radius=10))
    mpd = ImageDraw.Draw(mini_phone)
    mpd.rounded_rectangle((pad, pad, pad + bw, pad + bh), radius=28, fill=(16, 18, 28, 255), outline=(*C_MINT, 210), width=2)
    mask_m = Image.new("L", vp_mini.size, 0)
    ImageDraw.Draw(mask_m).rounded_rectangle((0, 0, vp_mini.width, vp_mini.height), radius=20, fill=255)
    mini_phone.paste(vp_mini, (pad + bezel, pad + bezel), mask_m)
    # Minimal "实机画面" pill cleanly on top edge of mini phone
    tag_p = "实机画面"
    f_pt = font_sans_bold(19)
    tw_p = int(mpd.textlength(tag_p, font=f_pt)) + 24
    px_c = pad + bw * 0.5
    mpd.rounded_rectangle((px_c - tw_p * 0.5, pad - 10, px_c + tw_p * 0.5, pad + 18), radius=14, fill=(14, 17, 28, 242), outline=(*C_MINT, 225), width=2)
    mpd.text((px_c, pad + 4), tag_p, font=f_pt, fill=(*C_MINT, 255), anchor="mm")

    mini_rot = mini_phone.rotate(4.2, resample=Image.Resampling.BILINEAR, expand=True)
    paste_centered(im, mini_rot, 882, 1142)

    # 4. Bottom-Left Sleek Frosted Creator Teaser Capsule (zero cheap ad clutter)
    d = ImageDraw.Draw(im)
    cta_txt = "周一突围 · 点开直接开打"
    f_cta = font_sans_bold(29)
    tw_c = int(d.textlength(cta_txt, font=f_cta))
    bx0, by0 = 56, 1322
    bx1, by1 = bx0 + tw_c + 86, 1388
    sh_c = Image.new("RGBA", (CW, CH), (0, 0, 0, 0))
    ImageDraw.Draw(sh_c).rounded_rectangle((bx0 + 2, by0 + 6, bx1 + 2, by1 + 6), radius=33, fill=(0, 0, 0, 150))
    sh_c = sh_c.filter(ImageFilter.GaussianBlur(radius=8))
    im = Image.alpha_composite(im, sh_c)
    d = ImageDraw.Draw(im)
    d.rounded_rectangle((bx0, by0, bx1, by1), radius=33, fill=(14, 17, 28, 224), outline=(*C_MINT, 225), width=2)
    # Crisp vector mint play triangle
    tx, ty = bx0 + 34, (by0 + by1) * 0.5
    d.polygon([(tx - 7, ty - 10), (tx - 7, ty + 10), (tx + 12, ty)], fill=(*C_MINT, 255))
    d.text((bx0 + 58, ty), cta_txt, font=f_cta, fill=(255, 255, 255, 255), anchor="lm")

    OUT_COVER.parent.mkdir(parents=True, exist_ok=True)
    im.convert("RGB").save(OUT_COVER, "PNG", optimize=True)
    print(f"✓ Cover generated: {OUT_COVER} ({OUT_COVER.stat().st_size} bytes)")


# ============================================================
# 6-Scene Story Renderer (1200 frames = 40.00s @ 30fps)
# ============================================================
def render_scene1(f_idx: int) -> Image.Image:
    # 0.00s..3.80s (frames 0..113): Cozy dusk office + clock ticks + protagonist VN dialogue
    t = f_idx / FPS
    p = clamp(t / 3.80, 0.0, 1.0)
    im = STAGE_BG["scene1_desk"].copy().convert("RGBA")
    compose_cinema_art(im, ART_KB["scene1_desk"], zoom=1.01 + 0.06 * ease_in_out_sine(p), pan_y=-14.0 * p)

    d = ImageDraw.Draw(im)
    sec = min(45, 42 + int(t))
    soft_text(d, (64, 290), f"MON  ·  17:59:{sec:02d}", font_mono(23), (248, 247, 242, 225), anchor="lm", shadow_alpha=170, shadow_off=(0, 2))

    if t >= 0.42:
        line = "包背好了，电脑关了，还有 15 秒准点下班。"
        chars = int((t - 0.52) * 14.5)
        draw_vn_dialogue(im, "hero", "摸鱼打工人", line, C_MINT, chars, t)
    return im.convert("RGB")


def render_scene2(f_idx: int) -> Image.Image:
    # 3.80s..8.40s (frames 114..251):
    # 3.80s..4.10s: Frosted IM notification ambush over dusk office!
    # 4.10s..8.40s: Scene 2 Hydra + KPI ambush + Boss banter VN lines!
    t = f_idx / FPS
    if t < 4.12:
        im = STAGE_BG["scene1_desk"].copy().convert("RGBA")
        compose_cinema_art(im, ART_KB["scene1_desk"], zoom=1.07, pan_y=-14.0)
        # Subtle darkening + crisp dark-glass IM notification toast
        ov = Image.new("RGBA", im.size, (8, 10, 18, 95))
        im = Image.alpha_composite(im, ov)
        od = ImageDraw.Draw(im)
        pop = ease_out_back(clamp((t - 3.80) / 0.14, 0.0, 1.0))
        cw, ch = int(890 * (0.94 + 0.06 * pop)), 162
        cx0, cy0 = (W - cw) // 2, 460
        od.rounded_rectangle((cx0 + 4, cy0 + 10, cx0 + cw + 4, cy0 + ch + 10), radius=24, fill=(0, 0, 0, 145))
        od.rounded_rectangle((cx0, cy0, cx0 + cw, cy0 + ch), radius=24, fill=(22, 25, 36, 242), outline=(*C_RED, 200), width=2)
        od.rounded_rectangle((cx0 + 26, cy0 + 38, cx0 + 102, cy0 + 114), radius=18, fill=(*C_RED, 255))
        od.text((cx0 + 64, cy0 + 76), "急", font=font_sans_bold(38), fill=(248, 247, 242, 255), anchor="mm")
        od.text((cx0 + 128, cy0 + 54), "工作群 (99+)", font=font_sans_bold(26), fill=(248, 247, 242, 255), anchor="lm")
        od.text((cx0 + cw - 28, cy0 + 54), "17:59 · 刚刚", font=font_mono(21), fill=(*C_RED, 240), anchor="rm")
        od.text((cx0 + 128, cy0 + 108), "老板 @所有人：突发小改 18 版，今晚必须上线", font=font_sans_reg(28), fill=(228, 230, 238, 255), anchor="lm")
        return im.convert("RGB")

    rel = t - 4.12
    p = clamp(rel / 4.28, 0.0, 1.0)
    im = STAGE_BG["scene2_ambush"].copy().convert("RGBA")
    pulse = 0.55 + 0.35 * math.sin(rel * 3.8)
    compose_cinema_art(im, ART_KB["scene2_ambush"], zoom=1.02 + 0.07 * ease_in_out_sine(p), pan_y=-10.0 * p, crimson_tint=pulse)

    d = ImageDraw.Draw(im)
    soft_text(d, (64, 290), "MON  ·  17:59:59", font_mono(23), (255, 118, 140, 235), anchor="lm", shadow_alpha=170, shadow_off=(0, 2))

    if t < 6.46:
        line1 = "宝，下班前小改一版——要五彩斑斓的黑，再改回第一版~"
        draw_vn_dialogue(im, "hydra", "甲方九头蛇", line1, C_PURPLE, int((t - 4.24) * 16.5), t)
    else:
        line2 = "顺便拉个会，对齐一下今晚通宵的颗粒度。"
        draw_vn_dialogue(im, "kpi", "KPI 巨兽", line2, C_RED, int((t - 6.50) * 14.0), t)
    return im.convert("RGB")


def render_scene3(f_idx: int) -> Image.Image:
    # 8.40s..12.40s (frames 252..371):
    # 8.40s..8.60s (frames 252..257): crisp dramatic cut + mechanical keyboard click pause
    # 8.60s..11.55s: Sakuga awakening + animated electric mint sparks + clapback line
    # 11.55s..12.40s: Minimalist architectural indie title card
    t = f_idx / FPS
    if f_idx < 257:
        return Image.new("RGB", (W, H), (10, 11, 16))

    if t < 11.55:
        rel = t - 8.56
        p = clamp(rel / 3.0, 0.0, 1.0)
        im = STAGE_BG["scene3_awakening"].copy().convert("RGBA")
        compose_cinema_art(im, ART_KB["scene3_awakening"], zoom=1.04 + 0.08 * ease_out_cubic(p), pan_y=12.0 * (1.0 - p))

        # Subtle kinetic mint spark particles drifting on awakening beat
        d = ImageDraw.Draw(im)
        for i in range(10):
            ang = i * 0.62 + 0.3
            dist = 180 + ((rel * 260 + i * 55) % 420)
            sx = W * 0.5 + math.cos(ang) * dist
            sy = 840 + math.sin(ang) * dist * 0.72
            if SAFE_Y0 + 30 < sy < 1340:
                r = 3 + (i % 3) * 1.5
                d.ellipse((sx - r, sy - r, sx + r, sy + r), fill=(0, 245, 212, 200))

        line = "……行。那我也给你对齐一下，物理颗粒度。"
        draw_vn_dialogue(im, "hero", "摸鱼打工人", line, C_MINT, int((t - 8.70) * 13.5), t)
        return im.convert("RGB")

    # 11.55s..12.40s: Minimalist Indie Film Title Interlude
    rel = t - 11.55
    p = clamp(rel / 0.85, 0.0, 1.0)
    im = STAGE_BG["scene3_awakening"].copy().convert("RGBA")
    ov = Image.new("RGBA", im.size, (10, 12, 20, 165))
    im = Image.alpha_composite(im, ov)
    d = ImageDraw.Draw(im)
    sc = ease_out_cubic(min(1.0, p * 2.4))
    soft_text(d, (W * 0.5, 775), "MISSION  ·  18:00", font_mono(24), (*C_MINT, 225), anchor="mm", shadow_alpha=140)
    soft_text(d, (W * 0.5, 885), "周一突围", font_serif(96, black=True), (248, 247, 242, 255), anchor="mm", shadow_alpha=190, shadow_off=(0, 4))
    bar_hw = 110 * sc
    d.line((W * 0.5 - bar_hw, 965, W * 0.5 + bar_hw, 965), fill=(*C_MINT, 240), width=3)
    soft_text(d, (W * 0.5, 1025), "18:00 准点下班作战开始", font_sans_reg(30), (235, 236, 244, 240), anchor="mm", shadow_alpha=150)
    return im.convert("RGB")


def render_scene4(f_idx: int, sim_a: list[dict], sim_b: list[dict]) -> Image.Image:
    # 12.40s..25.40s (frames 372..761):
    # 372..581 -> 210 frames exact of segA!
    # 582..761 -> 180 frames exact of segB!
    if f_idx < 582:
        local_f = f_idx - 372
        fr = sim_a[local_f]
        t_local = local_f / FPS
        im = STAGE_BG_GAME_MINT.copy().convert("RGBA")
        vp = render_game_viewport(fr, vp_w=632, vp_h=1104, show_finger=True)

        # Subtle beat push without ever moving phone bezel near headline
        punch = 1.0
        if local_f < 9:
            punch = 0.94 + 0.06 * ease_out_cubic(local_f / 9.0)
        elif 2.30 <= t_local <= 2.65:
            punch = 1.0 + 0.025 * math.sin((t_local - 2.30) / 0.35 * math.pi)
        elif 3.40 <= t_local <= 3.85:
            punch = 1.0 + 0.032 * math.sin((t_local - 3.40) / 0.45 * math.pi)

        compose_sleek_phone(im, vp, W * 0.5, 995, scale=punch, tilt_deg=-0.6 if t_local < 3.4 else 0.7, rim_accent=C_MINT)
        if t_local < 3.20:
            draw_editorial_caption(im, "先拆把机械键盘", "把满屏未读邮件轰成渣")
        else:
            draw_editorial_caption(im, "老板画的加班红门？", "集火狂射，直接洗白翻正")

        d = ImageDraw.Draw(im)
        soft_text(d, (W * 0.5, 1632), "实机录屏  ·  单指滑动自动开火", font_sans_reg(23), (225, 226, 234, 195), anchor="mm", shadow_alpha=120)
        return im.convert("RGB")

    local_f = f_idx - 582
    fr = sim_b[local_f]
    t_local = local_f / FPS
    im = STAGE_BG_GAME_AWAKEN.copy().convert("RGBA")
    vp = render_game_viewport(fr, vp_w=632, vp_h=1104, show_finger=True)

    punch = 1.0 + (0.028 * math.sin((t_local - 3.0) * 6.0) if 3.0 <= t_local <= 3.55 else 0.0)
    compose_sleek_phone(im, vp, W * 0.5, 995, scale=punch, tilt_deg=0.9 if t_local < 3.0 else -0.9, rim_accent=C_PURPLE)

    if t_local < 3.05:
        draw_editorial_caption(im, "冰美式触发连锁电弧", "顺手拉起百人摸鱼外援")
    else:
        draw_editorial_caption(im, "外卖追踪弹自动拐弯", "主打一个轻松清屏")

    d = ImageDraw.Draw(im)
    soft_text(d, (W * 0.5, 1632), f"实机录屏  ·  当前摸鱼小队 {fr['squadCount']} 人", font_sans_reg(23), (225, 226, 234, 205), anchor="mm", shadow_alpha=120)
    return im.convert("RGB")


def render_scene5(f_idx: int, sim_c: list[dict]) -> Image.Image:
    # 25.40s..34.60s (frames 762..1037 = 276 frames total)
    # 762..899 (138 frames -> segC[0..83]): Pre-Ult Boss battle + Hero line
    # 900..1037 (138 frames -> segC[84..203]): 18:00 Stamp KO + Hero relief line
    t = f_idx / FPS
    if f_idx < 900:
        local_f = f_idx - 762
        seg_idx = min(83, int(local_f * 84 / 138))
        fr = sim_c[seg_idx]
        tap_prog = clamp((local_f - 110) / 28.0, 0.0, 1.0)
        im = STAGE_BG_GAME_CRIMSON.copy().convert("RGBA")
        # Compact 596x1042 phone at cy=945 so bottom compact dialogue strip has clean >=23px gap below bezel
        vp = render_game_viewport(fr, vp_w=596, vp_h=1042, show_finger=(tap_prog <= 0.0), tap_ult_prog=tap_prog)
        zoom = 1.0 + 0.04 * ease_out_cubic(tap_prog)
        compose_sleek_phone(im, vp, W * 0.5 - 32 * tap_prog, 945, scale=zoom, tilt_deg=0.0 if tap_prog > 0 else -0.6, rim_accent=C_RED)

        draw_editorial_caption(im, "17:59 终极 KPI 巨兽拦路", "撑过这一轮，下班打卡就满格" if t < 28.1 else "下班倒计时  ·  能量 100%")

        if t >= 28.20:
            draw_vn_dialogue(im, "hero", "摸鱼打工人", "抱歉，下班打卡能量满了。", C_YELLOW, int((t - 28.20) * 14.0), t, compact=True)
        return im.convert("RGB")

    local_f = f_idx - 900
    if local_f < 2:
        # Warm golden punch-card flash at 30.00s drop
        return Image.new("RGB", (W, H), (255, 248, 224) if local_f == 0 else (255, 228, 128))

    seg_idx = min(len(sim_c) - 1, 84 + int(local_f * 119 / 138))
    fr = sim_c[seg_idx]
    im = STAGE_BG["cover_keyart"].copy().convert("RGBA")
    vp = render_game_viewport(fr, vp_w=596, vp_h=1042, show_finger=False)
    shake = math.sin(local_f * 1.9) * max(0.0, 9.0 * (1.0 - local_f / 18.0))
    compose_sleek_phone(im, vp, W * 0.5 + shake, 945 + shake * 0.4, scale=1.03, tilt_deg=0.7, rim_accent=C_YELLOW)
    draw_editorial_caption(im, "18:00 准点下班", "已读不回，全屏清空")

    if t >= 30.65:
        draw_vn_dialogue(im, "hero", "摸鱼打工人", "天塌了，明天再说。", C_MINT, int((t - 30.65) * 12.0), t, compact=True)
    return im.convert("RGB")


def build_diagnosis_card() -> Image.Image:
    """High-taste stationery aesthetic Victory Diagnosis Card."""
    pw, ph = 640, 930
    pad = 24
    card = Image.new("RGBA", (pw + pad * 2, ph + pad * 2), (0, 0, 0, 0))
    sh = Image.new("RGBA", (pw + pad * 2, ph + pad * 2), (0, 0, 0, 0))
    ImageDraw.Draw(sh).rounded_rectangle((pad + 6, pad + 14, pad + pw + 6, pad + ph + 14), radius=26, fill=(0, 0, 0, 140))
    sh = sh.filter(ImageFilter.GaussianBlur(radius=14))
    card = Image.alpha_composite(card, sh)

    cd = ImageDraw.Draw(card)
    cd.rounded_rectangle((pad, pad, pad + pw, pad + ph), radius=26, fill=(246, 244, 238, 255), outline=(24, 26, 36, 230), width=3)
    # Subtle header band
    cd.rounded_rectangle((pad + 32, pad + 32, pad + pw - 32, pad + 92), radius=12, fill=(22, 24, 34, 255))
    cd.text((pad + pw * 0.5, pad + 62), "今日摸鱼战报  ·  精神状态诊断书", font=font_sans_bold(24), fill=C_YELLOW, anchor="mm")

    # Hero VS Boss illustration banner inside card
    cd.rounded_rectangle((pad + 32, pad + 114, pad + pw - 32, pad + 306), radius=16, fill=(26, 29, 44, 255), outline=(36, 40, 58, 255), width=2)
    paste_centered(card, get_sprite("heroMech", "base", 150, 150), pad + 146, pad + 210)
    paste_centered(card, get_sprite("kpi", "base", 160, 160), pad + pw - 146, pad + 208)
    cd.rounded_rectangle((pad + pw * 0.5 - 42, pad + 190, pad + pw * 0.5 + 42, pad + 230), radius=10, fill=C_RED)
    cd.text((pad + pw * 0.5, pad + 210), "KO", font=font_latin(24), fill=C_PAPER, anchor="mm")

    # Grade Banner
    cd.rounded_rectangle((pad + 32, pad + 328, pad + pw - 32, pad + 486), radius=16, fill=(255, 230, 118, 255), outline=(22, 24, 34, 220), width=2)
    cd.text((pad + 68, pad + 394), "SSR", font=font_latin(70), fill=C_INK, anchor="lm")
    cd.text((pad + 225, pad + 382), "工位赛博战神", font=font_serif(36, black=True), fill=C_INK, anchor="lm")
    cd.text((pad + 225, pad + 436), "KPI 当场击碎  ·  准点关机走人", font=font_sans_reg(22), fill=(52, 56, 74, 255), anchor="lm")

    # 2x2 Minimal Metrics
    stats = [
        ("最大摸鱼军团", "130 人"),
        ("洗白加班红门", "3 次"),
        ("粉碎甲方需求", "344 份"),
        ("赚取咖啡豆", "+820 颗"),
    ]
    for i, (slbl, sval) in enumerate(stats):
        ci, ri = i % 2, i // 2
        sx0 = pad + 32 + ci * 294
        sy0 = pad + 510 + ri * 134
        cd.rounded_rectangle((sx0, sy0, sx0 + 282, sy0 + 116), radius=14, fill=(235, 232, 223, 255), outline=(205, 202, 192, 255), width=2)
        cd.text((sx0 + 141, sy0 + 36), slbl, font=font_sans_reg(20), fill=(85, 88, 108, 255), anchor="mm")
        cd.text((sx0 + 141, sy0 + 78), sval, font=font_sans_bold(32), fill=C_INK, anchor="mm")

    # Footer Badge Strip
    cd.rounded_rectangle((pad + 32, pad + 794, pad + pw - 32, pad + 886), radius=14, fill=(24, 28, 40, 255), outline=(*C_MINT, 190), width=2)
    cd.text((pad + pw * 0.5, pad + 840), "解锁工牌：周五下班刺客  ·  百人大军统帅", font=font_sans_reg(22), fill=C_MINT, anchor="mm")
    return card


DIAGNOSIS_CARD = build_diagnosis_card()


def render_scene6(f_idx: int) -> Image.Image:
    # 34.60s..40.00s (frames 1038..1199):
    # 1038..1115 (34.60s..37.20s): Stationery SSR Diagnosis Card reveal
    # 1116..1199 (37.20s..40.00s): Calm indie-film closing card
    t = f_idx / FPS
    im = STAGE_BG["cover_keyart"].copy().convert("RGBA")
    # Darken slightly for serene evening mood inside 3:4 & 9:16
    im = Image.alpha_composite(im, Image.new("RGBA", im.size, (10, 12, 20, 65)))

    if f_idx < 1116:
        rel = t - 34.60
        sc = 0.88 + 0.12 * ease_out_cubic(min(1.0, rel / 0.35))
        draw_editorial_caption(im, "打完还能领一张", "今日职场精神状态诊断书")
        c_img = DIAGNOSIS_CARD
        if abs(sc - 1.0) > 0.005:
            c_img = c_img.resize((int(c_img.width * sc), int(c_img.height * sc)), Image.Resampling.BILINEAR)
        paste_centered(im, c_img, W * 0.5, 995 + (1.0 - sc) * 180)
        return im.convert("RGB")

    # 37.20s..40.00s: Quiet indie-film outro
    rel = t - 37.20
    fade_in = ease_out_cubic(min(1.0, rel / 0.35))
    ov = Image.new("RGBA", im.size, (10, 12, 20, 95))
    im = Image.alpha_composite(im, ov)
    d = ImageDraw.Draw(im)

    soft_text(d, (W * 0.5, 690), "MONDAY  BREAKOUT", font_mono(24), (218, 222, 232, int(210 * fade_in)), anchor="mm", shadow_alpha=120)
    soft_text(d, (W * 0.5, 795), "周一突围", font_serif(106, black=True), (248, 247, 242, int(255 * fade_in)), anchor="mm", shadow_alpha=170, shadow_off=(0, 4))
    d.line((W * 0.5 - 64, 892, W * 0.5 + 64, 892), fill=(0, 245, 212, int(210 * fade_in)), width=2)
    soft_text(d, (W * 0.5, 975), "明天 17:59，祝你准点下班。", font_sans_reg(36), (242, 240, 234, int(245 * fade_in)), anchor="mm", shadow_alpha=140, shadow_off=(0, 2))

    # Subtle minimal entry pill inside bottom of 3:4 zone
    ft_t = "点开左下角  ·  随时摸两分钟鱼"
    fw = int(d.textlength(ft_t, font=font_sans_reg(25))) + 56
    px0, py0, px1, py1 = W * 0.5 - fw * 0.5, 1465, W * 0.5 + fw * 0.5, 1525
    d.rounded_rectangle((px0, py0, px1, py1), radius=30, fill=(22, 25, 36, int(195 * fade_in)), outline=(248, 247, 242, int(90 * fade_in)), width=1)
    d.text((W * 0.5, 1495), ft_t, font=font_sans_reg(25), fill=(238, 240, 245, int(235 * fade_in)), anchor="mm")

    # Gentle fade to dark on final 0.50s
    if t >= 39.50:
        a_out = int(clamp((t - 39.50) / 0.50, 0.0, 1.0) * 240)
        im = Image.alpha_composite(im, Image.new("RGBA", im.size, (10, 12, 18, a_out)))

    return im.convert("RGB")


def main() -> None:
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    sim = json.loads(SIM_PATH.read_text(encoding="utf-8"))
    sim_a = sim["segA"]["frames"]
    sim_b = sim["segB"]["frames"]
    sim_c = sim["segC"]["frames"]

    render_cover_3x4(sim_c[88])
    if "--cover-only" in sys.argv:
        return

    cmd = [
        "ffmpeg",
        "-y",
        "-f",
        "rawvideo",
        "-vcodec",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-s",
        f"{W}x{H}",
        "-r",
        str(FPS),
        "-i",
        "-",
        "-i",
        str(AUDIO_PATH),
        "-c:v",
        "libx264",
        "-preset",
        "medium",
        "-crf",
        "18",
        "-pix_fmt",
        "yuv420p",
        "-c:a",
        "aac",
        "-b:a",
        "192k",
        "-ar",
        "44100",
        "-shortest",
        "-movflags",
        "+faststart",
        str(OUT_VIDEO),
    ]
    proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    assert proc.stdin is not None

    for f in range(TOTAL_FRAMES):
        if f < 114:
            frame = render_scene1(f)
        elif f < 252:
            frame = render_scene2(f)
        elif f < 372:
            frame = render_scene3(f)
        elif f < 762:
            frame = render_scene4(f, sim_a, sim_b)
        elif f < 1038:
            frame = render_scene5(f, sim_c)
        else:
            frame = render_scene6(f)

        proc.stdin.write(frame.tobytes())
        if (f + 1) % 200 == 0:
            print(f"  Rendered {f + 1}/{TOTAL_FRAMES} frames...")

    proc.stdin.close()
    proc.stdin = None
    err = proc.stderr.read() if proc.stderr is not None else b""
    rc = proc.wait()
    if rc != 0:
        raise RuntimeError(f"ffmpeg failed ({rc}):\n{err.decode('utf-8', errors='replace')}")

    print(f"✓ Video encoded: {OUT_VIDEO} ({OUT_VIDEO.stat().st_size} bytes)")


if __name__ == "__main__":
    main()
