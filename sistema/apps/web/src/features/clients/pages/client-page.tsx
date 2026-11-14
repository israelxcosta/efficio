import { useState, type ReactNode } from 'react';
import { Link, useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import {
  ArrowLeft,
  Building2,
  ChartColumn,
  ClipboardCheck,
  Copy,
  Ellipsis,
  FileClock,
  FileSignature,
  HandCoins,
  IdCard,
  KeyRound,
  ListChecks,
  Lock,
  Pencil,
  Plus,
  ReceiptText,
  UserCheck,
  UserX,
  Wallet,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  OCCURRENCE_STATUS_LABELS,
  TAX_REGIME_LABELS,
  formatBRL,
  formatBps,
  formatCNPJ,
  formatDateBR,
  todayISO,
  type Client,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, Money } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { useGenerateContract } from '@/features/office/components/contract-requirements-dialog';
import { useTasks } from '@/features/tasks/api';
import { useOccurrenceSheetLinks } from '@/features/tasks/components/occurrence-row';
import { TaskRow } from '@/features/tasks/components/task-row';
import { DUE_TONE_CLASS } from '@/features/tasks/due';
import { competenceName, groupDeadlineInfo, occurrenceTitle } from '@/features/tasks/occurrence';
import { useTaskSheetLinks } from '@/features/tasks/task-links';
import { tasksHref } from '@/features/tasks/url-state';
import { useTransactions } from '@/features/transactions/api';
import { ApiRequestError } from '@/lib/api';
import { copyText } from '@/lib/clipboard';
import { toastError } from '@/lib/notify';
import { isUuid } from '@/lib/safe-url';
import { cn, initials, pluralize } from '@/lib/utils';
import { useClient, useReactivateClient } from '../api';
import { ClientDocumentsSheet } from '../client-documents-sheet';
import {
  CLIENT_SECTION_LABELS,
  clientListPath,
  clientPageActions,
  clientPageArea,
  clientSections,
  sectionFromParam,
  type ClientSection,
} from '../client-page-logic';
import { ClientProfile, ProfileItem } from '../client-profile';
import { ClientAccesses, ClientDocumentsList, ClientUnionsList, RegistrationItems } from '../client-records';
import { ClientSheet } from '../client-sheet';
import { FeesDialog } from '../fees-dialog';
import { InactivateDialog } from '../inactivate-dialog';

const SECTION_ICONS: Record<ClientSection, ReactNode> = {
  dados: <IdCard />,
  documentos: <FileClock />,
  acessos: <KeyRound />,
  tarefas: <ListChecks />,
  financeiro: <Wallet />,
};

/**
 * The client page (UX 2.3): one record of the client at `/tarefas/clientes/:id` (Gestão) and
 * `/clientes/:id` (Financeiro), each in its shell. Sections and actions follow the permissions
 * (`client-page-logic.ts`); without `finance` the API sends no financial field.
 */
export default function ClientPage() {
  const { id } = useParams();
  const { pathname } = useLocation();
  const area = clientPageArea(pathname);
  const validId = isUuid(id) ? id : null;
  const client = useClient(validId);
  const listPath = clientListPath(area);

  const back = (
    <Button variant="ghost" size="sm" asChild className="-ml-2 self-start">
      <Link to={listPath}>
        <ArrowLeft /> Clientes
      </Link>
    </Button>
  );

  const status = client.error instanceof ApiRequestError ? client.error.status : null;
  if (!validId || status === 404 || status === 400) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <EmptyState
          icon={<Building2 />}
          title="Cliente não encontrado"
          description="O endereço está incompleto ou o cliente foi excluído."
          action={
            <Button variant="outline" asChild>
              <Link to={listPath}>Ver a lista de clientes</Link>
            </Button>
          }
        />
      </div>
    );
  }
  if (status === 403) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <EmptyState icon={<Lock />} title="Sem permissão" description="Você não tem permissão para ver este cliente. Fale com o proprietário do espaço." />
      </div>
    );
  }
  if (client.isError && !client.data) {
    return (
      <div className="flex flex-col gap-5">
        {back}
        <ErrorState error={client.error} onRetry={() => client.refetch()} />
      </div>
    );
  }
  if (!client.data) {
    return (
      <div className="flex flex-col gap-5" aria-busy="true" aria-label="Carregando o cliente">
        {back}
        <div className="flex items-center gap-3">
          <Skeleton className="size-11 rounded-full" />
          <div className="flex flex-col gap-2">
            <Skeleton className="h-6 w-56" />
            <Skeleton className="h-4 w-40" />
          </div>
        </div>
        <Skeleton className="h-10 w-full max-w-xl" />
        <Card className="p-5">
          <SkeletonRows rows={6} />
        </Card>
      </div>
    );
  }
  return <ClientRecord client={client.data} back={back} />;
}

