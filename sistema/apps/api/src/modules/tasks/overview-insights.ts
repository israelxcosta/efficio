// Insights of the personal area (`GET /tasks/me/overview`): short pt-BR sentences computed from your own
// numbers and, for the comparison, your department's average. Pure (no database); internal to the module.
// Order = urgency (overdue, due today, past the target, tomorrow, productivity, trend, department,
// waiting, busiest weekday, all clear), at most MAX_INSIGHTS.

import {
  addDays,
  addMonthKey,
  formatDateBR,
  MONTH_NAMES,
  WEEKDAY_LABELS,
  type ISODate,
  type MonthKey,
  type TaskInsight,
  type TaskMyOverviewResponse,
} from '@effinance/shared';

export const MAX_INSIGHTS = 6;

export interface InsightInput {
  today: ISODate;
  /** Month of the productivity numbers and whether it is the current one ("este mês"). */
  month: MonthKey;
  current: boolean;
  open: TaskMyOverviewResponse['open'];
  productivity: Pick<TaskMyOverviewResponse['productivity'], 'concluded' | 'onTime' | 'late' | 'onTimeRate' | 'rateChange'>;
  comparison: TaskMyOverviewResponse['comparison'];
  workload: TaskMyOverviewResponse['workload']['days'];
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const number = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const monthName = (m: MonthKey) => MONTH_NAMES[Number(m.slice(5, 7)) - 1]!.toLowerCase();

export function buildMyInsights(input: InsightInput): TaskInsight[] {
  const { open, productivity: p, comparison: c } = input;
  const out: TaskInsight[] = [];
  const add = (insight: TaskInsight) => out.push(insight);

  if (open.overdue > 0) {
    const days = open.oldestOverdue?.daysOverdue ?? 0;
    const ago = plural(days, 'dia', 'dias');
    add({
      key: 'overdue',
      tone: 'danger',
      text:
        open.overdue === 1
          ? `Você tem 1 tarefa atrasada, vencida há ${ago}.`
          : `Você tem ${open.overdue} tarefas atrasadas; a mais antiga venceu há ${ago}.`,
      link: { situation: 'overdue' },
    });
  }
  if (open.dueToday > 0)
    add({ key: 'dueToday', tone: 'warning', text: `${plural(open.dueToday, 'tarefa vence', 'tarefas vencem')} hoje.`, link: { dueBucket: 'today' } });
  if (open.targetMissed > 0) {
    const legal = open.targetMissedNextLegalDate ? formatDateBR(open.targetMissedNextLegalDate).slice(0, 5) : null;
    const tail = legal ? (open.targetMissed === 1 ? `; o prazo legal é ${legal}` : `; o prazo legal mais próximo é ${legal}`) : '';
    add({
      key: 'targetMissed',
      tone: 'warning',
      text: `${plural(open.targetMissed, 'obrigação passou', 'obrigações passaram')} da meta interna${tail}.`,
      link: { dueBucket: 'targetMissed' },
    });
  }
  if (open.dueTomorrow > 0)
    add({
      key: 'dueTomorrow',
      tone: 'info',
      text: `${plural(open.dueTomorrow, 'tarefa vence', 'tarefas vencem')} amanhã.`,
      link: { dueDate: addDays(input.today, 1) },
    });

  const when = input.current ? 'este mês' : `em ${monthName(input.month)}`;
  if (p.concluded > 0 && p.onTimeRate !== null) {
    const of = `(${p.onTime} de ${p.concluded})`;
    if (p.onTimeRate < 70) {
      const whose = input.current ? 'deste mês' : `de ${monthName(input.month)}`;
      add({ key: 'onTimeRate', tone: 'warning', text: `Só ${p.onTimeRate}% das suas conclusões ${whose} foram no prazo ${of}.`, link: null });
    } else {
      add({ key: 'onTimeRate', tone: p.onTimeRate >= 90 ? 'success' : 'info', text: `Você concluiu ${p.onTimeRate}% no prazo ${when} ${of}.`, link: null });
    }
  }
  if (p.rateChange !== null && Math.abs(p.rateChange) >= 10) {
    const up = p.rateChange > 0;
    add({
      key: 'rateTrend',
      tone: up ? 'success' : 'warning',
      text: `Seu índice no prazo ${up ? 'subiu' : 'caiu'} ${plural(Math.abs(p.rateChange), 'ponto', 'pontos')} em relação a ${monthName(addMonthKey(input.month, -1))}.`,
      link: null,
    });
  }
  if (c?.average) {
    const avg = c.average;
    if (c.me.concluded > 0 && avg.concluded > 0 && c.me.concluded >= avg.concluded * 1.2) {
      add({
        key: 'department',
        tone: 'success',
        text: `Você concluiu mais que a média do departamento ${when} (${number(c.me.concluded)} contra ${number(avg.concluded)} por pessoa).`,
        link: null,
      });
    } else if (c.me.overdue >= 2 && c.me.overdue > avg.overdue * 1.5) {
      add({
        key: 'department',
        tone: 'warning',
        text: `Você tem mais tarefas atrasadas que a média do departamento (${number(c.me.overdue)} contra ${number(avg.overdue)} por pessoa).`,
        link: { situation: 'overdue' },
      });
    }
  }
  if (open.waitingClient > 0)
    add({
      key: 'waitingClient',
      tone: 'info',
      text: `${plural(open.waitingClient, 'tarefa aguarda', 'tarefas aguardam')} o cliente.`,
      link: { situation: 'waiting' },
    });
  // The busiest weekday stands out: at least 3 and twice the average of a business day.
  const busiest = [...input.workload].sort((a, b) => b.due - a.due || a.weekday - b.weekday)[0];
  const businessMean = input.workload.reduce((n, d) => n + d.due, 0) / 5;
  if (busiest && busiest.due >= 3 && busiest.due >= businessMean * 2)
    add({
      key: 'busiestWeekday',
      tone: 'info',
      text: `${WEEKDAY_LABELS[busiest.weekday]} é seu dia mais cheio: ${plural(busiest.due, 'vencimento', 'vencimentos')} nas próximas 4 semanas.`,
      link: null,
    });
  if (open.overdue === 0 && open.dueToday === 0 && open.targetMissed === 0)
    add({
      key: 'allClear',
      tone: 'success',
      text: open.total === 0 ? 'Você não tem tarefas em aberto.' : 'Nada atrasado nem vencendo hoje.',
      link: null,
    });
  return out.slice(0, MAX_INSIGHTS);
}
