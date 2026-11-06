# NOCTA — altura do player, seleção interna e Busca

05/11/2026 · `C:\Users\PC\Desktop\fuzz`. Incremento do projeto existente, retomado após o limite de créditos, preservando os relatórios e a arquitetura anterior.

## Altura, imagem e controles

O retângulo móvel anterior era inteiramente limitado por `aspect-ratio:16/9`: em 360 px de largura sobravam cerca de 202 px de altura, inclusive para os controles e a seleção. Além disso, o menu manual era renderizado **depois** do `PlayerStage`. O botão interno descartava o mecanismo ativo e devolvia a área ao banner, enquanto as opções apareciam mais abaixo.

Agora a região móvel usa cerca de **60% da altura útil** (viewport menos a faixa de navegação), com mínimo de 340 px. A imagem conserva sua própria proporção: HTML5 usa `object-fit:contain`; o `PlayerView` existente usa `RESIZE_MODE_FIT`, com fundo inline transparente para mostrar o backdrop na área restante. Fullscreen continua manual, com fundo preto. O recorte e a sincronização de scroll existentes continuam ativos.

No Samsung, a região nativa mediu **358 × 375,6 CSS px**, viewport de 699 CSS px; a superfície de vídeo mediu **1074 × 604 px físicos**, aproximadamente 16:9. Scroll preservou o tamanho e um único `load`. A captura mostrou a imagem sem cobertura opaca e o banner visível fora dela. No Edge, a região desktop mediu **1280 × 720** e subiu para **1280 × 800** ao abrir a seleção; no viewport móvel 412 × 915, a região de vídeo mediu 507 px de altura e o painel de seleção 509 px.

`SourceSelection` ocupa o mesmo `PlayerStage`. A região pode crescer com o conteúdo; a lista não fica presa a uma janela curta com scroll próprio. As versões ficam lado a lado, com Dublado inicialmente selecionado se houver duas versões e nenhuma preferência válida. A lista responde à aba, sem nova consulta. Com uma única versão, o início direto permanece; no menu, a única opção fica centralizada. Há quatro fontes por lote visual e **Mais fontes** quando necessário.

O botão **Servidores** e a seta interna abrem essa seleção. A sessão anterior é encerrada com isolamento por lease; posição/idioma são preservados quando o mecanismo permite. No Samsung, o botão e a seta foram acionados em sessões nativas ativas, pausadas para a automação: ambos abriram o menu dentro do player, registraram `user-sources`, apresentaram a única aba disponível e não repetiram consultas. As capturas e eventos diferenciam a renderização real da presença do controle.

As fontes continuam identificadas como **Servidor N**. “Compatível · reprodução não verificada” indica uma candidata. “Reprodução verificada nesta sessão” exige progresso observado. Falha é da tentativa concreta; não invalida todo o fornecedor. Nomes reais só aparecem em configuração/diagnóstico.

## Um Trabalho do Inferno — T1/E1

Correspondência verificada: **Um Trabalho do Inferno (꿀알바), 2026**, tipo `series`, TMDB **289517**, IMDb **tt36458668**. O episódio **Regras da loja de conveniência**, TMDB episódio **6154166**, é T1/E1, publicado em 30/10/2026. A consulta dos complementos usou `stream/series/tt36458668%3A1%3A1.json`, com o caminho de configuração do manifesto Fenix 1.2.9 preservado e o manifesto Brazuca 2.1.5 existente.

| Resultado recebido na sondagem | Classificação anterior e constatação |
|---|---|
| Fenix, Hollymovies: HLS HTTPS, versão declarada dublada | Não era aceito: a origem retornada `https://embedplayer2.xyz` não estava na lista de mídia. A leitura normal da playlist confirmou um master HLS AVC/AAC, sem cabeçalhos especiais declarados. |
| Fenix, Hometown: MP4 HTTP | Bloqueado por HTTP. A descrição retornada para o ID solicitado dizia **Contos de The Walking Dead**, um título diferente; não foi examinada a mídia dessa linha para inferir seu conteúdo. Continua bloqueada. |
| Fenix, Netwix: URL opaca, legendado declarado | `Referer` e `User-Agent` foram declarados; origem não aprovada e formato sem evidência suficiente. Não foi reclassificado artificialmente para HTML5 ou Media3. |
| Brazuca: duas linhas HLS, Dublado e Dual/Leg | Ambas viraram candidatas web e Media3. Isso não prova reprodução nem legenda disponível. |

Na sondagem, Fenix respondeu com 3 linhas em 150 ms após o manifesto (325 ms); Brazuca respondeu com 2 em 933 ms após o manifesto (195 ms). O código anterior classificava as 3 linhas Fenix como incompatíveis, não como zero resultados do addon. A causa comprovada de descarte da linha HLS nessa captura era a política de origem. A linha HTTP discrepante e a opaca continuam sem liberação.

