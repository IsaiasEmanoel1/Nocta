# Histórico e Continuar assistindo

Incremento no código-fonte. **Não foram executados testes, aplicativo, build web/Android ou instalação neste incremento**, respeitando a orientação anterior de deixar a atualização do telefone para o desenvolvedor. Os testes abaixo foram escritos e revisados estaticamente; não há resultado de aprovação nem comprovação de reprodução externa.

## Comportamento implementado

- `ContinueWatching.tsx` é compartilhado por Home, Filmes, Séries e Biblioteca. Na Home é o primeiro trilho abaixo da capa, inclusive durante carregamento/falha do catálogo. Filmes/Séries filtram pelo tipo salvo.
- Mostra capa com fallback local, título, temporada/episódio quando salvo e link direto para a seleção. O snapshot permite renderizar esses dados sem consultar o catálogo.
- Um título aparece uma única vez no trilho, usando seu registro mais recente. A seleção ocorre **antes** de excluir concluídos: concluir o episódio mais recente não faz um episódio antigo reaparecer.
- Remover pelo trilho apaga todos os episódios daquele título. Na Biblioteca, a exclusão é por registro/episódio; também há Limpar histórico. Favoritos são preservados.
- `/minha-lista?aba=history` abre diretamente o histórico, incluindo concluídos e ações manuais. Os rótulos acessíveis distinguem temporada e episódio.

## HTML5: progresso medido

O registro `playbackType: 'html5'` contém `positionMs`, `durationMs`, `updatedAt`, `media`, `episode?` e `completed`.

`VideoPlayer.tsx` lê exclusivamente `currentTime` e `duration` do elemento HTML5. Ignora tempo/duração inválidos e posições menores que um segundo. Gravações de `timeupdate` são limitadas a uma a cada cinco segundos; posições idênticas não geram nova escrita. Pausa, seek, erro observável, `pagehide`, documento oculto, evento de segundo plano do Capacitor e desmontagem salvam imediatamente quando há dados válidos.

A limpeza usa `useLayoutEffect` para capturar o elemento anterior antes da remoção ao sair/trocar episódio. O armazenamento é escrito no mesmo momento da alteração, sem depender de um efeito React posterior ao fechamento. Uma interrupção abrupta do processo ainda pode perder o intervalo desde o último checkpoint; não se promete persistência se o sistema matar o processo sem aviso.

Na entrada, `loadedmetadata`, `canplay`, mudança de duração e carregamento de dados tentam aplicar o segundo salvo. A posição é limitada à duração atual e aguardada quando as faixas `seekable` informadas ainda não a incluem. Falhas de seek não geram tempo fictício. A retomada depende de a fonte permitir buscar posição.

Foi mantido o critério existente de conclusão em **95%**, além do evento real `ended` e da ação manual. Concluídos saem do trilho, mas ficam no histórico. Ao reproduzir novamente desde antes do trecho final, o registro deixa de ser concluído e passa a acompanhar a nova sessão. Marcar um HTML5 concluído como não assistido reinicia seu checkpoint; o usuário pode abri-lo pelo histórico.

## Iframe: abertura, sem progresso presumido

O registro `playbackType: 'iframe'` contém somente `media`, `episode?`, `updatedAt` e `completed`. Não contém posição, duração ou porcentagem.

`Watch.tsx` registra a seleção quando uma sessão de iframe aceita passa a ser ativa. Uma tentativa sem sessão, uma resposta cancelada/obsoleta ou apenas uma seleção pendente não viram registro de abertura. Isso registra **que o player foi aberto**, não que o vídeo existe, começou ou foi visto. `iframe.onload` não é usado para medir sucesso ou conclusão.

O trilho exibe “Retomar episódio” ou “Retomar título”, sem barra. A abertura retoma a rota do episódio; **não retoma o minuto interno do fornecedor**. “Marcar como assistido” está disponível no player, no trilho e na Biblioteca. Abrir explicitamente uma seleção já marcada inicia um novo registro de abertura não concluído.

A integração atual não tem um contrato de progresso documentado implementado. Nenhum listener de mensagens arbitrárias foi adicionado. Se futuramente houver API oficial, seu adaptador deverá validar origem, formato e identificação da sessão antes de transformar eventos em progresso real. As restrições do iframe e o provider principal EmbedMovies/MyEmbed foram preservados.

## Armazenamento e migração

