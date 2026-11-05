# Validação do NOCTA

Data: 01/11/2026. Execução no ambiente Windows desta entrega.

As seções abaixo registram a **versão inicial do protótipo**, anterior ao diagnóstico EmbedWave. O registro atual está na seção final e em `TESTE_EMBEDWAVE.md`; o APK foi recompilado desde o hash inicial.

## Verificações concluídas

| Verificação | Resultado |
|---|---|
| Instalação com npm e lockfile | Concluída |
| TypeScript + build Vite | Aprovado; arquivos em `dist/` |
| Testes Vitest/Testing Library | 14 testes aprovados em quatro arquivos |
| Testes reais Playwright no Edge | Quatro cenários aprovados: dois desktop e dois em viewport Pixel 7 |
| Navegação, favoritos após reload e seletor de temporadas | Aprovados no navegador |
| Busca sem acentos, filtros e estados vazios | Aprovados |
| Reprodução real de Big Buck Bunny por streaming | Aprovada no navegador desktop e móvel emulado |
| Retomada do vídeo e Continue assistindo | Aprovadas; posição persistida e restaurada |
| Reprodução de ID arbitrário TMDB | Bloqueada, sem elemento de vídeo |
| Troca de PlaybackProvider em teste de integração | Aprovada sem alterar a tela de player |
| Overflow horizontal da página | Ausente nos cenários de home, detalhes e busca testados |
| Capturas da interface | Geradas e inspecionadas; em `test-results/` |
| Projeto Android Capacitor | Gerado e sincronizado com a versão web |
| Compilação Android `assembleDebug` | Aprovada com JDK 21 e SDK 35; APK debug gerado |
| Conteúdo web dentro do APK | Os 29 arquivos de `dist/` coincidem byte a byte com seus membros no APK final |
| Marca, ícone e ilustrações originais | Criados no projeto, sem uso dos recursos dos APKs |

## Escopo dos testes

`src/test/catalog.test.ts` verifica normalização da busca, filtros combinados, mapeamento de metadados, exclusão de pessoas da busca TMDB, requisições simuladas e fallback de rede. `src/test/playback-library.test.tsx` testa lista autorizada, IDs inválidos, armazenamento corrompido, persistência, retomada e falha de vídeo. `src/test/app.test.tsx` verifica navegação, temporadas e indisponibilidade de reprodução. `src/test/provider.test.tsx` confirma a substituição do fornecedor sem dependência da lista de demos na tela.

`e2e/platform.spec.ts` executa o fluxo no navegador real em desktop e viewport móvel: biblioteca após recarregar, temporadas, busca/filtros, reprodução e persistência de posição. Esses testes não equivalem a testes em aparelho Android físico.

## Correções realizadas durante a validação

- Removido o filtro de ruído pesado das artes SVG, que atrasava a apresentação das imagens.
- Tornada explícita a espera de carregamento das imagens nas capturas e a espera de DOM na navegação automatizada.
- Removida da tela de player a dependência direta da lista de metadados de demonstração; a tela usa o contrato de catálogo e a sessão do provider.
- O botão de reprodução nos detalhes depende da sessão autorizada do provider, não da origem TMDB/fictícia do título.
- Limitada a observação de arquivos do Vite, excluindo referências descompiladas, Android, resultados de teste e caches. Durante a primeira compilação Android, arquivos gerados pelo Gradle provocavam recarregamentos da prévia.
- Escolhido o JDK 21 instalado para o wrapper Gradle, em vez do Java padrão mais recente.

## Limites

- Nenhuma chave TMDB do usuário foi fornecida: o caminho de API foi testado com respostas simuladas. A integração real requer configurar `.env`.
- Nenhum dos APKs de referência foi executado. Somente o novo projeto foi compilado e testado.
- Não houve publicação, criação de conta, anúncio, assinatura ou armazenamento offline de filmes.
- UI de desktop e móvel foi inspecionada por capturas de navegador. O acesso de controle visual integrado estava indisponível nesta sessão; a validação usou a suíte Playwright com Edge já instalado.
- O suporte atual é MP4/HTML5. HLS/DASH, DRM e fornecedores comerciais não foram implementados.

