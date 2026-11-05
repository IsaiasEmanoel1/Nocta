# Experimento Stremio do NOCTA

Estado: adaptador real HTTP, isolado do catálogo e do EmbedMovies. Experimento desligado por padrão, disponível somente com Vite em desenvolvimento e ativação manual em Configurações. Nenhum endpoint do FenixFlix foi instalado no produto.

## Auditoria estática

Referência auditada: JOAO2666/Fenixflix, commit `3cac08011ee63b7c85f0d55cec03ecf43fb87a3b`, em 04/11/2026. Os arquivos públicos foram lidos, nunca executados. Cópias de trabalho estão em `.cache/fenix-audit`, ignoradas pelo Git; nenhum código desses módulos foi copiado para src.

- `app.py:255–287`: manifesto movie/series, recursos stream/catalog, IDs tt/tmdb, catálogos populares e recém-adicionados. Paginação adicional retorna vazio. Não há endpoint meta próprio declarado; isso difere de um servidor que organiza todos os episódios via meta.videos.
- `app.py:82–160`: resolve IMDb pelo find do TMDB, consulta títulos em pt-BR/en-US e metadados; requer TMDB_API_KEY do servidor. Nocta mantém sua própria consulta TMDB.
- `app.py:289–355`: interpreta `tt...:temporada:episódio` e `tmdb:id:temporada:episódio`, dispara serve/doramogo/on/mywallpaper/streamflix em paralelo, mantém flags/cache por episódio e agrega streams. O rótulo dublado é declaração do fornecedor, não verificação de áudio.
- `serve.py:13–118`: consulta um servidor remoto HTTP, organiza temporadas/episódios da resposta e reescreve certos caminhos para outro proxy remoto; alguns streams solicitam Referer/Origin/User-Agent por proxyHeaders. Esses cabeçalhos não são reproduzidos nem contornados pelo adaptador.
- `streamflix.py:6–145`: depende de streamflix.live, listas remotas via api_proxy.php, cache de uma hora, comparação de títulos normalizados e consulta da URL por ID remoto. Não hospeda acervo independente ao ser clonado.
- `doramogo.py`: constrói/prova candidatos HLS em CDN externa. `mywallpaper.py`: cruza metadados de anime/TMDB/AniList, temporadas e episódios absolutos, depende de CDN externa. `on.py`: coleta página/player externo. Módulos fimoo/fshd/go também existem, com extração/transformação de páginas/links; não foram transplantados ou executados. Sua presença não prova que todos sejam chamados pelo caminho principal.
- Dependências Python declaradas: FastAPI, uvicorn, aiohttp, slowapi, requests, httpx, jinja2, python-dotenv, BeautifulSoup4, pycryptodome e lxml. Docker usa Python 3.10, curl e uvicorn na porta 8000. Exige conectividade, fornecedores remotos e configuração do servidor.
- LICENSE declara GNU GPLv3. A auditoria não comprova direitos sobre os vídeos, hospedagens ou upstreams. Não reutilizamos código GPL nem fornecemos uma concessão comercial de mídia. Antes de integrar um fornecedor real, obter autorização específica para território, aplicativo, distribuição e conteúdo; licença de código e direito de exibição são verificações diferentes.