Foi adicionada **somente a origem HTTPS de mídia verificada** ao perfil Fenix e à lista nativa. Isso não adiciona um complemento. O master demorou **10,556 s** numa leitura, acima dos 8 s de leitura nativa anteriores. Só essa origem passou a ter leitura de **15 s**; outros hosts continuam em 8 s, conexão em 8 s e orçamento de inicialização do Media3 em 45 s. Essa medição justifica o ajuste pontual; não prova que o limite antigo causou toda falha histórica.

No APK final, no Samsung, o fluxo normal iniciou a primeira linha Fenix do episódio: **frame em 4,480 s, áudio em 4,821 s e progresso com ambos em 6,085 s**. Vídeo AVC 1280×720, áudio AAC com etiqueta `pt`; a fala não foi identificada por escuta. `inline=true`, `fullscreen=false`, nenhum evento terminal nessa tentativa. Consulta física: Fenix 3, Brazuca 2. Em tentativa manual separada, a consulta Brazuca atingiu timeout e não apresentou opção antes da seleção; **não houve carregamento de mídia Brazuca nessa repetição**, portanto não se atribui erro de mídia a ela. Não há log preservado que permita identificar cada falha relatada anteriormente pelo usuário.

Evidências: `.cache/player-altura/work-hell.json` (resposta sanitizada, mesmas linhas comparadas com a normalização), `hls-origin-check.json` (playlist sem links de mídia), `live.json` (tentativa que reproduziu), `live-brazuca.json` (consulta que expirou). URLs de mídia, cabeçalhos/valores e credenciais não foram incluídos no relatório.

## Busca de fontes e tempos independentes

- Mantidos **700 ms** de escalonamento da Brazuca, **2,2 s** de vantagem inicial limitada do Fenix e **6,5 s** de orçamento por consulta. Não foram aumentados indiscriminadamente. Os dois complementos responderam dentro do prazo na primeira captura; a segunda consulta Brazuca expirou sem declarar ausência definitiva.
- **Cinco segundos** disparam apenas a mensagem. A validação web atrasou a entrega da mídia em 6,2 s: o aviso apareceu, o iframe não abriu e o vídeo iniciou na mesma tentativa. A captura real do Samsung confirmou progresso de T1/E1 após 6,085 s sem troca de fonte.
- Consulta vazia, fonte filtrada, consulta expirada, candidata, preparação, buffering, reprodução confirmada e falha são estados separados. Resultados de fundo não substituem um `runId` ativo.
- HLS.js só propaga erros fatais. Media3 registra `onLoadError` recuperável como diagnóstico; a troca depende de erro terminal ou do timeout real de 45 s. Fallback continua limitado por fonte/tentativa, sem repetir indefinidamente.
- Uma consulta pode ser repetida individualmente em **Estado das consultas → Verificar novamente**, preservando outras fontes. A ausência não é persistida como cache negativo. Identidades antigas não invalidam uma resposta nova; a preferência de retomada não guarda URLs. A revisão por idade das fontes em memória permanece.

Não foi encontrado hardcode de Barbie ou Um Trabalho do Inferno no fluxo de produção. Os identificadores exatos ficam nos testes e roteiros. Barbie Butterfly e a Princesa Fairy (2013, TMDB 196254, IMDb tt2946582, tipo movie) mantém o teste de duas candidatas HLS. O 404 da opção Brazuca e a reprodução Fenix dessa obra são evidências do [incremento anterior](NOCTA_PLAYER_FLUXO_CACHE.md), não uma nova execução neste incremento.

## EmbedMovies

