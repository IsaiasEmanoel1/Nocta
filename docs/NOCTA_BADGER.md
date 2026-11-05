# NOCTA — Badger e fontes alternativas

Verificação técnica em 04/11/2026. **Badger passou a reproduzir no player web existente**, sem Media3, novo player, scraping, falsificação de headers ou desativação de CORS/TLS.

## Motivo exato da rejeição anterior

A fonte Badger apareceu em Os Simpsons, IMDb tt0096697, T1/E1, declarada como dublada e 1080p. A resposta usa o campo url com uma rota HTTPS `/r/<identificador opaco>` do próprio FenixFlix, sem extensão. `behaviorHints.notWebReady` era false e não havia proxyHeaders.

No StremioAddonAdapter anterior, havia dois obstáculos sucessivos: a origem HTTPS do Fenix não estava entre mediaOrigins; além disso, a seleção de format aceitava somente extensão .mp4/.webm/.m3u8 ou os endpoints HLS já registrados. A URL de redirecionamento não se encaixava, portanto terminava como unsupported. O fato de notWebReady=false não modificava essa classificação — e não deve ser usado como prova de sucesso.

A consulta HTTP normal revelou: Fenix `/r/...` → 302 para http://dbonline.tech-cdn.top → 302 para http://zjo.lat → 302 para um host workers.dev → **206 video/mp4**, com assinatura ftypisom e CORS *. Não foi decodificado o token opaco nem reescrito o protocolo de transporte; foram seguidos os Location públicos observados com limite de hosts. As consultas iniciais limitaram a leitura a Range 0–4095.

A inspeção com o FFmpeg já instalado identificou MP4 isom, vídeo H.264 High/avc1 1280×960 a cerca de 23,98 fps e áudio AAC-LC estéreo 48 kHz. A faixa tem marcador por. Esse marcador é metadado, não uma confirmação da língua falada por escuta. O rótulo 1080p continua sendo qualidade declarada pelo addon; a resolução decodificada não corresponde a 1920×1080.

## Correção

Foi acrescentada uma regra explícita de redirecionamento no perfil Fenix, restrita à origem HTTPS do serviço e ao prefixo `/r/`, identificando a família Badger verificada como MP4. O elemento HTML5 recebe a URL original HTTPS e segue os redirects normalmente. Não foi criado proxy, não se alterou User-Agent/Referer e não se liberaram hosts arbitrários.

A regra é uma classificação candidata, não uma promessa de reprodução: respostas futuras podem mudar, expirar ou falhar e continuarão sujeitas aos eventos do player. A origem Fenix foi adicionada à lista de mídia do perfil. O adaptador também permite mapas de tipos MP4/WebM/HLS para endpoints explícitos sem extensão, preservando o endpoint HLS Zunder já verificado. Não se adivinha formato de qualquer URL desconhecida.

A separação de format/reportFormat foi mantida. Causas de rejeição agora distinguem cabeçalhos especiais exigidos (inclusive nomes dos campos), modalidades externas/DRM, origem bloqueada e formato não identificado. notWebReady permanece visível como declaração do addon. notWebReady=true não é, por si só, motivo para rejeitar HLS suportado pelo Nocta.

## Cinco títulos consultados

Manifesto configurado já existente: qualidades 4k/1080p/720p/sd, dublado e legendado. Séries foram consultadas em **temporada 1, episódio 1**. Todos os GETs retornaram HTTP 200. Resultados são pontuais e podem variar por episódio, configuração e disponibilidade do serviço.

| Título / IMDb | Fontes | Classificação e teste |
| --- | ---: | --- |
| Black Clover / tt7441658 | 5 | 2 Rubeo HLS candidatos; dublado reproduzido e legendado não testado. 3 Arthur HLS recusados por proxyHeaders/User-Agent; nativo não verificado. |
| Os Simpsons / tt0096697 | 2 | Badger MP4 reproduzido; Zunder HLS falhou com CORS observado no console e manifestLoadError. |
| Barbie (2023) / tt1517268 | 0 | Resposta streams vazia. Nenhuma fonte testada ou inventada. |
| Apenas um Show / tt1710308 | 0 | T1/E1 sem fontes nesta consulta; não prova ausência da série inteira. |
| Dr. House / tt0412142 | 0 | T1/E1 sem fontes nesta consulta; não prova ausência da série inteira. |

Não foram recebidos WebM, torrents ou embeds nesses resultados. WebM já era suportado por extensão; o suporte adicional nesta etapa é a identificação por mapa de endpoint revisado, coberta por teste, sem alegar reprodução WebM externa.

## Reprodução executada

Microsoft Edge, aplicativo servido em http://127.0.0.1:5176/configuracoes, políticas normais do navegador:

- Rubeo/Black Clover dublado: tempo 2,016s, largura 853px e 38.444 bytes de áudio decodificados. A tela mudou de Compatível, mas não testada para Reproduzível e testada.
- Badger/Os Simpsons: tempo 2,019s, largura 1280px e 52.554 bytes de áudio decodificados. A tela registrou sucesso real. A reprodução não dependeu de CORS ser desativado.
- Zunder/Os Simpsons: erro fatal HLS `networkError: manifestLoadError`; o console do browser registrou erro CORS. A tela mudou para Reprodução falhou. Isso é uma falha de carregamento de uma fonte candidata HLS, não prova de codec incompatível.
- Após essa falha, o teste selecionou Badger novamente e confirmou recuperação com relógio avançando. Reescolher a mesma fonte também remonta a sessão para permitir uma nova tentativa.
- Regressão autorizada: o servidor CC0 e as mídias já existentes foram reutilizados. O teste de browser confirmou MP4, HLS, faixa por/eng e episódio sintético, com relógio avançando e nenhum erro JavaScript. Não foram criados novos vídeos ou servidores de demonstração.

