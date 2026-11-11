import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, LabelList, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { ArrowLeft, Building2, CalendarClock, CircleCheck, Info, MessageCircle, Printer } from 'lucide-react';
import {
  CLIENT_STATUS_LABELS,
  TAX_REGIME_LABELS,
  formatBps,
  formatBRL,
  formatCNPJ,
  formatDateBR,
  formatMonthKey,
  formatPercent,
  formatPhone,
  monthKey,
  todayISO,
  type Client,
  type ClientFeesResponse,
} from '@effinance/shared';
import { axisProps, categoryAxisProps, CHART_COLORS, CHART_TEXT, ChartBox, LegendDot, moneyAxisFormatter, MoneyTooltip, StripeDefs, stripeFill, useStripeScope } from '@/components/charts/chart-utils';
import { niceDomain, yAxisWidth } from '@/components/charts/chart-scale';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { EmptyState } from '@/components/ui/empty-state';
import { ErrorState, MiniStat } from '@/components/ui/misc';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { usePermissions } from '@/features/auth/permissions';
import { useClient, useClientFees } from '@/features/clients/api';
import { ApiRequestError } from '@/lib/api';
import { cn, initials, pluralize } from '@/lib/utils';
import { useClientHistory, useClientRework, useDelinquencyReport } from '../api';
import { analyzeClient, clientFinding, clientReceivables, trendText, type ClientAnalysis } from '../client-report/client-report';
import { HistoryTable, STATUS, timingText } from '../client-report/history-table';
import { PaymentMapCard, PaymentTimingCard } from '../client-report/payment-map';
import { ReworkCardView } from '../client-report/rework-card';
import { CollectionMessageDialog } from '../components/collection-message-dialog';
import { SCORE_HELP } from '../components/delinquency-clients';
import { RISK_TONE, RiskBadge, ScoreBar, ScoreComposition } from '../components/delinquency-gauges';
import { formatChance, formatDays } from '../delinquency-view';

/** Period of the delinquency report it came from (`?meses=6|24`): only for the way back (the score is always of 12 months). */
function parseMonths(raw: string | null): 6 | 12 | 24 {
  const n = Number(raw);
  return n === 6 || n === 24 ? n : 12;
}

/** The chart reads month by month: past two years at most (the table keeps everything). */
const CHART_MONTHS = 24;

