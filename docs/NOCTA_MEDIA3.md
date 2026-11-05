# NOCTA — experimento nativo Media3

Data: 04/11/2026. O VideoPlayer web foi preservado. Foi implementado um plugin Capacitor local, em Java, com AndroidX Media3 1.8.0, e uma API TypeScript independente para load/play/pause/seek/close e eventos. **Reprodução nativa em aparelho não foi verificada: adb devices não encontrou aparelho físico. Não foi criado emulador.**

## Dados reais desta consulta

O script existente alternatives-probe consultou o FenixFlix configurado. Black Clover T1/E1 retornou 7 fontes (3 Arthur e 4 Malfoy); Os Simpsons retornou 0, Barbie 0, Apenas um Show T1/E1 retornou 8 Malfoy e Dr. House T1/E1 retornou 1 Badger. As contagens são desta consulta, não um inventário estável.

A leitura limitada de bytes do primeiro Arthur e do primeiro Malfoy utilizou somente os headers declarados em behaviorHints.proxyHeaders.request pelo serviço. Não houve autenticação adicionada, resolução de embed, troca de domínio, alteração de protocolo ou desativação de TLS. Foram lidas as assinaturas, sem salvar os vídeos.

| Fonte | Container/tecnologia observado | Requisitos | Web atual | Media3 |
| --- | --- | --- | --- | --- |
| Arthur | HTTP 200, application/vnd.apple.mpegurl, assinatura #EXTM3U; .m3u8 | User-Agent declarado | HLS.js suporta HLS, mas o caminho atual recusa proxyHeaders. Não prova incompatibilidade de codec. | Candidato HLS com headers declarados, não reproduzido no aparelho |
| Malfoy | HTTP 206, video/x-matroska, assinatura EBML 1a45dfa3; /download.aspx sem extensão | User-Agent e Referer declarados | Não é MP4, WebM ou HLS só por não ter extensão. O Nocta não possui demux de Matroska no caminho web e recusa headers especiais. | Candidato Matroska, codecs internos ainda não confirmados; não reproduzido no aparelho |
| Badger | MP4 por redirecionamento /r/, conforme investigação anterior; fonte apareceu em House | Cadeia de redirects, incluindo HTTP no registro anterior | Suporte anterior preservado; nenhuma nova reprodução foi alegada nesta etapa | Não foi liberado automaticamente: o plugin recusa redirects entre protocolos |
| Rubeo | HLS no registro anterior | Sem headers especiais no registro anterior | Caminho HLS e preflight preservados; ausente nesta consulta | Não verificado |
| Zunder | HLS no endpoint sem extensão já verificado | CORS falhou em teste anterior | Regra anterior preservada; ausente nesta consulta | Não verificado |

A assinatura EBML também existe em WebM, mas aqui o Content-Type recebido foi video/x-matroska: não foi declarado WebM por adivinhação. Codecs internos de Arthur/Malfoy não foram inferidos a partir de container, qualidade ou notWebReady=false. Esses valores são hints, não sucesso de playback.

## Código nativo

NoctaNativePlayerPlugin abre um Dialog com PlayerView do Media3 e controles nativos. Usa MediaItem com MIME explícito, DefaultMediaSourceFactory e DefaultHttpDataSource.Factory. A API permite carregar, tocar, pausar, buscar posição e fechar. Voltar fecha o Dialog; segundo plano pausa; fechar/destruir libera player e callbacks. Eventos loaded/progress/failed/ended/closed incluem identificação da sessão. A indicação de reprodução nativa verificada depende de progresso real, não de load ou HTTP 200, e permanece registrada após fechar o Dialog.

Destinos são explícitos em Java e no adaptador TypeScript. Somente User-Agent e Referer declarados pelo addon são aceitos; Cookie/Authorization/headers desconhecidos ou CRLF são recusados. Não se copiam cookies do WebView. TLS permanece verificado, redirects entre protocolos permanecem recusados e cleartext não foi liberado no manifesto Android. Hosts novos exigem revisão explícita. A configuração de headers vale para a sessão e seus recursos; não é um proxy genérico nem um extrator.

O plugin rejeita load/play/pause/seek em APK release. A interface exige VITE_ENABLE_NATIVE_EXPERIMENT=true, plataforma Android e VITE_ENABLE_STREMIO_EXPERIMENT=true; por padrão continua desligada. A API HTML5 irmã controla um elemento de vídeo, permitindo à interface futura usar a mesma porta de controle. Isso não substitui o VideoPlayer nem incorpora uma segunda implementação HLS no web.

