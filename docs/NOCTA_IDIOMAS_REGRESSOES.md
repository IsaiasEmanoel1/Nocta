# Nocta — descoberta de idiomas e regressões

Diagnóstico em 5 de novembro de 2026. Foram consultados os metadados do TMDB e os recursos `manifest` e `stream` dos perfis já inventariados. As respostas foram reaplicadas ao adaptador e ao filtro atuais em modo Android e web. As requisições mediram a API do complemento. Os quatro vídeos comerciais ficaram fora do teste de reprodução.

## Correção

- [Coordenador](../src/playback/coordinator.ts) mantém o inventário de candidatos e o resultado de cada tentativa. As opções de troca agora são derivadas apenas de transportes válidos que ainda podem ser tentados. Uma publicação tardia atualiza as opções sem interromper a sessão ou repetir uma consulta concluída. Um candidato vencido sai da oferta e pode ser revalidado uma vez antes de reaparecer.
- [Tela de reprodução](../src/playback/AutomaticWatch.tsx) aguarda a descoberta pertinente antes de declarar falta de fonte para a versão escolhida. O coordenador tenta outros servidores do mesmo idioma primeiro. A tela distingue falha de reprodução de falta de candidato e mostra uma única mensagem final quando acabarem as opções. O seletor continua acessível para tentar de novo um servidor que falhou.
- Um idioma desconhecido no histórico, por exemplo de um iframe, deixou de impedir o início de uma fonte com idioma declarado. A posição salva continua sendo passada ao player. Os rótulos de idioma vêm dos complementos e permanecem declarações.

## Respostas atuais

Todas as 28 consultas de fontes receberam HTTP 200. A rota usada foi `stream/series/{IMDb}%3A1%3A1.json`, preservando o prefixo de configuração de cada manifesto. O ID TMDB do episódio serviu para conferir T1/E1. O identificador enviado ao complemento foi o IMDb da série mais temporada e episódio.

| T1/E1 | TMDB série / episódio | IMDb | FenixFlix, recebidas / aceitas | Brazuca, recebidas / aceitas | Resultado da normalização |
| --- | --- | --- | --- | --- | --- |
| American Dad! | 1433 / 65903 | `tt0397306` | 0/0 em 8,443 s | 2/2 em 1,649 s | Dois HLS FHD HTTPS, dublado `8a0c34f7432c` e legendado `a369cd030e94`. Candidatos web e Media3. |
| Uma Família da Pesada | 1434 / 66050 | `tt0182576` | 0/0 em 7,765 s | 2/2 em 1,957 s | Dois HLS FHD HTTPS, dublado `d0a6a8cbed1b` e legendado `1cb6fffd1925`. Candidatos web e Media3. |
| The Witch and the Beast | 208445 / 3902740 | `tt30089363` | 1/0 em 0,232 s | 0/0 em 2,960 s | MP4 1080p legendado `4428c9d51a76` exige `proxyHeaders.request.User-Agent` e a origem anunciada está fora da lista nativa. Nenhum dos dois players recebeu sessão. |
| O Incrível Mundo de Gumball | 37606 / 850202 | `tt1942683` | 1/1 em 1,181 s | 0/0 em 1,660 s | Candidato web dublado, 1080p `478705f0d55c`. A rota opaca Badger segue a regra de MP4 já existente. Sem candidato legendado nos perfis ativos nesta rodada. |

Os candidatos da Brazuca e de Gumball vieram sem exigência declarada de cabeçalhos especiais e sem sinalização `notWebReady`. Os hashes representam a URL anunciada, sem publicar o endereço completo. As listas vazias acima foram respostas do complemento. Nenhuma das consultas de fontes dos dois perfis ativos excedeu 9 s isoladamente nesta coleta. No app, o orçamento de 9 s por fornecedor também cobre o manifesto quando ele precisa ser consultado.

Não houve erro de mídia comercial medido nesta rodada. A rejeição de Witch ocorreu na seleção, antes da criação da sessão. Para os outros episódios, a API anunciou candidatos, mas não há dados atuais de playlist, segmento, imagem, áudio ou progresso. O [HTTP 404 já observado em outros títulos da Brazuca](NOCTA_BRAZUCA_TELA_CHEIA.md) não demonstra o mesmo erro em American Dad! ou Uma Família da Pesada.