/** "Relatório do cliente": the whole financial history of one client and how it pays. */
export default function ClientReportPage() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const months = parseMonths(params.get('meses'));
  const client = useClient(id);
  const history = useClientHistory(id);
  const fees = useClientFees(id);
  const delinquency = useDelinquencyReport(months);
  const rework = useClientRework(id);
  const permissions = usePermissions();
  const [messaging, setMessaging] = useState(false);
  const today = todayISO();
  const reworkCounts = rework.data?.rework;
  const analysis = useMemo(
    () => (history.data ? analyzeClient(clientReceivables(history.data, today), today, reworkCounts) : null),
    [history.data, today, reworkCounts],
  );
  // The score waits for the rework (or its failure), so it never jumps after the first paint.
  const scoreReady = !rework.isPending;
  // The collection message works on the delinquency report's row of this client.
  const row = delinquency.data?.clients.find((c) => c.contactId === id) ?? null;
  const backHref = `/relatorios?aba=inadimplencia${months === 12 ? '' : `&meses=${months}`}`;
  usePrintInLight();

  if (client.isError || history.isError) {
    const error = client.error ?? history.error;
    // A malformed id (400) is as missing as an unknown one (404).
    const notFound = error instanceof ApiRequestError && (error.status === 404 || error.status === 400);
    if (notFound) {
      return (
        <EmptyState
          icon={<Building2 />}
          title="Cliente não encontrado"
          description="O cliente pode ter sido excluído ou pertencer a outra empresa."
          action={
            <Button variant="outline" asChild>
              <Link to={backHref}>Voltar à inadimplência</Link>
            </Button>
          }
        />
      );
    }
    return <ErrorState error={error} onRetry={() => (client.isError ? client.refetch() : history.refetch())} />;
  }

  const c = client.data;
  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="ghost" size="sm" asChild>
          <Link to={backHref}>
            <ArrowLeft /> Inadimplência
          </Link>
        </Button>
        <div className="flex flex-wrap gap-2">
          {row && row.overdue.length > 0 ? (
            <Button variant="outline" onClick={() => setMessaging(true)}>
              <MessageCircle /> Enviar mensagem
            </Button>
          ) : null}
          <Button variant="outline" onClick={() => window.print()} disabled={!c || !analysis}>
            <Printer /> Imprimir ou salvar PDF
          </Button>
        </div>
      </div>

      {!c || !analysis ? (
        <ReportSkeleton />
      ) : (
        <>
          <ClientHeader client={c} fees={fees.data} analysis={analysis} scoreReady={scoreReady} reworkFailed={rework.isError} />
          <Kpis analysis={analysis} />
          {analysis.count === 0 ? (
            <Card className="p-5">
              <EmptyState
                icon={<CalendarClock />}
                title="Nenhuma cobrança registrada"
                description="Gere os honorários em Contas a receber ou lance um recebimento vinculado a este cliente para ver o histórico."
                action={
                  <Button asChild variant="outline" size="sm">
                    <Link to="/contas-a-receber">Ir para contas a receber</Link>
                  </Button>
                }
              />
            </Card>
          ) : (
            <>
              <div className="grid gap-4 xl:grid-cols-5">
                <PaymentMapCard analysis={analysis} className="xl:col-span-3" />
                <PaymentTimingCard analysis={analysis} className="xl:col-span-2">
                  <PaymentFacts analysis={analysis} />
                </PaymentTimingCard>
              </div>
              <div className="grid gap-4 xl:grid-cols-5">
                <BilledChart analysis={analysis} className="xl:col-span-3" />
                <FeePeriodsCard fees={fees.data} failed={fees.isError} className="xl:col-span-2" />
              </div>
              <div className="grid gap-4 xl:grid-cols-5">
                <OpenCard analysis={analysis} today={today} className="xl:col-span-3" />
                <ReworkCardView
                  className="xl:col-span-2"
                  data={rework.data}
                  loading={rework.isPending}
                  failed={rework.isError}
                  canOpen
                  categoriesLink={permissions.can('page.registry')}
                />
              </div>
              <HistoryTable receivables={analysis.receivables} today={today} />
            </>
          )}
          <p className="text-caption text-subtle">
            Gerado em {formatDateBR(today)} às {new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}. Valores pelo vencimento de cada cobrança; o
            recebido soma juros e multa cobrados no pagamento e desconta o desconto por pontualidade concedido.
          </p>
        </>
      )}

      <CollectionMessageDialog client={messaging ? row : null} onClose={() => setMessaging(false)} />
    </div>
  );
}

