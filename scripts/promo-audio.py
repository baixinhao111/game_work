#!/usr/bin/env python3
"""
Synthesize a 40.00s 44.1kHz stereo Indie-Anime / City-Pop soundtrack + Animal-Crossing-style
VN character vocal blips & synced gameplay Foley for the story-driven promo video.
Writes: /tmp/promo-audio.wav
"""

import wave
from pathlib import Path
import numpy as np

SR = 44100
DURATION = 40.00
N_SAMPLES = int(SR * DURATION)
OUT_PATH = Path("/tmp/promo-audio.wav")

rng = np.random.default_rng(20261120)


def mix_mono(buf: np.ndarray, start_s: float, sig: np.ndarray, gain_l: float, gain_r: float | None = None) -> None:
    if gain_r is None:
        gain_r = gain_l
    i0 = int(round(start_s * SR))
    if i0 >= N_SAMPLES or i0 + len(sig) <= 0:
        return
    src_s = max(0, -i0)
    dst_s = max(0, i0)
    n = min(len(sig) - src_s, N_SAMPLES - dst_s)
    if n <= 0:
        return
    seg = sig[src_s : src_s + n]
    buf[0, dst_s : dst_s + n] += seg * gain_l
    buf[1, dst_s : dst_s + n] += seg * gain_r


def midi_to_hz(m: float) -> float:
    return 440.0 * (2.0 ** ((m - 69.0) / 12.0))


def rhodes_note(freq: float, dur: float, amp: float = 0.25) -> np.ndarray:
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Warm electric piano: fundamental + gentle 2nd + glassy tine ping on attack
    fundamental = np.sin(2 * np.pi * freq * t) * np.exp(-t * 2.1)
    warm2 = 0.28 * np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-t * 4.5)
    tine = 0.14 * np.sin(2 * np.pi * freq * 7.0 * t) * np.exp(-t * 28.0)
    env = np.minimum(1.0, t / 0.012) * np.exp(-t * 0.45)
    return amp * env * (fundamental + warm2 + tine)


def rhodes_chord(buf: np.ndarray, start_s: float, midis: list[float], dur: float, amp: float = 0.14, pan: float = 0.0) -> None:
    for idx, m in enumerate(midis):
        # Delicate arpeggiated roll (18ms apart) for human warmth
        st = start_s + idx * 0.018
        sig = rhodes_note(midi_to_hz(m), dur, amp=amp)
        p = np.clip(pan + (idx - len(midis) * 0.5) * 0.08, -0.5, 0.5)
        mix_mono(buf, st, sig, 1.0 - max(0.0, p), 1.0 + min(0.0, p))


def citypop_bass(freq: float, dur: float, amp: float = 0.36) -> np.ndarray:
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    # Punchy filtered funk synth bass
    s = np.sin(2 * np.pi * freq * t)
    s += 0.38 * np.sin(2 * np.pi * freq * 2.0 * t) * np.exp(-t * 11.0)
    s += 0.18 * np.sin(2 * np.pi * freq * 3.0 * t) * np.exp(-t * 16.0)
    env = np.minimum(1.0, t / 0.006) * np.exp(-t * 5.2)
    return amp * env * s


def bell_lead(freq: float, dur: float, amp: float = 0.16) -> np.ndarray:
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    vib = 1.0 + 0.004 * np.sin(2 * np.pi * 5.8 * t) * np.minimum(1.0, t / 0.08)
    phase = 2 * np.pi * freq * np.cumsum(vib) / SR
    sig = 0.7 * np.sin(phase) + 0.25 * np.sin(2 * phase) + 0.08 * np.sin(3 * phase)
    env = np.minimum(1.0, t / 0.014) * np.exp(-t * 3.2)
    return amp * env * sig


def kick_drum(punch: float = 1.0) -> np.ndarray:
    dur = 0.24
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    f = 48.0 + 115.0 * np.exp(-t * 42.0)
    body = np.sin(2 * np.pi * np.cumsum(f) / SR) * np.exp(-t * 14.0)
    click = np.exp(-t * 210.0) * 0.22
    return (0.42 * punch) * (body + click)


