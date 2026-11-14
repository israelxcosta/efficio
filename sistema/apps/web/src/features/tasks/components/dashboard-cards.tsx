import { useState, type ReactNode } from 'react';
import { Link, useNavigate } from 'react-router';
import type { TaskDashboardResponse } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { ErrorState } from '@/components/ui/misc';
import { BodyEmpty, ListSkeleton } from '@/features/dashboard/widgets/shared';
import { FitList, WidgetCard } from '@/features/dashboard/layout/widget-card';
import { cn, pluralize } from '@/lib/utils';
import {
  agendaInsight,
  BAND_DOT,
  conventionBands,
  conventionsInsight,
  documentBands,
  documentsInsight,
  feeBands,
  feesInsight,
  fiscalInsight,
  flowDays,
  flowInsight,
  incompleteText,
  monthElapsed,
  overviewBands,
  overviewInsight,
  processInsight,
  processRows,
  progressHeadline,
  progressSegments,
  severityHeadline,
  taskStatusBands,
  type Band,
  type ConventionBandKey,
} from '../dashboard-logic';
import { DUE_TONE_CLASS, shortDate } from '../due';
import { auditHref, groupDeadlineInfo } from '../occurrence';
import { useTaskActions } from '../task-actions';
import { tasksHref, type TaskFilterPatch } from '../url-state';
import { BandList, SegmentBar, StatusSummary } from './band-list';
import { useDashCols } from './dash-slot';
import type { DashboardList } from './dashboard-list-sheet';
import { useOccurrenceSheetLinks } from './occurrence-row';
import { monthName } from './tasks-summary';

export interface CardProps {
  data: TaskDashboardResponse | undefined;
  loading: boolean;
  error: unknown;
  onRetry: () => void;
}

/** Loading, error (only without data) and the body. */
function Body({ data, loading, error, onRetry, children }: CardProps & { children: (d: TaskDashboardResponse) => ReactNode }) {
  if (loading && !data) return <ListSkeleton rowClassName="h-9" />;
  if (error && !data) return <ErrorState error={error} onRetry={onRetry} className="p-4" />;
  if (!data) return null;
  return <>{children(data)}</>;
}

/** One-line "Ver todos" at the foot of a card (text link: the footer stays one 18px line). */
function SeeAll({ onClick, to, children = 'Ver todos' }: { onClick?: () => void; to?: string; children?: ReactNode }) {
  const cls = 'text-caption font-medium text-brand-text hover:underline';
  return to ? (
    <Link to={to} className={cls}>
      {children} →
    </Link>
  ) : (
    <button type="button" onClick={onClick} className={cls}>
      {children} →
    </button>
  );
}

/** "Today" mark on a progress bar of the competence: only while the month is running. */
function todayMark(today: string, month: string): { at: number; label: string } | undefined {
  const at = monthElapsed(today, month);
  return at > 0 && at < 1 ? { at, label: `dia ${Number(today.slice(8, 10))}` } : undefined;
}

const SITUATION = { overdue: 'overdue', pending: 'open', concluded: 'done' } as const;

/**
 * "Situação das tarefas": StatusCard L (hero with the share concluded, progress bar with the "today"
 * mark, then the bands with their share), each band the filtered list.
 */
