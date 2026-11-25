import { useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { ArrowDownLeft, ArrowUpRight, Download, FileUp, ScrollText } from 'lucide-react';
import { displayCompanyName, formatDateBR } from '@effinance/shared';
import { saveBlob } from '@/lib/api';
import { csvMoney, toCsv } from '@/lib/csv';
import { ACCOUNT_TYPE_LABELS, formatBRL, type StatementEntry } from '@effinance/shared';
import { Card } from '@/components/ui/card';
import { BankLogo } from '@/components/ui/bank-logo';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, MiniStatGroup, Money, PageHeader } from '@/components/ui/misc';
import { PeriodNavigator } from '@/components/ui/period-navigator';
import { useScreenPeriod } from '@/lib/active-month';
import { Select } from '@/components/ui/select';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { dayHeader, periodRange } from '@/lib/period';
import { useAccounts } from '@/features/accounts/api';
import { useTransactionActions } from '@/features/transactions/transaction-actions';
import { TransactionRow } from '@/features/transactions/components/transaction-row';
import { DensityToggle } from '@/components/ui/density-toggle';
import { useListDensity } from '@/lib/list-density';
import { useStatement } from '../api';
import { WriteGate } from '@/features/auth/permissions';
import { useImportActions } from '@/features/imports/import-actions';

