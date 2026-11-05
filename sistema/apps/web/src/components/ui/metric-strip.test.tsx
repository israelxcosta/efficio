// The number strip on top of both dashboards: on a phone each cell is a line with the whole value
// on the right (no truncation, no compact notation).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MemoryRouter } from 'react-router';
import { formatBRL } from '@effinance/shared';
import { MetricStrip } from './metric-strip';

describe('MetricStrip', () => {
  it('shows a large value whole, never truncated', () => {
    const value = formatBRL(123456789);
    const html = renderToStaticMarkup(<MetricStrip cells={[{ key: 'p', label: 'Patrimônio', value }]} />);
    expect(html).toContain(value);
    const el = html.match(/<[^>]*data-metric-value[^>]*>/)?.[0];
    expect(el).toBeDefined();
    expect(el).not.toContain('truncate');
    expect(el).toContain('whitespace-nowrap');
  });

  it('gives the hero cell a wider column and the footer a title', () => {
    const html = renderToStaticMarkup(
      <MetricStrip
        medium={3}
        cells={[
          { key: 'a', label: 'Atrasadas', value: '3', hero: true, footer: 'a mais antiga venceu há 21 dias: DCTFWeb', footerTitle: 'a mais antiga venceu há 21 dias: DCTFWeb' },
          { key: 'b', label: 'Vencem hoje', value: '1' },
        ]}
      />,
    );
    expect(html).toContain('1.3fr 1fr');
    expect(html).toContain('title="a mais antiga venceu há 21 dias: DCTFWeb"');
  });
});

describe('MetricStrip links', () => {
  it('links the whole cell without nesting the interactive footer inside the link', () => {
    const html = renderToStaticMarkup(
      <MemoryRouter>
        <MetricStrip
          cells={[
            {
              key: 'a',
              label: 'Atrasadas',
              value: '3',
              href: '/tarefas?situacao=atrasadas',
              aria: 'Atrasadas: 3. Ver na lista de tarefas.',
              footer: (
                <>
                  A mais antiga venceu há 21 dias: <button type="button">DCTFWeb</button>
                </>
              ),
            },
          ]}
        />
      </MemoryRouter>,
    );
    const link = html.match(/<a [^>]*>([\s\S]*?)<\/a>/);
    expect(link?.[0]).toContain('aria-label="Atrasadas: 3. Ver na lista de tarefas."');
    expect(link?.[1]).not.toContain('<button');
    expect(html).toContain('>DCTFWeb</button>');
  });
});
