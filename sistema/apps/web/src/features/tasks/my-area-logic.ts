// Minha área (spec §15.4): the greeting by the office hour, the description of the header, the four
// numbers, the insights (icon, link, finding), the finding of "Seu ritmo" and "Minhas tarefas" by
// client. Pure functions, tested in my-area-logic.test.ts.

import {
  addDays,
  addMonthKey,
  TASK_TIME_ZONE,
  type ISODate,
  type RecurringOccurrence,
  type Task,
  type TaskInsight,
  type TaskInsightKey,
  type TaskMyOverviewResponse,
} from '@effinance/shared';
import { CalendarClock, CalendarDays, CalendarRange, CircleAlert, CircleCheck, CirclePause, Hourglass, TrendingUp, Users, type LucideIcon } from 'lucide-react';
import type { MetricCell } from '@/components/ui/metric-strip';
import { daysText, firstName, shortDate } from './due';
import { longDay } from './format';
import { competenceName, occurrenceKey, type ListItem } from './occurrence';
import { tasksHref } from './url-state';

/** "Bom dia, Marina" (until 11:59), "Boa tarde, Marina" (12:00–17:59), "Boa noite, Marina" (18:00 on). */
export function greeting(hour: number, name: string): string {
  const first = firstName(name);
  if (hour < 12) return `Bom dia, ${first}`;
  if (hour < 18) return `Boa tarde, ${first}`;
  return `Boa noite, ${first}`;
}

const hourFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TASK_TIME_ZONE, hour: 'numeric', hourCycle: 'h23' });

/** The hour (0–23) in the office time zone. */
export function officeHour(now: Date): number {
  return Number(hourFormat.formatToParts(now).find((p) => p.type === 'hour')?.value ?? now.getHours()) % 24;
}

/** "Quinta-feira, 5 de novembro · Colaborador · Fiscal · atualizado às 14:32" (no department, no part). */
export function myAreaDescription(today: ISODate, roleLabel: string, department: string | null, updated: string): string {
  return [longDay(today), roleLabel, department, updated].filter(Boolean).join(' · ');
}

const monthName = (month: string) => competenceName(month).split(' ')[0]!;
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Appointments of today among the next items (tasks with a time), and the next one by the time. */
export function appointmentsToday(o: TaskMyOverviewResponse): { count: number; next: string | null } {
  const times = o.upcoming.tasks
    .filter((t) => t.dueDate === o.today && t.startTime)
    .map((t) => t.startTime!)
    .sort();
  return { count: times.length, next: times[0] ?? null };
}

/** The four cells of the strip (spec §15.4): each one links to "Minhas" with its filter. */
export function myMetricCells(o: TaskMyOverviewResponse, appointments: { count: number; next: string | null }): MetricCell[] {
  const prevMonth = addMonthKey(o.month, -1);
  const prev = o.productivity.trend.find((p) => p.month === prevMonth) ?? null;
  const done = o.productivity.concluded;
  const doneFooter =
    done > 0 && o.productivity.onTimeRate !== null
      ? `${o.productivity.onTimeRate}% no prazo${prev ? ` · ${monthName(prevMonth)}: ${prev.concluded}` : ''}`
      : prev
        ? `${monthName(prevMonth)}: ${prev.concluded}`
        : 'nenhuma ainda';
  const oldest = o.open.oldestOverdue;
  return [
    {
      key: 'overdue',
      label: 'Atrasadas',
      value: o.open.overdue,
      footer: o.open.overdue > 0 && oldest ? `a mais antiga venceu há ${daysText(oldest.daysOverdue)}` : 'nada atrasado',
      footerTitle: o.open.overdue > 0 && oldest ? oldest.title : undefined,
      href: tasksHref({ scope: 'mine', situation: 'overdue' }),
      hero: true,
      tone: o.open.overdue > 0 ? 'danger' : undefined,
    },
    {
      key: 'today',
      label: 'Hoje',
      value: o.open.dueToday,
      footer: appointments.count
        ? `${plural(appointments.count, 'compromisso', 'compromissos')}${appointments.next ? ` · próximo às ${appointments.next}` : ''}`
        : 'nenhum compromisso',
      href: tasksHref({ scope: 'mine', dueDate: o.today }),
    },
    {
      key: 'next7',
      label: 'Próximos 7 dias',
      value: o.open.next7Days,
      footer: `até ${shortDate(addDays(o.today, 7), o.today)}`,
      href: tasksHref({ scope: 'mine' }),
    },
    {
      key: 'concluded',
      label: `Concluídas em ${monthName(o.month)}`,
      value: done,
      footer: doneFooter,
      href: tasksHref({ scope: 'mine', situation: 'done', month: o.month }),
    },
  ];
}

