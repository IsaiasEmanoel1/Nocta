# NOCTA — entrega Android com Capacitor

Data: 01/11/2026. Projeto: `C:\Users\PC\Desktop\fuzz`.

## Artefato compilado

Foi executado o build web, a sincronização Capacitor e `assembleDebug`, com resultado `BUILD SUCCESSFUL`. O APK usa assinatura de desenvolvimento e pode ser instalado para avaliação; não houve publicação em loja.

- Caminho exato: `C:\Users\PC\Desktop\fuzz\android\app\build\outputs\apk\debug\app-debug.apk`.
- Identificador: `app.nocta.prototype`; nome: **NOCTA**.
- Versão Android: `1.1`, código `2`.
- Android mínimo: 6.0 / API 23; target/compile SDK: 35.
- Tamanho: **4.535.557 bytes**.
- SHA-256: `8755a4a9bb3a930a445664a31006ebd749b2abb33062f5d90c12357619e4f0dc`.
- Assinatura conferida por `apksigner verify --verbose`: válida, esquemas v1 e v2. Houve avisos sobre entradas META-INF no esquema JAR; o verificador terminou com código 0.
- **31 arquivos** de `dist/` comparados byte a byte com `assets/public/` dentro do APK: nenhuma divergência. Não é um APK antigo apenas renomeado.

## Implementação e arquivos

O Android executa o mesmo build React/Vite do site, empacotado localmente. Não depende de um servidor Vite aberto no computador. O conteúdo remoto permitido, como vídeos de demonstração e metadados TMDB opcionais, exige internet.

| Arquivo | Responsabilidade |
|---|---|
| `capacitor.config.ts` | Identidade `app.nocta.prototype`, `webDir: dist`, fundo azul-marinho e margens automáticas para edge-to-edge. Sem servidor remoto de desenvolvimento ou liberação irrestrita de navegação. |
| `src/components/AndroidLifecycle.tsx` | Plugin oficial `@capacitor/app`: Voltar navega pelo histórico React, links diretos retornam ao início e Voltar no início minimiza a tarefa. Eventos de segundo plano avisam o player. Os listeners são removidos no desmontar. Inativo no navegador comum. |
| `src/components/Layout.tsx` | Integra o ciclo de vida nativo sem alterar os contratos de catálogo/reprodução. |
| `src/components/VideoPlayer.tsx` | Salva progresso e pausa ao ocultar a página ou colocar o Android em segundo plano; ao retornar, aguarda nova ação do usuário. Mantém os controles HTML5. |
| `src/styles.css` | Alvos principais de toque de pelo menos 44px, carrosséis com rolagem horizontal, navegação inferior e fallback CSS de safe areas. |
| `android/app/src/main/java/app/nocta/prototype/MainActivity.java` | Suporte padrão de custom view do WebChromeClient para tela cheia, com barras/recortes respeitados e Voltar dedicado para sair da tela cheia. Sem alteração de TLS, CORS, iframe ou DRM. |
| `android/app/src/main/res/values/styles.xml` | Tema escuro de sistema e tela inicial. |
| `android/app/src/main/res/drawable/ic_nocta.xml` | Ícone vetorial provisório original NOCTA, usado pelo launcher. |
| `android/app/src/main/AndroidManifest.xml` | Uma atividade principal e acesso à internet. |
| `src/state/library.tsx` | Biblioteca local existente, chave `nocta.library.v1`, preservada sem migração destrutiva. |
| `src/test/android.test.tsx` | Testes de Voltar, segundo plano e limpeza dos eventos. |
| `scripts/build-android.ps1` | Build reproduzível: verifica ferramentas, compila web, sincroniza e gera APK; falhas encerram o script. |
| `scripts/test-android.mjs` | Verificação do próprio APK depurável via ADB/CDP, limitada a emulador explicitamente escolhido. Gera resultados e capturas locais. |

Favoritos e histórico são locais a cada instalação/origem. A biblioteca do navegador no computador não migra automaticamente para o Android. Atualizar o mesmo pacote com a mesma assinatura, usando `adb install -r`, mantém normalmente o armazenamento. Desinstalar, limpar dados ou trocar a origem local elimina ou separa esse armazenamento. Não foi incluído login ou sincronização.

