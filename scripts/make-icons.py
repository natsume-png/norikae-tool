# ホーム画面用のアイコン（PNG）を作る。日本語フォントがあれば「亀」、なければ記号だけ。
# 使い方: python3 scripts/make-icons.py
import os, glob
from PIL import Image, ImageDraw, ImageFont

root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
out = os.path.join(root, "icons"); os.makedirs(out, exist_ok=True)

def find_font():
    pats = ["/usr/share/fonts/**/*Gothic*.ttf", "/usr/share/fonts/**/*Gothic*.ttc", "/usr/share/fonts/**/*CJK*.ttc",
            "/usr/share/fonts/**/*CJK*.otf", "/usr/share/fonts/**/Noto*JP*.ttf", "/usr/share/fonts/**/*ipag*.ttf",
            "/usr/share/fonts/**/*takao*.ttf", "/usr/share/fonts/**/*VL*.ttf"]
    for p in pats:
        for f in glob.glob(p, recursive=True):
            return f
    return None

def draw(size, pad_ratio):
    img = Image.new("RGBA", (size, size), (0, 147, 107, 255))  # 千代田線の緑
    d = ImageDraw.Draw(img)
    r = size * 0.5
    d.ellipse([size*0.5-r*0.78, size*0.5-r*0.78, size*0.5+r*0.78, size*0.5+r*0.78], fill=(255, 255, 255, 255))
    font = find_font()
    if font:
        f = ImageFont.truetype(font, int(size*0.5))
        d.text((size*0.5, size*0.5), "亀", font=f, fill=(0, 147, 107, 255), anchor="mm")
    else:
        # フォントが無いときは線路の記号
        w = size*0.08
        d.rectangle([size*0.32, size*0.3, size*0.32+w, size*0.7], fill=(0, 147, 107, 255))
        d.rectangle([size*0.6, size*0.3, size*0.6+w, size*0.7], fill=(0, 147, 107, 255))
        for y in (0.36, 0.48, 0.6):
            d.rectangle([size*0.32, size*y, size*0.68, size*y+w*0.6], fill=(0, 147, 107, 255))
    return img

draw(192, 0).save(os.path.join(out, "icon-192.png"))
draw(512, 0).save(os.path.join(out, "icon-512.png"))
draw(180, 0).save(os.path.join(out, "apple-touch-icon.png"))
print("icons/ に3つ作った。フォント:", find_font())
