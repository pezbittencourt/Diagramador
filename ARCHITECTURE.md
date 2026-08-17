# Arquitetura do Livro Studio

## Direção técnica

O aplicativo usa Electron, React e TypeScript. O renderer do Chromium oferece
edição, medição tipográfica por Canvas e uma rota editorial de PDF usando a
mesma projeção textual do preview. O processo principal acessa arquivos,
diálogos e `printToPDF`; o renderer isolado recebe somente uma API segura pelo
preload.

## Camadas

- `src/domain`: documento, história, formatação e numeração, sem React/Electron.
- `src/layout`: medição, paginação, spreads e snapshot derivado.
- `src/pdf`: intervalos, preflight e serialização em lotes da superfície editorial.
- `src/persistence`: JSON versionado, validação e migração.
- `src/components`: editor, páginas, controles e projeções compartilhadas.
- `electron`: arquivos nativos, importação TXT/DOCX, render PDF isolado e merge.

O estado persistente usa milímetros e pontos. Pixels existem apenas na projeção
visual. Índices físicos são base zero internamente e base um na interface.

O sistema geométrico tem uma convenção única: `0,0` é o canto superior esquerdo
do trim, X cresce para a direita e Y para baixo. Coordenadas negativas alcançam
a sangria superior/esquerda. Página, objetos, réguas, guias e snapping usam as
mesmas funções mm ↔ px; zoom nunca é persistido na geometria.

## História contínua e rich text

`TextStory.content` é um documento semântico com blocos tipados:

- `paragraph`: identidade estável, `styleId`, overrides locais e conteúdo inline;
- `pageBreak`: quebra manual persistente;
- `text`: runs com marks para peso, itálico, sublinhado, família, tamanho e cor.

As quebras automáticas nunca entram nessa árvore. Uma string plana é somente a
representação de interoperabilidade para clipboard e TXT.

Parágrafos guardam o vínculo `styleId`; não recebem uma cópia desconectada do
estilo global. `attrs.overrides` guarda apenas formatação local de parágrafo e
marks inline continuam válidas após mudanças globais.

## Editor, seleção e histórico

O canvas possui uma única raiz `contenteditable` abrangendo todos os spreads.
Cada run visual declara offsets globais da história. Antes de uma transação, o
editor converte a seleção DOM para offsets semânticos; depois do reflow,
converte-os novamente para nós DOM e restaura seleção, foco e caret.

Digitação, Enter, exclusão, clipboard, formatação e aplicação de estilos operam
sobre a história completa. `Ctrl+Enter` insere um `pageBreak` real. A toolbar
envia comandos ao mesmo `StoryEditor`, preservando a seleção quando o foco passa
por controles.

O editor usa uma camada transacional pequena e fortemente tipada, em vez de manter
um segundo documento em ProseMirror/Tiptap. Isso conserva uma única fonte de
verdade e o contrato história → snapshot → páginas. Undo/redo local inclui
texto, marks, overrides e aplicação de estilos, limitado a 200 entradas.

A camada gráfica tem histórico separado de até 100 snapshots de páginas,
assets e guias. Inserção, drag, resize, exclusão, duplicação e z-order entram
nesse histórico quando o foco está no objeto. Assim, `Ctrl+Z` dentro do editor
continua pertencendo exclusivamente ao texto.

## Medição e paginação

O compositor é uma função pura parametrizada por `TextMeasurer`. No aplicativo,
`CanvasTextMeasurer` usa `measureText`; nos testes, um medidor determinístico
mantém cenários reproduzíveis.

Para cada página o motor:

1. resolve lado físico e margens interna/externa;
2. calcula a área útil sem incluir sangria;
3. resolve estilo herdado, override de parágrafo e marks inline;
4. quebra linhas por busca binária, medindo cada run tipográfico;
5. consome altura pela maior fonte da linha, line-height e espaçamentos;
6. emite fragmentos e linhas explícitas com X/Y, altura, largura disponível,
   largura natural/renderizada, espaçamento de palavras, alinhamento, índice
   semântico e offsets locais/globais;
7. honra `pageBreak` iniciando uma página nova.

