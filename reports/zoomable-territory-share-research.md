# Zoomable territory map for publishers: research

Date: 2026-10-31. Scope: web research plus measurements against the app's own tile
providers. No code changes.

Goal: alongside today's PNG/JPEG card, send a publisher a file that can be
pinch-zoomed until street names and house numbers are readable. The file must
work offline on a stock phone, carry the border itself, and never point to a
server that holds territory data.

## TL;DR ranking

| # | Option | Stock phone, offline | Street names + house numbers zoomed | Size (one territory, 0.5–2 km², Berlin density) | Effort | Privacy |
|---|---|---|---|---|---|---|
| 1 | **Atlas PDF**: overview page + detail pages rendered by the existing MapLibre capture at z17–18 | iOS and Android (any PDF viewer) | Very good (every page is a normal-size capture, labels placed by MapLibre) | ~2–6 MB (4–9 pages of ~400–700 KB JPEG) | **Low**: reuses `capture.ts` + `@react-pdf/renderer` already in the app | Border only in the file |
| 2 | **Single-page vector PDF** (paths + real text), optionally **Geospatial PDF** | iOS and Android; GPS dot in Avenza/QGIS/QField | Best: infinitely sharp, text searchable | ~0.4–1.5 MB (estimate) | **Medium-high**: own renderer from vector tiles to PDF | Same |
| 3 | **Very-high-res JPEG sent as a document** (4000–8000 px) | Everywhere (Photos/Gallery/Files) | Good if sent as a *document*; bad if sent as a WhatsApp *photo* (downscaled to ~1600 px, HD ~4096 px) | ~3–8 MB | Low-medium (canvas limits force tiled rendering and stitching) | Same |
| 4 | **Bonus: KML/GPX border for Organic Maps (or CoMaps/OsmAnd)** | Needs a free app and a downloaded offline region | Very good (house numbers from OSM, offline), plus live GPS dot | ~1–5 KB file | Low | Border only; the app needs a one-time online map download (not territory data) |
| 5 | Self-contained HTML (MapLibre + embedded tiles + glyphs) | Android Chrome and desktop yes; **iOS unreliable** (Quick Look shows HTML without running scripts) | Excellent where it runs | ~3–5 MB | Medium | Good if CSP blocks all network |
| 6 | SVG with text | iOS Quick Look probably; Android has no stock viewer | Good | ~1–3 MB | Medium | Same |
| 7 | PMTiles/MBTiles file | No stock viewer on either platform | n/a | ~0.5–2 MB | n/a | n/a |

**Recommendation:** ship #1 first. It is almost entirely existing code, works on
every phone, and is readable. Later, if wanted, add #2 (vector + geo-registered)
as the high-quality version. Offer #4 as an optional extra attachment ("open in
Organic Maps for GPS"). Do not make HTML the main format because of iOS.

---

## 0. Facts measured for this app

The app's basemaps are OpenFreeMap (OpenMapTiles schema) and VersaTiles
(Shortbread schema); see `src/features/territories/map/constants.ts`. Both serve
vector tiles up to z14 and overzoom above that. The app already has an offline
tile cache (`territory-map://` protocol, `src/services/maps/offline.ts`), so a
share file can be built from local tiles without a network request.

Measured on 2026-10-31 (Berlin-Neukölln, z14 tile 8803/5375, dense city):

| Provider | gzip on the wire | Uncompressed MVT | House numbers? |
|---|---|---|---|
| OpenFreeMap | 290 KB | 542 KB | yes, `housenumber` layer in the tile data |
| VersaTiles | 173 KB | 319 KB | yes, `addresses` layer |

The other eight tiles in the 3×3 block were 73–333 KB gzip (OpenFreeMap) and
49–227 KB (VersaTiles). At latitude 52.5° a z14 tile is about 1.49 km wide
(~2.2 km²). A 0.5–2 km² territory therefore touches **1–4 z14 tiles**, so the
raw basemap data for one territory is **~0.3–1.2 MB gzip**.

Style notes:
- OpenFreeMap's `liberty` style has **no** house-number layer; the data is in
  the tile and the app adds its own (`basemap.ts`, `HOUSE_NUMBERS_FROM = 15`).
  VersaTiles `graybeard` has `label-address-housenumber` from z17.
- Street names in Liberty show from z12.2 (major), z15 (minor), z15.5 (paths).

