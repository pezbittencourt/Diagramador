# Arquitetura do Livro Studio

## Direção técnica

O aplicativo usa Electron, React e TypeScript. O renderer do Chromium oferece
edição, medição tipográfica por Canvas e uma futura rota de impressão usando a
mesma projeção visual. O processo principal acessa arquivos e diálogos; o
renderer isolado recebe somente uma API segura pelo preload.

## Camadas

- `src/domain`: documento, história, formatação e numeração, sem React/Electron.
- `src/layout`: medição, paginação, spreads e snapshot derivado.
- `src/persistence`: JSON versionado, validação e migração.
- `src/components`: editor único, páginas e controles.
- `electron`: janela, arquivos nativos e importação TXT/DOCX.

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
6. emite fragmentos/runs com IDs, offsets locais/globais e início/fim;
7. honra `pageBreak` iniciando uma página nova.

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

Justificação usa `text-align: justify` no Chromium. Ainda não há hifenização,
controle de órfãs/viúvas ou justificação microtipográfica.

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

## Contrato para o PDF futuro

`LayoutSnapshot` continua sendo o contrato textual, enquanto `BookPage.objects`
fornece a camada gráfica. Um exportador pode combinar page setup, snapshot,
numeração e objetos por índice físico, converter mm para pontos e recortar no
bleed sem consultar CSS, monitor, zoom ou página ativa. Essa é a base para manter
preview e PDF derivados da mesma composição; PDF não faz parte do marco 0.7.

## Riscos e próximos endurecimentos

- Refinar agrupamento temporal de undo e IME/composição em casos complexos.
- Medir após `document.fonts.ready` e registrar/incorporar fontes.
- Adicionar órfãs, viúvas, hifenização e regras editoriais de bloco.
- Tornar o reflow incremental a partir do primeiro bloco alterado.
- Virtualizar spreads fora da viewport sem perder a seleção.
- Trocar base64 por entradas binárias compactadas no contêiner `.livro`.
- Adicionar objetos ancorados à história, crop e rotação sem alterar objetos de
  página existentes.
- Preservar alinhamento direto e page breaks de DOCX quando o conversor não os
  expõe no HTML.
