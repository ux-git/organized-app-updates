#!/bin/zsh
# Builds the Android APK(s), the iPhone IPA and, unless NO_MAC is set, the Mac disk image into
# ~/Downloads. A private APK (with seed/: names, borders, do-not-calls) comes first unless
# PUBLIC_ONLY is set; every public build is checked for private names and addresses.
#
#   scripts/release.sh                       private + public Android, iPhone, Mac
#   PUBLIC_ONLY=1 NO_MAC=1 scripts/release.sh
#   NO_ANDROID=1 NO_IOS=1 scripts/release.sh   the Mac alone
#   WINDOWS=1 adds the Windows installer, cross-built with cargo-xwin
#   IOS_SIDELOAD=1 packages an unsigned IPA for SideStore/iLoader to sign
A=${0:a:h:h}
LOGS=${TMPDIR:-/tmp}/territory-release
mkdir -p $LOGS
cd $A
export LANG=en_US.UTF-8 ANDROID_HOME=$HOME/Library/Android/sdk NDK_HOME=$HOME/Library/Android/sdk/ndk/27.0.12077973
export CARGO_TARGET_DIR=${CARGO_TARGET_DIR:-/Users/Vlad/Dev/Organized-Dev/organized-tauri-shell/src-tauri/target}
export PATH="$HOME/.rustup/toolchains/stable-aarch64-apple-darwin/bin:$PATH"
BT=$ANDROID_HOME/build-tools/35.0.0
V=$(node -p "require('./src-tauri/tauri.conf.json').version")
UNSIGNED=src-tauri/gen/android/app/build/outputs/apk/universal/release/app-universal-release-unsigned.apk
KS=$HOME/.android/territories-release.jks
LINEAGE=$HOME/.android/territories-release.lineage
KS_ENV=$HOME/.android/territories-release.env
if [[ -z $NO_ANDROID ]]; then
  for f in $KS $LINEAGE $KS_ENV; do [[ -f $f ]] || { echo "FAIL $f missing: see docs/signing.md"; exit 1; }; done
  source $KS_ENV; export TERRITORIES_KS_PASS
fi

apk() { # $1 = output name
  rm -rf dist
  npm run tauri -- android build --apk --target aarch64 > $LOGS/android-$1.log 2>&1 || { echo "FAIL android $1"; tail -30 $LOGS/android-$1.log; return 1; }
  rm -f $LOGS/aligned.apk
  # the old debug key still signs v1/v2 for Android 7-8; Android 9+ follow the v3 lineage to the release key
  $BT/zipalign -p -f 4 $UNSIGNED $LOGS/aligned.apk && \
  $BT/apksigner sign --v4-signing-enabled false --ks $KS --ks-key-alias androiddebugkey --ks-pass env:TERRITORIES_KS_PASS \
    --next-signer --ks $KS --ks-key-alias territories --ks-pass env:TERRITORIES_KS_PASS \
    --lineage $LINEAGE --rotation-min-sdk-version 28 --out ~/Downloads/$1 $LOGS/aligned.apk && echo "OK $1"
  rm -f $LOGS/aligned.apk
}

# the private data waits beside the repo, not in a temp folder, while the public builds run
HOLD=${A:h:h}/territory-seed-hold
[[ -e $HOLD ]] && { echo "FAIL $HOLD exists from an earlier run: put it back as seed/ first"; exit 1; }
[[ -d seed ]] || { echo "FAIL no seed/ folder"; exit 1; }
# full names and addresses to look for; single words also appear in Organized texts and libraries
canary() { cat $1/publishers.txt $1/groups.txt; python3 -c "import json,sys; d=sys.argv[1]; print('\n'.join([r.get(k) or '' for v in json.load(open(d+'/donotcalls.json')).values() for r in v for k in ('address','name')]))" $1; }
clean() { # fails when any private name or address made it into dist/
  local patterns=$LOGS/private-canaries.txt result
  (umask 077; while IFS= read -r w; do
    [[ $w == *" "* || $w == *[0-9]* ]] && printf '%s\n' "$w"
  done < <(canary $HOLD) > "$patterns")
  # Scan once for all literal patterns, rather than rereading every bundle for each name.
  if command -v rg >/dev/null; then
    rg --no-ignore --hidden --text -q -F -f "$patterns" dist
  else
    LC_ALL=C grep -rqF -f "$patterns" dist
  fi
  result=$?
  rm -f "$patterns"
  [[ $result -eq 1 ]] || { echo "FAIL public bundle privacy check ($result)"; return 1; }
}

[[ -z $PUBLIC_ONLY && -z $NO_ANDROID ]] && { apk Territories-$V-private-arm64.apk || exit 1; }
mv seed $HOLD || exit 1
trap 'mv $HOLD $A/seed' EXIT
if [[ -z $NO_ANDROID ]]; then
  apk Territories-$V-arm64.apk || exit 1
  clean || { rm -f ~/Downloads/Territories-$V-arm64.apk; exit 1; }
