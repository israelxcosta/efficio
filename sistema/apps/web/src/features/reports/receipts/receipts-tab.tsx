import { useMemo, useState } from 'react';
import { CheckCheck, Download, HandCoins, Landmark } from 'lucide-react';
import { toast } from 'sonner';
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  RECEIPTS_ITEMS_LIMIT,
  formatBRL,
  formatDateBR,
  formatPercent,
  type PaymentMethod,
  type ReceiptsGroup,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, MiniStat, MiniStatGroup } from '@/components/ui/misc';
import { Select } from '@/components/ui/select';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { useAccounts } from '@/features/accounts/api';
import { useReconcile } from '@/features/transactions/api';
import { TransactionRow } from '@/features/transactions/components/transaction-row';
import { toastError } from '@/lib/notify';
import { saveBlob } from '@/lib/api';
import { cn } from '@/lib/utils';
import { useReceiptsReport } from '../api';
import { receiptsCsv } from './receipts-csv';

type MethodKey = PaymentMethod | 'none';
type Status = '' | 'reconciled' | 'pending';
const methodLabel = (k: MethodKey) => (k === 'none' ? 'Não informado' : PAYMENT_METHOD_LABELS[k]);

/** Horizontal share bars in the chart blue (the data colour); "not informed" in grey. */
function GroupBars({ groups, onPick, showReconciled }: { groups: ReceiptsGroup[]; onPick?: (key: string | null) => void; showReconciled?: boolean }) {
  return (
    <ul className="flex flex-col gap-3">
      {groups.map((g) => (
        <li key={g.key ?? 'none'}>
          <button
            type="button"
            onClick={onPick ? () => onPick(g.key) : undefined}
            disabled={!onPick}
            className="group w-full text-left disabled:cursor-default"
            aria-label={onPick ? `Filtrar por ${g.label}` : undefined}
          >
            <span className="flex items-baseline justify-between gap-3 text-body-sm">
              <span className={cn('truncate font-medium text-fg', onPick && 'group-hover:underline')}>{g.label}</span>
              <span className="tabular shrink-0 font-semibold text-fg">
                {formatBRL(g.amount)} <span className="text-mini font-normal text-muted">· {formatPercent(g.share, 0)} · {g.count}</span>
              </span>
            </span>
            <span className="mt-1.5 block h-2 overflow-hidden rounded-full bg-bg-subtle">
              <span
                className={cn('block h-full rounded-full', g.key === null ? 'bg-chart-neutral' : 'bg-data')}
                style={{ width: `${Math.max(2, g.share * 100)}%` }}
              />
            </span>
            {showReconciled ? (
              <span className="mt-1 block text-micro text-muted">
                {g.reconciled >= g.amount ? 'Tudo conferido com o extrato' : `Conferido ${formatBRL(g.reconciled)} · falta ${formatBRL(g.amount - g.reconciled)}`}
              </span>
            ) : null}
          </button>
        </li>
      ))}
    </ul>
  );
}

/**
 * Relatórios → Recebimentos: money that came in by the day it was received (regime de caixa), per
 * payment method, account and day, to check against the bank statement. Filters by account and method;
 * the list exports to CSV.
 */