## APK Android gerado

- Arquivo: `android/app/build/outputs/apk/debug/app-debug.apk`.
- Tamanho: 4.347.482 bytes.
- SHA-256: `b8923e7d3d6485bdc8779c367264a37b64deab7d3ec3edf231ab5ce03bc425f6`.
- Compilação final: `BUILD SUCCESSFUL`, 85 tarefas, das quais 24 executadas e 61 já atualizadas.
- Ferramentas: Gradle 8.11.1, Android Gradle Plugin 8.7.2, JDK 21 e plataforma Android 35.

As primeiras tentativas encontraram conflito ao mover diretórios de cache no Windows. A compilação foi concluída após desligar a prévia, excluir os caches da observação do Vite e executar o Gradle sem observação de arquivos/instrumentação do agente. Nenhuma configuração de segurança do sistema foi alterada.

O APK contém a última versão sincronizada da web, conferida por SHA-256 de cada arquivo distribuível. É uma compilação de desenvolvimento, não uma versão de loja. Não foi instalado nem executado em aparelho ou emulador nesta entrega.

## Atualização: diagnóstico de fornecedores / EmbedWave

- 42 testes unitários/de integração aprovados, preservando os 14 testes originais.
- 15 cenários de navegador aprovados sobre o build de produção, com Edge desktop, Chrome desktop e viewport móvel.
- Reprodução de amostra licenciada em iframe, negação sem licença, isolamento e respeito a X-Frame-Options/CSP comprovados nas respostas controladas.
- Nenhuma rota de reprodução EmbedWave foi acessada. O fornecedor permanece fora do catálogo público e sem concessões cadastradas.
- Build web aprovado e 30 arquivos conferidos contra o APK atualizado, sem divergências.
- APK atual: 4.308.883 bytes, SHA-256 `450078d47ee0a5d3279d9f08ebc24d17d7e12098f4a255865381725e9a16019f`.
- A compatibilidade real da EmbedWave e a autorização de suas fontes permanecem não comprovadas. Detalhes e fontes em `TESTE_EMBEDWAVE.md`.

## Atualização de compilação e preparação USB — 02/11/2026

- Corrigidos os contratos legados EmbedWaveRequest/EmbedWaveProvider, mantendo o contrato MyEmbed/EmbedMovies separado.
- Restaurado DemoPlaybackProvider como provider exclusivo das amostras autorizadas, separado de HybridPlaybackProvider.
- Testes unitários isolados da chave TMDB real do ambiente. Suíte completa: 62 testes aprovados em 9 arquivos; a regressão de navegação foi repetida após o ajuste final de tipos.
- npm run build aprovado, incluindo tsc -b e Vite. Nenhum erro TypeScript restante.
- cap sync android aprovado; 31 arquivos de dist comparados com os assets Android, sem divergências.
- Hero/cartazes/títulos direcionam ao player; detalhes expansíveis, seletor de episódios e progresso por episódio preservados. Próximo Episódio automático continua restrito ao HTML5 com progresso disponível; não se inventam eventos do iframe externo.
- Nenhum emulador foi iniciado e nenhum build, teste ou instalação nativa Android foi executado nesta etapa.
- Os dados de APK anteriores neste documento são históricos. As alterações atuais precisam ser compiladas no Android antes da instalação; não se afirma que o APK antigo contém este build web.
- Instruções completas e comandos PowerShell para compilar e instalar por USB: TESTE_USB.md. A sintaxe dos comandos foi validada sem executá-los no aparelho.


## Home com catálogo TMDB e retomada — 03/11/2026

Esta atualização substitui as descrições históricas de catálogo fictício na interface pública.

