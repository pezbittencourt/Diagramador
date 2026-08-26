# Formato de projeto `.livro`

Este documento descreve o container introduzido no Livro Studio 0.9.0. Ele é um
contrato de manutenção, não uma especificação pública definitiva.

## Identidade e versões

- Extensão principal: `.livro`.
- Container: ZIP.
- `metadata.json.format`: `livro-studio-project`.
- `metadata.json.containerVersion`: `1`.
- `document.json.schemaVersion`: versão lógica do documento, atualmente `3`.

`containerVersion` descreve empacotamento, manifesto e storage de assets.
`schemaVersion` descreve páginas, história, estilos, numeração, objetos e demais
dados de domínio. Alterar apenas a compressão ou o manifesto não exige mudar o
schema lógico.

## Estrutura versão 1

```text
Meu Romance.livro
├── document.json
├── metadata.json
└── assets/
    ├── <40 caracteres hex>.png
    ├── <40 caracteres hex>.jpg
    └── <40 caracteres hex>.webp
```

O nome binário é formado pelos primeiros 40 caracteres do SHA-256 do `asset.id`.
Isso preserva o UUID como identidade de domínio e impede que nomes fornecidos
pelo documento determinem paths internos.

## `metadata.json`

Campos atuais:

```json
{
  "format": "livro-studio-project",
  "containerVersion": 1,
  "kind": "project",
  "documentId": "uuid-ou-id-estável",
  "title": "Meu Romance",
  "schemaVersion": 3,
  "savedAt": "2026-08-21T22:00:00.000Z",
  "assetCount": 12
}
```

`kind` pode ser `project`, `autosave` ou `backup`. Snapshots de recovery podem
incluir `sourcePath` e `normalSavedAt`; esses containers ficam no diretório local
da aplicação, não no projeto portátil entregue ao usuário.

## `document.json`

É o documento normal, exceto pelo storage dos assets. Um asset interno usa:

```json
{
  "id": "asset-uuid",
  "fileName": "capa.png",
  "mimeType": "image/png",
  "encoding": "binary",
  "storagePath": "assets/0123456789abcdef0123456789abcdef01234567.png",
  "pixelWidth": 1800,
  "pixelHeight": 2700
}
```

Objetos continuam apontando somente para `assetId`. Ao abrir, o main process
valida e converte a entrada para o modelo runtime `encoding: "base64"`; ao salvar,
faz a conversão inversa. O restante do aplicativo não depende do ZIP.

## Validação e limites

- no máximo 512 entradas;
- container compactado de até 512 MiB;
- soma declarada descompactada de até 768 MiB;
- entrada individual de até 64 MiB;
- taxa declarada de descompressão de até 200:1 para entradas acima de 1 MiB;
- asset individual de até 50 MiB;
- `document.json` de até 32 MiB dentro do container;
- `metadata.json` de até 1 MiB;
- somente os dois JSONs, `assets/` e nomes de asset canônicos;
- paths absolutos, drive letters, barras invertidas, segmentos vazios, `.` e `..`
  são rejeitados;
- IDs e referências devem ser únicos/coerentes;
- MIME, extensão e assinatura PNG/JPEG/WebP devem concordar;
- assets não referenciados no container são rejeitados.

Um documento central inválido aborta a abertura. Um asset referido mas ausente,
corrompido ou impossível de descompactar produz warning e é hidratado sem bytes;
o objeto permanece para placeholder e recuperação parcial.

## Gravação e recuperação

O container completo é criado e reaberto para validação antes do commit. A escrita
usa temporário exclusivo no mesmo diretório, `fsync`, rename e rollback. Autosaves
e backups são `.livro` normais em diretórios de `app.getPath("userData")`:

```text
userData/
├── recovery/<hash-do-documento>/recovery.livro
├── backups/<hash-do-documento>/<data>-<uuid>.livro
└── logs/livro-studio.log
```

Há um recovery corrente por documento e três backups rotativos. Nenhum desses
arquivos é espalhado ao lado do projeto principal.

## Migração de JSON

JSON legado schemas 1, 2 e 3 continua aceito. O renderer executa a migração já
existente para schema 3. O caminho legado é mantido apenas como origem; Salvar
abre o diálogo `.livro` e nunca sobrescreve automaticamente o JSON antigo.

## Evolução futura

Leitores devem rejeitar `containerVersion` desconhecida em vez de presumir
compatibilidade. Uma futura mudança deve definir migração explícita, manter
limites defensivos e preferir recuperação parcial quando `document.json` ainda
for confiável.
