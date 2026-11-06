# Nocta — correção de transporte e APK experimental

## O que falhava

**Gumball, T1/E1** (`tt1942683:1:1`). O FenixFlix entrega uma URL HTTPS opaca sob `/r/`, marcada pelo Nocta como MP4 pela regra já verificada em outros casos Badger. O complemento não informou o MIME do arquivo nessa URL. O adaptador encaminhava a candidata ao HTML5 do WebView, pois o perfil não tinha candidata Media3 para essa rota. HEAD e GET do serviço comprovaram **HTTP 302 de HTTPS para HTTP**. No Samsung, uma resposta controlada com esse salto foi bloqueada por conteúdo misto antes de metadados, quadro, áudio ou progresso. O registro histórico do Stremio não contém a URL, o hash ou a tentativa para comparação direta. O caso anterior que comprovou Badger em Os Simpsons ocorreu em uma página de desenvolvimento servida por HTTP. [Diagnóstico de transporte anterior](NOCTA_TRANSPORTE_GUMBALL_WITCH.md)

O Android agora consulta os cabeçalhos da primeira resposta de uma rota Badger no host exato do FenixFlix. O plugin não segue redirecionamentos, não lê mídia e não divulga o destino. Um salto HTTP confirmado encerra aquela tentativa antes de montar o vídeo, registra o status e passa ao próximo candidato. Se a checagem não for conclusiva, o fluxo do WebView segue sujeito à política do Android. Não houve aumento no orçamento geral de consulta ou de início da mídia. A fonte Badger com esse salto continua sem reprodução no Nocta. [Plugin](../android/app/src/main/java/app/nocta/prototype/NoctaNativePlayerPlugin.java) · [Fluxo](../src/playback/AutomaticWatch.tsx)

**The Witch and the Beast, T1/E1** (`tt30089363:1:1`). O FenixFlix anunciou um MP4 legendado 1080p com `proxyHeaders.request.User-Agent` e uma origem R2 fora da lista do perfil e do Media3. O WebView não aplica esse cabeçalho por fonte. O Media3 aceita o tipo de cabeçalho, mas não recebe a sessão para essa origem. O Zeus beta anunciou cinco URLs opacas HTTPS rotuladas como legendadas, uma com cabeçalho especial. Nenhuma teve autorização de reprodução cadastrada nem formato comprovado nesta rodada. Ambas as origens ficaram sem sessão. [Adaptador](../src/experimental/StremioAddonAdapter.ts)

## O que entra no APK

O APK de depuração experimental chama o coordenador na ordem **FenixFlix → Brazuca → BsCine → Magnetflix → Zeus beta → VêTela**. As reservas entram conforme a busca avança. Uma fonte ativa continua a tocar enquanto termina uma consulta em segundo plano. O Zeus do app e o EmbedMovies ficam desligados. A tela experimental existente aceita os perfis e mostra formato, estado, e motivo de rejeição. As fontes aceitas continuam disponíveis no seletor existente. Nenhuma tela adicional foi criada.

BsCine usa o manifesto público conhecido. Magnetflix, Zeus beta e VêTela usam o manifesto personalizado, salvo no armazenamento local do aplicativo no Samsung. O caminho configurado é preservado para `/stream/`. Os valores ficam fora do APK, do repositório e das evidências. O build experimental desliga o log genérico do Capacitor para evitar registrar os parâmetros enviados à ponte nativa. O diagnóstico dedicado grava IDs, estados e tempos, sem URLs ou valores de cabeçalhos.

| Fornecedor | Habilitado no APK experimental? | Consultou fontes? | Fonte aceita pelo player? | Reprodução confirmada? | Erro ou limitação |
| --- | --- | --- | --- | --- | --- |
| FenixFlix | Sim | 7 episódios, 7 anúncios | 5 candidatas antes da checagem de início | Clipes controlados usando respostas simuladas | Badger bloqueado se o 302 anuncia HTTP. Witch bloqueado por origem e cabeçalho. |
| Brazuca Play | Sim | 7 episódios, 6 anúncios | 6 HLS candidatos | Sem nova confirmação externa | Uma consulta falhou na rede em 10,196 s. |
| BsCine | Sim | 7 episódios, 7 anúncios | Zero nesta coleta | Sem reprodução externa | Os sete MP4 foram anunciados por HTTP. |
| Magnetflix | Sim | 7 episódios, 15 anúncios | Zero nesta coleta | Sem reprodução externa | 11 MP4 por HTTP, dois MP4 HTTPS e duas URLs opacas HTTPS sem autorização cadastrada. |
| Zeus beta | Sim | 7 episódios, 51 anúncios | Zero nesta coleta | Sem reprodução externa | 12 HLS HTTPS e 39 URLs opacas. Falta autorização por fonte. Várias respostas excederam o orçamento do app. |
| VêTela Brasil | Sim | 7 episódios, 25 anúncios | Zero nesta coleta | Sem reprodução externa | 19 MP4 HTTPS sem autorização cadastrada e seis MP4 por HTTP. |

