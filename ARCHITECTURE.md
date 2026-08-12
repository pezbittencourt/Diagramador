# Arquitetura do Livro Studio

## Direção técnica

O aplicativo usa Electron, React e TypeScript. O renderer do Chromium oferece
edição, medição tipográfica por Canvas e uma futura rota de impressão usando a
mesma projeção visual. O processo principal acessa arquivos e diálogos; o
renderer isolado recebe somente uma API segura pelo preload.

## Camadas

- `src/domain`: documento, história e numeração, sem React ou Electron.
- `src/layout`: medição, paginação e snapshot derivado.
- `src/persistence`: JSON versionado, validação e compatibilidade.
- `src/components`: editor único, páginas e controles.
- `electron`: janela, arquivos nativos e importação TXT/DOCX.

O estado persistente usa milímetros e pontos. Pixels existem apenas na projeção
visual. Índices físicos são base zero internamente e base um na interface.

## História contínua

`TextStory.content` é um documento semântico com blocos tipados:

- `paragraph`: identidade estável, `styleId` e conteúdo inline preparado para
  marcas futuras;
- `pageBreak`: quebra manual persistente;
- nós inline de texto que poderão receber `marks` no marco 0.5.

Uma string plana é somente uma representação transitória usada pelas operações
iniciais de edição e importação. O arquivo preserva a árvore estruturada. As
quebras automáticas nunca entram nessa árvore.

## Editor e seleção

O canvas possui uma única raiz `contenteditable` abrangendo todos os spreads.
Cada fragmento visual declara offsets globais da história. Antes de uma edição,
o editor converte a seleção DOM para offsets semânticos; depois do reflow,
converte os offsets novamente para nós DOM e restaura seleção, foco e caret.

Isso evita editores independentes por página. Digitação, Enter, exclusão,
clipboard e histórico produzem operações sobre a história completa. `Ctrl+Enter`
insere um bloco `pageBreak` real.

Para o 0.5, as operações poderão migrar da representação plana transitória para
transações estruturais sem trocar o contrato história → snapshot → páginas. As
identidades de parágrafo e o `styleId` já existem; marcas inline já possuem um
tipo reservado no domínio.

Não foi adicionada uma engine rica no 0.4: ProseMirror/Tiptap ainda exigiria um
plugin próprio para projetar uma seleção única sobre fragmentos paginados, e o
marco atual não usa formatação. A camada mínima de edição está isolada em
`StoryEditor`. No começo do 0.5 ela deve ser substituída por transações e
histórico de uma engine madura; domínio, persistência e compositor não mudam.

## Medição e paginação

O compositor é uma função pura, parametrizada por `TextMeasurer`. No aplicativo,
`CanvasTextMeasurer` usa `measureText` com a fonte/tamanho resolvidos. Nos testes,
um medidor determinístico mantém os cenários reproduzíveis.

Para cada página o motor:

1. resolve o lado físico e as margens interna/externa;
2. calcula a área útil, sem incluir sangria;
3. quebra parágrafos em linhas por busca binária da maior faixa que cabe;
4. consome a altura disponível conforme tamanho, line-height e espaçamentos;
5. emite fragmentos com `blockId`, offsets locais/globais e estado de início/fim;
6. honra `pageBreak` iniciando uma página nova.

O 0.4 recompõe do começo ao fim. Assim, inserções empurram conteúdo para frente
e exclusões o puxam de volta, removendo páginas vazias. `pages` é sincronizado
com o snapshot; páginas com objetos futuros nunca serão removidas pelo
sincronizador.

## Tipografia

Os valores não estão espalhados na UI. `ParagraphStyle` centraliza família,
tamanho, altura de linha, alinhamento, espaços antes/depois e recuos. O estilo
`body` é a configuração global inicial. Alterar tamanho da página, margens,
espelhamento, história ou estilos invalida o snapshot.

## Numeração

A numeração continua derivada de regras, nunca fixada por página:

- índice físico: posição em `pages`;
- número lógico: calculado por `numbering.ranges`;
- visibilidade: regra global, intervalos e exceções.

Depois de cada reflow, `pages` muda de quantidade e `resolvePageNumber` é chamado
novamente por índice. Formato, intervalo, ocultação e posição interna/externa
continuam funcionando.

## Persistência e compatibilidade

O formato permanece JSON UTF-8 com `schemaVersion: 1`. O 0.3 já possuía
`stories` e uma árvore genérica, portanto não houve mudança incompatível. Ao
abrir um arquivo anterior, o codec adiciona IDs ausentes aos parágrafos,
normaliza `styleId` e mantém os demais defaults defensivos. Conteúdo e regras
são persistidos; fragmentos e quebras automáticas são recalculados.

TXT é decodificado como UTF-8, com suporte a BOM UTF-16, e suas quebras são
normalizadas. DOCX usa `mammoth.extractRawText`; nesta fase somente texto e
parágrafos relevantes são aproveitados.

## Preview e PDF futuro

`LayoutSnapshot` é o contrato comum. Hoje as páginas React o projetam; o futuro
exportador deverá consumir as mesmas posições, estilos e geometria numa rota de
impressão, evitando um segundo algoritmo de paginação.

## Riscos e próximos endurecimentos

- Refinar IME/composição e seleção em limites vazios de fragmentos.
- Medir após `document.fonts.ready` e registrar/embutir fontes.
- Adicionar órfãs, viúvas, hifenização e regras editoriais de bloco.
- Tornar o reflow incremental a partir do primeiro bloco alterado.
- Virtualizar spreads fora da viewport sem perder o mapeamento da seleção.
- Migrar operações simples para transações ricas no 0.5.
