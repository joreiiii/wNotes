#!/usr/bin/env bash
#
# Installs the Android SDK + NDK needed for `npm run tauri android build`.
#
# Idempotent: re-running skips anything already present, so it is safe to call
# at the start of every session.
#
# Requires network access to dl.google.com. If your environment's network
# policy blocks it, either loosen the policy or pre-seed the archives:
#
#   ANDROID_CMDLINE_ZIP=/path/to/commandlinetools-linux-*.zip \
#   ANDROID_NDK_ZIP=/path/to/android-ndk-*.zip \
#   ./scripts/setup-android.sh
#
set -euo pipefail

SDK_ROOT="${ANDROID_HOME:-$HOME/Android/sdk}"
CMDLINE_VERSION="11076708"
NDK_VERSION="26.3.11579264"
PLATFORM="android-34"
BUILD_TOOLS="34.0.0"

log() { printf '\n\033[1;36m==> %s\033[0m\n' "$*"; }

require() {
  command -v "$1" >/dev/null 2>&1 || { echo "missing required tool: $1" >&2; exit 1; }
}

require unzip
require curl

if ! command -v java >/dev/null 2>&1; then
  echo "Java 17+ is required (JDK not found on PATH)." >&2
  exit 1
fi

log "SDK root: $SDK_ROOT"
mkdir -p "$SDK_ROOT"

# ---------- command line tools ----------
SDKMANAGER="$SDK_ROOT/cmdline-tools/latest/bin/sdkmanager"
if [ ! -x "$SDKMANAGER" ]; then
  log "Installing command line tools"
  tmp_zip="${ANDROID_CMDLINE_ZIP:-}"
  cleanup_zip=0
  if [ -z "$tmp_zip" ]; then
    tmp_zip="$(mktemp -d)/cmdline-tools.zip"
    cleanup_zip=1
    curl -fSL -o "$tmp_zip" \
      "https://dl.google.com/android/repository/commandlinetools-linux-${CMDLINE_VERSION}_latest.zip"
  fi
  staging="$(mktemp -d)"
  unzip -q "$tmp_zip" -d "$staging"
  mkdir -p "$SDK_ROOT/cmdline-tools"
  rm -rf "$SDK_ROOT/cmdline-tools/latest"
  mv "$staging/cmdline-tools" "$SDK_ROOT/cmdline-tools/latest"
  rm -rf "$staging"
  [ "$cleanup_zip" = 1 ] && rm -rf "$(dirname "$tmp_zip")"
else
  log "Command line tools already present"
fi

# ---------- licenses + packages ----------
log "Accepting licenses"
yes | "$SDKMANAGER" --sdk_root="$SDK_ROOT" --licenses >/dev/null 2>&1 || true

log "Installing platform-tools, platforms;$PLATFORM, build-tools;$BUILD_TOOLS, ndk;$NDK_VERSION"
"$SDKMANAGER" --sdk_root="$SDK_ROOT" \
  "platform-tools" \
  "platforms;$PLATFORM" \
  "build-tools;$BUILD_TOOLS" \
  "ndk;$NDK_VERSION"

# ---------- rust targets ----------
log "Adding Rust Android targets"
rustup target add \
  aarch64-linux-android \
  armv7-linux-androideabi \
  i686-linux-android \
  x86_64-linux-android

# ---------- report ----------
NDK_PATH="$SDK_ROOT/ndk/$NDK_VERSION"
cat <<EOF

Done. Export these before building:

  export ANDROID_HOME="$SDK_ROOT"
  export NDK_HOME="$NDK_PATH"

Then:

  npm install
  npm run tauri android init    # once, generates src-tauri/gen/android
  npm run tauri android build   # produces the APK/AAB

EOF
