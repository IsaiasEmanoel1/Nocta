# Cache do Nocta

## Descoberta no aparelho

O Nocta compartilha requisições simultâneas idênticas e mantém manifestos cacheáveis pelo prazo indicado na resposta, limitado a cinco minutos. As candidatas aceitas ficam por até 30 segundos na memória da aplicação. A chave inclui título TMDB, IMDb quando conhecido, episódio, perfil do fornecedor e transporte disponível. Cada candidata mantém a declaração de idioma. Uma fonte que falha é invalidada individualmente. Resultados negativos, respostas privadas e fontes com query na URL ou cabeçalhos especiais ficam fora desse cache de candidatas.

O VêTela usa uma fila para as requisições à origem da API do complemento. Manifesto, descoberta e demais chamadas do adaptador ao mesmo host compartilham dez envios em 60 segundos e uma requisição ativa por vez. O `Retry-After` pode adiar a janela. Uma consulta cancelada na fila não consome cota. A janela fica no armazenamento do aparelho. A contagem se limita aos envios do aplicativo ao host da API e não inclui transferências para CDNs de mídia.

## Retomada de reprodução

O descritor da última fonte com avanço confirmado tem prioridade sobre as candidatas da descoberta. Ele fica só em memória, separado por temporada, episódio, configuração e transporte. A validade usa o menor prazo entre o cache da resposta do addon, a expiração declarada ou identificada na URL e 60 segundos desde o último avanço confirmado. Para uma URL com query e validade desconhecida, o teto é de 30 segundos desde a descoberta. A retomada não repete a consulta do addon nem a sondagem prévia de redirecionamento. Falhas descartam a entrada e retomam a busca normal.

## Mídia autorizada no Android

Para habilitar o cache de uma fonte MP4 que o operador tenha autorização para armazenar, configure `VITE_NOCTA_CACHEABLE_MEDIA_URL` com a URL HTTPS exata antes de compilar o APK experimental. A URL deve ser pública, estável e sem query. Use apenas uma URL adequada para ser incluída no código do APK. O Media3 grava somente trechos efetivamente solicitados, quando a resposta direta é pública e sua validade restante é de pelo menos uma hora. O limite é de 200 MiB, com remoção dos trechos menos usados recentemente. O caminho de reprodução continua pela rede quando o cache não se aplica.

## Proposta de cache coletivo

O projeto atual usa cache local de catálogo e de descoberta. O servidor controlado do laboratório serve dados de teste. Para uma futura versão com infraestrutura compartilhada, um cache pequeno de metadados pode usar chaves de consulta sem credenciais e o TTL da origem. Resultados positivos públicos podem ser compartilhados, e respostas negativas devem ter prazo menor. Uma requisição em andamento por chave evita rajadas simultâneas. URLs privadas, manifestos personalizados, credenciais e mídia devem ficar fora desse serviço.
