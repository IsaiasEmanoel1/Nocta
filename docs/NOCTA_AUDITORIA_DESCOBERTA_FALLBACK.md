# Nocta — Auditoria de descoberta e fallback

Investigação de 5 de novembro de 2026. O TMDB identificou as obras e os episódios. A disponibilidade foi investigada separadamente nas rotas de protocolo dos dois complementos já configurados no Nocta.

## Correções anteriores

| Caso | Alteração concreta | Evidência anterior |
| --- | --- | --- |
| Barbie Butterfly e a Princesa Fairy (2013) | Confirmada a correspondência de filme TMDB **196254** e IMDb **tt2946582**. O teste em `src/test/playback-coordinator.test.ts` verifica que `BrazucaPlayProvider.find` usa `stream/movie/tt2946582.json` e mantém as duas candidatas HLS no navegador e no Android. O caminho de produção usa o mesmo `addonTitle` e o mesmo adaptador de qualquer filme. | A opção Brazuca dublada deu HTTP 404 na tentativa de mídia. O fallback Fenix chegou a renderizar imagem, avançar áudio e progredir no Samsung naquela rodada. [Relatório anterior](NOCTA_PLAYER_FLUXO_CACHE.md). |
| Um Trabalho do Inferno T1/E1 | Confirmada a série TMDB **289517**, IMDb **tt36458668** e o episódio TMDB **6154166**. O perfil Fenix em `src/config/stremioServices.ts` passou a permitir a origem HTTPS `embedplayer2.xyz` em `mediaOrigins` e `nativeOrigins`. Em `NoctaNativePlayerPlugin.java`, a lista `HOSTS` passou a incluir esse host e `load` passou a configurar 15 s de leitura para ele. O teste verifica a rota exata e o bloqueio de alternativas HTTP ou opacas. | O master HLS daquela origem levou 10,556 s numa leitura. No Samsung, essa fonte Fenix renderizou em 4,480 s, avançou áudio em 4,821 s e confirmou progresso em 6,085 s. Uma consulta Brazuca posterior expirou sem iniciar mídia. [Relatório anterior](NOCTA_PLAYER_ALTURA_SERVIDORES.md). |

O fluxo normal de catálogo e reprodução não contém exceção por nome, IMDb ou TMDB ID para esses títulos nem para os demais casos auditados. Os IDs concretos ocorrem em testes e roteiros. A página experimental `StremioExperiment.tsx` inicializa seu campo editável com o ID do vídeo de teste `tt1254207`; esse valor pertence ao diagnóstico. Os tratamentos por origem, formato e cabeçalhos continuam aplicados ao transporte de qualquer título.

## Identidade e consultas reais

