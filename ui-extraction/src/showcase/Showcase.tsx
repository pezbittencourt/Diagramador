import { useState } from "react";
import {
  Button,
  ButtonGroup,
  Card,
  Checkbox,
  ColorField,
  Dialog,
  EmptyState,
  IconButton,
  NumberField,
  Panel,
  SegmentedControl,
  SelectField,
  StatusIndicator,
  TextField,
  Toggle,
} from "../components";
import { AppShell, FieldGroup, Sidebar, SidebarGroup, SidebarSection, Toolbar, ToolbarGroup } from "../layout";

type ViewMode = "cards" | "list";

export function Showcase() {
  const [name, setName] = useState("Painel operacional");
  const [category, setCategory] = useState("operations");
  const [status, setStatus] = useState("active");
  const [period, setPeriod] = useState("month");
  const [department, setDepartment] = useState("all");
  const [owner, setOwner] = useState("team-a");
  const [details, setDetails] = useState(true);
  const [grouped, setGrouped] = useState(false);
  const [notifications, setNotifications] = useState(true);
  const [priority, setPriority] = useState(3);
  const [method, setMethod] = useState("automatic");
  const [viewMode, setViewMode] = useState<ViewMode>("cards");
  const [accent, setAccent] = useState("#9a6c2b");
  const [dialogOpen, setDialogOpen] = useState(false);

  return <AppShell
    appName="Nimbus Console"
    appSubtitle="Ambiente de demonstração"
    logo="N"
    accentColor={accent}
    headerCenter={<StatusIndicator status="success" label="Ambiente disponível" />}
    actions={<><Button variant="ghost">Ajuda</Button><Button variant="primary" onClick={() => setDialogOpen(true)}>Nova tarefa</Button></>}
    sidebar={<Sidebar eyebrow="Workspace" title="Configurações" description="Ajuste a visualização e o processamento." aria-label="Configurações do dashboard">
      <SidebarSection title="Configurações gerais">
        <SidebarGroup>
          <TextField label="Nome" value={name} onChange={(event) => setName(event.currentTarget.value)} />
          <SelectField label="Categoria" value={category} onChange={setCategory} options={[{ value: "operations", label: "Operações" }, { value: "finance", label: "Financeiro" }, { value: "people", label: "Pessoas" }]} />
          <SelectField label="Status" value={status} onChange={setStatus} options={[{ value: "active", label: "Ativo" }, { value: "paused", label: "Pausado" }, { value: "archived", label: "Arquivado" }]} />
        </SidebarGroup>
      </SidebarSection>
      <SidebarSection title="Filtros">
        <SidebarGroup>
          <SelectField label="Período" value={period} onChange={setPeriod} options={[{ value: "week", label: "Esta semana" }, { value: "month", label: "Este mês" }, { value: "quarter", label: "Este trimestre" }]} />
          <SelectField label="Departamento" value={department} onChange={setDepartment} options={[{ value: "all", label: "Todos" }, { value: "sales", label: "Comercial" }, { value: "support", label: "Atendimento" }]} />
          <SelectField label="Responsável" value={owner} onChange={setOwner} options={[{ value: "team-a", label: "Equipe Aurora" }, { value: "team-b", label: "Equipe Horizonte" }]} />
        </SidebarGroup>
      </SidebarSection>
      <SidebarSection title="Visualização">
        <SidebarGroup>
          <Toggle label="Mostrar detalhes" description="Exibe dados complementares nos cards." checked={details} onChange={setDetails} />
          <Toggle label="Agrupar resultados" description="Organiza registros por departamento." checked={grouped} onChange={setGrouped} />
          <ColorField label="Cor de destaque" value={accent} onChange={(event) => setAccent(event.currentTarget.value)} />
        </SidebarGroup>
      </SidebarSection>
      <SidebarSection title="Processamento">
        <SidebarGroup>
          <SelectField label="Método" value={method} onChange={setMethod} options={[{ value: "automatic", label: "Automático" }, { value: "manual", label: "Manual" }, { value: "scheduled", label: "Agendado" }]} />
          <NumberField label="Prioridade" min={1} max={5} value={priority} onChange={(value) => setPriority(value === "" ? 1 : value)} />
          <Button variant="primary" onClick={() => setDialogOpen(true)}>Executar</Button>
        </SidebarGroup>
      </SidebarSection>
      <SidebarSection title="Opções avançadas" defaultOpen={false} disabled>
        <p>Conteúdo indisponível.</p>
      </SidebarSection>
    </Sidebar>}
    toolbar={<Toolbar label="Ferramentas do dashboard">
      <ToolbarGroup label="Visualização">
        <SegmentedControl label="Modo de visualização" value={viewMode} onChange={setViewMode} options={[{ value: "cards", label: "Cards" }, { value: "list", label: "Lista" }]} />
      </ToolbarGroup>
      <ToolbarGroup label="Ações">
        <ButtonGroup label="Histórico"><IconButton label="Desfazer" icon="↶" disabled /><IconButton label="Refazer" icon="↷" disabled /></ButtonGroup>
        <Button>Atualizar</Button>
      </ToolbarGroup>
      <ToolbarGroup align="end"><StatusIndicator status="neutral" label="Atualizado agora" /></ToolbarGroup>
    </Toolbar>}
    statusBar={<><span>24 registros · 3 equipes</span><span>Visualização: {viewMode === "cards" ? "cards" : "lista"}</span><span>UI Showcase · React</span></>}
  >
    <div className="showcase-canvas">
      <div className="showcase-heading"><div><span className="ui-eyebrow">Dashboard</span><h1>{name || "Sem título"}</h1><p>Visão geral com conteúdo fictício e independente.</p></div><Button variant="primary" onClick={() => setDialogOpen(true)}>Criar relatório</Button></div>
      <div className="showcase-grid">
        <Panel title="Resumo operacional" actions={<StatusIndicator status="success" label="Em dia" />}>
          <div className="showcase-metrics"><div className="showcase-metric"><span>Processados</span><strong>1.284</strong></div><div className="showcase-metric"><span>Pendentes</span><strong>36</strong></div><div className="showcase-metric"><span>Taxa de êxito</span><strong>98,4%</strong></div></div>
        </Panel>
        <Card eyebrow="Fila" title="Atividade recente" actions={<IconButton label="Mais opções" icon="•••" />}>
          <div className="showcase-list"><div className="showcase-list-row"><span>Importação de dados</span><StatusIndicator status="success" label="Concluída" /></div><div className="showcase-list-row"><span>Validação mensal</span><StatusIndicator status="warning" label="Em revisão" /></div><div className="showcase-list-row"><span>Sincronização</span><StatusIndicator status="neutral" label="Agendada" /></div></div>
        </Card>
        <Panel title="Preferências">
          <FieldGroup title="Notificações" description="Exemplo de controles e estados.">
            <Toggle label="Alertas do sistema" checked={notifications} onChange={setNotifications} />
            <Checkbox label="Receber resumo semanal" checked={details} onChange={setDetails} />
            <TextField label="Campo desabilitado" value="Somente leitura" disabled onChange={() => undefined} />
          </FieldGroup>
        </Panel>
        <Panel title="Estado vazio"><EmptyState icon="◇" title="Nenhum alerta crítico" description="Quando houver algo que exija atenção, os itens aparecerão nesta área." action={<Button>Revisar filtros</Button>} /></Panel>
      </div>
    </div>
    <Dialog open={dialogOpen} eyebrow="Processamento" title="Criar nova tarefa" onClose={() => setDialogOpen(false)} footer={<><Button onClick={() => setDialogOpen(false)}>Cancelar</Button><Button variant="primary" onClick={() => setDialogOpen(false)}>Criar tarefa</Button></>}>
      <FieldGroup columns={2} title="Detalhes"><TextField label="Título" defaultValue="Revisão de indicadores" /><SelectField label="Equipe" defaultValue="team-a" onChange={() => undefined} options={[{ value: "team-a", label: "Equipe Aurora" }, { value: "team-b", label: "Equipe Horizonte" }]} /></FieldGroup>
      <Toggle label="Notificar participantes" description="Envia uma atualização ao concluir." checked={notifications} onChange={setNotifications} />
    </Dialog>
  </AppShell>;
}
