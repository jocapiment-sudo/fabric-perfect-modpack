#!/usr/bin/env bash
# =============================================================================
#  Apotheosis: Fabric Edition — one-command build
# =============================================================================
#  Usage:   ./build.sh
#  Output:  dist/apotheosis-fabric-1.20.1.jar   (drop this into mods/)
#
#  What it does:
#    1. verifies a Java 17+ JDK is available,
#    2. uses Gradle from PATH, or downloads a local Gradle 8.8 if missing,
#    3. runs the Fabric Loom build (downloads Minecraft + Yarn + Fabric API),
#    4. copies the finished jar into ./dist.
#
#  Requirements: bash, curl (or wget), unzip, and internet access for the first
#  build. Nothing else — no IDE, no pre-installed Gradle, no modding SDK.
# =============================================================================
set -euo pipefail

cd "$(dirname "$0")"

GRADLE_VERSION="8.8"
DIST_DIR="dist"
JAR_NAME="apotheosis-fabric-1.20.1.jar"
GRADLE_HOME=".gradle-dist"

info()  { printf '\033[36m==>\033[0m %s\n' "$1"; }
fail()  { printf '\033[31mERROR:\033[0m %s\n' "$1" >&2; exit 1; }

# --- 1. Java -----------------------------------------------------------------
if ! command -v java >/dev/null 2>&1; then
  fail "java not found. Install a JDK 17 (Temurin/Adoptium, Microsoft OpenJDK, or your package manager) and re-run."
fi

JAVA_VERSION_RAW="$(java -version 2>&1 | head -1)"
JAVA_MAJOR="$(printf '%s' "$JAVA_VERSION_RAW" | sed -E 's/.*version "([0-9]+).*/\1/')"
if [ "${JAVA_MAJOR:-0}" -lt 17 ] 2>/dev/null; then
  fail "Java 17+ is required (found: $JAVA_VERSION_RAW)."
fi
info "Java: $JAVA_VERSION_RAW"

# --- 2. Gradle ---------------------------------------------------------------
GRADLE_BIN=""
if command -v gradle >/dev/null 2>&1; then
  GRADLE_BIN="gradle"
  info "Using Gradle from PATH: $(gradle --version 2>/dev/null | awk '/^Gradle/{print $2; exit}')"
elif [ -x "$GRADLE_HOME/gradle-$GRADLE_VERSION/bin/gradle" ]; then
  GRADLE_BIN="$GRADLE_HOME/gradle-$GRADLE_VERSION/bin/gradle"
  info "Using previously downloaded Gradle $GRADLE_VERSION"
else
  info "Gradle not found — downloading $GRADLE_VERSION (once, ~130 MB)"
  mkdir -p "$GRADLE_HOME"
  URL="https://services.gradle.org/distributions/gradle-$GRADLE_VERSION-bin.zip"
  ZIP="$GRADLE_HOME/gradle-$GRADLE_VERSION-bin.zip"
  if command -v curl >/dev/null 2>&1; then
    curl -fL --retry 3 -o "$ZIP" "$URL"
  elif command -v wget >/dev/null 2>&1; then
    wget -O "$ZIP" "$URL"
  else
    fail "Neither curl nor wget is available to download Gradle."
  fi
  unzip -q -o "$ZIP" -d "$GRADLE_HOME"
  rm -f "$ZIP"
  GRADLE_BIN="$GRADLE_HOME/gradle-$GRADLE_VERSION/bin/gradle"
  chmod +x "$GRADLE_BIN"
fi

# --- 3. Build ----------------------------------------------------------------
info "Building (first run downloads Minecraft 1.20.1, Yarn and Fabric API)"
"$GRADLE_BIN" build --no-daemon --stacktrace

# --- 4. Collect --------------------------------------------------------------
BUILT="build/libs/$JAR_NAME"
if [ ! -f "$BUILT" ]; then
  # Fall back to whatever Loom produced, so a version bump never breaks the script.
  BUILT="$(find build/libs -maxdepth 1 -name 'apotheosis-fabric-*.jar' ! -name '*-sources.jar' | head -1 || true)"
fi
[ -n "${BUILT:-}" ] && [ -f "$BUILT" ] || fail "Build finished but no jar was produced. Check the Gradle output above."

mkdir -p "$DIST_DIR"
cp "$BUILT" "$DIST_DIR/$JAR_NAME"

info "Done: $(pwd)/$DIST_DIR/$JAR_NAME"
info "Install: copy that file into .minecraft/mods (Fabric Loader 0.14.22+ and Fabric API required)."
