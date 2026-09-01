# UI Showcase

Base visual genérica para aplicações desktop React + TypeScript. O projeto isola a linguagem de interface observada no Livro Studio sem incluir funções editoriais, integração nativa ou dados do aplicativo de origem.

## Objetivo e stack

A extração oferece shell de aplicação, sidebar densa, seções recolhíveis, toolbar, campos, botões, seletores, feedback e diálogos. O showcase usa somente dados fictícios.

- React 19 e TypeScript estrito;
- Vite para desenvolvimento e build;
- CSS puro com custom properties;
- Vitest, Testing Library e jsdom apenas no desenvolvimento;
- nenhuma dependência de Electron, biblioteca de ícones ou framework de componentes.

## Executar

```bash
npm install
npm run dev
npm run typecheck
npm test
npm run build
```

O servidor de desenvolvimento abre o showcase independente. O build é gravado em `dist/`.

## Componentes disponíveis

### Layout

- `AppShell`: topo, sidebar, workspace, toolbar opcional e status bar;
- `Sidebar`, `SidebarSection`, `SidebarGroup`: navegação lateral com scroll independente, seções controladas ou não controladas e estado disabled;
- `Toolbar`, `ToolbarGroup`: faixa horizontal rolável e grupos separados;
- `FieldGroup`: agrupamento semântico de controles em uma, duas ou três colunas.

### Controles e conteúdo

- `TextField`, `NumberField`, `SelectField`, `ColorField`;
- `Toggle`, `Checkbox`, `SegmentedControl`;
- `Button`, `IconButton`, `ButtonGroup`;
- `Panel`, `Card`, `Label`, `HelpT  ext`, `Divider`;
- `Dialog`/`Modal`, `ConfirmDialog`;
- `StatusIndicator`, `EmptyState`.

Todos os controles que representam valores aceitam o valor por props e notificam mudanças por callback. `SidebarSection` pode usar `defaultOpen` ou o par `open`/`onOpenChange`.

## Exemplo de sidebar

```tsx
import { NumberField, SelectField, Toggle } from "./src/components";
import { Sidebar, SidebarGroup, SidebarSection } from "./src/layout";

<Sidebar title="Configurações" aria-label="Configurações do sistema">
  <SidebarSection title="Filtros">
    <SidebarGroup>
      <SelectField
        label="Departamento"
        value={department}
        options={departments}
        onChange={setDepartment}
      />
      <NumberField
        label="Prioridade"
        value={priority}
        min={1}
        max={5}
        onChange={(value) => value !== "" && setPriority(value)}
      />
      <Toggle label="Mostrar detalhes" checked={details} onChange={setDetails} />
    </SidebarGroup>
  </SidebarSection>
</Sidebar>
```

## Tokens visuais

Os tokens ficam em `src/tokens/tokens.css`. Os principais pontos de personalização são:

- cores: `--ui-bg`, `--ui-surface`, `--ui-border`, `--ui-text`, `--ui-text-muted`, `--ui-accent`, `--ui-hover`, `--ui-active`, `--ui-danger`;
- tipografia: `--ui-font-sans`, `--ui-font-display` e escala `--ui-font-*`;
- geometria: `--ui-space-*`, `--ui-radius-*`, `--ui-control-height`, `--ui-sidebar-width`, `--ui-toolbar-height`;
- profundidade e interação: `--ui-shadow-*`, `--ui-focus-ring`, `--ui-transition-fast`.

`AppShell` aceita `accentColor` para um ajuste simples por instância. Nome, subtítulo e logo também são propriedades, e o logo pode ser qualquer `ReactNode`.

## Dependências

### Obrigatórias

- `react`;
- `react-dom` somente para montar a aplicação/showcase;
- os stylesheets `src/styles/index.css`, `src/styles/ui.css` e `src/tokens/tokens.css`.

### Opcionais (desenvolvimento)

- Vite e plugin React para o playground/build;
- Vitest, Testing Library, user-event, jest-dom e jsdom para os testes.

Não há pacote opcional em runtime. Ícones são recebidos como `ReactNode`; um projeto consumidor pode instalar a biblioteca que preferir.

# Como reutilizar em outro projeto

1. Copie `src/components`, `src/layout`, `src/styles`, `src/tokens` e `src/index.ts`. Não copie `src/showcase` nem `src/test` para produção.
2. Instale React e garanta TypeScript com JSX habilitado.
3. Importe `src/styles/index.css` uma vez no entrypoint.
4. Ajuste os custom properties em `src/tokens/tokens.css` ou sobrescreva-os após esse import.
5. Monte `AppShell`, passando uma instância de `Sidebar` na prop `sidebar`.
6. Organize a lateral com `SidebarSection` e `SidebarGroup`.
7. Adicione controles pelas APIs tipadas; mantenha o estado no aplicativo consumidor.

```tsx
import { AppShell, Sidebar, SidebarSection, Toolbar } from "./ui";
import "./ui/styles/index.css";

export function Application() {
  return (
    <AppShell
      appName="Minha aplicação"
      sidebar={<Sidebar title="Opções"><SidebarSection title="Geral">...</SidebarSection></Sidebar>}
      toolbar={<Toolbar label="Ferramentas">...</Toolbar>}
    >
      <div>Área principal</div>
    </AppShell>
  );
}
```

## Análise e decisões