export function TaskStatusCard(p: CardProps & { base: TaskFilterPatch }) {
  const navigate = useNavigate();
  const s = p.data ? taskStatusBands(p.data.taskStatus) : null;
  const ts = p.data?.taskStatus;
  return (
    <WidgetCard
      title="Situação das tarefas"
      subtitle={
        p.data && ts ? (
          <>
            Competência de {monthName(p.data.month)} ·{' '}
            {ts.overdue ? <span className="text-danger">{pluralize(ts.overdue, 'atrasada', 'atrasadas')}</span> : 'nenhuma atrasada'}
          </>
        ) : (
          'Recorrentes e avulsas do mês'
        )
      }
      info="Obrigações recorrentes da competência e tarefas avulsas que vencem no mês. Aqui, Atrasadas conta só as da competência; o número do topo conta todas as abertas depois do prazo. A marca na barra é o dia de hoje no mês."
    >
      <Body {...p}>
        {(d) =>
          d.taskStatus.total === 0 ? (
            <BodyEmpty title="Nenhuma tarefa no mês" />
          ) : (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <StatusSummary
                hero={progressHeadline(d.taskStatus.concluded, d.taskStatus.total)}
                segments={progressSegments({ done: d.taskStatus.concluded, overdue: d.taskStatus.overdue, pending: d.taskStatus.pending })}
                marker={todayMark(d.today, d.month)}
              />
              <BandList
                className="min-w-0"
                ariaLabel="Situação das tarefas (abre a lista)"
                bands={s!.bands}
                total={d.taskStatus.total}
                onSelect={(k) => navigate(tasksHref({ ...p.base, situation: SITUATION[k], ...(k === 'concluded' ? { month: d.month } : {}) }))}
              />
            </div>
          )
        }
      </Body>
    </WidgetCard>
  );
}

/** "Fluxo de tarefas por dia": open work per work date, today and the next 6 days. */
export function FlowCard(p: CardProps & { base: TaskFilterPatch }) {
  return (
    <WidgetCard
      title="Fluxo de tarefas por dia"
      subtitle={p.data ? flowInsight(flowDays(p.data.flow, p.data.today)) : 'Em aberto, pela data de trabalho, nos próximos 7 dias'}
      info="Tarefas em aberto pela data de trabalho (a meta interna, nas recorrentes), hoje e nos próximos 6 dias. Clique num dia para ver a lista."
    >
      <Body {...p}>
        {(d) => {
          const days = flowDays(d.flow, d.today);
          const max = Math.max(1, ...days.map((x) => x.total));
          return (
            <div className="flex min-h-0 flex-1 flex-col">
              <ol className="flex min-h-0 flex-1 items-stretch gap-1.5" aria-label="Tarefas em aberto por dia (abre a lista do dia)">
                {days.map((x) => (
                  <li key={x.date} className="flex min-w-0 flex-1">
                    <Link
                      to={tasksHref({ ...p.base, dueDate: x.date as never })}
                      aria-label={`${x.label === 'Hoje' ? 'Hoje' : x.label}: ${x.total} em aberto (${x.recurring} recorrentes, ${x.standalone} avulsas).`}
                      className="group/day flex min-w-0 flex-1 flex-col items-center gap-1 rounded-md px-0.5 pt-1 transition-colors hover:bg-surface-muted"
                    >
                      <span className="tabular text-caption font-semibold text-fg">{x.total || ''}</span>
                      <span className="flex w-full max-w-10 min-h-0 flex-1 flex-col justify-end">
                        <span className="flex w-full flex-col overflow-hidden rounded-t-md" style={{ height: `${(x.total / max) * 100}%` }}>
                          {x.standalone ? <span className="w-full bg-data/45" style={{ flexGrow: x.standalone }} /> : null}
                          {x.recurring ? <span className="w-full bg-data" style={{ flexGrow: x.recurring }} /> : null}
                        </span>
                        <span className="h-px w-full bg-border" />
                      </span>
                      <span
                        className={cn(
                          'flex flex-col items-center pb-1 text-caption leading-tight',
                          x.label === 'Hoje' ? 'font-semibold text-fg' : WEEKEND.test(x.label) ? 'text-subtle' : 'text-muted',
                        )}
                      >
                        <span>{x.label.split(' ')[0]}</span>
                        <span className="tabular">{x.date.slice(8, 10)}</span>
                      </span>
                    </Link>
                  </li>
                ))}
              </ol>
              <p className="mt-2 flex shrink-0 items-center gap-4 text-caption text-muted">
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-data" aria-hidden /> Recorrentes
                </span>
                <span className="flex items-center gap-1.5">
                  <span className="size-2 rounded-full bg-data/45" aria-hidden /> Avulsas
                </span>
              </p>
            </div>
          );
        }}
      </Body>
    </WidgetCard>
  );
}