Evidências locais: `.cache/fenix-alternatives/sources.json`, `browser.json` e `browser.png`. O JSON de fontes contém URLs transitórias e permanece fora do Git. Não copie links opacos para documentação pública. Os logs do navegador registram somente estados/métricas, sem URLs de vídeo.

## Estados e diagnóstico por fonte

`sourceDiagnostics.ts` define os seis estados solicitados: testada, compatível não testada, falhou, incompatível web, somente nativo comprovado e indisponível nesta configuração. Cada linha da tela experimental mostra modalidade, qualidade, áudio declarado, notWebReady, situação web/nativa, motivo e resultado.

- Resposta da API ou loadedmetadata não marca sucesso.
- O evento playing também não basta: são exigidos updates com o elemento reproduzindo, pronto, fora de seek e com avanço efetivo do relógio. Saltos grandes de seek não são tratados como avanço normal.
- Falhas HTML5 e erros fatais HLS atualizam somente a fonte correspondente, sem apagar as demais.
- As verificações ficam na memória da consulta atual e são reiniciadas ao trocar título/perfil/configuração. Não alteram favoritos ou o histórico público.
- Modalidades externas/torrents desconhecidos continuam recusadas. Fontes com proxyHeaders continuam sem URL de reprodução liberada, com explicação específica.
- Nativo aparece como não testado em todas as fontes desta entrega. O valor somente nativo não é atribuído por hipótese.

## Android e Media3

Foi avaliada a documentação de [formatos do Media3 ExoPlayer](https://developer.android.com/media/media3/exoplayer/supported-formats), distinguindo container, codec e transporte. Como o MP4 Badger H.264/AAC já funcionou no HTML5, não foi necessário adicionar um módulo nativo, dependências Android ou permissões. FFmpeg decodificar um fluxo não prova que o Media3/WebView de um aparelho o reproduza.

Não houve teste Android, emulador, build nativo ou instalação nesta etapa. A cadeia Badger inclui HTTP; um aplicativo servido em HTTPS ou uma política WebView pode ter comportamento diferente do Vite HTTP local. Não foram relaxadas políticas de cleartext, TLS ou origem para testar. Não foi marcada nenhuma fonte como exclusivamente nativa.

A [definição oficial Stremio de stream](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html) descreve notWebReady e proxyHeaders como hints/comportamento do cliente, não garantia de codec/licença ou obrigação de ignorar restrições do navegador.

## Repetir no Windows

Terminal de desenvolvimento:

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
$env:VITE_ENABLE_STREMIO_EXPERIMENT='true'
npm run dev -- --port 5176
```

Abra http://127.0.0.1:5176/configuracoes, habilite o experimento, selecione fenixflix-diagnostics e Série. Use tt0096697, T1/E1 e clique Reproduzir mp4 na linha Badger. Para testar alternativa, selecione Zunder e depois Badger; cada linha conserva seu próprio resultado durante a consulta. Use tt7441658 para Rubeo.

Consultas reais e browser:

```powershell
node scripts/fenix/alternatives-probe.mjs
node scripts/fenix/alternatives-browser.mjs
```

Os scripts badger-http.mjs e badger-payload.mjs reproduzem o diagnóstico de redirects/assinatura, com hosts explícitos, e dependem do último sources.json. Não desative validação de certificado ou políticas de origem.

Testes automatizados e build:

```powershell
npm test -- --maxWorkers=1 src/test/source-diagnostics.test.ts src/test/stremio-adapter.test.ts src/test/playback-library.test.tsx src/test/episode-navigation.test.tsx
npm run build
```

Resultado executado: **47 testes aprovados**, quatro suítes; TypeScript e Vite aprovados. Permanece o aviso anterior de tamanho do chunk HLS, sem erro de build. O teste CC0 de reprodução também foi executado separadamente com sucesso.

## Arquivos

- src/experimental/StremioAddonAdapter.ts: classificação de endpoints/redirecionamentos revisados e razões específicas.
- src/experimental/sourceDiagnostics.ts: estados e transições por fonte.
- src/config/stremioServices.ts: regra Badger e origem inicial explícita; Rubeo/Zunder preservados.
- src/pages/StremioExperiment.tsx: diagnóstico textual por fonte e nova tentativa/seleção de alternativa.
- src/components/VideoPlayer.tsx: callbacks opcionais de resultado; controles existentes preservados.
- src/hooks/useAudioPlayback.ts: propagação do erro fatal HLS com tipo/detalhe/status HTTP quando exposto.
- src/test/source-diagnostics.test.ts: seis casos novos para estados, rejeições, redirecionamentos e identificação de tipos.
- scripts/fenix/alternatives-probe.mjs, alternatives-browser.mjs, badger-http.mjs e badger-payload.mjs: verificações reais.
- docs/NOCTA_BADGER.md: este relatório.

Home, catálogo, recomendações, EmbedMovies, favoritos e a interface principal não foram modificados. Não foi instalado outro player.
