# Nocta — Estabilidade de reprodução e ajustes do player

Investigação de 5 de novembro de 2026. O incremento mantém o fluxo FenixFlix → Brazuca → EmbedMovies e parte da [auditoria de mídia e tela cheia](NOCTA_BRAZUCA_TELA_CHEIA.md).

## Um Trabalho do Inferno T1/E1

O TMDB confirmou a série **289517**, IMDb **tt36458668**, e o episódio **6154166**, «Regras da loja de conveniência». Os dois complementos receberam `stream/series/tt36458668%3A1%3A1.json` após suas respectivas bases. FenixFlix 1.2.9 recebeu a consulta com o manifesto configurado para qualidades 4K a SD e áudio dublado e legendado. Brazuca 2.1.5 recebeu a consulta na base do manifesto público. Os manifestos exatos e os hashes estão nas capturas.

| Rodada sem cache HTTP local para streams | FenixFlix | Brazuca |
| --- | --- | --- |
| 1 | HTTP 200, 2 fontes em 159 ms, 0 elegíveis | HTTP 200, 2 fontes em 1.788 ms, 2 elegíveis |
| 2 | HTTP 200, 2 fontes em 328 ms, 0 elegíveis | HTTP 200, 2 fontes em 1.175 ms, 2 elegíveis |
| 3 | HTTP 200, 2 fontes em 149 ms, 0 elegíveis | HTTP 200, 2 fontes em 1.166 ms, 2 elegíveis |

Os hashes das fontes anunciadas repetiram nas três consultas. Cada rodada solicitou a lista novamente, sem reutilizar uma URL de sessão anterior como fonte de verdade.

| Fonte anunciada | Formato e idioma declarado | Decisão do Nocta |
| --- | --- | --- |
| Fenix Hometown | MP4 1080p, dublado, origem HTTP, sem cabeçalhos especiais | Bloqueada antes de abrir mídia. O rótulo recebido foi «Contos de The Walking Dead · T01 EP01». A obra anunciada não corresponde à obra solicitada. O conteúdo do MP4 permanece sem confirmação. |
| Fenix Netwix | URL opaca, legendado, declara `Referer` e `User-Agent` | Sem formato e transporte autorizados para o Media3 neste perfil. O player web não aplica os cabeçalhos exigidos. A linha descreve a série e o episódio solicitados, sem prova de mídia. |
| Brazuca Watchug Dublado | HLS, FHD, PT-BR declarado, sem cabeçalhos especiais | Candidata web e Media3. Master `bc33f7c086c9`. |
| Brazuca Watchug Dual/Leg | HLS, FHD, dual/legendado declarado, sem cabeçalhos especiais | Candidata web e Media3. Master `ca73b275e50d`. |

Os masters e as playlists de qualidade e áudio da Brazuca responderam **200**. Os filhos de inicialização e de segmentos apontavam para uma origem fora da lista usada pelo diagnóstico HTTP, que parou antes de consultá-la. Os hashes dos primeiros segmentos dublados, vídeo `d70c2f170c53` e áudio `66a6962d6d65`, já apareceram como carregados pelo Media3 na auditoria anterior. Essa comparação histórica confirma a rota, mas o 200 da playlist e a captura passada não provam que a mídia continuava reproduzível na nova rodada.

A fonte HTTPS Hollymovies que havia reproduzido em outra rodada não foi anunciada nas três respostas. A ausência de candidatos Fenix está explicada pela composição das listas observadas. O relato de que o episódio voltou a falhar não contém um log do aparelho para identificar se a Brazuca falhou em playlist, inicialização, segmento ou decodificação naquela tentativa específica.

### Comparação com o Stremio

Para comparar a mesma fonte faltam a configuração exata do manifesto instalado, a versão do complemento, o ID consultado, o horário e os hashes do master e dos recursos efetivamente carregados pelo Stremio. Um manifesto diferente, listas variáveis e diferenças de transporte podem explicar a divergência. A única discrepância de identidade comprovada nesta rodada é o texto Hometown referente a outra obra. Nenhuma exceção por título, IMDb, TMDB ou servidor foi adicionada.

