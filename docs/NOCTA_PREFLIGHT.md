# Verificação prévia de fontes

A tela experimental mantém o adaptador e VideoPlayer existentes. Novo módulo sourcePreflight.ts faz GET CORS de playlists HLS permitidas, com timeout de 3,5 segundos, no máximo duas verificações simultâneas e limite de 64 KiB. Não usa HEAD como prova, não baixa segmentos e não altera redirects, certificados ou headers especiais. O MP4 Badger não recebe sondagem prévia e mantém seu caminho de reprodução normal.

Há cinco classificações na seleção: reprodução verificada (somente pelo progresso real do player), compatível não verificada, incompatível web, temporariamente indisponível e formato desconhecido. Fontes compatíveis ficam primeiro; as demais ficam em Outras fontes. Cada HLS permite Verificar novamente. O cache dura 30 segundos para resultados compatíveis e 10 segundos para falhas; a ação manual ignora o cache. Trocar título/configuração cancela a consulta e evita aplicar resultados antigos.

Arthur: proxyHeaders é evidência explícita de requisito não suportado pelo caminho web; não se faz requisição de playlist. notWebReady permanece uma declaração, não comprovação de disponibilidade. Rubeo: quando retornado, continua como HLS e pode ser verificado. Zunder: TypeError de fetch não identifica CORS com certeza; é mostrado como falha temporária de rede/redirect/CORS não distinguível. HTTP 403/404/5xx preservam o status quando legível. HTML com HTTP 200 não é aceito como playlist HLS. Badger: formato MP4 reconhecido e reprodução só confirmada por avanço real, sem sondagem de seus redirects.

Playlist acessível não confirma segmentos, chaves, codecs, áudio ou reprodução. A interface mostra essas etapas separadamente. Os segmentos ficam explicitamente como não verificados até o player fazer seu carregamento normal; não há promessa de cobertura de todos os segmentos nem inferência de playback a partir de HTTP 200.

Arquivos alterados/criados:

- src/experimental/sourcePreflight.ts: classificação e fila/cache/verificação leve.
- src/pages/StremioExperiment.tsx: verificação progressiva, ordenação, Outras fontes e nova tentativa.
- src/test/source-preflight.test.ts: seis testes novos para GET/cache/retry, concorrência, timeout, tamanho, cancelamento e distinção de erros.
- docs/NOCTA_PREFLIGHT.md: este documento.

Validação: 53 testes passaram em cinco suítes focadas (preflight, diagnóstico, adaptador, biblioteca e episódios). Build TypeScript/Vite passou; permanece o aviso de tamanho do chunk HLS. Não foi executada a suíte completa do projeto.

Conferência ao vivo: a consulta atual a Black Clover T1/E1 não retornou Rubeo; retornou fontes com cabeçalhos especiais, classificadas em Outras fontes com motivo. Não se reutilizou o sucesso Rubeo de etapas anteriores como resultado novo. As verificações do classificador cobrem o caminho HLS/Rubeo; sua regra e o player não foram alterados. Evidência de navegação, quando concluída, fica em .cache/fenix-preflight-browser.json.

Para testar:

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
$env:VITE_ENABLE_STREMIO_EXPERIMENT='true'
npm run dev -- --port 5176
```

Abra http://127.0.0.1:5176/configuracoes, habilite o experimento, selecione fenixflix-diagnostics e consulte o título. Confira os motivos em Outras fontes; em falhas temporárias HLS use Verificar novamente. Para Badger, use Os Simpsons, tt0096697, T1/E1, se o serviço retornar essa fonte.

```powershell
npm test -- --maxWorkers=1 src/test/source-preflight.test.ts src/test/source-diagnostics.test.ts src/test/stremio-adapter.test.ts src/test/playback-library.test.tsx src/test/episode-navigation.test.tsx
npm run build
```

Não foram modificados Home, EmbedMovies, catálogo, favoritos, player, proxies ou design principal. A disponibilidade externa pode variar entre consultas.

Na mesma conferência, Os Simpsons T1/E1 retornou lista vazia, portanto o Badger não pôde ser reproduzido novamente nesta execução. Não houve nova comprovação de reprodução externa nesta etapa; os resultados de playback anteriores permanecem históricos. Nenhuma classificação de sucesso foi inventada para esses retornos.
