# Writes the icon SVGs; the shapes are shared so every variant matches.
DEFS = '''
    <linearGradient id="violet" x1="24" y1="22" x2="50" y2="52" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#B274C4"/><stop offset="1" stop-color="#7D5FBD"/>
    </linearGradient>
    <linearGradient id="yellow" x1="58" y1="22" x2="86" y2="52" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#EEAF35"/><stop offset="1" stop-color="#FBC93C"/>
    </linearGradient>
    <linearGradient id="blue" x1="24" y1="58" x2="51" y2="86" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#0ABBE5"/><stop offset="1" stop-color="#3B98CC"/>
    </linearGradient>
    <linearGradient id="green" x1="84" y1="58" x2="58" y2="86" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#5C9B1C"/><stop offset="1" stop-color="#50B600"/>
    </linearGradient>
    <linearGradient id="pin" x1="54" y1="34" x2="54" y2="66" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#6378E0"/><stop offset="1" stop-color="#3E52BE"/>
    </linearGradient>
    <linearGradient id="paper" x1="0" y1="0" x2="108" y2="108" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FBFBFF"/><stop offset="1" stop-color="#E7EAFB"/>
    </linearGradient>
    <filter id="shadow" x="-40%" y="-40%" width="180%" height="180%">
      <feDropShadow dx="0" dy="1.6" stdDeviation="1.6" flood-color="#1B2466" flood-opacity="0.35"/>
    </filter>
'''

# four territories with streets between them, a little irregular like real ones
BLOCKS = [
    ('violet', '23,27 49,23 51,50 25,52'),
    ('yellow', '57,23 85,28 84,50 57,50'),
    ('blue', '25,58 51,57 50,85 28,83'),
    ('green', '57,57 84,57 81,84 58,86'),
]

PIN = 'M54 66 C50.6 60.4 45 55.2 45 47.4 A9 9 0 1 1 63 47.4 C63 55.2 57.4 60.4 54 66 Z'


def blocks(fill=None):
    return '\n'.join(
        f'    <polygon points="{p}" fill="{fill or f"url(#{g})"}" stroke="{fill or f"url(#{g})"}" '
        'stroke-width="4" stroke-linejoin="round"/>'
        for g, p in BLOCKS
    )


def pin(color='url(#pin)', dot='#FFFFFF', ring='#FFFFFF', shadow=True):
    effect = ' filter="url(#shadow)"' if shadow else ''
    return (
        f'    <path d="{PIN}" fill="{color}" stroke="{ring}" stroke-width="2.4" stroke-linejoin="round"{effect}/>\n'
        f'    <circle cx="54" cy="47.4" r="3.6" fill="{dot}"/>'
    )


def svg(body, view='0 0 108 108', size=1024):
    return (
        f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="{view}">\n'
        f'  <defs>{DEFS}  </defs>\n{body}\n</svg>\n'
    )


# the whole icon on its rounded tile, for iOS, desktop and old Android
open('app-icon.svg', 'w').write(svg(
    '  <rect width="108" height="108" rx="24" fill="url(#paper)"/>\n'
    '  <g transform="translate(54 54) scale(1.22) translate(-54 -54)">\n'
    + blocks() + '\n' + pin() + '\n  </g>'
))

# Android adaptive icon: the launcher crops the layers to its own shape, and
# only the middle 66 of 108 units are always visible
open('android-foreground.svg', 'w').write(svg(blocks() + '\n' + pin()))
open('android-background.svg', 'w').write(svg('  <rect width="108" height="108" fill="url(#paper)"/>'))
# themed icons (Android 13+): one colour, the system tints it
open('android-monochrome.svg', 'w').write(svg(
    '  <mask id="cut"><rect width="108" height="108" fill="#fff"/>'
    f'<path d="{PIN}" fill="#000" stroke="#000" stroke-width="5"/></mask>\n'
    '  <g mask="url(#cut)">\n' + blocks('#000000') + '\n  </g>\n'
    '  <mask id="dot"><rect width="108" height="108" fill="#fff"/>'
    '<circle cx="54" cy="47.4" r="3.6" fill="#000"/></mask>\n'
    f'  <path d="{PIN}" fill="#000000" mask="url(#dot)"/>'
))
