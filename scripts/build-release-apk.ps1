$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root

Write-Host '==> Loading .env'
Get-Content (Join-Path $root '.env') | ForEach-Object {
  if ($_ -match '^\s*([^#][^=]+)=(.*)$') {
    [Environment]::SetEnvironmentVariable($matches[1].Trim(), $matches[2].Trim(), 'Process')
  }
}
if (-not $env:EXPO_PUBLIC_SUPABASE_URL -or -not $env:EXPO_PUBLIC_SUPABASE_ANON_KEY) {
  throw 'Missing EXPO_PUBLIC_SUPABASE_URL / EXPO_PUBLIC_SUPABASE_ANON_KEY in .env'
}

Write-Host '==> Clearing caches and build outputs'
$paths = @(
  (Join-Path $root 'android\app\build'),
  (Join-Path $root 'android\app\.cxx'),
  (Join-Path $root 'android\build'),
  (Join-Path $root 'android\app\src\main\assets\index.android.bundle'),
  (Join-Path $root 'node_modules\.cache'),
  (Join-Path $root '.expo')
)
foreach ($p in $paths) {
  if (Test-Path $p) {
    Remove-Item -Recurse -Force $p -ErrorAction SilentlyContinue
  }
}

$metroTmp = Join-Path $env:TEMP 'metro-cache'
if (Test-Path $metroTmp) {
  Remove-Item -Recurse -Force $metroTmp -ErrorAction SilentlyContinue
}

New-Item -ItemType Directory -Force -Path (Join-Path $root 'dist') | Out-Null

Write-Host '==> Building release APK (phone ABIs only, minified)'
Set-Location (Join-Path $root 'android')
& .\gradlew.bat assembleRelease --rerun-tasks --no-daemon `
  "-PreactNativeArchitectures=armeabi-v7a,arm64-v8a" `
  "-Pandroid.enableMinifyInReleaseBuilds=true" `
  "-Pandroid.enableShrinkResourcesInReleaseBuilds=true" `
  "-Pandroid.enableBundleCompression=true" `
  "-Pexpo.useLegacyPackaging=true"
if ($LASTEXITCODE -ne 0) {
  throw "Gradle failed with exit code $LASTEXITCODE"
}

$apk = Join-Path $root 'android\app\build\outputs\apk\release\app-release.apk'
$out = Join-Path $root 'dist\liqueur-log-release.apk'
Copy-Item -Force $apk $out
$sizeMb = [math]::Round((Get-Item $out).Length / 1MB, 1)
Write-Host "==> APK ready: $out ($sizeMb MB)"
