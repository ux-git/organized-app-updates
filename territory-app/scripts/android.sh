#!/bin/zsh
# Builds the debug APK and installs it on every connected phone or emulator.
set -e
cd "${0:A:h}/.."

export ANDROID_HOME="${ANDROID_HOME:-$HOME/Library/Android/sdk}"
export NDK_HOME="${NDK_HOME:-$(ls -d "$ANDROID_HOME"/ndk/* | sort -V | tail -1)}"
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
# the Organized shell's build folder already holds Tauri's compiled crates
SHELL_TARGET="$(git rev-parse --show-toplevel)/../organized-tauri-shell/src-tauri/target"
[ -d "$SHELL_TARGET" ] && export CARGO_TARGET_DIR="${CARGO_TARGET_DIR:-$SHELL_TARGET}"
export ADB_LIBUSB=1 ADB_MDNS=0

npm run tauri -- android build --debug --apk --target aarch64

ADB="$ANDROID_HOME/platform-tools/adb"
APK=src-tauri/gen/android/app/build/outputs/apk/universal/debug/app-universal-debug.apk
for device in $("$ADB" devices | awk 'NR>1 && $2=="device" {print $1}'); do
  echo "Installing on $device"
  "$ADB" -s "$device" install -r "$APK"
  "$ADB" -s "$device" shell am start -n com.sws2apps.territories/.MainActivity >/dev/null
done
