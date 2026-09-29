# Android signing

Every Android build up to 0.8.4 was signed with the machine's debug key (`~/.android/debug.keystore`, alias `androiddebugkey`). Since then the APKs are signed with a proper release key, and a v3 signing lineage lets installed copies move over without a reinstall.

## The three files

All of them live outside the repo, in `~/.android`, with mode 600:

- `territories-release.jks`: a PKCS12 keystore holding two keys. `territories` is the release key (RSA 4096, valid until 2056). `androiddebugkey` is a copy of the old debug key, kept here because apksigner needs the oldest key of a lineage to produce the v1/v2 signatures, and because the SDK's own `debug.keystore` gets regenerated whenever it goes missing.
- `territories-release.env`: one line, `TERRITORIES_KS_PASS=…`, the password of that keystore. `scripts/release.sh` sources it and hands the password to apksigner through the environment, so it never appears on a command line.
- `territories-release.lineage`: the proof of rotation from the debug certificate to the release certificate, made with `apksigner rotate`. It is embedded in every signed APK.

The release script stops before building if any of the three is missing.

## What a device sees

Android 9 and later verify the v3 block, find the lineage, and accept the release key as the successor of the debug key, so the update installs in place. Android 7 and 8 only read the v2 block, which the debug key still signs, so they update in place as well; the price is that those two versions keep trusting the old key. Once no such device is left, the `androiddebugkey` signer and the `--lineage` option can be dropped from the script: Android 9+ devices already hold the release key as their current signer and accept a build signed with it alone.

The old signer has no rollback capability, so a build signed only with the debug key is not accepted as an update by any device that has already moved to the release key.

## Back up all three, offline

Copy the keystore, the env file and the lineage to storage that is not on this Mac (an encrypted stick, or the password manager with the two binary files as attachments). Without the keystore or its password no further update can be signed for any installed copy; every user would have to export a backup, uninstall, and install a build signed with a fresh key. The lineage alone is recoverable: `apksigner rotate` produces it again from the two keys in the keystore, and `apksigner lineage --in <any signed apk> --out …` extracts it from a released APK.

## Rotating again

Generate the next key into the same keystore with `keytool -genkeypair -keystore ~/.android/territories-release.jks -storetype PKCS12 -alias <new alias> -keyalg RSA -keysize 4096 -validity 10957 -storepass:env TERRITORIES_KS_PASS`. Extend the lineage with `apksigner rotate --in ~/.android/territories-release.lineage --out ~/.android/territories-release.lineage --old-signer --ks … --ks-key-alias territories --new-signer --ks … --ks-key-alias <new alias>` (both with `--ks-pass env:TERRITORIES_KS_PASS`). Then add one more `--next-signer --ks $KS --ks-key-alias <new alias> --ks-pass env:TERRITORIES_KS_PASS` block to the sign command in `scripts/release.sh`, after the `territories` block. Check the result with `apksigner lineage --in <signed apk> --print-certs -v`.
