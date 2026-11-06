# Nocta — diagnóstico de transporte de Gumball e Witch

Investigação em 5 de novembro de 2026. As consultas externas usaram o manifesto FenixFlix configurado com dublado e legendado. O diagnóstico de transporte leu apenas os cabeçalhos da primeira resposta Badger, via HEAD e GET com redirecionamento manual, sem consumir o corpo ou seguir o destino HTTP. Os testes de vídeo e de bloqueio usaram clipes ou respostas controladas. [Diagnóstico anterior de idiomas](NOCTA_IDIOMAS_REGRESSOES.md)

## Gumball T1/E1

1. O manifesto respondeu HTTP 200 em 489 ms. A consulta `stream/series/tt1942683%3A1%3A1.json`, com o prefixo do manifesto preservado, respondeu HTTP 200 em 411 ms. O resultado foi uma fonte Badger 1080p dublada declarada, sem cabeçalhos especiais e com `notWebReady=false`. O TMDB 37606 foi usado para identificar a série no Nocta.
2. A URL anunciada era HTTPS, na origem do próprio FenixFlix, sob `/r/`, sem extensão ou MIME declarado. O adaptador atribuiu MP4 por uma regra para esse prefixo, baseada em medições anteriores. A fonte `692e0839bdbb` virou candidata **HTML5 no WebView**, inclusive quando a opção Media3 estava disponível. A origem inicial desse redirecionamento está fora da lista nativa desse perfil e a regra de formato é usada no caminho web. [Regra do FenixFlix](../src/config/stremioServices.ts) · [Seleção de mecanismo](../src/playback/providers.ts)
3. O HEAD da fonte retornou **302 de HTTPS para HTTP**. Uma nova consulta entregou outro hash de fonte (`3282cbb7bc86`) e o GET confirmou o mesmo **302** para a origem `http://dbonline.tech-cdn.top`, hash do destino `9a4acc65cc8c`. A resposta inicial não trouxe Content-Type. Codec, resolução real e formato do arquivo final não foram medidos nesta rodada.
4. No Samsung SM-S911B, o APK anterior iniciou o elemento HTML5 com a mesma sequência de protocolos, em uma resposta controlada. O WebView registrou `blockedReason=mixed-content` e `net::ERR_ABORTED`. O elemento emitiu `loadstart` e o `SOURCE` emitiu `error`, sem código no elemento `VIDEO`. A tentativa acabou sem metadados, quadro, bytes de áudio decodificados ou avanço. O player chegou ao estado final sem iframe. Uma segunda amostra controlada com HTTP 404 confirmou que a falha também chega ao coordenador nesse caso. [Política de conteúdo misto do WebView](https://developer.android.com/reference/android/webkit/WebSettings#setMixedContentMode(int))

O salto HTTPS → HTTP da fonte real e o bloqueio dessa sequência no Samsung foram confirmados separadamente. A sessão comercial original relatada pelo usuário não foi capturada. Não há prova de erro de codec ou CORS no episódio. No [teste histórico de Os Simpsons](NOCTA_BADGER.md), o site de desenvolvimento servido por HTTP seguiu o mesmo primeiro salto e decodificou MP4 H.264/AAC com avanço de vídeo e áudio. A consulta atual de Os Simpsons também retornou um Badger dublado, com o mesmo primeiro domínio HTTP e outro hash de fonte (`bb2d697a4100`). Isso explica a diferença entre o teste web anterior e o contexto HTTPS do APK. A configuração e o tráfego interno do Stremio usado pelo usuário não foram capturados.

Mover essa cadeia para Media3 exigiria atravessar o mesmo salto entre protocolos. O plugin mantém redirecionamentos entre protocolos desativados e a validação da origem inicial. Uma rota de mídia autorizada que entregue HTTPS do início ao fim pode ser analisada como candidata sem enfraquecer essas regras. [Configuração do Media3](https://developer.android.com/reference/androidx/media3/datasource/DefaultHttpDataSource.Factory)

## The Witch and the Beast T1/E1

A consulta `stream/series/tt30089363%3A1%3A1.json` respondeu HTTP 200 em 263 ms e anunciou um MP4 1080p legendado, hash `4428c9d51a76`, em um host específico do Cloudflare R2. O addon declarou apenas `behaviorHints.proxyHeaders.request.User-Agent`, sem cabeçalhos de resposta. O TMDB 208445 foi usado para identificar a série.

O elemento HTML5 não aplica o cabeçalho por fonte. O plugin Media3 já aceita `User-Agent` e `Referer` declarados e pode abrir MP4, mas a origem anunciada está ausente tanto da lista nativa do perfil FenixFlix quanto da lista inicial do plugin. Assim, **nenhum mecanismo foi iniciado**. O teste com metadados controlados confirmou que um MP4 HTTPS da lista nativa e com o mesmo tipo de cabeçalho produz uma candidata Media3. Uma origem diferente é rejeitada. A reprodução ou a necessidade efetiva desse cabeçalho no servidor externo ficou sem teste. [Objeto Stream do Stremio](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html)

Uma integração autorizada poderia usar uma origem HTTPS específica aprovada nas duas camadas e cabeçalhos já aceitos, com revisão do destino dos redirecionamentos antes de liberar mídia com cabeçalhos especiais. Nenhum domínio R2, curinga ou destino novo foi autorizado.

## Correção aplicada

O [adaptador](../src/experimental/StremioAddonAdapter.ts) gerava a candidata Media3 antes de aplicar a configuração de perfil somente para diagnóstico ou uma regra explícita que recusa o endpoint. Essas restrições agora valem antes da criação da sessão, para os dois mecanismos. O adaptador também passa a separar os motivos nativos por origem, cabeçalho e formato. O [teste de candidatas](../src/test/native-candidates.test.ts) cobre as duas restrições e o caso MP4 com `User-Agent`. As rotas de mídia já aprovadas, os tempos do player e as listas de origem foram preservados. As duas fontes externas investigadas continuam sujeitas aos requisitos descritos acima.

## Inventário

[FenixFlix e Brazuca](../src/playback/providers.ts) são os fornecedores automáticos. Zeus do app e EmbedMovies têm opções de compilação próprias, desligadas no APK desta rodada. BsCine, Magnetflix, Zeus beta e VêTela seguem fora da reprodução normal. A execução do conteúdo web extraído do novo APK, com respostas controladas, consultou apenas os dois manifestos ativos.

## Validação

- **271 testes em 32 arquivos**, incluindo a integração HTTP com o servidor autorizado local. Os contratos de seleção, Media3, histórico e episódios passaram. As fontes comerciais dos seis títulos citados como regressão não foram reproduzidas novamente.
- **APK atualizado instalado** no Samsung SM-S911B por USB. TypeScript, Vite, sincronização do Capacitor e Gradle `assembleDebug` passaram. [APK de depuração](../android/app/build/outputs/apk/debug/app-debug.apk), SHA-256 `dd4575b4a9ab60348b6c8cc6928ab77e73c82044667dc82f1292a2028c2ca793`.
- **No Samsung**, o fluxo normal reproduziu MP4 via HTML5 com 35 quadros, 14.719 bytes de áudio decodificados e posição de 1,298 s. No Media3, o MP4 controlado registrou primeiro quadro aos 654 ms, avanço de áudio aos 935 ms e posição de 1,294 s. O HLS registrou primeiro quadro aos 176 ms, avanço de áudio aos 430 ms e posição de 1,176 s. Os dois testes nativos usaram os arquivos CC0 incluídos no debug. Nenhuma fonte externa foi carregada no Media3.
- **Fallback controlado**. No navegador, usando os arquivos do novo APK, o primeiro servidor deu 404 e a alternativa HTTPS avançou até 1,041 s com 29 quadros e 11.553 bytes de áudio decodificados. No Samsung, com os complementos vazios, o app encerrou a busca sem iframe e repetiu a consulta ao tocar em tentar novamente.

Evidências locais sanitizadas em [HEAD e descoberta](../.cache/nocta-transporte/metadata.json), [GET](../.cache/nocta-transporte/metadata-get.json), [bloqueio controlado no Samsung](../.cache/nocta-transporte/device-baseline.json), [fallback do conteúdo do APK](../.cache/nocta-transporte/desktop-recovery.json) e [validação depois da instalação](../.cache/nocta-transporte/post-install/controlled.json).