`catalog.ts` lê o IMDb dos metadados do TMDB. `AutomaticWatch.tsx` valida que o episódio selecionado consta na temporada antes de disparar as consultas. `addonTitle` em `providers.ts` prefere o IMDb, e `StremioAddonAdapter.identifier` acrescenta temporada e episódio para séries. O adaptador preserva o caminho do manifesto configurado. A estrutura da rota segue o [protocolo Stremio](https://stremio.github.io/stremio-addon-sdk/protocol.html).

Os GETs de **The Flash (2014) T1/E3** usaram `tt3107288:1:3` nos dois complementos. O TMDB confirmou a série **60735** e o episódio **1005651**, «O Que Não dá Para Ultrapassar». O Fenix recebeu `/qualities=4k,1080p,720p,sd%7Caudio=dublado,legendado%7Ccatalogs=populares_movie,populares_series,recentes_movie,recentes_series/stream/series/tt3107288%3A1%3A3.json` em `fenixflix.fenixhub.online`. O Brazuca recebeu `/stream/series/tt3107288%3A1%3A3.json` em `brazuca-play-stremio.vercel.app`. Cada consulta começou pela leitura do manifesto correspondente, Fenix 1.2.9 e Brazuca 2.1.5.

O usuário relatou fontes no Stremio e confirmou Superman de 2025 e Os Simpsons T1/E1 para a comparação. O Samsung consultado por ADB não listou o Stremio. Não há captura do outro cliente com a configuração do complemento, URL do recurso, horário e fonte escolhida. A comparação usa a mesma obra e episódio informados, com parâmetros observados no Nocta. O complemento e a fonte que o Stremio mostrou, os filtros de cada instalação e a reprodução naquele cliente continuam sem confirmação independente.

### Respostas diretas e filtragem

Os tempos incluem manifesto e resposta de streams. As respostas desta rodada receberam HTTP 200. A auditoria deu às requisições individuais tempo suficiente para distinguir uma lista vazia de uma requisição interrompida e reaplicou o adaptador e o filtro de produção às mesmas respostas em memória. Em cada linha Brazuca, as duas opções eram HLS, `Dublado` e `Dual/Leg`, ambas candidatas web e Media3; zero descartes em todas as seis respostas. O rótulo de áudio é declarado pelo fornecedor.

| Obra e identificação TMDB | Recurso após a base do manifesto | FenixFlix | Brazuca |
| --- | --- | --- | --- |
| Flash (2014) T1/E3, 60735 / ep. 1005651 | `stream/series/tt3107288%3A1%3A3.json` | 0 retornadas, 0 descartadas, **6,913 s** | 2 retornadas, 2 candidatas, **1,954 s** |
| Rio (2011), 46195 | `stream/movie/tt1436562.json` | 0 retornadas, 0 descartadas, **7,091 s** | 2 retornadas, 2 candidatas, **5,594 s** |
| Superman (2025), 1061474 | `stream/movie/tt5950044.json` | 0 retornadas, 0 descartadas, **0,297 s** | 2 retornadas, 2 candidatas, **1,788 s** |
| Os Simpsons T1/E1, 456 / ep. 62228 | `stream/series/tt0096697%3A1%3A1.json` | 0 retornadas, 0 descartadas, **6,845 s** | 2 retornadas, 2 candidatas, **1,592 s** |
| Barbie (2013), 196254 | `stream/movie/tt2946582.json` | 0 retornadas, 0 descartadas, **7,027 s** | 2 retornadas, 2 candidatas, **1,889 s** |
| Um Trabalho do Inferno T1/E1, 289517 / ep. 6154166 | `stream/series/tt36458668%3A1%3A1.json` | 1 retornada, **1 descartada**, **0,344 s**. MP4 anunciado em origem HTTP fora do perfil. | 2 retornadas, 2 candidatas, **2,125 s** |

O Fenix retornou outra lista para Um Trabalho do Inferno nesta rodada. A fonte HTTPS que havia reproduzido anteriormente não veio nessa resposta. A política HTTPS rejeitou a opção HTTP desta consulta antes de iniciar mídia. Os quatro retornos Fenix acima de 6,5 s demonstram que o limite anterior podia interromper até uma resposta válida de lista vazia. Esses tempos, sozinhos, não explicam as fontes que o usuário viu no Stremio.

## Ajustes no Nocta

- `PlaybackCoordinator.lookup` agora permite **9 s** por descoberta, com a janela inicial de **2,2 s** para prioridade do Fenix preservada. Uma Brazuca elegível ainda pode começar enquanto o Fenix responde. O retorno de fundo não interrompe o vídeo em andamento. O limite de inicialização do player permanece **45 s**.
- `PlaybackCoordinator.advance` percorre os transportes distintos e elegíveis do idioma escolhido antes do iframe. O teto anterior de duas fontes por fornecedor podia abandonar a terceira sem tentativa. A falha fica no ID da fonte e o resultado da consulta continua disponível. Quando resta uma versão em outro idioma, o app apresenta a opção para o usuário escolher. A seleção manual de servidor continua disponível. Links envelhecidos têm uma renovação automática por fornecedor e o mesmo transporte não é repetido automaticamente.
- `PlayerStage`, `AutomaticWatch`, `styles.css` e o contêiner nativo removem a transparência durante a exibição. A imagem do título aparece na seleção e no carregamento. A área de vídeo e as faixas de ajuste são pretas durante a reprodução, com `object-fit: contain` no HTML5 e `RESIZE_MODE_FIT` no Media3. A imagem conserva sua proporção. O iframe continua isolado e seu carregamento de documento segue sem confirmar reprodução.
- `catalog.ts` deixou de emitir o aviso «Filmes e séries são combinados…» na exploração da Busca. As consultas e os avisos de falha continuam disponíveis.

Um **timeout de consulta** acontece antes da entrega da fonte, com o orçamento de descoberta esgotado. Uma **fonte descartada** veio na resposta, mas não atende aos critérios de política, modalidade ou compatibilidade. Um **timeout de inicialização** acontece em uma sessão de mídia iniciada que não alcança progresso de reprodução dentro do orçamento. Um HTTP 404 durante uma sessão HLS é um erro de carregamento de recurso de mídia. Cada evento é atribuído à respectiva fase.

## Validação no Samsung SM-S911B

APK debug atualizado instalado por USB. A rota normal `/assistir` usou o Media3 existente. Os tempos de descoberta abaixo medem apenas o GET do recurso de streams no WebView, depois de ler o manifesto. Em Flash, Rio, Superman e Os Simpsons, a primeira tentativa foi dublada e o teste confirmou a segunda pelo botão **Tentar legendado**. Os IDs de tentativa com sufixos `:0` e `:1` são posições das fontes no retorno do complemento, separadas do IMDb e do número do episódio.

| Obra | Descoberta no aparelho | Tentativas e resultado |
| --- | --- | --- |
| Flash T1/E3 | Fenix 0 em 7,320 s. Brazuca 2 em 1,794 s. | Brazuca `:0` falhou em 5,742 s e `:1` em 5,750 s, ambas com HTTP 404 no Media3. Depois das duas, abriu o iframe alternativo. |
| Rio | Fenix 0 em 6,764 s. Brazuca 2 em 1,170 s. | Brazuca `:0` falhou em 4,750 s e `:1` em 5,508 s, ambas com HTTP 404. Iframe montado após as duas. |
| Superman (2025) | Fenix 0 em 6,692 s. Brazuca 2 em 1,711 s. | Brazuca `:0` falhou em 5,309 s e `:1` em 5,298 s, ambas com HTTP 404. Iframe montado após as duas. |
| Os Simpsons T1/E1 | Fenix 0 em 6,690 s. Brazuca 2 em 1,690 s. | Brazuca `:0` falhou em 4,893 s e `:1` em 5,440 s, ambas com HTTP 404. Iframe montado após as duas. |
| Barbie (2013) | Fenix 0 em 6,683 s. GET do Brazuca abortado após 8,987 s, junto ao fim do orçamento de descoberta. | Nenhuma tentativa de mídia direta nessa rodada. O iframe alternativo abriu. O 404 Brazuca e a reprodução Fenix da investigação anterior pertencem a outra rodada. |
| Um Trabalho do Inferno T1/E1 | Fenix 3 em 0,026 s. Brazuca 2 em 2,249 s. | Fenix `fenixflix:tt36458668:1:1:0` iniciou no Media3. Aos 4,871 s havia frame renderizado e áudio avançando. Aos 6,071 s a posição era 1,432 s, com ambos ativos. Brazuca ficou sem tentativa, pois a primeira fonte reproduziu. |

Para Flash, Rio, Superman e Os Simpsons, o erro terminal foi `ERROR_CODE_IO_BAD_HTTP_STATUS`, código **2004**, causa `InvalidResponseCodeException`, status **404**. Houve carregamentos HLS anteriores com bytes recebidos, sem frame nem avanço de áudio antes do erro. O log registra a etapa de abertura HTTP, mas não identifica se o 404 veio de segmento, faixa ou outro recurso filho. A seleção de HLS foi aceita e a falha ocorreu durante o carregamento de mídia. A causa interna do 404 no serviço continua indeterminada. Nenhuma dessas oito tentativas atingiu o limite de 45 s.

Para Um Trabalho do Inferno, a resposta no Samsung diferiu da consulta direta do Windows. O roteiro no aparelho registrou contagem e fonte selecionada, sem classificar individualmente as outras linhas dessa resposta. O descarte HTTP da tabela anterior corresponde apenas à consulta direta em que veio uma linha. O teste físico provou reprodução da primeira linha recebida pelo aparelho. A confirmação usou eventos de renderização e áudio do Media3. O idioma falado não foi verificado por escuta. A montagem dos iframes nos outros casos não comprova reprodução pelo EmbedMovies.

## Testes e arquivos

- **Vitest** passou com 251 testes e 1 integração opcional ignorada. As regressões novas cobrem terceira fonte, duplicata entre complementos, escolha explícita de idioma, resposta tardia e retirada do banner durante o vídeo.
- **TypeScript, Vite, sync Capacitor e Gradle** concluíram o APK debug. O build web emitiu o aviso existente de tamanho de chunk. O APK foi instalado no Samsung. SHA-256 do arquivo local `293486dc94853e15ccb07bdcb6f0dd1a3077645ebf51784b338256d9f5fa907d`.
- **Edge** confirmou a área preta e o enquadramento proporcional com mídia controlada, a apresentação do aviso de demora sem fallback prematuro e a remoção da frase na Busca com resultados reais do TMDB. O retorno do player manteve a pesquisa.
- **Samsung** confirmou reprodução de MP4 no WebView e de MP4/HLS no Media3 com os clipes controlados existentes. A captura HLS mostra o quadro inteiro com faixas pretas e controles acessíveis. O scroll moveu a superfície sem reiniciar o player. O menu de servidores abriu sem nova consulta. O dump de acessibilidade emitiu avisos de ociosidade, mas as ações e os eventos do menu foram confirmados. A validação visual foi em retrato.

Arquivos de produção alterados: `src/playback/coordinator.ts`, `src/playback/AutomaticWatch.tsx`, `src/playback/PlayerStage.tsx`, `src/styles.css`, `src/services/catalog.ts` e `android/app/src/main/java/app/nocta/prototype/NoctaNativePlayerPlugin.java`. Testes e roteiros alterados: `src/test/playback-coordinator.test.ts`, `src/test/automatic-watch.test.tsx`, `scripts/player/recovery-live-check.mjs` e `scripts/player/flow-ui-check.mjs`.

Evidências locais em `.cache/player-auditoria` incluem `probe.json` com rotas públicas, contagem e filtragem, `live.json` com tentativas e eventos do Samsung, `controlled.json`, `controlled-hls-frame.png`, `browser-ui.json`, `tests-final.log` e `android-build-final.log`. Os registros omitem URLs de mídia, valores de cabeçalhos e credenciais.

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
npm.cmd test
npm.cmd run android:build
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```

Com o Nocta aberto no Samsung e a depuração USB autorizada, este comando repete as consultas e tentativas com os mesmos IDs. Os complementos podem responder com listas diferentes.

```powershell
$env:NOCTA_CHECK_DIRECTORY='.cache/player-auditoria-repeticao'
node scripts/player/recovery-live-check.mjs --case=tmdb-tv-60735:1:3 --case=tmdb-movie-46195 --case=tmdb-movie-1061474 --case=tmdb-tv-456:1:1 --case=tmdb-movie-196254 --case=tmdb-tv-289517:1:1
```