const WEEKEND = /^(sáb|dom) /;

function Legend({ items }: { items: { label: string; className: string }[] }) {
  return (
    <p className="mt-2 flex shrink-0 flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted">
      {items.map((i) => (
        <span key={i.label} className="flex items-center gap-1.5">
          <span className={cn('size-2 rounded-full', i.className)} aria-hidden /> {i.label}
        </span>
      ))}
    </p>
  );
}

/** "Processos por departamento": the competence's obligations per department (done, pending, overdue). */
export function ProcessesCard(p: CardProps) {
  return (
    <WidgetCard
      title="Processos por departamento"
      subtitle={(p.data && processInsight(p.data.processes)) ?? (p.data ? `Obrigações de ${monthName(p.data.month)}` : 'Obrigações do mês')}
      info="Obrigações recorrentes da competência por departamento: concluídas, atrasadas e pendentes. Clique para abrir na auditoria."
    >
      <Body {...p}>
        {(d) => {
          const rows = processRows(d.processes);
          if (!rows.length) return <BodyEmpty title="Nenhuma obrigação na competência" />;
          return (
            <div className="flex min-h-0 flex-1 flex-col">
              <FitList
                items={rows}
                getKey={(r) => r.department?.id ?? 'none'}
                moreLabel={['departamento', 'departamentos']}
                className="flex flex-col gap-0.5"
                renderItem={(r) => {
                  const live = r.done + r.pending + r.overdue;
                  const href = `/tarefas/auditoria?${new URLSearchParams({ competencia: d.month, ...(r.department ? { departamento: r.department.id } : {}) })}`;
                  return (
                    <Link
                      to={href}
                      aria-label={`${r.department?.name ?? 'Sem departamento'}: ${r.done} de ${live} concluídas${r.overdue ? `, ${r.overdue} atrasadas` : ''}. Ver na auditoria.`}
                      className="grid min-h-11 grid-cols-[minmax(0,1fr)_4.5rem] items-center gap-x-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted @md:grid-cols-[minmax(0,9rem)_minmax(0,1fr)_4.5rem]"
                    >
                      <span className="min-w-0">
                        <span className={cn('block truncate text-body-sm', r.department ? 'text-fg' : 'text-subtle')}>{r.department?.name ?? 'Sem departamento'}</span>
                        <span className="block truncate text-caption text-muted">{pluralize(r.recurringCount, 'recorrente', 'recorrentes')}</span>
                      </span>
                      <SegmentBar
                        className="col-span-2 row-start-2 mt-1 @md:col-span-1 @md:row-start-auto @md:mt-0"
                        segments={progressSegments({ done: r.done, overdue: r.overdue, pending: r.pending })}
                      />
                      <span className="flex flex-col items-end leading-tight @md:row-start-auto">
                        <span className="tabular text-body-sm font-semibold text-fg">
                          {r.done}/{live}
                        </span>
                        {r.overdue ? <span className="tabular text-mini whitespace-nowrap text-danger">{pluralize(r.overdue, 'atrasada', 'atrasadas')}</span> : null}
                      </span>
                    </Link>
                  );
                }}
              />
              <Legend
                items={[
                  { label: 'Concluídas', className: BAND_DOT.success },
                  { label: 'Atrasadas', className: BAND_DOT.danger },
                  { label: 'Pendentes', className: BAND_DOT.muted },
                ]}
              />
            </div>
          );
        }}
      </Body>
    </WidgetCard>
  );
}

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "Agenda": legal deadlines of the next 7 days; "+ vencidas" adds the ones of this month with pending work. */
export function AgendaCard(p: CardProps) {
  const [past, setPast] = useState(false);
  const { openOccurrence } = useOccurrenceSheetLinks();
  const overdueCount = p.data?.agenda.overdue.length ?? 0;
  return (
    <WidgetCard
      title="Agenda"
      subtitle={past ? 'Vencidas neste mês, com pendências' : p.data ? agendaInsight(p.data.agenda.upcoming, p.data.today) : 'Prazos legais dos próximos 7 dias'}
      info="Prazos legais das obrigações recorrentes nos próximos 7 dias (hoje incluído). O botão de vencidas mostra as deste mês que ainda têm pendências."
      action={
        overdueCount ? (
          <Button variant="ghost" size="sm" aria-pressed={past} onClick={() => setPast((v) => !v)} className={cn('h-7', past && 'bg-bg-subtle text-fg')}>
            {past ? 'Próximos 7 dias' : `+ ${overdueCount} ${overdueCount === 1 ? 'vencida' : 'vencidas'}`}
          </Button>
        ) : null
      }
    >
      <Body {...p}>
        {(d) => {
          const items = past ? d.agenda.overdue : d.agenda.upcoming;
          if (!items.length) return <BodyEmpty title={past ? 'Nada vencido neste mês.' : 'Nenhum prazo legal nos próximos 7 dias.'} />;
          return (
            <FitList
              items={items}
              getKey={(o) => `${o.recurringTaskId}:${o.periodKey}`}
              moreLabel={['prazo', 'prazos']}
              className="flex flex-col gap-0.5"
              renderItem={(o) => {
                const live = o.total - o.canceled;
                const dl = groupDeadlineInfo(o, d.today, true);
                const day = new Date(`${o.legalDueDate}T12:00:00`).getDay();
                return (
                  <button
                    type="button"
                    onClick={() => openOccurrence(o)}
                    className="flex min-h-12 w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-surface-muted"
                  >
                    <span className={cn('flex w-11 shrink-0 flex-col items-center rounded-md border py-1 leading-tight', o.overdue ? 'border-danger/40 text-danger' : 'border-border text-fg')}>
                      <span className="tabular text-body-sm font-semibold">{o.legalDueDate.slice(8, 10)}</span>
                      <span className="text-mini text-muted">{WEEKDAY[day]}</span>
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-body-sm font-semibold text-fg">{o.name}</span>
                      <span className={cn('block truncate text-caption', DUE_TONE_CLASS[dl.tone])}>
                        {o.pending ? `${o.pending} de ${live} pendentes` : 'Concluída'} · {dl.text}
                      </span>
                    </span>
                    <span className="tabular shrink-0 text-caption text-muted">{shortDate(o.legalDueDate, d.today)}</span>
                  </button>
                );
              }}
            />
          );
        }}
      </Body>
    </WidgetCard>
  );
}

