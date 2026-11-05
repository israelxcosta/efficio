// The status control of the audit (spec §3.2): concluded shows only the green check, without the
// initials of who concluded (who and when go to the columns and to the accessible text).
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { cellTip } from '../audit-logic';
import { makeCell } from '../test-fixtures';
import { OccurrenceCellControl, OccurrenceStatusGlyph } from './matrix-cell';

const concluded = makeCell({ status: 'done', legalDueDate: '2026-10-20', concludedBy: { id: 'm', name: 'Marina Costa' }, concludedAt: '2026-10-22T10:45:00Z', canReopen: true });

function control(cell = concluded) {
  return renderToStaticMarkup(
    <QueryClientProvider client={new QueryClient()}>
      <TooltipProvider>
        <OccurrenceCellControl
          cell={cell}
          taskName="Folha de pagamento"
          clientName="Pão Quente"
          periodName="outubro de 2026"
          department="Pessoal/DP"
          large
          onChange={() => {}}
          onReopen={async () => true}
          onOpenTask={() => {}}
        />
      </TooltipProvider>
    </QueryClientProvider>,
  );
}

describe('the concluded control', () => {
  it('is the 40px green check, with no initials, and says who concluded, when and the delay', () => {
    const html = control();
    expect(html).toContain('aria-label="Folha de pagamento, Pão Quente: Concluída por Marina Costa em 22/10/2026 às 07:45, 2 dias após o prazo legal"');
    expect(html).toContain('bg-success-soft');
    expect(html).toContain('w-10');
    expect(html).not.toMatch(/w-\[(52|60)px\]/);
    expect(html).not.toContain('>MC<');
  });

  it('keeps the same size for every status', () => {
    for (const status of ['todo', 'in_progress', 'waiting_client', 'canceled'] as const) expect(control(makeCell({ status }))).toContain('w-10');
  });
});

describe('the read-only control (without permission to write)', () => {
  it('has the same look in a span role="img", with the same accessible text', () => {
    const label = `Folha de pagamento, Pão Quente: ${cellTip(concluded, null)}`;
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <OccurrenceStatusGlyph cell={concluded} large label={label} />
      </TooltipProvider>,
    );
    expect(html).toMatch(/^<span[^>]*role="img"/);
    expect(html).toContain(`aria-label="${label}"`);
    expect(html).toContain('bg-success-soft');
    expect(html).toContain('size-10');
    expect(html).not.toContain('✓');
    expect(html).not.toContain('MC');
  });

  it('shows the ring of a pending occurrence, not a dot', () => {
    const html = renderToStaticMarkup(
      <TooltipProvider>
        <OccurrenceStatusGlyph cell={makeCell({ status: 'todo' })} large label="A fazer" />
      </TooltipProvider>,
    );
    expect(html).toContain('border-border-strong');
    expect(html).not.toContain('·');
  });
});