Cada linha mantém seus runs tipográficos, incluindo o texto, os offsets e o avanço
medido em mm. O recuo de primeira linha é aplicado apenas à primeira linha
semântica do parágrafo, mesmo quando o parágrafo atravessa uma página. A linha
também informa se é a última linha semântica, para que a justificação não dependa
de como o renderer agrupa fragmentos.

O reflow ainda recompõe do começo ao fim. Inserções empurram conteúdo para a
frente; exclusões o puxam para trás. `pages` acompanha o snapshot, sem remover
páginas futuras que já tenham objetos posicionados.

## Spreads

Spreads são derivados da quantidade dinâmica de páginas: página física 1 no
slot direito, depois 2–3, 4–5 etc. Uma grade explícita de duas colunas mantém
paridade, largura e distância estáveis; não há condicionais por número concreto.
O gap acompanha o zoom, e a geometria de margens continua derivada de
`resolveFacingEdges`.

No modo página única, a mesma `BookPage` e o mesmo fragmento do snapshot são
projetados isoladamente. `activePageIndex` é estado de sessão alimentado por
clique, navegação e seleção de objeto. Páginas sem fragmentos de texto continuam
renderizáveis quando um objeto exige sua existência.

## Tipografia e estilos

`ParagraphStyle` centraliza família, tamanho, peso, itálico, sublinhado, cor,
altura de linha, alinhamento, espaços e recuos. O documento nasce com `body`,
`chapter-title`, `subtitle`, `quote` e `dedication`. Editar um objeto global
atualiza todos os parágrafos vinculados e invalida o snapshot.

O compositor calcula a largura natural e o `wordSpacingMm` das linhas justificadas;
linhas finais e linhas sem espaços mantêm espaçamento zero. Centro e direita são
projetados a partir da diferença entre largura disponível e largura natural. O
Chromium ainda realiza o desenho dos glifos, mas não decide novamente a quebra ou
a largura alvo. Ainda não há hifenização, controle de órfãs/viúvas ou
justificação microtipográfica.

## Numeração editorial

A numeração permanece derivada, nunca fixada por página:

- índice físico: posição em `pages`;
- número lógico: calculado por `numbering.ranges`;
- visibilidade: política global, intervalos e exceções.

Após cada reflow, o número de páginas muda e `resolvePageNumber` é executado de
novo por índice. Formato, intervalos, ocultação e colocação continuam intactos.

## Objetos posicionados

`BookPage.objects` é a camada visual persistente da página física. Uma imagem
contém `id`, `anchorMode: "page"`, `assetId`, X/Y/W/H em mm, proporção original,
trava de proporção e `zIndex`. A contenção na `BookPage` é a associação física;
o índice não é duplicado no objeto. O discriminador e `anchorMode` preparam
outros tipos e âncoras sem acoplar o objeto à história.

Objetos são irmãos visuais do trim/texto, por isso podem ultrapassar margens,
trim e sangria. Margens nunca fazem clamp. O renderer soma o deslocamento da
sangria à coordenada baseada no trim e aplica zoom apenas ao gerar CSS. O
stacking é normalizado por página, com inteiros crescentes.

Drag converte delta de tela para mm. Resize usa oito alças, dimensão mínima de
1 mm e pode conservar a proporção original. O snap compara bordas e centros do
objeto com trim, centro da página, margens, sangria e guias. A tolerância padrão
é oito pixels convertidos para mm no zoom corrente; só o resultado em mm é
persistido.

Objetos não entram em `TextStory` nem em `composeStory`. Reflow altera somente o
snapshot textual. `synchronizePhysicalPages` usa o máximo entre páginas de texto
e a última página com objetos; uma imagem na página física 10 preserva essa
página mesmo se o texto diminuir para oito.

## Assets

O main process abre o seletor nativo e valida a assinatura de PNG, JPEG ou WebP,
com limite de 50 MB. O preload expõe somente nome, MIME e bytes base64; Node não
é habilitado no renderer. O asset persiste UUID, nome, MIME, encoding, base64 e
dimensões em pixels. A relação é
`PositionedImageObject.assetId → AssetReference.id`.

O JSON fica autocontido e o navegador reutiliza a mesma data URL durante drag e
resize. Base64 tem custo de tamanho aproximado de 33%. No futuro, os mesmos IDs
podem virar entradas binárias de um contêiner `.livro` sem alterar objetos ou
geometria.

