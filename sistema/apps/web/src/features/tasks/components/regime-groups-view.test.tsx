// Grupos por regime: the office's own tasks in the table and the collapsed "Removidas" with "Restaurar".
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';
import type { RegimeGroupExcludedItem, RegimeGroupOwnTask } from '@effinance/shared';
import { TooltipProvider } from '@/components/ui/tooltip';
import { OwnTaskRow, RemovedItems } from './regime-groups-view';

const wrap = (node: ReactNode) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);

const removed = (patch: Partial<RegimeGroupExcludedItem> = {}): RegimeGroupExcludedItem => ({
  key: 'das',
  name: 'DAS',
  description: 'Guia do Simples',
  period: 'monthly',
  dueDay: 20,
  dueMonth: null,
  months: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  department: { key: 'fiscal', name: 'Fiscal' },
  recurringTask: null,
  excludedAt: '2026-11-10T12:00:00.000Z',
  ...patch,
});

const own: RegimeGroupOwnTask = {
  id: 'r9',
  name: 'Alvará',
  period: 'annual',
  department: { id: 'f', name: 'Fiscal' },
  active: true,
  regimes: ['simples_nacional'],
  catalogKey: null,
  dueDay: 31,
  dueMonth: 3,
  months: [3],
  targetDaysBefore: 0,
  nonBusinessDayRule: 'anticipate',
};

/** Every element of a (hook-free) tree, to reach the buttons' handlers. */
function elements(node: ReactNode): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(node)) return node.flatMap(elements);
  if (!isValidElement<Record<string, unknown>>(node)) return [];
  return [node, ...elements(node.props.children as ReactNode)];
}

describe('own tasks of the group', () => {
  it('shows "Do escritório", "Em uso" and the "Excluir do regime" menu only for who can edit', () => {
    const html = wrap(<OwnTaskRow task={own} usesDepartments onOpenRecurring={() => {}} onExclude={() => {}} />);
    expect(html).toContain('Do escritório');
    expect(html).toContain('Em uso');
    expect(html).toContain('Fiscal');
    expect(html).toContain('aria-label="Ações de “Alvará”"');
    expect(wrap(<OwnTaskRow task={own} usesDepartments onOpenRecurring={() => {}} />)).not.toContain('Ações de');
  });
});

describe('Removidas', () => {
  const items = [removed(), removed({ key: 'dctfweb', name: 'DCTFWeb' })];

  it('stays collapsed with the count, and lists the items with "Restaurar" when open', () => {
    const closed = wrap(<RemovedItems items={items} open={false} onToggle={() => {}} onRestore={() => {}} />);
    expect(closed).toContain('Removidas (2)');
    expect(closed).toContain('aria-expanded="false"');
    expect(closed).not.toContain('Restaurar');
    const opened = wrap(<RemovedItems items={items} open onToggle={() => {}} onRestore={() => {}} />);
    expect(opened).toContain('aria-expanded="true"');
    expect(opened).toContain('DCTFWeb');
    expect(opened).toContain('removida em 10/11/2026');
    expect(opened.match(/Restaurar/g)).toHaveLength(2);
  });

  it('restores the item clicked; without permission there is no button; nothing removed, no section', () => {
    const onRestore = vi.fn();
    const onToggle = vi.fn();
    const tree = RemovedItems({ items, open: true, onToggle, onRestore });
    const buttons = elements(tree).filter((e) => typeof e.props.onClick === 'function');
    (buttons[0]!.props.onClick as () => void)();
    expect(onToggle).toHaveBeenCalledOnce();
    (buttons[2]!.props.onClick as () => void)();
    expect(onRestore).toHaveBeenCalledWith(items[1]);
    expect(wrap(<RemovedItems items={items} open onToggle={() => {}} />)).not.toContain('Restaurar');
    expect(wrap(<RemovedItems items={[]} open onToggle={() => {}} onRestore={() => {}} />)).toBe('');
  });
});