## Mudanças gerais

- A descoberta de streams desativa o cache HTTP local. O orçamento atual de consulta, a política de origens, a validação de episódios e a prioridade dos fornecedores permanecem.
- Após falha terminal de rede, o coordenador tenta primeiro os transportes distintos já elegíveis no idioma escolhido. Se o caminho direto se esgotar, consulta de novo o fornecedor afetado uma vez por sessão, compartilhando o limite com a renovação de listas antigas. Uma URL diferente passa pela mesma validação. O mesmo master HLS pode ser tentado mais uma vez se voltar numa resposta nova e não houver outra fonte inédita no idioma. Isso cobre playlists que mantêm endereço e mudam os segmentos. MP4 idêntico não é repetido automaticamente por essa regra.
- A revalidação preserva posição e idioma. Buffering recuperável não dispara troca. Erros de codec, política e renderização seguem a seleção normal, sem nova descoberta automática por essa regra. Falhas continuam associadas à fonte e à sessão. Ao retomar pelo menu, a identidade do transporte substitui a posição antiga na lista como referência.
- Tela cheia aciona `RESIZE_MODE_ZOOM` no Media3 e `object-fit: cover` no HTML5. As opções manuais de enquadramento saíram. O quadro inteiro retorna no modo inline, com o banner atrás. O modo imersivo continua ocultando as barras do sistema e restaurando a janela na saída.
- O sombreado dos controles ficou mais leve em HTML5 e Media3. O temporizador de três segundos durante a reprodução continua ativo, preservando foco de teclado e controles de áudio, legendas, progresso e fullscreen.
- O painel mostra **Em exibição · Tn En** acima de **Episódios**. Anterior e Próximo ficam em uma linha própria, com o próximo à direita mesmo quando é o único botão disponível.

## Reprodução verificada no Samsung

APK debug atualizado no Samsung SM-S911B. A rodada iniciada às **16h48** usou a rota normal do aplicativo. As contagens abaixo são do WebView. A prova de reprodução exigiu quadro renderizado, avanço de áudio e progresso no Media3. Os tempos medem a sessão de mídia, depois da escolha da fonte. A última coluna registra a posição observada, que pode incluir retomada.

| Caso | Fontes Fenix / Brazuca | Reprodução observada | Tempo / posição |
| --- | --- | --- | --- |
| Um Trabalho do Inferno T1/E1 | 2 / 2 | Brazuca dublada, índice 0 | 2,538 s / 3,257 s |
| The Flash (2014) T1/E3 | 0 / 2 | Brazuca dublada, índice 0 | 2,544 s / 9,392 s |
| Rio (2011) | 2 / 2 | Brazuca dublada, índice 0 | 2,032 s / 18,373 s |
| Superman (2025) | 0 / 2 | Brazuca dublada, índice 0 | 2,042 s / 5,221 s |
| Os Simpsons T1/E1 | 0 / 2 | Brazuca dublada, índice 0 | 3,077 s / 52,340 s |
| Barbie Butterfly e a Princesa Fairy | 0 / 2 | Brazuca dublada, índice 0 | 2,029 s / 16,434 s |

As seis sessões reproduziram na primeira fonte escolhida e ficaram sem erro terminal durante a observação. A segunda fonte Brazuca foi anunciada em cada caso e ficou sem tentativa nesta rodada. O áudio avançou, mas o idioma falado e a obra inteira não foram verificados por escuta. A falha relatada para Um Trabalho do Inferno não se repetiu, portanto sua causa histórica na Brazuca continua indeterminada. A ausência de fontes utilizáveis no Fenix continua comprovada nesta rodada. A revalidação automática foi exercitada em testes controlados, pois as tentativas externas atuais não precisaram dela.

## Validação do player