export default function StatementPage() {
  const [params, setParams] = useSearchParams();
  const actions = useTransactionActions();
  const { openImport } = useImportActions();
  const [density] = useListDensity();
  const accountId = params.get('conta') ?? '';
  const includePending = params.get('previstos') !== '0';

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params);
    for (const [k, v] of Object.entries(patch)) {
      if (v === null || v === '') next.delete(k);
      else next.set(k, v);
    }
    setParams(next, { replace: true });
  }
  const { period, setPeriod } = useScreenPeriod(params, update);
  const range = periodRange(period);

  const accounts = useAccounts();
  const statement = useStatement({ accountId: accountId || undefined, from: range.from, to: range.to, includePending });
  const data = statement.data;

  /** The movements on screen (account, period and "previstos" as chosen) with the running balance. */
  function exportCsv() {
    if (!data) return;
    const csv = toCsv(
      ['Data', 'Descrição', 'Categoria', 'Cliente/fornecedor', 'Conta', 'Valor', 'Saldo após', 'Situação'],
      data.entries.map((e) => [
        formatDateBR(e.transaction.effectiveDate),
        e.transaction.description,
        e.transaction.category?.name ?? '',
        e.transaction.contact ? displayCompanyName(e.transaction.contact.name) : '',
        e.transaction.account?.name ?? '',
        csvMoney(e.amount),
        csvMoney(e.balanceAfter),
        e.pending ? 'Previsto' : 'Realizado',
      ]),
    );
    saveBlob(new Blob([csv], { type: 'text/csv;charset=utf-8' }), `extrato-${range.from}-a-${range.to}.csv`);
  }

  const groups = useMemo(() => {
    const map = new Map<string, StatementEntry[]>();
    for (const e of data?.entries ?? []) {
      const key = e.transaction.effectiveDate;
      const list = map.get(key) ?? [];
      list.push(e);
      map.set(key, list);
    }
    return [...map.entries()];
  }, [data]);

  const account = data?.account ?? accounts.data?.find((a) => a.id === accountId) ?? null;

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Extrato"
        actions={
          <>
            <Button variant="outline" onClick={exportCsv} disabled={!data || data.entries.length === 0}>
              <Download /> Exportar CSV
            </Button>
            <WriteGate>
              <Button variant="outline" onClick={() => openImport({ target: accountId ? { kind: 'account', accountId } : undefined })}>
                <FileUp /> Importar extrato
              </Button>
            </WriteGate>
          </>
        }
      />

      <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2.5">
            <BankLogo bank={account?.bank} color={account?.color ?? '#152B61'} size="md" />
            <Select
              value={accountId}
              onChange={(e) => update({ conta: e.target.value })}
              aria-label="Conta"
              className="h-10 min-w-[220px] font-semibold"
            >
              <option value="">Todas as contas</option>
              {(accounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                  {a.type === 'investment' ? ' (investimento)' : ''}
                </option>
              ))}
            </Select>
          </div>
          <PeriodNavigator
            value={period}
            onChange={setPeriod}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <label className="flex cursor-pointer items-center gap-2.5 text-caption font-medium text-muted">
            <Switch checked={includePending} onCheckedChange={(c) => update({ previstos: c ? null : '0' })} aria-label="Mostrar previstos" />
            Mostrar previstos
          </label>
          <DensityToggle className="max-sm:hidden" />
        </div>
      </Card>

      <MiniStatGroup className="lg:grid-cols-5">
        <BalanceTile label="Saldo inicial" value={data?.openingBalance} loading={statement.isPending} />
        <BalanceTile label="Entradas" value={data?.totalIn} loading={statement.isPending} tone="income" icon={<ArrowDownLeft />} hint={data?.pendingIn ? `+ ${formatBRL(data.pendingIn)} previsto` : undefined} />
        <BalanceTile label="Saídas" value={data ? -data.totalOut : undefined} loading={statement.isPending} tone="expense" icon={<ArrowUpRight />} hint={data?.pendingOut ? `- ${formatBRL(data.pendingOut)} previsto` : undefined} />
        <BalanceTile label="Saldo final" value={data?.closingBalance} loading={statement.isPending} strong />
        <BalanceTile label="Saldo previsto" value={data?.projectedClosingBalance} loading={statement.isPending} hint="Inclui pendentes do período" className="col-span-2 lg:col-span-1" />
      </MiniStatGroup>

      <Card className="overflow-hidden">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-title-sm font-semibold">{account ? account.name : 'Todas as contas'}</h2>
            <p className="text-mini text-muted">
              {account ? ACCOUNT_TYPE_LABELS[account.type] : 'Contas incluídas no saldo total (sem investimentos)'}
            </p>
          </div>
          {data ? <span className="text-mini text-muted">{data.entries.length} movimentações</span> : null}
        </div>
        <div className="p-1.5">
          {statement.isPending ? (
            <SkeletonRows rows={7} className="p-3" />
          ) : statement.isError ? (
            <ErrorState error={statement.error} onRetry={() => statement.refetch()} className="m-3" />
          ) : groups.length === 0 ? (
            <EmptyState
              className="m-3"
              icon={<ScrollText />}
              title="Sem movimentações neste período"
              description="Lançamentos pagos e previstos desta conta aparecerão aqui com o saldo dia a dia."
              action={
                <div className="flex flex-wrap justify-center gap-2">
                  <WriteGate>
                    <Button variant="outline" onClick={() => actions.openTransaction({ type: 'expense', defaults: accountId ? { source: `account:${accountId}` } : undefined })}>
                      Adicionar lançamento
                    </Button>
                  </WriteGate>
                  <WriteGate>
                    <Button variant="ghost" onClick={() => openImport({ target: accountId ? { kind: 'account', accountId } : undefined })}>
                      <FileUp /> Importar arquivo OFX/CSV
                    </Button>
                  </WriteGate>
                </div>
              }
            />
          ) : (
            <div data-density={density} className={cn(statement.isPlaceholderData && 'opacity-60 transition-opacity')}>
              {groups.map(([date, entries]) => {
                const last = entries[entries.length - 1]!;
                return (
                  <section key={date} aria-label={dayHeader(date)}>
                    <div className="sticky top-[72px] z-[1] flex items-center justify-between bg-surface/95 px-4 pt-4 pb-2 backdrop-blur">
                      <span className="eyebrow text-muted">{dayHeader(date)}</span>
                      <span className="text-mini text-muted">
                        Saldo do dia <span className="tabular font-semibold text-fg">{formatBRL(last.balanceAfter)}</span>
                      </span>
                    </div>
                    {entries.map((e) => (
                      <TransactionRow
                        key={e.transaction.id}
                        tx={e.transaction}
                        amount={e.amount}
                        showDue={false}
                        muted={e.pending}
                        trailing={
                          <p className="tabular text-micro text-subtle">
                            {e.pending ? 'previsto · ' : ''}
                            {formatBRL(e.balanceAfter)}
                          </p>
                        }
                      />
                    ))}
                  </section>
                );
              })}
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function BalanceTile({
  label,
  value,
  loading,
  tone,
  icon,
  hint,
  strong,
  className,
}: {
  label: string;
  value: number | undefined;
  loading?: boolean;
  tone?: 'income' | 'expense';
  icon?: React.ReactNode;
  hint?: string;
  strong?: boolean;
  className?: string;
}) {
  return (
    // A cell of the page's KPI group (same anatomy as `MiniStat`); the closing balance is the bold one.
    <div className={cn('min-w-0 bg-surface px-4 py-3 sm:px-5 sm:py-4', className)}>
      <p className="flex items-center gap-1.5 text-caption font-medium text-muted [&_svg]:size-3.5">
        {icon ? <span className={tone === 'income' ? 'text-success' : 'text-danger'}>{icon}</span> : null}
        {label}
      </p>
      {loading || value === undefined ? (
        <Skeleton className="mt-2 h-6 w-28 sm:h-7" />
      ) : (
        // Zero is grey; in/out colours stay (the statement is a mixed list).
        <Money
          value={value}
          signed={tone !== undefined || value < 0}
          tone={value === 0 ? 'neutral' : undefined}
          className={cn('mt-1 block text-lg leading-tight tracking-tight sm:mt-1.5 sm:text-kpi', strong && 'font-bold', value === 0 && 'text-subtle')}
        />
      )}
      {hint ? <p className="mt-1 text-caption text-muted">{hint}</p> : null}
    </div>
  );
}