/** "Pendências fiscais": the competence in a ring and each obligation with its done/pending/overdue bar. */
export function FiscalCard(p: CardProps) {
  const navigate = useNavigate();
  return (
    <WidgetCard
      title="Pendências fiscais"
      subtitle={p.data ? (p.data.fiscal.totals.total ? fiscalInsight(p.data.fiscal.totals) : `Obrigações de ${monthName(p.data.month)}`) : 'Obrigações do mês'}
      info="Obrigações fiscais da competência, atrasadas primeiro. A barra é o progresso da competência; a marca, o dia de hoje no mês."
      action={
        <Button variant="ghost" size="sm" asChild className="h-7">
          <Link to="/tarefas/auditoria">Auditoria</Link>
        </Button>
      }
    >
      <Body {...p}>
        {(d) => {
          const t = d.fiscal.totals;
          if (!t.total) return <BodyEmpty title="Nenhuma obrigação na competência" />;
          const bands = [
            { key: 'overdue' as const, label: 'Atrasadas', count: t.overdue, tone: 'danger' as const },
            { key: 'pending' as const, label: 'Pendentes', count: t.pending, tone: 'muted' as const },
            { key: 'done' as const, label: 'Concluídas', count: t.done, tone: 'success' as const },
          ];
          return (
            <div className="flex min-h-0 flex-1 gap-5 @max-md:flex-col">
              <div className="flex shrink-0 flex-col gap-3 @md:w-56">
                <StatusSummary
                  hero={progressHeadline(t.done, t.total)}
                  segments={progressSegments({ done: t.done, overdue: t.overdue, pending: t.pending })}
                  marker={todayMark(d.today, d.month)}
                />
                <BandList
                  className="min-w-0"
                  ariaLabel="Pendências fiscais (abre a auditoria)"
                  bands={bands}
                  total={t.total}
                  onSelect={(k) => navigate(`/tarefas/auditoria?${new URLSearchParams({ competencia: d.month, ...(k === 'done' ? {} : { clientes: 'pendentes' }) })}`)}
                />
              </div>
              <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                <FitList
                  items={d.fiscal.items}
                  getKey={(o) => `${o.recurringTaskId}:${o.periodKey}`}
                  moreLabel={['obrigação', 'obrigações']}
                  moreHref="/tarefas/auditoria?visao=tarefa"
                  className="flex flex-col gap-0.5"
                  renderItem={(o) => {
                    const live = o.total - o.canceled;
                    return (
                      <Link
                        to={auditHref(o)}
                        aria-label={`${o.name}: ${o.done} de ${live} concluídas${o.overdue ? ', prazo legal vencido' : ''}. Ver na auditoria.`}
                        className="grid min-h-10 grid-cols-[minmax(0,1fr)_3.5rem] items-center gap-x-3 gap-y-1 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted"
                      >
                        <span className={cn('truncate text-body-sm', o.overdue ? 'font-medium text-danger' : 'text-fg')}>{o.name}</span>
                        <span className="tabular row-span-2 text-right text-body-sm font-semibold text-fg">
                          {o.done}/{live}
                        </span>
                        <SegmentBar
                          segments={[
                            { value: o.done, tone: 'success' },
                            { value: o.pending, tone: o.overdue ? 'danger' : 'muted' },
                          ]}
                        />
                      </Link>
                    );
                  }}
                />
              </div>
            </div>
          );
        }}
      </Body>
    </WidgetCard>
  );
}

