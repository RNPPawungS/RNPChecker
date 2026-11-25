#!/usr/bin/env bash
# Builds rnp-checker.apk without Gradle, using the Debian/Ubuntu Android SDK packages:
#   apt-get install android-sdk-platform-23 aapt dalvik-exchange zipalign apksigner openjdk-17-jdk
# Signing: KEYSTORE=/path/to/release.jks KS_PASS=... ./build.sh   (a debug key is created when KEYSTORE is unset)
# Keep the same keystore for every release, otherwise devices must uninstall before updating.
set -euo pipefail
cd "$(dirname "$0")"
SDK=${ANDROID_JAR:-/usr/lib/android-sdk/platforms/android-23/android.jar}
OUT=build
rm -rf "$OUT"; mkdir -p "$OUT/gen" "$OUT/classes"

aapt package -f -m -J "$OUT/gen" -M AndroidManifest.xml -S res -I "$SDK" -F "$OUT/res.apk"
javac -nowarn -Xlint:-options -source 8 -target 8 -encoding UTF-8 -bootclasspath "$SDK" -d "$OUT/classes" \
  $(find src "$OUT/gen" -name '*.java')
dalvik-exchange --dex --min-sdk-version=21 --output="$OUT/classes.dex" "$OUT/classes"
cp "$OUT/res.apk" "$OUT/unsigned.apk"
(cd "$OUT" && zip -q -j unsigned.apk classes.dex)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"

KEYSTORE=${KEYSTORE:-$OUT/debug.jks}
KS_PASS=${KS_PASS:-android}
if [ ! -f "$KEYSTORE" ]; then
  keytool -genkeypair -keystore "$KEYSTORE" -storepass "$KS_PASS" -keypass "$KS_PASS" -alias app \
    -keyalg RSA -keysize 2048 -validity 10000 -dname "CN=RNP Checker, O=RNP Express, C=TH" >/dev/null
fi
apksigner sign --ks "$KEYSTORE" --ks-pass "pass:$KS_PASS" --ks-key-alias "${KS_ALIAS:-app}" \
  --min-sdk-version 21 --out "$OUT/rnp-checker.apk" "$OUT/aligned.apk"
apksigner verify "$OUT/rnp-checker.apk"
ls -l "$OUT/rnp-checker.apk"
