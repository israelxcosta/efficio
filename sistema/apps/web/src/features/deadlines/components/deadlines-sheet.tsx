import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { CircleCheck, Ellipsis, Eye, FileClock, ListPlus, Pencil, Scale, CheckCheck, Building2 } from 'lucide-react';
import { CLIENT_DOCUMENT_KIND_LABELS, formatDateBR, todayISO, type ConventionDeadline, type DocumentDeadline } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions } from '@/features/auth/permissions';
import { NeutralIcon } from '@/features/tasks/components/neutral-icon';
import { TaskGroup } from '@/features/tasks/components/task-group';
import { useTaskSheetLinks } from '@/features/tasks/task-links';
import { usePublishAction } from '@/features/unions/use-publish';
import { cn, pluralize } from '@/lib/utils';
import { useDeadlines } from '../api';
import {
  DEADLINE_GROUP_LABELS,
  DEADLINE_KIND_PARAM,
  deadlineClass,
  deadlineKindFromParam,
  deadlineLabel,
  documentIcon,
  groupByDeadline,
  renewalDueDate,
  renewalTitle,
  urgentCount,
  type DeadlineGroupKey,
  type DeadlineKind,
} from '../deadline-logic';

export const DEADLINES_PARAM = 'vencimentos';

/** Opens the sheet over the current page (`?vencimentos=documentos|convencoes`). */
export function useOpenDeadlines() {
  const [, setParams] = useSearchParams();
  return (kind: DeadlineKind = 'documents', group?: DeadlineGroupKey) => {
    if (group) pendingGroup.current = group;
    setParams((p) => {
      const next = new URLSearchParams(p);
      next.set(DEADLINES_PARAM, DEADLINE_KIND_PARAM[kind]);
      return next;
    });
  };
}

/** The group the strip asked for: the sheet scrolls to it once it renders. */
const pendingGroup: { current: DeadlineGroupKey | null } = { current: null };

/**
 * "Vencimentos" (spec §6.10): documents of the clients and collective agreements of the unions that
 * expired or expire in up to 60 days. Opened by the strip of the home page, the bell, ⌘K, the "Mais" of
 * the phone and `?vencimentos=`. Mounted once by the shell (both areas).
 */
export function DeadlinesSheet() {
  const [params, setParams] = useSearchParams();
  const kind = deadlineKindFromParam(params.get(DEADLINES_PARAM));
  const open = kind !== null;
  const query = useDeadlines(open);
  const data = query.data;

  function close() {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.delete(DEADLINES_PARAM);
        return next;
      },
      { replace: true },
    );
  }

  function setKind(k: DeadlineKind) {
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        next.set(DEADLINES_PARAM, DEADLINE_KIND_PARAM[k]);
        return next;
      },
      { replace: true },
    );
  }

  // Scroll to the group the strip pointed at.
  useEffect(() => {
    if (!open || !data || !pendingGroup.current) return;
    const id = `deadline-group-${kind}-${pendingGroup.current}`;
    pendingGroup.current = null;
    requestAnimationFrame(() => document.getElementById(id)?.scrollIntoView({ block: 'start' }));
  }, [open, data, kind]);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && close()}
      title="Vencimentos"
      description="Documentos dos clientes e convenções coletivas. Os administradores atualizam as datas no cadastro."
      headerExtra={
        <SegmentedControl
          size="sm"
          ariaLabel="Tipo de vencimento"
          value={kind ?? 'documents'}
          onChange={setKind}
          options={[
            { value: 'documents' as const, label: `Documentos${data ? ` (${urgentCount(data.documents.counts)})` : ''}` },
            { value: 'conventions' as const, label: `Convenções${data ? ` (${urgentCount(data.conventions.counts)})` : ''}` },
          ]}
        />
      }
    >
      <div>
        {query.isPending ? (
          <SkeletonRows rows={5} />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : kind === 'conventions' ? (
          <ConventionsBody data={data!} onNavigate={close} />
        ) : (
          <DocumentsBody data={data!} />
        )}
      </div>
    </Sheet>
  );
}

function NothingDue() {
  return (
    <EmptyState
      icon={<CircleCheck />}
      title="Nada vence nos próximos 60 dias."
      description="Documentos e convenções que vencerem aparecem aqui."
    />
  );
}

function DocumentsBody({ data }: { data: NonNullable<ReturnType<typeof useDeadlines>['data']> }) {
  const docs = data.documents;
  if (!docs.hasAny) {
    return (
      <EmptyState
        icon={<FileClock />}
        title="Nenhum documento cadastrado"
        description="Os administradores cadastram certificados, certidões e alvarás no cadastro do cliente, no financeiro."
      />
    );
  }
  const groups = groupByDeadline(docs.items, (d) => d.deadline.bucket);
  const dated = groups.filter((g) => g.key !== 'noDate');
  return (
    <div className="flex flex-col gap-1">
      {!dated.length ? <NothingDue /> : null}
      {groups.map((g) => (
        <div key={g.key} id={`deadline-group-documents-${g.key}`}>
          <TaskGroup
            id={`deadlines-documents-${g.key}`}
            title={DEADLINE_GROUP_LABELS[g.key]}
            count={g.key === 'noDate' ? docs.counts.noDate : g.items.length}
            tone={g.key === 'overdue' ? 'danger' : g.key === 'within30' ? 'warning' : undefined}
            defaultCollapsed={g.key === 'noDate'}
          >
            <ul className="flex flex-col">
              {g.items.map((d) => (
                <DocumentDeadlineRow key={d.id} doc={d} today={data.today} />
              ))}
            </ul>
          </TaskGroup>
        </div>
      ))}
      {docs.truncated ? <p className="px-3 pt-2 text-caption text-muted">Mostrando os mais urgentes. Os demais aparecem na ficha de cada cliente.</p> : null}
    </div>
  );
}

