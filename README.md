# Livro Studio

Protótipo desktop de um editor focado no fluxo de diagramação de livros. Esta
primeira etapa permite configurar páginas, margens espelhadas, sangria, guias,
zoom e visualizar um spread proporcional.

## Stack

- Electron 43
- React
- TypeScript
- Vite
- Vitest

A motivação e o plano para paginação, numeração e PDF estão em
[`ARCHITECTURE.md`](./ARCHITECTURE.md).

## Requisitos

- Node.js 24 LTS
- npm 11 ou compatível

## Executar em desenvolvimento

```powershell
npm install
npm run dev
```

## Verificar e iniciar a versão compilada

```powershell
npm run check
npm start
```

Os botões Abrir, Salvar e Página única aparecem desativados intencionalmente:
eles indicam funcionalidades já previstas, mas fora do MVP atual.