O nome, o ícone, as ilustrações e a interface pertencem ao protótipo original. Os APKs e diretórios descompilados de referência não foram executados, alterados ou incorporados ao produto.

## Testes comprovados

| Verificação | Resultado |
|---|---|
| Vitest, domínio/telas/persistência/fornecedores/Android | **48 testes aprovados, 7 arquivos**. |
| TypeScript e Vite, produção | Aprovados. |
| Capacitor sync Android | Aprovado, plugin `@capacitor/app` 7.1.2 detectado. |
| Gradle 8.11.1 + AGP 8.7.2 + JDK 21 | Build final **BUILD SUCCESSFUL**, 112 tarefas, 33 executadas e 79 atualizadas; heap limitado a 768 MB e um worker durante esta verificação. |
| Navegadores de desktop e viewport móvel | **15 cenários aprovados**: Edge desktop, Edge com viewport Pixel 7 e Chrome desktop. |
| Regressão após salvar progresso no evento seeked | **3 cenários de reprodução/retomada novamente aprovados**, um em cada navegador/viewport. Os 48 testes Vitest também foram repetidos e aprovados. |
| MP4 autorizado no navegador | Big Buck Bunny avança de verdade, salva progresso e retoma após navegar; iframe controlado também reproduz. Não é apenas um evento `load` ou uma imagem de player. |
| Regressão do protótipo | Busca, filtros, favoritos, detalhes, temporadas, negação de títulos sem licença e diagnóstico preservados. |
| Políticas de iframe no navegador | X-Frame-Options e CSP testados com respostas locais controladas e respeitados, sem contorno. |
| Integridade do APK e permissões | Assinatura válida; 31 assets iguais a `dist/`; manifesto inspecionado. |

As capturas dos navegadores ficam em `test-results/`. Resultados nativos ficam em `android-test-results/results.json`, em pasta separada para que novas execuções dos testes web não os apaguem; seu alcance é discriminado na seção seguinte.

## Execução nativa e limitações do ambiente

O APK foi **instalado e aberto de verdade** no emulador isolado `Nocta_Test_API35`, serial `emulator-5556`, Android **15/API 35**, imagem Google Play x86_64, com **Android System WebView 124.0.6367.219**. Não é uma simulação de viewport do navegador desktop. Não havia aparelho físico conectado; o emulador pessoal existente não foi usado ou alterado.

O build final foi instalado com `adb install -r`, preservando os dados da primeira instalação. A inspeção da versão final encontrou **um favorito já existente antes dos testes**. Depois de encerrar e reabrir o processo do NOCTA, a lista permaneceu e Big Buck Bunny retomou em **45,30 segundos** em uma das rodadas. As três amostras autorizadas avançaram de verdade; Sintel chegou a 2,14 s e Tears of Steel a 3,75 s nessa rodada. Esses tempos demonstram decodificação e avanço, não uma avaliação de reprodução integral de todos os filmes.

Na rodada com resolução física de 720 × 1600 e densidade de 280 dpi, o WebView mediu aproximadamente **412 × 813 CSS px em retrato** e **837 × 360 em paisagem**, sem transbordamento horizontal da página. As barras/recortes ficaram fora da região interativa. A inspeção visual foi feita em capturas ADB, não somente em medidas DOM.

Os resultados consolidados e capturas estão em `android-test-results/`. Não houve teste em aparelho físico, Android TV ou versões Android inferiores à 15. A API mínima 23 é uma configuração de compilação, não uma certificação de todos os aparelhos Android 6+.

### Problemas encontrados e correções

