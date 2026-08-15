# Livro Studio 0.5

Editor desktop pessoal focado em escrita e diagramação de livros. A versão 0.5
adiciona rich text e estilos editoriais sobre a história contínua paginada, sem
transformar cada página em um editor independente.

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

As decisões de domínio estão em [`ARCHITECTURE.md`](./ARCHITECTURE.md).

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
- Novo, abrir, salvar, salvar como, dirty state e migração de projetos 0.4.
- Importação TXT simples e DOCX com formatação básica.

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

Para compilar e abrir a versão de produção:

```powershell
npm.cmd start
```

## Verificação

```powershell
npm.cmd run check
npm.cmd run smoke
npm.cmd run benchmark
```

O smoke salva `.tmp/livro-studio-smoke.png` e um projeto schema 2. Ele exercita
formatação, estilo global, reflow, persistência, numeração e geometria de spread.
O benchmark usa mais de 160 mil caracteres, 720 parágrafos e cerca de 100 páginas.

## Uso manual

1. Selecione texto no canvas e use a toolbar para fonte, tamanho, cor e ênfase.
2. Use `Estilo` para vincular o parágrafo a um estilo editorial.
3. Clique em `Editar estilos`, selecione um estilo e altere propriedades. A
   visualização atualiza imediatamente; `Salvar e fechar` encerra o painel.
4. Alinhamento, entrelinha, espaços e recuos criam overrides locais.
5. Atalhos: `Ctrl+B`, `Ctrl+I`, `Ctrl+U`, `Ctrl+Enter`, `Ctrl+Z`, `Ctrl+Y`,
   `Ctrl+Shift+Z` e `Ctrl+S`.
6. Salve/abra normalmente; arquivos 0.4/schema 1 são migrados na abertura. TXT
   recebe Corpo de texto e DOCX aproveita formatação básica.

## Limitações conhecidas do 0.5

- O histórico é local à sessão, tem 200 entradas e agrupa cada operação
  individualmente; edições globais de estilos não entram no undo.
- IME e seleção em limites vazios ainda precisam de refinamento multilíngue.
- Justificação não tem hifenização, microtipografia, órfãs/viúvas ou
  keep-with-next.
- Reflow é integral e todos os spreads são renderizados; livros muito longos
  precisarão de composição incremental e virtualização.
- Fontes precisam estar disponíveis no sistema; incorporação ainda não existe.
- O DOCX depende da semântica do Mammoth; alinhamento direto e page breaks do
  Word nem sempre chegam ao HTML intermediário.
- Imagens, objetos posicionados e PDF ainda não foram implementados.
