# FenixFlix configurado — integração real no Nocta

Atualizado em **04/11/2026**. Este resultado substitui a conclusão anterior sobre o host Render. O endereço antigo não é mais usado em código, perfil ou scripts de conexão. Nenhuma nova mídia sintética ou servidor de demonstração foi criado nesta etapa.

## Resultados reais

| Operação | Resultado |
| --- | --- |
| Página de configuração https://fenixflix.fenixhub.online/ | HTTP 200 |
| Manifesto simples /manifest.json | HTTP 200, com.fenixflix, versão 1.2.9 |
| Manifesto configurado | HTTP 200, com.fenixflix, versão 1.2.9, CORS * |
| Catálogo de filmes configurado | HTTP 200, 28 títulos |
| Catálogo de séries configurado | HTTP 200, 28 títulos |
| Filme tt35538033 (Resident Evil, nome retornado pelo addon) | HTTP 200, 2 fontes, ambas HLS sem extensão |
| Série tt7441658 (Black Clover), temporada 1 episódio 1 | HTTP 200, 5 fontes HLS; 3 com proxyHeaders recusadas; 2 elegíveis para teste direto |
| Reprodução de filme no Edge | Primeira fonte testada falhou; erro HLS e timeout de carregamento |
| Reprodução de série no Edge | Fonte dublada Rubeo reproduziu; tempo 2,013s, vídeo de 853 pixels de largura, paused=false |
| Áudio da série | 38.444 bytes de áudio decodificados; muted=false, volume=1 |
| Idioma falado | Não confirmado por escuta/análise de fala; PT-BR/dublado é declaração do serviço |
| Seletor de faixas nessa fonte | Nenhuma faixa alternativa exposta |
| Android físico | Não testado nesta etapa; nenhuma instalação ou emulação |

Não se afirma sucesso de todas as fontes. O script selecionou a primeira fonte elegível de cada título: uma do filme e uma da série. API retornando link não foi contada como reprodução. A confirmação de áudio acima é técnica de decodificação, não uma avaliação subjetiva de som audível nem confirmação linguística.

## Configuração e rotas

A página real contém buildManifestPath, que constrói um único segmento com opções separadas por `%7C`. Opções observadas: qualities, audio, catalogs e qualidade_certa=1 (quando selecionada). Os catálogos usam populares_movie, populares_series, recentes_movie e recentes_series; não foi inventado catalogs=all.

Perfil padrão de desenvolvimento:

```text
https://fenixflix.fenixhub.online/qualities=4k,1080p,720p,sd%7Caudio=dublado,legendado%7Ccatalogs=populares_movie,populares_series,recentes_movie,recentes_series/manifest.json
```

O perfil não usa o manifesto simples como equivalente à configuração completa. A tela aceita colar outra URL HTTPS gerada pela página do FenixFlix, restrita ao mesmo host. Alterar esse campo cancela consultas anteriores e limpa a fonte atual. Não há persistência automática da configuração personalizada.

O adaptador existente já resolvia caminhos relativos ao diretório do manifesto. Essa construção foi explicitada com URL e coberta por teste que exige manter o prefixo em todas as requisições:

```text
/<configuração>/manifest.json
/<configuração>/catalog/movie/populares_fenix.json
/<configuração>/catalog/series/populares_fenix.json
/<configuração>/stream/movie/tt35538033.json
/<configuração>/stream/series/tt7441658%3A1%3A1.json
```

Não há fallback silencioso para as rotas sem configuração. Os catálogos são escolhidos a partir dos IDs do manifesto, não dos IDs do host antigo. O manifesto declara stream/catalog e tipos movie, series e anime; este experimento exercitou movie e series. IMDb e TMDB continuam suportados pelo adaptador conforme o perfil; os testes reais desta etapa usaram IMDb dos catálogos retornados.

## Formatos, origens e compatibilidade

Filme: duas fontes HLS de zunderflix.lat, no caminho /api/media/hls-proxy. Como o endpoint não termina em .m3u8, foi verificado diretamente: HTTP 200, Content-Type application/vnd.apple.mpegurl e corpo iniciado por #EXTM3U. O perfil declara esse endpoint exato como HLS; não se considera qualquer página sem extensão como vídeo.

Série: cinco URLs .m3u8. As fontes Arthur (duas dubladas, uma legendada) exigem cabeçalhos especiais e permanecem recusadas. As duas fontes Rubeo usam cdn-sv01.maximaimg.online, uma declarada dublada 480p e outra legendada 720p. A dublada foi a fonte reproduzida. A whitelist inclui somente zunderflix.lat e cdn-sv01.maximaimg.online, origens observadas e inspecionadas. Não se aprovam automaticamente outros hosts nem se enviam proxyHeaders.

