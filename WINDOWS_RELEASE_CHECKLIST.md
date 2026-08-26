# Checklist de validação externa — Livro Studio 1.0.0

Este checklist é a etapa manual restante para uma máquina Windows 10/11 x64
limpa. Ele **não foi executado neste ambiente**. Use apenas fixtures ou cópias de
documentos; nunca faça testes de corrupção, recovery ou desinstalação sobre o
único exemplar de um projeto real.

## Preparação

1. Confirme que a máquina não possui Node.js, npm, Git, VS Code nem o repositório.
2. Copie `Livro Studio Setup 1.0.0.exe` e o arquivo `.sha256` correspondente.
3. Calcule `Get-FileHash -Algorithm SHA256` e compare com o hash publicado.
4. Separe um DOCX simples, uma imagem PNG/JPEG/WebP e duas fixtures `.livro`.

## Instalação e uso

1. Execute o instalador; registre se o SmartScreen aparece no build não assinado.
2. Confirme instalação por usuário, sem pedido de administrador.
3. Confirme “Livro Studio” em Configurações → Aplicativos instalados.
4. Confirme o atalho no Menu Iniciar e a ausência de atalho automático no Desktop.
5. Abra pelo Menu Iniciar e confira Ajuda → Sobre → Livro Studio 1.0.0.
6. Crie um projeto, edite texto, aplique rich text/estilo e insira a imagem.
7. Importe o DOCX e confira texto, parágrafos e formatação básica.
8. Salve em `Documentos\Meus Livros\História São Paulo\Meu livro 01.livro`.
9. Feche, reinicie o processo e abra esse arquivo pelo duplo clique no Explorer.
10. Confira texto, estilos, páginas, imagem, numeração e o ícone/tipo
    “Documento do Livro Studio”.
11. Edite novamente, salve e reabra para validar o segundo round-trip.
12. Com o app aberto e limpo, dê duplo clique em outro `.livro`; confirme uma só
    instância, janela em primeiro plano e documento novo carregado.
13. Faça uma alteração sem salvar e repita o passo anterior três vezes, escolhendo
    respectivamente Cancelar, Não salvar e Salvar. Confirme que nenhuma escolha é
    ignorada e que Cancelar preserva o documento corrente.
14. Exporte todas as páginas e um intervalo para PDF. Confira total de páginas,
    texto selecionável, fontes, imagens, clipping, bleed, geometria e numeração.
15. Aguarde autosave, encerre inesperadamente usando uma cópia de teste e reabra;
    confira a oferta e o carregamento do recovery.
16. Faça salvamentos suficientes para criar backup e use “Versão anterior”.
17. Salve também em Desktop e em outra pasta escolhida; se uma pasta negar acesso,
    confira se a mensagem é compreensível.

## Desinstalação e reinstalação

1. Feche o aplicativo e desinstale em Configurações → Aplicativos.
2. Confirme remoção do executável, atalho, entrada de aplicativos e associação.
3. Confirme que todos os `.livro` e PDFs criados continuam presentes.
4. Confirme que `%APPDATA%\Livro Studio` foi preservado intencionalmente.
5. Reinstale a mesma versão, abra um `.livro` existente e verifique que
   recovery/backups/logs continuam legíveis.
6. Desinstale novamente se a máquina de teste deva retornar ao estado limpo.

## Registro do resultado

Anote data, edição do Windows, hash do instalador, resultado de cada passo,
mensagem do SmartScreen, tempos aproximados de abertura/salvamento/PDF e qualquer
diferença visual. Não marque “máquina limpa aprovada” sem concluir todos os itens.