## Perfis ativos e perfis em diagnóstico

[FenixFlix e Brazuca Play](../src/playback/providers.ts) participam da reprodução normal no APK. **Zeus do app** (`org.zeus.community`) é uma reserva opcional por `VITE_ENABLE_ZEUS_RESERVE`, desligada nesta entrega. **EmbedMovies** permanece disponível por `VITE_ENABLE_EMBEDMOVIES_FALLBACK`, desligada nesta entrega. **BsCine, Magnetflix, Zeus beta e VêTela** foram apenas consultados no diagnóstico.

| Perfil fora da reprodução normal | American Dad! | Uma Família da Pesada | Witch | Gumball |
| --- | ---: | ---: | ---: | ---: |
| BsCine | 1 | 1 | 1 | 1 |
| Magnetflix | 2 | 1 | 3 | 1 |
| Zeus beta (`org.zeus.community.beta`) | 7 | 7 | 4 | 7 |
| VêTela | 3 | 6 | 2 | 5 |
| Zeus do app | 0 | 0 | 2 | 0 |

Os quatro perfis de diagnóstico não entregam sessões no fluxo normal. Entre os anúncios, BsCine retornou MP4 por HTTP nos quatro casos. Magnetflix retornou MP4 por HTTP para American Dad!, Uma Família da Pesada e Gumball, e MP4 ou URL opaca por HTTPS para Witch. O Zeus beta retornou HLS, MP4 e URLs opacas. VêTela retornou MP4 por HTTP e HTTPS. Para Witch, o Zeus do app retornou dois MP4 legendados, dos quais um passou a política do seu perfil e o outro teve origem bloqueada. A resposta levou 14,956 s isoladamente, acima do orçamento normal do coordenador. Isso descreve uma medição de descoberta e a configuração opcional, sem confirmar reprodução.

## Comparação com o histórico

O último commit que contém a reprodução é `4bc0af6`. O `git diff` mostrou que a rota, a seleção de IMDb em `addonTitle` e a classificação textual dos idiomas se mantiveram. A captura anterior também mostrou um candidato Badger para Gumball, com outro hash, e a mesma fonte Fenix bloqueada para Witch. Não há uma captura anterior equivalente para os dois pilotos da Fox, nem registros do cliente Stremio para comparar essas sessões.

O diff confirmou duas mudanças de cobertura anteriores a esta correção: o Zeus do app passou de reserva ativa por padrão a opcional, e o iframe passou a exigir ativação explícita. A retirada da reserva muda o conjunto de candidatos para Witch. Na captura atual, esse perfil também respondeu fora do orçamento do app. Nenhuma dessas mudanças comprova a causa de uma falha de vídeo. No estado de idioma, a lógica antiga publicava todos os rótulos anunciados no mesmo campo usado pelas ofertas e admitia fontes vencidas como alternativas. A correção trata esses estados de forma separada. Nenhum título ganhou exceção.

## Validação

Foram alterados o coordenador, a tela de reprodução e os testes [do coordenador](../src/test/playback-coordinator.test.ts) e [da tela](../src/test/automatic-watch.test.tsx). Os novos cenários cobrem descoberta tardia, tentativa no mesmo idioma, clique em opção inválida, expiração, publicação tardia do iframe, histórico sem idioma conhecido, falha de mídia e esgotamento das versões. Os testes usam candidatos controlados.

Os 269 testes passaram em 32 arquivos com `NOCTA_STREMIO_INTEGRATION=true` e o servidor controlado em execução. Essa integração confirmou manifesto, catálogo, episódios, leitura parcial de MP4, manifesto HLS, resposta vazia e timeout. TypeScript, Vite, sincronização do Capacitor e Gradle `assembleDebug` passaram em seguida. O [APK de depuração](../android/app/build/outputs/apk/debug/app-debug.apk) tem SHA-256 `a8a74f3068f6d719fe94e5c62dea09d426db20e73123ea48bea470cd68f6a734`. O APK desta rodada ficou para instalação manual por USB.

Evidência sanitizada local em [identidades](../.cache/nocta-idiomas/titulos.json) e [respostas de descoberta](../.cache/nocta-idiomas/descoberta.jsonl).