1. **Disco/memória do ambiente:** o disco C tinha cerca de 5 GB disponíveis para uma imagem que inicialmente exigiu mais de 7 GB. Os dados do AVD de teste foram colocados em `D:\NoctaAndroidTest-20261101`, com configuração em `.cache/avd/`. A imagem elevou automaticamente sua RAM a 2560 MB, apesar de tentativas de pedir menos. O emulador foi encerrado para liberar memória durante a compilação final; Gradle usou heap de 768 MB e um worker. Nenhuma configuração de segurança ou memória virtual do Windows foi alterada.
2. **Emulador:** houve falhas do `netsimd.exe` e do serviço Bluetooth da imagem, além de um aviso **“System UI isn't responding”**. A captura `android-test-results/system-ui-anr.png` distingue esse aviso de uma falha do NOCTA. Isso bloqueou inicialmente os botões/gestos ADB e causou tempos esgotados na automação. Foi desativada a simulação avançada de rádio e o Bluetooth apenas no AVD de teste; o aviso foi tratado e as verificações repetidas após o sistema recuperar. O APK não usa Bluetooth.
3. **Barras brancas no primeiro APK:** as margens estavam corretas, mas o fundo do tema nativo ficava branco atrás dos ícones claros. Corrigido em `styles.xml` e no fundo da decor view da MainActivity. As capturas posteriores mostram fundo escuro.
4. **Gravação após avançar o vídeo:** a gravação periódica podia esperar o intervalo de cinco segundos. Adicionado salvamento no evento `seeked`, além de pausa, saída e segundo plano. O teste automatizado passou a verificar explicitamente esse evento; os 48 testes e os três testes reais de reprodução web passaram novamente.
5. **Ferramenta de inspeção:** o conector genérico de navegador do Playwright tentou uma operação de contexto não suportada pelo WebView. Foi substituído pelo conector Android/WebView oficial, sem alterar políticas do app ou instalar driver de UI no dispositivo. A automação também passou a aguardar a criação do novo processo antes de reconectar após fechá-lo.

As rodadas preliminares com quedas de conexão e com o aviso de System UI foram preservadas em `connection-attempt.json` e `system-ui-attempt.json`. Não se deve interpretar seus erros de conexão ou seus timeouts de teclas como sucesso de testes nativos. O arquivo `results.json` contém a rodada consolidada posterior.

## Navegador versus Android

| Aspecto | Site | APK Capacitor |
|---|---|---|
| Interface | Mesmo React e CSS responsivo. | Mesmo bundle servido pelo host local do Capacitor. |
| Voltar | Histórico do navegador. | Plugin App coordena histórico React/minimização; a tela cheia tem callback nativo prioritário. |
| Áreas seguras | `viewport-fit=cover` e `env(safe-area-inset-*)`. | Margens nativas para barras/recorte no Android 15, com fallback CSS. |
| Tela cheia | Fullscreen API do navegador. | Exige implementação de `onShowCustomView`/`onHideCustomView`, adicionada na MainActivity; não é desbloqueio de conteúdo. |
| Reprodução | HTML5 MP4, mediante conexão e capacidade do navegador. | HTML5 MP4 pelo Android System WebView; codecs, versão do WebView e políticas de gesto podem diferir. |
| Segundo plano | Eventos de visibilidade/pagehide. | Eventos web mais `appStateChange`; pausa e persistência. Sem serviço de reprodução em segundo plano. |
| Favoritos/progresso | `localStorage` da origem web. | `localStorage` privado da origem local do app, separado do site. |
| Fornecedores externos | Sujeitos às políticas do navegador. | Sujeitos também à aceitação de WebView pelo fornecedor; compatibilidade não é presumida. |

Não foram adicionados flags para ignorar certificados, conteúdo misto, políticas de origem, autoplay com áudio, DRM ou restrições de iframe. Nenhuma URL interna de reprodução de terceiro foi extraída. A EmbedWave continua sem concessões de direitos e sem reprodução habilitada. Os títulos TMDB/fictícios continuam sendo somente metadados, salvo uma concessão explícita e válida implementada futuramente.

## Conteúdo de demonstração e permissões

Somente a lista explícita de curtas Blender Foundation em `src/services/playback.ts` pode resolver fontes: **Big Buck Bunny**, **Sintel** e **Tears of Steel**, com atribuição e licença CC BY 3.0 visíveis. As amostras vêm da lista pública Google Cast. Não há download offline, anúncios, assinatura ou cadastro. Fontes e créditos estão em `README.md` e na tela Sobre.

