// Pieces of the portal's interface, as the site shows them ([data-ui]: the app's own borders, radii
// and small type). Sample data of a fictional client ("Sua Empresa Ltda."), October 2026; the
// footer of the site says the screens carry sample data.
import type { ReactNode } from 'react';
import { Check, ChevronLeft, ChevronRight, Paperclip } from 'lucide-react';
import type { ServiceId, StepId } from '../site-content';

type Status = 'done' | 'doing' | 'wait' | 'open';

const STATUS_LABEL: Record<Status, string> = {
  done: 'Concluída',
  doing: 'Em andamento',
  wait: 'Aguardando você',
  open: 'A fazer',
};

export function StatusGlyph({ status }: { status: Status }) {
  return <span className={`ui-glyph ui-glyph--${status}`}>{status === 'done' ? <Check strokeWidth={3} /> : null}</span>;
}

function Badge({ status, children }: { status: Status; children?: ReactNode }) {
  return <span className={`ui-badge ui-badge--${status}`}>{children ?? STATUS_LABEL[status]}</span>;
}

function Attach({ children }: { children: ReactNode }) {
  return (
    <span className="ui-attach">
      <Paperclip aria-hidden />
      {children}
    </span>
  );
}

interface Row {
  status: Status;
  title: string;
  meta: string;
  /** Right column: an attachment, an amount or a badge (the status badge by default). */
  right?: ReactNode;
}

function Rows({ rows }: { rows: Row[] }) {
  return (
    <ul className="ui-rows">
      {rows.map((r) => (
        <li key={r.title}>
          <StatusGlyph status={r.status} />
          <span className="min-w-0">
            <span className="ui-row-title block">{r.title}</span>
            <span className="ui-row-meta block">{r.meta}</span>
          </span>
          {r.right ?? <Badge status={r.status} />}
        </li>
      ))}
    </ul>
  );
}

function Panel({ title, sub, aside, foot, children, className }: { title: string; sub: string; aside?: ReactNode; foot?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div data-ui className={className}>
      <div className="ui-head">
        <div className="min-w-0">
          <p className="ui-title">{title}</p>
          <p className="ui-sub">{sub}</p>
        </div>
        {aside}
      </div>
      {children}
      {foot ? <div className="ui-foot">{foot}</div> : null}
    </div>
  );
}

const CLIENT = 'Sua Empresa Ltda.';

