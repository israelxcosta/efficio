// The status button of a canceled task: its glyph must reach 4.5:1 on its background (WCAG AA).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { TaskStatusButton } from './task-status';

const button = (status: 'canceled' | 'todo') =>
  renderToStaticMarkup(
    <TooltipProvider>
      <TaskStatusButton status={status} taskTitle="DCTFWeb" onToggle={() => {}} />
    </TooltipProvider>,
  ).match(/<button[^>]*class="([^"]*)"/)?.[1] ?? '';

describe('TaskStatusButton', () => {
  it('draws "Cancelada" in text-muted on bg-subtle (5.27:1), not text-subtle (4.20:1)', () => {
    const cls = button('canceled').split(' ');
    expect(cls).toContain('bg-bg-subtle');
    expect(cls).toContain('text-muted');
    expect(cls).not.toContain('text-subtle');
  });
});
