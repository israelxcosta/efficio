import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { CheckCheck, Ellipsis, Eye, Pencil, Plus, Scale, Search, SearchX, SlidersHorizontal, Trash2, X } from 'lucide-react';
import { toast } from 'sonner';
import { formatCNPJ, formatDateBR, monthName, type UnionListItem, type UnionListResponse, type UnionQuery, type UnionSituation } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { deadlineClass, deadlineLabel } from '@/features/deadlines/deadline-logic';
import { SummaryLabel, toggleClass } from '@/features/tasks/components/tasks-summary';
import { toastError } from '@/lib/notify';
import { cn, pluralize } from '@/lib/utils';
import { useDeleteUnion, useUnions } from '../api';
import { UNION_SITUATION_FILTERS, unionInitials, unionsDescription } from '../union-logic';
import { usePublishAction } from '../use-publish';
import { ConventionCyclesDialog } from './convention-cycles-dialog';
import { UnionSheet } from './union-sheet';

type StatusFilter = 'active' | 'inactive' | 'all';
const STATUS_PARAM: Record<StatusFilter, string> = { active: '', inactive: 'inativos', all: 'todos' };
const PAGE_SIZE = 50;

interface UnionFilters {
  search: string;
  status: StatusFilter;
  situation: UnionSituation | '';
  page: number;
}

function readFilters(params: URLSearchParams): UnionFilters {
  const status = params.get('cadastro');
  const situation = params.get('convencao') as UnionSituation | null;
  return {
    search: params.get('busca') ?? '',
    status: status === 'inativos' ? 'inactive' : status === 'todos' ? 'all' : 'active',
    situation: situation && UNION_SITUATION_FILTERS.some((f) => f.value === situation) ? situation : '',
    page: Math.max(1, Number(params.get('pagina')) || 1),
  };
}

function toQuery(f: UnionFilters): UnionQuery {
  return { search: f.search || undefined, status: f.status, situation: f.situation || undefined, page: f.page, pageSize: PAGE_SIZE };
}

function useUnionFilters() {
  const [params, setParams] = useSearchParams();
  const filters = readFilters(params);
  const update = (patch: Partial<UnionFilters>) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        const merged = { ...readFilters(p), page: 1, ...patch };
        const set = (k: string, v: string) => (v ? next.set(k, v) : next.delete(k));
        set('busca', merged.search.trim());
        set('cadastro', STATUS_PARAM[merged.status]);
        set('convencao', merged.situation);
        set('pagina', merged.page > 1 ? String(merged.page) : '');
        return next;
      },
      { replace: true },
    );
  return { filters, update };
}

/** Description and action of the page header on the Sindicatos tab (spec §13.7). */
export function useUnionsHeader(enabled: boolean): { description: ReactNode; action: ReactNode } {
  const { filters } = useUnionFilters();
  const list = useUnions(toQuery(filters), { enabled });
  const [, setParams] = useSearchParams();
  const { can } = usePermissions();
  const summary = list.data?.summary;
  const note = can('registry') ? '' : ' Somente administradores alteram estes cadastros.';
  return {
    description: summary ? `${unionsDescription(summary)}.${note}` : `Sindicatos e convenções coletivas dos clientes.${note}`,
    action: (
      <WriteGate scope="admin">
        <Button
          onClick={() =>
            setParams((p) => {
              const next = new URLSearchParams(p);
              next.set('sindicato', 'novo');
              return next;
            })
          }
        >
          <Plus /> Novo sindicato
        </Button>
      </WriteGate>
    ),
  };
}