function ClientRecord({ client: c, back }: { client: Client; back: ReactNode }) {
  const { can } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const sections = clientSections(can);
  const section = sectionFromParam(params.get('aba'), sections);
  const actions = clientPageActions(can, c);
  const [editing, setEditing] = useState(false);
  const [editingDocs, setEditingDocs] = useState(false);
  const [feesOpen, setFeesOpen] = useState(false);
  const [inactivating, setInactivating] = useState(false);
  const [reactivating, setReactivating] = useState(false);
  const reactivate = useReactivateClient();
  const contract = useGenerateContract({ onEdit: () => setEditing(true), onFees: () => setFeesOpen(true) });
  const display = c.tradeName || c.name;
  const fullEdit = actions.editData === 'full';

  return (
    <div className="flex flex-col gap-5">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 items-start gap-3">
          <span className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-soft-fg" aria-hidden>
            {initials(display)}
          </span>
          <div className="min-w-0">
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight break-words text-fg">{display}</h1>
            {c.tradeName ? <p className="mt-0.5 text-sm break-words text-muted">{c.name}</p> : null}
            <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1.5">
              <Badge tone={c.status === 'active' ? 'success' : 'neutral'} size="md">
                {c.status === 'active' ? 'Ativo' : c.inactivation ? `Inativo desde ${formatDateBR(c.inactivation.date)}` : 'Inativo'}
              </Badge>
              <Badge tone="brand" size="md">
                {TAX_REGIME_LABELS[c.taxRegime]}
                {c.simplesAnnex ? ` · Anexo ${c.simplesAnnex}` : ''}
              </Badge>
              <span className="flex items-center text-sm text-muted">
                CNPJ <span className="tabular ml-1 text-fg">{formatCNPJ(c.document)}</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="ml-0.5"
                  aria-label="Copiar CNPJ"
                  onClick={async () => {
                    if (await copyText(formatCNPJ(c.document))) toast.success('CNPJ copiado.');
                    else toast.error('Não foi possível copiar.');
                  }}
                >
                  <Copy />
                </Button>
              </span>
            </div>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions.finance ? (
            <>
              <Button variant="outline" asChild className="max-sm:hidden">
                <Link to={`/relatorios/cliente/${c.id}`}>
                  <ChartColumn /> Relatório financeiro
                </Link>
              </Button>
              <Button variant="outline" className="max-sm:hidden" onClick={() => void contract.start(c)}>
                <FileSignature /> Contrato
              </Button>
            </>
          ) : null}
          {actions.editData ? (
            <WriteGate scope={fullEdit ? 'finance' : 'tasks'} permission={fullEdit ? undefined : 'clients'}>
              <Button onClick={() => setEditing(true)}>
                <Pencil /> Editar dados
              </Button>
            </WriteGate>
          ) : null}
          {actions.finance ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Mais ações do cliente">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem icon={<ChartColumn />} className="sm:hidden" onSelect={() => navigate(`/relatorios/cliente/${c.id}`)}>
                  Relatório financeiro
                </DropdownMenuItem>
                <DropdownMenuItem icon={<FileSignature />} className="sm:hidden" onSelect={() => void contract.start(c)}>
                  Contrato
                </DropdownMenuItem>
                <DropdownMenuItem icon={<HandCoins />} onSelect={() => setFeesOpen(true)}>
                  Honorários e vigências
                </DropdownMenuItem>
                <DropdownMenuItem icon={<ReceiptText />} onSelect={() => navigate(`/contas-a-receber?contato=${c.id}&modo=year`)}>
                  Contas a receber
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                {actions.inactivate ? (
                  <DropdownMenuItem icon={<UserX />} tone="danger" onSelect={() => setInactivating(true)}>
                    Inativar cliente
                  </DropdownMenuItem>
                ) : null}
                {actions.reactivate ? (
                  <DropdownMenuItem icon={<UserCheck />} onSelect={() => setReactivating(true)}>
                    Reativar cliente
                  </DropdownMenuItem>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
      </header>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <SegmentedControl<ClientSection>
          variant="solid"
          ariaLabel="Seções do cliente"
          value={section}
          onChange={(s) => setParams(s === 'dados' ? {} : { aba: s }, { replace: true })}
          options={sections.map((s) => ({ value: s, label: CLIENT_SECTION_LABELS[s], icon: SECTION_ICONS[s] }))}
        />
      </div>

      <section aria-label={CLIENT_SECTION_LABELS[section]} className="flex flex-col gap-5">
        {section === 'dados' ? (
          <>
            <Card className="p-5 sm:p-6">
              <ClientProfile
                client={c}
                showNotes={false}
                contractExtra={
                  <>
                    <RegistrationItems client={c} />
                    {actions.finance && c.feeDueDay ? (
                      <ProfileItem label="Vencimento do honorário">Dia {c.feeDueDay} do mês seguinte à competência</ProfileItem>
                    ) : null}
                  </>
                }
              />
            </Card>
            <Card className="p-5 sm:p-6">
              <ClientUnionsList client={c} />
            </Card>
          </>
        ) : section === 'documentos' ? (
          <Card className="p-5 sm:p-6">
            <ClientDocumentsList
              client={c}
              today={todayISO()}
              onAdd={actions.editDocuments ? () => setEditingDocs(true) : undefined}
              action={
                actions.editDocuments ? (
                  <WriteGate scope="tasks" permission="clients">
                    <Button variant="outline" size="sm" onClick={() => setEditingDocs(true)}>
                      <Pencil /> Editar documentos
                    </Button>
                  </WriteGate>
                ) : undefined
              }
            />
          </Card>
        ) : section === 'acessos' ? (
          <Card className="p-5 sm:p-6">
            <ClientAccesses
              client={c}
              footer={
                <p className="text-caption text-muted">
                  {fullEdit ? 'Para cadastrar ou trocar um acesso, use "Editar dados".' : 'Cadastrar ou trocar um acesso fica com quem tem o financeiro.'}
                </p>
              }
            />
          </Card>
        ) : section === 'tarefas' ? (
          <TasksSection client={c} />
        ) : (
          <FinanceSection client={c} onFees={() => setFeesOpen(true)} onContract={() => void contract.start(c)} />
        )}
      </section>

      {actions.editData ? <ClientSheet open={editing} onOpenChange={setEditing} client={c} mode={actions.editData} /> : null}
      {actions.editDocuments ? <ClientDocumentsSheet client={c} open={editingDocs} onOpenChange={setEditingDocs} /> : null}
      {actions.finance ? (
        <>
          {contract.dialog}
          <FeesDialog client={feesOpen ? c : null} onClose={() => setFeesOpen(false)} />
          <InactivateDialog client={inactivating ? c : null} onClose={() => setInactivating(false)} />
          <ConfirmDialog
            open={reactivating}
            onOpenChange={setReactivating}
            title="Reativar cliente?"
            description={`"${display}" volta para a lista de clientes ativos.`}
            confirmLabel="Reativar"
            tone="primary"
            loading={reactivate.isPending}
            onConfirm={async () => {
              try {
                await reactivate.mutateAsync(c.id);
                toast.success('Cliente reativado');
                setReactivating(false);
              } catch (error) {
                toastError(error);
              }
            }}
          />
        </>
      ) : null}
    </div>
  );
}

/** Open and overdue tasks of the client, the month's obligations and the audit. */
function TasksSection({ client: c }: { client: Client }) {
  const { canWriteTasks } = usePermissions();
  const { newTask } = useTaskSheetLinks();
  const { openOccurrence } = useOccurrenceSheetLinks();
  const open = useTasks({ scope: 'all', clientId: c.id, situation: 'open', page: 1, pageSize: 8, occurrences: 'false' });
  const month = todayISO().slice(0, 7);
  const monthly = useTasks({ scope: 'all', clientId: c.id, month, page: 1, pageSize: 1 });
  const summary = open.data?.summary;
  const today = open.data?.today ?? todayISO();
  const name = c.tradeName || c.name;
  const occurrences = monthly.data?.occurrences ?? [];

  return (
    <>
      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <CardHeader
          title="Tarefas em aberto"
          subtitle={
            summary ? (
              <>
                {pluralize(summary.open, 'em aberto', 'em aberto')}
                {summary.overdue ? (
                  <>
                    {' · '}
                    <span className="font-semibold text-danger">{pluralize(summary.overdue, 'atrasada', 'atrasadas')}</span>
                  </>
                ) : null}
              </>
            ) : undefined
          }
          action={
            canWriteTasks && c.status === 'active' ? (
              <Button variant="outline" size="sm" onClick={() => newTask({ clientId: c.id })}>
                <Plus /> Nova tarefa
              </Button>
            ) : undefined
          }
        />
        {open.isPending ? (
          <SkeletonRows rows={3} />
        ) : open.isError ? (
          <ErrorState error={open.error} onRetry={() => open.refetch()} />
        ) : open.data.items.length ? (
          <div className="@container -mx-2">
            {open.data.items.map((t) => (
              <TaskRow key={t.id} task={t} today={today} density="compact" />
            ))}
          </div>
        ) : (
          <p className="text-body-sm text-subtle">Nenhuma tarefa em aberto.</p>
        )}
        <p className="flex flex-wrap gap-x-4 gap-y-1 text-caption font-medium">
          <Link to={tasksHref({ scope: 'all', client: c.id })} className="text-brand-text hover:underline">
            Ver todas as tarefas do cliente
          </Link>
          {summary?.overdue ? (
            <Link to={tasksHref({ scope: 'all', client: c.id, situation: 'overdue' })} className="text-brand-text hover:underline">
              Ver as atrasadas
            </Link>
          ) : null}
        </p>
      </Card>

      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <CardHeader
          title={`Obrigações de ${competenceName(month).split(' ')[0]}`}
          subtitle="Recorrentes deste cliente com prazo no mês"
          action={
            <Button variant="ghost" size="sm" asChild>
              <Link to={`/tarefas/auditoria?busca=${encodeURIComponent(name)}`}>
                <ClipboardCheck /> Ver na auditoria
              </Link>
            </Button>
          }
        />
        {monthly.isPending ? (
          <SkeletonRows rows={3} />
        ) : monthly.isError ? (
          <ErrorState error={monthly.error} onRetry={() => monthly.refetch()} />
        ) : occurrences.length === 0 ? (
          <p className="text-body-sm text-subtle">Nenhuma obrigação com prazo neste mês.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {occurrences.map((o) => {
              const due = groupDeadlineInfo(o, today);
              const done = o.status === 'done';
              return (
                <li key={`${o.recurringTaskId}-${o.periodKey}`}>
                  <button
                    type="button"
                    onClick={() => openOccurrence(o)}
                    className="flex min-h-11 w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left hover:bg-surface-muted"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm text-fg">{occurrenceTitle(o, today)}</span>
                      <span className="block truncate text-xs text-muted">
                        {o.department?.name ? `${o.department.name} · ` : ''}prazo legal {formatDateBR(o.legalDueDate)}
                      </span>
                    </span>
                    <span className={cn('shrink-0 text-right text-xs', done ? 'font-medium text-success' : DUE_TONE_CLASS[due.tone])}>
                      {done ? OCCURRENCE_STATUS_LABELS.done : due.text}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </Card>
    </>
  );
}

/** Fees, open receivables, report and contract (`finance` only). */
function FinanceSection({ client: c, onFees, onContract }: { client: Client; onFees: () => void; onContract: () => void }) {
  const receivables = useTransactions({ type: 'income', contactId: c.id, status: 'pending', sort: 'date_asc', page: 1, pageSize: 8 });
  const fee = c.currentFee;
  const rs = receivables.data;

  return (
    <div className="grid gap-5 lg:grid-cols-2 lg:items-start">
      <Card className="flex flex-col gap-4 p-5 sm:p-6">
        <CardHeader
          title="Honorários"
          action={
            <Button variant="outline" size="sm" onClick={onFees}>
              <HandCoins /> Vigências
            </Button>
          }
        />
        <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2 xl:grid-cols-3">
          <ProfileItem label="Honorário vigente" wide>
            {fee ? (
              <span>
                <span className="tabular font-semibold">{formatBRL(fee.amount)}</span>/mês · <span className="tabular">{formatBRL(fee.employeeFee)}</span> por empregado
                {fee.discountBps > 0 ? (
                  <span className="block text-xs text-muted">{formatBps(fee.discountBps)} de desconto para pagamento até o vencimento</span>
                ) : null}
                <span className="block text-xs text-muted">
                  vigência de {formatDateBR(fee.startDate)} a {formatDateBR(fee.endDate)}
                </span>
              </span>
            ) : c.latestFee ? (
              <span className="text-warning">Vigência encerrada em {formatDateBR(c.latestFee.endDate)}: reajuste pendente</span>
            ) : c.status === 'active' ? (
              <span className="text-warning">Sem honorário cadastrado</span>
            ) : null}
          </ProfileItem>
          <ProfileItem label="Vencimento">{c.feeDueDay ? `Dia ${c.feeDueDay} do mês seguinte` : null}</ProfileItem>
          <ProfileItem label="Cliente desde">{formatDateBR(c.contractStartDate)}</ProfileItem>
        </dl>
        <div className="flex flex-wrap gap-2 border-t border-border pt-4">
          <Button variant="outline" size="sm" asChild>
            <Link to={`/relatorios/cliente/${c.id}`}>
              <ChartColumn /> Relatório financeiro
            </Link>
          </Button>
          <Button variant="outline" size="sm" onClick={onContract}>
            <FileSignature /> Contrato
          </Button>
        </div>
        {c.notes ? (
          <div className="border-t border-border pt-4">
            <p className="text-xs font-medium text-muted">Observações</p>
            <p className="mt-0.5 text-sm whitespace-pre-line text-fg">{c.notes}</p>
          </div>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3 p-5 sm:p-6">
        <CardHeader
          title="Contas a receber em aberto"
          subtitle={
            rs ? (
              rs.total ? (
                <>
                  {pluralize(rs.total, 'em aberto', 'em aberto')} · <span className="tabular">{formatBRL(rs.summary.pending)}</span>
                  {rs.summary.overdueCount ? (
                    <>
                      {' · '}
                      <span className="font-semibold text-danger">
                        {pluralize(rs.summary.overdueCount, 'vencida', 'vencidas')} (<span className="tabular">{formatBRL(rs.summary.overdue)}</span>)
                      </span>
                    </>
                  ) : null}
                </>
              ) : (
                'Nada em aberto'
              )
            ) : undefined
          }
        />
        {receivables.isPending ? (
          <SkeletonRows rows={3} />
        ) : receivables.isError ? (
          <ErrorState error={receivables.error} onRetry={() => receivables.refetch()} />
        ) : rs!.items.length === 0 ? (
          <p className="text-body-sm text-subtle">Nenhuma conta a receber em aberto.</p>
        ) : (
          <ul className="-mx-2 flex flex-col">
            {rs!.items.map((t) => (
              <li key={t.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 py-1.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-fg">{t.description}</span>
                  <span className={cn('tabular block text-xs', t.overdue ? 'font-semibold text-danger' : 'text-muted')}>
                    {t.overdue ? 'Venceu em ' : 'Vence em '}
                    {formatDateBR(t.date)}
                  </span>
                </span>
                <Money value={t.amount} className="text-sm" />
              </li>
            ))}
          </ul>
        )}
        <Link to={`/contas-a-receber?contato=${c.id}&modo=year`} className="text-caption font-medium text-brand-text hover:underline">
          Ver em Contas a receber
        </Link>
      </Card>
    </div>
  );
}