const PREVIEWS: Record<ServiceId, { title: string; sub: string; rows: Row[]; foot: ReactNode }> = {
  contabil: {
    title: 'Contabilidade',
    sub: `${CLIENT} · outubro de 2026`,
    rows: [
      { status: 'done', title: 'Conferência de extratos de setembro', meta: 'concluída em 08/10' },
      { status: 'doing', title: 'Balancete de setembro', meta: 'vence 26/10 · departamento contábil' },
      { status: 'open', title: 'Balanço e DRE de 2026', meta: 'fechamento anual · ECD em junho' },
    ],
    foot: (
      <>
        <span>1 concluída · 1 em andamento</span>
        <span>3 tarefas</span>
      </>
    ),
  },
  fiscal: {
    title: 'Fiscal',
    sub: `${CLIENT} · outubro de 2026`,
    rows: [
      { status: 'done', title: 'DCTFWeb', meta: 'vence 15/10 · transmitida em 14/10', right: <Attach>recibo.pdf</Attach> },
      { status: 'done', title: 'DAS do Simples Nacional', meta: 'vence 20/10 · R$ 1.248,31', right: <Attach>guia.pdf</Attach> },
      { status: 'done', title: 'INSS da DCTFWeb', meta: 'vence 20/10 · R$ 612,40', right: <Attach>darf.pdf</Attach> },
    ],
    foot: (
      <>
        <span>3 de 3 concluídas</span>
        <span>guias anexadas</span>
      </>
    ),
  },
  folha: {
    title: 'Departamento pessoal',
    sub: `${CLIENT} · outubro de 2026`,
    rows: [
      { status: 'done', title: 'Folha de setembro', meta: 'até o 5º dia útil', right: <Attach>3 holerites</Attach> },
      { status: 'done', title: 'eSocial: eventos do mês', meta: 'vence 15/10' },
      { status: 'doing', title: 'FGTS Digital', meta: 'vence 20/10' },
      { status: 'wait', title: 'Admissão de auxiliar de cozinha', meta: 'documentos do funcionário' },
    ],
    foot: (
      <>
        <span>2 concluídas · 1 aguardando você</span>
        <span>4 tarefas</span>
      </>
    ),
  },
  abertura: {
    title: 'Abertura de empresa',
    sub: 'Processo · Sua Nova Empresa Ltda.',
    rows: [
      { status: 'done', title: 'Consulta de viabilidade', meta: 'prefeitura · aprovada' },
      { status: 'done', title: 'Registro na Junta Comercial', meta: 'contrato social registrado' },
      { status: 'done', title: 'CNPJ', meta: 'inscrição ativa' },
      { status: 'doing', title: 'Inscrição municipal', meta: 'em análise na prefeitura' },
      { status: 'open', title: 'Alvará de funcionamento', meta: 'depois da inscrição' },
    ],
    foot: (
      <>
        <span>3 de 5 etapas</span>
        <span>próxima: inscrição municipal</span>
      </>
    ),
  },
  planejamento: {
    title: 'Planejamento tributário',
    sub: `${CLIENT} · ano de 2027`,
    rows: [
      { status: 'doing', title: 'Simulação: Simples × Presumido', meta: 'faturamento previsto para 2027' },
      { status: 'done', title: 'Pró-labore e distribuição de lucros', meta: 'revisado em setembro' },
      { status: 'open', title: 'Opção pelo Simples Nacional', meta: 'até 29/01/2027' },
    ],
    foot: (
      <>
        <span>A opção vale para o ano inteiro</span>
        <span>3 tarefas</span>
      </>
    ),
  },
  financeiro: {
    title: 'Contas a pagar',
    sub: `${CLIENT} · semana de 19/10`,
    rows: [
      { status: 'done', title: 'Aluguel do ponto', meta: 'pago em 19/10', right: <span className="ui-num">R$ 4.800,00</span> },
      { status: 'done', title: 'DAS do Simples Nacional', meta: 'pago em 20/10', right: <span className="ui-num">R$ 1.248,31</span> },
      { status: 'doing', title: 'Fornecedor de embalagens', meta: 'vence 21/10 · agendado', right: <span className="ui-num">R$ 1.932,40</span> },
      { status: 'open', title: 'Energia elétrica', meta: 'vence 22/10', right: <span className="ui-num">R$ 687,15</span> },
    ],
    foot: (
      <>
        <span>2 pagas · 1 agendada</span>
        <span className="ui-num">Semana: R$ 8.667,86</span>
      </>
    ),
  },
  certidoes: {
    title: 'Certidões',
    sub: `${CLIENT} · validade de cada uma`,
    rows: [
      { status: 'done', title: 'CND federal', meta: 'válida até 06/04/2027', right: <Badge status="done">Válida</Badge> },
      { status: 'wait', title: 'CRF do FGTS', meta: 'válida até 11/11/2026', right: <Badge status="wait">Renovar</Badge> },
      { status: 'done', title: 'Certidão estadual', meta: 'válida até 18/01/2027', right: <Badge status="done">Válida</Badge> },
      { status: 'done', title: 'Certidão municipal', meta: 'válida até 02/02/2027', right: <Badge status="done">Válida</Badge> },
    ],
    foot: (
      <>
        <span>3 válidas · 1 para renovar</span>
        <span>4 certidões</span>
      </>
    ),
  },
};

/** What a service looks like in the portal: its tasks of the month. */
export function ServicePreview({ id }: { id: ServiceId }) {
  const p = PREVIEWS[id];
  return (
    <Panel title={p.title} sub={p.sub} foot={p.foot}>
      <Rows rows={p.rows} />
    </Panel>
  );
}

