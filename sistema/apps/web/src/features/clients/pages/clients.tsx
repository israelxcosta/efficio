import { useEffect, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import {
  BadgePercent,
  Building2,
  ChevronLeft,
  ChevronRight,
  Ellipsis,
  Eye,
  FileSignature,
  HandCoins,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserCheck,
  UserX,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  INACTIVATION_REASON_LABELS,
  TAX_REGIMES,
  TAX_REGIME_LABELS,
  formatBRL,
  formatCNPJ,
  formatDateBR,
  todayISO,
  type Client,
  type ClientStatus,
  type TaxRegime,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions, WriteGate } from '@/features/auth/permissions';
import { toastError } from '@/lib/notify';
import { isUuid } from '@/lib/safe-url';
import { cn, initials, pluralize } from '@/lib/utils';
import { useClient, useClients, useDeleteClient, useReactivateClient } from '../api';
import { clientPagePath } from '../client-page-logic';
import { ClientSheet } from '../client-sheet';
import { ClientsSummary } from '../clients-summary';
import { FeesDialog } from '../fees-dialog';
import { InactivateDialog } from '../inactivate-dialog';
import { useGenerateContract } from '@/features/office/components/contract-requirements-dialog';

const PAGE_SIZE = 25;

type StatusFilter = ClientStatus | 'all';

/**
 * An item of a client's "⋯" menu (table rows and phone cards). A tap opens no tooltip, so a blocked
 * item shows its reason under the name.
 */
function MenuAction({
  label,
  icon,
  onSelect,
  blockedReason,
  tone = 'default',
}: {
  label: string;
  icon: ReactNode;
  onSelect: () => void;
  blockedReason?: string | null;
  tone?: 'default' | 'danger';
}) {
  return (
    <DropdownMenuItem icon={icon} tone={tone} disabled={Boolean(blockedReason)} onSelect={onSelect} className="min-h-10 [&>svg]:shrink-0">
      <span className="min-w-0">
        <span className="block">{label}</span>
        {blockedReason ? <span className="block text-mini font-normal text-muted">{blockedReason}</span> : null}
      </span>
    </DropdownMenuItem>
  );
}

/** The current fee; in the table it sits on the right edge (money is right-aligned, tabular). */
function FeeCell({ client, today, onOpen, align = 'left' }: { client: Client; today: string; onOpen: () => void; align?: 'left' | 'right' }) {
  const fee = client.currentFee;
  if (fee) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className={align === 'right' ? 'ml-auto block text-right' : 'text-left'}
        aria-label={`Honorários de ${client.name}`}
      >
        <span className="tabular block font-semibold whitespace-nowrap text-fg">{formatBRL(fee.amount)}</span>
        <span className="tabular block text-micro whitespace-nowrap text-muted">
          {formatBRL(fee.employeeFee)} / empregado
        </span>
      </button>
    );
  }
  if (client.status === 'inactive') return <span className="text-subtle">—</span>;
  const expired = client.latestFee && client.latestFee.endDate < today;
  return (
    <button type="button" onClick={onOpen} aria-label={`Honorários de ${client.name}`}>
      <Badge tone="warning">{expired ? 'Reajuste pendente' : 'Sem honorário'}</Badge>
    </button>
  );
}

