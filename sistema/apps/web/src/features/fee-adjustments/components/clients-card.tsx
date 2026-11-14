import type { ReactNode } from 'react';
import { CalendarSync, TriangleAlert } from 'lucide-react';
import {
  FEE_ADJUSTMENT_STATUS_LABELS,
  formatBRL,
  formatDateBR,
  formatMonthKey,
  type FeeAdjustmentPreviewItem,
  type FeeAdjustmentPreviewResponse,
  type FeeAdjustmentStatus,
  type FeeAdjustmentValues,
  type MonthKey,
} from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState } from '@/components/ui/misc';
import { SkeletonRows } from '@/components/ui/skeleton';
import { WriteGate } from '@/features/auth/permissions';
import { cn, pluralize } from '@/lib/utils';
import { adjustedValues, monthInSentence, monthSummary, type SelectionTotals } from '../logic';

const STATUS_TONE: Record<FeeAdjustmentStatus, 'neutral' | 'success' | 'warning'> = {
  ready: 'neutral',
  already_adjusted: 'success',
  no_previous_fee: 'warning',
};

/** "Pronto" in the list (the full label stays in the constants for the API texts). */
const STATUS_SHORT: Record<FeeAdjustmentStatus, string> = {
  ready: 'Pronto',
  already_adjusted: FEE_ADJUSTMENT_STATUS_LABELS.already_adjusted,
  no_previous_fee: FEE_ADJUSTMENT_STATUS_LABELS.no_previous_fee,
};

interface ClientsCardProps {
  month: MonthKey;
  preview: {
    data: FeeAdjustmentPreviewResponse | undefined;
    isPending: boolean;
    isError: boolean;
    error: unknown;
    isPlaceholderData: boolean;
    refetch: () => unknown;
  };
  selected: ReadonlySet<string>;
  onSelectedChange: (ids: Set<string>) => void;
  appliedBps: number;
  adjustEmployeeFee: boolean;
  totals: SelectionTotals;
  /** Why the inputs of step 1 block the batch (null when they are fine). */
  blockedReason: string | null;
  onApply: () => void;
  onMonthChange: (month: MonthKey) => void;
  nextMonth: MonthKey;
}

/** What one row shows: the values of the period of the month, now and adjusted (or as registered). */
function rowValues(item: FeeAdjustmentPreviewItem, bps: number, adjustEmployeeFee: boolean): { from: FeeAdjustmentValues | null; to: FeeAdjustmentValues | null } {
  if (item.status === 'already_adjusted') return { from: item.current, to: item.registered };
  if (item.status === 'ready' && item.current) return { from: item.current, to: adjustedValues(item.current, bps, adjustEmployeeFee) };
  return { from: null, to: null };
}

function Change({ from, to, kept }: { from: number | undefined; to: number | undefined; kept?: boolean }) {
  if (to === undefined) return <span className="text-subtle">—</span>;
  if (from === undefined) return <span className="font-semibold text-fg">{formatBRL(to)}</span>;
  if (from === 0 && to === 0) return <span className="text-subtle">Sem taxa</span>;
  return (
    <span className="whitespace-nowrap">
      <span className="text-muted">{formatBRL(from)}</span>
      <span className="px-1.5 text-subtle" aria-hidden>
        →
      </span>
      <span className="sr-only"> para </span>
      <span className="font-semibold text-fg">{formatBRL(to)}</span>
      {kept ? <span className="ml-1 text-xs text-muted">(mantida)</span> : null}
    </span>
  );
}

function NoticeLine({ item }: { item: FeeAdjustmentPreviewItem }) {
  if (item.status !== 'ready') return null;
  return item.noticeLate ? (
    <span className="flex items-center gap-1 text-xs font-medium text-danger">
      <TriangleAlert className="size-3.5 shrink-0" aria-hidden />
      Prazo do aviso já passou ({formatDateBR(item.noticeDeadline)})
    </span>
  ) : (
    <span className="text-xs text-muted">Aviso até {formatDateBR(item.noticeDeadline)}</span>
  );
}

