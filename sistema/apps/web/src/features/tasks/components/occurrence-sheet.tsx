import { useEffect, useState } from 'react';
import { Link, useLocation, useSearchParams } from 'react-router';
import { Building2, Ellipsis, ExternalLink, Repeat, Search, UserRoundCheck, UserRoundPen } from 'lucide-react';
import { toast } from 'sonner';
import {
  dateInTimeZone,
  TAX_REGIME_LABELS,
  todayISO,
  type OccurrenceCell,
  type OccurrenceClient,
  type RecurringOccurrenceDetail,
  type TaskMember,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Modal } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions } from '@/features/auth/permissions';
import { ApiRequestError } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useRecurringOccurrence, useTaskOptions, useUpdateTask } from '../api';
import { cellTip, isPendingCell } from '../audit-logic';
import { DUE_TONE_CLASS, firstName, shortDate, shortName } from '../due';
import { assigneeSourceText, auditHref, competenceName, groupDeadlineInfo, isOccurrenceRef, occurrenceTitle, periodLabel, referenceLabel } from '../occurrence';
import { withSheetParams } from '../task-links';
import { useCellStatus } from '../use-cell-status';
import { OccurrenceCellControl, OccurrenceStatusGlyph } from './matrix-cell';
import { occurrenceViewFromParam, OCCURRENCE_SHEET_PARAMS, type OccurrenceView } from './occurrence-row';
import { MemberPicker, NONE } from './pickers';

/** Clients of the sheet for a view, the search and the responsible filter. */
export function occurrenceSheetCells(
  detail: Pick<RecurringOccurrenceDetail, 'cells'>,
  view: OccurrenceView,
  meId: string | undefined,
  search: string,
  assignee: string,
): (OccurrenceCell & { client: OccurrenceClient })[] {
  const q = search
    .trim()
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();
  const norm = (s: string) =>
    s
      .normalize('NFD')
      .replace(/\p{Diacritic}/gu, '')
      .toLowerCase();
  return detail.cells
    .filter((c) => (view === 'mine' ? c.assignee?.id === meId : view === 'pending' ? isPendingCell(c) : true))
    .filter((c) => !q || norm(c.client.name).includes(q) || norm(c.client.legalName).includes(q))
    .filter((c) => !assignee || (assignee === NONE ? !c.assignee : c.assignee?.id === assignee))
    .sort((a, b) => a.client.name.localeCompare(b.client.name, 'pt-BR'));
}

/** Mounted by the Gestão layout: `?recorrente=<id>&periodo=<key>` opens the sheet over any page. */
export function OccurrenceSheetHost() {
  const [params, setParams] = useSearchParams();
  const { pathname } = useLocation();
  const id = params.get('recorrente');
  const period = params.get('periodo');
  const open = Boolean(id && period);

  function close() {
    const next = new URLSearchParams(params);
    for (const k of OCCURRENCE_SHEET_PARAMS) {
      // On the audit page `recorrente` also opens a recurring task in "Por tarefa": keep it.
      if (k === 'recorrente' && pathname.startsWith('/tarefas/auditoria')) continue;
      next.delete(k);
    }
    setParams(next, { replace: true });
  }

  return (
    <RecurringOccurrenceSheet
      open={open}
      id={open ? id : null}
      period={open ? period : null}
      initialView={occurrenceViewFromParam(params.get('ocorrencias'))}
      onClose={close}
      onOpenTask={(taskId) => setParams(withSheetParams(params, { tarefa: taskId }))}
    />
  );
}

interface RecurringOccurrenceSheetProps {
  open: boolean;
  id: string | null;
  period: string | null;
  initialView: OccurrenceView | null;
  onClose: () => void;
  onOpenTask: (taskId: string) => void;
}

/**
 * A recurring task in one period, one line per client (spec §10.4): the cell (same cycle as the
 * matrix), the client (opens the occurrence in the task sheet, over this one), the regime, the
 * effective responsible and who concluded it.
 */
