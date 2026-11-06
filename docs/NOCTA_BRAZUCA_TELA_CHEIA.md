# Nocta — Diagnóstico da Brazuca e tela cheia Android

Investigação de 5 de novembro de 2026. A [auditoria anterior](NOCTA_AUDITORIA_DESCOBERTA_FALLBACK.md) comprovou o HTTP 404 no Media3 após leituras HLS bem-sucedidas. Esta rodada localizou os recursos afetados por consulta HTTP direta e acrescentou hashes de diagnóstico ao APK debug.

## Manifestos e consultas

- Brazuca Play `org.brazucaplay.stremio` **2.1.5**. O Nocta usa a raiz pública `https://brazuca-play-stremio.vercel.app/manifest.json`. HTTP 200, recursos `catalog`, `meta` e `stream`, prefixos `bp_` e `tt`. O fluxo em questão usa IMDb com prefixo `tt`. As origens configuradas para mídia web e nativa estão em `automaticAddonConfigs` em `src/playback/providers.ts`.
- FenixFlix `com.fenixflix` **1.2.9**. HTTP 200, recursos `stream` e `catalog`. O manifesto configurado em `src/config/stremioServices.ts` é `https://fenixflix.fenixhub.online/qualities=4k,1080p,720p,sd%7Caudio=dublado,legendado%7Ccatalogs=populares_movie,populares_series,recentes_movie,recentes_series/manifest.json`. O adaptador preserva esse prefixo de configuração na consulta de streams. O rastreamento direto de mídia desta rodada foi restrito à Brazuca.

| Título | Recurso Brazuca, GET após a origem do manifesto | Resultado | SHA-256 dos masters HLS, prefixos |
| --- | --- | --- | --- |
| The Flash (2014) T1/E3 | `/stream/series/tt3107288%3A1%3A3.json` | HTTP 200, 2 fontes em 1,655 s | `37118f369f92` / `a76ea3c65fd8` |
| Rio (2011) | `/stream/movie/tt1436562.json` | HTTP 200, 2 fontes em 1,725 s | `683cdcd48c0c` / `38d2339e342b` |
| Superman (2025) | `/stream/movie/tt5950044.json` | HTTP 200, 2 fontes em 1,793 s | `319345f4ed1b` / `eb062ce79251` |
| Os Simpsons T1/E1 | `/stream/series/tt0096697%3A1%3A1.json` | HTTP 200, 2 fontes em 1,755 s | `35ecf9c25a3b` / `5b29f5ad0126` |

Os oito masters são distintos. A ordem em cada linha é Dublado e Dual/Leg. As duas versões do mesmo título compartilham a playlist de qualidade de vídeo e uma playlist de áudio. Dual/Leg declara uma segunda playlist de áudio. As fontes contêm `name`, `description`, `url`, `behaviorHints` e `subtitles`. As oito declaram `notWebReady: false`; nenhuma declara `proxyHeaders` de requisição ou resposta. O adaptador de produção aceitou as oito como candidatas ao Media3 com o mesmo hash de URL anunciado e MIME `application/vnd.apple.mpegurl`, com zero cabeçalhos fornecidos pelo complemento. O Media3 configura os cabeçalhos HTTP normais da biblioteca e usa a preferência de áudio ou legenda separadamente. A declaração de prontidão é uma indicação de modalidade. [Contrato de streams do Stremio](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html).

## Caminho confirmado do HTTP 404

Os oito masters, as quatro playlists de qualidade compartilhadas e as playlists de áudio responderam **200** com conteúdo HLS. As URLs extraídas de `EXT-X-MAP` e dos primeiros segmentos das playlists de vídeo e áudio devolveram **404** na mesma origem, em GETs independentes do Media3. A requisição de prova foi encerrada após a resposta do recurso. A auditoria não baixou a obra.

