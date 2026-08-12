# Livro Studio 0.4

Editor desktop pessoal focado em escrita e diagramação de livros. A versão 0.4
introduz uma história de texto contínua e paginação automática sem transformar
cada página em um editor independente.

## Stack

- Electron 43, React 19, TypeScript, Vite e Vitest.
- `mammoth` para extrair texto e parágrafos de arquivos DOCX.
- Canvas 2D do Chromium para medir texto no preview.

As decisões de domínio e os riscos técnicos estão em
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Funcionalidades atuais

- Edição direta no ambiente paginado: cursor, seleção, Enter, Backspace/Delete,
  copiar, recortar, colar, selecionar tudo e desfazer/refazer básico.
- Uma história principal estruturada em parágrafos e quebras manuais.
- Reflow completo para frente e para trás; páginas surgem e desaparecem.
- Quebra manual pelo botão `Quebra de página` ou `Ctrl+Enter`.
- Spreads dinâmicos: página 1 isolada, depois 2–3, 4–5 etc.
- Navegação por página física, zoom, ajuste de spread e scroll.
- Tamanho A4/A5/custom, margens espelhadas, sangria e guias.
- Numeração editorial física/lógica recalculada após cada reflow.
- Novo, abrir projeto, salvar, salvar como e estado não salvo.
- Importação separada de manuscritos TXT e DOCX.

O DOCX preserva texto e separação básica de parágrafos. Fontes, cores, estilos,
tabelas, imagens, notas, cabeçalhos e rodapés ainda não são importados.

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

O smoke salva uma captura em `.tmp/livro-studio-smoke.png`. O benchmark atual
usa cerca de 145 mil caracteres e produz aproximadamente 90 páginas.

## Teste manual sugerido

1. Clique no texto da primeira página e escreva ou cole conteúdo grande.
2. Edite o começo e confira o reflow das páginas seguintes.
3. Apague conteúdo e confira a redução da quantidade de páginas.
4. Altere margens ou tamanho e confira nova paginação.
5. Use `Ctrl+Enter` ou o botão de quebra de página.
6. Use `Ir para` para navegar a uma página física.
7. Salve, feche, abra o projeto e continue editando.
8. Use `Importar manuscrito` para TXT ou DOCX e confirme a substituição.
9. Ajuste a numeração editorial na lateral e confira os fólios.

## Limitações conhecidas do 0.4

- Somente texto simples é editável; marcas e estilos ricos ficam para o 0.5.
- O histórico é local à sessão e agrupa cada operação individualmente.
- Composição por IME e seleção iniciada em áreas vazias entre fragmentos ainda
  precisam de refinamento antes de um editor multilíngue de produção.
- Não há regras de órfãs/viúvas, hifenização ou keep-with-next.
- O reflow é integral e todos os spreads são renderizados; livros muito longos
  precisarão de composição incremental e virtualização.
- A fonte usada precisa estar disponível no sistema; incorporação de fontes
  ainda não existe.
- Imagens e PDF ainda não foram implementados.