/** Paper is white: print in the light theme (also with Ctrl+P) and restore the user's theme after. */
function usePrintInLight() {
  useEffect(() => {
    const root = document.documentElement;
    let saved: string | undefined;
    const before = () => {
      saved = root.dataset.theme;
      root.dataset.theme = 'light';
    };
    const after = () => {
      if (saved) root.dataset.theme = saved;
    };
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
}

function ClientHeader({
  client: c,
  fees,
  analysis: a,
  scoreReady,
  reworkFailed,
}: {
  client: Client;
  fees: ClientFeesResponse | undefined;
  analysis: ClientAnalysis;
  scoreReady: boolean;
  reworkFailed: boolean;
}) {
  const title = c.tradeName?.trim() || c.name;
  const fee = fees?.current ?? c.currentFee;
  const trend = trendText(a);
  return (
    <Card className="print:break-inside-avoid">
      <div className="flex flex-col gap-5 p-5 lg:flex-row lg:items-start">
        <div className="flex min-w-0 flex-1 items-start gap-4">
          <span className="hidden size-12 shrink-0 items-center justify-center rounded-full bg-primary-soft text-sm font-bold text-primary-soft-fg sm:flex print:hidden">{initials(title)}</span>
          <div className="min-w-0 flex-1">
            <p className="text-caption text-muted">Relatório financeiro do cliente</p>
            <h1 className="text-[22px] leading-tight font-semibold tracking-tight text-fg">{title}</h1>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-body-sm text-muted">
              {title !== c.name ? <span>{c.name}</span> : null}
              <span className="tabular">{c.document ? formatCNPJ(c.document) : 'Sem CNPJ'}</span>
              <span>{TAX_REGIME_LABELS[c.taxRegime]}</span>
              {c.status === 'inactive' ? <Badge tone="neutral">{CLIENT_STATUS_LABELS.inactive}</Badge> : null}
            </p>
            <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4">
              <Fact label="Cliente desde">{formatDateBR(c.contractStartDate)}</Fact>
              <Fact label="Vencimento">Dia {c.feeDueDay}</Fact>
              <Fact label="Honorário atual">
                {fee ? (
                  <>
                    {formatBRL(fee.amount)}
                    {fee.employeeFee ? <span className="block text-caption font-normal text-muted">+ {formatBRL(fee.employeeFee)} por empregado</span> : null}
                  </>
                ) : (
                  <span className="font-normal text-muted">sem vigência atual</span>
                )}
              </Fact>
              <Fact label="Desconto por pontualidade">{fee?.discountBps ? formatBps(fee.discountBps) : <span className="font-normal text-muted">não tem</span>}</Fact>
              {c.responsibleName || c.responsiblePhone || c.phone ? (
                <Fact label="Responsável" className="col-span-2">
                  {c.responsibleName ?? '—'}
                  {c.responsiblePhone || c.phone ? <span className="tabular block text-caption font-normal text-muted">{formatPhone((c.responsiblePhone ?? c.phone)!)}</span> : null}
                </Fact>
              ) : null}
              {a.lastPayment ? (
                <Fact label="Último pagamento" className="col-span-2 sm:col-span-1">
                  {formatDateBR(a.lastPayment)}
                </Fact>
              ) : null}
            </dl>
          </div>
        </div>
        <ScoreBlock analysis={a} ready={scoreReady} reworkFailed={reworkFailed} />
      </div>
      <div className="border-t border-border px-5 py-4">
        <p className="text-body-sm text-fg">{clientFinding(a)}</p>
        {trend ? <p className="mt-1 text-caption text-muted">{trend}</p> : null}
      </div>
    </Card>
  );
}

function Fact({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn('min-w-0', className)}>
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="mt-0.5 text-body-sm font-medium text-fg">{children}</dd>
    </div>
  );
}

/**
 * Score of 12 months (the same as the delinquency row) with its composition, one part per line
 * (spec §5.4): punctuality, open past due and rework, then "= score".
 */
function ScoreBlock({ analysis: a, ready, reworkFailed }: { analysis: ClientAnalysis; ready: boolean; reworkFailed: boolean }) {
  const s = a.score;
  const overdue = a.overdueCount;
  return (
    <div className="flex w-full flex-col gap-2 rounded-lg border border-border p-4 lg:w-[264px] lg:shrink-0 print:break-inside-avoid" aria-busy={!ready}>
      <div className="flex items-center gap-1.5">
        <span className="text-caption text-muted">{`Score de ${a.scoreMonths} meses`}</span>
        <Tooltip content={SCORE_HELP}>
          <button type="button" className="text-subtle hover:text-muted print:hidden" aria-label="Como o score é calculado">
            <Info className="size-3.5" />
          </button>
        </Tooltip>
      </div>
      {!ready ? (
        <>
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-16 w-full" />
        </>
      ) : (
        <>
          <div className="flex items-baseline gap-2">
            <span className={cn('tabular text-[28px] leading-none font-bold tracking-tight', RISK_TONE[s.risk].text)}>{s.score}</span>
            <span className="text-caption text-subtle">de 1000</span>
            <RiskBadge risk={s.risk} className="ml-auto" />
          </div>
          <ScoreBar score={s.score} risk={s.risk} />
          <ScoreComposition
            full
            className="mt-1 border-t border-border pt-2 text-caption"
            s={{ ...s, openCount: overdue, rework: a.rework }}
          />
          <p className="text-caption text-muted">
            {`${formatChance(s.probability)} de chance de atrasar a próxima`}
            {reworkFailed ? <span className="block text-subtle">Sem o retrabalho: não foi possível carregá-lo agora.</span> : null}
            {s.lowHistory ? <span className="block text-subtle">Pouco histórico nos últimos 12 meses: o score ainda é uma estimativa.</span> : null}
          </p>
        </>
      )}
    </div>
  );
}

function paymentOffsetText(days: number | null): string {
  if (days === null) return '—';
  if (days > 0) return `${formatDays(days)} depois`;
  if (days < 0) return `${formatDays(-days)} antes`;
  return 'no vencimento';
}

/** The 4 figures of the top (spec §5.4); the rest goes to the compact facts under "Quando paga". */
function Kpis({ analysis: a }: { analysis: ClientAnalysis }) {
  const due = a.onTimeCount + a.paidLateCount + a.overdueCount;
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4 print:grid-cols-4">
      <MiniStat
        label="Faturado"
        value={formatBRL(a.billed)}
        hint={a.firstDue ? `${pluralize(a.count, 'cobrança', 'cobranças')} desde ${formatMonthKey(monthKey(a.firstDue), 'short')}` : 'nenhuma cobrança'}
      />
      <MiniStat label="Recebido" value={formatBRL(a.received)} hint={`${pluralize(a.paidCount, 'pagamento', 'pagamentos')}, com juros e descontos`} />
      <MiniStat
        label="Em aberto"
        value={formatBRL(a.open)}
        tone={a.overdue > 0 ? 'danger' : undefined}
        hint={a.overdue > 0 ? `${formatBRL(a.overdue)} vencido` : a.open > 0 ? 'a vencer, nada vencido' : 'nada em aberto'}
      />
      <MiniStat
        label="Pontualidade"
        value={a.punctuality === null ? '—' : formatPercent(a.punctuality, 0)}
        tone={a.punctuality !== null && a.punctuality < 0.6 ? 'warning' : undefined}
        hint={due ? `${a.onTimeCount} de ${due} no prazo` : 'nada venceu ainda'}
      />
    </div>
  );
}