| Título | Playlist de qualidade 200 | Init de vídeo 404 | Primeiro segmento de vídeo 404 | Init de áudio 404, dublado / adicional | Primeiro segmento de áudio 404, dublado / adicional |
| --- | --- | --- | --- | --- | --- |
| Flash | `7da1d44922f2` | `9b67118f5aa8` | `143aee8676a3` | `782a47cf4eb0` / `9f15aa9dfdbc` | `e3a62c707fbf` / `56ac24ddb353` |
| Rio | `c72e5ed45186` | `d79e9a03bf03` | `4aacf1fdb554` | `b130173dc059` / `dae03d2b6a29` | `8835df6a1b8b` / `d5c38ad2dfec` |
| Superman | `13a7c6cdd39f` | `7c1a7a1c3ec2` | `16327c58ecba` | `7461547605e6` / `5e677b476dbd` | `95e8f896b797` / `0ddae3ed071ee` |
| Os Simpsons | `e4bb05a1ad24` | `23e21ebfe74e` | `c98318fca407` | `96fa2eeada9b` / `654c514c8e79` | `bf152b7e52c6` / `305b99e83831` |

O 404 foi recebido do servidor de mídia antes de haver conteúdo suficiente para decodificação. A primeira repetição no Samsung confirmou as oito falhas com `ERROR_CODE_IO_BAD_HTTP_STATUS` (**2004**). A captura inicial registrava o hash da tarefa HLS, que pode identificar o segmento mesmo quando o erro veio de um init carregado nessa tarefa. O APK final registra separadamente o hash da requisição HTTP presente na exceção. Assim, uma próxima falha pode ser atribuída diretamente ao recurso. Nenhum defeito de adaptação ou configuração de cabeçalhos ficou demonstrado para essas oito fontes. O incremento mantém a política de transporte e fallback atuais.

### O que mudou na resposta do fornecedor

Na rodada iniciada às **15h49** no Samsung, a primeira opção Brazuca de cada título reproduziu sem erro terminal. Em todos os casos, o Media3 registrou quadro renderizado, áudio avançando e progresso. Os quatro masters da opção dublada tinham os mesmos hashes da rodada com 404. O teste também confirmou a primeira opção Brazuca de Um Trabalho do Inferno T1/E1, às 2,563 s da sessão.

| Título | Tempo de sessão até a prova | Posição observada |
| --- | --- | --- |
| Flash T1/E3 | 3,062 s | 1,352 s |
| Rio | 1,567 s | 14,392 s, com retomada |
| Superman | 3,059 s | 1,500 s |
| Os Simpsons T1/E1 | 2,553 s | 47,555 s, com retomada |

A repetição HTTP iniciada às **15h52** encontrou os mesmos oito masters, com os filhos `EXT-X-MAP` e os segmentos apontando para outras origens. Na rodada anterior, os filhos apontavam para a própria origem do addon, que devolveu 404. O diagnóstico direto parou nas novas origens, fora da lista de origens usada pelo roteiro. Para Flash, os segmentos novos `d250ccd5a9a1` (vídeo) e `172445b5e025` (áudio) coincidem com carregamentos concluídos no Media3. Para Superman, a mesma correspondência apareceu em `4b4e7d1b9709` (vídeo) e `e116e8099efa` (áudio). Rio e Os Simpsons retomaram posições intermediárias; a verificação direta amostrou o primeiro segmento de cada playlist.

O sucesso da última rodada decorreu de uma resposta de mídia diferente, sem alteração no adaptador. A razão interna dos 404 e a durabilidade da recuperação continuam indeterminadas. A opção Dual/Leg só teve a descoberta e as playlists reconferidas após a mudança. Para atribuir a diferença ao Stremio seriam necessários o mesmo manifesto instalado, ID, horário e hashes dos recursos carregados por esse cliente. O relato de reprodução no Stremio não veio acompanhado dessa captura.

## Tela cheia

