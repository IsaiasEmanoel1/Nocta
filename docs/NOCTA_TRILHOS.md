# NOCTA — trilhos TMDB e atualização Android

Data: 03/11/2026. Incremento no aplicativo existente, sem alteração de identidade visual.

## Catálogo implementado

A configuração editorial única está em `src/config/catalogRails.ts`. Cada `RailSpec` contém id, título, mediaType (`movie`, `tv`, `all`), origem (`trending`, `popular`, `discover`), janela diária/semanal, gêneros, ordenação, parâmetros adicionais e contexto serializável `browse` para a futura tela de Ver todos. `CatalogRail` transporta esse contexto até `Carousel`. A ação completa por trilho fica para o prompt 03; não foi criada uma nova página nem uma falsa paginação. O atalho de busca já existente no destaque continua funcionando.

- **Início:** até 26 trilhos de metadados: tendências do dia/semana, populares de filmes/séries, ação, comédia, terror/suspense, romance, sci-fi, aventura, animação, documentários, família, fantasia, crime e os trilhos de TV abaixo.
- **Filmes:** até 16 trilhos, exclusivamente movie, incluindo terror e suspense separados, família, fantasia e crime.
- **Séries:** até 14 trilhos, exclusivamente tv: tendências, populares, drama, policiais, comédia, mistério, anime, novelas, sci-fi/fantasia, animação, reality, ação/aventura e documentais.
- **Continuar assistindo:** preservado como primeiro trilho abaixo da capa, quando houver progresso local elegível.
- **Recomendados para você:** não há motor pronto neste incremento; nenhum trilho vazio ou recomendação inventada é apresentado.

As quantidades são máximos configurados. Respostas vazias/filtradas não geram carrossel. Todos os pedidos ao TMDB continuam com `language=pt-BR`. O catálogo é só metadados; o gate de disponibilidade de reprodução anterior permanece intacto.

### Classificação correta

Mapas `movieGenres` e `tvGenres` são separados. Ficção científica de filme é 878 e fantasia de filme é 14; TV usa o gênero combinado 10765. Não foram criados IDs fictícios para separar o combinado de TV. Ação/aventura de TV usa 10759, em vez de copiar 28/12 do cinema.

Novelas usa o gênero **10766 — Soap**, confirmado nesta execução pela lista real de gêneros TV do TMDB com resposta HTTP 200, em português. O trilho segue a taxonomia Soap do TMDB; não promete uma curadoria exclusiva de novelas brasileiras e não classifica drama (18) como novela. Anime usa animação (16), origem JP e idioma ja: aproximação explícita que pode excluir coproduções ou outros animes. A qualidade dessa classificação também depende dos metadados do TMDB.