/** The client's start screen in the portal. */
export function PortalHome() {
  return (
    <Panel
      title={CLIENT}
      sub="Simples Nacional · obrigações de outubro de 2026"
      aside={
        <span className="ui-cal__nav" aria-hidden>
          <span className="ui-btn ui-btn--outline">
            <ChevronLeft size={14} />
          </span>
          <span className="ui-btn ui-btn--outline">outubro</span>
          <span className="ui-btn ui-btn--outline">
            <ChevronRight size={14} />
          </span>
        </span>
      }
      foot={
        <>
          <span>5 de 7 concluídas · 1 em andamento · 1 aguardando você</span>
          <span>9 documentos</span>
        </>
      }
    >
      <div className="ui-callout">
        <span className="min-w-0">
          <Badge status="wait" />
          <span className="ui-row-title mt-1 block">Extratos bancários de setembro</span>
          <span className="ui-row-meta block">pedidos em 06/10 · para o balancete</span>
        </span>
        <span className="ui-btn">Enviar arquivo</span>
      </div>
      <Rows
        rows={[
          { status: 'done', title: 'Folha de setembro', meta: 'até o 5º dia útil', right: <Attach>3 holerites</Attach> },
          { status: 'done', title: 'eSocial: eventos do mês', meta: 'vence 15/10', right: <Attach>recibo</Attach> },
          { status: 'done', title: 'DCTFWeb', meta: 'vence 15/10', right: <Attach>recibo</Attach> },
          { status: 'done', title: 'DAS do Simples Nacional', meta: 'vence 20/10 · R$ 1.248,31', right: <Attach>guia</Attach> },
          { status: 'done', title: 'FGTS Digital', meta: 'vence 20/10', right: <Attach>guia</Attach> },
          { status: 'doing', title: 'Balancete de setembro', meta: 'vence 26/10' },
        ]}
      />
    </Panel>
  );
}