- **Samsung, tela cheia Media3**. Um único toque entrou em Zoom, sem controle de enquadramento adicional. A janela mediu **1080 × 2340** em retrato e **2340 × 1080** em paisagem. A captura após 1,2 s de estabilização da rotação mostra vídeo até as bordas em paisagem, gradiente leve sobre a imagem e ausência da navegação do app e das barras do Android. O clipe tem proporção 16:9 e o aparelho é mais largo. O preenchimento preservou a proporção e recortou o quadro. As faixas antigas eram do ajuste ao contêiner nesse clipe. Um arquivo que já inclua faixas na imagem pode continuar mostrando-as.
- **Samsung, retorno**. Voltar restaurou ambas as barras e o enquadramento inline, mantendo a rota e uma única carga. MP4 e HLS controlados no Media3 e MP4 controlado no WebView produziram imagem, áudio e avanço. A rolagem manteve a superfície na mesma sessão.
- **Edge, HTML5**. Entrar em fullscreen aplicou `cover` diretamente. Sair restaurou `contain` e o banner de fundo. As opções manuais de enquadramento ficaram ausentes. MP4 e HLS CC0 reproduziram. A faixa de áudio HLS pôde ser trocada na amostra controlada.
- **Episódios**. A navegação em largura de 320, 412 e 1440 px no Edge mostrou os dois botões com a mesma coordenada vertical. No WebView do Samsung, a medição conjunta após a rolagem confirmou o cabeçalho **Em exibição · T1 E3** e ambos na mesma linha, nos extremos de uma faixa de 306 px. O teste de componente confirmou a troca de T1 E1 para T1 E2 e a ausência de Anterior no primeiro episódio.
- **Vitest**. Suíte padrão com 255 testes aprovados e uma integração opcional inicialmente ignorada. A integração opcional foi executada à parte contra o servidor controlado e passou. Badger, Rubeo, Arthur e Malfoy mantiveram os contratos e caminhos de transporte cobertos pela suíte. Não houve novo teste externo individual dessas quatro fontes.
- **Build**. TypeScript, Vite, sync Capacitor e Gradle concluídos. APK instalado por USB. SHA-256 local `6866cc6fa2919f5155d6bf958b15d977d7dadec3bdd3051e49149cf67007fb5f`.

## Arquivos e repetição

Produção: `src/experimental/StremioAddonAdapter.ts`, `src/playback/coordinator.ts`, `src/playback/AutomaticWatch.tsx`, `src/components/VideoPlayer.tsx`, `src/components/EpisodePicker.tsx`, `src/styles.css` e `android/app/src/main/java/app/nocta/prototype/NoctaNativePlayerPlugin.java`. Testes: `src/test/{playback-coordinator,automatic-watch,web-player-controls}.test.*`. Roteiros: `scripts/player/flow-ui-check.mjs` e `scripts/player/recovery-check.mjs`.

Evidências em `.cache/nocta-estabilidade`: `work-1.json` a `work-3.json`, `work-hls.json`, `catalog-http.json`, `live.json`, `device-live-final.log`, `controlled.json`, `immersive-landscape-zoom.png`, `android-episodes.json`, `android-episodes.png`, `browser-ui.json`, `tests.log`, `integration.log` e `build.log`. Os registros de fornecedores usam hashes e omitem links de mídia e valores de cabeçalhos.

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
npm.cmd test
npm.cmd run android:build
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```

Para repetir com o Nocta aberto no aparelho conectado:

```powershell
$env:NOCTA_CHECK_DIRECTORY='.cache/nocta-estabilidade-repeticao'
node scripts/player/recovery-check.mjs --immersive --scroll
node scripts/player/recovery-live-check.mjs --case=tmdb-tv-289517:1:1 --case=tmdb-tv-60735:1:3 --case=tmdb-movie-46195 --case=tmdb-movie-1061474 --case=tmdb-tv-456:1:1 --case=tmdb-movie-196254
```