Fontes: [gêneros TV](https://developer.themoviedb.org/reference/genre-tv-list), [gêneros de filmes](https://developer.themoviedb.org/reference/genre-movie-list), [Discover TV](https://developer.themoviedb.org/reference/discover-tv).

## Carregamento, cache e erro

`useRailFeed.ts` solicita quatro novos trilhos por etapa. `IntersectionObserver` antecipa a próxima etapa a 500 px do fim, após a etapa atual concluir. Existe botão de carregamento adicional para teclado e ambientes sem observer. São no máximo três jobs de trilho ativos; `CatalogRequestCache` limita também o total de requisições reais simultâneas a três, incluindo destaque e chamadas compartilhadas.

Resultados são publicados individualmente, na ordem configurada. Skeletons mantêm a área dos trilhos pendentes; uma falha apresenta retry isolado e não apaga os resultados dos demais. Uma troca de aba cancela o consumidor anterior; requisições compartilhadas já iniciadas podem concluir para alimentar o cache sem cancelar o trabalho de outra tela.

Cache em memória, até 100 respostas: tendências por 2 minutos; demais consultas por 5 minutos. Chamadas idênticas em andamento compartilham o mesmo pedido. Após expirar, tenta atualizar; se a rede falhar, uma resposta anterior pode ser usada por até 30 minutos, com aviso nos trilhos. Erros não renovam a validade. Reabrir/recarregar o aplicativo perde esse cache; não foi implementado catálogo offline persistente. Tendências são renovadas na próxima consulta após expiração, sem prometer atualização contínua do feed parado na tela.

Cada trilho mostra até 12 títulos. Itens ausentes do trilho anterior ganham prioridade, e sobreposições são deslocadas para o fim. Isso reduz repetição adjacente sem esvaziar gêneros pequenos nem remover globalmente obras relevantes. Capas, notas, ano e fallback de imagem existentes foram preservados.

## Arquivos principais

- `src/config/catalogRails.ts`: configuração, mapeamentos e tradução de spec em pedido TMDB.
- `src/domain/media.ts`: tipos `RailSpec`, `RailContext`, métodos opcionais de rail no CatalogProvider.
- `src/services/catalogCache.ts`: limite de concorrência, cache, compartilhamento e fallback temporário.
- `src/services/catalog.ts`: consultas reais, mapeamento e contrato legado preservado.
- `src/hooks/useRailFeed.ts`: carregamento progressivo, cancelamento e retry.
- `src/pages/Home.tsx`: destaque, biblioteca, trilhos, reordenação de duplicatas e sentinela.
- `src/components/RailSkeleton.tsx`, `Carousel.tsx`, `src/styles.css`: apresentação original e carregamento acessível.
- `src/test/catalog-rails.test.tsx`, `catalog.test.ts`, `e2e/platform.spec.ts`: cobertura e expectativas atualizadas.

## Verificação efetiva

- **94 testes aprovados em 12 arquivos** na suíte completa. Seis novos testes cobrem seleção movie/tv, mapas de gênero e contexto, Soap/anime, renovação de tendências, cache expirado/offline, deduplicação/cancelamento de chamadas, teto de três requisições, resultados parciais, skeletons, vazios, próximo lote e retry. Após a consolidação final de título/filtro, os 23 testes de catálogo/Home foram aprovados novamente.
- **3 cenários móveis de navegador aprovados**, com respostas TMDB simuladas: navegação/favoritos/busca, Continue assistindo e carregamento progressivo até Novelas com títulos longos, ausência de overflow, alternância de tipos e navegação com rede indisponível usando cache. Não houve acesso a players externos.
- **Build web, sincronização Capacitor e build debug Android concluídos.** Sem emulador.
- **Instalação via USB concluída no Samsung SM-S911B conectado**, preservando dados (`adb install -r`). O Nocta abriu com `Status: ok`; a primeira abertura fria reportou 1.379 ms de Activity, o que não mede o tempo completo do catálogo.
- **Conferência física com TMDB real:** capa/listas carregadas, rolagem vertical e horizontal, trilhos de tendências, gêneros, Filmes e Séries, cartazes, metadados e títulos longos. Capturas de app em `.cache/nocta-home-rails.png`, `nocta-scroll-check.png`, `nocta-later-rails.png`, `nocta-movies-live.png`, `nocta-series-live.png`. O aparelho bloqueou durante a primeira tentativa de rolagem; essa captura foi descartada como evidência. Após o usuário desbloquear, a conferência foi retomada.

Limites: skeletons e perda de rede foram validados em testes controlados, não cortando a conectividade do telefone. Não foram medidos FPS, consumo de bateria ou desempenho sob rede móvel fraca. Não foi testada reprodução externa ou autorização de obras. O gate que mostra disponibilidade não confirmada continua operando; não foi contornado para este incremento.

## Instalação rápida em próximas atualizações

O fluxo não desinstala nem limpa dados. Se o telefone não estiver conectado/autorizado, executar após conectar:

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
npm run android:build
if ($LASTEXITCODE -ne 0) { throw 'Build falhou; não instalar APK anterior.' }
& 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe' -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```

Exige JDK 21/SDK 35 e autorização USB, conforme `TESTE_USB.md`. O hash do APK final desta entrega fica no registro de fechamento abaixo.

### APK final

Caminho: `C:\Users\PC\Desktop\fuzz\android\app\build\outputs\apk\debug\app-debug.apk`.

SHA-256: `af08b7e69aea931e4c1b151e7e02257f2c03930ece150e9c8dfb6cdb7e6ca83d`. Tamanho: 4535557 bytes. Comparação do pacote: 31 arquivos de dist dentro do APK, 0 divergências.


### Situação da instalação final

O primeiro build deste incremento foi instalado e usado para a conferência física descrita acima. Depois de consolidar o título do destaque na configuração única e adicionar um filtro defensivo de tipo durante a troca de abas, foi gerado o APK final cujo hash aparece acima. **O aparelho desconectou antes de instalar esse último binário** (`device not found`). Não se afirma que o hash final esteja instalado. Não houve limpeza de dados ou desinstalação. Basta reconectar/autorizar e executar:

```powershell
& 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe' -d install -r 'C:\Users\PC\Desktop\fuzz\android\app\build\outputs\apk\debug\app-debug.apk'
```
