import type { ReactNode } from 'react';
import { Link } from 'react-router';
import { Building2, ClipboardCheck, FileClock, Wallet } from 'lucide-react';
import {
  DASHBOARD_DOCUMENT_SITUATIONS,
  formatBRL,
  formatDateBR,
  TAX_REGIME_LABELS,
  type ClientOverviewStatus,
  type DashboardDocumentSituation,
  type TaskDashboardResponse,
} from '@effinance/shared';
import { EmptyState } from '@/components/ui/empty-state';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { usePermissions } from '@/features/auth/permissions';
import { DocumentDeadlineRow } from '@/features/deadlines/components/deadlines-sheet';
import { deadlineLabel } from '@/features/deadlines/deadline-logic';
import { cn, pluralize } from '@/lib/utils';
import { monthName } from './tasks-summary';
import { documentBands, documentsOf, feeBands, feesOf, incompleteText, overviewBands, toDocumentDeadline, type FeeBandKey } from '../dashboard-logic';

/** What a band of a card opens (null band: every item of the card). */
export type DashboardList =
  | { kind: 'certificates' | 'documents'; band: DashboardDocumentSituation | null }
  | { kind: 'fees'; band: FeeBandKey | null }
  | { kind: 'clients'; band: ClientOverviewStatus | null }
  | { kind: 'incomplete' };

const ALL = '';
const rowClass = 'group flex min-h-[52px] items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-surface-muted';

/**
 * The list behind a band of an Início card (Effy's "openLaudosListModal"): the documents (the rows of
 * the deadlines sheet, with their actions), the fees about to end, the clients of an overview band or
 * the incomplete registries. A select switches the band without closing.
 */
