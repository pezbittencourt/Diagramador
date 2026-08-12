# Arquitetura do Livro Studio

## Direção técnica

O aplicativo usa Electron, React e TypeScript. O renderer do Chromium oferece a
base mais direta para edição rica (ProseMirror no próximo ciclo), composição por
CSS e exportação futura pelo mesmo motor de renderização. O processo principal
do Electron fica restrito a recursos do sistema: janelas, arquivos e PDF. O
renderer não recebe acesso direto a Node; toda capacidade nativa será exposta
por uma API pequena no preload.

## Camadas

- `src/domain`: documento e regras puras, sem React, DOM ou Electron.
- `src/layout`: contrato do compositor. Um `LayoutSnapshot` é a saída comum para
  preview e PDF.
- `src/persistence`: serialização e futuras migrações de schema.
- `src/components`: interface e projeção visual do estado.
- `electron`: janela desktop e futura ponte segura para abrir/salvar/exportar.

O estado persistente usa milímetros e pontos. Pixels existem somente na projeção
visual. Índices físicos são baseados em zero internamente e apresentados como
um número baseado em um para o usuário.

## Fluxo de texto futuro

O conteúdo principal é uma história contínua, representada por uma árvore
semântica compatível com o modelo do ProseMirror. As páginas não armazenam
editores independentes nem cópias do texto.

O compositor seguirá este fluxo:

1. Resolve estilos e frames disponíveis em ordem física.
2. Mede blocos e linhas com as fontes já carregadas.
3. Preenche cada frame e registra intervalos da história (`from`/`to`).
4. Aplica regras de quebra, órfãs/viúvas e elementos ancorados.
5. Emite um `LayoutSnapshot` imutável consumido pela tela e pela página de
   impressão.

No início, o reflow pode ser integral. Depois ele será incremental a partir do
primeiro bloco afetado, com virtualização dos spreads fora da tela. As quebras
calculadas nunca entram na árvore semântica; quebra forçada é um nó explícito.

## Numeração

As três ideias são independentes:

- posição da página em `pages` → índice físico;
- `numbering.ranges` → número lógico e formato;
- `numbering.display` + `BookPage.pageNumberVisible` → visibilidade.

Assim, ocultar o fólio não interfere na contagem. Uma página pode iniciar a
numeração, uma faixa lógica pode controlar onde mostrar os números e aberturas
de capítulo podem ser exceções por ID. Novas faixas permitem reinícios ou
algarismos romanos sem criar uma abstração pesada de seções.

## Persistência e PDF

O primeiro formato é JSON UTF-8, legível e versionado por `schemaVersion`.
Quando imagens forem implementadas, o arquivo `.livro` poderá ser um ZIP com
`document.json` e `assets/`, mantendo o mesmo modelo de domínio.

Preview e exportação devem consumir o mesmo `LayoutSnapshot` e as mesmas regras
CSS. O exportador abrirá uma rota de impressão invisível, aguardará fontes e
imagens, definirá `@page` e chamará `webContents.printToPDF` com tamanho CSS
preferencial. Sangria deverá aumentar a mídia do PDF além da caixa de corte.

## Riscos controlados desde o início

- Cursor e seleção atravessando páginas: manter uma única árvore/estado de
  edição e mapear suas posições aos fragmentos visuais.
- Variação de fontes: embutir ou validar arquivos de fonte e só compor após
  `document.fonts.ready`.
- Desempenho: cachear medições, recompor a partir do ponto alterado e
  virtualizar spreads.
- Fidelidade: nunca manter implementações independentes de layout para tela e
  PDF; testes visuais devem comparar páginas rasterizadas.