/** Average delay, payment term, interest/fines and discounts in one compact list (end of "Quando paga"). */
function PaymentFacts({ analysis: a }: { analysis: ClientAnalysis }) {
  const facts: { label: string; value: string; hint: string }[] = [
    { label: 'Atraso médio', value: a.avgDaysLate === null ? 'sem atrasos' : formatDays(a.avgDaysLate), hint: a.maxDaysLate ? `máximo de ${formatDays(a.maxDaysLate)}` : 'quando atrasa' },
    { label: 'Prazo médio', value: paymentOffsetText(a.avgPaymentOffset), hint: 'do vencimento ao pagamento' },
    { label: 'Juros e multas', value: formatBRL(a.interest + a.fine), hint: a.interest + a.fine > 0 ? `juros ${formatBRL(a.interest)} · multa ${formatBRL(a.fine)}` : 'nenhum cobrado' },
    { label: 'Descontos', value: formatBRL(a.discount), hint: 'por pontualidade' },
  ];
  return (
    <dl className="mt-auto grid grid-cols-1 gap-x-5 gap-y-1.5 border-t border-border pt-3 text-caption min-[420px]:grid-cols-2">
      {facts.map((f) => (
        <div key={f.label} className="flex min-w-0 items-baseline justify-between gap-2" title={f.hint}>
          <dt className="truncate text-muted">{f.label}</dt>
          <dd className="tabular font-semibold whitespace-nowrap text-fg">{f.value}</dd>
        </div>
      ))}
    </dl>
  );
}

const NAMES = { billed: 'Faturado', received: 'Recebido', overdueAmount: 'Vencido em aberto', upcomingAmount: 'A vencer' };