/** "Visão geral dos clientes": Atenção, Pendências, Em dia — each band lists the clients. */
export function ClientsOverviewCard(p: CardProps & { onList: (l: DashboardList) => void }) {
  return (
    <WidgetCard
      title="Visão geral dos clientes"
      subtitle={p.data ? overviewInsight(p.data.clientsOverview.counts) : 'Clientes ativos'}
      info={p.data ? `Clientes ativos em ${monthName(p.data.month)}, pela situação das obrigações da competência.` : undefined}
    >
      <Body {...p}>
        {(d) => {
          const bands = overviewBands(d.clientsOverview.counts);
          const total = bands.reduce((s, b) => s + b.count, 0);
          if (!total) return <BodyEmpty title="Nenhum cliente ativo" />;
          const head = severityHeadline(bands);
          const hero = { ...head, label: head.tone === 'danger' ? 'em atenção' : head.tone === 'warning' ? 'com pendências' : head.label };
          return (
            <div className="flex min-h-0 flex-1 flex-col gap-4">
              <StatusSummary hero={hero} segments={bands.map((b) => ({ value: b.count, tone: b.tone }))} />
              <BandList className="min-w-0" ariaLabel="Clientes por situação (abre a lista)" bands={bands} total={total} onSelect={(k) => p.onList({ kind: 'clients', band: k })} />
            </div>
          );
        }}
      </Body>
    </WidgetCard>
  );
}

