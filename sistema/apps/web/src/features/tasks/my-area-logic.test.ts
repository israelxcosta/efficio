// Minha área (spec §15.4): the greeting by the office hour, the description, the four numbers, the
// insights' links and the grouping of "Minhas tarefas" by client.
import { describe, expect, it } from 'vitest';
import type { TaskInsight } from '@effinance/shared';
import { appointmentsToday, forYouInsights, greeting, groupMineByClient, insightHref, insightsFinding, myAreaDescription, myMetricCells, officeHour, rhythmFinding } from './my-area-logic';
import { makeOccurrence, makeOverview, makeTask } from './test-fixtures';

describe('header', () => {
  it('greets by the hour with the first name', () => {
    expect(greeting(11, 'Marina Costa')).toBe('Bom dia, Marina');
    expect(greeting(12, 'Marina Costa')).toBe('Boa tarde, Marina');
    expect(greeting(17, 'Marina Costa')).toBe('Boa tarde, Marina');
    expect(greeting(18, 'Marina Costa')).toBe('Boa noite, Marina');
    expect(greeting(0, 'Marina Costa')).toBe('Bom dia, Marina');
  });

  it('reads the hour in the office time zone', () => {
    expect(officeHour(new Date('2026-11-05T02:30:00Z'))).toBe(23);
    expect(officeHour(new Date('2026-11-05T15:00:00Z'))).toBe(12);
  });

  it('describes the day, the role and the department', () => {
    expect(myAreaDescription('2026-11-05', 'Colaborador', 'Fiscal', 'atualizado às 14:32')).toBe('Quinta-feira, 5 de novembro · Colaborador · Fiscal · atualizado às 14:32');
    expect(myAreaDescription('2026-11-05', 'Colaborador', null, 'atualizado às 14:32')).toBe('Quinta-feira, 5 de novembro · Colaborador · atualizado às 14:32');
  });
});

describe('the four numbers', () => {
  const overview = makeOverview({
    open: {
      ...makeOverview().open,
      overdue: 2,
      oldestOverdue: { kind: 'standalone', id: 't1', recurringTaskId: null, periodKey: null, title: 'Balancete', dueDate: '2026-10-30', daysOverdue: 6 } as never,
      dueToday: 3,
      next7Days: 8,
    },
    productivity: { ...makeOverview().productivity, concluded: 12, onTimeRate: 92 },
  });

  it('labels, footers and links like the spec', () => {
    const cells = myMetricCells(overview, { count: 2, next: '14:00' });
    expect(cells.map((c) => c.label)).toEqual(['Atrasadas', 'Hoje', 'Próximos 7 dias', 'Concluídas em novembro']);
    expect(cells.map((c) => c.footer)).toEqual(['a mais antiga venceu há 6 dias', '2 compromissos · próximo às 14:00', 'até 12/11', '92% no prazo · outubro: 18']);
    expect(cells[0]).toMatchObject({ href: '/tarefas?escopo=minhas&situacao=atrasadas', hero: true, tone: 'danger', footerTitle: 'Balancete' });
    expect(cells[1]!.href).toBe('/tarefas?escopo=minhas&vencimento=2026-11-05');
    expect(cells[3]!.href).toBe('/tarefas?escopo=minhas&situacao=concluidas&mes=2026-11');
  });

  it('says "nada atrasado" and "nenhum compromisso" when there is nothing', () => {
    const cells = myMetricCells(makeOverview(), { count: 0, next: null });
    expect(cells[0]!.footer).toBe('nada atrasado');
    expect(cells[0]!.tone).toBeUndefined();
    expect(cells[1]!.footer).toBe('nenhum compromisso');
    expect(cells[3]!.footer).toBe('outubro: 18');
  });

  it('counts the appointments of today and the next one by time', () => {
    const upcoming = {
      ...makeOverview().upcoming,
      tasks: [
        makeTask({ id: 'a', dueDate: '2026-11-05', startTime: '16:00' }),
        makeTask({ id: 'b', dueDate: '2026-11-05', startTime: '14:00' }),
        makeTask({ id: 'c', dueDate: '2026-11-05' }),
        makeTask({ id: 'd', dueDate: '2026-11-06', startTime: '09:00' }),
      ],
    };
    expect(appointmentsToday(makeOverview({ upcoming }))).toEqual({ count: 2, next: '14:00' });
    expect(appointmentsToday(makeOverview())).toEqual({ count: 0, next: null });
  });
});

describe('Para você', () => {
  it('leaves out what the strip already says (overdue and due today)', () => {
    const insights: TaskInsight[] = [
      { key: 'overdue', tone: 'danger', text: '1 tarefa atrasada.', link: { dueBucket: 'overdue' } },
      { key: 'dueToday', tone: 'warning', text: '2 vencem hoje.', link: null },
      { key: 'dueTomorrow', tone: 'info', text: '1 vence amanhã.', link: null },
    ];
    expect(forYouInsights(insights)).toEqual({ shown: [insights[2]], hidden: 2 });
    expect(forYouInsights([])).toEqual({ shown: [], hidden: 0 });
  });

  it('links each insight to the filter of "Minhas"', () => {
    expect(insightHref({ situation: 'waiting' })).toBe('/tarefas?escopo=minhas&situacao=aguardando');
    expect(insightHref({ dueDate: '2026-11-06' })).toBe('/tarefas?escopo=minhas&vencimento=2026-11-06');
    expect(insightHref({ dueBucket: 'overdue' })).toBe('/tarefas?escopo=minhas&situacao=atrasadas');
    expect(insightHref({ dueBucket: 'next7Days' })).toBe('/tarefas?escopo=minhas');
    expect(insightHref(null)).toBeNull();
  });

  it('counts what asks attention', () => {
    const i = (tone: TaskInsight['tone']): TaskInsight => ({ key: 'overdue', tone, text: '', link: null });
    expect(insightsFinding([i('danger'), i('warning'), i('info')])).toBe('2 pedem atenção');
    expect(insightsFinding([i('danger')])).toBe('1 pede atenção');
    expect(insightsFinding([i('success')])).toBe('Tudo em dia');
  });
});

describe('Seu ritmo', () => {
  it('says the month and the change', () => {
    const o = makeOverview({ productivity: { ...makeOverview().productivity, concluded: 12, onTimeRate: 92, rateChange: 4 } });
    expect(rhythmFinding(o, 'novembro', 'outubro')).toBe('novembro: 12 concluídas, 92% no prazo · +4 p.p. sobre outubro');
    expect(rhythmFinding(makeOverview(), 'novembro', 'outubro')).toBe('novembro: nenhuma concluída ainda');
  });
});

describe('Minhas tarefas by client', () => {
  it('puts the obligations first, clients by count and name, internal last', () => {
    const bravo = { id: 'b', name: 'Bravo' };
    const alfa = { id: 'a', name: 'Alfa' };
    const tasks = [makeTask({ id: '1', client: bravo }), makeTask({ id: '2', client: alfa }), makeTask({ id: '3', client: null }), makeTask({ id: '4', client: bravo })];
    const groups = groupMineByClient(tasks, [makeOccurrence({ pending: 2 })]);
    expect(groups.map((g) => g.label)).toEqual(['Obrigações', 'Bravo', 'Alfa', 'Interna']);
    expect(groups[1]!.items).toHaveLength(2);
  });
});