- `PlayerImmersiveMode` usa `WindowInsetsControllerCompat` para ocultar as duas barras de sistema e permitir que gestos na borda as revelem temporariamente. Ao sair, fechar ou destruir o player, o controlador restaura a política da janela. A orientação acompanha a rotação do aparelho. [API de modo imersivo do Android](https://developer.android.com/develop/ui/views/layout/immersive).
- `NoctaNativePlayerPlugin` aplica **Ajustar** com `RESIZE_MODE_FIT` e **Preencher** com `RESIZE_MODE_ZOOM`. Preencher recorta as bordas conforme a proporção da tela. Os controles comuns ficam fora da tela cheia e a área de vídeo usa fundo preto. Em modo inline, a superfície fica sobre o banner e usa Ajustar.
- `MainActivity` aplica o modo imersivo ao fullscreen fornecido pelo WebView. `VideoPlayer` acompanha `fullscreenchange` e troca entre `object-fit: contain` e `object-fit: cover`. Ao retornar ao modo inline, a imagem volta a Ajustar e o banner permanece atrás do vídeo quando há espaço livre.

## Validação e entrega

- **Samsung SM-S911B, Media3**. A janela imersiva mediu **1080 × 2340** em retrato e **2340 × 1080** em paisagem. Ambas as barras ficaram ocultas. Ajustar manteve o quadro inteiro, com faixas laterais em paisagem. Preencher ocupou a área toda. A tecla Voltar restaurou as duas barras, manteve a rota e preservou a sessão, com uma única carga. A captura de Preencher em paisagem foi feita durante a animação de rotação; os eventos da superfície registraram o tamanho completo.
- **Samsung, reprodução controlada**. MP4 no WebView e MP4/HLS no Media3 reproduziram. O teste de rolagem do MP4 nativo moveu a superfície sem recarregar o vídeo. A conexão USB caiu antes dos testes complementares de fechamento direto e fullscreen do WebView no aparelho. O gesto de revelar as barras também ficou sem verificação física separada.
- **Edge, HTML5**. Tela cheia validada com MP4 controlado, fundo preto, modos Ajustar e Preencher, controles de fontes ocultos e restauração da proporção e do banner ao sair.
- **Vitest**. 252 testes passaram, uma integração opcional foi ignorada. Os testes existentes do adaptador e das modalidades nativas passaram. Badger, Rubeo, Arthur e Malfoy não foram repetidos individualmente com fontes externas.
- **Build Android**. TypeScript, Vite, sync Capacitor e Gradle concluídos. APK debug final instalado por USB. SHA-256 `d89ac31d3180a740256e44b5bd59090a66b01b3023a4ecced4fc86ddc8187090`.

Arquivos de produção alterados incluem `PlayerImmersiveMode.java`, `MainActivity.java` e `NoctaNativePlayerPlugin.java` em `android/app/src/main/java/app/nocta/prototype`, além de `src/components/VideoPlayer.tsx`, `src/playback/AutomaticWatch.tsx` e `src/styles.css`. Testes e roteiros incluem `src/test/automatic-watch.test.tsx`, `src/test/web-player-controls.test.tsx` e `scripts/player/{flow-ui-check,recovery-check,recovery-live-check}.mjs`.

Evidências em `.cache/nocta-imersivo` incluem `brazuca-http-falha.json`, `brazuca-http-rotas.json`, `device-live.log`, `live.json`, `device-immersive-final.log`, `controlled.json`, `browser-ui.json`, `tests.log` e `android-build-final.log`. Os dados de mídia foram registrados por hash, sem links completos ou valores de cabeçalhos.

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
npm.cmd test
npm.cmd run android:build
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```

Com o Nocta aberto no Samsung, é possível repetir os testes físicos com o clipe controlado e os quatro IDs auditados.

```powershell
$env:NOCTA_CHECK_DIRECTORY='.cache/nocta-imersivo-repeticao'
node scripts/player/recovery-check.mjs --immersive --scroll
node scripts/player/recovery-live-check.mjs --case=tmdb-tv-60735:1:3 --case=tmdb-movie-46195 --case=tmdb-movie-1061474 --case=tmdb-tv-456:1:1
```