export function ReceiptsTab({ from, to }: { from: string; to: string }) {
  const [accountId, setAccountId] = useState('');
  const [method, setMethod] = useState<MethodKey | ''>('');
  const [status, setStatus] = useState<Status>('');
  const accounts = useAccounts();
  const report = useReceiptsReport({ from, to, accountId: accountId || undefined, method: method || undefined, status: status || undefined });
  const r = report.data;
  const reconcile = useReconcile();

  /** Marks (or clears) "conferido com o extrato" on the given receipts. */
  function setReconciled(ids: string[], reconciled: boolean) {
    if (!ids.length) return;
    reconcile.mutate(
      { ids, reconciled },
      {
        onSuccess: ({ updated }) => {
          if (ids.length > 1) toast.success(reconciled ? `${updated} recebimentos conferidos` : `${updated} conferências desfeitas`);
        },
        onError: (e) => toastError(e),
      },
    );
  }
  const pendingShown = (r?.items ?? []).filter((tx) => !tx.reconciledAt).map((tx) => tx.id);

  // Day table: one column per method that appears in the range, in the catalog order.
  const columns = useMemo<MethodKey[]>(() => {
    if (!r) return [];
    const present = new Set(r.days.flatMap((d) => Object.keys(d.byMethod)));
    return [...PAYMENT_METHODS, 'none' as const].filter((m) => present.has(m));
  }, [r]);

  if (report.isError) return <ErrorState error={report.error} onRetry={() => report.refetch()} />;

  function exportCsv() {
    if (!r) return;
    saveBlob(new Blob([receiptsCsv(r)], { type: 'text/csv;charset=utf-8' }), `recebimentos-${from}-a-${to}.csv`);
  }

  const filters = (
    <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
      <Select size_="sm" aria-label="Conta" value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full sm:w-auto sm:min-w-44">
        <option value="">Todas as contas</option>
        {(accounts.data ?? []).map((a) => (
          <option key={a.id} value={a.id}>
            {a.name}
          </option>
        ))}
      </Select>
      <Select size_="sm" aria-label="Forma de recebimento" value={method} onChange={(e) => setMethod(e.target.value as MethodKey | '')} className="w-full sm:w-auto sm:min-w-44">
        <option value="">Todas as formas</option>
        {[...PAYMENT_METHODS, 'none' as const].map((m) => (
          <option key={m} value={m}>
            {methodLabel(m)}
          </option>
        ))}
      </Select>
      <Select size_="sm" aria-label="Conferência com o extrato" value={status} onChange={(e) => setStatus(e.target.value as Status)} className="w-full sm:w-auto sm:min-w-40">
        <option value="">Conferidos e a conferir</option>
        <option value="pending">A conferir</option>
        <option value="reconciled">Conferidos</option>
      </Select>
      <Button variant="outline" size="toolbar" onClick={exportCsv} disabled={!r || r.items.length === 0}>
        <Download className="size-4" /> Exportar CSV
      </Button>
    </div>
  );

  return (
    <div className={cn('flex flex-col gap-5 transition-opacity', report.isPlaceholderData && 'opacity-60')}>
      {filters}

      <MiniStatGroup className="sm:grid-cols-4">
        <MiniStat label="Total recebido" value={r ? formatBRL(r.total) : '—'} amount={r?.total} hint={r ? `${r.count} recebimentos` : undefined} />
        <MiniStat
          label="Maior forma"
          value={r?.byMethod[0] ? r.byMethod[0].label : '—'}
          hint={r?.byMethod[0] ? `${formatBRL(r.byMethod[0].amount)} · ${formatPercent(r.byMethod[0].share, 0)}` : undefined}
        />
        <MiniStat
          label="Conferido com o extrato"
          value={r ? formatBRL(r.reconciled) : '—'}
          hint={r ? (r.reconciledCount < r.count ? `${r.reconciledCount} de ${r.count} · faltam ${r.count - r.reconciledCount}` : `${r.reconciledCount} de ${r.count} recebimentos`) : undefined}
          solid={Boolean(r && r.reconciledCount < r.count)}
          action={status === 'pending' ? undefined : 'Conferir'}
          onClick={status === 'pending' ? undefined : () => setStatus('pending')}
          info="Marque cada recebimento (ou o dia inteiro) depois de achá-lo no extrato do banco. Se o pagamento mudar, a marca sai sozinha."
        />
        <MiniStat
          label="Sem forma informada"
          value={r ? formatBRL(r.notInformed) : '—'}
          amount={r?.notInformed}
          tone="warning"
          info="Recebimentos sem a forma de pagamento. Informe na baixa ou no lançamento para a conferência com o extrato bater."
        />
      </MiniStatGroup>

      {r && r.count === 0 ? (
        <Card className="p-5">
          <EmptyState icon={<HandCoins />} title="Nenhum recebimento no período" description="Receitas e honorários aparecem aqui quando são marcados como recebidos." />
        </Card>
      ) : (
        <>
          <div className="grid gap-5 lg:grid-cols-2">
            <Card className="p-5">
              <CardHeader className="mb-4" title="Por forma de recebimento" info="Pela data em que o dinheiro entrou. Clique numa forma para filtrar." />
              {r ? <GroupBars groups={r.byMethod} onPick={(k) => setMethod((k ?? 'none') as MethodKey)} /> : <SkeletonRows rows={4} />}
            </Card>
            <Card className="p-5">
              <CardHeader className="mb-4" title="Por conta" info="Compare cada total com as entradas do extrato da conta no mesmo período." />
              {r ? <GroupBars groups={r.byAccount} onPick={(k) => k && setAccountId(k)} showReconciled /> : <SkeletonRows rows={3} />}
            </Card>
          </div>

          <Card className="p-5">
            <CardHeader className="mb-4" title="Dia a dia" info="Entradas de cada dia por forma de recebimento: confira linha a linha com o extrato bancário." />
            {r ? (
              <div className="-mx-1 overflow-x-auto px-1">
                <table className="w-full min-w-[560px] text-body-sm">
                  <thead>
                    <tr className="border-b border-border text-left text-caption text-muted">
                      <th className="py-2 pr-3 font-medium">Data</th>
                      {columns.map((m) => (
                        <th key={m} className="px-3 py-2 text-right font-medium">
                          {methodLabel(m)}
                        </th>
                      ))}
                      <th className="py-2 pl-3 text-right font-medium">Total do dia</th>
                      <th className="py-2 pl-3 text-right font-medium">Extrato</th>
                    </tr>
                  </thead>
                  <tbody>
                    {r.days.map((d) => (
                      <tr key={d.date} className="border-b border-border last:border-0">
                        <td className="py-2 pr-3 text-fg">{formatDateBR(d.date)}</td>
                        {columns.map((m) => (
                          <td key={m} className="tabular px-3 py-2 text-right text-fg">
                            {d.byMethod[m] ? formatBRL(d.byMethod[m]!) : <span className="text-subtle">—</span>}
                          </td>
                        ))}
                        <td className="tabular py-2 pl-3 text-right font-semibold text-fg">{formatBRL(d.total)}</td>
                        <td className="py-1.5 pl-3 text-right">
                          {d.reconciledCount >= d.count ? (
                            <span className="inline-flex items-center gap-1 text-caption font-medium text-success">
                              <CheckCheck className="size-3.5" aria-hidden /> Conferido
                            </span>
                          ) : (
                            <DayReconcileButton
                              ids={r.items.filter((tx) => tx.effectiveDate === d.date && !tx.reconciledAt).map((tx) => tx.id)}
                              label={`${d.reconciledCount}/${d.count}`}
                              pending={reconcile.isPending}
                              onReconcile={(ids) => setReconciled(ids, true)}
                            />
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t-2 border-border">
                      <td className="py-2 pr-3 font-semibold text-fg">Total</td>
                      {columns.map((m) => (
                        <td key={m} className="tabular px-3 py-2 text-right font-semibold text-fg">
                          {formatBRL(r.days.reduce((a, d) => a + (d.byMethod[m] ?? 0), 0))}
                        </td>
                      ))}
                      <td className="tabular py-2 pl-3 text-right font-semibold text-fg">{formatBRL(r.total)}</td>
                      <td className="tabular py-2 pl-3 text-right text-caption text-muted">
                        {r.reconciledCount}/{r.count}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            ) : (
              <Skeleton className="h-40" />
            )}
          </Card>

          <Card className="p-5">
            <CardHeader
              className="mb-3"
              title="Recebimentos"
              subtitle={r?.truncated ? `Mostrando os ${RECEIPTS_ITEMS_LIMIT} mais recentes; os totais cobrem o período inteiro.` : undefined}
              info="Cada recebimento com a data em que entrou, a conta e a forma. Marque a caixa quando achar o valor no extrato do banco."
              action={
                pendingShown.length > 1 ? (
                  <Button variant="outline" size="sm" disabled={reconcile.isPending} onClick={() => setReconciled(pendingShown, true)}>
                    <CheckCheck /> Conferir os {pendingShown.length} exibidos
                  </Button>
                ) : undefined
              }
            />
            {r ? (
              <div className="flex flex-col">
                {r.items.map((tx) => (
                  <div key={tx.id} className="flex items-center gap-3">
                    <Checkbox
                      checked={Boolean(tx.reconciledAt)}
                      onCheckedChange={(checked) => setReconciled([tx.id], checked)}
                      disabled={reconcile.isPending}
                      aria-label={`${tx.reconciledAt ? 'Desfazer conferência de' : 'Conferido com o extrato:'} ${tx.description}`}
                    />
                    <div className="min-w-0 flex-1">
                      <TransactionRow tx={tx} density="line" neutralAmount />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <SkeletonRows rows={5} />
            )}
          </Card>
        </>
      )}
      <p className="flex items-center gap-1.5 text-caption text-muted">
        <Landmark className="size-3.5" aria-hidden /> Regime de caixa: conta a data do recebimento, não a do vencimento. Transferências entre contas não entram.
      </p>
    </div>
  );
}

/** "Conferir o dia": marks every receipt of the day shown in the list (the list may be cut when long). */
function DayReconcileButton({ ids, label, pending, onReconcile }: { ids: string[]; label: string; pending: boolean; onReconcile: (ids: string[]) => void }) {
  if (!ids.length) return <span className="tabular text-caption text-muted">{label}</span>;
  return (
    <Button variant="ghost" size="xs" disabled={pending} onClick={() => onReconcile(ids)} aria-label={`Conferir o dia (${label} conferidos)`}>
      <CheckCheck /> Conferir dia
    </Button>
  );
}