A origem concentrava toda a aparência em `src/styles.css`. O shell estava em `src/App.tsx`; a sidebar em `src/components/PropertiesPanel.tsx`; o campo numérico em `NumberField.tsx`; toolbars e diálogos apareciam em componentes especializados. Os elementos visuais eram simples, mas quase todos os agrupamentos recebiam objetos de documento, página, numeração, geometria ou comandos editoriais.

A cópia reutilizável preserva proporções, densidade, paleta, tipografia, bordas e sombras, mas substitui objetos de domínio por props, callbacks e `children`. As seções recolhíveis não existiam na origem e foram adicionadas como comportamento genérico e acessível. Valores recorrentes foram centralizados sem criar infraestrutura de tema adicional.

## Inventário da extração

| Elemento | Origem no Livro Studio | Destino isolado | Dependências | Alterações necessárias |
| --- | --- | --- | --- | --- |
| shell/topo/status | `src/App.tsx` | `src/layout/AppShell.tsx` | React | branding e áreas viraram props/children |
| sidebar | `src/components/PropertiesPanel.tsx` | `src/layout/Sidebar.tsx` | React | removidos tipos editoriais; scroll e disclosure genéricos |
| grupos de campos | `PropertiesPanel.tsx` e painéis auxiliares | `src/layout/Sidebar.tsx` e `src/layout/FieldGroup.tsx` | React | conteúdo fornecido por children |
| toolbar | `FormattingToolbar.tsx` e `Workspace.tsx` | `src/layout/Toolbar.tsx` | React | comandos editoriais removidos |
| campo numérico | `NumberField.tsx` | `src/components/Fields.tsx` | React | unidade configurável e estado vazio suportado |
| texto/select/cor | padrões em painéis e toolbar | `src/components/Fields.tsx` | React | APIs genéricas e mensagens de ajuda/erro |
| toggle/checkbox | `PropertiesPanel.tsx` e painéis | `src/components/SelectionControls.tsx` | React | callbacks booleanos e estados disabled |
| controle segmentado | botões de visualização e formatação | `SelectionControls.tsx` | React | opções tipadas e sem comandos de domínio |
| botões/grupos | ações do app e toolbars | `src/components/Button.tsx` | React | variantes sem semântica editorial |
| painel/card/feedback | painéis, notices e status | `src/components/Content.tsx` | React | conteúdo e status genéricos |
| modal/dialog | `PdfExportDialog.tsx`, `StyleEditor.tsx` e recovery | `src/components/Dialog.tsx` | React | conteúdo, rodapé e callbacks genéricos; Escape/foco básico |
| tokens e estilos | `src/styles.css` | `src/tokens/tokens.css`, `src/styles/ui.css` | CSS | hexadecimais recorrentes centralizados |

Nenhum arquivo original foi copiado literalmente ou modificado; todos os destinos foram escritos como adaptações independentes.

## Arquivos analisados e não reutilizados

- `src/App.tsx`: lógica de documento, autosave, recovery, arquivos, importação e exportação;
- `src/components/Workspace.tsx`: canvas, navegação física, zoom e edição;
- `src/components/FormattingToolbar.tsx`: comandos de texto e tipos de parágrafo;
- `src/components/NumberingPanel.tsx`: regras de numeração;
- `src/components/PrecisionPanel.tsx` e `PagePrecisionOverlay.tsx`: guias e geometria de página;
- `src/components/ObjectPropertiesPanel.tsx` e `PositionedObjectLayer.tsx`: objetos editoriais e z-order;
- `src/components/PagePreview.tsx`, `EditorialText.tsx` e `StoryEditor.tsx`: composição, páginas e história textual;
- `src/components/PdfExportDialog.tsx` e `PdfExportDocument.tsx`: fluxo e renderização PDF;
- `src/components/StyleEditor.tsx`: modelo de estilos editoriais;
- `src/domain/**`, `src/layout/**`, `src/persistence/**`, `src/pdf/**` e `electron/**`: domínio, paginação, persistência, exportação e integração desktop.

## Exclusões deliberadas

Não foram incluídos compositor, paginação, páginas, margens/sangria, numeração, história textual, geometria, objetos editoriais, z-order, codecs, arquivos de projeto, PDF/DOCX, autosave, backup, recovery, IPC, processo Electron, instalador, fixtures, documentos, imagens ou dados pessoais.

## Acessibilidade e responsividade

Os componentes usam elementos nativos, labels associadas, `aria-expanded`, `aria-controls`, `role="switch"`, `role="toolbar"` e estado disabled real. O diálogo responde a Escape, devolve o foco anterior e possui rótulo acessível. O target é desktop: a sidebar mantém largura previsível e scroll independente; workspace e toolbar ocupam o restante, e a toolbar rola horizontalmente se necessário.

## Testes e auditoria

`src/test/components.test.tsx` cobre children, abrir/fechar seção, disabled, toggle, input, número, select e callbacks. Antes de publicar, execute `npm run typecheck`, `npm test` e `npm run build`.

A auditoria recomendada para código-fonte (excluindo esta documentação de proveniência) é:

```bash
rg -n -i "BookDocument|BookPage|pagination|compositor|electron|persist|pdf|\\.livro|C:\\\\Users|OneDrive" src
rg -n "from .*src/(domain|layout|persistence|pdf)|window\\." src
```

O resultado esperado é vazio. O showcase usa somente nomes e métricas inventados.
