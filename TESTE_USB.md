# Nocta — build e instalação em aparelho USB

Use PowerShell em `C:\Users\PC\Desktop\fuzz`. Este fluxo compila o projeto existente e instala somente em um dispositivo físico USB (`adb -d`); não cria, inicia ou seleciona emuladores.

Requisitos conferidos neste computador: Node 20.19.4/npm 10.8.2, JDK 21 em `C:\Users\PC\.jdks\jbr-21.0.11`, SDK Android com plataforma 35, build-tools 35.0.0 e platform-tools/ADB. A presença do telefone e sua autorização USB não foram verificadas pelo assistente. O projeto Android já existe; não execute `cap add android` novamente.

Conecte um único telefone por cabo de dados, ative a depuração USB e aceite a autorização RSA no próprio aparelho. `adb devices -l` deve mostrar `device`, não `unauthorized` ou `offline`. Se o telefone não aparecer, confira cabo/modo USB e, no Windows, o driver USB do fabricante. Não é necessário habilitar depuração por rede.

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
$ErrorActionPreference = 'Stop'
$env:JAVA_HOME = 'C:\Users\PC\.jdks\jbr-21.0.11'
$env:ANDROID_HOME = 'C:\Users\PC\AppData\Local\Android\Sdk'
$env:GRADLE_USER_HOME = Join-Path $PWD '.cache\gradle'
$adb = Join-Path $env:ANDROID_HOME 'platform-tools\adb.exe'

& $adb devices -l
$usbState = & $adb -d get-state
if ($LASTEXITCODE -ne 0 -or "$usbState".Trim() -ne 'device') { throw 'Conecte e autorize um único celular USB antes de continuar.' }

if (!(Test-Path 'node_modules')) {
    npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar dependências.' }
}
npm run build
if ($LASTEXITCODE -ne 0) { throw 'Falha no build web.' }
npx cap sync android
if ($LASTEXITCODE -ne 0) { throw 'Falha na sincronização Capacitor.' }
.\android\gradlew.bat -p android assembleDebug --no-daemon --no-watch-fs --max-workers=1 '-Dorg.gradle.jvmargs=-Xmx768m' '-Dorg.gradle.internal.instrumentation.agent=false' --console=plain
if ($LASTEXITCODE -ne 0) { throw 'Falha no build Android; instalação interrompida.' }
& $adb -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
if ($LASTEXITCODE -ne 0) { throw 'Falha na instalação USB.' }
& $adb -d shell am start -n 'app.nocta.prototype/.MainActivity'
if ($LASTEXITCODE -ne 0) { throw 'Não foi possível abrir o Nocta.' }
```

O APK gerado pelo Gradle ficará em `C:\Users\PC\Desktop\fuzz\android\app\build\outputs\apk\debug\app-debug.apk`. O comando `install -r` mantém os dados quando a instalação anterior usa o mesmo pacote e a mesma assinatura. Não desinstale automaticamente em caso de conflito de assinatura; use a chave de desenvolvimento original para preservar os dados. A assinatura de depuração não é para publicação em loja.

As verificações de erro impedem instalar um APK antigo se o build ou a sincronização falharem. Na primeira compilação, Gradle pode precisar baixar dependências públicas; configure o SDK/aceite suas licenças pelo Android Studio se houver aviso de pacote ou licença ausente. Não é necessário iniciar um servidor Vite para executar a versão empacotada.

No aparelho, confira: Hero/cartazes/títulos abrindo `/assistir`; detalhes expansíveis sem reiniciar o vídeo; temporadas/episódios na mesma tela; Voltar; rolagem; favoritos e histórico após fechar/reabrir. Para HTML5, confira Próximo Episódio no último minuto e ao terminar, usando somente mídia de teste autorizada. Em iframe externo sem API de progresso documentada, o avanço continua manual; não é lido o vídeo interno.

Referências: [Capacitor Android 7](https://capacitorjs.com/docs/v7/android), [Android Debug Bridge](https://developer.android.com/tools/adb).
