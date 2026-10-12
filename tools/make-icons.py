"""Draws the AutoShorts icons (any + maskable) at all sizes. Run: python3 tools/make-icons.py"""
from PIL import Image, ImageDraw
import os

ROOT = os.path.join(os.path.dirname(__file__), '..', 'icons')
os.makedirs(ROOT, exist_ok=True)
NIGHT = (28, 23, 51, 255)
NIGHT2 = (45, 38, 80, 255)
CAP = (255, 210, 63, 255)
INK = (23, 18, 43, 255)

def draw(size, maskable=False):
    S = 1024
    img = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(img)
    if maskable:
        d.rectangle([0, 0, S, S], fill=NIGHT)
        scale = 0.62
    else:
        d.rounded_rectangle([40, 40, S - 40, S - 40], radius=220, fill=NIGHT)
        scale = 0.78
    # subtle second frame behind (a "stack" of shorts)
    fw = int(S * 0.36 * scale / 0.78)
    fh = int(fw * 16 / 9)
    cx, cy = S // 2, S // 2
    off = int(fw * 0.16)
    d.rounded_rectangle([cx - fw // 2 + off, cy - fh // 2 - off * 0.2, cx + fw // 2 + off, cy + fh // 2 - off * 0.2], radius=int(fw * 0.2), fill=NIGHT2)
    # main 9:16 frame in caption yellow
    x0, y0 = cx - fw // 2 - off // 3, cy - fh // 2 + off // 4
    d.rounded_rectangle([x0, y0, x0 + fw, y0 + fh], radius=int(fw * 0.2), fill=CAP)
    # play triangle
    tw = fw * 0.42
    tx = x0 + fw * 0.34
    ty = y0 + fh * 0.36
    d.polygon([(tx, ty), (tx + tw, ty + tw * 0.58), (tx, ty + tw * 1.16)], fill=INK)
    # caption bars
    bw = fw * 0.62
    bx = x0 + (fw - bw) / 2
    by = y0 + fh * 0.72
    d.rounded_rectangle([bx, by, bx + bw, by + fh * 0.055], radius=int(fh * 0.03), fill=INK)
    d.rounded_rectangle([bx + bw * 0.15, by + fh * 0.09, bx + bw * 0.85, by + fh * 0.145], radius=int(fh * 0.03), fill=INK)
    return img.resize((size, size), Image.LANCZOS)

for s in [48, 72, 96, 128, 144, 192, 256, 384, 512]:
    draw(s).save(os.path.join(ROOT, f'icon-{s}.png'))
draw(512, maskable=True).save(os.path.join(ROOT, 'maskable-512.png'))
draw(1024).save(os.path.join(ROOT, 'icon-1024.png'))
print('icons written')
