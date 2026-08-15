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

O 0.5 usa uma camada transacional pequena e fortemente tipada, em vez de manter
um segundo documento em ProseMirror/Tiptap. Isso conserva uma única fonte de
verdade e o contrato história → snapshot → páginas. Undo/redo local inclui
texto, marks, overrides e aplicação de estilos, limitado a 200 entradas.

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

## Persistência e compatibilidade

O formato é JSON UTF-8 com `schemaVersion: 2`. O codec aceita arquivos
0.4/schema 1, completa propriedades tipográficas e estilos editoriais ausentes,
normaliza IDs/styleId e devolve um documento schema 2. Conteúdo estruturado,
marks, vínculos, overrides e estilos globais são persistidos; fragmentos e
quebras automáticas são recalculados.

TXT é decodificado como UTF-8, com BOM UTF-16, normaliza quebras e recebe
`body`. DOCX usa `mammoth.extractRawText` como fallback e
`mammoth.convertToHtml` para mapear parágrafos, headings, negrito, itálico e
sublinhado. Formatação desconhecida é ignorada sem abortar a importação.

## Objetos e PDF futuros

`LayoutSnapshot` continua sendo o contrato de projeção. Páginas mantêm uma lista
independente de `PositionedObject`; o texto não foi acoplado a páginas físicas.
O marco 0.6 poderá adicionar imagens livres sem trocar o modelo da história. Um
futuro exportador deverá consumir o mesmo snapshot para evitar um segundo
algoritmo de composição.

## Riscos e próximos endurecimentos

- Refinar agrupamento temporal de undo e IME/composição em casos complexos.
- Medir após `document.fonts.ready` e registrar/incorporar fontes.
- Adicionar órfãs, viúvas, hifenização e regras editoriais de bloco.
- Tornar o reflow incremental a partir do primeiro bloco alterado.
- Virtualizar spreads fora da viewport sem perder a seleção.
- Preservar alinhamento direto e page breaks de DOCX quando o conversor não os
  expõe no HTML.