O manifesto final declara `android.permission.INTERNET`, uma permissão normal, e `app.nocta.prototype.DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`, gerada pelo AndroidX para receptores internos, protegida por assinatura. Não solicita câmera, microfone, localização, contatos, arquivos, notificações ou identificador de anúncios. Não há pedido de permissão sensível no fluxo do produto.

## Como compilar novamente

Requer Node 20.19+ ou 22.12+, JDK **21**, SDK Android com plataforma **35** e build-tools **35.0.0**. O wrapper Gradle está incluído. O Java padrão deste computador é mais recente; por isso o JDK 21 é escolhido explicitamente.

Na pasta do projeto:

```powershell
npm install
npm test
npm run android:build
```

O script usa os caminhos instalados nesta máquina. Para outro ambiente:

```powershell
powershell -NoProfile -File scripts/build-android.ps1 -JavaHome 'C:\caminho\jdk-21' -AndroidSdk 'C:\caminho\Android\Sdk'
```

Equivalente manual, depois de configurar Java/SDK:

```powershell
npm run android:sync
$env:JAVA_HOME = 'C:\Users\PC\.jdks\jbr-21.0.11'
$env:ANDROID_HOME = 'C:\Users\PC\AppData\Local\Android\Sdk'
$env:GRADLE_USER_HOME = 'C:\Users\PC\Desktop\fuzz\.cache\gradle'
.\android\gradlew.bat -p android assembleDebug --no-daemon --no-watch-fs '-Dorg.gradle.internal.instrumentation.agent=false' --console=plain
```

`npm run android:open` abre o projeto no Android Studio. `npm run dev` continua iniciando o site em `http://127.0.0.1:5173/`.

## Instalação para avaliação

Com um aparelho de teste ou emulador conectado e autorizado no ADB:

```powershell
$adb = "$env:LOCALAPPDATA\Android\Sdk\platform-tools\adb.exe"
& $adb devices
& $adb -s IDENTIFICADOR_DO_DISPOSITIVO install -r 'C:\Users\PC\Desktop\fuzz\android\app\build\outputs\apk\debug\app-debug.apk'
& $adb -s IDENTIFICADOR_DO_DISPOSITIVO shell am start -n app.nocta.prototype/.MainActivity
```

Substitua o identificador pelo dispositivo correto. `-r` atualiza a instalação mantendo dados quando pacote e assinatura são compatíveis. Se houver conflito de assinatura, não desinstale para tentar preservar dados: use o mesmo ambiente de assinatura ou faça uma avaliação separada. O APK de depuração não é destinado à loja.

Também é possível copiar o APK para um aparelho de teste e abri-lo pelo gerenciador de arquivos, aprovando a instalação apenas se desejar. Nenhuma dessas configurações é alterada automaticamente pelo projeto.

Para repetir a suíte nativa no emulador isolado já iniciado, com o APK instalado:

```powershell
$env:ANDROID_SERIAL = 'emulator-5556'
node scripts/test-android.mjs
```

O script usa a depuração padrão do próprio APK debug, sem modificar as políticas de segurança do WebView. Não deve ser apontado a um dispositivo pessoal com dados importantes; os testes fecham/reabrem o processo do protótipo e alteram a orientação do emulador de teste.

## Referências técnicas

- [Capacitor 7 — App](https://capacitorjs.com/docs/v7/apis/app): eventos de ciclo de vida, Voltar e minimização.
- [Capacitor 7 — configuração](https://capacitorjs.com/docs/v7/config): configuração Android e ajustes de edge-to-edge.
- [Android — edge-to-edge](https://developer.android.com/develop/ui/views/layout/edge-to-edge): aplicação de insets para barras e recortes no Android 15.
- [Android — WebChromeClient](https://developer.android.com/reference/android/webkit/WebChromeClient): ciclo de vida padrão da custom view de tela cheia.
- [Playwright — AndroidWebView](https://playwright.dev/docs/api/class-androidwebview): inspeção do WebView do próprio APK via ADB.

O build comprova que o APK foi produzido; os testes web comprovam o comportamento nos navegadores utilizados. Somente uma execução nativa efetiva pode comprovar reprodução, gestos e barras no Android específico testado. Nenhum desses resultados equivale a certificação em todos os aparelhos ou autorização de exibição de títulos comerciais.
