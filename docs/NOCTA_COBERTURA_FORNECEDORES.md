# Nocta — Tela cheia e piloto de cobertura

## Player

O Media3 mede o contêiner real e reaplica o enquadramento a cada mudança de tamanho. A tela cheia em retrato usa `RESIZE_MODE_FIT`. Em paisagem usa `RESIZE_MODE_ZOOM`. A saída volta a FIT. O HTML5 usa `contain` por padrão e `cover` em fullscreen com a janela em paisagem. O controle de enquadramento manual segue ausente.

No Samsung, o clipe controlado entrou em retrato com quadro inteiro, passou a preencher **2340 × 1080** em paisagem e voltou a caber em retrato na mesma sessão. A área imersiva em retrato mediu **1080 × 2340**, com vídeo **1080 × 607**. As duas barras do sistema permaneceram ocultas durante a rotação e reapareceram ao sair. MP4 e HLS no Media3 e MP4 no WebView avançaram com imagem e áudio. O Edge validou `contain → cover → contain` e a volta ao modo inline.

Uma repetição com o clipe rodando registrou progresso de **4,392 s** ao voltar ao retrato, com uma única carga. As capturas em retrato e paisagem foram conferidas visualmente. O APK debug foi compilado e instalado no Samsung. SHA-256 `81ab262d0065a6b9de2eece6264d3a4c466853181b55250cfb8a5ae171eb1497`.

A superfície inline do clipe 16:9 usou **1074 dos 1080 pixels** de largura em retrato, descontada a borda do contêiner, com cerca de **604 px** de altura. A largura já limita o maior quadro inteiro possível. Aumentar a altura aparente exigiria recortar a imagem ou alargar o contêiner. Mantive a área do banner, a proporção do vídeo, a rolagem e a posição dos controles. A captura e os eventos do clipe comprovam o resultado para esse formato.

## Comparador

`scripts/coverage/run.mjs` é uma ferramenta de terminal. Os módulos são independentes da seleção de fontes do aplicativo.

- `tmdb.mjs` usa o catálogo existente do Nocta em pt-BR. Distribui 20 títulos em 6 filmes, 4 animações, 3 séries, 3 desenhos, 2 animes e 2 novelas. O modo 100 usa 30/20/15/15/10/10. Usa tendências, popularidade e Discover, com recortes de época e votos para clássicos. Desenhos usam animação televisiva em inglês, anime usa a classificação japonesa existente, e novela usa o gênero 10766 com origem BR. Popularidade e votos são sinais do TMDB, sem equivalência a audiência real.
- A amostra é deduplicada por tipo e ID TMDB. O detalhe resolve o IMDb quando disponível. Cada série usa um episódio existente confirmado na temporada do TMDB, normalmente o primeiro elegível. Incompatibilidade de tipo, falta de ID reconhecido ou ausência de episódio confirmado têm estados próprios.
- `core.mjs` preserva o caminho e a query de configuração ao consultar um manifesto e sua rota `stream`. Deduplica links equivalentes e mantém configurações distintas. O IMDb é preferido. O formato `tmdb:` só é usado quando esse prefixo está declarado. Manifestos Nuvio, outras estruturas e páginas HTML recebem status de inventário separado.
- O comparador conta fontes, HTTP(S), formatos e idioma/qualidade declarados. Candidatas web/Media3 são estimativas por formato, HTTPS e requisitos declarados. O teste não abre URLs de mídia, playlists, torrents ou embeds. Um resultado futuro de reprodução deve ser registrado separadamente pelo hash do perfil, ID e índice da fonte, com consulta nova para obter mídia.
- Há uma fila por host e até quatro requisições simultâneas no total. O padrão é 10 requisições/minuto por host, ajustável por `--rate` ou `--limits`. Um limite por minuto declarado no manifesto reduz a taxa. O cliente respeita `Retry-After` em segundos ou data, tenta no máximo mais uma vez em 429/502/503/504 e adia a fila quando a espera excede um minuto. Uma requisição adiada aparece separada de um 429 realmente recebido.
- Cada resultado concluído vai para `progress.jsonl`. A amostra fica em `sample.json`. Ctrl+C cancela as requisições e finaliza os CSVs parciais. Repetir o comando na mesma pasta reaproveita a amostra e os resultados dentro do TTL de 24 horas. `--ttl-hours` muda a validade. Para tirar outra amostra use outro `--out`. Execute uma instância por pasta.
- `fornecedores.csv`, `resultados.csv` e `ranking.csv` têm BOM UTF-8 e ponto e vírgula para Excel. O ranking separa total, seis categorias, velocidade e Android potencial. Cobertura conta títulos com fonte anunciada entre pares com consulta iniciada. As colunas de respostas válidas e consultas permitem distinguir erros e listas vazias. Velocidade usa a mediana das respostas de streams válidas. Compatibilidade potencial não soma pontos de reprodução. URLs temporárias, configurações, cabeçalhos e credenciais não são exportados.