fi

if [[ -z $NO_IOS ]]; then
  # cargo-mobile clears most environment variables when probing Xcode. Keep all
  # nested Apple tools on the requested installation without a global xcode-select change.
  if [[ -n $DEVELOPER_DIR ]]; then
    XCODE_TOOLS=$LOGS/xcode-tools
    python3 - "$XCODE_TOOLS" "$DEVELOPER_DIR" <<'PYTOOLS'
from pathlib import Path
import shlex, sys
folder = Path(sys.argv[1]); folder.mkdir(parents=True, exist_ok=True)
for tool in ('xcode-select', 'xcodebuild', 'xcrun', 'swift', 'clang', 'clang++', 'cc', 'c++'):
    wrapper = folder / tool
    wrapper.write_text('#!/bin/sh\nexport DEVELOPER_DIR=' + shlex.quote(sys.argv[2]) + '\nexec /usr/bin/' + tool + ' "$@"\n')
    wrapper.chmod(0o755)
PYTOOLS
    export PATH="$XCODE_TOOLS:$PATH"
  fi
  rm -rf dist src-tauri/gen/apple/build
  if [[ -n $IOS_SIDELOAD ]]; then
    npm run tauri -- ios build --target aarch64 --no-sign --archive-only > $LOGS/ios.log 2>&1 || { echo "FAIL ios archive"; grep -E "error" $LOGS/ios.log | tail -20; exit 1; }
    clean || exit 1
    APP=src-tauri/gen/apple/build/territories_iOS.xcarchive/Products/Applications/Territories.app
    [[ -f "$APP/Territories" ]] || { echo "FAIL ios: no archived application"; exit 1; }
    STAGE=$LOGS/ipa
    rm -rf "$STAGE" && mkdir -p "$STAGE/Payload"
    cp -R "$APP" "$STAGE/Payload/"
    # Signing belongs to the installing user's account. A copied static archive is never needed at runtime.
    rm -rf "$STAGE/Payload/Territories.app/_CodeSignature"
    rm -f "$STAGE/Payload/Territories.app/embedded.mobileprovision" "$STAGE/Payload/Territories.app/libapp.a"
    ditto -c -k --norsrc --noextattr --keepParent "$STAGE/Payload" ~/Downloads/Territories-$V.ipa || exit 1
    rm -rf "$STAGE"
    echo "OK ipa (SideStore/iLoader signing required)"
  else
    npm run tauri -- ios build --target aarch64 --debug --export-method debugging > $LOGS/ios.log 2>&1 || { echo "FAIL ios"; grep -E "error" $LOGS/ios.log | tail -20; exit 1; }
    clean || exit 1
    IPA=$(find src-tauri/gen/apple/build -name "*.ipa" | head -1)
    [[ -n $IPA ]] || { echo "FAIL ios: no ipa exported"; exit 1; }
    cp "$IPA" ~/Downloads/Territories-$V.ipa && echo "OK ipa"
  fi
fi

if [[ -z $NO_MAC ]]; then
  # macOS: an app bundle in a disk image, not signed with a Developer ID; Tauri's own dmg step
  # fails on this Mac, so the image is made here
  rm -rf dist
  npm run tauri -- build --bundles app > $LOGS/mac.log 2>&1 || { echo "FAIL mac"; grep -E "error" $LOGS/mac.log | tail -20; exit 1; }
  clean || exit 1
  STAGE=$LOGS/dmg
  rm -rf $STAGE && mkdir -p $STAGE
  cp -R $CARGO_TARGET_DIR/release/bundle/macos/Territories.app $STAGE/ && ln -s /Applications $STAGE/Applications
  # sealed, Info.plist included: without it macOS ignores the Bluetooth usage text
  codesign --force --deep -s - $STAGE/Territories.app || exit 1
  hdiutil create -volname Territories -srcfolder $STAGE -ov -format UDZO ~/Downloads/Territories-$V-mac.dmg >/dev/null && echo "OK dmg"
  rm -rf $STAGE
fi

[[ -z $WINDOWS ]] && exit 0
# Windows: an NSIS installer, not code-signed; needs rustup's x86_64-pc-windows-msvc,
# cargo-xwin, and Homebrew's llvm and nsis
rm -rf dist
PATH="/opt/homebrew/opt/llvm/bin:$HOME/.cargo/bin:$PATH" npm run tauri -- build --runner cargo-xwin \
  --target x86_64-pc-windows-msvc --bundles nsis > $LOGS/windows.log 2>&1 || { echo "FAIL windows"; grep -E "error" $LOGS/windows.log | tail -20; exit 1; }
clean || exit 1
EXE=$CARGO_TARGET_DIR/x86_64-pc-windows-msvc/release/bundle/nsis/Territories_${V}_x64-setup.exe
[[ -f "$EXE" ]] || { echo "FAIL Windows: installer for $V not found"; exit 1; }
cp "$EXE" ~/Downloads/Territories-$V-windows-setup.exe && echo "OK exe"
