import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Building2, ChevronLeft, ChevronRight, Ellipsis, ExternalLink, ListChecks, Search, Wallet } from 'lucide-react';
import {
  formatCNPJ,
  formatDateBR,
  TAX_REGIME_LABELS,
  TAX_REGIMES,
  type Client,
  type ClientResponsible,
  type TaskMember,
  type TaskRef,
  type TaxRegime,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { AvatarStack } from '@/components/ui/member-avatar';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tooltip } from '@/components/ui/tooltip';
import { isUuid } from '@/lib/safe-url';
import { cn, initials, pluralize } from '@/lib/utils';
import { useAllClients, useClientResponsibles, useTaskOptions } from '../api';
import { AssignResponsibleDialog, ClientResponsibleCell, responsibleOf } from '../components/client-responsible';
import { MemberPicker } from '../components/pickers';
import { SummaryLabel, toggleClass } from '../components/tasks-summary';
import { TaskClientSheet } from '../components/task-client-sheet';
import { shortName } from '../due';
import { tasksHref } from '../url-state';
import { filterClients, missingDepartments, type ClientFilters, type ClientSituation } from '../client-filters';

const PAGE_SIZE = 50;
type Situation = ClientSituation;
const SITUATION_PARAM: Record<Situation, string> = { active: 'ativos', inactive: 'inativos', all: 'todos' };

