// @vitest-environment node
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { heightForRows } from '@/features/dashboard/layout/layout';
import { DashColsContext, DashSlot, SlotList } from './dash-slot';

const items = ['a', 'b', 'c', 'd', 'e', 'f', 'g'];

function render(fit: boolean, total?: number) {
  return renderToStaticMarkup(
    <MemoryRouter>
      <DashColsContext.Provider value={4}>
        <DashSlot rows={3} span={{ wide: 6, medium: 1 }} fit={fit}>
          <SlotList cap={5} items={items} total={total} getKey={(i) => i} moreLabel={['pessoa', 'pessoas']} renderItem={(i) => <span data-row>{i}</span>} />
        </DashSlot>
      </DashColsContext.Provider>
    </MemoryRouter>,
  );
}

describe('DashSlot fit', () => {
  it('takes a minimum height of 2 rows instead of a fixed one', () => {
    const html = render(true);
    expect(html).toContain(`min-height:${heightForRows(2, 4)}px`);
    expect(html).not.toMatch(/[^-]height:/);
  });

  it('keeps the fixed height by rows without `fit`', () => {
    expect(render(false)).toContain(`height:${heightForRows(3, 4)}px`);
  });

  it('caps the list by count and says how many were left out', () => {
    const html = render(true);
    expect(html.match(/data-row/g)).toHaveLength(5);
    expect(html).toContain('+ 2 pessoas');
    expect(render(true, 10)).toContain('+ 5 pessoas');
  });
});
