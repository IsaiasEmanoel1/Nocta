# Malfoy no Android — reprodução manual e superfície do Media3

Data local: 04/11/2026. Aparelho: Samsung SM-S911B, USB/ADB, APK debug. Este documento substitui as conclusões limitadas do diagnóstico anterior. Nenhum novo player, proxy, fornecedor ou política de acesso foi introduzido.

## Resultado e evidências principais

Foi reproduzida a falha visual relatada pelo usuário: **áudio audível, mas nenhuma imagem em quatro tentativas manuais**. Os eventos de primeiro frame do Media3, isoladamente, haviam produzido uma interpretação excessiva de sucesso no diagnóstico anterior. Eles indicam saída do renderizador; não comprovam que a composição da janela mostrou a imagem ao usuário.

Foi identificado um defeito local: `new PlayerView(getContext())` herdava o tema da Activity, que define `android:background=#070b14`. Os FrameLayouts `exo_overlay` e `exo_ad_overlay`, de tamanho integral e posicionados acima do vídeo, ficaram opacos (`ff070b14`). O vídeo continuava sendo decodificado por baixo deles.

Prova independente da rede: no MP4 controlado já existente, o PixelCopy da SurfaceView obteve pixels coloridos (1024/1024 amostras não escuras), o contador de saída indicou 69 quadros, mas a captura da tela mostrava apenas fundo escuro e controles. Após usar um tema exclusivo para o diálogo nativo, os fundos dos dois overlays passaram a `none`, e a captura mostrou as barras coloridas. O mesmo arquivo e o mesmo hash de configuração foram usados antes/depois.

A correção se restringe ao contexto/tema do diálogo do Media3. O tema da Activity, WebView, Home, catálogo, favoritos, EmbedMovies e seleção web de fontes permanecem intactos. `unsupported` do player web não foi convertido artificialmente em compatível.

**Também existe variação de acesso aos dados da fonte.** Timeouts HTTP foram observados e são independentes do fundo opaco. Uma abertura bem-sucedida não garante a seguinte. Não foi comprovada incompatibilidade de codec.

## Seleção automática versus manual

O script antigo consultava novamente o complemento por tentativa e selecionava o primeiro `li` contendo Malfoy. O botão utilizado era o mesmo da interface (`testNative(source.id, source.nativeCandidate)`), mas isso não garantia que a opção escolhida pelo usuário, a mídia ou os cabeçalhos fossem iguais. Na consulta atual havia oito linhas Malfoy 1080p distintas.

Agora cada toque gera:

- `sourceId`: identificador da linha na consulta (por exemplo, `tt1710308:1:1:0`). Índice não é uma identidade persistente do fornecedor.
- `sessionId`: UUID exclusivo da tentativa.
- `inputFingerprint`: SHA-256 truncado a 24 caracteres hexadecimais sobre URL exata, MIME e cabeçalhos ordenados. Somente o hash é registrado; valores/URLs não entram no diagnóstico.

O script não escolhe mais a primeira opção. O modo manual é passivo; `--open` apenas abre e prepara a consulta. Uma repetição automática exige ID exato e hash já capturados, verifica a linha existente e não refaz a consulta. Não há substituição silenciosa de fonte.

## Tentativas manuais antes da correção do tema

Todas em Apenas um Show T1/E1 (`tt1710308:1:1`), MIME `video/x-matroska`, cabeçalhos declarados User-Agent e Referer. O usuário confirmou: áudio nas quatro, sem imagem nas quatro.

| Tentativa humana | Linha | Hash de configuração | Primeiro frame / áudio | Posição máxima | Resultado visual humano |
| --- | --- | --- | --- | --- | --- |
| 1 | `:0` | `e7bc2034000f2b8880340d0f` | 22,610 s / 23,049 s | 0,615 s | Sem imagem; com áudio |
| 2 | `:1` | `45432b44dc399fbd6c5478f6` | 4,580 s / 5,057 s | 3,987 s | Sem imagem; com áudio |
| 3 | `:0` | `e7bc2034000f2b8880340d0f` | 4,161 s / 4,432 s | 2,356 s | Sem imagem; com áudio |
| 4 | `:2` | `1b96300cbd4c7efefaf744f7` | 4,469 s / 4,868 s | 175,726 s (houve seek) | Sem imagem; com áudio |

