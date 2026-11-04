import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { Bar, BarChart, CartesianGrid, Tooltip as ChartTooltip, XAxis, YAxis } from 'recharts';
import { ChevronLeft, ChevronRight, Download, Ellipsis, Printer, SlidersHorizontal, X } from 'lucide-react';
import { toast } from 'sonner';
import {
  addMonthKey,
  dateInTimeZone,
  formatDateBR,
  formatMonthKey,
  TASK_KIND_LABELS,
  TASK_KINDS,
  TASK_PRIORITY_LABELS,
  TASK_STATUS_LABELS,
  todayISO,
  type TaskBreakdownRow,
  type TaskKind,
  type TaskOptionsResponse,
  type TaskPriority,
  type TaskProductivityRow,
  type TaskReportResponse,
  type TaskReportRow,
} from '@effinance/shared';
import { axisProps, categoryAxisProps, CHART_COLORS, ChartBox, LegendDot } from '@/components/charts/chart-utils';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Field, Input } from '@/components/ui/input';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { ErrorState, PageHeader } from '@/components/ui/misc';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Sheet } from '@/components/ui/sheet';
import { Skeleton, SkeletonRows } from '@/components/ui/skeleton';
import { Tooltip } from '@/components/ui/tooltip';
import { useAuth } from '@/features/auth/auth-context';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { exportTaskReport, useTaskOptions, useTaskReport } from '../api';
import { shortDate, shortName } from '../due';
import { dateTimeBR } from '../format';
import {
  capRows,
  onTimeRate,
  parseReportFilters,
  rangeLabel,
  REPORT_PAGE_SIZE,
  reportApiFilters,
  reportFilterCount,
  reportHeadline,
  reportRange,
  sortPunctuality,
  toReportQuery,
  writeReportFilters,
  type PunctualityOrder,
  type ReportFilters,
  type ReportPreset,
  type ReportSituation,
} from '../reports-logic';
import { toggleClass, SummaryLabel } from '../components/tasks-summary';
import { ClientPicker, MemberPicker } from '../components/pickers';
import { withSheetParams } from '../task-links';

const PRESETS: { value: ReportPreset; label: string }[] = [
  { value: 'month', label: 'Mês' },
  { value: 'last-3', label: 'Últimos 3 meses' },
  { value: 'last-6', label: 'Últimos 6 meses' },
  { value: 'last-12', label: 'Últimos 12 meses' },
  { value: 'year', label: 'Ano' },
  { value: 'custom', label: 'Personalizado' },
];

/** Paper is white: print in the light theme (also with Ctrl+P), A4 landscape on this page only. */
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
    const style = document.createElement('style');
    style.textContent = '@page { size: A4 landscape; margin: 12mm; }';
    document.head.appendChild(style);
    window.addEventListener('beforeprint', before);
    window.addEventListener('afterprint', after);
    return () => {
      style.remove();
      window.removeEventListener('beforeprint', before);
      window.removeEventListener('afterprint', after);
    };
  }, []);
}

