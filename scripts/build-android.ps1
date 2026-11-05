param(
    [string]$JavaHome = "$env:USERPROFILE\.jdks\jbr-21.0.11",
    [string]$AndroidSdk = "$env:LOCALAPPDATA\Android\Sdk"
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
    & npm.cmd run android:sync
    if ($LASTEXITCODE -ne 0) { throw 'Build web ou sincronização Capacitor falhou.' }
    & .\android\gradlew.bat -p android assembleDebug --no-daemon --no-watch-fs '-Dorg.gradle.internal.instrumentation.agent=false' --console=plain
    if ($LASTEXITCODE -ne 0) { throw 'Build Android falhou.' }
    $apk = Join-Path $projectRoot 'android\app\build\outputs\apk\debug\app-debug.apk'
    if (!(Test-Path -LiteralPath $apk)) { throw 'O build terminou sem o APK esperado.' }
    Write-Output "APK de depuração: $apk"
} finally { Pop-Location }