/** Neutral 16px icon of each insight (the text is always the API's). */
export const INSIGHT_ICONS: Record<TaskInsightKey, LucideIcon> = {
  overdue: CircleAlert,
  dueToday: CalendarClock,
  dueTomorrow: CalendarDays,
  targetMissed: Hourglass,
  waitingClient: CirclePause,
  onTimeRate: TrendingUp,
  rateTrend: TrendingUp,
  department: Users,
  busiestWeekday: CalendarRange,
  allClear: CircleCheck,
};

/** The filter of "Minhas" an insight opens; null without a link. Other due groups stay in the list. */
export function insightHref(link: TaskInsight['link']): string | null {
  if (!link) return null;
  if (link.situation) return tasksHref({ scope: 'mine', situation: link.situation });
  if (link.dueDate) return tasksHref({ scope: 'mine', dueDate: link.dueDate });
  if (link.dueBucket === 'overdue') return tasksHref({ scope: 'mine', situation: 'overdue' });
  return tasksHref({ scope: 'mine' });
}

/** "2 pedem atenção", "1 pede atenção" or "Tudo em dia" (danger and warning ask attention). */
/** Insights the strip on top already shows ("Atrasadas", "Hoje"): Para você leaves them out (spec §3, Q2). */
const IN_THE_STRIP: ReadonlySet<TaskInsight['key']> = new Set(['overdue', 'dueToday']);

export function forYouInsights(insights: readonly TaskInsight[]): { shown: TaskInsight[]; hidden: number } {
  const shown = insights.filter((i) => !IN_THE_STRIP.has(i.key));
  return { shown, hidden: insights.length - shown.length };
}

export function insightsFinding(insights: TaskInsight[]): string {
  const n = insights.filter((i) => i.tone === 'danger' || i.tone === 'warning').length;
  if (n === 0) return 'Tudo em dia';
  return n === 1 ? '1 pede atenção' : `${n} pedem atenção`;
}

/** "novembro: 12 concluídas, 92% no prazo · +4 p.p. sobre outubro". */
export function rhythmFinding(o: TaskMyOverviewResponse, month: string, prevMonth: string): string {
  const p = o.productivity;
  if (p.concluded === 0) return `${month}: nenhuma concluída ainda`;
  const rate = p.onTimeRate !== null ? `, ${p.onTimeRate}% no prazo` : '';
  const change = p.rateChange !== null && p.rateChange !== 0 ? ` · ${p.rateChange > 0 ? '+' : ''}${p.rateChange} p.p. sobre ${prevMonth}` : '';
  return `${month}: ${plural(p.concluded, 'concluída', 'concluídas')}${rate}${change}`;
}

/**
 * "Minhas tarefas" by client: "Obrigações" first (the registry's occurrences, aggregated), then each
 * client (most items first, then by name) and "Interna" last.
 */
export function groupMineByClient(tasks: Task[], occurrences: RecurringOccurrence[]): { key: string; label: string; items: ListItem[] }[] {
  const out: { key: string; label: string; items: ListItem[] }[] = [];
  if (occurrences.length) {
    out.push({
      key: 'obligations',
      label: 'Obrigações',
      items: occurrences.map((o) => ({ type: 'occurrence', key: occurrenceKey(o), occurrence: o, work: o.targetDate })),
    });
  }
  const byClient = new Map<string, { label: string; items: ListItem[] }>();
  const internal: ListItem[] = [];
  for (const t of tasks) {
    const item: ListItem = { type: 'task', key: t.id, task: t, work: t.occurrence?.targetDate ?? t.dueDate };
    if (!t.client) {
      internal.push(item);
      continue;
    }
    const group = byClient.get(t.client.id) ?? { label: t.client.name, items: [] };
    group.items.push(item);
    byClient.set(t.client.id, group);
  }
  const clients = [...byClient.entries()].sort(([, a], [, b]) => b.items.length - a.items.length || a.label.localeCompare(b.label, 'pt-BR'));
  for (const [id, g] of clients) out.push({ key: id, label: g.label, items: g.items });
  if (internal.length) out.push({ key: 'internal', label: 'Interna', items: internal });
  return out;
}