/**
 * Billed (grey) against what came in (data hue) per due month, with what is still open stacked on the
 * received bar, hatched: past due in red, not due yet in grey (spec §5.4).
 */
function BilledChart({ analysis: a, className }: { analysis: ClientAnalysis; className?: string }) {
  const scope = useStripeScope();
  const data = a.months.slice(-CHART_MONTHS).map((m) => ({
    ...m,
    label: formatMonthKey(m.month, 'short'),
    openLabel: m.overdueAmount > 0 ? 'vencido' : m.upcomingAmount > 0 ? 'a vencer' : '',
  }));
  const axis = niceDomain(data.flatMap((d) => [d.billed, d.received + d.overdueAmount + d.upcomingAmount]));
  return (
    <Card className={cn('flex min-w-0 flex-col p-5 print:break-inside-avoid', className)}>
      <CardHeader
        title="Faturado e recebido por mês"
        subtitle={`Pelo mês de vencimento${a.months.length > CHART_MONTHS ? ` · últimos ${CHART_MONTHS} meses` : ''}`}
        info="Recebido inclui juros e multa e já desconta o desconto por pontualidade. O que segue em aberto aparece hachurado sobre o recebido: vencido em vermelho, a vencer em cinza."
      />
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1">
        <LegendDot size="sm" color={CHART_COLORS.expense} label="Faturado" />
        <LegendDot size="sm" color="var(--app-data)" label="Recebido" />
        <LegendDot size="sm" color={CHART_COLORS.danger} label="Vencido em aberto" striped />
        <LegendDot size="sm" color={CHART_COLORS.neutral} label="A vencer" striped />
      </div>
      <div className="mt-3 flex h-60 flex-col">
        <ChartBox>
          <BarChart data={data} margin={{ top: 16, right: 4, left: 0, bottom: 0 }} barCategoryGap="24%" barGap={2}>
            <StripeDefs scope={scope} />
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeDasharray="4 4" />
            <XAxis dataKey="label" {...categoryAxisProps} />
            <YAxis {...axisProps} domain={axis.domain} ticks={axis.ticks} interval={0} tickFormatter={moneyAxisFormatter} width={yAxisWidth(axis.ticks, moneyAxisFormatter)} />
            <ChartTooltip cursor={{ fill: 'var(--app-bg-subtle)' }} content={<MoneyTooltip names={NAMES} hideZero />} />
            {/* No animation: printing re-lays the chart out and would catch the bars mid-growth. */}
            <Bar dataKey="billed" name="billed" stackId="billed" fill={CHART_COLORS.expense} radius={[4, 4, 0, 0]} maxBarSize={22} isAnimationActive={false} />
            <Bar dataKey="received" name="received" stackId="in" fill="var(--app-data)" maxBarSize={22} isAnimationActive={false} />
            {(['overdueAmount', 'upcomingAmount'] as const).map((key) => (
              <Bar key={key} dataKey={key} name={key} stackId="in" fill={stripeFill(key === 'overdueAmount' ? 'danger' : 'neutral', scope)} maxBarSize={22} isAnimationActive={false}>
                {data.length <= 14 ? (
                  <LabelList
                    // On the top segment only: "a vencer" over the upcoming part, else "vencido" over the overdue one.
                    dataKey={(row: (typeof data)[number]) => ((row.upcomingAmount > 0 ? 'upcomingAmount' : row.overdueAmount > 0 ? 'overdueAmount' : null) === key ? row.openLabel : '')}
                    content={(p: { x?: number | string; y?: number | string; width?: number | string; value?: unknown }) =>
                      p.value ? (
                        <text
                          x={Number(p.x ?? 0) + Number(p.width ?? 0) / 2}
                          y={Number(p.y ?? 0) - 5}
                          textAnchor="middle"
                          fontSize={CHART_TEXT.axis}
                          fontWeight={p.value === 'vencido' ? 600 : 400}
                          fill={p.value === 'vencido' ? 'var(--app-danger)' : 'var(--app-muted)'}
                        >
                          {String(p.value)}
                        </text>
                      ) : null
                    }
                  />
                ) : null}
              </Bar>
            ))}
          </BarChart>
        </ChartBox>
      </div>
    </Card>
  );
}