/** Cadastros › Sindicatos (spec §13.7): summary, toolbar, list, sheet and the agreements dialog. */
export function UnionsTab() {
  const [params, setParams] = useSearchParams();
  const { filters, update } = useUnionFilters();
  const list = useUnions(toQuery(filters));
  const { can } = usePermissions();
  const remove = useDeleteUnion();
  const { publish } = usePublishAction();
  const [cycles, setCycles] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<UnionListItem | null>(null);
  const sheetParam = params.get('sindicato');
  const data = list.data;
  const filterCount = (filters.search ? 1 : 0) + (filters.status !== 'active' ? 1 : 0) + (filters.situation ? 1 : 0);

  const setSheet = (value: string | null) =>
    setParams(
      (p) => {
        const next = new URLSearchParams(p);
        if (value) next.set('sindicato', value);
        else next.delete('sindicato');
        return next;
      },
      { replace: !value },
    );

  return (
    <div className="flex flex-col gap-4">
      <UnionSummary data={data} situation={filters.situation} onSituation={(s) => update({ situation: filters.situation === s ? '' : s })} />
      <Card className="@container overflow-hidden">
        <UnionToolbar filters={filters} total={data?.total} onChange={update} />
        <div className="hidden items-center gap-3 border-y border-border px-5.5 py-2.5 text-xs font-medium text-muted @xl:flex">
          <span className="flex-1">Sindicato</span>
          <span className="hidden w-44 @3xl:block">Categoria</span>
          <span className="hidden w-28 @2xl:block">Clientes</span>
          <span className="hidden w-28 @4xl:block">Data-base</span>
          <span className="w-40 text-right">Convenção</span>
          <span className="w-8" aria-hidden />
        </div>
        <div className="p-1.5">
          {list.isPending ? (
            <SkeletonRows rows={4} className="p-3" />
          ) : list.isError ? (
            <ErrorState error={list.error} onRetry={() => list.refetch()} className="m-3" />
          ) : data!.items.length === 0 ? (
            filterCount > 0 || (data!.summary.active === 0 && data!.summary.inactive > 0) ? (
              <EmptyState
                className="m-3"
                icon={<SearchX />}
                title="Nenhum sindicato com esses filtros"
                action={
                  <Button variant="outline" size="sm" onClick={() => update({ search: '', status: 'active', situation: '' })}>
                    Limpar filtros
                  </Button>
                }
              />
            ) : (
              <EmptyState
                className="m-3"
                icon={<Scale />}
                title="Nenhum sindicato cadastrado"
                description={
                  can('registry')
                    ? 'Cadastre os sindicatos dos clientes para acompanhar a data-base e a publicação das convenções coletivas.'
                    : 'Os administradores cadastram os sindicatos dos clientes para acompanhar a data-base e a publicação das convenções coletivas.'
                }
                action={
                  can('registry') ? (
                    <WriteGate scope="admin">
                      <Button variant="outline" onClick={() => setSheet('novo')}>
                        <Plus /> Novo sindicato
                      </Button>
                    </WriteGate>
                  ) : null
                }
              />
            )
          ) : (
            data!.items.map((u) => (
              <UnionRow
                key={u.id}
                union={u}
                onOpen={() => setSheet(u.id)}
                onCycles={() => setCycles(u.id)}
                onPublish={() => u.tracked && void publish({ id: u.id, name: u.acronym ?? u.name }, u.tracked)}
                onDelete={() => setDeleting(u)}
              />
            ))
          )}
        </div>
        {data && data.total > PAGE_SIZE ? (
          <div className="flex items-center justify-between gap-3 border-t border-border px-4 py-3 text-body-sm text-muted">
            <span>
              Página {data.page} de {Math.ceil(data.total / PAGE_SIZE)}
            </span>
            <span className="flex gap-2">
              <Button variant="outline" size="sm" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })}>
                Anterior
              </Button>
              <Button variant="outline" size="sm" disabled={data.page * PAGE_SIZE >= data.total} onClick={() => update({ page: data.page + 1 })}>
                Próxima
              </Button>
            </span>
          </div>
        ) : null}
      </Card>

      <UnionSheet
        param={sheetParam}
        onClose={() => setSheet(null)}
        onCycles={(id) => setCycles(id)}
      />
      <ConventionCyclesDialog
        unionId={cycles}
        onClose={() => setCycles(null)}
        onEdit={(id) => {
          setCycles(null);
          setSheet(id);
        }}
      />
      <ConfirmDialog
        open={deleting !== null}
        onOpenChange={(o) => !o && setDeleting(null)}
        title={`Excluir o sindicato ${deleting?.acronym ?? deleting?.name ?? ''}?`}
        description={`${
          deleting?.clientCount ? `O vínculo com ${pluralize(deleting.clientCount, 'cliente', 'clientes')} e o histórico` : 'O histórico'
        } de convenções também ${deleting?.clientCount ? 'serão excluídos' : 'será excluído'}. Para manter o histórico, inative o sindicato.`}
        confirmLabel="Excluir sindicato"
        loading={remove.isPending}
        onConfirm={async () => {
          if (!deleting) return;
          try {
            await remove.mutateAsync(deleting.id);
            toast.success('Sindicato excluído.');
            setDeleting(null);
          } catch (error) {
            toastError(error);
          }
        }}
      />
    </div>
  );
}