function ConventionsBody({ data, onNavigate }: { data: NonNullable<ReturnType<typeof useDeadlines>['data']>; onNavigate: () => void }) {
  const conv = data.conventions;
  const navigate = useNavigate();
  if (!conv.hasUnions) {
    return (
      <EmptyState
        icon={<Scale />}
        title="Nenhum sindicato cadastrado"
        description="Cadastre os sindicatos dos clientes para acompanhar a data-base das convenções coletivas."
        action={
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onNavigate();
              navigate('/tarefas/cadastros?aba=sindicatos');
            }}
          >
            Ir para Sindicatos
          </Button>
        }
      />
    );
  }
  const groups = groupByDeadline(conv.items, (c) => c.cycle.bucket);
  if (!groups.length) return <NothingDue />;
  return (
    <div className="flex flex-col gap-1">
      {groups.map((g) => (
        <div key={g.key} id={`deadline-group-conventions-${g.key}`}>
          <TaskGroup
            id={`deadlines-conventions-${g.key}`}
            title={DEADLINE_GROUP_LABELS[g.key]}
            count={g.items.length}
            tone={g.key === 'overdue' ? 'danger' : g.key === 'within30' ? 'warning' : undefined}
          >
            <ul className="flex flex-col">
              {g.items.map((c) => (
                <ConventionDeadlineRow key={c.unionId} item={c} />
              ))}
            </ul>
          </TaskGroup>
        </div>
      ))}
    </div>
  );
}

const menuButton =
  'flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100';

/** Right column of a deadline row: the date and "Venceu há 3 dias". */
export function DeadlineWhen({ date, deadline, tooltip }: { date: string | null; deadline: { bucket: DocumentDeadline['deadline']['bucket']; days: number | null }; tooltip?: string }) {
  const content = (
    <span className="flex shrink-0 flex-col items-end text-right">
      <span className="tabular text-[13px] font-medium text-fg">{date ? formatDateBR(date) : '—'}</span>
      <span className={cn('text-xs', deadlineClass(deadline))}>{deadlineLabel(deadline, 'Sem vencimento')}</span>
    </span>
  );
  return tooltip ? (
    <Tooltip content={tooltip}>
      <span tabIndex={-1}>{content}</span>
    </Tooltip>
  ) : (
    content
  );
}

/** A document of a client (spec §6.10, 52px). */
export function DocumentDeadlineRow({ doc, today }: { doc: DocumentDeadline; today: string }) {
  const navigate = useNavigate();
  const { can } = usePermissions();
  const { newTask } = useTaskSheetLinks();
  const subtitle = [doc.client.name, doc.note].filter(Boolean).join(' · ');
  const label = doc.kind === 'other' ? doc.name : CLIENT_DOCUMENT_KIND_LABELS[doc.kind].replace(/\s*\([^)]*\)$/, '');
  return (
    <li className="group flex min-h-[52px] items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-muted">
      <NeutralIcon icon={documentIcon(doc.kind)} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{label}</span>
        <span className="block truncate text-xs text-muted">{subtitle}</span>
      </span>
      <DeadlineWhen date={doc.expiresAt} deadline={doc.deadline} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={menuButton} aria-label={`Ações de ${label} de ${doc.client.name}`}>
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={<Building2 />} onSelect={() => navigate(`/tarefas/clientes?cliente=${doc.client.id}&secao=documentos`)}>
            Ver cliente
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<ListPlus />}
            onSelect={() =>
              newTask(
                { title: renewalTitle(doc.name), clientId: doc.client.id, dueDate: renewalDueDate(doc.expiresAt, today || todayISO()) },
                { drop: [DEADLINES_PARAM] },
              )
            }
          >
            Criar tarefa de renovação
          </DropdownMenuItem>
          {can('finance') ? (
            <DropdownMenuItem icon={<Pencil />} onSelect={() => navigate(`/clientes?editar=${doc.client.id}`)}>
              Editar no financeiro
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}

/** An agreement of a union (spec §6.10). */
function ConventionDeadlineRow({ item }: { item: ConventionDeadline }) {
  const navigate = useNavigate();
  const { can, subscriptionActive } = usePermissions();
  const { publish, pending } = usePublishAction();
  const title = [item.name, item.category].filter(Boolean).join(' · ');
  const unionHref = `/tarefas/cadastros?aba=sindicatos&sindicato=${item.unionId}`;
  return (
    <li className="group flex min-h-[52px] items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-muted">
      <NeutralIcon icon={Scale} size="sm" />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-semibold text-fg">{title}</span>
        <span className="block truncate text-xs text-muted">
          Convenção {item.cycle.label} · {pluralize(item.clientCount, 'cliente', 'clientes')}
        </span>
      </span>
      <DeadlineWhen date={item.cycle.dueDate} deadline={item.cycle} tooltip={`Convenção Coletiva ${item.cycle.label}`} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={menuButton} aria-label={`Ações da convenção de ${item.name}`}>
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={<Eye />} onSelect={() => navigate(unionHref)}>
            Ver sindicato
          </DropdownMenuItem>
          {can('registry') ? (
            <DropdownMenuItem icon={<CheckCheck />} disabled={pending || !subscriptionActive} onSelect={() => void publish({ id: item.unionId, name: item.name }, item.cycle)}>
              Marcar {item.cycle.label} como publicada
            </DropdownMenuItem>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