function StatusCell({ item }: { item: FeeAdjustmentPreviewItem }) {
  const hint =
    item.status === 'already_adjusted'
      ? item.registered?.adjustmentId
        ? 'por um reajuste em lote'
        : 'cadastrada à mão'
      : item.status === 'no_previous_fee'
        ? 'cadastre a vigência anterior'
        : null;
  return (
    <span className="flex flex-col items-start gap-0.5">
      <Badge tone={STATUS_TONE[item.status]}>{STATUS_SHORT[item.status]}</Badge>
      {hint ? <span className="text-xs text-muted">{hint}</span> : null}
    </span>
  );
}

const period = (item: FeeAdjustmentPreviewItem) => `${formatDateBR(item.period.startDate)} a ${formatDateBR(item.period.endDate)}`;

/** Step 2: the clients whose period starts in the month, the selection and "Aplicar reajuste". */
export function ClientsCard(props: ClientsCardProps) {
  const { month, preview, selected, appliedBps, adjustEmployeeFee, totals } = props;
  const data = preview.data;
  const items = data?.items ?? [];
  const ready = items.filter((i) => i.status === 'ready');
  const checkedCount = ready.filter((i) => selected.has(i.clientId)).length;
  const late = ready.filter((i) => i.noticeLate).length;
  const busy = preview.isPlaceholderData;
  const monthLabel = monthInSentence(formatMonthKey(month));

  const toggle = (id: string, on: boolean) => {
    const next = new Set(selected);
    if (on) next.add(id);
    else next.delete(id);
    props.onSelectedChange(next);
  };
  const toggleAll = (on: boolean) => props.onSelectedChange(on ? new Set(ready.map((i) => i.clientId)) : new Set());
  const allState: boolean | 'indeterminate' = checkedCount === 0 ? false : checkedCount === ready.length ? true : 'indeterminate';

  const check = (item: FeeAdjustmentPreviewItem) => (
    <Checkbox
      checked={item.status === 'ready' && selected.has(item.clientId)}
      onCheckedChange={(on) => toggle(item.clientId, on)}
      disabled={item.status !== 'ready' || busy}
      aria-label={item.status === 'ready' ? `Reajustar ${item.name}` : `${item.name}: ${FEE_ADJUSTMENT_STATUS_LABELS[item.status]}`}
    />
  );

  let body: ReactNode;
  if (!data && preview.isPending) {
    body = <SkeletonRows rows={4} className="p-4" />;
  } else if (preview.isError && !data) {
    body = <ErrorState error={preview.error} onRetry={() => preview.refetch()} className="m-4" />;
  } else if (items.length === 0) {
    body = (
      <EmptyState
        className="m-4"
        icon={<CalendarSync />}
        title={`Nenhum contrato renova em ${monthLabel}`}
        description="Entram aqui os clientes ativos cujo contrato começou neste mês de um ano anterior."
        action={
          <Button variant="outline" onClick={() => props.onMonthChange(props.nextMonth)}>
            Ver {monthInSentence(formatMonthKey(props.nextMonth))}
          </Button>
        }
      />
    );
  } else {
    body = (
      <div className={cn('transition-opacity', busy && 'opacity-60')} aria-busy={busy || undefined}>
        <ul className="divide-y divide-border @3xl:hidden" aria-label={`Clientes com vigência em ${monthLabel}`}>
          {items.map((item) => {
            const values = rowValues(item, appliedBps, adjustEmployeeFee);
            return (
              <li key={item.clientId} className="flex gap-3 p-4">
                <span className="pt-0.5">{check(item)}</span>
                <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-fg">{item.name}</span>
                      {item.legalName !== item.name ? <span className="block truncate text-xs text-muted">{item.legalName}</span> : null}
                    </span>
                    <Badge tone={STATUS_TONE[item.status]} className="shrink-0">
                      {STATUS_SHORT[item.status]}
                    </Badge>
                  </div>
                  <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1 text-[13px]">
                    <dt className="text-muted">Vigência</dt>
                    <dd className="tabular">{period(item)}</dd>
                    <dt className="text-muted">Honorário</dt>
                    <dd className="tabular">
                      <Change from={values.from?.amount} to={values.to?.amount} />
                    </dd>
                    <dt className="text-muted">Por empregado</dt>
                    <dd className="tabular">
                      <Change from={values.from?.employeeFee} to={values.to?.employeeFee} kept={item.status === 'ready' && !adjustEmployeeFee} />
                    </dd>
                  </dl>
                  <NoticeLine item={item} />
                  {item.status === 'no_previous_fee' ? <span className="text-xs text-muted">Cadastre a vigência anterior para reajustar.</span> : null}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="hidden @3xl:block">
          <table className="w-full text-sm">
            <caption className="sr-only">Clientes com vigência começando em {monthLabel}</caption>
            <thead>
              <tr className="border-b border-border text-left text-xs font-medium text-muted">
                <th scope="col" className="w-12 py-2.5 pr-2 pl-4">
                  <Checkbox checked={allState} onCheckedChange={toggleAll} disabled={ready.length === 0 || busy} aria-label="Selecionar todos os prontos" />
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Cliente
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Nova vigência
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Honorário (atual → novo)
                </th>
                <th scope="col" className="px-3 py-2.5">
                  Por empregado
                </th>
                <th scope="col" className="py-2.5 pr-4 pl-3">
                  Situação
                </th>
              </tr>
            </thead>
            <tbody>
              {items.map((item) => {
                const values = rowValues(item, appliedBps, adjustEmployeeFee);
                return (
                  <tr key={item.clientId} className={cn('border-b border-border align-top last:border-0', item.status !== 'ready' && 'bg-surface-muted/40')}>
                    <td className="py-3 pr-2 pl-4">{check(item)}</td>
                    <td className="max-w-[280px] px-3 py-3">
                      <span className="block truncate font-semibold text-fg" title={item.name}>
                        {item.name}
                      </span>
                      {item.legalName !== item.name ? (
                        <span className="block truncate text-xs text-muted" title={item.legalName}>
                          {item.legalName}
                        </span>
                      ) : null}
                    </td>
                    <td className="px-3 py-3">
                      <span className="block whitespace-nowrap tabular">{period(item)}</span>
                      <NoticeLine item={item} />
                    </td>
                    <td className="px-3 py-3 tabular">
                      <Change from={values.from?.amount} to={values.to?.amount} />
                    </td>
                    <td className="px-3 py-3 tabular">
                      <Change from={values.from?.employeeFee} to={values.to?.employeeFee} kept={item.status === 'ready' && !adjustEmployeeFee} />
                    </td>
                    <td className="py-3 pr-4 pl-3">
                      <StatusCell item={item} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

  return (
    <Card className="@container overflow-hidden">
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border p-5">
        <div className="min-w-0">
          <h2 className="text-title-sm font-semibold tracking-tight text-fg">2. Clientes com vigência em {monthLabel}</h2>
          <p className="mt-0.5 text-xs text-muted">
            {data && items.length ? monthSummary(items) : 'Contratos que completam mais um ano no mês.'}
            {late ? <span className="font-medium text-danger"> · {late} com o prazo do aviso vencido</span> : null}
          </p>
        </div>
        {ready.length > 0 ? (
          <label className="flex items-center gap-2 text-[13px] font-medium text-fg @3xl:hidden">
            <Checkbox checked={allState} onCheckedChange={toggleAll} disabled={busy} />
            Todos os prontos
          </label>
        ) : null}
      </div>

      {body}

      {ready.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-surface-muted/50 p-4">
          <div className="min-w-0 text-sm" aria-live="polite">
            {totals.count === 0 ? (
              <span className="text-muted">Nenhum cliente selecionado.</span>
            ) : (
              <>
                <span className="font-semibold text-fg">
                  {totals.count} de {pluralize(ready.length, 'pronto', 'prontos')}
                </span>
                <span className="text-muted"> · honorários </span>
                <span className="whitespace-nowrap tabular">
                  {formatBRL(totals.current)} → <strong className="font-semibold text-fg">{formatBRL(totals.proposed)}</strong> por mês
                </span>
                {totals.proposed > totals.current ? <span className="text-muted tabular"> (+{formatBRL(totals.proposed - totals.current)})</span> : null}
              </>
            )}
            {props.blockedReason ? <p className="mt-0.5 text-xs font-medium text-danger">{props.blockedReason}</p> : null}
          </div>
          <WriteGate>
            <Button onClick={props.onApply} disabled={totals.count === 0 || props.blockedReason !== null || busy}>
              Aplicar reajuste
            </Button>
          </WriteGate>
        </div>
      ) : null}
    </Card>
  );
}