export default function TaskClientsPage() {
  const [params, setParams] = useSearchParams();
  const options = useTaskOptions();
  const clients = useAllClients();
  const grid = useClientResponsibles();
  const isAdmin = options.data?.me.isAdmin ?? false;
  const members = options.data?.members ?? [];
  const departments = grid.data?.departments ?? [];
  const items = grid.data?.items ?? [];

  const situationRaw = params.get('situacao');
  const filters: ClientFilters = {
    search: params.get('busca') ?? '',
    situation: (Object.keys(SITUATION_PARAM) as Situation[]).find((k) => SITUATION_PARAM[k] === situationRaw) ?? 'active',
    regime: (TAX_REGIMES as readonly string[]).includes(params.get('regime') ?? '') ? (params.get('regime') as TaxRegime) : '',
    department: isUuid(params.get('departamento')) ? params.get('departamento')! : '',
    responsible: isUuid(params.get('responsavel')) ? params.get('responsavel')! : '',
    unassigned: params.get('sem-responsavel') === '1',
  };
  const page = Math.max(1, Number(params.get('pagina') ?? '1') || 1);
  const openId = params.get('cliente');

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
  const filtered = useMemo(() => filterClients(all, filters, departments, items), [all, departments, items, JSON.stringify(filters)]); // eslint-disable-line react-hooks/exhaustive-deps
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const shown = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const active = all.filter((c) => c.status === 'active');
  const inactiveCount = all.length - active.length;
  const gaps = active.flatMap((c) => missingDepartments(c.id, departments, items).map(() => c.id));
  const gapClients = new Set(gaps).size;
  const ready = clients.data && grid.data && options.data;
  // Up to 4 departments get a column each; more (or a narrow list) share one "Responsáveis" column.
  const columns = filters.department ? departments.filter((d) => d.id === filters.department) : departments;
  const perDepartment = columns.length > 0 && columns.length <= 4;

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [batchOpen, setBatchOpen] = useState(false);
  const toggleSelected = (id: string, on: boolean) =>
    setSelected((s) => {
      const next = new Set(s);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

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
          isAdmin ? (
            <Button variant="outline" asChild>
              <Link to="/clientes">
                <Wallet /> Editar no financeiro
              </Link>
            </Button>
          ) : null
        }
      />

      {clients.isError && !clients.data ? null : (
        <section aria-label="Resumo dos responsáveis" aria-busy={ready ? undefined : true} className="overflow-hidden rounded-xl border border-border bg-surface">
          <div className="grid md:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)]">
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
                aria-pressed={filters.unassigned}
                disabled={!ready || departments.length === 0}
                onClick={() => update({ 'sem-responsavel': filters.unassigned ? null : '1', situacao: null })}
                aria-label={`Sem responsável: ${gaps.length} vagas em ${gapClients} clientes. Filtrar a lista.`}
                className={cn('-m-2 block w-[calc(100%+1rem)] p-2 text-left disabled:cursor-default', toggleClass)}
              >
                <SummaryLabel info="Departamentos sem responsável definido em clientes ativos (cliente × departamento).">Sem responsável</SummaryLabel>
                {ready ? (
                  <span className={cn('tabular mt-1 block text-kpi leading-10 font-semibold tracking-tight', gaps.length > 0 ? 'text-warning' : 'text-fg')}>
                    {gaps.length}
                  </span>
                ) : (
                  <span className="mt-1 flex h-10 items-center">
                    <Skeleton className="h-6 w-10" />
                  </span>
                )}
              </button>
              {ready ? (
                <p className="mt-1 text-body-sm text-muted">
                  {departments.length === 0
                    ? 'Cadastre departamentos para definir responsáveis.'
                    : gaps.length
                      ? `em ${pluralize(gapClients, 'cliente', 'clientes')}`
                      : 'Todo cliente ativo tem responsável em cada departamento.'}
                </p>
              ) : null}
            </div>
            <div className="min-w-0 border-t border-border px-4 pt-4 pb-4 sm:px-5 md:col-span-2 lg:col-span-1 lg:border-t-0 lg:border-l lg:pt-5">
              <SummaryLabel>Com responsável, por departamento</SummaryLabel>
              {!ready ? (
                <div className="mt-2 flex flex-col gap-2" aria-hidden>
                  <Skeleton className="h-3.5 w-full" />
                  <Skeleton className="h-3.5 w-4/5" />
                </div>
              ) : departments.length === 0 ? (
                <p className="mt-1.5 text-body-sm text-muted">Nenhum departamento cadastrado.</p>
              ) : (
                <ul className="-mx-2 mt-1 grid gap-x-4 md:grid-cols-2 lg:grid-cols-1" aria-label="Clientes ativos com responsável por departamento (filtra a lista)">
                  {departments.map((d) => {
                    const covered = active.filter((c) => items.some((i) => i.clientId === c.id && i.departmentId === d.id)).length;
                    const pressed = filters.department === d.id;
                    return (
                      <li key={d.id}>
                        <button
                          type="button"
                          aria-pressed={pressed}
                          aria-label={`${d.name}: ${covered} de ${active.length} clientes ativos com responsável`}
                          onClick={() => update({ departamento: pressed ? null : d.id })}
                          className={cn('grid w-full grid-cols-[7.5rem_minmax(0,1fr)_3.5rem] items-center gap-x-3 px-2 py-1 text-left pointer-coarse:py-2', toggleClass)}
                        >
                          <span className={cn('truncate text-body-sm text-fg', pressed && 'font-semibold')}>{d.name}</span>
                          <span className="block h-1.5 overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                            <span className="block h-full rounded-full bg-data" style={{ width: `${active.length ? (covered / active.length) * 100 : 0}%` }} />
                          </span>
                          <span className={cn('tabular text-right text-body-sm font-semibold', covered < active.length ? 'text-warning' : 'text-fg')}>
                            {covered}/{active.length}
                          </span>
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
          {departments.length ? (
            <Select size_="sm" wrapperClassName="w-full sm:w-auto sm:min-w-[170px]" value={filters.department} onChange={(e) => update({ departamento: e.target.value })} aria-label="Departamento">
              <option value="">Todos os departamentos</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          ) : null}
          <MemberPicker
            size_="sm"
            className="w-full sm:w-56"
            value={filters.responsible}
            onChange={(v) => update({ responsavel: v })}
            members={members}
            allowAll
            meFirst
            aria-label="Responsável"
          />
          {departments.length ? (
            <label className="flex items-center gap-2 text-[13px] font-medium text-fg">
              <Switch checked={filters.unassigned} onCheckedChange={(on) => update({ 'sem-responsavel': on ? '1' : null })} aria-label="Só sem responsável" />
              Só sem responsável
            </label>
          ) : null}
          {ready ? <span className="ml-auto text-xs text-muted">{pluralize(filtered.length, 'cliente', 'clientes')}</span> : null}
        </div>

        {selected.size > 0 ? (
          <div className="flex flex-wrap items-center gap-3 border-b border-border bg-surface-muted px-4 py-2.5" aria-live="polite">
            <span className="text-body-sm font-semibold text-fg">{pluralize(selected.size, 'cliente selecionado', 'clientes selecionados')}</span>
            <Button variant="outline" size="sm" onClick={() => setBatchOpen(true)} disabled={departments.length === 0}>
              Definir responsável…
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>
              Limpar seleção
            </Button>
          </div>
        ) : (
          <div className="hidden items-center gap-3 border-b border-border px-5.5 py-2.5 text-xs font-medium text-muted @xl:flex">
            <span className="flex-1">Cliente</span>
            <span className="hidden w-40 @3xl:block">CNPJ</span>
            <span className="hidden w-36 @2xl:block">Regime</span>
            {perDepartment ? (
              columns.map((d) => (
                <span key={d.id} className="hidden w-36 truncate @4xl:block">
                  {d.name}
                </span>
              ))
            ) : null}
            {columns.length ? <span className={cn('w-28', perDepartment && '@4xl:hidden')}>Responsáveis</span> : null}
            <span className="w-8" aria-hidden />
          </div>
        )}

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
                      update({ busca: null, situacao: null, regime: null, departamento: null, responsavel: null, 'sem-responsavel': null });
                    }}
                  >
                    Limpar filtros
                  </Button>
                ) : isAdmin ? (
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
                columns={columns}
                perDepartment={perDepartment}
                items={items}
                isAdmin={isAdmin}
                members={members}
                selected={selected.has(c.id)}
                selecting={selected.size > 0}
                onSelect={(on) => toggleSelected(c.id, on)}
                onOpen={() => update({ cliente: c.id, pagina: params.get('pagina') })}
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

      {batchOpen ? (
        <AssignResponsibleDialog
          open={batchOpen}
          onOpenChange={setBatchOpen}
          clients={all.filter((c) => selected.has(c.id)).map((c) => ({ id: c.id, name: c.tradeName || c.name }))}
          departments={departments}
          members={members}
          items={items}
          defaultDepartment={filters.department || undefined}
          onDone={() => setSelected(new Set())}
        />
      ) : null}

      <TaskClientSheet
        client={opened}
        loading={Boolean(openId) && clients.isPending}
        notFound={Boolean(openId) && Boolean(clients.data) && !opened}
        error={openId ? clients.error : null}
        onClose={() => update({ cliente: null, pagina: params.get('pagina') })}
        grid={grid.data}
        options={options.data}
      />
    </div>
  );
}

interface ClientRowProps {
  client: Client;
  columns: TaskRef[];
  perDepartment: boolean;
  items: ClientResponsible[];
  isAdmin: boolean;
  members: TaskMember[];
  selected: boolean;
  selecting: boolean;
  onSelect: (on: boolean) => void;
  onOpen: () => void;
}

/** Client row in the pattern of the task row (spec §13.1): identification, CNPJ, regime, responsibles, menu. */
function ClientRow({ client: c, columns, perDepartment, items, isAdmin, members, selected, selecting, onSelect, onOpen }: ClientRowProps) {
  const navigate = useNavigate();
  const name = c.tradeName || c.name;
  const inactive = c.status === 'inactive';
  const responsibles = columns.map((d) => ({ department: d, member: responsibleOf(items, c.id, d.id) }));
  const missing = responsibles.filter((r) => !r.member).length;
  const stackTip = responsibles.map((r) => `${r.department.name}: ${r.member ? shortName(r.member.name) : 'sem responsável'}`).join(' · ');

  return (
    <div className="group flex items-center gap-3 rounded-lg px-3 py-3 transition-colors hover:bg-surface-muted @lg:px-4">
      {isAdmin ? (
        <span className={cn('flex shrink-0 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100 pointer-coarse:opacity-100', (selected || selecting) && 'opacity-100')}>
          <Checkbox checked={selected} onCheckedChange={onSelect} aria-label={`Selecionar ${name}`} />
        </span>
      ) : null}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 rounded-md text-left">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-fg" aria-hidden>
          {initials(name)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-1.5">
            <span className={cn('min-w-[4.5rem] truncate text-sm font-semibold', inactive ? 'text-muted' : 'text-fg')}>{name}</span>
            {inactive ? <Badge tone="neutral">Inativo</Badge> : null}
          </span>
          <span className="mt-0.5 block truncate text-xs text-muted">
            {inactive && c.inactivation ? `Inativo desde ${formatDateBR(c.inactivation.date)}` : c.tradeName ? c.name : TAX_REGIME_LABELS[c.taxRegime]}
          </span>
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
      {perDepartment
        ? responsibles.map((r) => (
            <span key={r.department.id} className="hidden w-36 min-w-0 @4xl:block">
              <ClientResponsibleCell client={{ id: c.id, name }} department={r.department} member={r.member} editable={isAdmin && !inactive} members={members} />
            </span>
          ))
        : null}
      {columns.length ? (
        <span className={cn('hidden w-28 min-w-0 @xl:block', perDepartment && '@4xl:hidden')}>
          <Tooltip content={stackTip}>
            <span tabIndex={0} className="flex flex-col items-start gap-0.5 rounded-md" aria-label={stackTip}>
              <AvatarStack names={responsibles.filter((r) => r.member).map((r) => r.member!.name)} max={3} />
              {missing ? <span className="text-mini text-warning">{missing} sem responsável</span> : null}
            </span>
          </Tooltip>
        </span>
      ) : null}
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
          {isAdmin ? (
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