/** Relatórios de tarefas (spec §14): punctuality in the period, where the delay concentrates, export. */
export default function TaskReportsPage() {
  const [params, setParams] = useSearchParams();
  const options = useTaskOptions();
  const { user } = useAuth();
  const today = options.data?.today ?? todayISO();
  const f = parseReportFilters(params, today);
  const range = reportRange(f);
  const report = useTaskReport(toReportQuery(f));
  // The monthly chart: the 6 months up to the period's end when the period is one month.
  const chartRange = f.preset === 'month' ? { from: `${addMonthKey(f.month, -5)}-01`, to: range.to } : range;
  const chart = useTaskReport({ ...chartRange, ...reportApiFilters(f), page: 1, pageSize: 1 });
  const [exporting, setExporting] = useState(false);
  const [printedAt, setPrintedAt] = useState(() => new Date().toISOString());
  usePrintInLight();
  const r = report.data;
  const label = rangeLabel(range);

  function update(patch: Partial<ReportFilters>) {
    setParams(writeReportFilters(params, patch, today), { replace: true });
  }

  async function exportCsv() {
    setExporting(true);
    try {
      await exportTaskReport({ ...range, ...reportApiFilters(f) }, `relatorio-tarefas-${today}.csv`);
      toast.success('CSV exportado.');
    } catch (e) {
      toastError(e);
    } finally {
      setExporting(false);
    }
  }
  const noData = r ? r.summary.total === 0 : true;
  const exportButtons = (
    <>
      <Tooltip content={noData && r ? 'Não há dados para exportar com os filtros atuais.' : null}>
        <span className="inline-flex">
          <Button variant="outline" loading={exporting} disabled={noData} onClick={() => void exportCsv()}>
            <Download /> Exportar CSV
          </Button>
        </span>
      </Tooltip>
      <Button
        variant="outline"
        onClick={() => {
          setPrintedAt(new Date().toISOString());
          requestAnimationFrame(() => window.print());
        }}
      >
        <Printer /> Imprimir ou salvar PDF
      </Button>
    </>
  );

  return (
    <div className="flex flex-col gap-5">
      <PageHeader
        title="Relatórios de tarefas"
        description={r ? reportHeadline(r, label) : label}
        actions={
          <div className="flex flex-wrap items-center gap-2 print:hidden">
            <PeriodControl f={f} onChange={update} />
            <span className="hidden flex-wrap gap-2 sm:flex">{exportButtons}</span>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="sm:hidden" aria-label="Exportar">
                  <Ellipsis />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem icon={<Download />} disabled={noData} onSelect={() => void exportCsv()}>
                  Exportar CSV
                </DropdownMenuItem>
                <DropdownMenuItem icon={<Printer />} onSelect={() => window.print()}>
                  Imprimir ou salvar PDF
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        }
      />
      <ReportFiltersBar f={f} options={options.data} onChange={update} />
      {report.isError && !r ? (
        <ErrorState error={report.error} onRetry={() => report.refetch()} />
      ) : (
        <div className={cn('flex flex-col gap-5', report.isPlaceholderData && 'opacity-60 transition-opacity')}>
          <ReportSummary r={r} situation={f.situation} onSituation={(situation) => update({ situation })} />
          <div className="grid gap-5 lg:grid-cols-12 print:grid-cols-2">
            <Block className="lg:col-span-8 print:col-span-2" title="Pontualidade por mês" subtitle={f.preset === 'month' ? `Concluídas no prazo e com atraso nos últimos 6 meses, até ${formatMonthKey(f.month).split(' ')[0]!.toLowerCase()}` : `Concluídas no prazo e com atraso · ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
              action={
                <span className="hidden gap-3 sm:flex">
                  <LegendDot size="sm" color={CHART_COLORS.brand} label="No prazo" />
                  <LegendDot size="sm" color={CHART_COLORS.danger} label="Com atraso" />
                </span>
              }
            >
              {chart.data ? (
                <MonthlyPunctualityChart rows={chart.data.byMonth} range={chartRange} onPick={(month) => update({ preset: 'month', month })} />
              ) : chart.isError ? (
                <ErrorState error={chart.error} onRetry={() => chart.refetch()} />
              ) : (
                <Skeleton className="h-64 w-full" />
              )}
            </Block>
            <Block className="lg:col-span-4" title="Por situação" subtitle="Atrasadas contam à parte de Em aberto">
              {r ? <StatusBar100 r={r} /> : <SkeletonRows rows={4} />}
            </Block>
            <PunctualityBlock className="lg:col-span-6" title="Por departamento" subtitle="Onde o atraso se concentra" rows={r?.byDepartment} active={f.department} onPick={(key) => update({ department: key ?? '' })} mutedNull="Sem departamento" />
            <AssigneeBlock className="lg:col-span-6" r={r} active={f.assignee} onPick={(key) => update({ assignee: key ?? 'none' })} />
            <PunctualityBlock className="lg:col-span-6" title="Por cliente" rows={r?.byClient} max={8} active={f.client} onPick={(key) => update({ client: key ?? 'internal' })} mutedNull="Interna" />
            <PunctualityBlock className="lg:col-span-6" title="Por categoria" rows={r?.byCategory} active={f.category} onPick={(key) => key && update({ category: key })} mutedNull="Sem categoria" />
          </div>
          <DetailTable r={r} f={f} today={today} label={label} onPage={(page) => update({ page })} onLastMonths={() => update({ preset: 'last-3' })} />
          <p className="hidden text-caption text-muted print:block">
            Gerado em {dateTimeBR(printedAt)}
            {user ? ` por ${user.name}` : ''}.
          </p>
        </div>
      )}
    </div>
  );
}

function PeriodControl({ f, onChange }: { f: ReportFilters; onChange: (p: Partial<ReportFilters>) => void }) {
  const range = reportRange(f);
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Select
        aria-label="Período"
        className="h-10 min-w-[170px] bg-surface font-medium"
        value={f.preset}
        onChange={(e) => {
          const preset = e.target.value as ReportPreset;
          onChange(preset === 'custom' ? { preset, from: range.from, to: range.to } : { preset, from: '', to: '' });
        }}
      >
        {PRESETS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </Select>
      {f.preset === 'month' || f.preset === 'year' ? (
        <div className="flex items-center gap-1 rounded-md border border-border bg-surface p-1 shadow-xs">
          <Button variant="ghost" size="icon-sm" aria-label={f.preset === 'year' ? 'Ano anterior' : 'Mês anterior'} onClick={() => onChange(f.preset === 'year' ? { year: f.year - 1 } : { month: addMonthKey(f.month, -1) })}>
            <ChevronLeft />
          </Button>
          <span className="min-w-[120px] px-1 text-center text-[13px] font-semibold text-fg tabular" aria-live="polite">
            {f.preset === 'year' ? f.year : formatMonthKey(f.month)}
          </span>
          <Button variant="ghost" size="icon-sm" aria-label={f.preset === 'year' ? 'Próximo ano' : 'Próximo mês'} onClick={() => onChange(f.preset === 'year' ? { year: f.year + 1 } : { month: addMonthKey(f.month, 1) })}>
            <ChevronRight />
          </Button>
        </div>
      ) : f.preset === 'custom' ? (
        <div className="flex items-center gap-2">
          <Input type="date" aria-label="De" className="h-10 w-[150px]" value={range.from} onChange={(e) => onChange({ from: e.target.value })} />
          <span className="text-xs text-muted">até</span>
          <Input type="date" aria-label="Até" className="h-10 w-[150px]" value={range.to} onChange={(e) => onChange({ to: e.target.value })} />
        </div>
      ) : (
        <span className="text-xs text-muted">
          {formatDateBR(range.from)} – {formatDateBR(range.to)}
        </span>
      )}
    </div>
  );
}

const SITUATION_GROUPS: { label: string; options: { value: ReportSituation; label: string }[] }[] = [
  {
    label: 'Agrupadas',
    options: [
      { value: 'open', label: 'Em aberto (todas)' },
      { value: 'done', label: 'Concluídas (todas)' },
      { value: 'overdue', label: 'Atrasadas' },
      { value: 'doneLate', label: 'Concluídas com atraso' },
    ],
  },
  {
    label: 'Situação',
    options: (['todo', 'in_progress', 'waiting_client', 'done', 'canceled'] as const).map((s) => ({ value: `status:${s}` as ReportSituation, label: TASK_STATUS_LABELS[s] })),
  },
];

function ReportFiltersBar({ f, options, onChange }: { f: ReportFilters; options: TaskOptionsResponse | undefined; onChange: (p: Partial<ReportFilters>) => void }) {
  const [sheet, setSheet] = useState(false);
  const count = reportFilterCount(f);
  const clear = () => onChange({ department: '', assignee: '', category: '', client: '', situation: '', priority: '', kind: '' });
  const controls = (sm: boolean) => ({
    department: (
      <Select size_={sm ? 'sm' : 'md'} aria-label="Departamento" value={f.department} onChange={(e) => onChange({ department: e.target.value })}>
        <option value="">Todos os departamentos</option>
        {(options?.departments ?? []).map((d) => (
          <option key={d.id} value={d.id}>
            {d.name}
          </option>
        ))}
      </Select>
    ),
    assignee: <MemberPicker size_={sm ? 'sm' : 'md'} value={f.assignee} onChange={(assignee) => onChange({ assignee })} members={options?.members ?? []} allowAll allowNone meFirst aria-label="Responsável" />,
    category: (
      <Select size_={sm ? 'sm' : 'md'} aria-label="Categoria" value={f.category} onChange={(e) => onChange({ category: e.target.value })}>
        <option value="">Todas as categorias</option>
        {(options?.categories ?? []).map((c) => (
          <option key={c.id} value={c.id}>
            {c.name}
          </option>
        ))}
      </Select>
    ),
    client: <ClientPicker size_={sm ? 'sm' : 'md'} value={f.client} onChange={(client) => onChange({ client })} clients={options?.clients ?? []} allowAll allowInternal internalLabel="Internas" aria-label="Cliente" />,
    situation: (
      <Select size_={sm ? 'sm' : 'md'} aria-label="Situação" value={f.situation} onChange={(e) => onChange({ situation: e.target.value as ReportSituation })}>
        <option value="">Todas as situações</option>
        {SITUATION_GROUPS.map((g) => (
          <optgroup key={g.label} label={g.label}>
            {g.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </optgroup>
        ))}
      </Select>
    ),
    priority: (
      <Select size_={sm ? 'sm' : 'md'} aria-label="Prioridade" value={f.priority} onChange={(e) => onChange({ priority: e.target.value as TaskPriority | '' })}>
        <option value="">Todas as prioridades</option>
        {(['urgent', 'high', 'medium', 'low'] as const).map((p) => (
          <option key={p} value={p}>
            {TASK_PRIORITY_LABELS[p]}
          </option>
        ))}
      </Select>
    ),
    kind: (
      <Select size_={sm ? 'sm' : 'md'} aria-label="Tipo" value={f.kind} onChange={(e) => onChange({ kind: e.target.value as TaskKind | '' })}>
        <option value="">Todos os tipos</option>
        {TASK_KINDS.map((k) => (
          <option key={k} value={k}>
            {TASK_KIND_LABELS[k]}
          </option>
        ))}
      </Select>
    ),
  });
  const desk = controls(true);
  const phone = controls(false);
  return (
    <Card className="p-4 print:hidden">
      <div className="hidden gap-2 sm:grid sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-[repeat(7,minmax(0,1fr))_auto]">
        {desk.department}
        {desk.assignee}
        {desk.category}
        {desk.client}
        {desk.situation}
        {desk.priority}
        {desk.kind}
        {count > 0 ? (
          <Button variant="ghost" size="sm" className="h-9" onClick={clear}>
            <X /> Limpar
          </Button>
        ) : null}
      </div>
      <div className="flex items-center gap-2 sm:hidden">
        <Button variant="outline" size="sm" className="h-9" onClick={() => setSheet(true)}>
          <SlidersHorizontal /> Filtros{count ? ` (${count})` : ''}
        </Button>
        {count > 0 ? (
          <Button variant="ghost" size="sm" className="h-9" onClick={clear}>
            <X /> Limpar
          </Button>
        ) : null}
      </div>
      <Sheet
        open={sheet}
        onOpenChange={setSheet}
        title="Filtros"
        description="Refine o relatório de tarefas."
        footer={
          <>
            <Button variant="ghost" onClick={clear}>
              Limpar
            </Button>
            <Button onClick={() => setSheet(false)}>Ver relatório</Button>
          </>
        }
      >
        <div className="flex flex-col gap-4">
          <Field label="Departamento">{phone.department}</Field>
          <Field label="Responsável">{phone.assignee}</Field>
          <Field label="Categoria">{phone.category}</Field>
          <Field label="Cliente">{phone.client}</Field>
          <Field label="Situação">{phone.situation}</Field>
          <Field label="Prioridade">{phone.priority}</Field>
          <Field label="Tipo">{phone.kind}</Field>
        </div>
      </Sheet>
    </Card>
  );
}

function ReportSummary({ r, situation, onSituation }: { r: TaskReportResponse | undefined; situation: ReportSituation; onSituation: (s: ReportSituation) => void }) {
  const s = r?.summary;
  const rate = s && s.done > 0 ? Math.round((s.doneOnTime / s.done) * 100) : null;
  const notCanceled = s ? s.total - s.canceled : 0;
  const toggle = (v: ReportSituation) => onSituation(situation === v ? '' : v);
  const number = (value: ReactNode, tone?: 'danger', big?: boolean) =>
    s ? (
      <span className={cn('tabular mt-1 block leading-10 font-semibold tracking-tight', big ? 'text-[32px] lg:text-[28px] xl:text-[32px]' : 'text-kpi', tone === 'danger' ? 'text-danger' : 'text-fg')}>{value}</span>
    ) : (
      <span className="mt-1 flex h-10 items-center">
        <Skeleton className={big ? 'h-8 w-16' : 'h-6 w-10'} />
      </span>
    );
  return (
    <section aria-label="Resumo do período" className="overflow-hidden rounded-xl border border-border bg-surface print:break-inside-avoid">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-[minmax(0,1.3fr)_repeat(4,minmax(0,1fr))]">
        <div className="col-span-2 min-w-0 p-4 sm:p-5 md:col-span-1">
          <SummaryLabel info="Concluídas até o prazo legal (ou o vencimento, nas avulsas). A meta interna não entra.">No prazo</SummaryLabel>
          {s ? <span className={cn('tabular mt-1 block text-[32px] leading-10 font-semibold tracking-tight lg:text-[28px] xl:text-[32px]', rate === null ? 'text-subtle' : 'text-fg')}>{rate === null ? '—' : `${rate}%`}</span> : number(0, undefined, true)}
          {s ? <p className="mt-1 text-body-sm text-muted">{s.done > 0 ? `${s.doneOnTime} de ${s.done} concluídas` : 'Nenhuma concluída no período.'}</p> : null}
        </div>
        <SummaryButton className="border-t md:border-t-0 md:border-l" pressed={situation === 'done'} label="Concluídas" aria={s ? `Concluídas: ${s.done}. Filtrar.` : 'Concluídas'} onClick={() => toggle('done')}>
          {number(s?.done ?? 0)}
          {s ? <p className="mt-1 text-body-sm text-muted">de {notCanceled} ({notCanceled ? Math.round((s.done / notCanceled) * 100) : 0}% das não canceladas)</p> : null}
        </SummaryButton>
        <SummaryButton className="border-t border-l md:border-t-0" pressed={situation === 'doneLate'} label="Com atraso" aria={s ? `Concluídas com atraso: ${s.doneLate}. Filtrar.` : 'Com atraso'} onClick={() => toggle('doneLate')}>
          {number(s?.doneLate ?? 0, s && s.doneLate > 0 ? 'danger' : undefined)}
          {s ? <p className="mt-1 text-body-sm text-muted">concluídas depois do prazo</p> : null}
        </SummaryButton>
        <SummaryButton className="border-t md:border-l-0 lg:border-t-0 lg:border-l" pressed={situation === 'open'} label="Em aberto" aria={s ? `Em aberto: ${s.open + s.overdue}. Filtrar.` : 'Em aberto'} onClick={() => toggle('open')}>
          {number(s ? s.open + s.overdue : 0)}
          {s ? (
            <p className="mt-1 text-body-sm text-muted">
              {s.overdue > 0 ? (
                <span
                  role="button"
                  tabIndex={0}
                  aria-pressed={situation === 'overdue'}
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle('overdue');
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      e.stopPropagation();
                      toggle('overdue');
                    }
                  }}
                  className={cn('-mx-1 px-1 font-medium text-danger underline decoration-border-strong underline-offset-4', toggleClass)}
                >
                  {s.overdue} {s.overdue === 1 ? 'atrasada' : 'atrasadas'}
                </span>
              ) : (
                'nada atrasado'
              )}
            </p>
          ) : null}
        </SummaryButton>
        <div className="col-span-2 min-w-0 border-t border-border p-4 sm:p-5 md:col-span-1 md:border-l lg:border-t-0">
          <SummaryLabel>Canceladas</SummaryLabel>
          {number(s?.canceled ?? 0)}
          {s ? <p className="mt-1 text-body-sm text-muted">fora das contas</p> : null}
        </div>
      </div>
    </section>
  );
}

function SummaryButton({ className, pressed, label, aria, onClick, children }: { className?: string; pressed: boolean; label: string; aria: string; onClick: () => void; children: ReactNode }) {
  return (
    <div className={cn('min-w-0 border-border p-4 sm:p-5', className)}>
      <div role="button" tabIndex={0} aria-pressed={pressed} aria-label={aria} onClick={onClick} onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && (e.preventDefault(), onClick())} className={cn('-m-2 block cursor-pointer p-2 text-left', toggleClass)}>
        <SummaryLabel>{label}</SummaryLabel>
        {children}
      </div>
    </div>
  );
}

function Block({ title, subtitle, action, className, children }: { title: string; subtitle?: string; action?: ReactNode; className?: string; children: ReactNode }) {
  return (
    <Card className={cn('flex min-w-0 flex-col p-5 print:break-inside-avoid', className)}>
      <CardHeader title={title} subtitle={subtitle} action={action} />
      <div className="mt-3 flex min-h-0 flex-1 flex-col">{children}</div>
    </Card>
  );
}

interface MonthPoint {
  month: string;
  label: string;
  onTime: number;
  late: number;
}

/** Concluded on time (data) and late (danger) per due month (§14.1); a click picks the month. */
function MonthlyPunctualityChart({ rows, range, onPick }: { rows: TaskBreakdownRow[]; range: { from: string; to: string }; onPick: (month: string) => void }) {
  // Every month of the range, the empty ones as zero (a month without conclusions is data too).
  const data = useMemo<MonthPoint[]>(() => {
    const byKey = new Map(rows.filter((r) => r.key).map((r) => [r.key!, r]));
    const out: MonthPoint[] = [];
    for (let m = range.from.slice(0, 7), i = 0; m <= range.to.slice(0, 7) && i < 24; m = addMonthKey(m, 1), i++) {
      const r = byKey.get(m);
      out.push({ month: m, label: formatMonthKey(m, 'short').toLowerCase(), onTime: r?.doneOnTime ?? 0, late: r?.doneLate ?? 0 });
    }
    return out;
  }, [rows, range.from, range.to]);
  if (data.every((d) => d.onTime + d.late === 0)) return <p className="flex h-64 items-center justify-center rounded-lg border border-dashed border-border-strong/80 text-body-sm text-muted">Nenhuma tarefa concluída no período.</p>;
  return (
    <>
      <div className="flex h-64 flex-col" aria-hidden>
        <ChartBox>
          <BarChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }} barCategoryGap="28%" onClick={(e) => {
            const label = (e as { activeLabel?: string } | null)?.activeLabel;
            const point = data.find((d) => d.label === label);
            if (point) onPick(point.month);
          }}>
            <CartesianGrid vertical={false} stroke={CHART_COLORS.grid} strokeDasharray="4 4" />
            <XAxis dataKey="label" {...categoryAxisProps} />
            <YAxis {...axisProps} allowDecimals={false} width={32} />
            <ChartTooltip cursor={{ fill: 'var(--app-bg-subtle)' }} content={<MonthTooltip />} />
            <Bar dataKey="onTime" stackId="m" fill="var(--app-data)" maxBarSize={36} isAnimationActive={false} />
            <Bar dataKey="late" stackId="m" fill={CHART_COLORS.danger} radius={[6, 6, 0, 0]} maxBarSize={36} isAnimationActive={false} />
          </BarChart>
        </ChartBox>
      </div>
      <table className="sr-only">
        <caption>Pontualidade por mês</caption>
        <thead>
          <tr>
            <th>Mês</th>
            <th>No prazo</th>
            <th>Com atraso</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.month}>
              <td>{formatMonthKey(d.month)}</td>
              <td>{d.onTime}</td>
              <td>{d.late}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}

function MonthTooltip({ active, payload }: { active?: boolean; payload?: readonly { payload?: MonthPoint }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  const total = p.onTime + p.late;
  return (
    <div className="rounded-lg border border-border bg-surface px-2.5 py-2 text-caption shadow-lg">
      <p className="font-semibold text-fg">{formatMonthKey(p.month)}</p>
      <p className="text-muted">
        {total} {total === 1 ? 'concluída' : 'concluídas'} · {p.onTime} no prazo{total ? ` (${Math.round((p.onTime / total) * 100)}%)` : ''} · {p.late} com atraso
      </p>
    </div>
  );
}

/** One bar of 100% by situation (concluded, open, overdue, canceled) with the table of the legend. */
function StatusBar100({ r }: { r: TaskReportResponse }) {
  const s = r.summary;
  const parts = [
    { label: 'Concluídas', value: s.done, color: 'var(--app-data)' },
    { label: 'Em aberto', value: s.open, color: 'var(--app-data-soft)' },
    { label: 'Atrasadas', value: s.overdue, color: 'var(--app-danger)' },
    { label: 'Canceladas', value: s.canceled, color: 'var(--app-chart-neutral)' },
  ];
  const total = parts.reduce((n, p) => n + p.value, 0);
  if (total === 0) return <p className="flex flex-1 items-center justify-center rounded-lg border border-dashed border-border-strong/80 py-8 text-body-sm text-muted">Nenhuma tarefa no período.</p>;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(', ')}>
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.label} className="h-full first:rounded-l-full last:rounded-r-full" style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} />
        ))}
      </div>
      <table className="w-full text-body-sm">
        <tbody>
          {parts.map((p) => (
            <tr key={p.label} className="border-b border-border last:border-0">
              <td className="py-1.5">
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: p.color }} aria-hidden />
                  {p.label}
                </span>
              </td>
              <td className="tabular py-1.5 text-right font-semibold text-fg">{p.value}</td>
              <td className="tabular w-14 py-1.5 text-right text-muted">{Math.round((p.value / total) * 100)}%</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface PunctualityBlockProps {
  title: string;
  subtitle?: string;
  rows: TaskBreakdownRow[] | undefined;
  max?: number;
  active: string;
  onPick: (key: string | null) => void;
  className?: string;
  mutedNull?: string;
}

function PunctualityBlock({ title, subtitle, rows, max = 8, active, onPick, className, mutedNull }: PunctualityBlockProps) {
  const [order, setOrder] = useState<PunctualityOrder>('late');
  return (
    <Block className={className} title={title} subtitle={subtitle} action={<OrderControl value={order} onChange={setOrder} />}>
      {rows ? <PunctualityList rows={capRows(sortPunctuality(rows, order), max)} active={active} onPick={onPick} mutedNull={mutedNull} /> : <SkeletonRows rows={4} />}
    </Block>
  );
}

function OrderControl({ value, onChange }: { value: PunctualityOrder; onChange: (v: PunctualityOrder) => void }) {
  return (
    <span className="print:hidden">
      <SegmentedControl<PunctualityOrder>
        size="sm"
        ariaLabel="Ordem"
        value={value}
        onChange={onChange}
        options={[
          { value: 'late', label: 'Mais atrasos' },
          { value: 'delivered', label: 'Mais entregas' },
        ]}
      />
    </span>
  );
}

/** Punctuality per department/person/client/category (§14.1): bar on time vs late, the rate and the counts. */
function PunctualityList({ rows, active, onPick, avatars, mutedNull = 'Sem responsável' }: { rows: TaskBreakdownRow[]; active: string; onPick: (key: string | null) => void; avatars?: boolean; mutedNull?: string }) {
  if (rows.length === 0) return <p className="rounded-lg border border-dashed border-border-strong/80 px-4 py-6 text-center text-body-sm text-muted">Nenhuma tarefa no período.</p>;
  const maxDone = Math.max(1, ...rows.filter((r) => r.key !== '__others__').map((r) => r.done));
  return (
    <ul className="-mx-2 flex flex-col">
      {rows.map((r) => {
        const rate = onTimeRate(r);
        const others = r.key === '__others__';
        const pressed = !others && (r.key ?? '') === active && active !== '';
        const label = r.key === null ? mutedNull : r.label;
        const content = (
          <>
            <span className="flex min-w-0 items-center gap-2 [grid-area:name]">
              {avatars && !others ? <MemberAvatar name={r.key ? r.label : null} unassigned={!r.key} /> : null}
              <span className={cn('truncate text-body-sm', r.key === null || others ? 'text-subtle' : 'text-fg', pressed && 'font-semibold')}>{label}</span>
            </span>
            <span className="mt-1 flex h-2 min-w-0 overflow-hidden [grid-area:bar] @md:mt-0" aria-hidden>
              {r.doneOnTime > 0 ? <span className="h-full rounded-l-full bg-data last:rounded-r-full" style={{ width: `${(r.doneOnTime / maxDone) * 100}%` }} /> : null}
              {r.doneLate > 0 ? <span className="h-full rounded-r-full bg-danger first:rounded-l-full" style={{ width: `${(r.doneLate / maxDone) * 100}%`, marginLeft: r.doneOnTime ? 2 : 0 }} /> : null}
            </span>
            <span className="flex flex-col items-end leading-tight [grid-area:total]">
              <span className="tabular text-[13px] font-semibold text-fg">{rate === null ? '—' : `${rate}%`}</span>
              <span className="tabular text-mini whitespace-nowrap text-muted">
                {r.doneOnTime} no prazo · <span className={r.doneLate ? 'text-danger' : undefined}>{r.doneLate} com atraso</span>
                {r.overdue ? <span className="text-danger"> · {r.overdue} {r.overdue === 1 ? 'atrasada' : 'atrasadas'} em aberto</span> : null}
              </span>
            </span>
          </>
        );
        const cls = cn(
          'grid min-h-12 w-full items-center gap-x-3 rounded-md px-2 py-1.5 text-left',
          "grid-cols-[minmax(0,1fr)_auto] [grid-template-areas:'name_total'_'bar_bar']",
          "@md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] @md:[grid-template-areas:'name_bar_total']",
          !others && toggleClass,
        );
        return (
          <li key={r.key ?? 'none'} className="@container">
            {others ? (
              <div className={cls}>{content}</div>
            ) : (
              <button type="button" aria-pressed={pressed} className={cls} onClick={() => onPick(pressed ? '' : r.key)}>
                {content}
              </button>
            )}
          </li>
        );
      })}
    </ul>
  );
}

/** "Por responsável" with "Quem concluiu" (productivity: who clicked, average days to conclude). */
function AssigneeBlock({ r, active, onPick, className }: { r: TaskReportResponse | undefined; active: string; onPick: (key: string | null) => void; className?: string }) {
  const [mode, setMode] = useState<'assignee' | 'concluder'>('assignee');
  const [order, setOrder] = useState<PunctualityOrder>('late');
  return (
    <Block
      className={className}
      title="Por responsável"
      subtitle={mode === 'concluder' ? 'Conclusões no período por quem clicou, com a média de dias da criação à conclusão' : undefined}
      action={
        <span className="flex flex-wrap justify-end gap-1.5 print:hidden">
          <SegmentedControl<'assignee' | 'concluder'>
            size="sm"
            ariaLabel="Agrupar por"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'assignee', label: 'Responsável' },
              { value: 'concluder', label: 'Quem concluiu' },
            ]}
          />
        </span>
      }
    >
      {!r ? (
        <SkeletonRows rows={4} />
      ) : mode === 'assignee' ? (
        <>
          <div className="mb-2 self-end print:hidden">
            <OrderControl value={order} onChange={setOrder} />
          </div>
          <PunctualityList rows={capRows(sortPunctuality(r.byAssignee, order), 8)} active={active} onPick={onPick} avatars />
        </>
      ) : (
        <ProductivityList rows={r.productivity} />
      )}
    </Block>
  );
}

function ProductivityList({ rows }: { rows: TaskProductivityRow[] }) {
  if (rows.length === 0) return <p className="rounded-lg border border-dashed border-border-strong/80 px-4 py-6 text-center text-body-sm text-muted">Nenhuma conclusão no período.</p>;
  const max = Math.max(1, ...rows.map((r) => r.concluded));
  return (
    <ul className="-mx-2 flex flex-col">
      {[...rows]
        .sort((a, b) => b.concluded - a.concluded)
        .map((r, i) => (
          <li key={r.member?.id ?? `x-${i}`} className="@container">
            <div className="grid min-h-12 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 px-2 py-1.5 [grid-template-areas:'name_total'_'bar_bar'] @md:grid-cols-[minmax(0,10rem)_minmax(0,1fr)_auto] @md:[grid-template-areas:'name_bar_total']">
              <span className="flex min-w-0 items-center gap-2 [grid-area:name]">
                <MemberAvatar name={r.member?.name} unassigned={!r.member} userId={r.member?.id} />
                <span className="truncate text-body-sm text-fg">{r.member?.name ?? 'Pessoa removida'}</span>
              </span>
              <span className="mt-1 flex h-2 overflow-hidden [grid-area:bar] @md:mt-0" aria-hidden>
                {r.onTime ? <span className="h-full rounded-l-full bg-data last:rounded-r-full" style={{ width: `${(r.onTime / max) * 100}%` }} /> : null}
                {r.late ? <span className="h-full rounded-r-full bg-danger first:rounded-l-full" style={{ width: `${(r.late / max) * 100}%`, marginLeft: r.onTime ? 2 : 0 }} /> : null}
              </span>
              <span className="flex flex-col items-end leading-tight [grid-area:total]">
                <span className="tabular text-[13px] font-semibold text-fg">{r.concluded ? `${Math.round((r.onTime / r.concluded) * 100)}%` : '—'}</span>
                <span className="tabular text-mini whitespace-nowrap text-muted">
                  {r.concluded} {r.concluded === 1 ? 'concluída' : 'concluídas'} · {r.onTime} no prazo · <span className={r.late ? 'text-danger' : undefined}>{r.late} com atraso</span>
                  {r.averageDays !== null ? ` · média de ${Math.round(r.averageDays)} ${Math.round(r.averageDays) === 1 ? 'dia' : 'dias'}` : ''}
                </span>
              </span>
            </div>
          </li>
        ))}
    </ul>
  );
}

function rowSituation(row: TaskReportRow): string {
  if (row.status === 'done' || row.status === 'canceled') return TASK_STATUS_LABELS[row.status];
  if (row.overdue) return 'Atrasada';
  if (row.targetMissed) return 'Fora da meta';
  return TASK_STATUS_LABELS[row.status];
}

/** The detail (§14.1, item 5): a table, as it goes to the PDF and the CSV; two lines per row on phones. */
function DetailTable({ r, f, today, label, onPage, onLastMonths }: { r: TaskReportResponse | undefined; f: ReportFilters; today: string; label: string; onPage: (p: number) => void; onLastMonths: () => void }) {
  const [params, setParams] = useSearchParams();
  const items = r?.items;
  const totalPages = items ? Math.max(1, Math.ceil(items.total / items.pageSize)) : 1;
  // A row is one task; a recurring row is the occurrence of one client, which is a task too.
  const open = (row: TaskReportRow) => setParams(withSheetParams(params, { tarefa: row.id }));
  const date = (d: string | null) => (d ? formatDateBR(d) : '—');
  const concludedAt = (iso: string | null) => (iso ? formatDateBR(dateInTimeZone(new Date(iso))) : '—');
  return (
    <Card className="overflow-hidden print:break-before-page">
      <CardHeader title="Detalhamento" className="px-5 pt-5" action={items ? <span className="tabular text-body-sm text-muted">{items.total} {items.total === 1 ? 'tarefa' : 'tarefas'}</span> : null} />
      <div className="mt-3">
        {!items ? (
          <SkeletonRows rows={6} className="p-4" />
        ) : items.items.length === 0 ? (
          <EmptyState
            className="m-4"
            title={`Nenhuma tarefa com vencimento em ${label.charAt(0).toLowerCase()}${label.slice(1)}`}
            action={
              f.preset === 'month' ? (
                <Button variant="outline" onClick={onLastMonths}>
                  Ver últimos 3 meses
                </Button>
              ) : undefined
            }
          />
        ) : (
          <>
            <div className="scrollbar-thin hidden max-h-[70vh] overflow-auto md:block print:block print:max-h-none print:overflow-visible">
              <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-body-sm">
                <thead className="sticky top-0 z-10 bg-surface">
                  <tr className="text-left text-xs text-muted">
                    {['Tarefa', 'Cliente', 'Departamento', 'Categoria', 'Responsável', 'Prioridade'].map((h) => (
                      <th key={h} className="border-b border-border px-3 py-2 font-medium first:pl-5">
                        {h}
                      </th>
                    ))}
                    {['Vencimento', 'Meta'].map((h) => (
                      <th key={h} className="border-b border-border px-3 py-2 text-right font-medium">
                        {h}
                      </th>
                    ))}
                    <th className="border-b border-border px-3 py-2 font-medium">Situação</th>
                    <th className="border-b border-border px-3 py-2 text-right font-medium">Concluída em</th>
                    <th className="border-b border-border px-3 py-2 font-medium">No prazo</th>
                    <th className="border-b border-border px-3 py-2 pr-5 font-medium">Concluída por</th>
                  </tr>
                </thead>
                <tbody>
                  {items.items.map((row) => (
                    <tr key={row.id} onClick={() => open(row)} className="cursor-pointer whitespace-nowrap hover:bg-surface-muted">
                      <td className="max-w-64 truncate border-b border-border px-3 py-2 pl-5 font-medium text-fg">
                        <button type="button" className="max-w-full truncate text-left hover:underline" onClick={(e) => (e.stopPropagation(), open(row))}>
                          {row.title}
                          {row.kind === 'recurring' && row.competence ? <span className="font-normal text-muted"> · {row.competence.slice(5, 7)}/{row.competence.slice(0, 4)}</span> : null}
                        </button>
                      </td>
                      <td className={cn('max-w-44 truncate border-b border-border px-3 py-2', row.client ? 'text-fg' : 'text-subtle')}>{row.client?.name ?? 'Interna'}</td>
                      <td className="border-b border-border px-3 py-2 text-fg">{row.department?.name ?? '—'}</td>
                      <td className="max-w-40 truncate border-b border-border px-3 py-2 text-fg">{row.category?.name ?? '—'}</td>
                      <td className={cn('border-b border-border px-3 py-2', row.assignee ? 'text-fg' : 'text-subtle')}>{row.assignee ? shortName(row.assignee.name) : 'Sem responsável'}</td>
                      <td className="border-b border-border px-3 py-2 text-fg">{TASK_PRIORITY_LABELS[row.priority]}</td>
                      <td className="tabular border-b border-border px-3 py-2 text-right text-fg">{date(row.dueDate)}</td>
                      <td className="tabular border-b border-border px-3 py-2 text-right text-fg">{row.kind === 'recurring' ? date(row.targetDate) : '—'}</td>
                      <td className={cn('border-b border-border px-3 py-2', row.overdue ? 'font-medium text-danger' : row.targetMissed ? 'font-medium text-warning' : 'text-fg')}>{rowSituation(row)}</td>
                      <td className="tabular border-b border-border px-3 py-2 text-right text-fg">{concludedAt(row.completedAt)}</td>
                      <td className="border-b border-border px-3 py-2 text-fg">{row.completedOnTime === null ? '' : row.completedOnTime ? 'Sim' : 'Não'}</td>
                      <td className="border-b border-border px-3 py-2 pr-5 text-fg">{row.completedBy ? shortName(row.completedBy.name) : ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <ul className="divide-y divide-border md:hidden print:hidden">
              {items.items.map((row) => (
                <li key={row.id}>
                  <button type="button" onClick={() => open(row)} className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-surface-muted">
                    <span className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate text-sm font-semibold text-fg">{row.title}</span>
                      <span className={cn('shrink-0 text-xs', row.overdue ? 'font-semibold text-danger' : row.targetMissed ? 'font-semibold text-warning' : 'text-muted')}>{rowSituation(row)}</span>
                    </span>
                    <span className="truncate text-xs text-muted">
                      {[row.client?.name ?? 'Interna', row.assignee ? shortName(row.assignee.name) : 'Sem responsável', row.dueDate ? `vence ${shortDate(row.dueDate, today)}` : 'sem vencimento', row.completedOnTime === null ? null : row.completedOnTime ? 'no prazo' : 'com atraso']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}
      </div>
      {items && items.total > REPORT_PAGE_SIZE ? (
        <div className="flex items-center justify-between border-t border-border px-4 py-3 text-sm text-muted print:hidden">
          <span>
            Página {f.page} de {totalPages} · {items.total} tarefas
          </span>
          <div className="flex gap-1">
            <Button variant="outline" size="icon-sm" disabled={f.page <= 1} onClick={() => onPage(f.page - 1)} aria-label="Página anterior">
              <ChevronLeft />
            </Button>
            <Button variant="outline" size="icon-sm" disabled={f.page >= totalPages} onClick={() => onPage(f.page + 1)} aria-label="Próxima página">
              <ChevronRight />
            </Button>
          </div>
        </div>
      ) : null}
    </Card>
  );
}
