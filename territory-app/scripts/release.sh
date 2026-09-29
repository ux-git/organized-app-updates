#!/bin/zsh
# Builds the Android APK(s), the iPhone IPA and, unless NO_MAC is set, the Mac disk image into
# ~/Downloads. A private APK (with seed/: names, borders, do-not-calls) comes first unless
# PUBLIC_ONLY is set; every public build is checked for private names and addresses.
#
#   scripts/release.sh                       private + public Android, iPhone, Mac
#   PUBLIC_ONLY=1 NO_MAC=1 scripts/release.sh
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
for f in $KS $LINEAGE $KS_ENV; do [[ -f $f ]] || { echo "FAIL $f missing: see docs/signing.md"; exit 1; }; done
source $KS_ENV; export TERRITORIES_KS_PASS

apk() { # $1 = output name
  rm -rf dist
  npm run tauri -- android build --apk --target aarch64 > $LOGS/android-$1.log 2>&1 || { echo "FAIL android $1"; tail -30 $LOGS/android-$1.log; return 1; }
  rm -f $LOGS/aligned.apk
  # the old debug key still signs v1/v2 for Android 7-8; Android 9+ follow the v3 lineage to the release key
  $BT/zipalign -p -f 4 $UNSIGNED $LOGS/aligned.apk && \
  $BT/apksigner sign --ks $KS --ks-key-alias androiddebugkey --ks-pass env:TERRITORIES_KS_PASS \
    --next-signer --ks $KS --ks-key-alias territories --ks-pass env:TERRITORIES_KS_PASS \
    --lineage $LINEAGE --rotation-min-sdk-version 28 --out ~/Downloads/$1 $LOGS/aligned.apk && echo "OK $1"
  rm -f $LOGS/aligned.apk
}

# the private data waits beside the repo, not in a temp folder, while the public builds run
HOLD=${A:h:h}/territory-seed-hold
[[ -e $HOLD ]] && { echo "FAIL $HOLD exists from an earlier run: put it back as seed/ first"; exit 1; }
[[ -d seed ]] || { echo "FAIL no seed/ folder"; exit 1; }
# full names and addresses to look for; single words also appear in Organized texts and libraries
canary() { cat $1/publishers.txt $1/groups.txt; python3 -c "import json,sys; d=sys.argv[1]; print('\n'.join(list(json.load(open(d+'/streets.json')))[:40] + [r.get(k) or '' for v in json.load(open(d+'/donotcalls.json')).values() for r in v for k in ('address','name')]))" $1; }
clean() { # fails when any private name or address made it into dist/
  local hits=0
  while IFS= read -r w; do [[ $w == *" "* || $w == *[0-9]* ]] && grep -rqF -- "$w" dist && hits=$((hits+1)); done < <(canary $HOLD)
  [[ $hits -eq 0 ]] || { echo "FAIL public bundle holds $hits private words"; return 1; }
}

[[ -z $PUBLIC_ONLY ]] && { apk Territories-$V-private-arm64.apk || exit 1; }
mv seed $HOLD || exit 1
trap 'mv $HOLD $A/seed' EXIT
apk Territories-$V-arm64.apk || exit 1
clean || { rm -f ~/Downloads/Territories-$V-arm64.apk; exit 1; }

rm -rf dist src-tauri/gen/apple/build
npm run tauri -- ios build --target aarch64 --debug --export-method debugging > $LOGS/ios.log 2>&1 || { echo "FAIL ios"; grep -E "error" $LOGS/ios.log | tail -20; exit 1; }
clean || exit 1
cp "$(ls src-tauri/gen/apple/build/arm64/*.ipa | head -1)" ~/Downloads/Territories-$V.ipa && echo "OK ipa"

[[ -n $NO_MAC ]] && exit 0
# macOS: an app bundle in a disk image, not signed with a Developer ID; Tauri's own dmg step
# fails on this Mac, so the image is made here
rm -rf dist
npm run tauri -- build --bundles app > $LOGS/mac.log 2>&1 || { echo "FAIL mac"; grep -E "error" $LOGS/mac.log | tail -20; exit 1; }
clean || exit 1
STAGE=$LOGS/dmg
rm -rf $STAGE && mkdir -p $STAGE
cp -R $CARGO_TARGET_DIR/release/bundle/macos/Territories.app $STAGE/ && ln -s /Applications $STAGE/Applications
hdiutil create -volname Territories -srcfolder $STAGE -ov -format UDZO ~/Downloads/Territories-$V-mac.dmg >/dev/null && echo "OK dmg"
rm -rf $STAGE