Other sizes:
- MapLibre GL JS 6.10 in `node_modules`: `maplibre-gl.mjs` 584 KB +
  `maplibre-gl-shared.mjs` 514 KB + worker 19 KB, so ~1.1 MB unminified-by-gzip
  inside an HTML file. CSS is 83 KB.
- OpenFreeMap glyphs, Noto Sans Regular: range 0–255 is 77 KB, 256–511
  (umlauts are in 0–255, but other Latin letters are in 256–511) is 127 KB,
  8192–8447 (punctuation) is 34 KB. About 240 KB per font; two fonts ~0.5 MB.

The app already shares files natively: iOS through `UIActivityViewController`
(`src-tauri/plugins/nearby/ios/.../NearbyPlugin.swift`), Android through
`FileProvider` in `gen/android/.../FileHandoff.kt`, wired by
`registerFileSharer` in `src/services/files/export.ts`. Any new format (PDF,
KML, HTML) can use that path; no new plugin is needed.

Rough zoom maths (MapLibre 512 px tiles, lat 52.5°): metres per CSS pixel =
40 075 016 · cos(lat) / (512 · 2^z), so z17 ≈ 0.36 m/px and z18 ≈ 0.18 m/px.
A territory 1.4 km wide (2 km²) at z17 is ~3 900 px wide at pixel ratio 1,
~7 800 px at ratio 2. That is the size needed for a single raster where house
numbers stay readable.

## 1. Self-contained HTML

**Build:** one `.html` with MapLibre inlined, the 1–4 z14 tiles plus a few
lower-zoom tiles as base64 (or keep them gzip and inflate with
`DecompressionStream`), glyph PBFs inlined, a style JSON, and the border as a
GeoJSON source. Serve tiles through `maplibregl.addProtocol('embedded', …)`.
The worker can start from a `blob:` URL. Add a `<meta http-equiv=
"Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'
blob:; worker-src blob:; img-src data: blob:; style-src 'unsafe-inline';
connect-src data: blob:">` so the file cannot make any network request.
Estimated size: 1.1 MB code + 0.5 MB glyphs + 0.4–1.6 MB tiles (base64 adds
33 %) ≈ **3–5 MB**.
A lighter renderer (Leaflet + protomaps-leaflet, Canvas 2D with system fonts, no
glyph PBFs) would shrink the code. I did not measure it.