## Réguas, guias e precisão

Réguas horizontal e vertical são projetadas na página ativa e têm origem no
trim. Guias manuais do schema 3 são globais ao documento, com orientação e
posição em mm; podem ser criadas, editadas, arrastadas, ocultadas ou excluídas.
Margens e sangria continuam derivadas e independentes.

`DocumentViewSettings` persiste visibilidade de margens, sangria, réguas e guias,
estado de snap e modo spread/página única. Alinhamentos rápidos calculam somente
com a geometria da página e não dependem de pixels ou margens.

## Persistência e compatibilidade

O formato é JSON UTF-8 com `schemaVersion: 3`. O codec aceita schemas 1 e 2,
completa propriedades tipográficas, estilos e configurações de precisão
ausentes, normaliza objetos legados e devolve schema 3. Conteúdo estruturado,
marks, vínculos, overrides, estilos globais, páginas, objetos, guias e assets são
persistidos; fragmentos e quebras automáticas continuam derivados.

TXT é decodificado como UTF-8, com BOM UTF-16, normaliza quebras e recebe
`body`. DOCX usa `mammoth.extractRawText` como fallback e
`mammoth.convertToHtml` para mapear parágrafos, headings, negrito, itálico e
sublinhado. Formatação desconhecida é ignorada sem abortar a importação.

## Exportação PDF editorial no 0.8.0

`LayoutSnapshot` continua sendo o contrato textual, enquanto `BookPage.objects`
fornece a camada gráfica. O exportador combina page setup, snapshot, numeração e
objetos pelo índice físico, sem consultar monitor, zoom, modo spread ou página
ativa. A versão 0.8.0 materializa esse contrato pelo Chromium, mas não introduz um
segundo motor de paginação.

O fluxo entre as camadas é:

```text
BookDocument + LayoutSnapshot corrente
  -> seleção/validação de páginas físicas
  -> PdfExportDocument + ComposedTextLayer em mm/pt
  -> preflight de fontes e imagens
  -> renderer: CSS + lotes HTML de até 20 páginas + assets desduplicados
  -> desmontagem da superfície React transitória
  -> preload tipado: pdf:export
  -> main: validação de lotes, identidade/ordem e assets
  -> diretório exclusivo: CSS e assets gravados uma vez
  -> BrowserWindow dedicada: file: + printToPDF para cada lote
  -> pdf-lib: merge incremental + descarte de cada HTML/buffer parcial
  -> metadados Livro Studio 0.8.0
  -> validação do PDF mesclado e da contagem de páginas
  -> gravação atômica no destino
```

### Projeção compartilhada e fidelidade

`ComposedTextLayer` recebe um projetor de unidades. `PagePreview` converte mm/pt
para pixels usando o zoom; `PdfExportDocument` fornece CSS `mm`/`pt`. Ambos
percorrem as mesmas linhas e runs do snapshot e usam a mesma projeção de folio.
Alinhamento, recuo, posição vertical e espaçamento da justificação já chegam
resolvidos. `white-space: pre` impede colapso de espaços; o Chromium faz shaping e
pintura, mas não escolhe novas quebras de linha ou de página.

O projetor do preview retorna strings CSS com sufixo `px` para mm e pt. Isso é
especialmente importante em `line-height`: um `number` React seria interpretado
como fator unitless da fonte, enquanto `${altura}px` conserva exatamente a altura
medida no snapshot. O projetor PDF continua emitindo a mesma altura em `mm`.

A superfície de PDF é uma raiz editorial dedicada, fora da interface visível, com
um `article` por página de saída. Cada página física do Livro Studio vira uma
página individual no PDF, nunca um spread. Texto e folio ficam no trim; imagens
ficam em uma camada estática acima deles, ordenada por `zIndex`. Guias, réguas,
handles, seleção, toolbar, diálogo e demais elementos interativos não pertencem a
essa árvore.

Depois do preflight, `serializePdfExportSurface` copia o CSS legível e clona apenas
essa árvore editorial em lotes sequenciais de até 20 páginas. Durante a clonagem,
origens `img src="data:image/{png,jpeg,webp};base64,..."` são desduplicadas
globalmente pela data URL. O primeiro uso cria `asset-N.png`, `.jpg` ou `.webp`;
todos os usos recebem `./assets/<nome>`. Assim, nenhum data URL de imagem suportada
permanece em `htmlChunks`, e o base64 aparece uma única vez na lista `assets`.

