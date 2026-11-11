// Relatório do cliente › Retrabalho (spec §5.4): both windows, the latest tasks with the points each one
// takes, the link to the task only when the title can be read, and the empty and loading states.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import type { ClientReworkResponse, ReworkTask } from '@effinance/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { ReworkCardView } from './rework-card';

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>{node}</TooltipProvider>
    </MemoryRouter>,
  );

const category = { id: 'cat', name: 'Retrabalho', icon: 'wrench', color: '#c4242a' } as ReworkTask['category'];
const task = (id: string, title: string | null, date: string): ReworkTask => ({ id, title, date, status: 'done', dueDate: null, category });

const rework: ClientReworkResponse = {
  contactId: 'rota-sul',
  today: '2026-11-10',
  windows: { recentFrom: '2026-08-13', yearFrom: '2025-11-11' },
  penalty: 90,
  rework: {
    last90Days: 2,
    last12Months: 3,
    latest: [task('t1', 'Retificar SPED Fiscal com CFOP errado', '2026-10-21'), task('t2', 'Refazer folha dos motoristas', '2026-09-16'), task('t3', 'Reenviar EFD-Reinf rejeitada', '2026-06-13')],
  },
};
const withoutTitles: ClientReworkResponse = { ...rework, rework: { ...rework.rework, latest: rework.rework.latest.map((t) => ({ ...t, title: null })) } };
const none: ClientReworkResponse = { ...rework, penalty: 0, rework: { last90Days: 0, last12Months: 0, latest: [] } };

describe('Retrabalho do cliente', () => {
  it('shows both windows and opens the task when allowed', () => {
    const html = wrap(<ReworkCardView data={rework} canOpen loading={false} />);
    expect(html).toContain('2 em 90 dias · 3 em 12 meses');
    expect(html).toContain('−90 pontos no score');
    expect(html).toContain('href="/tarefas?tarefa=t1"');
    expect(html).toContain('Retificar SPED Fiscal com CFOP errado');
    expect(html).toContain('Aberta em 21/10/2026');
    expect(html).toContain('Concluída');
  });

  it('says how many points each task takes: 40 in the 90 days, 10 before', () => {
    const html = wrap(<ReworkCardView data={rework} canOpen loading={false} />);
    expect(html.match(/>−40</g)).toHaveLength(2);
    expect(html).toContain('>−10<');
    expect(html).toContain('há mais de 90 dias');
  });

  it('shows counts and categories without titles nor links when tasks are off limits', () => {
    const html = wrap(<ReworkCardView data={withoutTitles} canOpen={false} loading={false} />);
    expect(html).not.toContain('href="/tarefas');
    expect(html).toContain('Retrabalho');
    expect(html).toContain('2 em 90 dias · 3 em 12 meses');
    expect(html).not.toContain('Retificar');
  });

  it('never links a task whose title came hidden', () => {
    expect(wrap(<ReworkCardView data={withoutTitles} canOpen loading={false} />)).not.toContain('href="/tarefas?tarefa=');
  });

  it('says when there was no rework', () => {
    expect(wrap(<ReworkCardView data={none} canOpen loading={false} />)).toContain('Nenhum retrabalho nos últimos 12 meses');
  });

  it('shows a skeleton while loading', () => {
    expect(wrap(<ReworkCardView data={undefined} canOpen loading />)).toContain('aria-busy="true"');
  });
});