A primeira tentativa teve dois eventos de carga recuperáveis com cadeia `HttpDataSourceException → SocketTimeoutException → SocketException`, aos 9,854 s e 17,925 s, com 5.739 bytes observados. Sem erro terminal. As outras três não tiveram erro de carga observado. As quatro selecionaram AVC (`avc1.640028`, 1920×1080) e AC-3 estéreo, 48 kHz, faixa com idioma `pt` declarado. Isso difere do E-AC-3 JOC registrado em consultas anteriores: não se presume que todo resultado Malfoy represente o mesmo arquivo.

Não houve `activity-pause` ou fechamento prematuro demonstrado antes da saída. O encerramento registrado foi `user-dismissed`. Os callbacks posteriores ao encerramento aparecem como antigos e não podem alterar a tentativa atual.

## Repetições automáticas da mesma opção

| Caso | Identidade | Observado |
| --- | --- | --- |
| Apenas um Show, `:0`, antes do tema | Mesmo hash `e7bc…0d0f` da tentativa manual | READY, isPlaying=true, relógio até 33,868 s, mas sem primeiro frame nem avanço de áudio. Encerrado por STARTUP_TIMEOUT aos 45,502 s; não classificado como sucesso. |
| Apenas um Show, `:1`, antes do tema | Mesmo hash `4543…8f6` manual | Primeiro frame aos 32,835 s, áudio aos 33,193 s, após três erros recuperáveis. Captura da tela permaneceu escura apesar dos eventos. |
| Apenas um Show, `:0`, após tema corrigido | Mesmo hash completo `e7bc2034000f2b8880340d0f` | Primeiro frame aos 30,476 s; áudio aos 30,800 s; posição 2,729 s, 82 quadros renderizados. Captura mostrou a imagem de Regular Show. Overlays sem fundo. |

Na última abertura, os dois timeouts foram `HttpDataSourceException.type=TYPE_OPEN (1)`, aos 16,039 s e 24,111 s. A origem respondeu `video/x-matroska`; requisições posteriores de intervalo tiveram Content-Range coerente. Aos 33,354 s havia 53.628.798 bytes transferidos e aproximadamente 52,7 s de buffer. Não há prova de falha de parser/codec nessa tentativa.

O PixelCopy de uma amostra inicial do episódio retornou preto no instante 0,838 s, enquanto a captura seguinte já mostrou a abertura do título. **Frame preto isolado não é automaticamente erro**, pois pode fazer parte do conteúdo. O teste não usa esse critério para reprovar obras.

## Proteções e instrumentação

Cada Run nativo mantém player, diálogo, listeners, contadores e identidade próprios. O código anterior usava campos globais mutáveis de sessão/flags dentro dos callbacks. Foi removido esse risco de atribuição incorreta entre tentativas, sem alegar que fosse a causa comprovada da tela preta. Eventos antigos são identificados como `stale` e ignorados na interface.

O tag `NoctaMedia3` registra, sem URLs e sem mensagens brutas de exceção:

- IDLE, BUFFERING, READY e ENDED quando ocorrerem; playWhenReady, isPlaying, isLoading e suppressionReason.
- Posição atual e bufferedPosition em segundos; contadores de bytes e de tarefas de carga.
- Início/fim/erro recuperável de leitura, posições de Range, Content-Type/Length/Range, classe da causa e operação HTTP.
- Faixas selecionadas, MIME, codec, dimensões, canais, frequência, idioma declarado e nomes dos decoders.
- Primeiro frame, áudio avançando, quadros enfileirados/renderizados/descartados.
- Criação/destruição da SurfaceView, associação ao PlayerView, visibilidade, limites, shutter e fundos dos overlays.
- Estatísticas de pixels de uma pequena cópia da superfície; nenhum frame é persistido pelo plugin.
- Pausa da Activity, fechamento explícito, fechamento pelo usuário, troca de sessão e callbacks antigos.

Eventos de erro recuperável de carga são diagnósticos; não encerram a tentativa por si só, pois o Media3 pode recuperar. Erro terminal preserva seu código e categoria. O timeout global de início (45 s com playWhenReady=true, sem consumir pausas/background) encerra o diálogo se vídeo/áudio ainda não emitiram os sinais exigidos. `STARTUP_TIMEOUT` é um diagnóstico do Nocta, **não um código Media3 inventado**. A linha mantém o aviso e o botão Tentar novamente no Media3; também é possível escolher outra fonte.

O retorno do renderer agora é descrito honestamente como “Media3 reportou frame e áudio: confirme imagem e som no aparelho”. A confirmação humana de imagem não é fabricada pela interface ou pelo script.