Foram reaproveitados do roteiro da área de trabalho a ideia de normalizar os links, validar tipos/prefixos e consultar `stream` com o episódio explícito. A amostra fixa deu lugar aos metadados do projeto. Os arquivos originais `teste_nocta.mjs` e `fontes.txt` permanecem na área de trabalho.

## Piloto executado

Foram analisadas **15 entradas únicas** de `fontes.txt`. Onze anunciaram streams Stremio, uma foi identificada como Nuvio, uma devolveu outra estrutura JSON e duas devolveram HTML sem manifesto confirmado. As quatro últimas ficaram fora das consultas de títulos. Nenhuma rota foi inferida para elas.

Foram registrados **220 pares** de título e perfil Stremio. Dez foram incompatíveis por tipo e ficaram sem consulta. Das **210 consultas de streams**, 85 retornaram fontes, 108 retornaram listas vazias, 16 excederam o timeout e uma resposta foi inválida. As listas anunciaram 325 fontes HTTP(S). Nenhuma obra do piloto foi reproduzida.

| Cobertura total | Títulos com fontes | Títulos com candidata Android | Respostas válidas |
| --- | ---: | ---: | ---: |
| Magnetflix | 20/20 | 10/20 | 20/20 |
| VêTela Brasil | 18/20 | 18/20 | 20/20 |
| Zeus | 18/20 | 14/20 | 19/20 |
| Brazuca Play | 14/20 | 12/20 | 20/20 |
| PopPlay | 5/20 | 5/20 | 20/20 |

VêTela liderou o ranking de compatibilidade potencial Android. Mico-Leão teve a menor mediana de resposta válida, **416 ms**, em dez consultas compatíveis por tipo. O CSV traz todos os perfis, empates, seis categorias e respectivos denominadores. Números de cada categoria descrevem apenas a pequena amostra do piloto.

Não houve HTTP 429 no ritmo empregado. Os manifestos consultados não forneceram um limite por minuto reconhecido pelo comparador. Portanto, **10/min foi o teto conservador adotado**, sem confirmação de que seja o limite de cada serviço. Os timeouts são contados à parte. O comportamento de 429 e `Retry-After` foi verificado com relógio e respostas controlados.

Os arquivos finais estão em `reports/nocta-cobertura-20`. A coleta de 100 títulos ficou preparada como opção separada e não foi executada.

## Testes

- Vitest do aplicativo: **255 aprovados**, uma integração opcional ignorada.
- Node do comparador: **5 aprovados**, cobrindo deduplicação, perfis distintos, coordenadas de episódios, rate limit, 429, cancelamento, concorrência, cache, rankings e CSV.
- Retomada: reexecução do piloto a partir dos 235 registros já salvos e reconstrução do mesmo ranking a partir de uma cópia com a última linha truncada.
- Android: build web, sync Capacitor e Gradle concluídos. Capturas e logs do clipe no Samsung estão em `.cache/nocta-cobertura`. O Edge verificou o HTML5 em ambas as orientações.

## Comandos

No PowerShell, no projeto, com a chave TMDB já configurada:

```powershell
Set-Location 'C:\Users\PC\Desktop\fuzz'
node scripts/coverage/run.mjs --titles 20 --sources ..\fontes.txt --out reports/nocta-cobertura-20
node scripts/coverage/run.mjs --titles 100 --sources ..\fontes.txt --out reports/nocta-cobertura-100
```

Execute o segundo comando quando quiser iniciar a amostra maior. Para um teto por host, `--limits caminho.json` aceita um objeto JSON com hostname como chave e requisições por minuto como valor. A primeira linha de cada entrada nos relatórios usa uma impressão digital do manifesto.

```powershell
node --test scripts/coverage/core.node-test.mjs
npm.cmd test
npm.cmd run android:build
& "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe" -d install -r '.\android\app\build\outputs\apk\debug\app-debug.apk'
```

Arquivos do player alterados: `NoctaNativePlayerPlugin.java`, `src/styles.css`, `scripts/player/recovery-check.mjs` e `scripts/player/flow-ui-check.mjs`. Arquivos do comparador: `scripts/coverage/{run,core,tmdb,core.node-test}.mjs`.
