# Player e informações da obra

O iframe usa por padrão o antigo viewport confortável: 65svh (máximo 520px) no desktop e 55svh (máximo 440px) no celular. Em landscape baixo usa 78svh. O CSS dimensiona diretamente o iframe, sem canvas de 640px, transform, ResizeObserver ou estado de ampliação. Não há botão externo de ampliação/fullscreen. `allowFullScreen`, a política de permissões e o sandbox foram preservados; os controles internos continuam sob responsabilidade do fornecedor.

Watch apresenta PlaybackDetails aberto por padrão: cartaz, título/original, ano, duração, nota identificada como TMDB, gêneros, sinopse completa, elenco com fotos/personagens, direção/criação quando informadas e recomendações. O seletor de temporadas/episódios existente continua montado. A antiga área de créditos do iframe e o resumo duplicado foram removidos. As atribuições de amostras HTML5 licenciadas permanecem discretas para preservar suas licenças.

O contrato Media acrescenta directors, creators e recommendations opcionais. O serviço de catálogo inclui credits e recommendations na mesma consulta de detalhes, mantendo pt-BR e o cache existente de cinco minutos. Recomendações passam pelo validador de metadados e pela exclusão temporária de mídia com falha; não representam confirmação de vídeo. Não há requisições disparadas por render em PlaybackDetails.

Referências oficiais consultadas: [append_to_response](https://developer.themoviedb.org/docs/append-to-response) e [recomendações de filmes](https://developer.themoviedb.org/reference/movie-recommendations).

Validação desta alteração: revisão estática; três testes de apresentação preparados e testes antigos ajustados para os controles removidos. Não foram executados testes, build, reprodução externa ou instalação, mantendo a orientação anterior do desenvolvedor. Também não foi verificado o WebView no aparelho. O fullscreen permitido não garante que o fornecedor o exponha ou que o navegador o aceite.

Conferência pendente no telefone: abrir em retrato, girar para landscape e retornar; acionar fullscreen pelo próprio vídeo; usar Voltar para sair do fullscreen antes de navegar; rolar sinopse/elenco/recomendações; trocar episódio; conferir que expandir/recolher os detalhes não recarrega o iframe. O Nocta não modifica o documento interno do fornecedor.

Testes focados para execução pelo desenvolvedor:

```powershell
npm test -- --maxWorkers=1 src/test/watch-presentation.test.tsx src/test/episode-navigation.test.tsx src/test/history.test.tsx src/test/catalog.test.ts
```

Arquivos: src/pages/Watch.tsx, src/components/IframePlayer.tsx, src/components/PlaybackDetails.tsx, src/styles.css, src/domain/media.ts, src/services/catalog.ts, src/test/watch-presentation.test.tsx, src/test/episode-navigation.test.tsx e este documento. O pacote Android existente não foi atualizado.
