# Media3 no APK debug — teste físico

Data local: 04/11/2026. Aparelho utilizado: Samsung SM-S911B, Android API 36, autorizado por USB. A interface ADB inicialmente deixou de listar o telefone; reiniciar apenas o servidor ADB recuperou a conexão. O aparelho não foi reiniciado e não foi usado emulador.

## Resultado

O APK debug foi instalado, aberto e os botões da tela real foram acionados pelo canal de depuração USB do WebView do próprio Nocta. O plugin apareceu registrado como NoctaNativePlayer na API Capacitor e informou a plataforma android. O bundle empacotado contém os botões Testar no Media3, Testar MP4 controlado no Media3 e Testar HLS controlado no Media3.

| Caso físico | Resultado |
| --- | --- |
| MP4 controlado, asset local | Passou: relógio avançou, primeiro frame renderizado e áudio avançando |
| HLS controlado, asset local | Passou após corrigir seleção do MediaSource; vídeo e áudio confirmados pelos renderizadores |
| Black Clover T1/E1, Arthur HLS | Passou na fonte testada, com vídeo renderizado e áudio avançando |
| Black Clover T1/E1, Malfoy Matroska | Passou em uma tentativa anterior; na repetição final não confirmou início em 25 segundos. Nenhum erro de codec/rede foi inferido dessa espera. |
| Volume do aparelho durante o teste | STREAM_MUSIC não silenciado, volume 13/15; não foi alterado |

A confirmação exige progress, posição superior a um segundo, onRenderedFirstFrame e onAudioPositionAdvancing do Media3. Não foi baseada apenas em HTTP 200, loadedmetadata ou avanço do relógio. Isso comprova saída pelos renderizadores de vídeo/áudio no aparelho testado; não comprova idioma falado por escuta, nem que todas as resoluções/links de um fornecedor funcionarão.

As fontes externas foram testadas somente depois de MP4 e HLS controlados passarem. Arthur usou os headers declarados pela API; Malfoy usou os headers declarados e container Matroska reconhecido anteriormente. Não foram adicionadas credenciais, desativado TLS/CORS ou liberado cleartext. Os estados unsupported e os bloqueios web permaneceram intactos.

Evidência da execução: `.cache/media3-physical/result.json`. O arquivo registra controles, fontes, status e log de eventos, sem copiar URLs de reprodução. A última inspeção do APK fica em `.cache/media3-apk-check.json`.

## Correções necessárias encontradas no aparelho

1. A amostra HLS inicialmente gerou ERROR_CODE_PARSING_CONTAINER_UNSUPPORTED, categoria format: era encaminhada ao extractor progressivo. O plugin agora usa HlsMediaSource explicitamente e normaliza o MIME para MimeTypes.APPLICATION_M3U8. Após recompilar/reinstalar, o mesmo HLS passou. Não se tratava de CORS ou codec confirmado.
2. A interface agora consulta capabilities do plugin nativo. A configuração empacotada não depende apenas de import.meta.env.DEV: um APK Android debug com as flags recebe available=true. APK release recebe available=false e não mostra a experiência, mesmo que um bundle tenha sido gerado com flags por engano. load/play/pause/seek também continuam bloqueados por BuildConfig.DEBUG em release.
3. Cada tentativa recebe um identificador próprio; eventos antigos não confirmam uma nova tentativa. Trocar consulta limpa resultados nativos. Textos de playlist/progresso web são separados da prova nativa.
4. Erros são separados por categoria e código: network, format, codec, audio, protection e initialization. O log não inclui URLs. A primeira falha HLS foi registrada como format/3003; as tentativas posteriores tiveram eventos video/audio/progress.

## Onde encontrar os botões

No APK entregue: **Sobre o projeto & créditos → Configurações experimentais → Habilitar experimento Stremio nesta sessão**.