O perfil agora tem playbackAllowed=true para o teste local solicitado. A opção geral permanece desligada por padrão e restrita ao Vite em desenvolvimento. O perfil controlled-cc0 foi preservado. O player é o mesmo VideoPlayer/HLS.js da etapa anterior; nenhum player, scraper ou proxy adicional foi implementado.

## CORS e acesso

As respostas de manifesto, catálogo e fontes do novo addon enviaram Access-Control-Allow-Origin: *. Isso permitiu a consulta direta no navegador.

A playlist da fonte do filme respondeu HTTP 200 no cliente HTTP, mas **não enviou Access-Control-Allow-Origin**. No navegador, o teste não chegou a readyState>=2 em 25 segundos e o player exibiu erro fatal HLS. Portanto a consulta HTTP dessa playlist não foi tratada como sucesso de reprodução. É necessário que o servidor de mídia ofereça CORS para playlists/segmentos/chaves, ou que uma integração backend documentada e permitida pelo fornecedor os sirva com a política correta. Não foi adicionado um proxy genérico para mascarar o problema, nem foram desativadas proteções do navegador.

A playlist Rubeo enviou CORS * e referências ao mesmo host; o player conseguiu carregar e decodificar vídeo/áudio. Não foram alterados Referer, User-Agent ou autenticação para obter a reprodução.

O Python local apresentou erro de cadeia de certificados. Os clientes HTTPS Node/Windows e o Edge fizeram a validação TLS normal e conseguiram acessar o serviço. Não foi usado verify=False, NODE_TLS_REJECT_UNAUTHORIZED=0 ou ignorar erros de certificado.

## Evidências

Arquivos locais em .cache/fenix-configured (não distribuídos no produto): landing.html, manifest.json, probe.json com respostas reais, browser.json com métricas e browser.png. O probe.json contém as URLs recebidas da API, que podem expirar; não foi copiado para docs ou configuração pública. O perfil guarda somente as origens aprovadas, sem links individuais de reprodução.

## Repetir os testes

Na pasta C:\Users\PC\Desktop\fuzz:

```powershell
node scripts/fenix/probe.mjs
```

Para uma configuração própria copiada da página do FenixFlix:

```powershell
node scripts/fenix/probe.mjs 'https://fenixflix.fenixhub.online/SEU_SEGMENTO_DE_CONFIGURACAO/manifest.json'
```

Substitua o segmento pela URL efetivamente gerada; o script valida o host e preserva o caminho. Não altera nem segue redirects de mídia. Consulta manifesto, um catálogo de cada tipo e fontes do primeiro ID IMDb/TMDB válido retornado. Os títulos e contagens podem mudar.

Para a interface:

```powershell
$env:VITE_ENABLE_STREMIO_EXPERIMENT='true'
npm run dev -- --port 5176
```

Abra http://127.0.0.1:5176/configuracoes, marque Habilitar experimento, selecione fenixflix-diagnostics, cole seu manifesto configurado se desejar e consulte um título. Para reproduzir o episódio testado, escolha Série, IMDb tt7441658, temporada 1, episódio 1; selecione a fonte HLS habilitada com descrição Rubeo/Dublado. A disponibilidade pode mudar. Fontes recusadas continuam desabilitadas com motivo.

Teste automatizado de reprodução real, com o Vite acima ativo:

```powershell
node scripts/fenix/browser-check.mjs
```

Esse teste requer Edge instalado. Usa os dois IDs registrados neste relatório; verifica tempo, vídeo e bytes de áudio quando expostos. Não confirma idioma falado. `node scripts/fenix/media-probe.mjs` verifica Content-Type/CORS das primeiras fontes sem cabeçalhos especiais do último probe.json, sem ignorar TLS. Execute probe.mjs antes.

## Arquivos alterados e validação

- src/config/stremioServices.ts: novo host, manifesto com configuração explícita, origens de mídia e endpoint HLS sem extensão verificado.
- src/experimental/StremioAddonAdapter.ts: base de URL com preservação do caminho e suporte a endpoints HLS explícitos no perfil.
- src/pages/StremioExperiment.tsx: campo para manifesto configurado, descrição do fornecedor e remoção do aviso antigo de suspensão.
- scripts/fenix/probe.mjs: novo host, opção de manifesto completo e descoberta de rotas pelo manifesto real.
- scripts/fenix/media-probe.mjs e browser-check.mjs: verificações reais de mídia e reprodução.
- src/test/stremio-adapter.test.ts: perfil atualizado e regressão do caminho configurado.
- docs/NOCTA_FENIX_INTEGRACAO.md: este resultado atualizado.

17 testes do adaptador passaram e a verificação TypeScript passou. Home, favoritos, recomendações, EmbedMovies e componentes do player não foram modificados nesta etapa.

Build final: `npm run build` aprovado (TypeScript e Vite). Permanece o aviso de tamanho do chunk HLS, sem erro de compilação. Nenhum APK foi compilado ou instalado nesta etapa.
