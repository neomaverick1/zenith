#!/usr/bin/env bash
# Signs the phone APK and the Google Play bundle, the same way on every build.
#   APK: the demo key kept in the repo, so each new build installs over the last one.
#   AAB: the Google Play upload key from the repo's Actions secrets when they are set
#        (UPLOAD_JKS_B64, UPLOAD_STORE_PASSWORD, UPLOAD_KEY_PASSWORD, UPLOAD_KEY_ALIAS), otherwise the demo key.
# Usage: sign-android.sh <in.apk> <out.apk> <in.aab> <out.aab>
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
demo="$here/demo.keystore"
bt="$(ls -d "$ANDROID_HOME"/build-tools/* | sort -V | tail -1)"

"$bt/zipalign" -f -p 4 "$1" aligned.apk
"$bt/apksigner" sign --ks "$demo" --ks-pass pass:demo-key --key-pass pass:demo-key --ks-key-alias demo --out "$2" aligned.apk
rm -f aligned.apk
"$bt/apksigner" verify "$2"

cp "$3" "$4"
zip -q -d "$4" 'META-INF/*.SF' 'META-INF/*.RSA' 'META-INF/*.EC' 'META-INF/*.DSA' 'META-INF/MANIFEST.MF' >/dev/null 2>&1 || true
if [ -n "${UPLOAD_JKS_B64:-}" ]; then
  echo "$UPLOAD_JKS_B64" | base64 -d > "$RUNNER_TEMP/upload.jks"
  jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$RUNNER_TEMP/upload.jks" \
    -storepass "$UPLOAD_STORE_PASSWORD" -keypass "${UPLOAD_KEY_PASSWORD:-$UPLOAD_STORE_PASSWORD}" "$4" "${UPLOAD_KEY_ALIAS:-upload}" >/dev/null
  echo "Play bundle signed with the upload key"
else
  jarsigner -sigalg SHA256withRSA -digestalg SHA-256 -keystore "$demo" -storepass demo-key -keypass demo-key "$4" demo >/dev/null
  echo "Play bundle signed with the demo key (add the upload key secrets for a real Play upload)"
fi