## Validação final

A correção foi compilada e instalada no Samsung. **O usuário iniciou novamente o Malfoy manualmente e confirmou: “agora apareceu o video sim... funcionando audio e video!”**

A tentativa humana confirmada foi `6fbae4c5-e241-4064-a3bc-f6f42432255f`, linha `tt1710308:1:1:0`, **mesmo hash** `e7bc2034000f2b8880340d0f` das tentativas anteriores. Primeiro frame aos 4,046 s, avanço do áudio aos 4,552 s, posição até 19,186 s. Não houve erro terminal observado. A faixa selecionada permaneceu AVC/AC-3. Evidência segura recuperada do tag por sessão em `final-tag-events.json`; a confirmação visual/auditiva é humana, além dos eventos. Uma abertura posterior da linha `:1` foi interrompida pela navegação do diagnóstico antes de emitir saída; não foi contada como sucesso nem usada como prova de falha de codec.

| Validação final | Resultado efetivo |
| --- | --- |
| Apenas um Show T1/E1 / Malfoy, manual | Imagem e som confirmados pelo usuário após a correção; sessão identificada acima |
| Mesma fonte / repetição automática | Imagem capturada na tela e renderizadores de vídeo/áudio ativos; início demorou aproximadamente 31 s nesta tentativa |
| MP4 controlado já existente | Imagem visível na captura, renderizadores ativos, posição 2,949 s; overlays transparentes |
| HLS controlado já existente | Imagem visível na captura `final-hls-confirmed.png`, áudio avançando, posição 2,274 s, 56 quadros, 12 cargas concluídas, nenhum erro de carga; sessão `abcbdbb6-4bd1-4b4e-b365-cb177402e13d` |
| Black Clover T1/E1 / Malfoy | Não pôde ser repetido nesta rodada final: HTTP e consulta no próprio WebView retornaram apenas duas opções Rubeo (480p/720p), nenhuma Malfoy |
| Arthur como controle externo | Não pôde ser repetido: nenhuma opção Arthur na consulta final de Black Clover. Não se reutilizou URL antiga nem se substituiu por outro fornecedor. O resultado anterior do usuário permanece histórico, sem inventar novo teste |
| Testes JavaScript/React | 37 passaram em 7 arquivos, incluindo seleção exata da segunda fonte, hashes, timeout/retry, callbacks antigos e regressões do adaptador/preflight/biblioteca |
| Teste instrumentado no Samsung | `NativePlayerThemeTest`: OK (1 test), overlays e content frame sem fundo opaco |
| Builds | Web/TypeScript e Android debug concluídos. Também compilado o APK de testes; sem emulador |

A listagem final de Black Clover está em `black-webview-inventory.json`. A ausência das opções não foi causada por filtro novo: o adaptador/configuração de fornecedores não foi alterado. Não se declara regressão externa Arthur/Black Clover validada nesta rodada.

**Estado final:** defeito local que encobria a imagem corrigido e validado manualmente. Malfoy reproduziu Apenas um Show T1/E1 com imagem e áudio no Samsung. Timeouts HTTP e a tentativa READY sem saída continuam evidências distintas de instabilidade de carregamento, cuja causa completa não foi estabelecida. Agora há encerramento explícito em 45 s e retry em vez de preparação infinita. Não há garantia de que todos os links ou tentativas do Malfoy funcionarão.

O USB caiu transitoriamente durante algumas etapas. Foram repetidas somente as operações afetadas após reconexão. A execução instrumentada acima terminou explicitamente com OK; uma tentativa anterior interrompida por perda do dispositivo não foi contada. Os testes de backend não foram confundidos com testes de reprodução.

APK debug entregue e instalado: `C:\Users\PC\Desktop\fuzz\android\app\build\outputs\apk\debug\app-debug.apk`, 10.169.906 bytes. SHA-256: `d9074ab0c4165cfc37e1f004c8552252d9ff9598451ca9f0af645f71be5dc283`.

Para compilar e atualizar por USB:

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
$env:VITE_ENABLE_STREMIO_EXPERIMENT='true'
$env:VITE_ENABLE_NATIVE_EXPERIMENT='true'
npm run android:build
if ($LASTEXITCODE -ne 0) { throw 'Build falhou; instalação cancelada.' }
& 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe' -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```

Testes focados executados:

