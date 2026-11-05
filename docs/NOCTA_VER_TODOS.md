# Ver todos e retomada do fornecedor — 03/11/2026

## Correção do bloqueio

O provider público voltou a ser `HybridPlaybackProvider`, que abre a integração EmbedMovies/MyEmbed existente. A ausência de API de inventário não bloqueia mais a tentativa pública. Details volta a oferecer Assistir para IDs TMDB válidos; a disponibilidade permanece informativa e desconhecida quando não há evidência. Watch informa que o vídeo não é confirmado antecipadamente. Sandbox e permissões do iframe foram preservados. Isso restaura o fluxo, mas não comprova reprodução, licença ou disponibilidade real de cada obra. O guard estrito continua disponível como classe opcional e em testes isolados; não é mais o provider público padrão.

## Telas e arquivos

- `src/domain/browse.ts`: query strings via URLSearchParams, coleção estável, tipo, gêneros, ano, ordem e página; critérios especiais vêm da configuração central de trilhos.
- `Carousel.tsx` e Home: todo trilho com resultados recebe Ver todos na linha do título, inclusive gêneros e especiais. Contexto é codificado na URL e funciona sem depender do state da navegação.
- `Search.tsx`: mesma rota `/buscar`, seletor de coleção, filtros preenchidos, alteração de critérios, páginas anterior/próxima e retry. Alterações usam replace para não criar uma pilha de telas de busca. Há botão Voltar que usa a entrada anterior quando disponível.
- `catalog.ts`: `searchPage` busca páginas completas no TMDB, não o recorte de 12 cards da Home. Discover aplica gênero/ano/ordenação remotamente; tendências preservam janela diária/semanal. Anime conserva animação + origem JP + idioma ja. A paginação respeita o limite de 500 páginas e o total retornado pela API.
- `ScrollMemory.tsx`, `Layout.tsx`, `useRailFeed.ts`: preservação em memória de scroll por entrada de histórico e quantidade de trilhos carregados. Ao voltar, a restauração aguarda o conteúdo crescer, por até 10 s. Não persiste entre reinicializações. O manipulador Android de Voltar e a barra inferior continuam compartilhando o mesmo router; não foi criada rota nativa paralela.
- `playback.ts`, `Details.tsx`, `Watch.tsx`: restauração da tentativa no fornecedor principal, com mensagem informativa sem promessa de disponibilidade.

Limite do contrato TMDB: tendências, populares e pesquisa textual não aceitam todos os filtros de Discover. Gênero/ano nesses modos refinam cada página retornada, com aviso explícito e navegação pelas páginas restantes; não representam um total global filtrado. Ao digitar texto na interface, a coleção é abandonada para uma busca textual. Em Discover, a seleção por gênero/ano é remota. Não se faz download antecipado de todas as páginas.

## Testes escritos — não executados

`src/test/browse.test.tsx` cobre terror/comédia de filmes, drama/comédia de séries, tendência semanal, classificação anime, múltiplos filtros, link direto, paginação remota e Voltar. Expectativas anteriores de bloqueio público foram ajustadas nos testes de disponibilidade e E2E. O guard opcional continua com seus próprios testes.

Conforme solicitado, **não foram executados testes, aplicativo, navegador, build web/Android ou instalação neste prompt**. Não se afirma que o código compilou ou que o fornecedor reproduziu uma obra. O APK existente continua sendo da entrega anterior.

## Atualizar pelo USB

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
npm run android:build
if ($LASTEXITCODE -ne 0) { throw 'Build falhou; instalação cancelada.' }
& 'C:\Users\PC\AppData\Local\Android\Sdk\platform-tools\adb.exe' -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```

Esse comando compila, sincroniza e instala a atualização quando o desenvolvedor o executar. Requer um único aparelho físico USB autorizado; preserva dados via `-r`.
