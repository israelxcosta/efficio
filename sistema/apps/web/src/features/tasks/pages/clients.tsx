import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Building2, ChevronLeft, ChevronRight, ClipboardCheck, Ellipsis, ExternalLink, ListChecks, Search, Wallet } from 'lucide-react';
import { formatCNPJ, formatDateBR, TAX_REGIME_LABELS, TAX_REGIMES, type Client, type ClientDocumentAlert, type TaxRegime } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { usePermissions } from '@/features/auth/permissions';
import { Card } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { cn, initials, pluralize } from '@/lib/utils';
import { useAllClients, useTaskOptions } from '../api';
import { SummaryLabel, toggleClass } from '../components/tasks-summary';
import { TaskClientSheet } from '../components/task-client-sheet';
import { tasksHref } from '../url-state';
import { activeByRegime, filterClients, type ClientFilters, type ClientSituation } from '../client-filters';
import { useClientDocumentAlerts } from '@/features/deadlines/api';
import { mostUrgentText } from '@/features/deadlines/deadline-logic';

const PAGE_SIZE = 50;
type Situation = ClientSituation;
const SITUATION_PARAM: Record<Situation, string> = { active: 'ativos', inactive: 'inativos', all: 'todos' };

export default function TaskClientsPage() {
  const [params, setParams] = useSearchParams();
  const options = useTaskOptions();
  const clients = useAllClients();
  // The client registry lives in the finances (`finance`); here it is read-only.
  const canFinance = usePermissions().can('finance');

  const situationRaw = params.get('situacao');
  const filters: ClientFilters = {
    search: params.get('busca') ?? '',
    situation: (Object.keys(SITUATION_PARAM) as Situation[]).find((k) => SITUATION_PARAM[k] === situationRaw) ?? 'active',
    regime: (TAX_REGIMES as readonly string[]).includes(params.get('regime') ?? '') ? (params.get('regime') as TaxRegime) : '',
  };
  const page = Math.max(1, Number(params.get('pagina') ?? '1') || 1);
  const openId = params.get('cliente');
  // Documents with expiry date (phase 3): the summary cell, the filter and the subtitle.
  const docsRaw = params.get('documentos');
  const docsFilter: 'overdue' | 'within30' | null = docsRaw === 'vencidos' ? 'overdue' : docsRaw === '30-dias' ? 'within30' : null;
  const docAlerts = useClientDocumentAlerts();
  const alertsById = useMemo(() => new Map((docAlerts.data?.items ?? []).map((a) => [a.clientId, a])), [docAlerts.data]);

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    if (!('pagina' in patch)) next.delete('pagina');
    setParams(next, { replace: true });
  }

  const [searchInput, setSearchInput] = useState(filters.search);
  useEffect(() => {
    const t = setTimeout(() => {
      if (searchInput.trim() !== filters.search) update({ busca: searchInput.trim() });
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchInput]);

  const all = clients.data ?? [];
  const filtered = useMemo(() => {
    const list = filterClients(all, filters);
    if (!docsFilter) return list;
    return list.filter((c) => {
      const a = alertsById.get(c.id);
      return a ? (docsFilter === 'overdue' ? a.overdue > 0 : a.within30 > 0) : false;
    });
  }, [all, JSON.stringify(filters), docsFilter, alertsById]); // eslint-disable-line react-hooks/exhaustive-deps
  const docTotals = docAlerts.data?.totals;
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const active = all.filter((c) => c.status === 'active');
  const inactiveCount = all.length - active.length;
  const ready = clients.data && options.data;
  const regimes = activeByRegime(all);
  const maxRegime = Math.max(1, ...regimes.map((r) => r.count));

  const opened = openId ? all.find((c) => c.id === openId) ?? null : null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Clientes"
        description={
          ready
            ? `${pluralize(active.length, 'cliente ativo', 'clientes ativos')} · cadastro mantido pelos administradores no financeiro`
            : 'Cadastro mantido pelos administradores no financeiro'
        }
        actions={
          canFinance ? (
            <Button variant="outline" asChild>
              <Link to="/clientes">
                <Wallet /> Editar no financeiro
              </Link>
            </Button>
          ) : null
        }
      />

      {clients.isError && !clients.data ? null : (
        <section aria-label="Resumo dos clientes" aria-busy={ready ? undefined : true} className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid md:grid-cols-2 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,0.9fr)_minmax(0,1.6fr)]">
            <div className="min-w-0 p-4 sm:p-5">
              <SummaryLabel>Clientes ativos</SummaryLabel>
              {ready ? (
                <div className="flex items-center gap-4 md:block">
                  <p className="tabular mt-1 text-[32px] leading-10 font-semibold tracking-tight text-fg lg:text-[28px] xl:text-[32px]">{active.length}</p>
                  {inactiveCount > 0 ? (
                    <button
                      type="button"
                      aria-pressed={filters.situation === 'inactive'}
                      onClick={() => update({ situacao: filters.situation === 'inactive' ? null : 'inativos' })}
                      className={cn('-mx-1.5 mt-1 flex h-7 items-center px-1.5 text-body-sm font-medium text-brand-text underline decoration-border-strong underline-offset-4 hover:decoration-current', toggleClass)}
                    >
                      {pluralize(inactiveCount, 'inativo', 'inativos')}
                    </button>
                  ) : (
                    <p className="mt-1 text-body-sm text-muted">Nenhum inativo</p>
                  )}
                </div>
              ) : (
                <span className="mt-1 flex h-10 items-center">
                  <Skeleton className="h-8 w-16" />
                </span>
              )}
            </div>
            <div className="min-w-0 border-t border-border p-4 sm:p-5 md:border-t-0 md:border-l">
              <button
                type="button"
                aria-pressed={docsFilter === 'overdue'}
                disabled={!docTotals}
                onClick={() => update({ documentos: docsFilter === 'overdue' ? null : 'vencidos' })}
                aria-label={docTotals ? `Documentos vencidos: ${docTotals.overdue}. Filtrar a lista.` : 'Documentos'}
                className={cn('-m-2 block w-[calc(100%+1rem)] p-2 text-left disabled:cursor-default', toggleClass)}
              >
                <SummaryLabel info="Certificados, certidões e alvarás dos clientes ativos, cadastrados no financeiro.">Documentos</SummaryLabel>
                {docTotals ? (
                  <span className={cn('tabular mt-1 block text-kpi leading-10 font-semibold tracking-tight', docTotals.overdue > 0 ? 'text-danger' : 'text-fg')}>
                    {pluralize(docTotals.overdue, 'vencido', 'vencidos')}
                  </span>
                ) : (
                  <span className="mt-1 flex h-10 items-center">
                    <Skeleton className="h-6 w-24" />
                  </span>
                )}
              </button>
              {docTotals ? (
                docTotals.within30 > 0 ? (
                  <button
                    type="button"
                    aria-pressed={docsFilter === 'within30'}
                    onClick={() => update({ documentos: docsFilter === 'within30' ? null : '30-dias' })}
                    className={cn('-mx-1.5 mt-1 flex min-h-7 items-center px-1.5 text-left text-body-sm font-semibold text-fg underline decoration-border-strong underline-offset-4 hover:decoration-current', toggleClass)}
                  >
                    {docTotals.within30} {docTotals.within30 === 1 ? 'vence' : 'vencem'} em até 30 dias
                  </button>
                ) : (
                  <p className="mt-1 text-body-sm text-muted">Nada vence em 30 dias.</p>
                )
              ) : null}
            </div>
            <div className="min-w-0 border-t border-border px-4 pt-4 pb-4 sm:px-5 md:col-span-2 lg:col-span-1 lg:border-t-0 lg:border-l lg:pt-5">
              <SummaryLabel>Ativos por regime</SummaryLabel>
              {!ready ? (
                <div className="mt-2 flex flex-col gap-2" aria-hidden>
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-4/5" />
                </div>
              ) : regimes.length === 0 ? (
                <p className="mt-1.5 text-body-sm text-muted">Nenhum cliente ativo.</p>
              ) : (
                <ul className="-mx-2 mt-1 grid gap-x-6 md:grid-cols-2" aria-label="Clientes ativos por regime (filtra a lista)">
                  {regimes.map((r) => {
                    const pressed = filters.regime === r.regime;
                    return (
                      <li key={r.regime}>
                        <button
                          type="button"
                          aria-pressed={pressed}
                          aria-label={`${TAX_REGIME_LABELS[r.regime]}: ${r.count} clientes ativos. ${pressed ? 'Remover o filtro' : 'Filtrar a lista'}.`}
                          onClick={() => update({ regime: pressed ? null : r.regime })}
                          className={cn('grid w-full grid-cols-[8.5rem_minmax(0,1fr)_2.5rem] items-center gap-x-3 px-2 py-1 text-left pointer-coarse:py-2', toggleClass)}
                        >
                          <span className={cn('truncate text-body-sm text-fg', pressed && 'font-semibold')}>{TAX_REGIME_LABELS[r.regime]}</span>
                          <span className="block h-1.5" aria-hidden>
                            <span className="block h-full min-w-1 rounded-full bg-data" style={{ width: `${(r.count / maxRegime) * 100}%` }} />
                          </span>
                          <span className="tabular text-right text-body-sm font-semibold text-fg">{r.count}</span>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <Card className="@container overflow-hidden">
        <div className="flex flex-wrap items-center gap-3 border-b border-border p-4">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Buscar por razão social, fantasia ou CNPJ"
              className="h-10 pl-9"
              aria-label="Buscar clientes"
            />
          </div>
          <SegmentedControl<Situation>
            size="sm"
            value={filters.situation}
            onChange={(v) => update({ situacao: v === 'active' ? null : SITUATION_PARAM[v] })}
            ariaLabel="Situação"
            options={[
              { value: 'active', label: 'Ativos' },
              { value: 'inactive', label: 'Inativos' },
              { value: 'all', label: 'Todos' },
            ]}
          />
          <Select size_="sm" wrapperClassName="w-full sm:w-auto sm:min-w-[170px]" value={filters.regime} onChange={(e) => update({ regime: e.target.value })} aria-label="Regime tributário">
            <option value="">Todos os regimes</option>
            {TAX_REGIMES.map((r) => (
              <option key={r} value={r}>
                {TAX_REGIME_LABELS[r]}
              </option>
            ))}
          </Select>
          {ready ? <span className="ml-auto text-xs text-muted">{pluralize(filtered.length, 'cliente', 'clientes')}</span> : null}
        </div>

        <div className="hidden items-center gap-3 border-b border-border px-5.5 py-2.5 text-xs font-medium text-muted @xl:flex">
          <span className="flex-1">Cliente</span>
          <span className="hidden w-40 @3xl:block">CNPJ</span>
          <span className="hidden w-36 @2xl:block">Regime</span>
          <span className="w-8" aria-hidden />
        </div>

        <div className="p-1.5">
          {!ready && !clients.isError ? (
            <SkeletonRows rows={6} className="p-3" />
          ) : clients.isError ? (
            <ErrorState error={clients.error} onRetry={() => clients.refetch()} className="m-3" />
          ) : filtered.length === 0 ? (
            <EmptyState
              className="m-3"
              icon={<Building2 />}
              title={all.length === 0 ? 'Nenhum cliente cadastrado' : 'Nenhum cliente com esses filtros'}
              description={all.length === 0 ? 'Os clientes são cadastrados pelos administradores no financeiro.' : undefined}
              action={
                all.length > 0 ? (
                  <Button
                    variant="outline"
                    onClick={() => {
                      setSearchInput('');
                      update({ busca: null, situacao: null, regime: null, documentos: null });
                    }}
                  >
                    Limpar filtros
                  </Button>
                ) : canFinance ? (
                  <Button variant="outline" asChild>
                    <Link to="/clientes">Cadastrar no financeiro</Link>
                  </Button>
                ) : null
              }
            />
          ) : (
            shown.map((c) => (
              <ClientRow
                key={c.id}
                client={c}
                onOpen={() => update({ cliente: c.id, pagina: params.get('pagina') })}
                docAlert={docsFilter ? alertsById.get(c.id) : undefined}
              />
            ))
          )}
        </div>
        {filtered.length > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
            <span>
              Página {page} de {totalPages} · {filtered.length} clientes
            </span>
            <div className="flex gap-1">
              <Button variant="outline" size="icon-sm" disabled={page <= 1} onClick={() => update({ pagina: String(page - 1) })} aria-label="Página anterior">
                <ChevronLeft />
              </Button>
              <Button variant="outline" size="icon-sm" disabled={page >= totalPages} onClick={() => update({ pagina: String(page + 1) })} aria-label="Próxima página">
                <ChevronRight />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <TaskClientSheet
        client={opened}
        loading={Boolean(openId) && clients.isPending}
        notFound={Boolean(openId) && Boolean(clients.data) && !opened}
        error={openId ? clients.error : null}
        onClose={() => update({ cliente: null, pagina: params.get('pagina') })}
        options={options.data}
      />
    </div>
  );
}

interface ClientRowProps {
  client: Client;
  onOpen: () => void;
  /** Under the "Documentos" filter: the most urgent document goes in the subtitle. */
  docAlert?: ClientDocumentAlert;
}

/** Client row in the pattern of the task row (spec §13.1): identification, CNPJ, regime, menu. */
function ClientRow({ client: c, onOpen, docAlert }: ClientRowProps) {
  const navigate = useNavigate();
  const canFinance = usePermissions().can('finance');
  const name = c.tradeName || c.name;
  const inactive = c.status === 'inactive';

  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-muted @lg:px-4">
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-fg" aria-hidden>
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('min-w-[4.5rem] truncate text-sm font-semibold', inactive ? 'text-muted' : 'text-fg')}>{name}</span>
            {inactive ? <Badge tone="neutral">Inativo</Badge> : null}
          </span>
          {docAlert?.mostUrgent ? (
            <span className={cn('mt-0.5 block truncate text-xs', docAlert.mostUrgent.deadline.bucket === 'overdue' ? 'text-danger' : 'text-warning')}>
              {mostUrgentText(docAlert.mostUrgent)}
            </span>
          ) : (
            <span className="mt-0.5 block truncate text-xs text-muted">
              {inactive && c.inactivation ? `Inativo desde ${formatDateBR(c.inactivation.date)}` : c.tradeName ? c.name : TAX_REGIME_LABELS[c.taxRegime]}
            </span>
          )}
          <span className="mt-0.5 block truncate text-xs text-muted @3xl:hidden">
            <span className="tabular">{formatCNPJ(c.document)}</span>
            <span className="@2xl:hidden"> · {TAX_REGIME_LABELS[c.taxRegime]}</span>
          </span>
        </span>
      </button>
      <span className="tabular hidden w-40 text-body-sm text-muted @3xl:block">{formatCNPJ(c.document)}</span>
      <span className="hidden w-36 min-w-0 @2xl:block">
        <span className="block truncate text-body-sm text-fg">{TAX_REGIME_LABELS[c.taxRegime]}</span>
        {c.simplesAnnex ? <span className="block text-xs text-muted">Anexo {c.simplesAnnex}</span> : null}
      </span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted opacity-70 transition hover:bg-bg-subtle hover:text-fg group-hover:opacity-100 pointer-coarse:opacity-100"
            aria-label={`Ações de ${name}`}
          >
            <Ellipsis className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem icon={<ExternalLink />} onSelect={onOpen}>
            Ver ficha
          </DropdownMenuItem>
          <DropdownMenuItem icon={<ListChecks />} onSelect={() => navigate(tasksHref({ scope: 'all', client: c.id }))}>
            Ver tarefas do cliente
          </DropdownMenuItem>
          <DropdownMenuItem icon={<ClipboardCheck />} onSelect={() => navigate(`/tarefas/auditoria?busca=${encodeURIComponent(name)}`)}>
            Ver na auditoria
          </DropdownMenuItem>
          {canFinance ? (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem icon={<Wallet />} onSelect={() => navigate(`/clientes?editar=${c.id}`)}>
                Editar no financeiro
              </DropdownMenuItem>
            </>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