function RecurringOccurrenceSheet({ open, id, period, initialView, onClose, onOpenTask }: RecurringOccurrenceSheetProps) {
  const detail = useRecurringOccurrence(id, period);
  const options = useTaskOptions();
  const today = options.data?.today ?? todayISO();
  const meId = options.data?.me.id;
  const d = detail.data && detail.data.recurringTaskId === id ? detail.data : undefined;
  const mineCount = d ? d.cells.filter((c) => c.assignee?.id === meId).length : 0;
  const pendingCount = d ? d.cells.filter(isPendingCell).length : 0;
  const [view, setView] = useState<OccurrenceView>('pending');
  const [search, setSearch] = useState('');
  const [assignee, setAssignee] = useState('');
  const loadedKey = d ? `${d.recurringTaskId}:${d.periodKey}` : '';

  // The view of whoever opened it ("Minhas" → your clients), once the data arrives.
  useEffect(() => {
    if (!d) return;
    const wanted = initialView ?? (pendingCount > 0 ? 'pending' : 'all');
    setView(wanted === 'mine' && mineCount === 0 ? (pendingCount > 0 ? 'pending' : 'all') : wanted);
    setSearch('');
    setAssignee('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadedKey]);

  // A malformed `?recorrente=`/`?periodo=` is never requested: "não encontrada" instead of loading forever.
  const notFound = !isOccurrenceRef(id, period) || (detail.error instanceof ApiRequestError && (detail.error.status === 404 || detail.error.status === 400));
  const cells = d ? occurrenceSheetCells(d, view, meId, search, assignee) : [];
  const deadline = d ? groupDeadlineInfo(d, today, true) : null;
  const isAdmin = usePermissions().can('reopenOthers');

  const title = d ? occurrenceTitle(d, today) : 'Tarefa recorrente';
  const description = d ? (
    <>
      {[d.department?.name, d.period !== 'weekly' ? referenceLabel(d.referenceMonth) : null, d.targetDate < d.legalDueDate ? `meta ${shortDate(d.targetDate, today)}` : null, `prazo legal ${shortDate(d.legalDueDate, today)}`]
        .filter(Boolean)
        .join(' · ')}
      {d.pending > 0 && deadline && (deadline.tone === 'danger' || deadline.tone === 'warning-strong') ? (
        <span className={cn('block', DUE_TONE_CLASS[deadline.tone])}>{deadline.text.split(' · ')[0]}</span>
      ) : null}
    </>
  ) : undefined;

  const views = [
    ...(mineCount > 0 ? [{ value: 'mine' as const, label: `Seus clientes (${mineCount})` }] : []),
    { value: 'pending' as const, label: `Pendentes (${pendingCount})` },
    { value: 'all' as const, label: `Todos (${d?.cells.length ?? 0})` },
  ];

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description={description}
      width="lg"
      headerExtra={
        d ? (
          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-center">
            <div className="-mx-1 overflow-x-auto px-1">
              <SegmentedControl<OccurrenceView> size="sm" ariaLabel="Clientes" value={view} onChange={setView} options={views} />
            </div>
            <div className="relative min-w-0 flex-1 sm:min-w-40">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar cliente" aria-label="Buscar cliente" className="h-9 rounded-[10px] pl-9 text-[13px]" />
            </div>
            {options.data ? (
              <MemberPicker
                size_="sm"
                className="sm:w-48"
                value={assignee}
                onChange={setAssignee}
                members={options.data.members}
                allowAll
                allLabel="Todos os responsáveis"
                allowNone
                meFirst
                aria-label="Responsável"
              />
            ) : null}
          </div>
        ) : null
      }
      footer={
        d ? (
          <Button variant="link" size="sm" asChild className="mr-auto">
            <Link to={auditHref(d)} onClick={onClose}>
              Abrir na auditoria
            </Link>
          </Button>
        ) : null
      }
    >
      {notFound ? (
        <EmptyState icon={<Repeat />} title="Tarefa recorrente não encontrada" description="Ela pode ter sido excluída ou não ocorre neste período." />
      ) : detail.isError && !d ? (
        <ErrorState error={detail.error} onRetry={() => detail.refetch()} />
      ) : !d ? (
        <SkeletonRows rows={6} />
      ) : cells.length === 0 ? (
        <EmptyState
          compact
          title={view === 'pending' && !search && !assignee ? 'Nenhum cliente pendente' : 'Nenhum cliente com esses filtros'}
          description={view === 'pending' && !search && !assignee ? 'Todos os clientes desta tarefa recorrente foram concluídos.' : undefined}
        />
      ) : (
        <ul className="-mx-2 flex flex-col">
          {cells.map((c) => (
            <OccurrenceClientRow
              key={c.taskId}
              cell={c}
              detail={d}
              today={today}
              members={options.data?.members ?? []}
              meId={meId}
              isAdmin={isAdmin}
              onOpenTask={() => onOpenTask(c.taskId)}
            />
          ))}
        </ul>
      )}
    </Sheet>
  );
}

interface OccurrenceClientRowProps {
  cell: OccurrenceCell & { client: OccurrenceClient };
  detail: RecurringOccurrenceDetail;
  today: string;
  members: TaskMember[];
  meId: string | undefined;
  isAdmin: boolean;
  onOpenTask: () => void;
}

/** One client of the occurrence sheet (and of the "Por tarefa" accordion of the audit). */
export function OccurrenceClientRow({ cell, detail, today, members, meId, onOpenTask }: OccurrenceClientRowProps) {
  const status = useCellStatus();
  const update = useUpdateTask();
  const { canWriteTasks } = usePermissions();
  const [picking, setPicking] = useState(false);
  const periodName = periodLabel(detail, today);
  const ctx = { taskName: detail.name, clientName: cell.client.name };
  const department = detail.department?.name ?? null;
  const canceled = cell.status === 'canceled';

  async function assign(userId: string | null) {
    const previous = cell.assignee;
    try {
      await update.mutateAsync({ id: cell.taskId, patch: { assigneeId: userId } });
      const who = userId ? members.find((m) => m.id === userId) : null;
      toast(`${detail.name} de ${cell.client.name} em ${competenceName(detail.competence).split(' ')[0]}: ${who ? `agora com ${firstName(who.name)}` : 'sem responsável'}.`, {
        duration: 6000,
        action: { label: 'Desfazer', onClick: () => void update.mutateAsync({ id: cell.taskId, patch: { assigneeId: previous?.id ?? null } }).catch(toastError) },
      });
    } catch (error) {
      toastError(error);
    }
  }

  const sourceTip = (cell.assignee ? assigneeSourceText(cell.assigneeSource) : null) ?? 'Sem responsável';

  return (
    <li className="group flex min-h-[52px] items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-surface-muted">
      {canWriteTasks ? (
        <OccurrenceCellControl
          cell={cell}
          taskName={detail.name}
          clientName={cell.client.name}
          periodName={periodName}
          department={department}
          busy={status.isBusy(cell.taskId)}
          large
          onChange={(s) => void status.change(cell, s, ctx)}
          onReopen={(reason, s) => status.change(cell, s, ctx, { reason })}
          onOpenTask={onOpenTask}
        />
      ) : (
        <OccurrenceStatusGlyph cell={cell} large label={`${detail.name}, ${cell.client.name}: ${cellTip(cell, department)}`} />
      )}
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onOpenTask} className={cn('block max-w-full truncate rounded-sm text-left text-sm font-semibold hover:underline', canceled ? 'text-muted' : 'text-fg')}>
          {cell.client.name}
        </button>
        <p className="truncate text-xs text-muted">
          {TAX_REGIME_LABELS[cell.client.taxRegime]}
          <span className="sm:hidden"> · {cell.assignee ? shortName(cell.assignee.name) : 'Sem responsável'}</span>
        </p>
        {cell.status === 'done' && cell.concludedAt ? (
          <p className="truncate text-mini text-muted">
            Concluída{cell.concludedBy ? ` por ${shortName(cell.concludedBy.name)}` : ''} em {shortDate(dateInTimeZone(new Date(cell.concludedAt)), today)},{' '}
            {new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(new Date(cell.concludedAt))}
          </p>
        ) : null}
      </div>
      <Tooltip content={sourceTip}>
        <span className="hidden w-32 min-w-0 items-center gap-2 sm:flex" tabIndex={-1}>
          <MemberAvatar name={cell.assignee?.name} unassigned={!cell.assignee} userId={cell.assignee?.id} />
          <span className={cn('truncate text-[13px]', cell.assignee ? 'text-fg' : 'text-subtle')}>{cell.assignee ? shortName(cell.assignee.name) : 'Sem responsável'}</span>
        </span>
      </Tooltip>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 pointer-coarse:opacity-100"
            aria-label={`Ações de ${detail.name} para ${cell.client.name}`}
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={<ExternalLink />} onSelect={onOpenTask}>
            Abrir tarefa
          </DropdownMenuItem>
          {canWriteTasks && meId && cell.assignee?.id !== meId ? (
            <DropdownMenuItem icon={<UserRoundCheck />} onSelect={() => void assign(meId)}>
              Atribuir a mim
            </DropdownMenuItem>
          ) : null}
          {canWriteTasks ? (
            <DropdownMenuItem icon={<UserRoundPen />} onSelect={() => setPicking(true)}>
              Atribuir a…
            </DropdownMenuItem>
          ) : null}
          <DropdownMenuItem icon={<Building2 />} asChild>
            <Link to={`/tarefas/clientes/${cell.client.id}`}>Ver cliente</Link>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {picking ? (
        <AssignOccurrenceDialog
          title={`Atribuir ${detail.name} de ${cell.client.name}`}
          members={members}
          value={cell.assignee?.id ?? NONE}
          departmentId={detail.department?.id}
          onClose={() => setPicking(false)}
          onPick={(v) => {
            setPicking(false);
            if ((v === NONE ? null : v) !== (cell.assignee?.id ?? null)) void assign(v === NONE ? null : v);
          }}
        />
      ) : null}
    </li>
  );
}

/** "Atribuir a…" (only this occurrence; the client's responsible does not change). */
function AssignOccurrenceDialog({
  title,
  members,
  value,
  departmentId,
  onPick,
  onClose,
}: {
  title: string;
  members: TaskMember[];
  value: string;
  departmentId: string | undefined;
  onPick: (v: string) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState(value);
  return (
    <Modal
      open
      onOpenChange={(o) => !o && onClose()}
      title={title}
      description="Vale só para esta competência; o responsável padrão da recorrente não muda."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button onClick={() => onPick(picked)}>Atribuir</Button>
        </>
      }
    >
      <Field label="Responsável">
        <MemberPicker value={picked} onChange={setPicked} members={members} allowNone meFirst departmentId={departmentId} />
      </Field>
    </Modal>
  );
}
