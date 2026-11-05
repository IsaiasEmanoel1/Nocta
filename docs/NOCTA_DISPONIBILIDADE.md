# Disponibilidade de reprodução — 03/11/2026

## O que foi localizado no fornecedor

O [guia oficial EmbedMovies](https://embedmovies.org/#guia-rapido) documenta incorporação por URL de filme e episódio e informa que não fornece links diretos de mídia. Não foi localizada nessa documentação uma API de inventário por título/temporada/episódio, nem eventos de progresso ou início real. O link oficial [Status do Serviço](https://embedmovies.org/api-status), aberto a partir do guia, devolveu uma página “404 / Página não encontrada” na consulta. Uma página geral de status, mesmo funcionando, não confirmaria disponibilidade de cada obra.

Não foram inventados endpoints, parâmetros ou uma sondagem de HTML. Não foram abertos players nem pesquisados outros catálogos. A ausência de API localizada não prova que nenhum acordo privado ou API não publicada exista; seria necessário obter do fornecedor um contrato documentado de inventário/status, com escopo, atualização, autenticação e condições de uso.

## Implementação

- `src/services/availability.ts`: `AvailabilityService`, requisição por `mediaId` e seleção opcional `{seasonNumber, episodeNumber}`, registros com `key`, `status`, `source`, `checkedAt` e `expiresAt` (timestamps em ms; null antes de uma verificação).
- Estados: `unknown` antes de confirmar ou após expiração; `checking` durante a verificação; `available`/`unavailable` somente retornados pelo checker; `error` em exceção, timeout ou evidência inválida. Observação local de falha de mídia pode confirmar indisponibilidade da seleção, não do acervo completo.
- Cache em memória, por chave composta de título/episódio: validade indicada pelo checker limitada a 5 minutos; desconhecido atual dura 60 s; erro dura 10 s. Verificação tem timeout de 10 s, suporta cancelamento e protege o cache contra respostas fora de ordem. Nenhum registro persiste como prova permanente em localStorage.
- O checker público atual retorna `unknown`, fonte `embedmovies-no-documented-inventory`, ou `unavailable` quando há falha local registrada para a seleção. Não retorna `available` por ID TMDB, URL ou `iframe.onload`. Não consulta rede.
- `AvailabilityGuardedProvider` protege o provider público em `playback.ts`: força revalidação antes da resolução, exige confirmação vigente, verifica novamente expiração/cancelamento após resolver a sessão e exige seleção de episódio para série. O adaptador híbrido continua isolado para construir URLs; sua construção não é o gate nem evidência. IDs malformados não recebem mais fallback pelo primeiro número encontrado.
- `EmbedMovieProvider.assess`, caminho alternativo existente, também consulta disponibilidade e nega seleção não confirmada. EmbedWave mantém seu contrato de direitos separado.
- `usePlaybackSession` não limpa mais falhas só por receber uma sessão. HTML5 continua limpando falha quando dispara `playing`. Desconhecimento e erro de verificação não são marcados como falha de mídia.
- Details consulta disponibilidade sem tentar resolver mídia. Mostra estado discreto, permite verificar novamente, atualiza ao expirar e só oferece Assistir quando a confirmação está vigente. Cada episódio tem consulta própria. Uma confirmação global da série não libera seus episódios.
- Watch direto também passa pelo gate, preserva metadados, detalhes, seletor e exploração quando bloqueado. Não monta vídeo/iframe nem anúncio com estado desconhecido, indisponível ou erro. A tentativa não apaga biblioteca nem marca a série inteira como falha. Nenhuma publicidade foi implementada.
- A alternativa de descoberta usa a busca já existente pelo mesmo gênero; não é um novo catálogo ou motor de recomendações. Seus filtros continuam sujeitos à limitação atual de primeira página.

**Mudança intencional:** todos os títulos MyEmbed sem confirmação verificável ficam bloqueados para reprodução pública, com “Disponibilidade não confirmada”. Favoritos, descoberta, histórico e detalhes continuam acessíveis. Não esconder todo o catálogo como se `unknown` significasse `unavailable`.

## O que a confirmação não significa

Disponibilidade e autorização de exibição são decisões diferentes. O serviço de disponibilidade não prova licença e não substitui o gate jurídico/contratual. Um futuro checker deve receber evidência confiável; não há botão de autodeclaração de disponibilidade, parâmetro de URL para liberar reprodução ou fallback que contorne o gate. Testes podem injetar checkers; isso não é prova sobre o fornecedor real.

O diagnóstico de demonstrações mantém seus providers explícitos e separados, como antes. A existência de um MP4 público autorizado conhecido historicamente não foi convertida em confirmação atual de disponibilidade do host remoto.

## Verificação e limites

`npm test`: **88 testes passaram em 11 arquivos**. Os 11 novos casos em `availability.test.tsx` cobrem estados, fonte/timestamps, cache válido/expirado, revalidação mesmo com cache positivo, falha de rede simulada, recuperação forçada, episódio isolado, bloqueio antes de resolver mídia, Details e tentativa por rota direta. Testes existentes de navegação, persistência, episódios, iframe e diagnóstico continuam passando.

O fluxo positivo foi exercitado em jsdom com confirmação **sintética**, provider explícito de demonstração, eventos HTML5 simulados e persistência de progresso. Nenhuma reprodução remota real foi realizada ou comprovada; não se afirma que o host de demonstração respondeu ou que houve decodificação de vídeo. Falha de rede também foi simulada, sem requisições a servidores de mídia.

TypeScript e Vite passaram em `npm run build`. Os E2E foram alinhados ao novo bloqueio de mídia não confirmada, mas não foram executados nesta etapa. Nenhum teste nativo, emulador, instalação USB ou novo APK. Após esta alteração, o APK anterior não contém o novo gate até reconstrução e instalação; usar o fluxo de `TESTE_USB.md`.

Sem inventário oficial ou protocolo verificável do fornecedor, continuam impossíveis de afirmar: existência de vídeo por título/episódio, início efetivo no iframe, posição assistida, início dos créditos, falhas internas e avanço automático por eventos externos. HTTP bem-sucedido da página, URL válida, metadado no TMDB e evento load do iframe não resolvem essas limitações.
