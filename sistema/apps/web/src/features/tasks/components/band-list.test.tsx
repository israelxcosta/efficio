// StatusCard pieces of the Início (docs/dashboards-redesign.md §8.3): the hero and the stacked bar
// replace the rings, and each band shows its share of the total.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { documentBands, progressSegments } from '../dashboard-logic';
import { BandList, StatusSummary } from './band-list';

describe('StatusSummary', () => {
  it('shows the hero, its label and the "today" mark, with no ring', () => {
    const html = renderToStaticMarkup(
      <StatusSummary
        hero={{ value: '18%', label: '5 de 28 concluídas' }}
        segments={progressSegments({ done: 5, overdue: 2, pending: 21 })}
        marker={{ at: 5 / 30, label: 'dia 5' }}
      />,
    );
    expect(html).toContain('18%');
    expect(html).toContain('5 de 28 concluídas');
    expect(html).toContain('dia 5');
    expect(html).not.toContain('<circle');
  });

  it('colours the hero only when it is an alert', () => {
    const alert = renderToStaticMarkup(<StatusSummary hero={{ value: '2', label: 'vencidos', tone: 'danger' }} segments={[{ value: 2, tone: 'danger' }]} />);
    expect(alert).toContain('text-danger');
    const calm = renderToStaticMarkup(<StatusSummary hero={{ value: '100%', label: 'em dia', tone: 'data' }} segments={[{ value: 4, tone: 'data' }]} />);
    expect(calm).not.toContain('text-data');
  });
});

describe('BandList', () => {
  it('shows each band share of the total and keeps empty bands disabled', () => {
    const html = renderToStaticMarkup(
      <BandList bands={documentBands({ counts: { overdue: 2, within30: 0, ok: 6, noDate: 0 } })} total={8} onSelect={() => {}} ariaLabel="Certificados" />,
    );
    expect(html).toContain('25%');
    expect(html).toContain('75%');
    expect(html).toMatch(/<button[^>]*disabled=""[^>]*aria-label="A vencer \(30 dias\): 0/);
  });

  it('has 32px rows without hints when dense', () => {
    const html = renderToStaticMarkup(
      <BandList dense bands={[{ key: 'a', label: 'Atenção', count: 1, tone: 'danger', hint: 'dica longa' }]} onSelect={() => {}} ariaLabel="x" />,
    );
    expect(html).toContain('h-8');
    expect(html).not.toContain('dica longa</span>');
  });

  it('has 28px rows when tight (cards M of 296px below 4 columns)', () => {
    const html = renderToStaticMarkup(<BandList dense="tight" bands={[{ key: 'a', label: 'Atenção', count: 1, tone: 'danger' }]} onSelect={() => {}} ariaLabel="x" />);
    expect(html).toContain('h-7');
  });
});
