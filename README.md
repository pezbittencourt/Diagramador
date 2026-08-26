# Livro Studio 1.0.0

Editor desktop pessoal focado em escrita e diagramação de livros. A versão 1.0.0
combina a história contínua paginada com imagens fixas às páginas físicas,
réguas, guias, snapping, visualização de página única e exportação PDF
editorial a partir da mesma composição usada no preview. O projeto principal
agora é um `.livro` autocontido, com assets binários, gravação atômica,
autosave, backups rotativos, recuperação pós-crash e logs locais.

## Aviso sobre o projeto

Este projeto foi desenvolvido exclusivamente para **uso pessoal**, sem fins
lucrativos e sem a intenção, neste momento, de ser comercializado ou apresentado
como projeto acadêmico ou profissional.

O Livro Studio surgiu a partir de um **problema real de uso**: a necessidade de
uma ferramenta de diagramação de livros que oferecesse um fluxo mais adequado às
necessidades específicas do projeto em desenvolvimento, especialmente em relação
ao controle de páginas, numeração editorial, margens, sangria e organização do
conteúdo.

Todo o processo de concepção, arquitetura e desenvolvimento do software contou
de forma significativa com o auxílio de ferramentas de **Inteligência Artificial
da OpenAI**, utilizadas para análise de requisitos, planejamento arquitetural,
geração e modificação de código, documentação, investigação de problemas e
implementação de funcionalidades.

Dessa forma, este repositório **não pretende representar um projeto cujo código
tenha sido integralmente escrito manualmente por mim**.

Minha atuação durante o desenvolvimento concentrou-se principalmente em:

- definição dos requisitos e comportamento esperado do software;
- avaliação das decisões arquiteturais propostas;
- revisão da estrutura e organização do código;
- análise das alterações realizadas pela IA;
- testes funcionais e identificação de regressões;
- validação da integração entre diferentes funcionalidades;
- direcionamento das próximas etapas do desenvolvimento;
- acompanhamento de decisões relacionadas à manutenção e evolução do projeto.

O objetivo desse processo também foi utilizar o desenvolvimento como exercício
de **análise crítica de código e engenharia de software assistida por IA**.

Em vez de utilizar a IA apenas como mecanismo de geração automática de código, o
projeto foi conduzido buscando compreender e avaliar as decisões tomadas,
identificar riscos arquiteturais, verificar regressões e controlar a evolução do
sistema.

Assim, uma parte relevante do aprendizado envolvido no projeto está justamente
em desenvolver a capacidade de **gerenciar ferramentas de IA aplicadas à
programação**, mantendo supervisão humana sobre arquitetura, qualidade,
integração e comportamento do software, evitando um processo puramente baseado
em *vibe coding* sem revisão ou compreensão das alterações realizadas.

O Livro Studio deve, portanto, ser entendido principalmente como uma **solução
pessoal para um problema concreto e um experimento prático de desenvolvimento de
software assistido por Inteligência Artificial**.

## Stack

- Electron 43, React 19, TypeScript, Vite e Vitest.
- `mammoth` para extrair texto e HTML semântico de DOCX.
- Canvas 2D do Chromium para medir runs tipográficos no preview.
- `printToPDF` do Chromium para materializar a projeção editorial em PDF.
- `pdf-lib` para mesclar os lotes e normalizar os metadados do arquivo final.