- Os botões de MP4/HLS controlados aparecem diretamente, sem depender de servidor local ou consulta ao catálogo.
- Para fontes externas: selecione fenixflix-diagnostics, Série, tt7441658, temporada 1 episódio 1 e Consultar fontes. Abra Outras fontes. Cada linha classificada como candidata nativa mostra Testar no Media3. A seleção web dessa mesma linha pode continuar unsupported; isso é esperado.
- Voltar fecha o player nativo e retorna ao diagnóstico. Os resultados ficam na memória da consulta; uma nova consulta não reutiliza a comprovação anterior.

## Instalação do APK entregue

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
& 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe' -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
& 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe' -d shell am start -n app.nocta.prototype/.MainActivity
```

Para reconstruir a mesma modalidade debug habilitada:

```powershell
$env:VITE_ENABLE_STREMIO_EXPERIMENT='true'
$env:VITE_ENABLE_NATIVE_EXPERIMENT='true'
npm run android:build
if ($LASTEXITCODE -ne 0) { throw 'Build falhou; instalação cancelada.' }
```

O script usa JDK 21 e Android SDK 35 configurados no projeto. Essas flags não devem ser mantidas para um build normal; o release tem bloqueio nativo adicional.

## Repetir o teste físico automatizado

Com o APK instalado, aberto, telefone desbloqueado e depuração USB autorizada:

```powershell
node scripts/media3/physical-check.mjs
```

O script encontra o PID do Nocta, encaminha a porta local 9223 somente para seu WebView debug, aciona os controles reais e fecha cada diálogo pelo Voltar. Requer o aparelho e uma instalação do APK debug. Uma fonte ausente, uma falha de rede ou um timeout não são tratados como sucesso. O script não cria emuladores ou usa um servidor sintético para simular Media3.

## Arquivos desta etapa

- src/experimental/playbackEngine.ts: consulta de capabilities, hook de disponibilidade e critério de prova vídeo+áudio.
- src/pages/StremioExperiment.tsx: liberação por capacidade debug, isolamento das tentativas, textos e registro separado dos eventos/erros.
- android/app/src/main/java/app/nocta/prototype/NoctaNativePlayerPlugin.java: eventos dos renderizadores, categorias de erro e MediaSource HLS explícito.
- android/app/src/androidTest/java/app/nocta/prototype/Media3FixtureTest.java: MIME HLS canônico.
- src/test/native-proof.test.ts: teste contra falsos positivos de progresso sem vídeo/áudio.
- scripts/media3/physical-check.mjs: teste no aparelho por USB.
- docs/NOCTA_MEDIA3_DEBUG.md: este relatório.

Validação automatizada: 32 testes JavaScript passaram em cinco suítes focadas. Builds web e Android debug passaram. O APK final está em android/app/build/outputs/apk/debug/app-debug.apk. Os testes instrumentados de etapas anteriores não foram usados como prova desta reprodução; a comprovação foi feita pelos botões do APK e eventos reais do plugin no aparelho.

Home, catálogo, favoritos, EmbedMovies, Badger/Rubeo web e o VideoPlayer não foram alterados nesta etapa. O registro do plugin já existente na MainActivity foi preservado e verificado no APK/dispositivo.

## Entrega final e repetição

O APK final foi recompilado e reinstalado no Samsung após os ajustes de isolamento de sessões/textos. MP4 controlado, HLS controlado e Arthur confirmaram novamente vídeo/áudio. Malfoy havia confirmado na rodada anterior, mas permaneceu em Preparando Media3 na repetição final por 25 segundos, sem evento de falha detalhado. O teste foi encerrado e o estado não verificado foi preservado. Isso demonstra variação entre tentativas; não é garantia de funcionamento do fornecedor nem prova de codec incompatível.

SHA-256 do APK final: `94c308e2a5d0959847cd26a316b4a0babf5f1f58c5884a2967a9620c4da8679c`.

Os testes físicos foram feitos no APK de depuração com os mesmos controles entregues. O aplicativo ficou instalado. O script de teste agora arquiva cada execução com timestamp para preservar tentativas diferentes, além do último result.json. Nesta entrega a rodada anterior bem-sucedida do Malfoy também foi observada no retorno da ferramenta de teste; result.json reflete a rodada final não verificada.
