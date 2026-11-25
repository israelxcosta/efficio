// Cadastros › Categorias: the "Retrabalho" field of the category sheet and the badge of
// rework categories (spec §6.1).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReworkBadge, ReworkField } from './registry-sheets';

const wrap = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe('Conta como retrabalho', () => {
  it('is just a checkbox labelled Retrabalho (no explanation on screen)', () => {
    const html = wrap(<ReworkField checked onChange={() => {}} />);
    expect(html).toContain('Retrabalho');
    expect(html).not.toContain('reduzem o score');
    expect(html).toMatch(/role="checkbox"[^>]*aria-checked="true"/);
    // The label is tied to the checkbox.
    const id = html.match(/role="checkbox"[^>]*id="([^"]+)"/)?.[1] ?? html.match(/id="([^"]+)"[^>]*role="checkbox"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`for="${id}"`);
  });

  it('is unchecked when the category does not count', () => {
    expect(wrap(<ReworkField checked={false} onChange={() => {}} />)).toMatch(/role="checkbox"[^>]*aria-checked="false"/);
  });

  it('labels rework categories', () => {
    expect(wrap(<ReworkBadge />)).toContain('Retrabalho');
  });
});