def crisp_snare(amp: float = 0.26) -> np.ndarray:
    dur = 0.16
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    noise = rng.normal(0, 1, len(t))
    hp = noise - np.convolve(noise, np.ones(6) / 6, mode="same")
    tone = np.sin(2 * np.pi * 195.0 * np.exp(-t * 14.0) * t) * np.exp(-t * 26.0)
    return amp * (hp * np.exp(-t * 22.0) * 0.72 + tone * 0.45)


def hihat(open_hat: bool = False, amp: float = 0.09) -> np.ndarray:
    dur = 0.13 if open_hat else 0.045
    t = np.linspace(0, dur, int(SR * dur), endpoint=False)
    n = rng.normal(0, 1, len(t))
    hp = n - np.convolve(n, np.ones(4) / 4, mode="same")
    decay = 24.0 if open_hat else 85.0
    return amp * hp * np.exp(-t * decay)


def add_vn_blips(
    buf: np.ndarray,
    start_s: float,
    end_s: float,
    base_hz: float,
    span_hz: float,
    cps: float,
    timbre: str = "hero",
    amp: float = 0.12,
    pan: float = 0.0,
) -> None:
    """Cute indie-game dialogue voice blips synced cleanly to typewriter text."""
    dt = 1.0 / cps
    t_cur = start_s
    step = 0
    while t_cur < end_s - 0.03:
        blip_dur = min(0.055, dt * 0.78)
        t = np.linspace(0, blip_dur, int(SR * blip_dur), endpoint=False)
        # Speech-like playful inflection contour
        pitch = base_hz + span_hz * (0.5 + 0.5 * np.sin(step * 1.47 + rng.uniform(-0.25, 0.25)))
        if timbre == "hydra":
            # Smug bright reed/square-ish timbre
            w = 0.65 * np.sin(2 * np.pi * pitch * t) + 0.25 * np.sin(6 * np.pi * pitch * t) + 0.12 * np.sin(10 * np.pi * pitch * t)
        elif timbre == "kpi":
            # Deep heavy brass/sub timbre
            w = 0.65 * np.sin(2 * np.pi * pitch * t) + 0.35 * np.sin(4 * np.pi * pitch * t) + 0.15 * np.sin(6 * np.pi * pitch * t)
        else:
            # Calm deadpan warm hero triangle/sine timbre
            w = 0.80 * np.sin(2 * np.pi * pitch * t) + 0.20 * np.sin(4 * np.pi * pitch * t)
        env = np.sin(np.pi * t / blip_dur) ** 0.75
        sig = amp * env * w
        mix_mono(buf, t_cur, sig, 1.0 - max(0.0, pan), 1.0 + min(0.0, pan))
        t_cur += dt
        step += 1