O processo principal recebe strings e assets, não o DOM vivo nem estado do editor.
Imediatamente após serializar, `App` limpa `pdfExportJob` e desmonta a superfície
React com todas as imagens decodificadas; o seletor nativo, a impressão e o merge
não mantêm essa segunda árvore de páginas na janela principal.

Runs semanticamente vazios recebem U+200B no DOM para conservar a caixa da linha e
o caret. O caractere é invisível, mas alguns extratores de texto PDF podem
devolvê-lo. Ele não altera offsets nem o texto persistido da história.

### Páginas físicas, intervalos e sangria

A interface usa números físicos base um; internamente o exportador trabalha com
índices base zero. A gramática aceita itens e intervalos separados por vírgula,
com hífen, en dash ou em dash. Intervalos vazios, invertidos ou fora do documento
são rejeitados; sobreposições e repetições são deduplicadas e ordenadas. Folios
romanos/arábicos, intervalos lógicos e exceções de visibilidade permanecem apenas
conteúdo da página selecionada, não identificadores do intervalo.

Sem sangria, `@page`, o contêiner externo e o `MediaBox` usam largura/altura do
trim; `overflow` recorta qualquer parte de imagem externa. Com sangria, a largura
é `trim + inner + outer` e a altura é `trim + top + bottom`.
`resolveFacingEdges` mapeia interno/externo para esquerda/direita com base no
índice físico original, inclusive quando somente um intervalo é exportado. O
trim e os objetos ancorados nele recebem esse deslocamento, permitindo que X/Y
negativos apareçam dentro da caixa de sangria e recortando apenas o que ultrapassa
a caixa final.

### Preflight, lotes, IPC e gravação atômica

Antes de abrir a gravação nativa, o renderer monta a superfície, aguarda
`document.fonts.ready` e chama `decode()` para todas as imagens. Assets ausentes,
imagens vazias/corrompidas, timeout e tipos de objeto ainda não exportáveis
interrompem o fluxo. As linhas selecionadas fornecem os pares família/peso/itálico;
um `FontFace(local(...))` verifica cada variante não genérica, incluindo Georgia
quando há folio visível. Uma variante ausente falha explicitamente para impedir
substituição silenciosa.

O preload expõe somente o pedido tipado `pdf:export`, composto por metadados,
dimensões, CSS, lotes HTML e assets. O main valida nome, título, dimensões,
contagem, tamanho do CSS/HTML e estrutura de cada lote. Embora o renderer produza
no máximo 20 páginas por lote, a fronteira nativa aplica seu teto defensivo de 25
e confere se a soma coincide com `expectedPageCount`.

Cada `article.pdf-export-page` precisa declarar `data-output-page` contíguo a
partir de 1 e `data-physical-page` estritamente crescente. A contagem de classes
precisa coincidir com a de identidades, impedindo marcação ambígua, duplicação,
omissão ou reordenação silenciosa. Para cada asset, o main valida nome seguro e
único, extensão coerente, base64, limite individual/total, assinatura binária e
MIME detectado. Todo `img src` precisa ser `./assets/asset-N.ext`, apontar para um
item autorizado, e nenhum asset enviado pode ficar sem referência. O main também
impede duas exportações simultâneas por janela antes do seletor nativo.

Uma única `BrowserWindow` oculta é criada exclusivamente para a exportação, com
`sandbox: true`, `contextIsolation: true`, `nodeIntegration: false`, sem preload e
sem compartilhar o DOM da janela do editor. O main cria com `mkdtemp` um diretório
exclusivo, grava `livro-studio.css` uma vez e grava cada asset binário uma vez em
`assets/`. Em seguida cria apenas o HTML do lote corrente, que referencia esses
recursos relativos, e carrega sua URL `file:`. A CSP permite imagens/estilo locais,
mas não scripts nem rede. Não há mais HTML monolítico em URL `data:`.

Depois de aguardar fontes, imagens e dois frames, a janela chama
`webContents.printToPDF` com escala 1, margem zero, `preferCSSPageSize`, fundo
impresso e tamanho físico compatível com `@page`. O fluxo é estritamente serial.