Media3 pode lidar com Matroska e com fontes HTTP cujos headers são configuráveis, mas isso não garante codec, política de acesso, destino após redirect ou disponibilidade. A reprodução externa só é tentada pelo botão manual, sem passagem automática da seleção web para nativo. Referências técnicas: [Media3 início](https://developer.android.com/media/media3/exoplayer/hello-world), [customização](https://developer.android.com/media/media3/exoplayer/customization), [formatos](https://developer.android.com/media/media3/exoplayer/supported-formats), [plugin Android Capacitor](https://capacitorjs.com/docs/v7/plugins/android).

## Mídias controladas

Foram reutilizadas as amostras CC0 já geradas: sample.mp4 e master.m3u8 com suas playlists/segmentos. Aproximadamente 1,65 MB foram copiados para android/app/src/debug/assets/native-fixtures. Não entram nos assets de release. O Media3 as lê por asset:///, sem servidor HTTP, permissões adicionais ou afrouxamento de cleartext.

Dois testes instrumentados verificam o avanço do relógio acima de dois segundos e ausência de PlayerError, separadamente para MP4 e HLS. Sem aparelho, esses testes **não foram executados**. Compilar os testes não é reproduzir vídeo. Não se afirma áudio português confirmado: as amostras contêm tons com rótulos de faixa por/eng.

## Compilar e testar no celular físico

Pré-requisitos desta máquina: JDK 21 em C:\Users\PC\.jdks\jbr-21.0.11, Android SDK plataforma 35 em C:\Users\PC\AppData\Local\Android\Sdk, celular com depuração USB autorizada. Sem emulador.

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
$env:VITE_ENABLE_STREMIO_EXPERIMENT='true'
$env:VITE_ENABLE_NATIVE_EXPERIMENT='true'
npm run android:build
if ($LASTEXITCODE -ne 0) { throw 'Build falhou; instalação cancelada.' }
& 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe' -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```

No aplicativo: Sobre → Configurações experimentais → habilitar experimento. Os botões Testar MP4 controlado no Media3 e Testar HLS controlado no Media3 abrem o player nativo. Confira avanço, pausa, seek, Voltar e saída para segundo plano. Depois, no perfil Fenix, consulte Black Clover ou Apenas um Show. Em Outras fontes, os candidatos Arthur/Malfoy oferecem Testar no Media3. O status continua não verificado até eventos reais; erros mostram o código Media3. Não confunda compatibilidade nativa com compatibilidade web.

Para executar os testes instrumentados somente no aparelho conectado (sem emuladores):

```powershell
$env:JAVA_HOME='C:\Users\PC\.jdks\jbr-21.0.11'
$env:ANDROID_HOME='C:\Users\PC\AppData\Local\Android\Sdk'
$env:GRADLE_USER_HOME='C:\Users\PC\Desktop\fuzz\.cache\gradle'
.\android\gradlew.bat -p android :app:assembleDebug :app:assembleDebugAndroidTest --no-daemon
if ($LASTEXITCODE -ne 0) { throw 'Falha ao compilar os testes.' }
$taskAdb='C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $taskAdb -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
& $taskAdb -d install -r '.\android\app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk'
& $taskAdb -d shell am instrument -w -e class app.nocta.prototype.Media3FixtureTest app.nocta.prototype.test/androidx.test.runner.AndroidJUnitRunner
```

Ao fazer um build normal posteriormente, remova as duas variáveis experimentais do terminal; elas não devem ser usadas para distribuição. Um release nativo rejeita as chamadas mesmo se o JS tiver sido configurado incorretamente.

## Arquivos

- android/app/src/main/java/app/nocta/prototype/NoctaNativePlayerPlugin.java: plugin Media3.
- MainActivity.java: registro do plugin, sem mudança no fullscreen web existente.
- android/app/build.gradle: Media3 ExoPlayer/HLS/UI 1.8.0 e BuildConfig.
- android/app/src/debug/assets/native-fixtures/: amostras CC0 apenas de debug.
- android/app/src/androidTest/java/app/nocta/prototype/Media3FixtureTest.java: testes físicos MP4/HLS.
- src/experimental/playbackEngine.ts: contrato independente e adaptadores básico HTML5/nativo.
- src/experimental/StremioAddonAdapter.ts: candidato nativo explícito e reconhecimento de Matroska verificado; web permanece bloqueado quando exige headers.
- src/config/stremioServices.ts: ativação experimental no APK Android mediante flags.
- src/pages/StremioExperiment.tsx: diagnóstico e teste nativo manual, sem nova tela.
- src/test/native-candidates.test.ts: três testes do adaptador.
- docs/NOCTA_MEDIA3.md: este relatório.

Home, catálogo, favoritos, recomendações, EmbedMovies e VideoPlayer não foram substituídos ou refatorados nesta etapa. Nenhum fornecedor foi adicionado.

## Resultados de validação desta entrega

- 37 testes JavaScript aprovados em cinco suítes focadas: 34 regressões/diagnóstico e 3 novos testes de candidatos nativos.
- Build web com TypeScript/Vite aprovado, inclusive com as duas flags experimentais. Capacitor sync android concluído.
- Compilação do aplicativo Media3 de debug aprovada; APK presente em C:\Users\PC\Desktop\fuzz\android\app\build\outputs\apk\debug\app-debug.apk, aproximadamente 9,7 MB.
- Os dois testes instrumentados foram compilados no APK C:\Users\PC\Desktop\fuzz\android\app\build\outputs\apk\androidTest\debug\app-debug-androidTest.apk. Não executados, pois nenhum telefone apareceu no ADB.
- Não se afirmou que Arthur ou Malfoy reproduzem no Media3. A leitura HTTP identificou container/headers, não sucesso de reprodução.
- Os assets públicos nativos sincronizados são do experimento habilitado por flags; um build web normal posterior desativa a interface novamente. A execução do plugin continua protegida por BuildConfig.DEBUG.

A chamada Gradle sem prefixo :app também tentou compilar testes internos dos módulos Capacitor/Cordova; o módulo Cordova falhou por duplicação de kotlin-stdlib 1.8.22/jdk8 1.6.21. Os comandos acima foram restringidos ao aplicativo e aos seus testes, sem alterar dependências de módulos gerados. Esse problema não foi omitido nem contado como teste físico executado.

Validação Android final: `:app:assembleDebug :app:assembleDebugAndroidTest` terminou com BUILD SUCCESSFUL (110 tarefas). Esses são os alvos do Nocta e dos testes MP4/HLS; a falha dos testes internos Cordova descrita acima não foi contornada por alteração de código ou declarada como aprovada.