function ContractShot() {
  return (
    <Panel title="Contrato de prestação de serviços contábeis" sub={`${CLIENT} · proposta aceita`} foot={<><span>Vigência anual</span><span className="ui-btn ui-btn--outline">Baixar PDF</span></>}>
      <ul className="ui-rows">
        {[
          ['Serviços', 'contabilidade, fiscal e departamento pessoal'],
          ['Honorários', 'mensais, conforme a proposta'],
          ['Vencimento', 'todo dia 10'],
          ['Vigência', '12 meses, renovada a cada ano'],
        ].map(([k, v]) => (
          <li key={k} style={{ gridTemplateColumns: '96px minmax(0,1fr)' }}>
            <span className="ui-row-meta">{k}</span>
            <span className="ui-row-title">{v}</span>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

function TransitionShot() {
  return (
    <Panel title="Transição do escritório anterior" sub={`${CLIENT} · a partir da competência 11/2026`} foot={<><span>2 de 5 itens recebidos</span><span>1 aguardando você</span></>}>
      <Rows
        rows={[
          { status: 'done', title: 'Livros diário e razão', meta: 'recebidos do contador anterior' },
          { status: 'done', title: 'Declarações entregues', meta: 'últimos cinco anos' },
          { status: 'doing', title: 'Procuração no e-CAC', meta: 'em andamento' },
          { status: 'wait', title: 'Acesso à prefeitura', meta: 'senha da nota fiscal' },
          { status: 'open', title: 'Folha e eSocial', meta: 'último mês fechado' },
        ]}
      />
    </Panel>
  );
}

function InviteShot() {
  return (
    <div data-ui>
      <div className="ui-head" style={{ display: 'block' }}>
        <p className="ui-title" style={{ fontSize: 20 }}>
          Convite para {CLIENT}
        </p>
        <p className="ui-sub" style={{ marginTop: 4 }}>
          Efficio Contabilidade convidou você para participar deste espaço no Efficio.
        </p>
      </div>
      <ul className="ui-rows">
        <li style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
          <span className="ui-row-title">{CLIENT}</span>
          <span className="ui-row-meta">Empresarial · acompanhe as obrigações, os documentos e as pendências</span>
        </li>
        <li style={{ gridTemplateColumns: 'minmax(0,1fr)' }}>
          <span className="ui-row-meta">Entre ou crie uma conta com voce@suaempresa.com.br para aceitar.</span>
        </li>
      </ul>
      <div className="ui-foot" style={{ justifyContent: 'flex-start', background: 'var(--site-ui-surface)' }}>
        <span className="ui-btn">Entrar</span>
        <span className="ui-btn ui-btn--outline">Criar conta</span>
      </div>
    </div>
  );
}

function RoutineShot() {
  return (
    <Panel title="Novembro" sub={`${CLIENT} · o mês do escritório`} foot={<><span>2 de 4 concluídas</span><span>atualizado agora</span></>}>
      <Rows
        rows={[
          { status: 'done', title: 'Folha e holerites', meta: 'até o 5º dia útil' },
          { status: 'done', title: 'DCTFWeb e eSocial', meta: 'dia 15' },
          { status: 'doing', title: 'DAS, INSS e FGTS Digital', meta: 'dia 20' },
          { status: 'open', title: 'Balancete de outubro', meta: 'dia 25' },
        ]}
      />
    </Panel>
  );
}

/** The picture of each stage of "Como começar" (the first one, the conversation, is a list in words). */
export function StepShot({ id }: { id: Exclude<StepId, 'conversa'> }) {
  if (id === 'proposta') return <ContractShot />;
  if (id === 'transicao') return <TransitionShot />;
  if (id === 'portal') return <InviteShot />;
  return <RoutineShot />;
}

type DocShape = 'portrait' | 'square' | 'wide';

interface Doc {
  shape: DocShape;
  kind: string;
  title: string;
  rows: [string, string][];
  foot: string;
}

/** The papers of a client's month, at thumbnail size (real labels, sample values). */
export const DOCUMENTS: Doc[] = [
  { shape: 'portrait', kind: 'Guia', title: 'DAS do Simples Nacional', rows: [['Apuração', '09/2026'], ['Vencimento', '20/10/2026']], foot: 'R$ 1.248,31' },
  { shape: 'square', kind: 'Holerite', title: 'Recibo de pagamento de salário', rows: [['Competência', '09/2026'], ['Salário', '2.400,00']], foot: 'Líquido R$ 2.104,52' },
  { shape: 'wide', kind: 'Contábil', title: 'Balancete de verificação · setembro/2026', rows: [['Ativo', '184.320,15'], ['Passivo', '61.904,80'], ['Patrimônio líquido', '122.415,35']], foot: 'Sua Empresa Ltda.' },
  { shape: 'portrait', kind: 'Certidão', title: 'CND dos tributos federais', rows: [['Emitida', '08/10/2026']], foot: 'Válida até 06/04/2027' },
  { shape: 'square', kind: 'Societário', title: 'Contrato social · 3ª alteração', rows: [['Sócios', '2'], ['Capital', '50.000,00']], foot: 'Registrado na Junta' },
  { shape: 'wide', kind: 'Recibo', title: 'Recibo de entrega da DCTFWeb', rows: [['Período', '09/2026'], ['Transmitida em', '14/10/2026']], foot: 'Situação: ativa' },
  { shape: 'portrait', kind: 'Guia', title: 'FGTS Digital', rows: [['Competência', '09/2026'], ['Vencimento', '20/10/2026']], foot: 'R$ 576,00' },
  { shape: 'square', kind: 'Cadastro', title: 'Comprovante de inscrição no CNPJ', rows: [['Porte', 'ME'], ['Situação', 'ativa']], foot: 'Sua Empresa Ltda.' },
  { shape: 'wide', kind: 'Nota fiscal', title: 'NFS-e nº 000214', rows: [['Emissão', '03/10/2026'], ['Serviços', '3.800,00']], foot: 'ISS retido: não' },
  { shape: 'portrait', kind: 'Certidão', title: 'Certificado de Regularidade do FGTS', rows: [['Desde', '13/10/2026']], foot: 'Até 11/11/2026' },
  { shape: 'square', kind: 'Licença', title: 'Alvará de funcionamento', rows: [['Exercício', '2026']], foot: 'Prefeitura municipal' },
  { shape: 'wide', kind: 'Contábil', title: 'Demonstração do resultado · 2025', rows: [['Receita líquida', '1.204.800,00'], ['Lucro líquido', '96.384,00']], foot: 'Exercício encerrado' },
];

export function DocThumb({ doc }: { doc: Doc }) {
  return (
    <div data-ui className={`ui-doc ui-doc--${doc.shape}`}>
      <span className="ui-doc__kind">{doc.kind}</span>
      <span className="ui-doc__title">{doc.title}</span>
      {doc.rows.map(([k, v]) => (
        <span key={k} className="ui-doc__row">
          <span>{k}</span>
          <span>{v}</span>
        </span>
      ))}
      <span className="ui-doc__foot">{doc.foot}</span>
    </div>
  );
}