**How phones open it:**
- **iOS:** an `.html` attachment from WhatsApp, Mail or Files opens in Quick
  Look. Reports say Quick Look renders HTML but **does not run JavaScript**, and
  Safari no longer opens local `file://` HTML from Files. Several forum threads
  since iOS 13/14 report this, but Apple documents nothing, so **test on a
  device**. Result: a MapLibre HTML would show a blank page on most iPhones.
  ([Apple forum: JS not executing in attachment](https://developer.apple.com/forums/thread/124172),
  [Apple forum: local files in Safari disabled](https://developer.apple.com/forums/thread/710001),
  [MacPowerUsers iOS 14](https://talk.macpowerusers.com/t/issue-showing-a-local-html-file-in-safari-ios-14/19778),
  [Lexus Financial: secure HTML attachments fail on some phones](https://www.lexusfinancial.com/us/en/planning_tools/faq/encrypted-email/having-trouble-opening-the-securemessageatt-html-file-on-a-smart.html))
- **Android:** opening the document hands it to an app chosen by the user.
  Chrome and Samsung Internet run JS from a `content://` URI (works in
  practice; I found no official doc). The AOSP "HTML Viewer" explicitly
  **disables JavaScript** ([AOSP HTMLViewer commit](https://android.googlesource.com/platform/packages/apps/HTMLViewer.git/+/7609f0f74a1b93ae5964d1d31a51fd25cca5d72b%5E%21/)).
  Outcome depends on which app the user picks.
- **Desktop:** works in any browser.
- **Gmail** treats HTML attachments with suspicion on mobile. Some show a
  "may contain malicious software" warning. Not verified for `.html`.

**Graceful-degradation idea:** put a high-res `<img>` (data URI) in the HTML
body and let the MapLibre map replace it only when scripts run. Quick Look then
shows a pinch-zoomable picture, and Chrome/desktop get the live map. Untested.
It is also bigger, because it holds both payloads.

**Verdict:** best experience on Android and desktop, but it fails the main
target (stock iPhone). Use it at most as an optional second attachment.

## 2. Vector PDF (and Geospatial PDF)

**Why it is strongest:** every iPhone opens PDFs in Quick Look/Files/Books
(including WhatsApp's in-app preview). Android phones with Google services ship
a PDF viewer (Google Drive / Files by Google; Samsung's My Files). Vector
paths and text stay sharp at any zoom, and the text is searchable: a publisher
can search for "Sonnenallee".

**Generating it client-side; options:**
1. *Raster in PDF* (what `@watergis/maplibre-gl-export` does: canvas image in
   jsPDF). Not vector, just a container for a big image
   ([npm](https://npmjs.com/package/%40watergis%2Fmaplibre-gl-export)).
2. *Own vector renderer* (recommended for the vector version): decode the 1–4
   z14 tiles (`@mapbox/vector-tile` + `pbf`, or the PMTiles reader), clip to
   the territory bbox plus padding, project to page points, and write:
   - fills: water, parks, buildings (light grey);
   - roads as stroked lines with width by class (casing + fill = two strokes);
   - the border polygon and do-not-call markers on top;
   - **house numbers**: horizontal text at each `housenumber`/`addresses`
     point;
   - **street names**: straight, rotated text on the longest straight run of
     each street. The app already computes runs in `street_runs.ts`. Text that
     curves along a path is not needed for city blocks.
   Writer: `@react-pdf/renderer` (already a dependency; supports `Svg`, `Path`,
   `Text` with transforms, and embeds font subsets) or `pdf-lib`/jsPDF. Another
   route is SVG to PDF with `svg2pdf.js` (yWorks) in JS, or Typst's `svg2pdf`
   crate in the Tauri Rust side.
   **Estimated size:** clipped geometry for 1–4 tiles is ~1–3 MB of path
   operators before compression and **~0.4–1.5 MB** after Flate, plus a
   ~50–100 KB font subset. This is an estimate, not a measurement.
3. *Canvas-recording trick*: OpenLayers + `ol-mapbox-style` draw Mapbox styles
   through the Canvas 2D API; a mock context (canvas2svg / canvas2pdf) can record
   those calls as vector + text. Creative, but OL caches vector tiles as images
   in some render modes, so it is uncertain. Not recommended.
4. *GDAL* (gdal3.js WASM) writes vector Geospatial PDF with layers. It is a
   heavy WASM bundle (several MB) and overkill here
   ([GDAL PDF driver](https://gdal.org/en/stable/drivers/raster/pdf.html)).

**Page size and zoom limit:** a normal PDF page is at most 14 400 × 14 400 pt
(200 in). Larger needs `UserUnit`, which mobile viewers ignore
([Datalogics](https://kb.datalogics.com/article/how-large-can-a-pdf-document-be-in-inches-101.html)).
That limit does not matter for vector content. What matters is the viewer's
**maximum zoom** (iOS and Android viewers allow several times fit-width; exact
limits not documented). Design rule: at fit-width, a house number should be at
least 1/150–1/200 of the page width, so it reaches ~10–12 pt on screen at ~5×.
For a 1.4 km territory that is ~7–9 m on the ground, which fits between
neighbouring house numbers. A2 or A1 page size with 3–4 pt house numbers works.

**Geospatial PDF (GPS dot):** add the ISO 32000 "Adobe" geo extension (a
`/VP` array with a `/Measure` `/GEO` dictionary: page bbox, GPTS lat/lon,
LPTS, GCS WKT). That is a few dozen bytes and doable with pdf-lib's low-level
objects, or `GEO_ENCODING=ISO32000` in GDAL. OGC Best Practice (`LGIDict`) is
the older encoding
([GDAL PDF driver](https://gdal.org/en/stable/drivers/raster/pdf.html)).
Readers:
- **Avenza Maps**: free tier allows 3 imported custom maps at a time, and the
  App Store listing implies a free account
  ([Avenza support/guides](https://nrca.uconn.edu/wp-content/uploads/sites/3424/2022/07/Avenza-Maps-Field-Guide.pdf),
  [Avenza pricing](https://store.avenza.com/pages/pricing),
  [App Store](https://apps.apple.com/app/avenza-maps/id388424049)).
  An account is a hurdle for publishers.
- **QGIS / QField**: open source, no account.
In a normal PDF viewer the geo data is simply ignored, so adding it costs
nothing.

**House-number data offline:** already in the cached tiles. OpenMapTiles
`housenumber` at z14 (from `addr:housenumber`, building centroids; duplicates
dropped per tile) ([OpenMapTiles schema](https://openmaptiles.org/schema/)).
Shortbread `addresses` at z14. Protomaps puts them in `buildings` with
`kind=address`, `addr_housenumber` ([Protomaps layers](https://docs.protomaps.com/basemaps/layers)).

## 3. Very-high-resolution raster

- Size needed: ~3 900 px (z17, ratio 1) up to ~7 800 px (ratio 2) for 2 km².
  A 6 000 × 6 000 map JPEG at q≈85 is ~3–6 MB (rough estimate; maps
  compress well). WebP is ~25–35 % smaller. AVIF is smaller still (iOS 16+,
  Android 12+ decode it), but JPEG is the safe choice.
- **Canvas limits:** WebKit/WKWebView caps canvas surface and area. Old
  WebKit code had 8 192 px per side, and the area cap is widely reported as
  ~16.7 MP (4096²) on iOS. Probe at runtime with `canvas-size` and render in
  tiles ([geOps on canvas limits](https://geops.com/en/blog/html-canvas-for-raster-exports),
  [WebKit r198875](https://trac.webkit.org/r198875),
  [canvas-size](https://github.com/jhildenbiddle/canvas-size)).
  Tiled rendering makes MapLibre place labels per sub-image, so labels get cut
  or duplicated at seams. Fix it with overlap plus cropping, or render labels in
  a separate pass. Stitching an 8 000 px image in JS needs another big canvas.
  Do it in Rust (`image` crate) on the Tauri side.
- **Messaging:** WhatsApp *photos* are recompressed to ~1600 px (standard) or
  ~4096 px (HD), so house numbers are lost
  ([idownloadblog](https://www.idownloadblog.com/2023/08/18/send-hd-photos-whatsapp-tutorial/),
  [TechRadar](https://www.techradar.com/computing/social-media/hd-photos-are-coming-to-whatsapp-and-videos-will-be-next)).
  It must go as a **document**. The share sheet gives no control over that,
  so a JPEG shared to WhatsApp will usually go as a photo. **This is the main
  reason a PDF wrapper beats a bare JPEG:** PDFs always travel as documents.
- **Deep-zoom (DZI/IIIF) pyramids** need a JS viewer, so they have the same iOS
  problem as section 1.

## 4. SVG

iOS Files/Quick Look previews SVG (I believe since iOS 13, not verified).
Android has no stock SVG viewer: Google Photos/Gallery do not open it, and
Chrome does if the user picks it. Text labels depend on installed fonts unless
converted to paths. Same work as the vector PDF, less reach. Skip as a
deliverable; it is useful only as an intermediate (SVG to PDF).

## 5. KML/GPX/GeoJSON + offline map app (bonus)

- **Organic Maps** (and its 2025 fork CoMaps): imports KML, KMZ, KMB, GPX and
  GeoJSON from the share sheet ("Import with Organic Maps" on iOS, "Open with"
  on Android) ([Organic Maps FAQ](https://organicmaps.app/faq/bookmarks/how-to-import/),
  [CoMaps import](https://www.comaps.app/support/how-to-import-multiple-favorite-places-bookmarks-and-tracks/)).
  The maps are fully offline OSM and show house numbers and street names at
  high zoom, with a GPS dot and search by address. Free, no account.
  Caveats: polygon support is not documented. Export the border as a **closed
  LineString/track** (KML `LineString` or GPX `trk`), which is sure to render.
  KML styling is only partly honoured
  ([discussion](https://github.com/orgs/organicmaps/discussions/13142)). The
  user must download the region map once (online, but no territory data is
  sent). Imported tracks persist in the app's bookmark list. File size ~1–5 KB.
- **OsmAnd**: imports GPX/KML, offline vector maps with house numbers. Heavier
  UI.
- **Google Maps / My Maps**: importing KML needs a Google account and upload to
  Google. That breaks the "no online services" rule. Exclude.
- **Avenza** with Geospatial PDF: see section 2.

## 6. PMTiles / MBTiles

No stock viewer on iOS or Android. Some apps read MBTiles (OsmAnd raster,
Locus, QField), but they need setup and are not publisher-friendly. A PMTiles
extract is only worth it *inside* the HTML from section 1
([Protomaps downloads / extract](https://docs.protomaps.com/basemaps/downloads)).

## 7. Other ideas

- **Atlas PDF (ranked #1):** page 1 is the existing overview card with a grid
  overlay (A1, A2, B1 …). Each following page is one grid cell rendered by the
  existing `capture()` at z17–18 with house numbers on, with the border drawn,
  and a small inset/key showing where the cell sits. Each page is an ordinary
  capture under canvas limits, so there are no seams. Labels stay crisp because
  `pixelRatio` is already tuned for print. Phone viewers swipe between pages,
  and fit-to-page shows a readable street level without pinching. Optional:
  add the real house numbers and street names as invisible PDF text (react-pdf
  `Text` with `opacity: 0`) at their positions, so search works. Size: 4–9
  pages × 400–700 KB ≈ **2–6 MB**, fine for WhatsApp/Signal/email.
- **Web Share Level 2** inside the app: WKWebView supports
  `navigator.share({files})`; Android WebView does not. The app's native sharer
  already covers both, so this is not needed.
- **QR code** with the border encoded (polyline ~200–600 chars): there is no
  stock target that renders a polygon from a QR without a website or the app.
  Only useful app-to-app. Exclude for publishers.
- **App Clips / Instant Apps:** need hosting and store listing. Excluded.
- **MapLibre Native snapshots** (Rust bindings) for high-res rendering in the
  backend: possible but a large native dependency. Tiled JS capture + Rust
  stitching gives the same result.

## Sharing from Tauri 2

- Already in the app: iOS `UIActivityViewController` (nearby plugin), Android
  `FileProvider` + `ACTION_SEND` (`FileHandoff.kt`, cache dir `shared/`). A PDF
  needs MIME `application/pdf`, KML `application/vnd.google-earth.kml+xml`, GPX
  `application/gpx+xml`. Sharing several files at once (PDF + KML) needs
  `ACTION_SEND_MULTIPLE` on Android and multiple `activityItems` on iOS.
- Community plugins, if ever wanted:
  - [tauri-plugin-sharekit](https://github.com/Choochmeque/tauri-plugin-sharekit)
    0.3.1: Android/iOS/macOS/Windows; Android uses FileProvider + `ACTION_SEND`
    ([source](https://docs.rs/crate/tauri-plugin-sharekit/0.3.1/source/android/src/main/java/SharePlugin.kt)).
    About 22 stars and no tagged releases: small but active.
  - [tauri-plugin-vnidrop-share](https://docs.rs/crate/tauri-plugin-vnidrop-share/latest/source/android/src/main/java/SharePlugin.kt):
    FileProvider, single/multiple.
  - [tauri-plugin-android-fs](https://docs.rs/tauri-plugin-android-fs/latest/src/tauri_plugin_android_fs/api/file_sender.rs.html):
    general Android FS with `share_files`.
  - [tauri-plugin-mobile-share](https://docs.rs/crate/tauri-plugin-mobile-share/latest/source/README.md)
    0.1.2: iOS only.
  There is no official share plugin in tauri-apps/plugins-workspace.
  Recommendation: keep the in-house implementation.

## Transport limits

| Channel | Limit | Notes |
|---|---|---|
| WhatsApp document | 2 GB (rolled out 2022; one 2026 blog claims 100 MB, unconfirmed) | Photos are recompressed; send maps as documents ([Infobae](https://www.infobae.com/en/2022/03/23/whatsapp-increases-the-size-of-documents-that-can-be-sent-to-2-gb)) |
| Signal | ~100 MB (secondary source) | ([Xataka](https://www.xatakamovil.com/aplicaciones/whatsapp-telegram-line-signal-facebook-imessage-este-su-limite-tamano-para-envio-archivos)) |
| Gmail | 25 MB per message; beyond that it becomes a Drive link (online, avoid) | ([UH](https://www.hawaii.edu/askus/1203)) |
| Outlook.com / iCloud Mail | ~20 MB; iCloud Mail Drop uploads to iCloud (avoid) | |
| AirDrop / Nearby Share | no practical limit | local only, best privacy |

Every proposed file (≤ 6 MB) fits every channel.

## Licence and privacy

- OSM data is ODbL. A PDF or image is a "Produced Work": show
  "© OpenStreetMap contributors" on every page (plus "OpenFreeMap © OpenMapTiles"
  or VersaTiles credit). The app already paints attribution
  (`services/maps/attribution.ts`). Embedding raw tiles (HTML, PMTiles) is
  distributing a derivative database: still allowed, but it falls under ODbL
  share-alike for that data. Harmless here, but say so.
- Keep private data minimal: border, territory name/number, optional
  do-not-call markers only when the servant opts in. Strip PDF metadata
  (author/creator/app user name). In HTML, the CSP above guarantees no network
  leak. Note that a file, once sent, cannot be revoked; mention this in the UI.

## Open questions to test on devices

1. iOS 18/26 Quick Look: does an HTML attachment run any JS? Does a data-URI
   `<img>` in HTML zoom? (decides options 5 and the degradation idea)
2. Maximum zoom in iOS Files/Quick Look and Google Drive PDF viewer, which
   sets the label size rule for the single-page vector PDF.
3. Organic Maps: does a KML `Polygon` render, or only `LineString`?
4. WhatsApp current document limit (official FAQ not reachable in this
   session).
5. Actual atlas-PDF size with the app's capture settings (measure one Berlin
   territory).

## Sources

- https://developer.apple.com/forums/thread/124172
- https://developer.apple.com/forums/thread/710001
- https://talk.macpowerusers.com/t/issue-showing-a-local-html-file-in-safari-ios-14/19778
- https://www.lexusfinancial.com/us/en/planning_tools/faq/encrypted-email/having-trouble-opening-the-securemessageatt-html-file-on-a-smart.html
- https://android.googlesource.com/platform/packages/apps/HTMLViewer.git/+/7609f0f74a1b93ae5964d1d31a51fd25cca5d72b%5E%21/
- https://docs.protomaps.com/basemaps/layers
- https://docs.protomaps.com/basemaps/downloads
- https://openmaptiles.org/schema/
- https://gdal.org/en/stable/drivers/raster/pdf.html
- https://kb.datalogics.com/article/how-large-can-a-pdf-document-be-in-inches-101.html
- https://npmjs.com/package/%40watergis%2Fmaplibre-gl-export
- https://geops.com/en/blog/html-canvas-for-raster-exports
- https://trac.webkit.org/r198875
- https://github.com/jhildenbiddle/canvas-size
- https://www.idownloadblog.com/2023/08/18/send-hd-photos-whatsapp-tutorial/
- https://www.techradar.com/computing/social-media/hd-photos-are-coming-to-whatsapp-and-videos-will-be-next
- https://www.infobae.com/en/2022/03/23/whatsapp-increases-the-size-of-documents-that-can-be-sent-to-2-gb
- https://cococonvert.com/blog/whatsapp-file-size-limits
- https://www.xatakamovil.com/aplicaciones/whatsapp-telegram-line-signal-facebook-imessage-este-su-limite-tamano-para-envio-archivos
- https://www.hawaii.edu/askus/1203
- https://organicmaps.app/faq/bookmarks/how-to-import/
- https://www.comaps.app/support/how-to-import-multiple-favorite-places-bookmarks-and-tracks/
- https://github.com/orgs/organicmaps/discussions/13142
- https://nrca.uconn.edu/wp-content/uploads/sites/3424/2022/07/Avenza-Maps-Field-Guide.pdf
- https://store.avenza.com/pages/pricing
- https://apps.apple.com/app/avenza-maps/id388424049
- https://github.com/Choochmeque/tauri-plugin-sharekit
- https://docs.rs/crate/tauri-plugin-sharekit/0.3.1/source/android/src/main/java/SharePlugin.kt
- https://docs.rs/crate/tauri-plugin-vnidrop-share/latest/source/android/src/main/java/SharePlugin.kt
- https://docs.rs/tauri-plugin-android-fs/latest/src/tauri_plugin_android_fs/api/file_sender.rs.html
- https://docs.rs/crate/tauri-plugin-mobile-share/latest/source/README.md
- Measured: https://tiles.openfreemap.org/planet (tile 14/8803/5375), https://tiles.versatiles.org/tiles/osm/14/8803/5375, https://tiles.openfreemap.org/styles/liberty, https://tiles.versatiles.org/assets/styles/graybeard/style.json, OpenFreeMap glyph ranges.
