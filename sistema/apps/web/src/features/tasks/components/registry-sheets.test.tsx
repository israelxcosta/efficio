// Cadastros › Categorias: the "Conta como retrabalho" field of the category sheet and the badge of
// rework categories (spec §6.1).
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { ReworkBadge, ReworkField } from './registry-sheets';

const wrap = (node: React.ReactNode) => renderToStaticMarkup(<>{node}</>);

describe('Conta como retrabalho', () => {
  it('explains what marking a category as rework does', () => {
    const html = wrap(<ReworkField checked onChange={() => {}} />);
    expect(html).toContain('Conta como retrabalho');
    expect(html).toContain(
      'Tarefas desta categoria abertas para um cliente reduzem o score dele: −40 pontos por tarefa nos últimos 90 dias e −10 pelas de até 12 meses (até −200). Use em categorias como Retificação ou Correção.',
    );
    expect(html).toMatch(/role="checkbox"[^>]*aria-checked="true"/);
    // The label and the description are tied to the checkbox.
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