```powershell
npm test -- src/test/native-selection.test.tsx src/test/native-attempt.test.ts src/test/native-proof.test.ts src/test/native-candidates.test.ts src/test/source-preflight.test.ts src/test/stremio-adapter.test.ts src/test/playback-library.test.tsx
```

Teste Android executado após compilar/instalar o APK de testes:

```powershell
& 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe' -d shell am instrument -w -e class app.nocta.prototype.NativePlayerThemeTest app.nocta.prototype.test/androidx.test.runner.AndroidJUnitRunner
```

As provas finais usam o mesmo plugin e os botões existentes. O script de preparação foi executado também com `--manual --open`; preparou a consulta sem iniciar reprodução e deixou Apenas um Show T1/E1 disponível para repetir o toque no aparelho.

## Repetir no Samsung

Com USB autorizado e Nocta aberto, preparar a consulta e capturar o toque humano:

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
node scripts/media3/malfoy-diagnostic.mjs --manual --open --imdb=tt1710308 --season=1 --episode=1 --source-id=tt1710308:1:1:0 --seconds=180
```

O script abre a rota existente `/configuracoes`, habilita o experimento nesta sessão, consulta o FenixFlix e posiciona a linha solicitada, mas **não toca em Testar no Media3**. O usuário deve tocar na opção desejada e verificar imagem/som. O atalho normal continua em Sobre o projeto & créditos → Configurações experimentais. Requer as dependências Playwright já instaladas, APK debug com as flags e ADB no caminho configurado no script; não usa emulador.

Para repetir a mesma opção da consulta que ainda está aberta:

```powershell
node scripts/media3/malfoy-diagnostic.mjs --source-id=tt1710308:1:1:0 --fingerprint=e7bc2034000f2b8880340d0f --seconds=65
```

Se o hash/linha não corresponder, o script para, sem selecionar outra fonte. O hash acima só vale para a fonte capturada nesta sessão; use o hash da sua nova tentativa quando a consulta mudar.

Captura ADB direta sem dados de URL do Capacitor:

```powershell
$taskAdb='C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe'
& $taskAdb -d logcat -v threadtime NoctaMedia3:I '*:S' > '.\MALFOY_EVENTOS_LOCAL.txt'
```

Parar com Ctrl+C. Logs completos de outros tags podem conter URLs assinadas; não são necessários para essa captura segura.

## Arquivos alterados

- `android/app/src/main/java/app/nocta/prototype/NoctaNativePlayerPlugin.java`: sessões isoladas, telemetria segura, timeout, contexto do diálogo para o PlayerView.
- `android/app/src/main/res/values/native_player_styles.xml`: tema exclusivo sem fundo opaco para views internas.
- `android/app/src/androidTest/java/app/nocta/prototype/NativePlayerThemeTest.java`: teste real de transparência dos overlays.
- `src/experimental/playbackEngine.ts`: campos de identidade e diagnóstico no contrato existente.
- `src/experimental/nativeAttempt.ts`: hash de configuração, validação de sessão e mensagem de falha.
- `src/pages/StremioExperiment.tsx`: identificação da fonte/tentativa, filtragem de eventos antigos, retry e mensagem de evidência honesta.
- `src/test/native-attempt.test.ts`, `src/test/native-selection.test.tsx`: hash sem vazamento, seleção exata, retry e isolamento entre tentativas.
- `scripts/media3/malfoy-diagnostic.mjs`: captura passiva/manual e repetição da fonte explicitamente escolhida.
- `docs/MALFOY_DIAGNOSTICO_ANDROID.md`: este relatório.

Evidências privadas ficam em `.cache/malfoy-diagnostic/`: manual-four.json, repeat-regular-exact.json, repeat-regular-1.json, before-theme.json e capturas before-theme-mp4.png, after-theme.json e capturas after-theme-mp4.png/after-theme-regular0.png, final-tag-events.json, final-hls-confirmed.json/png e black-webview-inventory.json. São capturas locais de diagnóstico, não recursos incorporados ao produto. Nenhum link de mídia ou credencial foi incluído neste relatório. Saídas em `dist` e `android/app/src/main/assets/public` são derivadas do build/sync, não novas alterações de funcionalidades.

APIs utilizadas: [AnalyticsListener oficial](https://developer.android.com/reference/androidx/media3/exoplayer/analytics/AnalyticsListener) e [Player.Listener oficial](https://developer.android.com/reference/androidx/media3/common/Player.Listener). Bibliotecas permanecem Media3 1.8.0 e o player web existente; nenhuma nova dependência de reprodução foi adicionada.
