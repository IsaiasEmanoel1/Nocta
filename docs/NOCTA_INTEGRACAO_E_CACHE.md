# Nocta — Inventário, cobertura adicional e cache de descoberta

Execução de 5 de novembro de 2026 sobre uma amostra fixa de 100 títulos. O ranking mede anúncios de fontes e cobertura potencial. A seleção automática continua restrita aos perfis ativos do Nocta.

## Inventário e interpretação

- O comparador lê `fontes.txt` e os perfis remotos já declarados no Nocta. BsCine e Inova Play agora consultam `/manifest.json` a partir da URL raiz. FenixFlix entra com o manifesto configurado do aplicativo. Magnetflix, VêTela e os demais preservam caminho e configuração. Os dois Zeus são separados pelo hash do perfil e pelo ID interno do manifesto.
- `sample.json` fixa os mesmos 100 títulos e episódios para todos os perfis. A amostra contém 30 filmes, 20 animações, 15 séries, 15 desenhos, 10 animes e 10 novelas, divididas entre origem brasileira e internacional. As consultas só usam IDs e episódios confirmados pelo TMDB e aceitos pelo recurso do manifesto.
- `ranking.csv` separa cobertura, categorias, latência e Android potencial. Como a execução foi limitada no tempo, perfis podem ter denominadores e composição diferentes. Uma comparação conclusiva requer terminar a amostra.
- `adicional.csv` usa **FenixFlix e Brazuca Play** como base ativa. Um título só soma a cobertura adicional de anúncios quando o novo perfil anunciou fonte e ambos os ativos responderam com lista vazia para aquele título. Falta de resposta, erro ou identificação incompatível deixa a base inconclusiva. O ganho Android potencial usa ambas as respostas válidas da base sem candidata Android e uma candidata do novo perfil. Isso inclui casos em que a base anunciou apenas modalidades sem compatibilidade demonstrada.
- `fontes.csv` registra referência do protocolo, transporte, contêiner e codec quando declarados, nomes de cabeçalhos, condição Android e motivo. A primeira janela foi coletada antes dos novos campos por fonte e permanece no diário sem refazer chamadas. Essas linhas preservam o formato e os indicadores que já existiam e recebem motivo de captura anterior quando o detalhe não estava disponível.

## Formatos e adaptação aplicada

| Evidência disponível | Classificação no laboratório | Condição no Nocta |
| --- | --- | --- |
| HTTPS com HLS, MP4, WebM ou Matroska identificável | Suportado em potencial | A origem precisa constar na lista do perfil e o codec precisa funcionar no dispositivo. Matroska é caminho nativo. |
| DASH declarado ou `.mpd` | Suportável com adaptação | Media3 oferece módulo DASH. A integração local ainda usa ExoPlayer e o módulo HLS. Requer dependência, MIME no contrato, fonte autorizada e teste em aparelho. |
| URL HTTPS opaca e MIME ausente ou desconhecido | Informação insuficiente | Um MIME confiável, documentação da origem ou validação autorizada seria necessária. |
| URL inválida, resposta inválida, erro ou timeout de descoberta | Erro separado da modalidade | Ausência de dados de mídia. Nenhuma requisição ao arquivo de vídeo foi feita pelo comparador. |
| Torrent, YouTube, arquivo externo, usenet, DRM ou embed | Modalidade fora do player direto | Exige mecanismo próprio ou autorização adicional. Nenhum desses mecanismos foi introduzido. |
| HTTP sem TLS, origem fora da política ou cabeçalhos especiais | Fora da política atual | As listas de origens e as restrições de transporte seguem aplicadas. O caminho nativo existente só repassa os cabeçalhos de requisição admitidos e não reescreve cabeçalhos de resposta. |