O [guia público](https://embedmovies.org/#guia-rapido) foi revisto: documenta as URLs de iframe por ID e temporada/episódio, mas não um inventário antecipado por seleção nem evento confiável de reprodução. `onload` confirma somente o documento e retira seu indicador; disponibilidade continua desconhecida. O isolamento cross-origin e as permissões/sandbox existentes foram mantidos.

O iframe continua como terceiro mecanismo, sem confirmação intermediária. **Problema com o vídeo? Escolher outro servidor** fica numa faixa própria, sem cobrir os controles do iframe. A ação encerra o iframe e mostra as opções já obtidas na área do player, sem marcar a fonte como indisponível. Se o documento não carregar, continua existindo timeout do documento; se o documento carregar e o vídeo interno travar, não há observação confiável desse estado. O teste controlado confirma a saída e a falta de falsa confirmação, não reprodução externa do EmbedMovies.

## Busca

Primeira linha com campo de pesquisa e um único botão **Filtros** ao lado. Abaixo, **Explorar catálogo**. Foram retirados o subtítulo e os controles grandes de período/origem/coleção da vista normal. O painel abre apenas quando solicitado, com tipo, gênero e ordenação simples na exploração sem termo. Links existentes com coleções e critérios adicionais continuam interpretados, sem mudar os trilhos da Home.

O botão Buscar superior/inferior sinaliza uma navegação com intenção de digitar; ao tocar novamente na mesma página, foca sem duplicar a rota. Enter/Ir submete e desfoca. Voltar usa a pesquisa, filtros, páginas e posição guardadas; não volta a focar em navegação POP.

No Samsung, tocar em Buscar abriu o teclado (`mInputShown=true`), Enter retirou o foco e a indicação de teclado exibido passou a `false`. Voltar fechou a lista de opções do filtro sem mudar a URL. Voltar do player restaurou a pesquisa e não reabriu o teclado. O navegador também confirmou foco, contraste do painel e retorno.

## Validação e entrega

| Execução | Resultado |
|---|---|
| Vitest | **248 passaram, 1 ignorado**; 30 arquivos passaram, 1 ignorado. A integração HTTP controlada opcional depende de `NOCTA_STREMIO_INTEGRATION=true`. |
| TypeScript / Vite / Capacitor / Gradle | Passaram; APK debug gerado. Aviso existente de tamanho do chunk HLS sem erro de build. |
| Edge com clipes autorizados | Área maior, abas internas lado a lado, seleção sem consulta nova, aviso após 5 s sem fallback, imagem proporcional, menu e Busca. |
| Samsung com clipes autorizados | HTML5 MP4 e Media3 MP4/HLS com imagem e avanço de áudio; proporção/scroll, botão Servidores e seta interna verificados. |
| T1/E1 real | Fenix reproduziu, Brazuca retornou candidatas numa consulta e expirou em outra. Nenhum sucesso Brazuca foi inferido de HTTP 200. |
| Regressões | Contratos Badger/Rubeo/Arthur/Malfoy e próximo episódio passaram na suíte. Não foram repetidos os quatro testes externos nem o fim de episódio externo; não se afirma nova execução deles. |

O primeiro acesso CDP falhou com o telefone em Doze; a captura foi concluída após acordar a tela, sem alterar suas proteções. Avisos do dump de acessibilidade não invalidaram as ações nativas observadas no log. Não houve novo teste completo de fullscreen/orientação em todas as sequências nesta rodada.

Arquivos principais: `src/playback/{AutomaticWatch,PlayerStage,SourceSelection,NativePlaybackView}.tsx`, `src/playback/coordinator.ts`, `src/config/stremioServices.ts`, `src/styles.css`, `src/pages/Search.tsx`, `src/components/{Layout.tsx,searchFocus.ts}`, `android/app/src/main/java/app/nocta/prototype/NoctaNativePlayerPlugin.java`. Testes: `automatic-watch`, `playback-coordinator`, `search-mobile`, `app`, `setup`. Roteiros: `scripts/player/{flow-ui-check,search-device-check,recovery-check,recovery-live-check}.mjs`.

Capturas em `.cache/player-altura/`: `mobile-player-sources.png`, `controlled-hls-frame.png`, `controlled-scroll.png`, `samsung-search-filter.png`. Logs finais: `tests-final.log`, `android-build-final.log`, `browser-ui.json`, `controlled.json`, `samsung-search.json`.

APK instalado no Samsung: `C:\Users\PC\Desktop\fuzz\android\app\build\outputs\apk\debug\app-debug.apk`. SHA-256 conferido no arquivo e no aparelho: `9c6d0d2696a5f621899672297e15a8f2ea7f50d370304a7c5416638af54d21ee`. A última compilação acrescentou apenas o ajuste de CSS da seleção desktop, validado no Edge; as capturas físicas usaram o mesmo código móvel e nativo.

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
npm.cmd run android:build
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -d install -r 'C:\Users\PC\Desktop\fuzz\android\app\build\outputs\apk\debug\app-debug.apk'
```

O build executa TypeScript/Vite, sync Capacitor e `assembleDebug`, com Node, JDK 21 e SDK 35 já configurados. Para repetir as capturas, abra o app no Samsung, mantenha a tela acordada e execute:

```powershell
$env:NOCTA_CHECK_DIRECTORY='.cache/player-altura'
node scripts/player/flow-ui-check.mjs
node scripts/player/recovery-check.mjs --scroll --menu
node scripts/player/search-device-check.mjs
node scripts/player/recovery-live-check.mjs --work
```

Sem emulador, novos fornecedores, alteração da Home, proxy ou desativação das restrições de origem/DRM.
