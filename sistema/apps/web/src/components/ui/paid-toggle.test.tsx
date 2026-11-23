// The paid toggle paints red only what needs attention: pending AND overdue.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { PaidToggle } from './paid-toggle';
import { TooltipProvider } from './tooltip';

const html = (props: Partial<Parameters<typeof PaidToggle>[0]>) =>
  renderToStaticMarkup(
    <TooltipProvider>
      <PaidToggle paid={false} onToggle={() => {}} kind="income" {...props} />
    </TooltipProvider>,
  );

describe('PaidToggle', () => {
  it('is red only when pending and overdue', () => {
    expect(html({ overdue: true })).toContain('bg-danger-soft');
    const notDue = html({ overdue: false });
    expect(notDue).not.toContain('bg-danger-soft');
    expect(notDue).toContain('bg-bg-subtle');
  });

  it('shows paid as the green icon without a disc (the disc only on hover)', () => {
    const paid = html({ paid: true });
    expect(paid).toContain('text-success');
    expect(paid).toContain('hover:bg-success-soft');
    expect(paid).not.toMatch(/(^|\s)bg-success-soft/);
  });
});
