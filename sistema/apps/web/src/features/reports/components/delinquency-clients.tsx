import { Fragment, useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import { ArrowUpRight, Building2, ChevronDown, FileChartColumn, Info, MessageCircle, RotateCcw, Search, SearchX } from 'lucide-react';
import { formatBRL, formatCNPJ, formatDateBR, formatPhone, type DelinquencyClient } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Tooltip } from '@/components/ui/tooltip';
import { cn, initials, pluralize } from '@/lib/utils';
import { collectionName } from '../delinquency-message';
import {
  CLIENT_SCOPE_LABELS,
  DELINQUENCY_SORT_LABELS,
  filterClients,
  formatChance,
  formatDays,
  reworkText,
  scopeClients,
  scoreParts,
  sortClients,
  type ClientScope,
  type DelinquencySort,
} from '../delinquency-view';
import { RISK_TONE, RiskBadge, ScoreBar, ScoreComposition } from './delinquency-gauges';

/** How the score is computed (packages/shared/src/utils/delinquency.ts and rework.ts): fixed copy of spec §5.3. */
export const SCORE_HELP =
  'Score de 0 a 1000 (maior = melhor), sempre sobre os últimos 12 meses. Parte da pontualidade: cada mensalidade atrasada pesa pela gravidade (1 a 5 dias 25%, 6 a 15 dias 50%, 16 a 30 dias 75%, mais de 30 dias 100%), os meses recentes valem mais (6 meses atrás vale metade) e quem tem pouco histórico parte de 20%. Depois desconta 50 pontos por mensalidade vencida em aberto (até 250), 40 por retrabalho nos últimos 90 dias e 10 por retrabalho de até 12 meses (até 200). Faixas: 800+ Baixo risco · 600–799 Atenção · 400–599 Risco alto · abaixo de 400 Crítico.';

const LOW_HISTORY_HELP = 'Menos de 3 mensalidades nos últimos 12 meses: o score ainda se apoia no ponto de partida de 20% de chance de atraso.';

export const receivablesHref = (contactId: string) => `/contas-a-receber?status=overdue&modo=year&contato=${encodeURIComponent(contactId)}`;

/** The client's financial report (its score is always of 12 months, like the row's). */
export const clientReportHref = (contactId: string) => `/relatorios/cliente/${encodeURIComponent(contactId)}`;

const SORTS: DelinquencySort[] = ['open', 'score', 'late'];
const SCOPES: ClientScope[] = ['active', 'all'];

interface Props {
  clients: DelinquencyClient[];
  months: number;
  onMessage: (client: DelinquencyClient) => void;
}

