# Nocta — Descoberta de fontes e encerramento do fallback

Investigação de 5 de novembro de 2026. A rodada anterior está em [NOCTA_INTEGRACAO_E_CACHE.md](NOCTA_INTEGRACAO_E_CACHE.md). Esta rodada usou nove títulos específicos.

## Estado do aplicativo

- **Ativos na reprodução normal**: FenixFlix e Brazuca Play.
- **Reserva configurável**: Zeus `org.zeus.community` em `zeus-br.shardweb.app`, desligado no APK padrão. A variável existente `VITE_ENABLE_ZEUS_RESERVE=true` habilita o perfil em uma compilação explícita. Nenhum perfil Zeus foi escolhido como vencedor de reprodução.
- **Diagnóstico**: BsCine, Magnetflix, Zeus `org.zeus.community.beta` e VêTela. As respostas foram analisadas sem abrir URLs de mídia. O usuário informou que não dispõe de uma amostra com autorização confirmada desses perfis. O requisito de quadro, áudio e progresso em aparelho antes da ativação permanece pendente.
- **EmbedMovies**: desativado na descoberta automática por padrão. O código de resolução e iframe pode ser reabilitado na compilação com `VITE_ENABLE_EMBEDMOVIES_FALLBACK=true`. O APK desta entrega foi compilado com a opção desligada.

O coordenador mantém a ordem FenixFlix → Brazuca → BsCine → Magnetflix → Zeus → VêTela para perfis habilitados. Os reservas são consultados só quando a seleção chega a eles. As tentativas continuam por fontes distintas e respeitam a preferência de idioma. O VêTela conserva o teto local de 10 requisições por minuto para o perfil conhecido e o tratamento de HTTP 429 e `Retry-After`. Um limite no aparelho não coordena a cota de outros usuários. Cache, deduplicação e nomes numerados no player continuam em uso.

## Metadados confirmados

| Caso | TMDB | IMDb | Episódio TMDB |
| --- | ---: | --- | --- |
| O Incrível Mundo de Gumball T1/E1 | 37606 | tt1942683 | 850202, O DVD |
| The Witch and the Beast T1/E1 | 208445 | tt30089363 | 3902740, A Bruxa e a Cidade Ardente |
| Patrulha Canina T1/E1 | 57532 | tt3121722 | 943007, Os filhotes e a gatásfrofe |
| Um Trabalho do Inferno T1/E1 | 289517 | tt36458668 | 6154166, Regras da loja de conveniência |
| Flash (2014) T1/E3 | 60735 | tt3107288 | 1005651, O Que Não dá Para Ultrapassar |
| Os Simpsons T1/E1 | 456 | tt0096697 | 62228, O Prêmio de Natal |
| Rio (2011) | 46195 | tt1436562 | Filme |
| Superman (2025) | 1061474 | tt5950044 | Filme |
| Barbie Butterfly e a Princesa Fairy (2013) | 196254 | tt2946582 | Filme |

## Anúncios e avaliação do adaptador

Foram consultados os sete manifestos e 63 combinações. Cada célula indica **fontes anunciadas / candidatas aceitas**. A avaliação usou o adaptador e a lista de origens atuais do Nocta. Para os perfis novos, o replay foi configurado somente para diagnóstico, sem autorização de mídia e sem origens adicionadas. As candidatas do Zeus do app foram avaliadas isoladamente, com a reserva desligada no APK. Uma candidata pode ser Media3 ou HTML5, conforme registrado por fonte.

| Caso | Fenix | Brazuca | BsCine | Magnetflix | Zeus do app | Zeus beta | VêTela |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| Gumball T1/E1 | 1/1 | 0/0 | 1/0 | 2/0 | 0/0 | 7/0 | 5/0 |
| The Witch and the Beast T1/E1 | 1/0 | 0/0 | 1/0 | 3/0 | 3/2 | 4/0 | 2/0 |
| Patrulha Canina T1/E1 | 1/1 | 0/0 | 1/0 | 2/0 | 0/0 | 5/0 | 3/0 |
| Um Trabalho do Inferno T1/E1 | 0/0 | 2/2 | 1/0 | 6/0 | 0/0 | 9/0 | 5/0 |
| Flash T1/E3 | 0/0 | 2/2 | 0/0 | 1/0 | 0/0 | 6/0 | 4/0 |
| Os Simpsons T1/E1 | 1/1 | 2/2 | 1/0 | 1/0 | 0/0 | 8/0 | 4/0 |
| Rio | 1/1 | 2/2 | 1/0 | 1/0 | 0/0 | 7/0 | 4/0 |
| Superman | 3/3 | 2/2 | 2/0 | 8/0 | 0/0 | 7/0 | 4/0 |
| Barbie Butterfly | 0/0 | 2/2 | 0/0 | 3/0 | 0/0 | 5/0 | 1/0 |

As 63 consultas retornaram HTTP 200 com lista. As fontes desta tabela ficaram sem tentativa externa de mídia nesta rodada. Primeiro quadro, áudio, progresso, tempo de inicialização e erro de reprodução são **não medidos** para todos esses pares. A captura `.cache/nocta-ativacao/descoberta.jsonl` contém por perfil e título o ID consultado, tempo de descoberta, índice e hash da fonte, protocolo, formato, cabeçalhos declarados, aceitação e motivo. Valores de cabeçalhos e URLs de mídia ficaram fora dos registros. Os resultados físicos anteriores dos seis títulos constam em [NOCTA_ESTABILIDADE_FINAL.md](NOCTA_ESTABILIDADE_FINAL.md).

### Gumball e formatos dos candidatos