export default function ClientsPage() {
  const { readOnlyReason } = usePermissions();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [regime, setRegime] = useState<TaxRegime | ''>('');
  const [page, setPage] = useState(1);
  const [sheet, setSheet] = useState<{ open: boolean; client?: Client | null }>({ open: false });
  const [feesFor, setFeesFor] = useState<Client | null>(null);
  const [toInactivate, setToInactivate] = useState<Client | null>(null);
  const [toReactivate, setToReactivate] = useState<Client | null>(null);
  const [toDelete, setToDelete] = useState<Client | null>(null);
  // "Gerar contrato" (phase 3): what is missing first, then the print page.
  const contract = useGenerateContract({ onEdit: (c) => setSheet({ open: true, client: c }), onFees: (c) => setFeesFor(c) });
  const del = useDeleteClient();
  const reactivate = useReactivateClient();
  const today = todayISO();

  useEffect(() => {
    const t = setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [searchInput]);

  const clients = useClients({
    search: search || undefined,
    status,
    taxRegime: regime || undefined,
    page,
    pageSize: PAGE_SIZE,
  });
  // Old deep link of the "Consultar" dialog (/clientes?consultar=<id>): the client page now.
  const viewParam = params.get('consultar');
  useEffect(() => {
    if (isUuid(viewParam)) navigate(clientPagePath('financeiro', viewParam), { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewParam]);

  // From the Gestão ("Editar no financeiro"): /clientes?editar=<id> opens the edit sheet.
  const editParam = params.get('editar');
  const editing = useClient(isUuid(editParam) ? editParam : null);
  useEffect(() => {
    if (!isUuid(editParam) || !editing.data) return;
    setSheet({ open: true, client: editing.data });
    const next = new URLSearchParams(params);
    next.delete('editar');
    setParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, editing.data]);

  const data = clients.data;
  const summary = data?.summary;

  const deleteBlockedReason = (c: Client) =>
    readOnlyReason ??
    (c.transactionCount > 0 ? 'Cliente com lançamentos vinculados não pode ser excluído. Use "Inativar".' : null);

  // "Ver" opens the client page; the other actions go into a "⋯" menu (table rows and phone cards
  // alike: one visible action per row, app-screens §7.8).
  const rowActions = (c: Client, layout: 'table' | 'card') => {
    const name = c.tradeName || c.name;
    const table = layout === 'table';
    return (
      <div className={cn('flex items-center gap-1.5', table && 'justify-end')}>
        <Button variant={table ? 'ghost' : 'outline'} size="sm" className={table ? 'h-9 px-3' : 'h-10 px-3.5'} asChild>
          <Link to={clientPagePath('financeiro', c.id)} aria-label={`Ver ficha de ${name}`}>
            <Eye aria-hidden /> {table ? 'Ver ficha' : 'Ver'}
          </Link>
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant={table ? 'ghost' : 'outline'} size="icon" className={cn(table && 'size-9')} aria-label={`Mais ações de ${name}`}>
              <Ellipsis aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-72 max-w-[calc(100vw-2rem)]">
            <MenuAction label="Editar cadastro" icon={<Pencil />} blockedReason={readOnlyReason} onSelect={() => setSheet({ open: true, client: c })} />
            <MenuAction label="Honorários e taxa por empregado" icon={<HandCoins />} onSelect={() => setFeesFor(c)} />
            <MenuAction label="Gerar contrato" icon={<FileSignature />} onSelect={() => void contract.start(c)} />
            <DropdownMenuSeparator />
            {c.status === 'active' ? (
              <MenuAction label="Inativar" icon={<UserX />} tone="danger" blockedReason={readOnlyReason} onSelect={() => setToInactivate(c)} />
            ) : (
              <MenuAction label="Reativar" icon={<UserCheck />} blockedReason={readOnlyReason} onSelect={() => setToReactivate(c)} />
            )}
            <MenuAction label="Excluir" icon={<Trash2 />} tone="danger" blockedReason={deleteBlockedReason(c)} onSelect={() => setToDelete(c)} />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    );
  };

  const statusBadge = (c: Client) =>
    c.inactivation ? (
      <Tooltip
        content={`${INACTIVATION_REASON_LABELS[c.inactivation.reason]} em ${formatDateBR(c.inactivation.date)}`}
      >
        <span
          tabIndex={0}
          className="inline-flex rounded-full outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25"
        >
          <Badge tone="neutral">Inativo</Badge>
        </span>
      </Tooltip>
    ) : (
      <Badge tone="success">Ativo</Badge>
    );
  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  const openNew = () => setSheet({ open: true, client: null });

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Clientes"
        actions={
          <>
            <Button variant="outline" asChild>
              <Link to="/clientes/reajuste">
                <BadgePercent /> Reajuste em lote
              </Link>
            </Button>
            <WriteGate>
              <Button onClick={openNew}>
                <Plus /> Novo cliente
              </Button>
            </WriteGate>
          </>
        }
      />

      {clients.isError && !summary ? null : (
        <ClientsSummary
          summary={summary}
          items={data?.items}
          filter={{ status, regime, search }}
          onFilter={(f) => {
            setStatus(f.status);
            setRegime(f.regime);
            if (f.search !== undefined) {
              setSearchInput(f.search);
              setSearch(f.search);
            }
            setPage(1);
          }}
          onOpenFees={setFeesFor}
        />
      )}

      <Card className="overflow-hidden">
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
          <SegmentedControl<StatusFilter>
            size="sm"
            value={status}
            onChange={(v) => {
              setStatus(v);
              setPage(1);
            }}
            ariaLabel="Situação"
            options={[
              { value: 'active', label: 'Ativos' },
              { value: 'inactive', label: 'Inativos' },
              { value: 'all', label: 'Todos' },
            ]}
          />
          <Select
            size_="sm"
            wrapperClassName="w-auto min-w-[190px]"
            value={regime}
            onChange={(e) => {
              setRegime(e.target.value as TaxRegime | '');
              setPage(1);
            }}
            aria-label="Regime tributário"
          >
            <option value="">Todos os regimes</option>
            {TAX_REGIMES.map((r) => (
              <option key={r} value={r}>
                {TAX_REGIME_LABELS[r]}
              </option>
            ))}
          </Select>
          {data ? (
            <span className="ml-auto text-mini text-muted">{pluralize(data.total, 'cliente', 'clientes')}</span>
          ) : null}
        </div>

        {clients.isPending ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : clients.isError ? (
          <ErrorState error={clients.error} onRetry={() => clients.refetch()} className="m-4" />
        ) : data!.items.length === 0 ? (
          <EmptyState
            className="m-4"
            icon={<Building2 />}
            title={
              search || regime || status !== 'active'
                ? 'Nenhum cliente encontrado'
                : 'Nenhum cliente cadastrado'
            }
            description="Cadastre as empresas atendidas, importe os dados da Receita Federal e registre os honorários de cada contrato."
            action={
              <WriteGate>
                <Button variant="outline" onClick={openNew}>
                  Cadastrar cliente
                </Button>
              </WriteGate>
            }
          />
        ) : (
          <>
            <ul className="divide-y divide-border md:hidden">
              {data!.items.map((c) => (
                <li key={c.id} className="flex flex-col gap-2 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-mini font-bold text-primary-soft-fg">
                      {initials(c.tradeName || c.name)}
                    </span>
                    <Link to={clientPagePath('financeiro', c.id)} className="min-w-0 flex-1 text-left">
                      <span
                        className={cn(
                          'block truncate font-semibold',
                          c.status === 'active' ? 'text-fg' : 'text-muted',
                        )}
                      >
                        {c.tradeName || c.name}
                      </span>
                      <span className="tabular block text-mini text-muted">
                        {formatCNPJ(c.document)}
                      </span>
                      <span className="block text-mini text-muted">
                        {TAX_REGIME_LABELS[c.taxRegime]}
                        {c.simplesAnnex ? ` · Anexo ${c.simplesAnnex}` : ''} · desde{' '}
                        {formatDateBR(c.contractStartDate)}
                      </span>
                    </Link>
                    {statusBadge(c)}
                  </div>
                  <div className="flex items-center justify-between gap-3 pl-12">
                    <FeeCell client={c} today={today} onOpen={() => setFeesFor(c)} />
                    {rowActions(c, 'card')}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[960px] text-body-sm">
                <thead>
                  <tr className="border-b border-border text-left text-mini font-medium text-muted">
                    <th className="px-4 py-2.5">Cliente</th>
                    <th className="px-4 py-2.5">CNPJ</th>
                    <th className="px-4 py-2.5">Regime</th>
                    <th className="px-4 py-2.5">Início do contrato</th>
                    <th className="px-4 py-2.5 text-right">Honorário vigente</th>
                    {/* "Ativos" already filters: no status column; "Todos" marks only the inactive ones,
                        "Inativos" says why and when. */}
                    {status === 'all' ? <th className="px-4 py-2.5">Situação</th> : null}
                    {status === 'inactive' ? <th className="px-4 py-2.5">Inativação</th> : null}
                    <th className="px-4 py-2.5 text-right">
                      <span className="sr-only">Ações</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data!.items.map((c) => {
                    return (
                      <tr
                        key={c.id}
                        className={cn(
                          'border-b border-border last:border-0 hover:bg-surface-muted',
                          c.status === 'inactive' && 'text-muted',
                        )}
                      >
                        <td className="px-4 py-3">
                          <Link to={clientPagePath('financeiro', c.id)} className="flex items-center gap-3 text-left">
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-mini font-bold text-primary-soft-fg">
                              {initials(c.tradeName || c.name)}
                            </span>
                            <span className="min-w-0">
                              <span
                                className={cn(
                                  'block max-w-[260px] truncate font-semibold',
                                  c.status === 'active' ? 'text-fg' : 'text-muted',
                                )}
                              >
                                {c.tradeName || c.name}
                              </span>
                              {c.tradeName ? (
                                <span className="block max-w-[260px] truncate text-mini text-muted">
                                  {c.name}
                                </span>
                              ) : null}
                            </span>
                          </Link>
                        </td>
                        <td className="tabular px-4 py-3 whitespace-nowrap text-muted">
                          {formatCNPJ(c.document)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="block whitespace-nowrap">
                            {TAX_REGIME_LABELS[c.taxRegime]}
                          </span>
                          {c.simplesAnnex ? (
                            <span className="block text-mini text-muted">Anexo {c.simplesAnnex}</span>
                          ) : null}
                        </td>
                        <td className="tabular px-4 py-3 whitespace-nowrap">
                          {formatDateBR(c.contractStartDate)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <FeeCell client={c} today={today} onOpen={() => setFeesFor(c)} align="right" />
                        </td>
                        {status === 'all' ? <td className="px-4 py-3">{c.status === 'inactive' ? statusBadge(c) : null}</td> : null}
                        {status === 'inactive' ? (
                          <td className="px-4 py-3 text-mini text-muted">
                            {c.inactivation ? (
                              <>
                                <span className="block whitespace-nowrap text-fg">{INACTIVATION_REASON_LABELS[c.inactivation.reason]}</span>
                                <span className="tabular block whitespace-nowrap">{formatDateBR(c.inactivation.date)}</span>
                              </>
                            ) : (
                              '—'
                            )}
                          </td>
                        ) : null}
                        <td className="px-4 py-2">{rowActions(c, 'table')}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {data && data.total > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-body-sm text-muted">
            <span>
              Página {page} de {totalPages}
            </span>
            <div className="flex gap-1">
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
                aria-label="Página anterior"
              >
                <ChevronLeft />
              </Button>
              <Button
                variant="outline"
                size="icon-sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
                aria-label="Próxima página"
              >
                <ChevronRight />
              </Button>
            </div>
          </div>
        ) : null}
      </Card>

      <ClientSheet
        open={sheet.open}
        client={sheet.client}
        onOpenChange={(o) => setSheet((s) => ({ ...s, open: o }))}
      />
      {contract.dialog}
      <FeesDialog client={feesFor} onClose={() => setFeesFor(null)} />
      <InactivateDialog client={toInactivate} onClose={() => setToInactivate(null)} />
      <ConfirmDialog
        open={Boolean(toReactivate)}
        onOpenChange={(o) => !o && setToReactivate(null)}
        title="Reativar cliente?"
        description={`"${toReactivate?.tradeName || toReactivate?.name}" volta para a lista de clientes ativos.`}
        confirmLabel="Reativar"
        tone="primary"
        loading={reactivate.isPending}
        onConfirm={async () => {
          try {
            await reactivate.mutateAsync(toReactivate!.id);
            toast.success('Cliente reativado');
            setToReactivate(null);
          } catch (error) {
            toastError(error);
          }
        }}
      />
      <ConfirmDialog
        open={Boolean(toDelete)}
        onOpenChange={(o) => !o && setToDelete(null)}
        title="Excluir cliente?"
        description={`"${toDelete?.tradeName || toDelete?.name}" e as vigências de honorários serão excluídos. Esta ação não pode ser desfeita.`}
        confirmLabel="Excluir"
        loading={del.isPending}
        onConfirm={async () => {
          try {
            await del.mutateAsync(toDelete!.id);
            toast.success('Cliente excluído');
            setToDelete(null);
          } catch (error) {
            toastError(error);
          }
        }}
      />
    </div>
  );
}