/** What the client owes now: past due first (oldest first), then what falls due next. */
function OpenCard({ analysis: a, today, className }: { analysis: ClientAnalysis; today: string; className?: string }) {
  const open = a.receivables
    .filter((r) => r.paidAt === null)
    .sort((x, y) => (x.status === y.status ? x.dueDate.localeCompare(y.dueDate) : x.status === 'vencido' ? -1 : 1));
  return (
    <Card className={cn('flex flex-col p-5 print:break-inside-avoid', className)}>
      <CardHeader title="Em aberto" subtitle={open.length ? `${pluralize(open.length, 'cobrança', 'cobranças')} · ${formatBRL(a.open)}` : 'Nada a receber deste cliente'} />
      {open.length === 0 ? (
        <EmptyState compact className="mt-4" icon={<CircleCheck />} title="Tudo pago" description="Nenhuma cobrança vencida ou a vencer." />
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {open.map((r) => (
            <li key={r.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-0.5 py-2.5">
              <span className="truncate text-body-sm text-fg" title={r.description}>
                {r.description}
              </span>
              <span className="tabular text-right text-body-sm font-semibold text-fg">{formatBRL(r.amount)}</span>
              <span className="tabular text-caption text-muted">
                Venc. {formatDateBR(r.dueDate)} · <span className={cn(r.status === 'vencido' && 'font-medium text-danger')}>{timingText(r, today)}</span>
              </span>
              <span className="text-right">
                <Badge tone={STATUS[r.status].tone}>{STATUS[r.status].label}</Badge>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

/** Yearly fee periods, newest first, with the adjustment over the previous one. */
function FeePeriodsCard({ fees, failed, className }: { fees: ClientFeesResponse | undefined; failed: boolean; className?: string }) {
  const items = fees?.items ?? [];
  return (
    <Card className={cn('flex flex-col p-5 print:break-inside-avoid', className)}>
      <CardHeader title="Vigências do honorário" subtitle="Anuais, a partir do início do contrato" />
      {failed ? (
        <p className="mt-4 text-body-sm text-muted">Não foi possível carregar as vigências agora.</p>
      ) : !fees ? (
        <Skeleton className="mt-4 h-32 rounded-lg" />
      ) : items.length === 0 ? (
        <EmptyState compact className="mt-4" icon={<CalendarClock />} title="Nenhuma vigência cadastrada" description="Cadastre o honorário na tela de Clientes." />
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((f, i) => {
            const previous = items[i + 1];
            const change = previous && previous.amount > 0 ? (f.amount - previous.amount) / previous.amount : null;
            const current = fees.current?.id === f.id;
            return (
              <li key={f.id} className="flex items-start justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <p className="tabular flex items-center gap-2 text-body-sm text-fg">
                    {formatDateBR(f.startDate)} a {formatDateBR(f.endDate)}
                    {current ? <Badge tone="brand">Atual</Badge> : null}
                  </p>
                  <p className="text-caption text-muted">
                    {[f.employeeFee ? `${formatBRL(f.employeeFee)} por empregado` : null, f.discountBps ? `${formatBps(f.discountBps)} de desconto` : null].filter(Boolean).join(' · ') ||
                      'Sem taxa por empregado nem desconto'}
                  </p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="tabular text-body-sm font-semibold text-fg">{formatBRL(f.amount)}</p>
                  <p className="tabular text-caption text-muted">
                    {change === null ? 'primeira' : change === 0 ? 'sem reajuste' : `${change > 0 ? '+' : '−'}${formatPercent(Math.abs(change))}`}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function ReportSkeleton() {
  return (
    <div className="flex flex-col gap-4" aria-busy="true">
      <Skeleton className="h-56 rounded-xl" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-[76px] rounded-lg" />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-5">
        <Skeleton className="h-72 rounded-xl xl:col-span-3" />
        <Skeleton className="h-72 rounded-xl xl:col-span-2" />
      </div>
    </div>
  );
}