- `src/services/catalog.ts`: tendências diárias em `trending/all/day`, ou por tipo nas abas; mantém a ordem retornada. Populares são a alternativa em falha das tendências. Quatro categorias usam Discover por popularidade: filmes de Ação, séries de Drama, Animes (animação + origem japonesa + idioma japonês) e filmes de Terror/Suspense. Animes é uma aproximação por filtros. As categorias carregam independentemente da capa; falhas parciais não substituem todo o catálogo.
- `src/pages/Home.tsx`: remove o antigo trilho Cinema Aberto e a seção editorial de protótipo. Continue assistindo é o primeiro trilho após a capa, antes dos gêneros e tendências, e funciona com histórico salvo mesmo sem resposta do TMDB. Mostra a seleção mais recente de cada obra, oculta concluídos e mantém os parâmetros de temporada/episódio no atalho direto.
- `src/pages/Search.tsx`, `Library.tsx`, `About.tsx`, `Details.tsx` e `src/components/Layout.tsx`: retiram referências públicas aos títulos de demonstração e seus atalhos. Histórico e favoritos antigos são preservados; fixtures ficam ocultas. Sem chave, aparece configuração pendente, sem inventar títulos. Amostras autorizadas continuam exclusivamente no diagnóstico técnico (`/diagnostico/reproducao` e `/diagnostico/player/:id`), sem trilho ou entrada na navegação pública.
- `src/services/mediaAvailability.ts`, `src/hooks/usePlaybackSession.ts`, `src/components/VideoPlayer.tsx`: filtram falhas observadas de fonte ausente e erros HTML5 de decodificação/formato por 30 minutos, somente na memória da sessão. Rede temporariamente indisponível não oculta o título. Falhas de episódio ficam vinculadas ao episódio, sem excluir toda a série. Sucesso remove a marcação; nada apaga a biblioteca.
- Metadados de listagem: descarta ID inválido, título vazio, data inválida, cartaz ausente, pessoas, conteúdo adulto e duplicatas. Isso não comprova a disponibilidade, o formato efetivo nem os direitos de reprodução.
- `src/styles.css`: Continue assistindo agora rola horizontalmente também no celular, com encaixe dos cards e botão de remoção de 44 px.

### Verificação desta atualização

- `npm test`: **74 testes passaram em 10 arquivos**, incluindo regressões de episódios, navegação, biblioteca e diagnóstico. Os testes chamados Android nesta suíte usam mocks JavaScript; não executam app nativo.
- **4 testes de navegador passaram no Chrome instalado**, em desktop 1440×1000 e viewport móvel Pixel 7. Verificaram tendências/categorias, ausência de demos, links diretos, favoritos após recarga, filtros de busca, Continue assistindo antes dos demais trilhos, atalho para episódio salvo, rolagem horizontal e ausência de transbordamento da página. Imagens e TMDB foram simulados; requisições externas de players foram bloqueadas. Capturas: `test-results/catalog-desktop.png`, `catalog-mobile.png`, `continue-desktop.png`, `continue-mobile.png`.
- A inicialização do Edge e o acesso local dentro do ambiente restrito falharam antes da página. O resultado acima foi obtido com Chrome e servidor local autorizado, usando `.cache/catalog-qa.config.ts`. Servidor de prévia encerrado após o teste.
- `npm run build`: **TypeScript e Vite passaram**. Após o E2E, o build final foi refeito com a configuração local normal, removendo a chave fictícia de teste.
- `npx cap sync android`: **passou**. Arquivos web finais copiados para `android/app/src/main/assets/public`. Não houve compilação de APK, instalação USB, execução de aplicativo nativo ou emulador nesta atualização. Para o aparelho físico, seguir `TESTE_USB.md`.

### Limites confirmados

