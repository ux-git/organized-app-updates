# Native builds

Organized ships from one source tree as two products: the PWA served from the
web, and native apps built with [Tauri 2](https://v2.tauri.app/). This document
describes how the two stay in step.

## The rule

Feature code never imports `@tauri-apps/*`, and never branches on the platform
name. It asks `src/platform` what the current host can do:

```ts
import { can } from '@platform/index';
import { saveFile } from '@platform/adapters/files';

if (can('file-share')) { /* ... */ }
await saveFile(blob, 'S-21.pdf');
```

`src/platform` is the only place that knows the difference between a browser
and the native shell:

| File | Responsibility |
| --- | --- |
| `detect.ts` | Which host is this — `web`, `android`, `ios`, `desktop`. |
| `capabilities.ts` | What that host can do, as capability names. |
| `adapters/*.ts` | One API per concern, two implementations behind it. |

Native modules are always reached through a dynamic `import()`. A plugin that
is missing, refused by the OS, or broken degrades to the web behaviour instead
of taking down the boot.

### Adding a capability

1. Add the name to the `Capability` union in `capabilities.ts` and list it for
   the hosts that have it.
2. Add an adapter in `adapters/` whose native branch is behind `can(...)`.
3. Add the Rust plugin to `src-tauri/Cargo.toml`, register it in
   `src-tauri/src/lib.rs`, and grant its permission in
   `src-tauri/capabilities/` — `default.json` for every platform,
   `mobile.json` for phone-and-tablet-only plugins. Listing a mobile-only
   permission in `default.json` breaks the desktop build.

## Building

```bash
npm run dev            # PWA dev server on :4050
npm run build          # PWA: includes the service worker
npm run build:native   # native web layer: no service worker, web-only assets pruned
npm run android:dev    # device or emulator, hot reload
npm run android:build  # release AAB/APK
npm run ios:dev
npm run ios:build
```

`build` and `build:native` differ deliberately. The native build must not
register a service worker, and it prunes store screenshots and PWA launch
artwork that would otherwise be copied into every installed app.

### Toolchain

```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
rustup target add aarch64-linux-android armv7-linux-androideabi i686-linux-android x86_64-linux-android
```

Android also needs Android Studio, the SDK, and **NDK r28 or newer** — earlier
NDKs cannot produce the 16 KB-aligned libraries Google Play requires. Set
`ANDROID_HOME` and `NDK_HOME`. iOS needs full Xcode (not just the command line
tools) plus `rustup target add aarch64-apple-ios aarch64-apple-ios-sim`.

## Constraints worth knowing

**The native webview is not a secure context.** Assets are served from
`http://tauri.localhost`, which Android WebView does not consider secure
([wry#1709](https://github.com/tauri-apps/wry/issues/1709)). Service workers,
`SharedWorker`, `crypto.subtle`, `navigator.clipboard` and WebAuthn are all
unavailable there. Each one already has an adapter; do not reintroduce a direct
call.

**The origin is the database identity.** IndexedDB is keyed to
`http://tauri.localhost`. Changing the scheme, host or port orphans every
user's data. Treat it as fixed.

**Downloads do not exist.** A webview has nowhere to put a file the way a
browser does. `saveFile` writes to the app cache and hands the path to the OS.

**Updates come from the store.** `can('web-update')` is false on native, and
the service worker wrapper is skipped entirely in `RootWrap`.

## Not done yet

- **iOS project.** `src-tauri/gen/apple` does not exist; run `tauri ios init`
  on a machine with full Xcode. The safe-area work is prepared but unverified
  on device.
- **Remote push.** Only local notifications are wired. FCM/APNs needs a
  community plugin and a server-side token registry.
- **Calendar.** Events are handed over as `.ics`. Writing directly to the
  calendar store needs a small custom plugin — EventKit on iOS,
  `Intent.ACTION_INSERT` on Android. It replaces the body of
  `adapters/calendar.ts` and nothing else.
- **Camera, QR onboarding, widgets.**