Fontes: [repositório](https://github.com/JOAO2666/Fenixflix), [app.py](https://github.com/JOAO2666/Fenixflix/blob/3cac08011ee63b7c85f0d55cec03ecf43fb87a3b/app.py), [licença](https://github.com/JOAO2666/Fenixflix/blob/3cac08011ee63b7c85f0d55cec03ecf43fb87a3b/LICENSE), [protocolo](https://stremio.github.io/stremio-addon-sdk/protocol.html), [streams](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html), [manifesto](https://stremio.github.io/stremio-addon-sdk/api/responses/manifest.html).

## Arquitetura implementada

`StremioAddonAdapter` não depende de React. Implementa manifesto em cache por instância, validação de recursos/tipos/prefixos, catalog, meta com episódios, stream, normalização e criação de PlaybackSession para o VideoPlayer existente. Não envia eventos player/library, não exporta favoritos e não substitui CatalogProvider/HybridPlaybackProvider.

IMDb é aceito explicitamente. IDs de séries preservam temporada/episódio. TMDB **não possui prefixo universal imposto pelo protocolo**: o perfil precisa declarar sua convenção (fixture e Fenix usam tmdb:). Não existe correspondência automática IMDb/TMDB implementada neste experimento.

MP4, WebM e HLS são reconhecidos pelo pathname. Extensão identifica modalidade, não garante codec, disponibilidade nem licença. Páginas externas, torrents, YouTube, arquivos compactados/Usenet, formatos desconhecidos, DRM declarado e fontes com proxyHeaders são recusados com motivo. Não extraímos URL de embed. Erros de codec/transporte ficam com o player.

`declaredLanguages` é separado de `confirmedLanguages`, inicialmente vazio. languages é extensão opcional do fornecedor, não campo de áudio padronizado garantido pelo protocolo. Rótulos de descrição são apenas pistas. Metadados de faixa não comprovam o idioma falado.

Para HLS foi necessária uma única nova dependência de reprodução: hls.js (Apache-2.0), carregada dinamicamente. O HTML5 existente continua responsável por controles, pausa, seek e erros. HLS usa suporte nativo quando adequado ou MSE/hls.js; faixas alternativas aparecem quando expostas. MP4 não garante seleção de áudio em navegadores sem audioTracks. Não há fallback por extração, proxy de proteção ou DRM.

## Configuração e segurança

Perfis são definidos em `src/config/stremioServices.ts`, com manifesto, origens exatas de API/mídia, referência e expiração da autorização. A UI seleciona um perfil revisado; não aceita uma URL livre. Para adicionar um serviço autorizado, um desenvolvedor revisa e edita esse arquivo. Não copie domínios do Fenix para a lista.

HTTPS obrigatório, sem credenciais/fragmentos, IPs e nomes internos bloqueados. A única exceção é a fixture exata `http://127.0.0.1:4189`, autorizada por perfil de desenvolvimento. API usa credenciais omitidas, redirects recusados, timeout/abort e limites de resposta. Carregamentos HLS.js validam cada URL e recusam redirects. Logs da tela guardam somente código/mensagem, limitados a 20 entradas; não gravam URLs de mídia.

Limites: políticas no cliente não são uma fronteira de produção. DNS rebinding, redirects automáticos do elemento HTML5/HLS nativo e destinos internos de playlists nativas não são integralmente inspecionáveis aqui. Portanto só se configuram perfis de confiança com mídia controlada. Produção exige gateway/egress com resolução DNS, bloqueio de IPs internos após resolução, validação de redirects/segmentos/chaves e concessões aplicadas no servidor. Não existe proxy aberto neste projeto. A autorização declarada no perfil é uma referência administrativa, não prova jurídica ou DRM.

## Executar localmente (PowerShell)

Requisitos: Node/npm existentes; para gerar as amostras, Python e imageio-ffmpeg (já presentes nesta máquina). Em outra máquina: `python -m pip install imageio-ffmpeg`. O pacote fornece ffmpeg; nenhum APK/Fenix precisa ser executado.

Terminal 1:

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
npm install
python scripts/stremio/generate-media.py
node scripts/stremio/server.mjs
```

Terminal 2:

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
$env:VITE_ENABLE_STREMIO_EXPERIMENT='true'
npm run dev -- --port 5176
```

Abra `http://127.0.0.1:5176/configuracoes` (também acessível por Sobre → Configurações experimentais). Habilite o checkbox. Consulte tt1254207/movie ou tmdb:1/series, temporada 1 episódio 2. Os IDs servem somente para exercitar o protocolo: **a mídia não corresponde à obra desses IDs**, é a fixture original. Selecione MP4 ou HLS. Troque a faixa HLS quando a lista aparecer. Fonte unsupported fica desabilitada. tt0000001 retorna vazio; tt0000000 atrasa a resposta (teste automatizado usa timeout reduzido).

As amostras geradas são barras coloridas e tons originais de oito segundos, dedicados a CC0-1.0 para reprodução, incorporação e distribuição de testes. Arquivos em `.cache/stremio-fixture`: sample.mp4 (H.264/AAC, duas faixas por/eng), master.m3u8, playlists e segmentos TS. Não são fala traduzida. Servidos pelo servidor controlado com CORS e Range, sem fornecedores externos. Não foi testado catálogo comercial nem URL privada do Fenix.

Terminal 3:

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
$env:NOCTA_STREMIO_INTEGRATION='true'
npm test -- --maxWorkers=1 src/test/stremio-adapter.test.ts src/test/stremio-integration.test.ts src/test/playback-library.test.tsx src/test/episode-navigation.test.tsx
node scripts/stremio/browser-check.mjs
npm run build
```

O teste de navegador requer Microsoft Edge instalado. Salva evidências em `.cache/stremio-browser`. A integração HTTP fica pulada na suíte normal sem NOCTA_STREMIO_INTEGRATION. Não exige chave TMDB nem acessa fornecedores do Fenix. Encerre os servidores com Ctrl+C. O experimento não aparece habilitado no build de produção: a trava exige import.meta.env.DEV, além da variável e do checkbox.

## Android Capacitor

Nenhum aparelho apareceu em adb devices nesta entrega. Nenhum emulador foi criado, nenhum APK instalado, e reprodução Android **não foi verificada**. Viewport móvel no navegador, se testado, também não comprova WebView real.

O build padrão de produção mantém o experimento desligado. Para teste Android de desenvolvimento será necessária uma configuração de live reload para carregar o Vite local no Capacitor, revisão da política de transporte do WebView e encaminhamento USB das portas 5176 e 4189 (`adb -d reverse tcp:5176 tcp:5176` e `adb -d reverse tcp:4189 tcp:4189`). Essas regras não habilitam sozinhas o live reload e não devem ser incluídas em produção. O projeto não alterou a configuração nativa/cleartext nem removeu políticas para fazer o teste passar. MSE, codecs, audioTracks, autoplay, CORS e versões de WebView variam. O ensaio deve verificar MP4/HLS, áudio, pause/seek, fundo, fullscreen e Voltar em um dispositivo físico.

## Arquivos

Novos: src/experimental/StremioAddonAdapter.ts, src/config/stremioServices.ts, src/pages/StremioExperiment.tsx, src/hooks/useAudioPlayback.ts, scripts/stremio/{server.mjs,generate-media.py,browser-check.mjs}, src/test/stremio-{adapter,integration}.test.ts e este relatório.

Alterados: src/services/playback.ts (tipos MP4/WebM/HLS), src/components/VideoPlayer.tsx (HLS/áudio e opt-out do histórico experimental), src/App.tsx (rota de configurações), src/pages/About.tsx (link), package.json e package-lock.json (hls.js). Home, favoritos, recomendações, rotas de assistir e o provider EmbedMovies não foram substituídos.

## Produção pendente

Autorizar fornecedor e mídia; comprovar licença/territórios e auditoria upstream; aplicar política no servidor e limites de requisição; ampliar conformidade de manifesto, extras/paginação de catalog e IDs de addons não IMDb; confirmar idiomas pelo conteúdo/faixas com evidência adequada; testar codecs/WebView físico; definir observabilidade, privacidade e suporte operacional. O experimento não é um agregador aberto de URLs.
## Resultados executados em 04/11/2026

- TypeScript e `npm run build`: aprovados na versão final. O Vite avisou sobre o chunk HLS de aproximadamente 597 KB (187 KB gzip), carregado dinamicamente.
- Quatro suítes focadas: **38 testes aprovados** (13 de política/normalização, 1 de integração HTTP real com várias operações, 5 de biblioteca/player e 19 de navegação de episódios). Não representa execução da suíte completa do projeto.
- Edge desktop: MP4 em 1,026s, HLS em 1,022s, ambos vídeo 320×180 e duração próxima de oito segundos. Série T1/E2 reproduziu a fixture em 1,023s. Pausa/seek MP4 e seleção da segunda faixa HLS foram exercitados; playback continuou após a seleção. Nenhum erro JavaScript capturado.
- Edge com viewport 390×844 e toque: MP4 em 1,015s, HLS em 1,017s e série T1/E2 em 1,016s, vídeo 320×180. As faixas foram expostas como por/audio_0 e eng/audio_1, com seleção da segunda faixa e continuação. Isso não é teste de Android/WebView nem valida idioma falado.
- Evidências locais: `.cache/stremio-browser/result.json`, `mobile-result.json`, `desktop.png` e `mobile.png`.
- Android: `adb devices` não listou aparelho. Sem reprodução física, build Android, instalação ou emulador nesta fase.
- Instalação npm sinalizou 18 vulnerabilidades no conjunto de dependências (4 moderadas, 12 altas, 2 críticas). Não se atribuiu esse total ao pacote novo, nem foi aplicado audit fix ou atualização ampla automática. A avaliação da árvore de dependências permanece pendente.

Falhas intermediárias corrigidas: fetch do browser precisava de contexto global correto; duas inicializações concorrentes (nativa e MSE) impediam HLS de avançar; o observador de audioTracks nativo apagava faixas HLS. O caminho HLS agora controla sua própria inicialização e destrói a instância ao trocar/repetir a fonte.
