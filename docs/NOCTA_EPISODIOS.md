# Home e navegação de episódios

## Alterações no código

Home: hero sem altura mínima fixa, filtros imediatamente abaixo, Continuar assistindo opcional e tendências. O histórico usa cartazes em trilho horizontal, sem ação de marcar como assistido. A barra vermelha aparece exclusivamente para registros HTML5 com progresso real; iframe mantém apenas a indicação de título/episódio aberto. A conclusão manual continua disponível na biblioteca e no player.

Séries, animes e novelas usam o mesmo modelo episódico, sem classificação nova por gênero. EpisodePicker oferece temporada, thumbnail quando disponível, número, nome, duração, episódio atual e indicação de assistido ou aberto anteriormente, sem confundir os dois. Anterior e Próximo episódio atravessam temporadas pelos números de exibição existentes, não pelos IDs do TMDB. O painel fica antes das informações longas da obra.

episodeSequence retorna ready, missing, unknown ou complete, além de previous/next. Um erro na consulta da próxima temporada não é final de série. Conclusão significa último episódio disponível nos metadados atuais, não prova de que a produção terminou. Antes de solicitar uma sessão, o hook verifica se a seleção consta nos metadados recuperados. Falha de rede permanece desconhecida e não bloqueia automaticamente o fornecedor. Respostas canceladas/obsoletas continuam descartadas, preservando a sessão anterior durante preparação/erro.

PlaybackCapabilities declara supportsEndEvent, supportsProgress, supportsSeek e supportsAutoNext. HTML5 possui essas capacidades; o iframe atual declara todas falsas. O hook expõe as capacidades da sessão aceita. A UI de avanço automático só aparece para HTML5 com término/avanço confiáveis. Nenhum listener de mensagens não documentadas foi criado.

HTML5 usa ended. O padrão é avanço automático habilitado, com opção de desativação. A contagem de cinco segundos é opcional e desligada inicialmente; oferece Cancelar e Próximo agora, com bloqueio de transições repetidas. Preferências são salvas em nocta.autonext e nocta.autonext.countdown; se o storage falhar, permanecem na sessão. Troca de episódio mantém a URL atual com replace, sem empilhar rotas. Se autoplay for recusado, o VideoPlayer existente mostra orientação para tocar em reproduzir, mantendo controles nativos.

## EmbedMovies

O [guia público consultado](https://embedmovies.org/#guia-rapido) documenta incorporação e rota direta de temporada/episódio. Não foi encontrado nesse guia um contrato de postMessage para progresso ou término. Assim, não há contagem de duração TMDB para inferir fim, nem avanço automático no iframe. Próximo episódio fica no painel sempre que os metadados identificarem uma seleção seguinte. Sem metadados verificáveis, não se inventa um episódio seguinte. O episódio efetivamente aberto continua salvo no histórico para reentrada.

## Validação

Revisão estática somente. Não foram executados app, testes, build, emulador ou instalação, mantendo a orientação anterior. Não houve reprodução externa. Permanecem pendentes a validação de geometria no WebView físico, toque, orientação, fullscreen, Voltar e ciclo de fundo.

Foram ampliados os testes de navegação para: anterior entre temporadas, final disponível, episódio inexistente e recuperação, capacidades do iframe, contagem/cancelamento/Próximo agora, autoplay recusado na mudança de temporada e restauração do iframe após remontagem. Os testes existentes já cobrem último episódio de temporada, fim de série, troca manual, respostas obsoletas e progresso HTML5 por episódio. Os testes de Home verificam filtros antes do histórico, cartaz e ausência de conclusão manual no trilho; os de histórico foram ajustados.

Para executar os testes focados localmente:

```powershell
npm test -- --maxWorkers=1 src/test/episode-navigation.test.tsx src/test/history.test.tsx src/test/home-catalog.test.tsx src/test/playback-library.test.tsx
```

Arquivos alterados: src/pages/Home.tsx, src/components/ContinueWatching.tsx, src/styles.css, src/pages/Watch.tsx, src/domain/episodes.ts, src/components/EpisodePicker.tsx, src/hooks/usePlaybackSession.ts, src/services/playback.ts, src/test/episode-navigation.test.tsx, src/test/history.test.tsx e src/test/home-catalog.test.tsx. O APK existente não foi atualizado.