Foi implementado o reconhecimento de MIME declarado de HLS, MP4, WebM e Matroska em caminhos opacos no adaptador já usado pelo app. A classificação continua sujeita às origens autorizadas. MIME e formato de contêiner são evidências separadas de codec, disponibilidade e reprodução. O comparador não interpreta extensão ausente como incompatibilidade definitiva. [Formatos suportados pelo Media3](https://developer.android.com/media/media3/exoplayer/supported-formats) · [Objeto Stream do Stremio](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html).

## Resultado parcial salvo

Os 100 títulos foram selecionados. Das 17 entradas únicas, 15 expuseram streams Stremio. Liet Nuvio e Kamirama ficaram fora da matriz por protocolo diferente ou estrutura sem confirmação de Stremio. Os dois lotes produziram **557 de 1.500 pares**, sem duplicatas. Houve 194 listas com fontes, 305 listas vazias, 50 incompatibilidades de tipo sem consulta, quatro timeouts, duas falhas de rede e duas respostas inválidas. O relatório inclui as seis categorias. Restam 943 pares. Não foi registrado HTTP 429.

| Perfil | Títulos com fontes / consultados | Candidata Android | Adicionais sobre a base | Ganho Android potencial |
| --- | ---: | ---: | ---: | ---: |
| Magnetflix | 33/39 | 16 | 6 | 7 |
| BsCine | 31/40 | 0 | 4 | 0 |
| VêTela Brasil | 29/37 | 29 | 5 | 14 |
| Zeus do arquivo, `org.zeus.community.beta` | 22/23 | 18 | 3 | 7 |
| Brazuca Play | 17/35 | 15 | Base | Base |
| FenixFlix configurado | 16/34 | 0 | Base | Base |
| Inova Play | 13/37 | 0 | 1 | 0 |
| Zeus do app, `org.zeus.community` | 8/23 | 5 | 1 | 4 |

As colunas de adicionais são contagens independentes por perfil e podem compartilhar títulos. BsCine anunciou fontes para 3/3 desenhos e 3/3 animações consultados. Nas 16 linhas BsCine coletadas com transporte detalhado, o MP4 foi anunciado por HTTP sem TLS. As outras 29 linhas BsCine vieram da primeira captura e foram registradas como MP4 sem detalhe de protocolo. Das 13 fontes Inova, dez tinham detalhe suficiente para dizer que o comparador não reconheceu uma URL HTTP(S) no campo de stream. A classificação zero da Fenix neste recorte não invalida a reprodução já registrada em outros títulos. Os formatos e requisitos observados, sem verificação de mídia, estão no CSV de fontes.

Os CSVs e o diário estão em `reports/nocta-cobertura-100`. A exportação foi refeita a partir do disco e a busca por URLs completas nos sete arquivos não encontrou ocorrências.

## Ordem e ativação

A ordem no coordenador é FenixFlix, Brazuca, BsCine, Magnetflix, Zeus, VêTela e EmbedMovies. Fenix e Brazuca continuam ativos. Zeus tem a opção de compilação `VITE_ENABLE_ZEUS_RESERVE=true`, desligada por padrão. BsCine, Magnetflix, VêTela, Inova e os demais permanecem no inventário de diagnóstico. Nenhum novo perfil teve reprodução autorizada comprovada no Samsung nesta tarefa. URLs de perfil do arquivo da área de trabalho não foram copiadas para a configuração distribuída do aplicativo.

Os fornecedores opcionais são consultados conforme a ordem é alcançada, depois de esgotadas as opções anteriores aplicáveis. EmbedMovies fica por último. Os rótulos no player continuam numerados. A proteção do VêTela usa o máximo de **10 requisições/minuto** no comparador e uma janela móvel de 60 s no cliente. O teto vale para o perfil conhecido. Nenhuma conclusão sobre limites de outras contas, credenciais ou redes foi tirada.

## Cache local e plano compartilhado

O projeto tem um frontend Vite empacotado em Capacitor, armazenamento local da biblioteca e servidores de teste. Não há backend de descoberta comum nem armazenamento compartilhado entre usuários.

O cache de descoberta em memória usa perfil, configuração e URL exata do recurso. O recurso de stream inclui tipo, ID e, para séries, temporada e episódio. A preferência de idioma é aplicada depois da descoberta e não muda a lista pedida nesses perfis. Consultas simultâneas iguais compartilham a resposta. Cancelar um consumidor mantém a requisição enquanto outro a usa. Manifestos podem ser reutilizados por até cinco minutos, limitados por `Cache-Control` e `Age`. Respostas privadas, com `no-store`, `no-cache` ou `Vary`, ficam fora da retenção. Listas de mídia concluídas e resultados negativos não são guardados. A revalidação após falha pede uma nova lista. O aplicativo respeita `Retry-After` para novas tentativas e expõe contadores locais de hit, miss, chamadas reunidas, chamadas evitadas e bloqueios de taxa. [Regras de cache HTTP](https://www.rfc-editor.org/rfc/rfc9111.html).

Para compartilhar descoberta entre aparelhos, o mínimo é um endpoint controlado que aceite o ID do perfil da lista aprovada, tipo, ID de catálogo, episódio e preferências suportadas. O serviço usa chaves por versão do perfil e configuração, região/idioma quando alteram a resposta e namespace de autorização. Respostas públicas e respostas personalizadas ficam separadas. Cookies, credenciais e tokens privados nunca entram nas chaves ou valores públicos.

Uma instância pequena pode começar com SQLite e uma fila limitada por perfil. Com mais instâncias, um KV com operações atômicas pode guardar validade, orçamento de requisições, janela `Retry-After` e a trava curta de consulta em andamento. O TTL deve usar o mínimo entre a validade da origem e a expiração explícita do resultado, com margem antes da expiração. Quando a duração de uma URL não for conhecida, o servidor pode compartilhar somente metadados e refazer a descoberta na hora de assistir. Timeouts e 429 não devem ser persistidos como ausência de mídia. A sessão pode sinalizar erro para invalidar uma entrada específica, com deduplicação de atualização. Métricas de hit, miss, evitadas, erro, latência e 429 podem ser agregadas sem registrar URLs. O backend distribuiria descoberta, sem armazenar ou retransmitir segmentos de mídia.

## Continuar a coleta

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
node scripts/coverage/run.mjs --titles 100 --sources ..\fontes.txt --out reports/nocta-cobertura-100
```

O comando reaproveita a amostra e as respostas válidas no diário dentro do TTL. Use `--report-only` para recalcular os CSVs a partir do disco sem consultar os serviços. `--budget-seconds` define uma janela de coleta e exporta parciais ao encerrar. A lista e o diário devem permanecer na mesma pasta para a retomada.

Arquivos de produção alterados: `src/playback/{coordinator,providers,discoveryCache}.ts` e `src/experimental/StremioAddonAdapter.ts`. Comparador: `scripts/coverage/{run,core,tmdb,core.node-test}.mjs`. Testes do app: `src/test/{playback-coordinator,native-candidates,discovery-cache}.test.ts`.

## Validação do aplicativo

- Vitest: 260 testes passaram, uma integração opcional foi ignorada. Node: 6 testes do comparador passaram. Os contratos existentes dos transportes Badger, Rubeo, Arthur e Malfoy permaneceram cobertos pela suíte.
- Edge: clipe controlado reproduziu no fluxo do player. Seleção de fontes, fullscreen nas duas orientações e restauração do inline passaram. O teste de fornecedores externos mediu descoberta.
- TypeScript, Vite, sync Capacitor e Gradle concluíram o APK debug. SHA-256 `5323122d4ca17412fe8e185b34282f5cded0dcea57b920d735001fb64d83bcbe`.
- Após a reconexão USB, o APK acima foi instalado no Samsung SM-S911B. Os clipes autorizados reproduziram no Media3 (MP4 e HLS) e no WebView (MP4), com imagem, áudio e avanço. A rotação retrato → paisagem → retrato manteve a sessão e registrou progresso em 4,773 s. Voltar restaurou ambas as barras do sistema, e a rolagem preservou o tamanho da superfície sem nova carga. As capturas e os eventos estão em `.cache/nocta-integracao`. A validação física desta rodada usou somente os clipes controlados. Os resultados físicos anteriores dos fornecedores ativos continuam documentados em [NOCTA_ESTABILIDADE_FINAL.md](NOCTA_ESTABILIDADE_FINAL.md).

```powershell
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```