O termo **candidata** indica que o formato e a política permitem iniciar uma tentativa. Reprodução exige eventos dos renderizadores e avanço de posição. Os quatro perfis novos participam das consultas e do fallback do mesmo coordenador. Sem autorização por fonte, seus anúncios ficam bloqueados para reprodução. A interface e o coordenador aceitaram fontes controladas com autorização explícita em testes automatizados. Isso não confirma a reprodução do conteúdo externo dos perfis.

## Consultas dos episódios

O TMDB confirmou o IMDb da série e o episódio. A consulta preservou o caminho do manifesto e usou `stream/series/{IMDb}%3A1%3A1.json`. Houve 41 respostas HTTP 200 e uma falha de rede. A tabela mostra o número de anúncios do fornecedor antes da filtragem.

| T1/E1 | TMDB / IMDb | Fenix | Brazuca | BsCine | Magnetflix | Zeus beta | VêTela |
| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Gumball | 37606 / tt1942683 | 1 | 0 | 1 | 1 | 7 | 4 |
| The Witch and the Beast | 208445 / tt30089363 | 1 | 0 | 1 | 3 | 5 | 2 |
| American Dad! | 1433 / tt0397306 | 1 | 2 | 1 | 2 | 8 | 3 |
| Uma Família da Pesada | 1434 / tt0182576 | 1 | 2 | 1 | 1 | 6 | 6 |
| Patrulha Canina | 57532 / tt3121722 | 1 | 0 | 1 | 1 | 6 | 3 |
| Os Simpsons | 456 / tt0096697 | 1 | 2 | 1 | 1 | 6 | 3 |
| Um Trabalho do Inferno | 289517 / tt36458668 | 1 | erro de rede | 1 | 6 | 13 | 4 |

Em Gumball, as consultas isoladas demoraram 267 ms no FenixFlix, 1,727 s na Brazuca, 874 ms no BsCine, 1,245 s no Magnetflix, 8,284 s no Zeus beta e 10,205 s no VêTela. No app, o orçamento de nove segundos inclui manifesto e fontes. Um HTTP 200 isolado no computador pode ultrapassar esse limite no Android. Os tempos de início de mídia são registrados separadamente.

## Limites e reprodução autorizada

O teto do VêTela cobre manifesto e consultas de fontes e conta no máximo dez requisições em 60 segundos no aparelho. O armazenamento local conserva a janela após recarregar a interface. O `Retry-After` de um 429 prevalece quando for mais longo. Isso não coordena uma cota compartilhada entre aparelhos. [Cache de descoberta](../src/playback/discoveryCache.ts)

Para disponibilizar mídia nova, é necessário cadastrar autorizações por fonte e confirmar origem HTTPS, formato, cabeçalhos, redirecionamentos, reprodução real e eventuais requisitos de atribuição. Esse cadastro fica em [perfis experimentais](../src/config/experimentalProviders.ts). O aplicativo não tem comprovação de autorização de exibição para as fontes novas desta captura. As rotas e fontes existentes de Rio, Superman, The Flash e Barbie Butterfly não foram alteradas por título. A regressão foi coberta pelos contratos existentes, sem uma nova reprodução comercial.

## Build e instalação