export function DashboardListSheet({ list, data, onChange }: { list: DashboardList | null; data: TaskDashboardResponse | undefined; onChange: (l: DashboardList | null) => void }) {
  const open = list !== null && data !== undefined;
  let title = '';
  let description = '';
  let extra: ReactNode = null;
  let body: ReactNode = null;

  if (list && data) {
    if (list.kind === 'certificates' || list.kind === 'documents') {
      const docs = list.kind === 'certificates' ? data.certificates : data.documents;
      const items = documentsOf(docs, list.band);
      const bands = documentBands({ counts: docs.counts });
      title = list.kind === 'certificates' ? 'Certificados digitais' : 'Laudos e documentos';
      description = `${pluralize(items.length, 'item', 'itens')}${list.band ? ` · ${bands.find((b) => b.key === list.band)?.label ?? ''}` : ' · todas as situações'}`;
      extra = (
        <Select size_="sm" aria-label="Situação" value={list.band ?? ALL} onChange={(e) => onChange({ kind: list.kind, band: (e.target.value || null) as DashboardDocumentSituation | null })}>
          <option value={ALL}>Todas as situações ({docs.total})</option>
          {DASHBOARD_DOCUMENT_SITUATIONS.map((s) => (
            <option key={s} value={s}>
              {documentBands({ counts: { ...docs.counts, noDate: Math.max(1, docs.counts.noDate) } }).find((b) => b.key === s)?.label} ({docs.counts[s]})
            </option>
          ))}
        </Select>
      );
      body = items.length ? (
        <ul className="flex flex-col">
          {items.map((d) => (
            <DocumentDeadlineRow key={d.id} doc={toDocumentDeadline(d)} today={data.today} />
          ))}
          {docs.truncated ? <li className="px-3 pt-2 text-caption text-muted">Mostrando os primeiros 500. Os demais aparecem na ficha de cada cliente.</li> : null}
        </ul>
      ) : (
        <EmptyState icon={<FileClock />} title="Nenhum item nesta situação." />
      );
    } else if (list.kind === 'fees' && data.fees) {
      const items = feesOf(data.fees, list.band);
      title = 'Honorários próximos de vencer';
      description = `${pluralize(items.length, 'cliente', 'clientes')} · vigência anual a partir do início do contrato`;
      extra = (
        <Select size_="sm" aria-label="Situação" value={list.band ?? ALL} onChange={(e) => onChange({ kind: 'fees', band: (e.target.value || null) as FeeBandKey | null })}>
          <option value={ALL}>Todas</option>
          {feeBands(data.fees).map((b) => (
            <option key={b.key} value={b.key}>
              {b.label} ({b.count})
            </option>
          ))}
        </Select>
      );
      body = items.length ? (
        <ul className="flex flex-col">
          {items.map((f) => (
            <li key={f.client.id}>
              <Link to={`/clientes?consultar=${f.client.id}`} className={rowClass}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{f.client.name}</span>
                  <span className="block truncate text-xs text-muted">
                    {TAX_REGIME_LABELS[f.taxRegime]} · vigência até {formatDateBR(f.periodEnd)}
                  </span>
                </span>
                <span className="flex shrink-0 flex-col items-end text-right">
                  <span className="tabular text-[13px] font-medium text-fg">{formatBRL(f.monthlyAmount)}</span>
                  <span className={cn('text-xs', f.days < 0 ? 'font-semibold text-danger' : f.days <= 30 ? 'font-medium text-warning' : 'text-muted')}>
                    {f.days < 0 ? `Encerrou há ${pluralize(-f.days, 'dia', 'dias')}` : deadlineLabel({ days: f.days })}
                  </span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Wallet />} title="Nenhum honorário nesta situação." />
      );
    } else if (list.kind === 'clients') {
      const items = data.clientsOverview.items.filter((c) => !list.band || c.status === list.band);
      title = 'Visão geral dos clientes';
      description = `${pluralize(items.length, 'cliente', 'clientes')} · obrigações de ${monthName(data.month)}`;
      extra = (
        <Select size_="sm" aria-label="Situação" value={list.band ?? ALL} onChange={(e) => onChange({ kind: 'clients', band: (e.target.value || null) as ClientOverviewStatus | null })}>
          <option value={ALL}>Todos</option>
          {overviewBands(data.clientsOverview.counts).map((b) => (
            <option key={b.key} value={b.key}>
              {b.label} ({b.count})
            </option>
          ))}
        </Select>
      );
      body = items.length ? (
        <ul className="flex flex-col">
          {items.map((c) => (
            <li key={c.client.id}>
              <Link to={`/tarefas/auditoria?${new URLSearchParams({ competencia: data.month, busca: c.client.name })}`} className={rowClass}>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-fg">{c.client.name}</span>
                  <span className="block truncate text-xs text-muted">{TAX_REGIME_LABELS[c.client.taxRegime]}</span>
                </span>
                <span className="flex shrink-0 flex-col items-end text-right text-xs">
                  <span className="tabular text-[13px] font-medium text-fg">{c.pending ? pluralize(c.pending, 'pendente', 'pendentes') : 'Em dia'}</span>
                  {c.overdue ? <span className="font-semibold text-danger">{pluralize(c.overdue, 'atrasada', 'atrasadas')}</span> : null}
                </span>
                <ClipboardCheck className="size-4 shrink-0 text-subtle" aria-hidden />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState icon={<Building2 />} title="Nenhum cliente nesta situação." />
      );
    } else if (list.kind === 'incomplete' && data.incomplete) {
      const items = data.incomplete.items;
      title = 'Cadastro incompleto';
      description = `${pluralize(data.incomplete.count, 'cliente', 'clientes')} · média de ${data.incomplete.averagePercent}% preenchido`;
      body = items.length ? <IncompleteRows items={items} /> : <EmptyState icon={<Building2 />} title="Todos os cadastros estão completos." />;
    }
  }

  return (
    <Sheet open={open} onOpenChange={(o) => !o && onChange(null)} title={title} description={description} headerExtra={extra}>
      {body}
    </Sheet>
  );
}

function IncompleteRows({ items }: { items: NonNullable<TaskDashboardResponse['incomplete']>['items'] }) {
  const canFinance = usePermissions().can('finance');
  return (
    <ul className="flex flex-col">
      {items.map((c) => (
        <li key={c.client.id}>
          <Link to={canFinance ? `/clientes?editar=${c.client.id}` : `/tarefas/clientes?cliente=${c.client.id}`} className={rowClass}>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-semibold text-fg">{c.client.name}</span>
              <span className="block truncate text-xs text-muted">{incompleteText(c)}</span>
            </span>
            <span className="flex w-24 shrink-0 flex-col items-end gap-1">
              <span className="tabular text-[13px] font-medium text-fg">{c.percent}%</span>
              <span className="block h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                <span className="block h-full rounded-full bg-data" style={{ width: `${c.percent}%` }} />
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
