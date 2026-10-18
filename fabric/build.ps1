<#
    =========================================================================
     Apotheosis: Fabric Edition -- one-command build (Windows / PowerShell)
    =========================================================================
     Usage:    .\build.ps1
     Output:   dist\apotheosis-fabric-1.20.1.jar   (drop this into mods\)

     Requires: JDK 17+ and internet access for the first build. Gradle is
               downloaded automatically if it is not already on PATH.
    =========================================================================
#>
$ErrorActionPreference = 'Stop'
Set-Location -Path $PSScriptRoot

$GradleVersion = '8.8'
$JarName       = 'apotheosis-fabric-1.20.1.jar'
$DistDir       = 'dist'
$GradleHome    = '.gradle-dist'

function Write-Step($message) { Write-Host "==> $message" -ForegroundColor Cyan }
function Write-Fail($message) { Write-Host "ERROR: $message" -ForegroundColor Red; exit 1 }

# --- Java -------------------------------------------------------------------
$java = Get-Command java -ErrorAction SilentlyContinue
if (-not $java) {
    Write-Fail "java not found. Install a JDK 17 (https://adoptium.net) and re-open the terminal."
}
$versionLine = (& java -version 2>&1 | Select-Object -First 1)
if ($versionLine -match 'version "(\d+)') {
    $major = [int]$Matches[1]
    if ($major -lt 17) { Write-Fail "Java 17+ is required (found: $versionLine)." }
}
Write-Step "Java: $versionLine"

# --- Gradle -----------------------------------------------------------------
$gradle = Get-Command gradle -ErrorAction SilentlyContinue
if ($gradle) {
    Write-Step "Using Gradle from PATH"
    $gradleExe = $gradle.Source
} else {
    $local = Join-Path $GradleHome "gradle-$GradleVersion\bin\gradle.bat"
    if (-not (Test-Path $local)) {
        Write-Step "Gradle not found - downloading $GradleVersion (once, ~130 MB)"
        New-Item -ItemType Directory -Force -Path $GradleHome | Out-Null
        $zip = Join-Path $GradleHome "gradle-$GradleVersion-bin.zip"
        Invoke-WebRequest -Uri "https://services.gradle.org/distributions/gradle-$GradleVersion-bin.zip" -OutFile $zip
        Expand-Archive -Path $zip -DestinationPath $GradleHome -Force
        Remove-Item $zip
    }
    $gradleExe = $local
    Write-Step "Using downloaded Gradle $GradleVersion"
}

# --- Build ------------------------------------------------------------------
Write-Step "Building (first run downloads Minecraft 1.20.1, Yarn and Fabric API)"
& $gradleExe build --no-daemon --stacktrace
if ($LASTEXITCODE -ne 0) { Write-Fail "Gradle build failed (exit $LASTEXITCODE)." }

# --- Collect ----------------------------------------------------------------
$built = Join-Path 'build\libs' $JarName
if (-not (Test-Path $built)) {
    $built = Get-ChildItem 'build\libs' -Filter 'apotheosis-fabric-*.jar' |
        Where-Object { $_.Name -notlike '*-sources.jar' } |
        Select-Object -First 1 -ExpandProperty FullName
}
if (-not $built -or -not (Test-Path $built)) { Write-Fail "No jar produced. Check the Gradle output above." }

New-Item -ItemType Directory -Force -Path $DistDir | Out-Null
Copy-Item $built (Join-Path $DistDir $JarName) -Force

Write-Step "Done: $PWD\$DistDir\$JarName"
Write-Step "Install: copy that file into %APPDATA%\.minecraft\mods (Fabric Loader 0.14.22+ and Fabric API required)."
