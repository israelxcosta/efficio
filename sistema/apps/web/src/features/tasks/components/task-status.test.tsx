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

describe('TaskStatusButton motion', () => {
  const markup = () =>
    renderToStaticMarkup(
      <TooltipProvider>
        <TaskStatusButton status="todo" taskTitle="DCTFWeb" onToggle={() => {}} />
      </TooltipProvider>,
    );

  it('presses to .97 instead of the old 1.22 pop', () => {
    const cls = button('todo').split(' ');
    expect(cls).toContain('active:scale-[0.97]');
    expect(cls).not.toContain('animate-pop');
  });

  it('does not animate the glyph on first render and swaps the hover check by opacity, not display', () => {
    const html = markup();
    expect(html).not.toContain('icon-in');
    expect(html).toContain('group-hover/status:opacity-0');
    expect(html).not.toContain('group-hover/status:hidden');
  });
});
