// Minha área › the cards without data hooks (spec §15.4): Para você, Meu departamento, Seu ritmo,
// Anotações and Comentários recentes, in their filled and empty states.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { TaskHomeResponse, TaskInsight } from '@effinance/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { makeOverview } from '../test-fixtures';
import { ForYouCardView, MyDepartmentCardView, NotesCardView, RecentCommentsCardView, RhythmCardView } from './my-area-cards';

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>{node}</TooltipProvider>
    </MemoryRouter>,
  );

describe('Para você', () => {
  const insights: TaskInsight[] = [
    { key: 'overdue', tone: 'danger', text: '2 tarefas atrasadas.', link: { dueBucket: 'overdue' } },
    { key: 'allClear', tone: 'success', text: 'Nada vence amanhã.', link: null },
  ];

  it('links an insight to its filter, with its tone on the icon, and leaves the others as text', () => {
    const html = wrap(<ForYouCardView insights={insights} />);
    expect(html).toMatch(/<a[^>]*href="\/tarefas\?escopo=minhas&amp;situacao=atrasadas"[^>]*>[\s\S]*?2 tarefas atrasadas\./);
    expect(html).toMatch(/text-danger/);
    const clear = html.slice(html.lastIndexOf('<', html.indexOf('Nada vence amanhã.')) - 400, html.indexOf('Nada vence amanhã.'));
    expect(clear).not.toContain('<a ');
    expect(html).toContain('1 pede atenção');
  });
});

describe('Meu departamento', () => {
  const home = { view: 'mine', department: null } as unknown as TaskHomeResponse;

  it('says the member has no department and, with `registry`, where to set it', () => {
    expect(wrap(<MyDepartmentCardView home={home} canRegistry={false} today="2026-11-05" />)).toContain('Você ainda não está em um departamento.');
    const admin = wrap(<MyDepartmentCardView home={home} canRegistry today="2026-11-05" />);
    expect(admin).toContain('href="/tarefas/cadastros?aba=equipe"');
    expect(admin).toContain('Definir em Cadastros');
  });
});

describe('Seu ritmo', () => {
  it('compares with the department only when there is an average', () => {
    const overview = makeOverview({
      productivity: { ...makeOverview().productivity, concluded: 12, onTimeRate: 92 },
      comparison: { department: { id: 'fiscal', name: 'Fiscal' }, members: 2, me: { concluded: 12, onTimeRate: 92, open: 3, overdue: 0 }, average: null },
    });
    const html = wrap(<RhythmCardView overview={overview} monthName="novembro" prevMonthName="outubro" />);
    expect(html).toContain('Você: 92% no prazo');
    expect(html).not.toContain('média do');
    const withAverage = makeOverview({
      ...overview,
      comparison: { ...overview.comparison!, members: 5, average: { concluded: 10.5, onTimeRate: 86, open: 4, overdue: 1 } },
    });
    expect(wrap(<RhythmCardView overview={withAverage} monthName="novembro" prevMonthName="outubro" />)).toContain('média do Fiscal: 86%');
  });
});

describe('Anotações and Comentários recentes, empty', () => {
  it('invites the first note', () => {
    const html = wrap(<NotesCardView notes={[]} onOpen={() => {}} onNew={() => {}} onAll={() => {}} />);
    expect(html).toContain('Nenhuma anotação');
    expect(html).toContain('Nova anotação');
  });

  it('says there is no recent comment', () => {
    expect(wrap(<RecentCommentsCardView items={[]} onOpen={() => {}} />)).toContain('Nenhum comentário nos últimos 5 dias.');
  });
});
