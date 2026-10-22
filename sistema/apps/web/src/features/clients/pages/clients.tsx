import { useEffect, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import {
  Building2,
  ChevronLeft,
  ChevronRight,
  Eye,
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
import { cn, initials } from '@/lib/utils';
import { useClient, useClients, useDeleteClient, useReactivateClient } from '../api';
import { ClientDetailsDialog } from '../client-details-dialog';
import { ClientSheet } from '../client-sheet';
import { ClientsSummary } from '../clients-summary';
import { FeesDialog } from '../fees-dialog';
import { InactivateDialog } from '../inactivate-dialog';

const PAGE_SIZE = 25;

type StatusFilter = ClientStatus | 'all';

/** Icon button of a row, with its name in a tooltip (and the reason when it is blocked). */
function RowAction({
  label,
  icon,
  onClick,
  blockedReason,
  tone = 'neutral',
}: {
  label: string;
  icon: ReactNode;
  onClick: () => void;
  blockedReason?: string | null;
  tone?: 'neutral' | 'danger' | 'success';
}) {
  const button = (
    <button
      type="button"
      aria-label={label}
      disabled={Boolean(blockedReason)}
      onClick={onClick}
      className={cn(
        'flex size-8 items-center justify-center rounded-md text-muted transition-colors disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4',
        tone === 'neutral' && 'hover:bg-bg-subtle hover:text-fg',
        tone === 'danger' && 'hover:bg-danger-soft hover:text-danger',
        tone === 'success' && 'hover:bg-success-soft hover:text-success',
      )}
    >
      {icon}
    </button>
  );
  return (
    <Tooltip content={blockedReason ?? label}>
      {blockedReason ? (
        <span
          tabIndex={0}
          className="inline-flex cursor-not-allowed rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25"
        >
          {button}
        </span>
      ) : (
        button
      )}
    </Tooltip>
  );
}

function FeeCell({ client, today, onOpen }: { client: Client; today: string; onOpen: () => void }) {
  const fee = client.currentFee;
  if (fee) {
    return (
      <button
        type="button"
        onClick={onOpen}
        className="text-left"
        aria-label={`Honorários de ${client.name}`}
      >
        <span className="tabular block font-semibold text-fg">{formatBRL(fee.amount)}</span>
        <span className="tabular block text-[11px] text-muted">
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
  const [params, setParams] = useSearchParams();
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('active');
  const [regime, setRegime] = useState<TaxRegime | ''>('');
  const [page, setPage] = useState(1);
  const [sheet, setSheet] = useState<{ open: boolean; client?: Client | null }>({ open: false });
  const [viewingId, setViewingId] = useState<string | null>(null);
  const [feesFor, setFeesFor] = useState<Client | null>(null);
  const [toInactivate, setToInactivate] = useState<Client | null>(null);
  const [toReactivate, setToReactivate] = useState<Client | null>(null);
  const [toDelete, setToDelete] = useState<Client | null>(null);
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
  // Always fresh (refetched after edits, inactivation, new fees) while the "Consultar" view is open.
  const viewing = useClient(viewingId);

  // Deep link from the command palette: /clientes?consultar=<id>
  const viewParam = params.get('consultar');
  useEffect(() => {
    if (isUuid(viewParam)) {
      setViewingId(viewParam);
      const next = new URLSearchParams(params);
      next.delete('consultar');
      setParams(next, { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewParam]);

  const data = clients.data;
  const summary = data?.summary;

  // Same buttons in the table (desktop) and in the cards (mobile).
  const actions = (c: Client) => (
    <div className="flex items-center justify-end gap-0.5">
      <RowAction label="Consultar cadastro" icon={<Eye />} onClick={() => setViewingId(c.id)} />
      <RowAction
        label="Editar cadastro"
        icon={<Pencil />}
        blockedReason={readOnlyReason}
        onClick={() => setSheet({ open: true, client: c })}
      />
      <RowAction
        label="Honorários e taxa por empregado"
        icon={<HandCoins />}
        onClick={() => setFeesFor(c)}
      />
      {c.status === 'active' ? (
        <RowAction
          label="Inativar"
          icon={<UserX />}
          tone="danger"
          blockedReason={readOnlyReason}
          onClick={() => setToInactivate(c)}
        />
      ) : (
        <RowAction
          label="Reativar"
          icon={<UserCheck />}
          tone="success"
          blockedReason={readOnlyReason}
          onClick={() => setToReactivate(c)}
        />
      )}
      <RowAction
        label="Excluir"
        icon={<Trash2 />}
        tone="danger"
        blockedReason={
          readOnlyReason ??
          (c.transactionCount > 0
            ? 'Cliente com lançamentos vinculados não pode ser excluído. Use "Inativar".'
            : null)
        }
        onClick={() => setToDelete(c)}
      />
    </div>
  );

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
        overline="Cadastros"
        title="Clientes"
        description="Empresas atendidas pelo escritório: contrato, regime tributário e honorários."
        actions={
          <WriteGate>
            <Button onClick={openNew}>
              <Plus /> Novo cliente
            </Button>
          </WriteGate>
        }
      />

      {clients.isError && !summary ? null : <ClientsSummary summary={summary} />}

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
            <span className="ml-auto text-xs text-muted">{data.total} cliente(s)</span>
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
                <li key={c.id} className="flex flex-col gap-3 p-4">
                  <div className="flex items-start gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-fg">
                      {initials(c.tradeName || c.name)}
                    </span>
                    <button
                      type="button"
                      className="min-w-0 flex-1 text-left"
                      onClick={() => setViewingId(c.id)}
                    >
                      <span
                        className={cn(
                          'block truncate font-semibold',
                          c.status === 'active' ? 'text-fg' : 'text-muted',
                        )}
                      >
                        {c.tradeName || c.name}
                      </span>
                      <span className="tabular block text-xs text-muted">
                        {formatCNPJ(c.document)}
                      </span>
                      <span className="block text-xs text-muted">
                        {TAX_REGIME_LABELS[c.taxRegime]}
                        {c.simplesAnnex ? ` · Anexo ${c.simplesAnnex}` : ''} · desde{' '}
                        {formatDateBR(c.contractStartDate)}
                      </span>
                    </button>
                    {statusBadge(c)}
                  </div>
                  <div className="flex items-center justify-between gap-2 pl-12">
                    <FeeCell client={c} today={today} onOpen={() => setFeesFor(c)} />
                    {actions(c)}
                  </div>
                </li>
              ))}
            </ul>
            <div className="hidden overflow-x-auto md:block">
              <table className="w-full min-w-[1000px] text-sm">
                <thead>
                  <tr className="border-b border-border bg-surface-muted text-left text-[11px] font-semibold tracking-wide text-muted uppercase">
                    <th className="px-4 py-2.5">Cliente</th>
                    <th className="px-4 py-2.5">CNPJ</th>
                    <th className="px-4 py-2.5">Regime</th>
                    <th className="px-4 py-2.5">Início do contrato</th>
                    <th className="px-4 py-2.5">Honorário vigente</th>
                    <th className="px-4 py-2.5">Situação</th>
                    <th className="px-4 py-2.5 text-right">Ações</th>
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
                          <button
                            type="button"
                            className="flex items-center gap-3 text-left"
                            onClick={() => setViewingId(c.id)}
                          >
                            <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-fg">
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
                                <span className="block max-w-[260px] truncate text-xs text-muted">
                                  {c.name}
                                </span>
                              ) : null}
                            </span>
                          </button>
                        </td>
                        <td className="tabular px-4 py-3 whitespace-nowrap text-muted">
                          {formatCNPJ(c.document)}
                        </td>
                        <td className="px-4 py-3">
                          <span className="block whitespace-nowrap">
                            {TAX_REGIME_LABELS[c.taxRegime]}
                          </span>
                          {c.simplesAnnex ? (
                            <span className="block text-xs text-muted">Anexo {c.simplesAnnex}</span>
                          ) : null}
                        </td>
                        <td className="tabular px-4 py-3 whitespace-nowrap">
                          {formatDateBR(c.contractStartDate)}
                        </td>
                        <td className="px-4 py-3">
                          <FeeCell client={c} today={today} onOpen={() => setFeesFor(c)} />
                        </td>
                        <td className="px-4 py-3">{statusBadge(c)}</td>
                        <td className="px-4 py-3">{actions(c)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
        )}
        {data && data.total > PAGE_SIZE ? (
          <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted">
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
      <ClientDetailsDialog
        client={viewingId ? (viewing.data ?? null) : null}
        onClose={() => setViewingId(null)}
        onEdit={(c) => {
          setViewingId(null);
          setSheet({ open: true, client: c });
        }}
        onFees={(c) => {
          setViewingId(null);
          setFeesFor(c);
        }}
      />
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
