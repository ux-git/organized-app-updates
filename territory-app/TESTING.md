# Testing

Three checks, one per layer. None of them builds the app or touches `dist`.

## Web app

```sh
npm test
```

Vitest runs `src/**/*.test.ts` in Node, with the main app's path aliases
(`vitest.config.ts`). The tests cover the app's own logic: the sync texts,
the seed helpers, how territories are split into records and put back
together, device pictures, the theme and the permissions list. Tauri, the
Android bridge and the main app's i18n are mocked (`src/test/`), so no device
or browser is needed. `npx vitest` keeps watching.

Vitest was installed with `--legacy-peer-deps`, so it uses the main app's Vite
instead of a second copy. Do the same after adding a package here.

## Rust core

```sh
cd src-tauri
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
export CARGO_TARGET_DIR=../../../organized-tauri-shell/src-tauri/target
cargo test
```

The target folder is the Organized shell's, which already holds Tauri's
compiled crates; a fresh one takes a long time to build.

## Android

```sh
cd src-tauri/gen/android
export ANDROID_HOME="$HOME/Library/Android/sdk"
./gradlew :app:lintArm64Debug
```

The report lands in `app/build/reports/lint-results-arm64Debug.html`.
