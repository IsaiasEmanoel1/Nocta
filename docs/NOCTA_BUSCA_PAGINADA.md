# Pesquisa global e Ver mais — 03/11/2026

## Contrato e experiência

`CatalogPage` inclui `items`, `page`, `totalPages`, `totalResults`, `hasMore` e `nextPage`. Totais podem ser `null` quando o TMDB não fornece o total da seleção efetivamente filtrada. `page` identifica a última página remota lida; não se inventa uma página virtual. `nextPage` permite continuar após uma varredura de mais de uma página.

Na tela `/buscar`, Ver mais anexa resultados, elimina IDs repetidos e desaparece na última página. Existe trava síncrona contra toques simultâneos. Falhas mantêm os cards e repetem a página que falhou. Trocar filtros cancela o consumidor anterior e impede respostas antigas de entrarem na seleção nova. A digitação tem debounce de 350 ms. Não há scroll-to-top ao anexar cards nem alteração de rota por cada página carregada.

Ano, início/fim do período e origem são campos livres, com validação; não há lista curta fixa de anos. Origem usa código ISO de duas letras, como BR ou JP. Campos incompletos/inválidos recebem mensagem, sem ignorar o critério silenciosamente. A origem do anime é exibida como JP; alterar esse critério abandona a classificação especial para uma exploração de animação com origem explícita.

Os resultados acumulados são guardados em memória por dois minutos, com no máximo 12 consultas. Ao voltar de detalhes, são reapresentados sem recomeçar na primeira página enquanto o cache estiver válido, permitindo ao ScrollMemory restaurar a posição. Após expiração ou reinício do app não há promessa de restauração completa. O cache compartilhado de requisições existente continua com limite de três consultas simultâneas. Cancelar uma tela não interrompe uma requisição compartilhada necessária a outra.

## Estratégia por capacidade real do TMDB

| Situação | Estratégia |
|---|---|
| Sem termo, tipo específico | Discover por tipo; gênero, ano/período, origem e ordenação enviados remotamente. |
| Sem termo, filmes e séries | Discover movie/tv em paralelo limitado; mapas de gênero separados. Cada tipo mantém a ordenação remota própria, e a interface informa que a combinação por página não é um ranking global único. |
| Termo e tipo | Search movie/tv, com ano único remoto quando selecionado. Relevância do TMDB. |
| Termo sem tipo | Search multi, descartando pessoas. Totais não são apresentados como totais de filmes/séries porque o total multi inclui pessoas. |
| Termo + gênero/período | Varredura progressiva das páginas remotas, até três páginas por toque ou até obter correspondências. Totais filtrados ficam desconhecidos; Ver mais continua até acabar a origem. Não se limita aos cards da Home ou à primeira página. |
| Coleção de tendência/popular com gênero/período | Mesma varredura limitada sobre a coleção original, preservando sua pertinência e sua ordem. |
| Termo + origem, ou ordenação global por nota/data no search | Combinação não oferecida silenciosamente. Há mensagem para remover o termo e usar Discover, ou usar relevância. Não se consulta detalhe de dezenas de obras para tentar adivinhar origem. |
| Tendência/popular com origem ou outra ordenação | Mensagem para trocar a coleção por exploração Discover, em vez de fingir aplicar parâmetro não suportado. |
| Anime/novelas via Ver todos | Identificador estável do prompt 03, resolvido pela configuração de trilhos. Anime conserva animação/origem JP/idioma ja; novelas conservam Soap. |

Vazios num lote filtrado não significam fim da busca: a mensagem orienta Ver mais quando ainda houver páginas. Os limites máximos do TMDB continuam respeitados (até 500 páginas). Totais numéricos apresentados são os informados pelo serviço remoto, antes da validação defensiva de registros/imagens, não uma previsão de vídeos disponíveis. Respostas antigas usadas como fallback de transporte não são apresentadas silenciosamente como uma nova página atualizada: a busca oferece retry.

Referências oficiais consultadas: [Search Movie](https://developer.themoviedb.org/reference/search-movie), [Search TV](https://developer.themoviedb.org/reference/search-tv), [Discover Movie](https://developer.themoviedb.org/reference/discover-movie), [Discover TV](https://developer.themoviedb.org/reference/discover-tv).

## Arquivos e verificação

- `src/domain/media.ts`: contrato paginado.
- `src/domain/browse.ts`: parâmetros compartilhados, período/origem e URLs anteriores preservadas.
- `src/services/catalog.ts`: roteamento de consultas, filtros remotos, varredura quando necessário, limites e totais honestos.
- `src/hooks/useSearchFeed.ts`: acumulação, cache da tela, cancelamento, lock e retry.
- `src/pages/Search.tsx`, `src/styles.css`: Ver mais, campos livres, estados e alvos de toque.
- `src/test/search-pagination.test.tsx`: testes escritos para três páginas, duplicatas, fim, toques simultâneos, falha/retry, filtros rápidos, debounce, critérios combinados, Ver todos/anime e retorno/scroll.

Conforme a orientação vigente, **testes não foram executados**, nem o aplicativo, navegador, build web/Android ou instalação. Não há resultado de aprovação/compilação a afirmar neste prompt. A revisão feita foi somente estática; a reprodução EmbedMovies reabilitada no incremento anterior foi preservada.

## Atualizar no celular USB

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
npm run android:build
if ($LASTEXITCODE -ne 0) { throw 'Build falhou; instalação cancelada.' }
& 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe' -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```
