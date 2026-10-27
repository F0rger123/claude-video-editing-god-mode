#!/usr/bin/env python3
"""Side-by-side before/after comparison of two vertical videos.

Overlays a labelled pill on the bottom of each side and hstacks them. Great for
"no zooms vs cut + zooms" style demos. Both videos are scaled to the right
video's dimensions; audio is taken from one side (default: right).

Usage:
  python3 make_comparison.py LEFT.mp4 RIGHT.mp4 OUT.mp4 \
      --left-label "no zooms" --right-label "cut + zooms" \
      [--audio right|left] [--left-color 4646 46 --right-color ff2d82]

Colors are hex RGB (e.g. ff2d82 = hot pink). Defaults: left grey, right pink.
Requires: ffmpeg (with libx264) and Pillow.
"""
import argparse, subprocess, tempfile, os, sys
from PIL import Image, ImageDraw, ImageFont

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
]

def font(sz):
    for fp in FONT_CANDIDATES:
        if os.path.exists(fp):
            return ImageFont.truetype(fp, sz)
    return ImageFont.load_default()

def hex_rgb(h):
    h = h.lstrip("#")
    return tuple(int(h[i:i+2], 16) for i in (0, 2, 4))

def make_label(txt, rgb, path, size=52):
    f = font(size); px, py = 40, 26
    tmp = Image.new("RGBA", (10, 10)); d = ImageDraw.Draw(tmp)
    l, t, r, b = d.textbbox((0, 0), txt, font=f, stroke_width=3)
    tw, th = r - l, b - t
    W, H = tw + 2 * px, th + 2 * py
    img = Image.new("RGBA", (W, H), (0, 0, 0, 0)); d = ImageDraw.Draw(img)
    d.rounded_rectangle([0, 0, W - 1, H - 1], radius=H // 2, fill=(*rgb, 232))
    d.text((px - l, py - t), txt, font=f, fill=(255, 255, 255, 255),
           stroke_width=3, stroke_fill=(0, 0, 0, 210))
    img.save(path)

def probe_size(path):
    out = subprocess.check_output([
        "ffprobe", "-v", "error", "-select_streams", "v:0",
        "-show_entries", "stream=width,height",
        "-of", "default=nk=1:nw=1", path]).decode().split()
    return int(out[0]), int(out[1])

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("left"); ap.add_argument("right"); ap.add_argument("out")
    ap.add_argument("--left-label", default="before")
    ap.add_argument("--right-label", default="after")
    ap.add_argument("--left-color", default="464646")   # grey
    ap.add_argument("--right-color", default="ff2d82")  # hot pink
    ap.add_argument("--audio", choices=["left", "right"], default="right")
    ap.add_argument("--y", type=float, default=0.80, help="label height (0-1)")
    ap.add_argument("--crf", type=int, default=20)
    args = ap.parse_args()

    W, H = probe_size(args.right)
    with tempfile.TemporaryDirectory() as tmp:
        ll, rl = os.path.join(tmp, "l.png"), os.path.join(tmp, "r.png")
        make_label(args.left_label, hex_rgb(args.left_color), ll)
        make_label(args.right_label, hex_rgb(args.right_color), rl)
        fc = (
            f"[0:v]scale={W}:{H},setsar=1[l0];[l0][1]overlay=x=(W-w)/2:y=H*{args.y}[L];"
            f"[3:v]scale={W}:{H},setsar=1[r0];[r0][2]overlay=x=(W-w)/2:y=H*{args.y}[R];"
            f"[L][R]hstack=inputs=2,format=yuv420p[v]"
        )
        amap = "0:a" if args.audio == "left" else "3:a"
        cmd = ["ffmpeg", "-y", "-v", "error", "-stats",
               "-i", args.left, "-i", ll, "-i", rl, "-i", args.right,
               "-filter_complex", fc, "-map", "[v]", "-map", amap, "-shortest",
               "-c:v", "libx264", "-crf", str(args.crf), "-preset", "medium",
               "-movflags", "+faststart", args.out]
        subprocess.run(cmd, check=True)
    print("wrote", args.out)

if __name__ == "__main__":
    main()
