"""The Territories icons: the Organized logo (organized-tauri-shell/src-tauri/
icons-src and public/favicon.svg) with a location pin in its white middle.
Run from this folder; `npm run tauri -- icon src-tauri/app-icon.json` then
makes every size from the PNGs."""
import re
import shutil
import subprocess
from pathlib import Path

HERE = Path(__file__).parent
SHELL = HERE / '../../../../organized-tauri-shell/src-tauri/icons-src'
FAVICON = HERE / '../../../public/favicon.svg'

PIN_GRADIENT = (
    '<linearGradient id="territoryPin" x1="0" y1="0" x2="0" y2="1">'
    '<stop offset="0" stop-color="#6A7EE6"/><stop offset="1" stop-color="#3E52BE"/>'
    '</linearGradient>'
)


def pin_path(cx, cy, r):
    tip = cy + 2.067 * r
    return (
        f'M{cx} {tip} C{cx - 0.378 * r} {tip - 0.622 * r} {cx - r} {cy + 0.867 * r} {cx - r} {cy} '
        f'A{r} {r} 0 1 1 {cx + r} {cy} C{cx + r} {cy + 0.867 * r} {cx + 0.378 * r} {tip - 0.622 * r} {cx} {tip} Z'
    )


def pin(cx, cy, r, mono=False):
    """The pin centred on the logo's middle; its white ring keeps it apart from the petals."""
    path = pin_path(cx, cy, r)
    if mono:
        return (
            f'<mask id="pinDot"><rect x="-1000" y="-1000" width="3000" height="3000" fill="#fff"/>'
            f'<circle cx="{cx}" cy="{cy}" r="{r * 0.36}" fill="#000"/></mask>'
            f'<path d="{path}" fill="#000" mask="url(#pinDot)"/>'
        )
    return (
        f'<defs>{PIN_GRADIENT}</defs>'
        f'<path d="{path}" fill="#FFFFFF" stroke="#FFFFFF" stroke-width="{r * 0.5}" stroke-linejoin="round"/>'
        f'<path d="{path}" fill="url(#territoryPin)"/>'
        f'<circle cx="{cx}" cy="{cy}" r="{r * 0.36}" fill="#FFFFFF"/>'
    )


def with_pin(source: Path, target: str, cx, cy, r, mono=False):
    svg = source.read_text()
    if mono:
        # the themed icon's middle is empty; the pin fills it in the same ink
        svg = re.sub(r'fill="#(?!fff|FFF)[0-9A-Fa-f]{6}"', 'fill="#000"', svg)
    svg = svg.replace('</svg>', pin(cx, cy, r, mono) + '</svg>')
    (HERE / target).write_text(svg)


# the logo sits on a 32-unit grid; its white middle spans about 11 to 21
with_pin(SHELL / 'app-icon.svg', 'app-icon.svg', 16, 14.1, 2.9)
with_pin(SHELL / 'android-foreground.svg', 'android-foreground.svg', 16, 14.1, 2.9)
with_pin(FAVICON, 'logo.svg', 16, 14.1, 2.9)
# the themed icon is drawn at 70/32 of that size around 54,54
with_pin(SHELL / 'android-adaptive-themed-108.svg', 'android-monochrome.svg', 54, 49.6, 6.35, mono=True)
shutil.copy(SHELL / 'android-background.png', HERE / 'android-background.png')

for name, size in [('app-icon', 1024), ('android-foreground', 1024), ('android-monochrome', 1024), ('logo', 384)]:
    subprocess.run(['rsvg-convert', '-w', str(size), '-h', str(size), f'{name}.svg', '-o', f'{name}.png'], cwd=HERE, check=True)

# iOS rounds the corners itself and rejects transparency: the foreground on
# white, full bleed. `tauri icon` then fills gen/apple's AppIcon set from it.
from PIL import Image

ios = Image.new('RGBA', (1024, 1024), (255, 255, 255, 255))
ios.alpha_composite(Image.open(HERE / 'android-foreground.png').convert('RGBA').resize((1024, 1024)))
ios.convert('RGB').save(HERE / 'ios-icon.png')