function UnionSummary({ data, situation, onSituation }: { data: UnionListResponse | undefined; situation: UnionSituation | ''; onSituation: (s: UnionSituation) => void }) {
  const s = data?.summary;
  const cell = (key: UnionSituation, label: string, value: number | undefined, bottom: string, opts: { main?: boolean; tone?: 'danger' | 'warning' } = {}) => (
    <div className={cn('min-w-0 p-4 sm:p-5', opts.main ? '' : '')}>
      <button
        type="button"
        aria-pressed={situation === key}
        aria-label={s ? `${label}: ${value}. Filtrar a lista.` : label}
        onClick={() => onSituation(key)}
        className={cn('-m-2 block w-[calc(100%+1rem)] p-2 text-left', toggleClass)}
      >
        <SummaryLabel>{label}</SummaryLabel>
        {s ? (
          <span
            className={cn(
              'tabular mt-1 block leading-10 font-semibold tracking-tight',
              opts.main ? 'text-[32px]' : 'text-kpi',
              value && opts.tone === 'danger' ? 'text-danger' : value && opts.tone === 'warning' ? 'text-warning' : 'text-fg',
            )}
          >
            {value}
          </span>
        ) : (
          <span className="mt-1 flex h-10 items-center">
            <Skeleton className="h-7 w-12" />
          </span>
        )}
      </button>
      {s ? <p className="mt-1 text-body-sm text-muted">{bottom}</p> : <Skeleton className="mt-2 h-3.5 w-28" />}
    </div>
  );
  return (
    <section aria-label="Resumo das convenções" aria-busy={s ? undefined : true} className="overflow-hidden rounded-xl border border-border bg-surface">
      <div className="grid grid-cols-2 lg:grid-cols-4 [&>*:nth-child(n+3)]:border-t [&>*:nth-child(n+3)]:border-border lg:[&>*:nth-child(n+3)]:border-t-0 [&>*:nth-child(even)]:border-l [&>*:nth-child(even)]:border-border lg:[&>*:not(:first-child)]:border-l">
        {cell('overdue', 'Convenção vencida', s?.overdue, s?.overdue ? `afeta ${pluralize(s.overdueClients, 'cliente', 'clientes')}` : 'Nenhuma vencida.', { main: true, tone: 'danger' })}
        {cell('within30', 'Vence em até 30 dias', s?.within30, 'data-base próxima', { tone: 'warning' })}
        {cell('within60', 'Vence em 31 a 60 dias', s?.within60, 'para acompanhar')}
        {cell('noBaseMonth', 'Sem data-base', s?.noBaseMonth, 'não entram nos alertas')}
      </div>
    </section>
  );
}