`LibraryProvider` passa a gravar `nocta.library.v2`, com `version: 2`. Primeiro tenta ler v2 válido; na ausência/corrupção, tenta v1. O leitor aceita snapshots v1/v2, normaliza imagens/campos básicos, elimina favoritos duplicados, valida os números de episódio, rejeita chaves incompatíveis e descarta tempos inválidos. Campos numéricos indevidos de registros explicitamente iframe são removidos.

Durante a migração, v1 permanece intacto como recuperação; não é sobrescrito pela gravação de v2. **Após uma exclusão manual bem-sucedida em v2, o backup v1 é removido**, impedindo que uma recuperação posterior ressuscite registros excluídos. Favoritos válidos continuam em v2. Se a gravação falhar, o backup não é removido e aparece o aviso de armazenamento.

As chaves são `mediaId` para filme e `mediaId:sN:eN` para episódio. A biblioteca permanece local ao dispositivo/origem e recebe atualizações de outras abas pelo evento `storage`. Alterações na mesma instância atualizam Home/Biblioteca via contexto React.

## Offline e ciclo Android

Home e histórico usam os snapshots salvos, incluindo fallback de imagem local. Se a consulta de detalhes falhar, Watch usa um snapshot do histórico ou favorito para montar a seleção. Isso **não disponibiliza o vídeo offline**, nem salva todos os episódios/metadados de temporada. Imagens remotas e temporadas não previamente disponíveis podem continuar dependendo da rede.

`AndroidLifecycle.tsx` continua emitindo `nocta:background` quando o Capacitor informa app inativo. HTML5 salva e pausa; retornar não solicita autoplay nem altera o checkpoint. O funcionamento desse evento no telefone físico continua pendente de validação. Nenhum iframe externo foi executado nesta alteração.

## Testes preparados, não executados

`src/test/history.test.tsx` acrescenta 14 cenários simulados:

1. Migração v1, backup, favoritos duplicados e registros quebrados.
2. Recuperação de v2 corrompido e descarte de tempos de iframe.
3. Reentrada e retomada do episódio sem barra fictícia.
4. Deduplicação por título, filtro movie/tv e remoção dos episódios antigos.
5. Marcação manual de iframe e reabertura explícita.
6. Limpar histórico preservando favoritos e impedindo recuperação do backup excluído.
7. Exclusão individual de episódio na Biblioteca.
8. Atualização imediata de Home/Filmes/Séries com catálogo offline.
9. Limite de gravações e checkpoint ao pausar/ir ao fundo/retornar.
10. Documento oculto, pagehide, troca de episódio, saída e restauração.
11. Espera por faixa de seek disponível.
12. Filme concluído e replay na mesma tela ou após reentrada.
13. Watch com metadados locais; load/mensagens do iframe não significam conclusão.
14. Sessão indisponível não cria histórico de abertura.

Os testes existentes de navegação de episódios também verificam registros separados ao trocar iframe. As fixtures usam sessões sintéticas e `example.invalid`; isso não comprova reprodução externa ou comportamento real do WebView.

Comando para executar localmente os testes focados:

```powershell
npm test -- --maxWorkers=1 src/test/history.test.tsx src/test/playback-library.test.tsx src/test/episode-navigation.test.tsx src/test/home-catalog.test.tsx src/test/android.test.tsx src/test/availability.test.tsx
```

Validação física ainda pendente: reproduzir uma amostra HTML5 autorizada, pausar e reabrir, usar Home do Android e retornar, trocar episódio, concluir, remover, reiniciar o app e conferir os snapshots sem conexão. Para iframe, conferir somente o episódio aberto e a marcação manual, sem esperar minuto/porcentagem.

## Arquivos deste incremento

- `src/state/library.tsx`: tipos, migração, persistência e ações de histórico.
- `src/components/ContinueWatching.tsx`: trilho compartilhado.
- `src/pages/Home.tsx`: reutilização do trilho com filtro de tipo.
- `src/pages/Library.tsx`: aba por URL, estado real de histórico e ações por episódio.
- `src/components/VideoPlayer.tsx`: checkpoints, seek e replay.
- `src/pages/Watch.tsx`: abertura de iframe e fallback de metadados salvos.
- `src/styles.css`: ações de histórico com áreas de toque de 48px.
- `src/test/history.test.tsx`, `src/test/episode-navigation.test.tsx`: cenários novos/ampliados.
- `src/test/availability.test.tsx`, `e2e/platform.spec.ts`: chave de storage atualizada.
- `README.md` e este documento.

`usePlaybackSession.ts` foi revisado e preservado: já ignora respostas obsoletas/canceladas e mantém a sessão anterior enquanto outra é preparada. O histórico é gravado somente a partir da sessão ativa aceita em Watch.