/** "Certificados digitais" or "Laudos": Effy's bands, each one the list of documents. */
export function DocumentsCard(p: CardProps & { kind: 'certificates' | 'documents'; onList: (l: DashboardList) => void }) {
  const docs = p.data ? (p.kind === 'certificates' ? p.data.certificates : p.data.documents) : null;
  const title = p.kind === 'certificates' ? 'Certificados digitais' : 'Laudos';
  return (
    <WidgetCard
      title={title}
      subtitle={docs ? (docs.total ? documentsInsight(documentBands(docs)) : 'Nenhum cadastrado') : 'Clientes ativos'}
      info={`${p.kind === 'certificates' ? 'Certificados digitais (e-CNPJ) cadastrados no financeiro.' : 'Certidões, alvarás, licenças e demais documentos com validade, cadastrados no financeiro.'}${docs ? ` ${pluralize(docs.total, 'cadastrado', 'cadastrados')} nos clientes ativos.` : ''}`}
      footer={docs?.total ? <SeeAll onClick={() => p.onList({ kind: p.kind, band: null })} /> : null}
    >
      <Body {...p}>
        {() =>
          !docs || docs.total === 0 ? (
            <BodyEmpty title={p.kind === 'certificates' ? 'Nenhum certificado cadastrado' : 'Nenhum laudo cadastrado'} description="Cadastre no cliente, no financeiro." />
          ) : (
            <StatusBands bands={documentBands(docs)} ariaLabel={`${title} por situação (abre a lista)`} onSelect={(k) => p.onList({ kind: p.kind, band: k })} />
          )
        }
      </Body>
    </WidgetCard>
  );
}

/** StatusCard M: the distribution bar over the bands (each with its share); dense bands go in 2 columns on wide cards. */
function StatusBands<K extends string>({ bands, ariaLabel, onSelect, dense }: { bands: Band<K>[]; ariaLabel: string; onSelect: (k: K) => void; dense?: boolean | 'tight' }) {
  const total = bands.reduce((a, b) => a + b.count, 0);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <StatusSummary segments={bands.map((b) => ({ value: b.count, tone: b.tone }))} />
      <BandList className={cn('min-w-0', dense && '@lg:grid @lg:grid-cols-2 @lg:gap-x-6')} ariaLabel={ariaLabel} bands={bands} total={total} dense={dense} onSelect={onSelect} />
    </div>
  );
}

const CONVENTION_GROUP: Partial<Record<ConventionBandKey, 'overdue' | 'within30' | 'within60'>> = { overdue: 'overdue', within30: 'within30', within60: 'within60' };

/** "Convenções coletivas": base dates of the unions; the bands open the conventions of the deadlines sheet. */
export function ConventionsCard(p: CardProps) {
  const cols = useDashCols();
  const { openDeadlines } = useTaskActions();
  const navigate = useNavigate();
  return (
    <WidgetCard
      title="Convenções coletivas"
      subtitle={p.data ? (p.data.conventions.total ? conventionsInsight(conventionBands(p.data.conventions)) : 'Nenhum sindicato') : 'Sindicatos'}
      info={p.data ? `Datas-base das convenções de ${pluralize(p.data.conventions.total, 'sindicato ativo', 'sindicatos ativos')}.` : undefined}
      footer={p.data?.conventions.total ? <SeeAll to="/tarefas/cadastros?aba=sindicatos" /> : null}
    >
      <Body {...p}>
        {(d) =>
          d.conventions.total === 0 ? (
            <BodyEmpty
              title="Nenhum sindicato cadastrado"
              action={
                <Button variant="outline" size="sm" asChild>
                  <Link to="/tarefas/cadastros?aba=sindicatos">Ir para Sindicatos</Link>
                </Button>
              }
            />
          ) : (
            <StatusBands
              dense={cols === 4 ? true : 'tight'}
              ariaLabel="Convenções por data-base (abre a lista)"
              bands={conventionBands(d.conventions)}
              onSelect={(k) => (k === 'noDate' ? navigate('/tarefas/cadastros?aba=sindicatos') : openDeadlines('conventions', CONVENTION_GROUP[k]))}
            />
          )
        }
      </Body>
    </WidgetCard>
  );
}