Na captura atual, o Fenix anunciou um candidato MP4 selecionável pela rota web após **8,107 s** de descoberta. A Brazuca retornou lista vazia em **4,415 s**. BsCine, Magnetflix, Zeus beta e VêTela retornaram anúncios, mas esses perfis ficam fora da seleção normal. No fluxo anterior, uma lista vazia ou a falha das candidatas dos dois fornecedores ativos podia abrir EmbedMovies. A sessão histórica relatada pelo usuário não tem log suficiente para distinguir falha do MP4, timeout de consulta ou uma lista anterior diferente.

- **BsCine** anunciou oito MP4 no total, todos por HTTP, incluindo o de Gumball. HTTPS no manifesto não torna HTTPS o transporte da mídia. O Android dispõe de exceções de cleartext por domínio, que ainda deixam o vídeo sem a proteção de TLS. O caminho seguro seria uma URL HTTPS oficialmente entregue pelo fornecedor e autorizada no perfil. Nenhuma dessas oito respostas trouxe essa alternativa, e não foi encontrada documentação pública que a oferecesse. Não foi aplicada exceção de transporte nem reescrita da URL. [Configuração de segurança de rede do Android](https://developer.android.com/privacy-and-security/security-config).
- **Magnetflix** anunciou 22 MP4, três HLS e duas URLs opacas na rodada. Gumball trouxe um MP4 por HTTP e um HLS por HTTPS. O addon levou **2,147 s** para responder a essa consulta. Esse tempo mede descoberta. A demora de aproximadamente um minuto relatada no outro player diz respeito à inicialização e ficou sem verificação aqui.
- **Zeus beta** e **Zeus do app** têm IDs e origens distintos. O beta anunciou sete fontes de Gumball, incluindo MP4 e HLS identificáveis. O perfil do app devolveu lista vazia para Gumball e três fontes para The Witch and the Beast. Duas delas foram aceitas pelo filtro do perfil do app, HLS e MP4. A terceira caiu na política de origens. No Fenix, a fonte de The Witch and the Beast exigia User-Agent e veio de origem sem aprovação nativa. Formato reconhecido não basta para escolher perfil ou estabilidade. [Objeto Stream do Stremio](https://stremio.github.io/stremio-addon-sdk/api/responses/stream.html) · [Formatos suportados pelo Media3](https://developer.android.com/media/media3/exoplayer/supported-formats).
- **VêTela** anunciou cinco MP4 para Gumball. Três tinham HTTPS e formato potencialmente compatível. Os outros dois vieram por HTTP. O perfil segue em diagnóstico.

## Encerramento dentro do player

Com a configuração padrão, o coordenador não resolve o iframe e conclui em erro depois de esgotar as opções aplicáveis. A própria área do player exibe **Nenhuma fonte reproduzível encontrada**, **Tentar novamente** e, quando houver fontes, **Escolher servidor**. A descoberta mantém seu prazo por fornecedor. O prazo de tentativa de 45 segundos agora abrange o tempo desde a preparação no React, inclusive a espera pela liberação da sessão anterior, para HTML5 e Media3. Ao vencer, a tentativa é removida e o fluxo segue para outra candidata ou para a mensagem final. A limpeza nativa continua usando o encerramento da sessão existente. Se o iframe for habilitado no futuro, carregar seu documento apenas encerra o indicador de abertura. Isso não prova reprodução.

Arquivos alterados: `src/playback/coordinator.ts`, `src/playback/AutomaticWatch.tsx`, `src/test/automatic-watch.test.tsx`, `src/test/playback-coordinator.test.ts` e os roteiros `scripts/player/{recovery-check,recovery-live-check,physical-check}.mjs`.

## Validação e APK

- **Vitest**: 263 passaram e uma integração opcional foi ignorada. Os casos novos confirmam expiração de consulta, falha de sessão nativa sem eventos, erro padrão sem iframe, ação de tentar novamente, seleção após falha e restauração explícita do iframe por configuração.
- **Samsung SM-S911B**: o APK atualizado foi instalado. MP4 e HLS controlados reproduziram no Media3 com primeiro quadro, áudio e avanço. No MP4, os eventos ocorreram em 0,945 s, 1,392 s e 2,826 s, respectivamente. No HLS, em 0,276 s, 0,539 s e 1,549 s. Os tempos são da amostra local e não permitem inferir a latência dos fornecedores externos. O MP4 controlado no WebView apresentou quadros, áudio decodificado e posição de 1,096 s.
- **Samsung, falha controlada**: respostas vazias encerraram a tela de carregamento com a mensagem dentro do player. O estado terminou com `aria-busy=false`, zero iframes e nova consulta ao tocar em **Tentar novamente**. **Escolher servidor** ficou oculto porque a lista era vazia. A rotação nas duas orientações, a restauração das barras e a rolagem sem nova carga também passaram.
- **Casos externos reproduzidos nesta rodada**: zero. A validação usou três casos controlados e a descoberta dos nove títulos comerciais. Os testes anteriores desses títulos e as novas respostas de catálogo têm escopos separados.
- **Build**: TypeScript, Vite, sync Capacitor e Gradle concluíram. O APK debug está em `android/app/build/outputs/apk/debug/app-debug.apk`. SHA-256 `466607b4172d7eaeb14d13cc31f3d6f15eadc09557280d246b9c880f14730bb0`.

Evidências locais em `.cache/nocta-ativacao`: `titulos.json`, `descoberta.jsonl`, `controlled.json`, `fallback-off.png`, `device-final.log`, `tests.log` e `build.log`.

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
$env:NOCTA_CHECK_DIRECTORY='.cache/nocta-ativacao-repeticao'
node scripts/player/recovery-check.mjs --immersive --scroll --fallback-off
```