def main() -> None:
    buf = np.zeros((2, N_SAMPLES), dtype=np.float64)

    # ============================================================
    # 1. Scene 1 (0.00s..3.80s): Warm 92 BPM Lo-Fi Dusk Rhodes + Clock Ticks
    # ============================================================
    # Fmaj7 -> Em7 -> Dm7 warm sunset chords
    rhodes_chord(buf, 0.02, [53, 60, 64, 67, 72], 2.2, amp=0.14)
    rhodes_chord(buf, 2.00, [52, 59, 62, 67, 71], 2.1, amp=0.13)

    # Very subtle cozy vinyl crackle floor (0.00..3.80 and 31.80..40.00)
    for region_s, region_e in [(0.0, 3.80), (31.80, 40.00)]:
        n_ticks = int((region_e - region_s) * 14)
        for _ in range(n_ticks):
            ts = rng.uniform(region_s, region_e - 0.02)
            pop = rng.uniform(0.015, 0.04) * rng.choice([-1.0, 1.0]) * np.exp(-np.linspace(0, 0.008, int(SR * 0.008)) * 600)
            mix_mono(buf, ts, pop, rng.uniform(0.6, 1.0), rng.uniform(0.6, 1.0))

    # Realistic soft office wall-clock ticks (1.00, 2.00, 3.00)
    for tc in [1.00, 2.00, 3.00]:
        tt = np.linspace(0, 0.03, int(SR * 0.03), endpoint=False)
        tick = 0.20 * (np.sin(2 * np.pi * 1650 * tt) * np.exp(-tt * 280) + 0.5 * np.sin(2 * np.pi * 3100 * tt) * np.exp(-tt * 340))
        mix_mono(buf, tc, tick, 0.85, 0.95)

    # Protagonist VN blips (0.55..2.65): "包背好了，电脑关了，还有 15 秒准点下班。"
    add_vn_blips(buf, 0.55, 2.65, base_hz=295.0, span_hz=52.0, cps=13.5, timbre="hero", amp=0.13, pan=-0.12)

    # ============================================================
    # 2. Scene 2 (3.80s..8.40s): Triple IM Chimes + Moody Pad + Boss Blips
    # ============================================================
    # Mute warm Scene 1 music sharply right before triple IM alert
    cut_i = int(3.79 * SR)
    fade_n = int(0.03 * SR)
    buf[:, cut_i : cut_i + fade_n] *= np.linspace(1.0, 0.0, fade_n)
    buf[:, cut_i + fade_n : int(8.60 * SR)] = 0.0

    # Triple realistic IM notification chimes (3.80, 3.94, 4.08)
    for k, tc in enumerate([3.80, 3.94, 4.08]):
        tt = np.linspace(0, 0.14, int(SR * 0.14), endpoint=False)
        f1 = 988.0 + k * 70.0
        f2 = f1 * 1.335
        chime = 0.24 * np.sin(2 * np.pi * f1 * tt) * np.exp(-tt * 28.0)
        chime += 0.24 * np.sin(2 * np.pi * f2 * tt) * (tt > 0.03) * np.exp(-np.maximum(0, tt - 0.03) * 24.0)
        mix_mono(buf, tc, chime, 0.9 + 0.1 * (k % 2), 1.0 - 0.1 * (k % 2))

    # Moody low tension synth pad (3.90..8.40)
    tp = np.linspace(0, 4.50, int(SR * 4.50), endpoint=False)
    pad = 0.12 * np.sin(2 * np.pi * 65.41 * tp) + 0.08 * np.sin(2 * np.pi * 98.0 * tp) + 0.04 * np.sin(2 * np.pi * 155.56 * tp)
    pad *= np.minimum(1.0, tp / 0.15) * np.minimum(1.0, (4.50 - tp) / 0.12)
    mix_mono(buf, 3.90, pad, 1.0, 1.0)

    # Client Hydra blips (4.30..6.25) & KPI Boss blips (6.55..8.15)
    add_vn_blips(buf, 4.30, 6.25, base_hz=530.0, span_hz=140.0, cps=15.5, timbre="hydra", amp=0.11, pan=0.18)
    add_vn_blips(buf, 6.55, 8.15, base_hz=142.0, span_hz=42.0, cps=11.0, timbre="kpi", amp=0.16, pan=-0.10)

    # ============================================================
    # 3. Scene 3 (8.40s..12.40s): Record Stop + Mechanical Thock + Awakened Counterattack
    # ============================================================
    # 8.40s vinyl brake down-sweep
    tv = np.linspace(0, 0.16, int(SR * 0.16), endpoint=False)
    vstop = 0.22 * np.sin(2 * np.pi * np.cumsum(380.0 * np.exp(-tv * 18.0)) / SR) * (1.0 - tv / 0.16)
    mix_mono(buf, 8.40, vstop, 1.0, 1.0)

    # 8.60s satisfying heavy mechanical keyboard THOCK
    tk = np.linspace(0, 0.11, int(SR * 0.11), endpoint=False)
    thock = 0.52 * np.sin(2 * np.pi * 118.0 * np.exp(-tk * 35.0) * tk) * np.exp(-tk * 32.0)
    click = 0.26 * rng.normal(0, 1, len(tk)) * np.exp(-tk * 260.0)
    mix_mono(buf, 8.60, thock + click, 1.0, 1.0)

    # Protagonist deadpan clapback blips (8.75..10.75)
    add_vn_blips(buf, 8.75, 10.75, base_hz=292.0, span_hz=38.0, cps=11.5, timbre="hero", amp=0.14, pan=0.0)

    # 10.85s..12.40s electric-sparkle synth riser & tight snare buildup -> drop at 12.40s
    tr = np.linspace(0, 1.55, int(SR * 1.55), endpoint=False)
    f_up = 220.0 * (2.0 ** (tr / 1.55 * 2.2))
    riser = 0.20 * (tr / 1.55) * np.sin(2 * np.pi * np.cumsum(f_up) / SR)
    riser += 0.08 * (tr / 1.55) * rng.normal(0, 1, len(tr))
    mix_mono(buf, 10.85, riser, 0.9, 1.0)
    for s_t in [11.00, 11.30, 11.60, 11.82, 12.00, 12.14, 12.26]:
        mix_mono(buf, s_t, crisp_snare(amp=0.18 + 0.10 * ((s_t - 11.0) / 1.3)), 1.0, 1.0)

    # ============================================================
    # 4. Scene 4 & 5A (12.40s..30.00s): 126 BPM City-Pop / Shibuya-Kei Groove
    # ============================================================
    beat = 60.0 / 126.0  # ~0.47619s
    bar = beat * 4.0
    g_start = 12.40
    g_end = 29.88

    # Stylish City-Pop progression (Fm9 -> Bb13 -> Gm7 -> C7) in MIDI bass + Rhodes stabs
    chord_prog = [
        (41, [53, 56, 60, 63, 67]),  # Fm9
        (46, [58, 62, 65, 68, 72]),  # Bb9/13
        (43, [55, 58, 62, 65, 69]),  # Gm9
        (48, [55, 60, 64, 67, 70]),  # C7
    ]
    melody_notes = [72, 75, 79, 77, 75, 72, 70, 72, 75, 79, 82, 79]

    step_16 = beat / 4.0
    n_beats = int((g_end - g_start) / beat)
    for bi in range(n_beats):
        bt = g_start + bi * beat
        bar_idx = (bi // 4) % len(chord_prog)
        in_bar = bi % 4
        b_root, c_voicing = chord_prog[bar_idx]
        is_tension = bt >= 25.40  # Scene 5A filtered tension

        # Punchy City-Pop four-on-floor kick + disco snare
        mix_mono(buf, bt, kick_drum(0.95 if not is_tension else 0.78), 1.0, 1.0)
        if in_bar in (1, 3) and bt < 29.30:
            mix_mono(buf, bt, crisp_snare(0.24 if not is_tension else 0.16), 0.96, 1.04)

        # Crisp 16th-note funky hi-hats
        for s16 in range(4):
            ht = bt + s16 * step_16
            if ht >= g_end:
                break
            mix_mono(buf, ht, hihat(open_hat=(s16 == 2), amp=0.075 if s16 % 2 == 0 else 0.045), 1.15 if s16 == 2 else 0.85, 0.85 if s16 == 2 else 1.15)

        # Funky octave bassline pattern
        if not is_tension:
            mix_mono(buf, bt, citypop_bass(midi_to_hz(b_root), 0.22, 0.34), 1.0, 1.0)
            mix_mono(buf, bt + 2 * step_16, citypop_bass(midi_to_hz(b_root + 12), 0.14, 0.24), 1.0, 1.0)
            if in_bar in (1, 3):
                mix_mono(buf, bt + 3 * step_16, citypop_bass(midi_to_hz(b_root + 7), 0.14, 0.26), 1.0, 1.0)
        else:
            # Driving filtered tension 8ths in Scene 5A
            mix_mono(buf, bt, citypop_bass(midi_to_hz(b_root), 0.18, 0.28), 1.0, 1.0)
            mix_mono(buf, bt + 2 * step_16, citypop_bass(midi_to_hz(b_root), 0.14, 0.20), 1.0, 1.0)

        # Syncopated lush City-Pop Rhodes stabs
        if in_bar in (0, 2):
            rhodes_chord(buf, bt, c_voicing, 0.36, amp=0.11 if not is_tension else 0.07, pan=0.15)
        elif in_bar == 1:
            rhodes_chord(buf, bt + 2 * step_16, c_voicing, 0.28, amp=0.10 if not is_tension else 0.06, pan=-0.15)

        # Bright City-Pop hook melody lifting on Scene 4B (19.40s..25.40s)
        if 19.35 <= bt < 25.30:
            m_note = melody_notes[bi % len(melody_notes)]
            mix_mono(buf, bt, bell_lead(midi_to_hz(m_note), 0.34, amp=0.14), 0.85, 1.15)
            if bi % 2 == 1:
                m2 = melody_notes[(bi + 2) % len(melody_notes)]
                mix_mono(buf, bt + 2 * step_16, bell_lead(midi_to_hz(m2), 0.22, amp=0.11), 1.15, 0.85)

    # Synced subtle gameplay Foley across Scene 4
    # Keycap shotgun crisp micro-ticks (13.00..19.00)
    kt = 13.10
    while kt < 19.00:
        ttk = np.linspace(0, 0.025, int(SR * 0.025), endpoint=False)
        k_sig = 0.09 * np.sin(2 * np.pi * (820 + rng.uniform(-90, 140)) * ttk) * np.exp(-ttk * 220)
        mix_mono(buf, kt, k_sig, 0.85, 1.05)
        kt += 0.28

    # 14.70s drop crate pop
    tp2 = np.linspace(0, 0.14, int(SR * 0.14), endpoint=False)
    pop_s = 0.32 * np.sin(2 * np.pi * np.cumsum(300 + 520 * np.exp(-tp2 * 22)) / SR) * np.exp(-tp2 * 20)
    mix_mono(buf, 14.70, pop_s, 1.0, 1.0)

    # 15.80s red gate flip sparkle chime
    for idx, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        mix_mono(buf, 15.80 + idx * 0.045, bell_lead(f, 0.26, amp=0.15), 0.9, 1.1)

    # 20.40s & 21.50s chain lightning zaps
    for zt in [20.40, 21.50]:
        tz = np.linspace(0, 0.22, int(SR * 0.22), endpoint=False)
        zap = 0.22 * rng.normal(0, 1, len(tz)) * np.exp(-tz * 16.0) * (0.5 + 0.5 * np.sin(2 * np.pi * 48 * tz))
        zap += 0.16 * np.sin(2 * np.pi * np.cumsum(1600 * np.exp(-tz * 10)) / SR) * np.exp(-tz * 14.0)
        mix_mono(buf, zt, zap, 1.1, 0.9)

    # 22.60s squad-100 celebratory sparkle
    for idx, f in enumerate([659.25, 783.99, 987.77, 1318.5]):
        mix_mono(buf, 22.60 + idx * 0.04, bell_lead(f, 0.30, amp=0.14), 1.1, 0.9)

    # ============================================================
    # 5. Scene 5A & 5B (25.40s..34.60s): KPI Boss Tension -> 18:00 Stamp KO -> Rhodes Resolution
    # ============================================================
    # Subtle Boss alarm sonar pulse (25.50, 26.80)
    for st in [25.50, 26.80]:
        ta = np.linspace(0, 0.36, int(SR * 0.36), endpoint=False)
        f_a = 520.0 - 150.0 * (ta / 0.36)
        al = 0.18 * np.sin(2 * np.pi * np.cumsum(f_a) / SR) * np.exp(-ta * 6.5)
        mix_mono(buf, st, al, 1.0, 1.0)

    # Pre-ult hero blips (28.20..29.40) + clock chime riser (29.20..30.00)
    add_vn_blips(buf, 28.20, 29.40, base_hz=305.0, span_hz=45.0, cps=12.5, timbre="hero", amp=0.13, pan=0.0)
    tr2 = np.linspace(0, 0.80, int(SR * 0.80), endpoint=False)
    ris2 = 0.18 * (tr2 / 0.80) * np.sin(2 * np.pi * np.cumsum(440 * (2 ** (tr2 * 1.8))) / SR)
    mix_mono(buf, 29.20, ris2, 1.0, 1.0)

    # 30.00s MASSIVE 18:00 Stamp KO Impact + Sub Boom + Crystal Shatter!
    ts = np.linspace(0, 1.35, int(SR * 1.35), endpoint=False)
    # Chunky mechanical timecard punch + deep sub drop + crystalline shatter
    stamp_chunk = 0.65 * np.sin(2 * np.pi * 160 * np.exp(-ts * 45.0) * ts) * np.exp(-ts * 18.0)
    sub_boom = 0.68 * np.sin(2 * np.pi * (46.0 + 90.0 * np.exp(-ts * 15.0)) * ts) * np.exp(-ts * 3.8)
    shatter = 0.28 * rng.normal(0, 1, len(ts)) * np.exp(-ts * 9.0) * (ts < 0.45)
    mix_mono(buf, 30.00, stamp_chunk + sub_boom + shatter, 1.0, 1.0)
    # Victory bell chord at 30.12s
    for idx, f in enumerate([523.25, 659.25, 783.99, 1046.5]):
        mix_mono(buf, 30.12 + idx * 0.03, bell_lead(f, 0.85, amp=0.13), 0.9, 1.1)

    # Relieved hero closing line (30.65..31.85): "天塌了，明天再说。"
    add_vn_blips(buf, 30.65, 31.85, base_hz=285.0, span_hz=36.0, cps=10.0, timbre="hero", amp=0.14, pan=-0.05)

    # ============================================================
    # 6. Scene 6 (31.80s..40.00s): Lush Warm Lo-Fi Rhodes Bookend + Fade Out
    # ============================================================
    rhodes_chord(buf, 31.80, [53, 60, 64, 67, 72], 2.8, amp=0.15, pan=0.05)   # Fmaj7
    rhodes_chord(buf, 34.40, [52, 59, 62, 67, 71], 2.7, amp=0.14, pan=-0.05)  # Em7
    rhodes_chord(buf, 36.80, [50, 57, 60, 64, 69], 3.2, amp=0.14, pan=0.0)    # Dm9

    # Gentle crystal shimmer on SSR diagnosis card reveal (34.70s)
    for idx, f in enumerate([783.99, 987.77, 1174.66, 1567.98]):
        mix_mono(buf, 34.70 + idx * 0.055, bell_lead(f, 0.45, amp=0.10), 1.05, 0.95)

    # Smooth fade-out 38.80..40.00
    f0 = int(38.80 * SR)
    buf[:, f0:] *= np.linspace(1.0, 0.0, N_SAMPLES - f0) ** 1.4

    # Soft limiting to -1.0 dBFS with clean headroom
    peak = np.max(np.abs(buf))
    if peak > 0:
        buf = np.tanh(buf / max(0.85, peak * 1.05) * 1.15) * 0.86

    pcm = np.clip(buf.T * 32767.0, -32768, 32767).astype(np.int16)
    with wave.open(str(OUT_PATH), "wb") as wf:
        wf.setnchannels(2)
        wf.setsampwidth(2)
        wf.setframerate(SR)
        wf.writeframes(pcm.tobytes())

    rms = float(np.sqrt(np.mean((buf * 1.0) ** 2)))
    print(f"✓ Audio synthesized: {OUT_PATH} ({DURATION:.2f}s, 44.1kHz stereo, rms={rms:.3f}, peak={int(np.max(np.abs(pcm)))})")


if __name__ == "__main__":
    main()