As decisões de domínio estão em [`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Instalação

O target oficial é **Windows 10/11 x64**. Execute
`release/Livro Studio Setup 1.0.0.exe`, avance pelo assistente e abra o aplicativo
pelo Menu Iniciar. A instalação é offline, por usuário, fica em
`%LOCALAPPDATA%\Programs\Livro Studio` e não exige Node.js, npm, Git ou o
repositório. Nenhum atalho é criado automaticamente no Desktop.

O build 1.0.0 é funcional, mas **não assinado**. O Microsoft Defender SmartScreen
pode exibir um aviso porque o executável ainda não possui certificado/reputação;
a solução futura correta é assinatura Authenticode, não contornar o mecanismo.
Depois da instalação, `.livro` aparece como “Documento do Livro Studio” e pode ser
aberto por duplo clique, inclusive com espaços e Unicode no caminho.

Para remover o programa, use Configurações → Aplicativos → Livro Studio →
Desinstalar. O desinstalador remove aplicativo, atalho e associação, mas preserva
documentos do usuário e mantém deliberadamente os pequenos dados de recovery,
backups e logs em `%APPDATA%\Livro Studio` para não destruir trabalho recuperável.
Consulte [`WINDOWS_RELEASE_CHECKLIST.md`](./WINDOWS_RELEASE_CHECKLIST.md) antes do
primeiro uso em uma máquina externa limpa.

## Funcionalidades atuais

- Edição direta no ambiente paginado com cursor, seleção, clipboard e undo/redo.
- Negrito, itálico, sublinhado, fonte, tamanho e cor por seleção ou cursor.
- Alinhamento, entrelinha, espaços e recuos com impacto real na paginação.
- Estilos Corpo de texto, Título de capítulo, Subtítulo, Citação e Dedicatória.
- Edição global de estilos com atualização de todos os parágrafos vinculados.
- História estruturada em parágrafos e quebras manuais; reflow completo.
- Spreads em grade editorial: página 1 à direita, depois 2–3, 4–5 etc.
- Navegação por página, zoom, ajuste de spread e scroll.
- A4/A5/custom, margens espelhadas, sangria, guias e numeração editorial.
- Imagens PNG, JPEG e WebP livres, separadas do fluxo de texto.
- Drag, resize por oito alças, proporção bloqueável e controles X/Y/W/H em mm.
- Empilhamento, duplicação, exclusão, alinhamento à página e movimento por setas.
- Assets incorporados no projeto: o documento não depende do caminho original.
- Réguas em milímetros, guias personalizadas globais e snapping visual.
- Visualização em spread ou página única, com página ativa e navegação anterior/próxima.
- Novo, abrir, salvar, salvar como, dirty state e migração de projetos 0.4.
- Importação TXT simples e DOCX com formatação básica.
- Exportação PDF de todas as páginas ou de um intervalo de páginas físicas.
- Saída no tamanho do trim ou com sangria, preservando texto selecionável, folios,
  imagens, transparência, empilhamento e geometria fracionária.
- Preflight de fontes e imagens, conferência do total de páginas e gravação
  atômica para não expor um PDF parcial no destino.
- Impressão sequencial em lotes de até 20 páginas numa `BrowserWindow` dedicada,
  oculta e sandboxed, seguida por merge na ordem física.
- Desduplicação global de PNG/JPEG/WebP: os chunks HTML usam arquivos relativos
  e cada imagem incorporada atravessa o IPC e o diretório temporário uma única vez.
- Projeto `.livro` em ZIP validado, com `document.json`, `metadata.json` e assets
  binários independentes; `schemaVersion` lógico permanece 3 e o container tem
  versionamento próprio.
- Compatibilidade com JSON legado schemas 1, 2 e 3; o primeiro salvamento pede um
  destino `.livro` e nunca sobrescreve o JSON sem consentimento.
- Gravação atômica, autosave separado (debounce de 3 s e intervalo máximo de 30 s),
  três backups rotativos e recuperação pós-crash com data/hora.
- Recuperação parcial de asset ausente/corrompido por placeholder, preservando o
  objeto e o restante do documento.
- Logs locais de abertura, salvamento, recovery, assets, PDF e erros inesperados,
  sem registrar o conteúdo integral do manuscrito.

O DOCX preserva parágrafos, headings simples, negrito, itálico e sublinhado
quando expostos pelo conversor. Tabelas, imagens, notas, cabeçalhos, rodapés e
fidelidade total ao Word ainda não são importados.

## Executar

Requer Node.js 24 e npm 11. Nesta máquina há um Node portátil; no PowerShell:

```powershell
$env:Path = (Resolve-Path '.\.tools\node-v24.18.0-win-x64').Path + ';' + $env:Path
npm.cmd install
npm.cmd run dev
```

O Vite atualiza o renderer durante o desenvolvimento. Alterações em
`electron/main.ts`, `electron/preload.ts` ou em dependências carregadas por eles
exigem encerrar e reiniciar o processo Electron; caso contrário, a ponte nativa
de PDF pode continuar sendo a versão compilada anteriormente.

Para compilar e abrir a versão de produção:

```powershell
npm.cmd start
```

## Verificação

```powershell
npm.cmd run check
npm.cmd run smoke
npm.cmd run scenarios
npm.cmd run benchmark
npm.cmd run pdf:smoke
npm.cmd run pdf:benchmark
npm.cmd run project:benchmark
npm.cmd run package
npm.cmd run packaged:smoke
npm.cmd run dist
```

`package` gera `release/win-unpacked`. `dist` limpa `release/`, recompila tudo,
gera o NSIS x64, executa o smoke sobre o executável empacotado e grava o SHA-256
ao lado do instalador. Os ícones atuais são placeholders técnicos multirresolução;
`build/app.ico` e `build/livro.ico` devem ser substituídos quando a identidade
visual definitiva for fornecida.

O smoke salva `.tmp/livro-studio-smoke.png` e um projeto schema 3. Ele exercita
formatação, estilo global, reflow, imagem incorporada, drag, sangria, duplicação,
guia, página única, persistência, numeração e geometria de spread. O benchmark
usa mais de 160 mil caracteres, 720 parágrafos, 105 páginas e 40 imagens.

`scenarios` cobre combinações adicionais: zoom de 25% a 200%, nudges, histórico
gráfico após exclusão, copy/paste sem seleção, histórico textual independente,
guias negativas, redução drástica da história e reabertura do projeto.

`pdf:smoke` compila o aplicativo e exercita saída A5 com e sem sangria, intervalo
físico 15–30, independência de zoom/modo de visualização, rich text, folios,
imagens PNG/JPEG/WebP, transparência, z-order, geometria e continuidade da edição.
Ele também confere que cada exportação usa e descarta uma única janela de render
dedicada e que a ordem física permanece intacta no arquivo mesclado.
Os artefatos ficam em `.tmp/pdf-smoke`. Se Poppler estiver em
`.tools/poppler-26.02.0-0` ou indicado por `POPPLER_BIN`, o teste também verifica
texto selecionável, fontes/imagens e faz uma comparação raster independente.
Na execução final do 0.9.0, `pdf:benchmark` exportou 100 páginas, 149.707
caracteres e 40 imagens válidas em cinco lotes de 20. A exportação levou 3,83 s
e aumentou o working set em 11,7 MiB. O script rejeita lotes acima de 20 páginas e
registra duração, tamanho, contagem e distribuição dos lotes; esses valores são
uma medição do ambiente de teste, não um limite normativo de desempenho.

`project:benchmark` gera 100 páginas, mais de 160 mil caracteres e 40 imagens,
compara JSON base64 e `.livro`, mede salvamento, abertura, autosave e backup e
grava `.tmp/project-benchmark/report.json`. Na medição final: 173.293 caracteres,
7.357.916 bytes no JSON e 5.264.928 no `.livro` (−28,4%), salvar 595 ms, abrir
139 ms, autosave 580 ms e backup 126 ms. É uma fixture sintética, não um SLA.

Para diagnosticar o smoke sem o atalho do `package.json`, use:

```powershell
npm.cmd run build
node .\scripts\run-electron.cjs .\scripts\pdf-smoke.cjs
```

## Uso manual

1. Selecione texto no canvas e use a toolbar para fonte, tamanho, cor e ênfase.
2. Use `Estilo` para vincular o parágrafo a um estilo editorial.
3. Clique em `Editar estilos`, selecione um estilo e altere propriedades. A
   visualização atualiza imediatamente; `Salvar e fechar` encerra o painel.
4. Alinhamento, entrelinha, espaços e recuos criam overrides locais.
5. Atalhos: `Ctrl+B`, `Ctrl+I`, `Ctrl+U`, `Ctrl+Enter`, `Ctrl+Z`, `Ctrl+Y`,
   `Ctrl+Shift+Z` e `Ctrl+S`.
6. Clique em uma página para torná-la ativa e use `Inserir imagem`. A imagem é
   centralizada, selecionada e incorporada ao arquivo do projeto.
7. Arraste a imagem ou use X/Y/W/H no painel. A origem `0,0` é o canto superior
   esquerdo do trim; X/Y negativos levam a imagem para a sangria.
8. Use as alças para redimensionar, `Manter proporção` para travar o aspecto e os
   comandos do painel para alinhar ou mudar o empilhamento.
9. Com uma imagem focada, setas movem 0,5 mm, `Shift+seta` move 5 mm,
   `Ctrl+D` duplica e Delete exclui. Copy/paste e undo/redo gráficos são usados
   quando o foco está no objeto; o histórico de texto permanece independente.
10. Em `Precisão`, crie guias verticais/horizontais, edite sua posição ou arraste
    a linha na página ativa. Ative/desative réguas, guias e snapping separadamente.
11. Alterne entre `Spread` e `Página única`; use anterior, próxima, `Ir para` e
    `Ajustar página` sem alterar texto, objetos ou numeração.
12. Salve/abra normalmente em `.livro`; projetos JSON schemas 1 e 2 são migrados
    na abertura e só viram `.livro` depois que o usuário escolhe o destino. TXT recebe Corpo de
    texto e DOCX aproveita formatação básica.
13. Clique em `Exportar PDF`, escolha todas as páginas ou informe um intervalo de
    páginas físicas, por exemplo `1-3, 8, 11-13`.
14. Ative `Incluir sangria` quando o arquivo deva conter a área externa ao trim e
    escolha o destino no seletor nativo. Intervalos sobrepostos ou repetidos são
    normalizados e cada página física é emitida uma única vez, em ordem.
15. A exportação usa o estado corrente em memória, inclusive alterações ainda não
    salvas, sem mudar o zoom, a página ativa, o modo de visualização ou o dirty state.

## Exportação PDF editorial

O intervalo sempre se refere à **página física** do Livro Studio, não ao folio
editorial impresso. A página física 1 continua sendo a primeira folha individual
do arquivo, mesmo quando está no slot direito de um spread; o PDF nunca combina um
spread em uma única página. Hífens, en dashes e em dashes são aceitos nos
intervalos, que são validados antes de abrir o seletor de destino.

O fluxo da exportação é:

1. resolver as páginas físicas e validar objetos/assets;
2. montar uma superfície editorial isolada com o `LayoutSnapshot` corrente;
3. aguardar `document.fonts.ready`, confirmar cada família/peso/itálico local
   usado nas páginas e decodificar todas as imagens;
4. projetar linhas, folios e objetos e serializar o HTML em lotes de no máximo
   20 páginas; PNG/JPEG/WebP repetidos são extraídos uma vez para `assets`, seus
   data URLs são trocados por `./assets/...` e a superfície React é desmontada;
5. validar no processo principal o CSS, os tamanhos, a soma, o teto defensivo de
   25 páginas por lote, as identidades físicas/de saída e todos os assets;
6. criar um diretório temporário exclusivo, gravar CSS e assets uma vez e carregar
   cada HTML sequencialmente por URL `file:` numa `BrowserWindow` sandboxed;
7. imprimir um lote, acrescentá-lo imediatamente ao documento `pdf-lib` e apagar
   seu HTML antes de criar o próximo;
8. definir metadados, validar a contagem final e somente então realizar a gravação
   atômica do PDF mesclado.

Preview e PDF compartilham `ComposedTextLayer`: o preview converte mm/pt para pixels
no zoom atual e o PDF emite as mesmas linhas em mm/pt. O snapshot já contém X, Y,
altura, largura disponível/natural, espaçamento de justificação, offsets e runs;
portanto o Chromium pinta e incorpora o texto, mas não decide novamente onde
quebrar linhas ou páginas. Controles, guias, réguas, seleção e demais elementos da
interface não entram na superfície exportada.

No preview, inclusive `line-height` é emitido como um valor CSS explícito em `px`,
não como número sem unidade. Isso evita que o navegador o interprete como fator
multiplicador da fonte e mantém a altura medida da linha. Depois que os lotes e
assets são serializados, o App desmonta imediatamente a superfície transitória;
ela não permanece viva durante o seletor, a impressão ou o merge.

A janela principal do editor não é usada como alvo de `printToPDF`. O processo
principal cria uma janela exclusiva com `sandbox: true`, isolamento de contexto,
Node desativado e sem exibição. Cada lote é um arquivo HTML temporário carregado
por `file:`, com CSS e imagens relativos; não há um documento monolítico em URL
`data:`. A janela aguarda fontes e imagens e chama `printToPDF` com tamanho físico,
escala 1, fundo impresso e margem zero. O limite padrão é 60 segundos por lote: ao
excedê-lo, a janela é destruída, a exportação falha e nenhum arquivo final é
substituído. A mesma destruição ocorre ao concluir ou encontrar outro erro.

Sem sangria, o `MediaBox` tem o tamanho nominal da página e qualquer parte de
objeto fora do trim é recortada. Com sangria, a caixa recebe topo + base e
interno + externo; `resolveFacingEdges` converte interno/externo para
esquerda/direita conforme o lado da página física, e o trim é deslocado dentro
dessa caixa. Imagens continuam ancoradas ao trim, inclusive com X/Y negativos.

Antes da impressão, o main confirma base64, assinatura real, MIME, extensão,
tamanho, unicidade e uso de cada asset; os `src` só podem apontar para a lista
autorizada. Também exige `data-output-page` contíguo e `data-physical-page`
estritamente crescente, detectando omissões, duplicações e reordenação.

Cada PDF parcial tem sua contagem conferida e suas páginas são copiadas
imediatamente para um único `PDFDocument`; no fluxo de produção, não existe mais
um array com todos os buffers parciais. `pdf-lib` define `Title` com o título do livro e `Creator` e
`Producer` como `Livro Studio 1.0.0`. O buffer final só chega ao destino depois da
nova conferência de contagem. Ele é escrito em um temporário no mesmo diretório,
sincronizado e renomeado. Se a substituição direta falhar, o arquivo anterior
recebe um backup e é restaurado caso a segunda renomeação também falhe.

CSS e assets são gravados uma vez no diretório temporário de impressão; cada HTML
é removido logo após seu lote ser incorporado. O `finally` destrói a janela e
remove o diretório restante. Se a própria limpeza falhar depois de outro erro, o
erro operacional original é preservado junto dos erros de limpeza.

## Modelo de objetos e assets

Objetos pertencem à lista da `BookPage` que representa sua página física e usam
`anchorMode: "page"`. X/Y/W/H são sempre persistidos em milímetros com origem no
trim, nunca em pixels. A imagem não empurra o texto, não produz wrap e permanece
na mesma página física após reflow. Se houver objeto numa página posterior ao
fim do texto, essa página é preservada.

Cada objeto aponta para um `assetId`. Em memória, o renderer conserva MIME,
dimensões e base64 para manter preview e PDF estáveis. No disco, `.livro` troca o
base64 por uma entrada binária `assets/<hash>.<ext>` e `document.json` guarda a
referência. Consulte [`LIVRO_FORMAT.md`](./LIVRO_FORMAT.md).

As guias manuais são globais nesta versão: a mesma posição em mm aparece em
todas as páginas. Margens, trim, centros, sangrias e guias são candidatos de
snap; a tolerância é visual, portanto acompanha o zoom.

## Limitações conhecidas do 1.0.0

- O histórico é local à sessão. Texto tem até 200 entradas, com digitação/delete
  próximos agrupados; objetos, guias e estilos globais usam até 100 snapshots em
  um histórico contextual separado.
- IME e seleção em limites vazios ainda precisam de refinamento multilíngue.
- Justificação não tem hifenização, microtipografia, órfãs/viúvas ou
  keep-with-next.
- Reflow é integral e todos os spreads são renderizados; livros muito longos
  precisarão de composição incremental e virtualização.
- Fontes precisam estar disponíveis no sistema. O preflight rejeita famílias ou
  variantes locais ausentes para evitar substituição silenciosa; a incorporação,
  o subset e o mapeamento Unicode finais continuam sob responsabilidade do Chromium
  e das permissões da fonte.
- O DOCX depende da semântica do Mammoth; alinhamento direto e page breaks do
  Word nem sempre chegam ao HTML intermediário.
- Imagens são fixas à página: ainda não há wrap, imagem inline, âncora em
  parágrafo, crop, rotação, máscaras, filtros, seleção múltipla ou distribuição.
- Guias manuais são globais; não há guias exclusivas por página nem painel de
  layers completo.
- O renderer ainda hidrata assets como base64 em memória. O ganho de tamanho e
  manutenção existe no `.livro`, mas a abertura ainda não é incremental.
- Cada lote ainda é codificado pelo Chromium/Skia, portanto o arquivo não promete
  estabilidade byte a byte entre versões do Electron. Após o merge, entretanto,
  `Title`, `Creator` e `Producer` são controlados; `Producer` é
  `Livro Studio 1.0.0`.
- A conversão CSS de mm para pontos pode introduzir arredondamentos pequenos no
  `MediaBox` e nas coordenadas. Os testes comparam dimensões com tolerância numérica,
  não por igualdade textual do PDF.
- Parágrafos/runs vazios usam o caractere invisível U+200B para manter caret e altura
  de linha. Dependendo do extrator, esse caractere pode aparecer no texto extraído
  do PDF, embora não seja visível na página.
- A saída ainda não é PDF/X, não oferece CMYK, perfil ICC, marcas de corte ou
  imposição; cores seguem o pipeline RGB do Chromium.
- EPUB ainda não foi implementado.
- O instalador não possui assinatura Authenticode e pode receber aviso do
  SmartScreen. Os ícones incluídos são placeholders técnicos, não identidade final.
- O repositório não declara uma licença pública para o código do Livro Studio.
  Licenças e avisos das dependências distribuídas estão em
  [`THIRD_PARTY_NOTICES.txt`](./THIRD_PARTY_NOTICES.txt).