Nenhuma reprodução real de catálogo foi testada. Não foi feita sondagem de players, scraping ou leitura de iframe externo. `load` de iframe não comprova reprodução e seus erros internos não podem ser usados para filtrar títulos sem uma API oficial do fornecedor. A filtragem não promete que todos os títulos exibidos têm fonte ou licença. Da mesma forma, Continue assistindo só retoma tempo exato quando há progresso disponível (HTML5); em iframe externo não há integração documentada para obter a posição. O catálogo TMDB continua separado da autorização de reprodução.

Referências dos contratos: [tendências TMDB](https://developer.themoviedb.org/reference/trending-all), [Discover Movie](https://developer.themoviedb.org/reference/discover-movie), [Discover TV](https://developer.themoviedb.org/reference/discover-tv).


## Player mobile, detalhes rápidos e episódios — 03/11/2026

- `src/components/IframePlayer.tsx` e `src/styles.css`: enquadramento compacto em 16:9, limitado a 34svh no celular, margens de 12 px, canvas mínimo de 640 px ajustado uniformemente ao espaço disponível. O iframe inteiro cabe no próprio container, sem recorte por escala ou remoção de permissões de segurança. Ampliar controles alterna para viewport natural sem escala, com até 55svh. Tela cheia usa somente a API padrão e apresenta orientação quando indisponível. ResizeObserver acompanha rotação e tamanho. Alternar tamanho não troca o elemento nem recarrega sua URL. O layout interno real do fornecedor continua fora do controle do Nocta.
- `src/pages/Watch.tsx`: expansão de detalhes imediatamente após o player, antes do painel de episódios. Sinopse completa, elenco e ano sem navegação nem reinicialização do vídeo. Seletor existente preservado, com controles maiores; em até 360 px, a temporada ocupa linha própria para exibir o número sem corte.
- `src/domain/episodes.ts`: sugestão flutuante nos últimos 90 segundos de progresso HTML5 real. Em vídeos curtos, o limiar é limitado aos últimos 30% da duração. A sugestão pode ser dispensada, sem desativar a preferência de avanço automático. A troca automática ocorre no evento `ended`, com proteção contra duplicação, respeitando temporadas e fim da série.
- Áreas de toque: ajustes de iframe, temporada, próximo episódio e opção de avanço com pelo menos 48 px; episódios com 72 px. Controles de tempo/velocidade ampliados. As dimensões dos controles dentro do iframe do fornecedor não podem ser garantidas; o modo sem escala permite ampliar sua área disponível.

Verificação: **24 testes relacionados passaram** em `episode-navigation.test.tsx`, `playback-library.test.tsx` e `iframe-diagnostics.test.tsx`. Incluem sugestão de próximo, dispensa, avanço ao final, opção de desativar avanço, temporadas, fim de série, fontes indisponíveis, preservação do player durante ajustes/detalhes e permissões do iframe. TypeScript e build Vite passaram.

**4 cenários de navegador passaram** em `e2e/watch-mobile.spec.ts`, no Chrome com viewport de 320×568, 390×844, 430×932 e 844×390. Foram usados somente metadados sintéticos e HTML local no lugar do fornecedor, bloqueando outros domínios. Conferiram limites geométricos, ausência de transbordamento, toque real nas coordenadas de uma opção interna do iframe, controles grandes sem escala, preservação de seleção ao abrir detalhes, alvos de toque e troca de episódio por URL. A geometria de toque foi calculada exclusivamente na amostra controlada, nunca no player real. Capturas em `test-results/watch-mobile/`.

O guia do fornecedor foi reconferido: não documenta eventos de progresso/término para o aplicativo. Portanto, **iframe externo continua com troca manual**, sem temporizadores inventados, leitura de DOM externo ou mensagens não documentadas. Não foi testada reprodução de obras nem interação com servidores reais. Não houve emulador, build de APK ou teste nativo. O build web foi sincronizado com Capacitor; instalação USB continua manual conforme `TESTE_USB.md`.

Referência: [guia oficial EmbedMovies](https://embedmovies.org/#guia-rapido).