Cada lote possui timeout padrão de 60 segundos. Se `loadURL`, preparação de
recursos ou `printToPDF` não terminar dentro desse prazo, a janela dedicada é
destruída imediatamente. O `finally` sempre tenta destruir a janela e remover o
diretório inteiro. Falhas de limpeza são agregadas sem substituir o erro operacional
original; se não havia erro anterior, a falha de limpeza é reportada diretamente.
Nenhum arquivo final é gravado quando um lote falha.

Cada buffer parcial tem cabeçalho, trailer, `startxref`, pelo menos uma página e
contagem esperada validados. Suas páginas são copiadas imediatamente para o
`PDFDocument` mesclado; o loop de produção não conserva um array de buffers de todos os lotes.
Depois do append, o HTML daquele lote é apagado antes de o seguinte ser criado.
O merge incremental preserva a ordem, define `Title` com o título do livro e fixa
`Creator` e `Producer` em `Livro Studio 0.8.0`. A contagem total é novamente
conferida antes da única gravação final.

Após o diretório de impressão ser limpo, o buffer final é escrito em um temporário
exclusivo no mesmo diretório do destino, sincronizado com `fsync` e promovido por
rename. Se um filesystem ou antivírus recusar a substituição direta, o arquivo
anterior é movido para um backup exclusivo; falhas posteriores tentam restaurá-lo.
O caminho final nunca é apagado como estratégia de limpeza de temporário.

### Verificação e limites da rota

`npm.cmd run pdf:smoke` valida A5 com e sem sangria, intervalo físico, texto rico,
folios, PNG/JPEG/WebP, transparência, z-order, geometria fracionária e independência
de zoom/view. Também verifica o uso de uma única janela dedicada, sua destruição e
a ordem física no resultado mesclado. Com Poppler disponível, inspeciona texto
selecionável, fontes/imagens e compara o raster de preview e PDF.
Na execução final registrada, `npm.cmd run pdf:benchmark` exportou 100 páginas,
149.707 caracteres e 40 imagens em cinco lotes de 20. A etapa de exportação levou
2,73 s e o delta de working set foi +8,5 MiB. O script continua registrando
duração, tamanho, contagem e distribuição dos lotes sem transformar uma medição
de uma máquina em limite normativo de desempenho.
Os testes unitários de `npm.cmd run check` cobrem geometria do snapshot, ranges,
preflight, desduplicação de assets, limites e assinaturas, referências,
identidade/ordem, opções de `printToPDF`, merge incremental/metadados,
timeout/destruição da janela, preservação de erros de limpeza e substituição
atômica.

O conteúdo gráfico de cada lote ainda pertence ao encoder PDF do Chromium/Skia, e
o subset/embedding permitido por cada fonte continua dependente da fonte. O merge
controla `Title`, `Creator` e `Producer`, mas não torna o arquivo estável byte a byte
entre versões do Electron. CSS mm é convertido em pontos e pode sofrer
arredondamento pequeno no `MediaBox` e nas coordenadas; os testes geométricos usam
tolerância numérica. A rota é RGB e ainda não produz PDF/X, CMYK, perfil ICC,
marcas de corte ou imposição.

No desenvolvimento, Vite recarrega somente o renderer. Mudanças em
`electron/main.ts`, `electron/preload.ts` ou módulos carregados por eles exigem
encerrar e reiniciar Electron para recompilar `dist-electron`; uma janela antiga
pode não expor a ponte `pdf:export` atual.

## Riscos e próximos endurecimentos

- Refinar agrupamento temporal de undo e IME/composição em casos complexos.
- Evoluir o preflight local para registro/incorporação administrada de fontes e
  relatório de licenças/embedding, mantendo `document.fonts.ready` como barreira.
- Adicionar órfãs, viúvas, hifenização e regras editoriais de bloco.
- Tornar o reflow incremental a partir do primeiro bloco alterado.
- Virtualizar spreads fora da viewport sem perder a seleção.
- Trocar base64 por entradas binárias compactadas no contêiner `.livro`.
- Adicionar objetos ancorados à história, crop e rotação sem alterar objetos de
  página existentes.
- Preservar alinhamento direto e page breaks de DOCX quando o conversor não os
  expõe no HTML.
