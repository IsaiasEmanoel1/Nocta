param(
    [string]$JavaHome = "$env:USERPROFILE\.jdks\jbr-21.0.11",
    [string]$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk",
    [switch]$ExperimentalProviders
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (!(Test-Path -LiteralPath "$JavaHome\bin\java.exe")) { throw 'Configure -JavaHome com um JDK 21 instalado.' }
if (!(Test-Path -LiteralPath "$AndroidSdk\platforms\android-35\android.jar")) { throw 'Configure -AndroidSdk com a plataforma Android 35 instalada.' }
$env:JAVA_HOME = $JavaHome
$env:ANDROID_HOME = $AndroidSdk
$env:GRADLE_USER_HOME = Join-Path $projectRoot '.cache\gradle'
Push-Location $projectRoot
try {
    $previousFlags = @{}
    $flags = @{ VITE_ENABLE_EXPERIMENTAL_PROVIDERS = 'false' }
    if ($ExperimentalProviders) {
        $flags = @{
            VITE_ENABLE_EXPERIMENTAL_PROVIDERS = 'true'
            VITE_ENABLE_STREMIO_EXPERIMENT = 'true'
            VITE_ENABLE_NATIVE_EXPERIMENT = 'true'
            VITE_ENABLE_EMBEDMOVIES_FALLBACK = 'false'
            VITE_ENABLE_ZEUS_RESERVE = 'false'
        }
    }
    foreach ($flag in $flags.Keys) {
        $previousFlags[$flag] = [Environment]::GetEnvironmentVariable($flag, 'Process')
        [Environment]::SetEnvironmentVariable($flag, $flags[$flag], 'Process')
    }
    & npm.cmd run android:sync
    if ($LASTEXITCODE -ne 0) { throw 'Build web ou sincronização Capacitor falhou.' }
    $transportFlag = if ($ExperimentalProviders) { 'true' } else { 'false' }
    & .\android\gradlew.bat -p android assembleDebug --no-daemon --no-watch-fs "-PnoctaExperimentalProviders=$transportFlag" '-Dorg.gradle.internal.instrumentation.agent=false' --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Build Android falhou.' }
    $apk = Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
    if (!(Test-Path -LiteralPath $apk)) { throw 'O build terminou sem o APK esperado.' }
    if ($ExperimentalProviders) {
        $experimentalApk = Join-Path (Split-Path -Parent $apk) 'nocta-debug-experimental.apk'
        Copy-Item -LiteralPath $apk -Destination $experimentalApk -Force
        Write-Output "APK experimental: $experimentalApk"
    }
    Write-Output "APK de depuração: $apk"
} finally {
    foreach ($flag in $previousFlags.Keys) { [Environment]::SetEnvironmentVariable($flag, $previousFlags[$flag], 'Process') }
    Pop-Location
}
