import { useState, type ReactNode } from 'react';
import { Popover } from 'radix-ui';
import { formatBRL, INACTIVATION_REASON_LABELS, type MonthKey } from '@effinance/shared';
import { Card, CardHeader } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import { monthName, signedCount, signedMoney, type EvolutionRow } from './evolution-logic';

const MOBILE_ROWS = 6;
const percent = (ratio: number) => `${Math.round(ratio * 100)}%`;
const money = (cents: number) => (cents === 0 ? '—' : formatBRL(cents));
const changeTone = (n: number) => (n > 0 ? 'text-success' : n < 0 ? 'text-danger' : 'text-muted');

/**
 * "Mês a mês" (spec §4.3): a semantic table, newest first, each row against the one below (the oldest
 * shows "—" in the changes); the reference month is highlighted and a row click makes it the reference.
 * Novos/Encerrados open the names. Below `md` it becomes a list by month.
 */
export function EvolutionTableView({ rows, active, onPick, className }: { rows: readonly EvolutionRow[]; active: MonthKey; onPick: (month: MonthKey) => void; className?: string }) {
  const [all, setAll] = useState(false);
  const mobileRows = all ? rows : rows.slice(0, MOBILE_ROWS);
  return (
    <Card className={cn('overflow-hidden print:break-inside-avoid', className)}>
      <div className="p-4 sm:p-5">
        <CardHeader
          title="Mês a mês"
          subtitle="Mais recente primeiro · cada linha comparada ao mês anterior · clique em Novos ou Encerrados para ver os nomes"
          info="Ativos, novos e encerrados pela data de início do contrato e pela data de inativação; honorário mensal pela vigência do último dia do mês (ou de hoje, no mês corrente). Faturado pelo vencimento; recebido pela data do pagamento, com juros e multa."
        />
      </div>

      <div className="hidden md:block print:block">
        <table className="w-full text-body-sm">
          <caption className="sr-only">Evolução da carteira mês a mês</caption>
          <thead>
            <tr className="border-y border-border bg-surface-muted text-right text-caption font-medium text-muted">
              <th scope="col" className="px-4 py-2 text-left font-medium">Mês</th>
              <th scope="col" className="px-3 py-2 font-medium">Ativos</th>
              <th scope="col" className="px-3 py-2 font-medium">Novos</th>
              <th scope="col" className="px-3 py-2 font-medium">Encerrados</th>
              <th scope="col" className="px-3 py-2 font-medium">Variação</th>
              <th scope="col" className="px-3 py-2 font-medium">Honorário mensal</th>
              <th scope="col" className="px-3 py-2 font-medium">Δ honorário</th>
              <th scope="col" className="hidden px-3 py-2 font-medium lg:table-cell">Ticket médio</th>
              <th scope="col" className="px-3 py-2 font-medium">Faturado</th>
              <th scope="col" className="px-3 py-2 font-medium">Recebido</th>
              <th scope="col" className="px-4 py-2 font-medium">% recebido</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const current = r.month === active;
              return (
                <tr
                  key={r.month}
                  aria-current={current ? 'true' : undefined}
                  onClick={() => onPick(r.month)}
                  className={cn('tabular cursor-pointer border-b border-border text-right last:border-0 hover:bg-surface-muted/60', current && 'bg-primary-soft/50 hover:bg-primary-soft/60')}
                >
                  <th scope="row" className="px-4 py-2.5 text-left font-medium whitespace-nowrap text-fg">
                    <button type="button" onClick={(e) => (e.stopPropagation(), onPick(r.month))} className="rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25">
                      {r.label}
                    </button>
                    {r.partial ? <span className="ml-1 text-caption font-normal text-muted">· parcial</span> : null}
                    {current ? <span className="ml-1.5 inline-flex h-5 items-center rounded-full bg-primary-soft px-2 text-mini font-semibold text-primary-soft-fg">referência</span> : null}
                  </th>
                  <td className="px-3 py-2.5 font-semibold text-fg">{r.activeClients}</td>
                  <td className="px-3 py-2.5">
                    <NamesButton count={r.newClients} title={`Novos em ${monthName(r.month)}`} items={r.source.newList.map((c) => ({ id: c.id, name: c.name, detail: c.fee ? `${formatBRL(c.fee)}/mês` : 'sem vigência' }))} />
                  </td>
                  <td className="px-3 py-2.5">
                    <NamesButton
                      count={r.churnedClients}
                      title={`Encerrados em ${monthName(r.month)}`}
                      items={r.source.churnedList.map((c) => ({ id: c.id, name: c.name, detail: INACTIVATION_REASON_LABELS[c.reason] }))}
                    />
                  </td>
                  <td className={cn('px-3 py-2.5', r.first ? 'text-muted' : changeTone(r.netChange))}>{r.first ? '—' : signedCount(r.netChange)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-fg">{formatBRL(r.recurringFees)}</td>
                  <td className={cn('px-3 py-2.5 whitespace-nowrap', r.feesChange === null ? 'text-muted' : changeTone(r.feesChange))}>
                    {r.feesChange === null ? '—' : r.feesChange === 0 ? 'igual' : signedMoney(r.feesChange)}
                  </td>
                  <td className="hidden px-3 py-2.5 whitespace-nowrap text-muted lg:table-cell">{r.averageFee === null ? '—' : formatBRL(r.averageFee)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-muted">{money(r.billed)}</td>
                  <td className="px-3 py-2.5 whitespace-nowrap text-fg">
                    {money(r.received)}
                    {r.partial && r.received > 0 ? <span className="block text-micro text-muted">até hoje</span> : null}
                  </td>
                  <td className="px-4 py-2.5 text-muted">{r.receivedShare === null ? '—' : percent(r.receivedShare)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Phones: one block per month (Mês, Ativos with the change, Honorário with the change, Recebido/Faturado). */}
      <ul className="divide-y divide-border border-t border-border md:hidden print:hidden">
        {mobileRows.map((r) => {
          const current = r.month === active;
          return (
            <li key={r.month} className={cn(current && 'bg-primary-soft/50')}>
              <button type="button" onClick={() => onPick(r.month)} aria-current={current ? 'true' : undefined} className="flex w-full flex-col gap-1.5 px-4 py-3 text-left">
                <span className="flex items-center justify-between gap-2">
                  <span className="text-body-sm font-semibold text-fg">
                    {r.label}
                    {r.partial ? <span className="font-normal text-muted"> · parcial</span> : null}
                  </span>
                  {current ? <span className="inline-flex h-5 items-center rounded-full bg-primary-soft px-2 text-mini font-semibold text-primary-soft-fg">referência</span> : null}
                </span>
                <MobileLine label="Ativos">
                  <span className="font-semibold text-fg">{r.activeClients}</span>
                  {r.first ? null : <span className={cn('ml-1', changeTone(r.netChange))}>{`(${signedCount(r.netChange)})`}</span>}
                </MobileLine>
                <MobileLine label="Honorário mensal">
                  <span className="font-semibold text-fg">{formatBRL(r.recurringFees)}</span>
                  {r.feesChange !== null && r.feesChange !== 0 ? (
                    <span className={cn('block text-micro', changeTone(r.feesChange))}>{`${signedMoney(r.feesChange)} vs mês anterior`}</span>
                  ) : null}
                </MobileLine>
                <MobileLine label="Recebido">
                  <span className="font-semibold text-fg">{money(r.received)}</span>
                  {r.billed > 0 ? (
                    <span className="block text-micro text-muted">{`${r.receivedShare === null ? '' : `${percent(r.receivedShare)} de `}${formatBRL(r.billed)} faturado${r.partial ? ' · até hoje' : ''}`}</span>
                  ) : null}
                </MobileLine>
              </button>
            </li>
          );
        })}
      </ul>
      {rows.length > MOBILE_ROWS && !all ? (
        <div className="border-t border-border px-4 py-2.5 md:hidden print:hidden">
          <button type="button" onClick={() => setAll(true)} className="text-caption font-medium text-brand-text hover:underline">
            {`+ ${rows.length - MOBILE_ROWS} meses`}
          </button>
        </div>
      ) : null}
    </Card>
  );
}

function MobileLine({ label, children }: { label: string; children: ReactNode }) {
  return (
    <span className="tabular flex items-start justify-between gap-3 text-body-sm">
      <span className="text-muted">{label}</span>
      <span className="text-right">{children}</span>
    </span>
  );
}

/** The count of Novos/Encerrados; a button with the names when there is any. */
function NamesButton({ count, title, items }: { count: number; title: string; items: { id: string; name: string; detail: string }[] }) {
  if (count === 0 || items.length === 0) return <span className="text-muted">{count}</span>;
  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label={`${title}: ${count}`}
          className="rounded-sm font-semibold text-fg underline decoration-dotted underline-offset-4 outline-none hover:text-brand-text focus-visible:ring-[3px] focus-visible:ring-brand-500/25"
        >
          {count}
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          side="bottom"
          align="end"
          sideOffset={6}
          collisionPadding={12}
          onClick={(e) => e.stopPropagation()}
          className="z-50 w-72 max-w-[calc(100vw-1.5rem)] rounded-xl border border-border bg-surface p-3 text-left shadow-lg data-[state=open]:animate-fade-in"
        >
          <p className="text-caption font-medium text-muted">{title}</p>
          <ul className="mt-2 flex flex-col gap-1.5">
            {items.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3 text-body-sm">
                <span className="truncate text-fg">{c.name}</span>
                <span className="tabular shrink-0 text-caption text-muted">{c.detail}</span>
              </li>
            ))}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