O script `build-android.ps1 -ExperimentalProviders` ativa `VITE_ENABLE_EXPERIMENTAL_PROVIDERS`, `VITE_ENABLE_STREMIO_EXPERIMENT` e `VITE_ENABLE_NATIVE_EXPERIMENT`. Desliga `VITE_ENABLE_ZEUS_RESERVE` e `VITE_ENABLE_EMBEDMOVIES_FALLBACK`. O fluxo do APK exige o sinal de depuração do plugin nativo, além da flag do bundle. O arquivo identificado é `android/app/build/outputs/apk/debug/nocta-debug-experimental.apk`.

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
& .\scripts\build-android.ps1 -ExperimentalProviders
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -d install -r '.\android\app\build\outputs\apk\debug\nocta-debug-experimental.apk'
```

Em Configurações experimentais, ative o experimento e escolha o perfil. Nos três perfis personalizados, salve o manifesto do aparelho antes de consultar. Acesse a tela também pelo link abaixo do player no APK experimental.

## Verificação no Samsung

O Samsung SM-S911B recebeu o APK experimental por USB. O SHA-256 de `base.apk` no aparelho coincidiu com o arquivo gerado, `6463627fe9a8165c2e8f0c30457a178e7802771924b4aa6c5495352dcfec42b8`.

- **Gumball**. Os seis perfis foram consultados pelo player do APK instalado usando o mesmo IMDb e episódio. FenixFlix retornou uma candidata web em 1,478 s. A tentativa `normal-1-0e6dd2cd-c410-4b96-9e1e-84d0478d769d` registrou HTTP 302 e salto para HTTP aos 778 ms, 2,258 s após o início da descoberta. Nenhum vídeo foi montado para essa candidata. O coordenador prosseguiu por Brazuca, BsCine, Magnetflix, Zeus beta e VêTela. O Zeus beta atingiu timeout nessa sessão. A busca terminou sem iframe.
- **Witch**. Os seis perfis também foram consultados no APK. O FenixFlix retornou a fonte com `User-Agent` e origem recusada, em 422 ms. O Zeus beta retornou cinco anúncios em 324 ms nessa sessão. Nenhuma fonte foi enviada ao player. Os registros mostram o descarte na descoberta, sem erro de codec ou de sessão de vídeo.
- **Clipes autorizados**. No WebView, o MP4 avançou até 1,279 s, com 36 quadros e 14.772 bytes de áudio decodificados. No Media3, o MP4 registrou primeiro quadro aos 538 ms, áudio aos 797 ms e avanço até 1,435 s. O HLS registrou primeiro quadro aos 186 ms, áudio aos 439 ms e avanço até 1,155 s. O fluxo controlado usou o adaptador FenixFlix com respostas simuladas e arquivos CC0. Os quatro perfis novos também tiveram aceitação de uma fonte explicitamente autorizada testada em memória, sem acesso a mídia dos fornecedores.
- **Automação**. A suíte completa passou com 277 testes em 33 arquivos e o servidor Stremio controlado. A rodada focada posterior passou com 23 testes, incluindo o novo caso de persistência do limite VêTela. TypeScript, Vite, Capacitor e Gradle passaram.

## Arquivos e evidências

- Perfis e tela de configuração em [experimentalProviders.ts](../src/config/experimentalProviders.ts) e [StremioExperiment.tsx](../src/pages/StremioExperiment.tsx).
- Descoberta e sessões em [providers.ts](../src/playback/providers.ts), [StremioAddonAdapter.ts](../src/experimental/StremioAddonAdapter.ts), [coordinator.ts](../src/playback/coordinator.ts), [AutomaticWatch.tsx](../src/playback/AutomaticWatch.tsx), [PlayerStage.tsx](../src/playback/PlayerStage.tsx) e [discoveryCache.ts](../src/playback/discoveryCache.ts).
- Instrumentação em [transportTrace.ts](../src/playback/transportTrace.ts), [VideoPlayer.tsx](../src/components/VideoPlayer.tsx), [playbackEngine.ts](../src/experimental/playbackEngine.ts) e [NoctaNativePlayerPlugin.java](../android/app/src/main/java/app/nocta/prototype/NoctaNativePlayerPlugin.java).
- Build e privacidade da ponte em [build-android.ps1](../scripts/build-android.ps1) e [capacitor.config.ts](../capacitor.config.ts).
- Testes em [experimental-providers.test.ts](../src/test/experimental-providers.test.ts), [automatic-watch.test.tsx](../src/test/automatic-watch.test.tsx) e [discovery-cache.test.ts](../src/test/discovery-cache.test.ts).
- Evidências sanitizadas em [consultas dos sete episódios](../.cache/nocta-experimental/descoberta.jsonl), [fluxo de descoberta no Samsung](../.cache/nocta-experimental/device-live-metadata.json) e [clipes controlados no Samsung](../.cache/nocta-experimental/device-controlled/controlled.json).
