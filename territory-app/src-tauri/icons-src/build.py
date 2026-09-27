"""The Organized Territories icons, from AppIcon.icon (open it in Icon Composer
to change the design). iOS 26+ renders that file as Liquid Glass; this script
flattens its layers for everything else. Its grid layer is drawn 1.5 times larger, as the
Android launcher crops it, so iOS shows the same circle. Run from this folder, then
`npm run tauri -- icon src-tauri/app-icon.json` makes every size from the PNGs."""
import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageChops, ImageDraw, ImageFilter

HERE = Path(__file__).parent
LAYERS = HERE / 'AppIcon.icon' / 'Assets'
BACK_TO_FRONT = ['bg', 'violet', 'yellow', 'green', 'blue']


def layer(name, size):
    png = subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), str(LAYERS / f'{name}.svg')],
                         check=True, capture_output=True).stdout
    return Image.open(BytesIO(png)).convert('RGBA')


def glass(art, size):
    """What iOS 26 draws for us, for everywhere else: a soft shadow below,
    a sheen over the top and a bright rim of light."""
    alpha = art.getchannel('A')
    k = size / 1024
    shadow = Image.new('RGBA', art.size, (20, 30, 70, 0))
    shadow.putalpha(alpha.point(lambda a: a * 0.28).filter(ImageFilter.GaussianBlur(18 * k)))
    out = Image.new('RGBA', art.size, (0, 0, 0, 0))
    out.alpha_composite(shadow, (0, round(14 * k)))
    out.alpha_composite(art)
    fade = Image.linear_gradient('L').resize(art.size).point(lambda v: int((255 - v) * 0.18))
    sheen = Image.new('RGBA', art.size, (255, 255, 255, 0))
    sheen.putalpha(ImageChops.multiply(fade, alpha))
    out.alpha_composite(sheen)
    inner = alpha.filter(ImageFilter.MinFilter(max(3, round(7 * k)) | 1))
    rim = ImageChops.subtract(alpha, inner).filter(ImageFilter.GaussianBlur(1.2 * k))
    light = Image.new('RGBA', art.size, (255, 255, 255, 0))
    light.putalpha(ImageChops.multiply(rim, fade.point(lambda v: min(160, 40 + v))))
    out.alpha_composite(light)
    return out


def background(size):
    out = layer('bg', size)
    glow = Image.new('RGBA', (size, size), (255, 255, 255, 0))
    mask = Image.new('L', (size, size), 0)
    ImageDraw.Draw(mask).ellipse((-size * 0.3, -size * 0.45, size * 0.9, size * 0.55), fill=14)
    glow.putalpha(mask.filter(ImageFilter.GaussianBlur(size * 0.12)))
    out.alpha_composite(glow)
    return out


def stack(names, size):
    out = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    for name in names:
        if name == 'bg':
            out.alpha_composite(background(size))
        else:
            out.alpha_composite(glass(layer(name, size), size))
    return out



# Android's adaptive icon: the light background behind, the cards in front. Launchers show the
# middle 72 of 108 units; the stack reaches about 85% of the round mask.
safe = round(1024 * 74 / 108)
pad = (1024 - safe) // 2
background(1024).convert('RGB').save(HERE / 'android-background.png')
front = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
front.alpha_composite(stack(BACK_TO_FRONT[1:], safe), (pad, pad))
front.save(HERE / 'android-foreground.png')

# iOS before 26 and every other square use: what the Android launcher shows, so the circle on
# the grid is seen everywhere; opaque, full bleed
cut = round(1024 * 18 / 108)
flat = background(1024)
flat.alpha_composite(front)
flat = flat.crop((cut, cut, 1024 - cut, 1024 - cut)).resize((1024, 1024), Image.LANCZOS)
# a light edge in the strong grid line's white, along the iOS shape; Android's launcher picks its
# own shape and iOS 26 draws its own edge, so neither gets it
edge = Image.new('L', (4096, 4096), 0)
ImageDraw.Draw(edge).rounded_rectangle((0, 0, 4095, 4095), radius=round(4096 * 0.2237), outline=102, width=27)
light = Image.new('RGBA', (1024, 1024), (255, 255, 255, 0))
light.putalpha(edge.resize((1024, 1024), Image.LANCZOS))
flat.alpha_composite(light)
flat.convert('RGB').save(HERE / 'ios-icon.png')
flat.save(HERE / 'app-icon.png')

# the themed icon is one ink: each card a step stronger, the front one full ink
mono = Image.new('L', (safe, safe), 0)
gap = round(safe * 0.035) | 1
for name, ink in [('violet', 70), ('yellow', 120), ('green', 175), ('blue', 255)]:
    # the card only, not the soft glow around it
    alpha = layer(name, safe).getchannel('A').point(lambda a: 255 if a > 250 else 0)
    # a clear gap around each card keeps the stack readable in one ink, as in the notification icon
    mono.paste(0, mask=alpha.filter(ImageFilter.MaxFilter(gap)))
    mono.paste(Image.new('L', (safe, safe), ink), mask=alpha)
# the star on the front card stays a cut-out
star = layer('blue', safe).convert('L').point(lambda v: 255 if v > 245 else 0)
mono.paste(0, mask=star)
out = Image.new('RGBA', (1024, 1024), (0, 0, 0, 0))
out.paste(Image.new('RGBA', (safe, safe), (0, 0, 0, 255)), (pad, pad), mask=mono)
out.save(HERE / 'android-monochrome.png')