/** "Honorários próximos de vencer" (finance only): fee periods ending, each band the list of clients. */
export function FeesCard(p: CardProps & { onList: (l: DashboardList) => void }) {
  const fees = p.data?.fees;
  return (
    <WidgetCard
      title="Honorários próximos de vencer"
      subtitle={fees ? feesInsight(feeBands(fees)) : 'Vigência anual dos contratos'}
      info="Vigências anuais dos contratos que terminam em até 60 dias ou já terminaram sem uma nova. Só para quem acessa o financeiro."
      footer={fees && fees.within30.length + fees.within60.length > 0 ? <SeeAll onClick={() => p.onList({ kind: 'fees', band: null })} /> : null}
    >
      <Body {...p}>
        {() =>
          !fees ? null : fees.within30.length + fees.within60.length === 0 ? (
            <BodyEmpty title="Nenhuma vigência termina em 60 dias" />
          ) : (
            <StatusBands ariaLabel="Honorários por vencimento (abre a lista)" bands={feeBands(fees)} onSelect={(k) => p.onList({ kind: 'fees', band: k })} />
          )
        }
      </Body>
    </WidgetCard>
  );
}

/** "Cadastro incompleto" (`registry`): clients with registry fields missing for their regime. */
export function IncompleteCard(p: CardProps & { onList: (l: DashboardList) => void; canFinance: boolean }) {
  const inc = p.data?.incomplete;
  return (
    <WidgetCard
      title="Cadastro incompleto"
      subtitle={inc ? (inc.count ? `${pluralize(inc.count, 'cliente', 'clientes')} · média de ${inc.averagePercent}% preenchido` : 'Todos os cadastros completos') : 'Clientes ativos'}
      info="Inscrições, senha do contador, código de acesso e anexo do Simples (quando se aplicam ao regime) e certificado digital."
      footer={inc?.count ? <SeeAll onClick={() => p.onList({ kind: 'incomplete' })}>{`Ver todos (${inc.count})`}</SeeAll> : null}
    >
      <Body {...p}>
        {() =>
          !inc ? null : inc.items.length === 0 ? (
            <BodyEmpty title="Nenhum cadastro incompleto" />
          ) : (
            <FitList
              items={inc.items}
              total={inc.count}
              showMore={false}
              getKey={(c) => c.client.id}
              moreLabel={['cliente', 'clientes']}
              className="flex flex-col gap-0.5"
              renderItem={(c) => (
                <Link
                  to={p.canFinance ? `/clientes?editar=${c.client.id}` : `/tarefas/clientes?cliente=${c.client.id}`}
                  className="flex min-h-12 items-center gap-3 rounded-md px-2 py-1.5 transition-colors hover:bg-surface-muted"
                >
                  <span className="min-w-0 flex-1 @3xl:flex @3xl:items-center @3xl:gap-4">
                    <span className="block truncate text-body-sm font-semibold text-fg @3xl:w-56 @3xl:shrink-0">{c.client.name}</span>
                    <span className="block truncate text-caption text-muted @3xl:min-w-0 @3xl:flex-1">{incompleteText(c)}</span>
                  </span>
                  <span className="flex w-20 shrink-0 flex-col items-end gap-1 @3xl:w-32">
                    <span className="tabular text-caption font-medium text-fg">{c.percent}%</span>
                    <span className="block h-1.5 w-full overflow-hidden rounded-full bg-bg-subtle" aria-hidden>
                      <span className="block h-full rounded-full bg-data" style={{ width: `${c.percent}%` }} />
                    </span>
                  </span>
                </Link>
              )}
            />
          )
        }
      </Body>
    </WidgetCard>
  );
}