function UnionToolbar({ filters, total, onChange }: { filters: UnionFilters; total: number | undefined; onChange: (patch: Partial<UnionFilters>) => void }) {
  const [search, setSearch] = useState(filters.search);
  const [sheet, setSheet] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => {
      if (search.trim() !== filters.search) onChange({ search });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);
  useEffect(() => {
    if (!filters.search) setSearch('');
  }, [filters.search]);
  const mobileCount = (filters.status !== 'active' ? 1 : 0) + (filters.situation ? 1 : 0);
  const status = (
    <SegmentedControl<StatusFilter>
      size="sm"
      ariaLabel="Cadastro"
      value={filters.status}
      onChange={(v) => onChange({ status: v })}
      options={[
        { value: 'active', label: 'Ativos' },
        { value: 'inactive', label: 'Inativos' },
        { value: 'all', label: 'Todos' },
      ]}
    />
  );
  const situation = (sm: boolean) => (
    <Select size_={sm ? 'sm' : 'md'} aria-label="Situação da convenção" value={filters.situation} onChange={(e) => onChange({ situation: e.target.value as UnionSituation | '' })}>
      {UNION_SITUATION_FILTERS.map((f) => (
        <option key={f.value} value={f.value}>
          {f.label}
        </option>
      ))}
    </Select>
  );
  const searchInput = (placeholder: string) => (
    <div className="relative min-w-0 flex-1">
      <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
      <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={placeholder} aria-label="Buscar sindicato" className="h-9 rounded-[10px] pl-9 text-[13px]" />
    </div>
  );
  return (
    <div className="p-4">
      <div className="hidden flex-wrap items-center gap-2 sm:flex">
        <div className="flex min-w-64 flex-1">{searchInput('Buscar por nome, sigla, categoria ou CNPJ')}</div>
        {status}
        <div className="w-52">{situation(true)}</div>
        <span className="ml-auto text-body-sm text-muted">{total !== undefined ? pluralize(total, 'sindicato', 'sindicatos') : ''}</span>
      </div>
      <div className="flex items-center gap-2 sm:hidden">
        {searchInput('Buscar')}
        <Button variant="outline" size="sm" className="h-9" onClick={() => setSheet(true)}>
          <SlidersHorizontal /> Filtros{mobileCount ? ` (${mobileCount})` : ''}
        </Button>
      </div>
      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="Filtros"
        description="Refine a lista de sindicatos."
        footer={
          <>
            <Button variant="ghost" onClick={() => onChange({ status: 'active', situation: '' })}>
              <X /> Limpar
            </Button>
            <Button onClick={() => setSheet(false)}>Ver sindicatos</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Cadastro">{status}</Field>
          <Field label="Situação da convenção">{situation(false)}</Field>
        </div>
      </Sheet>
    </div>
  );
}

const menuButton =
  'flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 focus-visible:opacity-100 pointer-coarse:opacity-100';

/** "01/11/2026" and "Vence em 2 dias" (or "Sem data-base"), with the cycle in the tooltip. */
function ConventionWhen({ union: u, inline }: { union: UnionListItem; inline?: boolean }) {
  if (!u.tracked) return <span className={cn('text-xs text-subtle', !inline && 'block')}>Sem data-base</span>;
  const text = deadlineLabel(u.tracked);
  if (inline) {
    return (
      <span className="text-xs">
        <span className="tabular text-fg">{formatDateBR(u.tracked.dueDate)}</span> · <span className={deadlineClass(u.tracked)}>{text}</span>
      </span>
    );
  }
  return (
    <Tooltip content={`Convenção Coletiva ${u.tracked.label}`}>
      <span tabIndex={-1} className="block">
        <span className="tabular block text-[13px] font-medium text-fg">{formatDateBR(u.tracked.dueDate)}</span>
        <span className={cn('block text-xs', deadlineClass(u.tracked))}>{text}</span>
      </span>
    </Tooltip>
  );
}

function UnionRow({
  union: u,
  onOpen,
  onCycles,
  onPublish,
  onDelete,
}: {
  union: UnionListItem;
  onOpen: () => void;
  onCycles: () => void;
  onPublish: () => void;
  onDelete: () => void;
}) {
  const { can, subscriptionActive } = usePermissions();
  const title = u.acronym ?? u.name;
  const subtitle = u.acronym ? u.name : formatCNPJ(u.document);
  const month = monthName(u.baseMonth);
  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-muted @lg:px-4">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left">
        <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-full bg-bg-subtle text-xs font-bold text-muted">
          {unionInitials(u)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('min-w-0 truncate text-sm font-semibold', u.active ? 'text-fg' : 'text-muted')}>{title}</span>
            {!u.active ? <Badge tone="neutral">Inativo</Badge> : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {subtitle}
            {month ? <span className="@4xl:hidden"> · data-base em {month.toLowerCase()}</span> : null}
          </span>
          <span className="mt-0.5 block truncate @xl:hidden">
            <ConventionWhen union={u} inline />
          </span>
        </span>
      </button>
      <div className="hidden w-44 min-w-0 @3xl:block">
        <span className={cn('block truncate text-body-sm', u.category ? 'text-fg' : 'text-subtle')}>{u.category ?? '—'}</span>
        {u.territory ? <span className="block truncate text-caption text-muted">{u.territory}</span> : null}
      </div>
      <div className="hidden w-28 @2xl:block">
        {u.clientCount ? (
          <span className="text-body-sm text-fg">{pluralize(u.clientCount, 'cliente', 'clientes')}</span>
        ) : (
          <span className="text-body-sm text-subtle">Nenhum</span>
        )}
      </div>
      <div className="hidden w-28 @4xl:block">
        <span className={cn('text-body-sm', month ? 'text-fg' : 'text-subtle')}>{month ?? '—'}</span>
      </div>
      <div className="hidden w-40 text-right @xl:block">
        <ConventionWhen union={u} />
      </div>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" className={menuButton} aria-label={`Ações de ${title}`}>
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={<Scale />} onSelect={onCycles}>
            Convenções coletivas…
          </DropdownMenuItem>
          <DropdownMenuItem icon={can('registry') ? <Pencil /> : <Eye />} onSelect={onOpen}>
            {can('registry') ? 'Editar' : 'Ver'}
          </DropdownMenuItem>
          {can('registry') && u.tracked && u.active ? (
            <DropdownMenuItem icon={<CheckCheck />} disabled={!subscriptionActive} onSelect={onPublish}>
              Marcar {u.tracked.label} como publicada
            </DropdownMenuItem>
          ) : null}
          {can('deleteRegistry') ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Trash2 />} tone="danger" disabled={!subscriptionActive} onSelect={onDelete}>
                Excluir
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