/** Companies of the report: late payments, interest/fines, days late, open amount, score and actions. */
export function DelinquencyClients({ clients, months, onMessage }: Props) {
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<DelinquencySort>('open');
  const [scope, setScope] = useState<ClientScope>('active');
  const [expanded, setExpanded] = useState<string | null>(null);
  const scoped = useMemo(() => scopeClients(clients, scope), [clients, scope]);
  const hidden = clients.length - scoped.length;
  const rows = useMemo(() => sortClients(filterClients(scoped, query), sort), [scoped, query, sort]);
  const toggle = (id: string) => setExpanded((current) => (current === id ? null : id));
  const ariaSort = (key: DelinquencySort) => (sort === key ? (key === 'score' ? 'ascending' : 'descending') : undefined);

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-col gap-3 border-b border-border p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h2 className="text-[15px] font-semibold tracking-tight text-fg">Empresas</h2>
            <p className="mt-0.5 text-xs text-muted">
              {`${pluralize(scoped.length, scope === 'active' ? 'cliente ativo' : 'cliente', scope === 'active' ? 'clientes ativos' : 'clientes')} com mensalidades nos últimos ${months} meses ou valores vencidos em aberto`}
              {hidden > 0 ? ` · ${pluralize(hidden, 'inativo em dia oculto', 'inativos em dia ocultos')}` : ''}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-subtle" aria-hidden />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Buscar empresa, responsável ou CNPJ"
              className="h-9 pl-9 text-[13px]"
              aria-label="Buscar empresas"
            />
          </div>
          <SegmentedControl<ClientScope>
            size="sm"
            ariaLabel="Clientes"
            value={scope}
            onChange={setScope}
            options={SCOPES.map((v) => ({ value: v, label: CLIENT_SCOPE_LABELS[v] }))}
          />
          <div className="flex items-center gap-2 sm:ml-auto">
            <span className="text-caption text-muted">Ordenar por</span>
            <SegmentedControl<DelinquencySort>
              size="sm"
              ariaLabel="Ordenar por"
              value={sort}
              onChange={setSort}
              options={SORTS.map((s) => ({ value: s, label: DELINQUENCY_SORT_LABELS[s] }))}
            />
          </div>
        </div>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          className="m-4"
          icon={<SearchX />}
          title="Nenhuma empresa encontrada"
          description={
            query.trim()
              ? `Nada corresponde a "${query.trim()}". Busque pela razão social, nome fantasia, responsável ou CNPJ.`
              : 'Só há clientes inativos em dia no período. Escolha "Todos" para vê-los.'
          }
          action={
            query.trim() ? (
              <Button variant="outline" size="sm" onClick={() => setQuery('')}>
                Limpar busca
              </Button>
            ) : (
              <Button variant="outline" size="sm" onClick={() => setScope('all')}>
                Ver todos
              </Button>
            )
          }
        />
      ) : (
        <>
          {/* Mobile and tablet: cards. */}
          <ul className="divide-y divide-border lg:hidden">
            {rows.map((c) => (
              <li key={c.contactId} className="flex flex-col gap-3 p-4">
                <ClientName client={c} expanded={expanded === c.contactId} onToggle={() => toggle(c.contactId)} />
                {/* The score is the 5th statistic, so the name keeps the whole width. */}
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2.5">
                  <Stat label="Atrasos">
                    <LateCell client={c} />
                  </Stat>
                  <Stat label="Média de dias">
                    <DaysCell client={c} />
                  </Stat>
                  <Stat label="Juros / multa">
                    <FeesCell client={c} />
                  </Stat>
                  <Stat label="Em aberto">
                    <OpenCell client={c} />
                  </Stat>
                  <Stat label="Score">
                    <ScoreCell client={c} compact />
                  </Stat>
                </dl>
                <div className="flex flex-wrap items-center gap-2">
                  <MessageButton client={c} onMessage={onMessage} />
                  <ReportButton client={c} />
                  <Button asChild variant="ghost" size="sm">
                    <Link to={receivablesHref(c.contactId)}>
                      Contas a receber <ArrowUpRight />
                    </Link>
                  </Button>
                </div>
                {expanded === c.contactId ? <OpenItems client={c} /> : null}
              </li>
            ))}
          </ul>

          {/* Desktop: table. */}
          <div className="hidden lg:block">
            <table className="w-full table-fixed text-sm">
              <colgroup>
                <col />
                <col className="w-[92px] xl:w-[104px]" />
                <col className="w-[112px] xl:w-[128px]" />
                <col className="w-[88px] xl:w-[100px]" />
                <col className="w-[112px] xl:w-[128px]" />
                <col className="w-[156px] xl:w-[176px]" />
                <col className="w-[140px]" />
              </colgroup>
              <thead>
                <tr className="border-b border-border text-left text-xs font-medium text-muted">
                  <th className="px-4 py-2.5">Cliente</th>
                  <th className="px-3 py-2.5" aria-sort={ariaSort('late')}>
                    Atrasos
                  </th>
                  <th className="px-3 py-2.5">Juros / multa</th>
                  <th className="px-3 py-2.5">Média</th>
                  <th className="px-3 py-2.5 text-right" aria-sort={ariaSort('open')}>
                    Em aberto
                  </th>
                  <th className="px-3 py-2.5" aria-sort={ariaSort('score')}>
                    <span className="flex items-center gap-1">
                      Score
                      <Tooltip content={SCORE_HELP}>
                        <button type="button" className="text-subtle normal-case hover:text-muted" aria-label="Como o score é calculado">
                          <Info className="size-3.5" />
                        </button>
                      </Tooltip>
                    </span>
                  </th>
                  <th className="px-4 py-2.5 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((c) => {
                  const open = expanded === c.contactId;
                  return (
                    <Fragment key={c.contactId}>
                      <tr className={cn('border-b border-border align-top last:border-0 hover:bg-surface-muted/60', open && 'border-b-0 bg-surface-muted/60')}>
                        <td className="px-4 py-3">
                          <ClientName client={c} expanded={open} onToggle={() => toggle(c.contactId)} />
                        </td>
                        <td className="px-3 py-3">
                          <LateCell client={c} />
                        </td>
                        <td className="px-3 py-3">
                          <FeesCell client={c} />
                        </td>
                        <td className="px-3 py-3">
                          <DaysCell client={c} />
                        </td>
                        <td className="px-3 py-3 text-right">
                          <OpenCell client={c} align="right" />
                        </td>
                        <td className="px-3 py-3">
                          <ScoreCell client={c} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center justify-end gap-1">
                            <MessageButton client={c} onMessage={onMessage} />
                            <ReportButton client={c} />
                            <Tooltip content="Ver vencidos em contas a receber">
                              <Link
                                to={receivablesHref(c.contactId)}
                                aria-label={`Ver vencidos de ${collectionName(c)} em contas a receber`}
                                className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-muted transition-colors hover:bg-bg-subtle hover:text-fg [&_svg]:size-4"
                              >
                                <ArrowUpRight />
                              </Link>
                            </Tooltip>
                          </div>
                        </td>
                      </tr>
                      {open ? (
                        <tr className="border-b border-border bg-surface-muted/60 last:border-0">
                          <td colSpan={7} className="px-4 pt-0 pb-4">
                            <OpenItems client={c} />
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </Card>
  );
}

/** Empty report (no client receivables in the period). */
export function DelinquencyClientsEmpty() {
  return (
    <Card className="p-5">
      <EmptyState
        icon={<Building2 />}
        title="Nenhuma mensalidade de cliente no período"
        description="Vincule os clientes às contas a receber (honorários) para acompanhar atrasos, juros, multas e o score de cada empresa."
        action={
          <Button asChild variant="outline" size="sm">
            <Link to="/contas-a-receber">Ir para contas a receber</Link>
          </Button>
        }
      />
    </Card>
  );
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-caption font-medium text-subtle">{label}</dt>
      <dd className="mt-0.5">{children}</dd>
    </div>
  );
}

function ClientName({ client: c, expanded, onToggle }: { client: DelinquencyClient; expanded: boolean; onToggle: () => void }) {
  const title = collectionName(c);
  return (
    <button type="button" onClick={onToggle} aria-expanded={expanded} className="group flex w-full min-w-0 flex-1 items-start gap-3 text-left">
      <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-bold text-primary-soft-fg">{initials(title)}</span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1">
          <span className="truncate font-semibold text-fg group-hover:underline group-hover:underline-offset-2">{title}</span>
          <ChevronDown className={cn('size-3.5 shrink-0 text-subtle transition-transform', expanded && 'rotate-180')} aria-hidden />
        </span>
        {c.tradeName && c.tradeName.trim() !== c.name.trim() ? <span className="block truncate text-caption text-muted">{c.name}</span> : null}
        <span className="tabular block text-micro text-subtle">
          {c.document ? formatCNPJ(c.document) : 'Sem CNPJ'}
          {c.status === 'inactive' ? ' · inativo' : ''}
        </span>
      </span>
    </button>
  );
}

function LateCell({ client: c }: { client: DelinquencyClient }) {
  if (c.dueCount === 0) return <span className="text-body-sm text-subtle">sem histórico</span>;
  return (
    <span className="block leading-tight">
      <span className={cn('tabular text-body-sm font-semibold', c.lateCount > 0 ? 'text-fg' : 'text-success')}>
        {c.lateCount} de {c.dueCount}
      </span>
      <span className="block text-micro text-muted">{c.dueCount === 1 ? 'mensalidade' : 'mensalidades'}</span>
    </span>
  );
}

function FeesCell({ client: c }: { client: DelinquencyClient }) {
  const total = c.interestTotal + c.fineTotal;
  const charges = c.interestCount + c.fineCount;
  if (charges === 0) return <span className="text-body-sm text-subtle">—</span>;
  const parts = [c.interestCount ? `juros ${c.interestCount}×` : null, c.fineCount ? `multa ${c.fineCount}×` : null].filter(Boolean).join(' · ');
  const split = [c.interestTotal ? `Juros: ${formatBRL(c.interestTotal)} (${c.interestCount}×)` : null, c.fineTotal ? `Multa: ${formatBRL(c.fineTotal)} (${c.fineCount}×)` : null]
    .filter(Boolean)
    .join(' · ');
  return (
    <Tooltip content={split}>
      <span className="block cursor-default leading-tight" tabIndex={0} aria-label={`Juros e multas: ${split}`}>
        <span className="tabular text-body-sm font-semibold text-fg">{formatBRL(total)}</span>
        <span className="block truncate text-micro text-muted">{parts}</span>
      </span>
    </Tooltip>
  );
}

function DaysCell({ client: c }: { client: DelinquencyClient }) {
  if (c.avgDaysLate === null) return <span className="text-body-sm text-subtle">no prazo</span>;
  return (
    <span className="block leading-tight">
      <span className="tabular text-body-sm font-semibold text-fg">{formatDays(c.avgDaysLate)}</span>
      <span className="block text-micro text-muted">máx. {formatDays(c.maxDaysLate)}</span>
    </span>
  );
}

function OpenCell({ client: c, align = 'left' }: { client: DelinquencyClient; align?: 'left' | 'right' }) {
  if (c.openCount === 0) return <span className={cn('block text-body-sm whitespace-nowrap text-subtle', align === 'right' && 'text-right')}>em dia</span>;
  return (
    <span className={cn('block leading-tight', align === 'right' && 'text-right')}>
      <span className="tabular text-body-sm font-semibold text-danger">{formatBRL(c.openAmount)}</span>
      <span className="block text-micro text-muted">{pluralize(c.openCount, 'mês', 'meses')}</span>
    </span>
  );
}

/**
 * Score of a client: the number and its band, the bar, the chance of paying late and, when there is
 * any, "3 retrabalhos em 90 dias". Hover (or focus) shows the composition; screen readers get it in one
 * line ("Pontualidade 608 · em aberto −100 · retrabalho −90 = 418").
 */
export function ScoreCell({ client: c, compact }: { client: DelinquencyClient; compact?: boolean }) {
  const rework = reworkText(c.rework.last90Days);
  const parts = scoreParts(c);
  return (
    <div className={cn('flex min-w-0 flex-col gap-1', compact && 'max-w-[220px]')}>
      <Tooltip
        content={
          <div className="w-[200px]">
            <p className="mb-1">Composição do score</p>
            <ScoreComposition tone="inverse" s={c} />
          </div>
        }
      >
        <span tabIndex={0} className="flex w-fit cursor-default items-baseline gap-1.5 rounded-sm outline-none focus-visible:ring-[3px] focus-visible:ring-brand-500/25">
          <span className={cn('tabular text-[15px] leading-none font-bold', RISK_TONE[c.risk].text)}>{c.score}</span>
          <RiskBadge risk={c.risk} className="h-4 px-1.5" />
          <span className="sr-only">{`Composição: ${parts}`}</span>
        </span>
      </Tooltip>
      <ScoreBar score={c.score} risk={c.risk} />
      <span className="text-micro leading-tight text-muted">
        {`${formatChance(c.probability)} de chance de atrasar`}
        {c.lowHistory ? (
          <Tooltip content={LOW_HISTORY_HELP}>
            <span tabIndex={0} className="block w-fit cursor-help whitespace-nowrap text-subtle underline decoration-dotted underline-offset-2">
              pouco histórico
            </span>
          </Tooltip>
        ) : null}
      </span>
      {rework ? (
        <span className="flex items-center gap-1 text-micro leading-tight text-muted">
          <RotateCcw className="size-3 shrink-0" aria-hidden />
          {rework}
        </span>
      ) : null}
    </div>
  );
}

/**
 * The speech-balloon icon (same size as the row's other icon actions); "Enviar mensagem" on hover.
 * Only for clients with something overdue: the others have nothing to collect.
 */
function MessageButton({ client: c, onMessage }: { client: DelinquencyClient; onMessage: (c: DelinquencyClient) => void }) {
  if (c.overdue.length === 0) return null;
  return (
    <Tooltip content="Enviar mensagem">
      <button
        type="button"
        onClick={() => onMessage(c)}
        aria-label={`Enviar mensagem de cobrança para ${collectionName(c)}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-muted transition-colors outline-none hover:bg-bg-subtle hover:text-fg focus-visible:ring-[3px] focus-visible:ring-brand-500/25 [&_svg]:size-4"
      >
        <MessageCircle />
      </button>
    </Tooltip>
  );
}

/** Opens the client's financial report (whole history and analysis); "Relatório do cliente" on hover. */
function ReportButton({ client: c }: { client: DelinquencyClient }) {
  return (
    <Tooltip content="Relatório do cliente">
      <Link
        to={clientReportHref(c.contactId)}
        aria-label={`Relatório financeiro de ${collectionName(c)}`}
        className="flex size-8 shrink-0 items-center justify-center rounded-[10px] text-muted transition-colors outline-none hover:bg-bg-subtle hover:text-fg focus-visible:ring-[3px] focus-visible:ring-brand-500/25 [&_svg]:size-4"
      >
        <FileChartColumn />
      </Link>
    </Tooltip>
  );
}

/** Details of a client: open past-due items, payment history in the period and contact. */
function OpenItems({ client: c }: { client: DelinquencyClient }) {
  return (
    <div className="rounded-lg border border-border bg-surface p-3">
      {c.overdue.length > 0 ? (
        <>
          <p className="mb-1.5 text-caption font-medium text-subtle">Vencidos em aberto</p>
          <ul className="divide-y divide-border">
            {c.overdue.map((item) => (
              // Phones: description and amount, then the due date below. Wider: one line.
              <li
                key={item.id}
                className="grid grid-cols-[minmax(0,1fr)_auto] items-baseline gap-x-3 py-1.5 text-body-sm sm:grid-cols-[minmax(0,1fr)_auto_6.5rem_6.5rem]"
              >
                <span className="truncate text-fg" title={item.description}>
                  {item.description}
                </span>
                <span className="tabular row-start-2 text-micro text-muted sm:row-start-auto sm:text-body-sm">
                  Venc. {formatDateBR(item.date)}
                  <span className="text-danger sm:hidden"> · há {formatDays(item.daysLate)}</span>
                </span>
                <span className="tabular hidden text-right text-danger sm:block">há {formatDays(item.daysLate)}</span>
                <span className="tabular col-start-2 row-start-1 text-right font-semibold text-fg sm:col-start-auto sm:row-start-auto">
                  {formatBRL(item.amount)}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : (
        <p className="text-body-sm text-muted">Nenhuma mensalidade vencida em aberto.</p>
      )}
      <p className="mt-2 border-t border-border pt-2 text-caption text-muted">
        No período: {c.onTimeCount} no prazo · {c.lateCount} com atraso
        {c.maxDaysLate > 0 ? ` (máx. ${formatDays(c.maxDaysLate)})` : ''}
        {c.rework.last90Days > 0 || c.rework.last12Months > 0 ? ` · Retrabalho: ${c.rework.last90Days} em 90 dias${c.rework.last12Months > c.rework.last90Days ? `, ${c.rework.last12Months} em 12 meses` : ''}` : ''}
        {c.responsibleName || c.phone ? (
          <>
            {' · '}
            {c.responsibleName ? `Responsável: ${c.responsibleName}` : 'Telefone'}
            {c.phone ? ` · ${formatPhone(c.phone)}` : ''}
          </>
        ) : null}
      </p>
    </div>
  );
}
