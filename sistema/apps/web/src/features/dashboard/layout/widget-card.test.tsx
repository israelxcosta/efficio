// Card anatomy (docs/dashboards-redesign.md §5): empty states inside a card have no second frame,
// the finding line truncates with the full text in `title`, and the move/hide/resize controls
// exist only in "Personalizar".
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import type { ReactNode } from 'react';
import { EmptyState } from '@/components/ui/empty-state';
import { TooltipProvider } from '@/components/ui/tooltip';
import { BodyEmpty } from '../widgets/shared';
import { WidgetCard, WidgetChromeContext, type WidgetChrome } from './widget-card';

const html = (node: ReactNode) => renderToStaticMarkup(<TooltipProvider>{node}</TooltipProvider>);

describe('empty states', () => {
  it('drops the dashed frame inside a card and keeps it on pages', () => {
    expect(html(<BodyEmpty title="Nada por aqui" />)).not.toContain('border-dashed');
    expect(html(<EmptyState title="Nada por aqui" />)).toContain('border-dashed');
  });
});

describe('finding line', () => {
  it('truncates a long finding on one line and keeps the full text in title', () => {
    const finding = 'Construtora Alicerce Engenharia e Participações Societárias Ltda concentra 84% do vencido';
    const out = html(
      <WidgetCard title="Clientes devedores" subtitle={finding}>
        <p>corpo</p>
      </WidgetCard>,
    );
    const p = out.match(/<p[^>]*title="([^"]*)"[^>]*>/);
    expect(p?.[1]).toBe(finding);
    expect(p?.[0]).toContain('truncate');
  });
});

describe('"Personalizar" mode', () => {
  const chrome = (editing: boolean): WidgetChrome => ({
    id: 'fluxo-caixa',
    title: 'Fluxo de caixa',
    onHide: () => {},
    headerProps: { onPointerDown: () => {} },
    gripProps: { 'aria-label': 'Mover Fluxo de caixa' },
    resizing: false,
    editing,
  });
  const card = (editing: boolean) =>
    html(
      <WidgetChromeContext.Provider value={chrome(editing)}>
        <WidgetCard title="Fluxo de caixa" action={<button type="button">M</button>}>
          <p>corpo</p>
        </WidgetCard>
      </WidgetChromeContext.Provider>,
    );

  it('shows no grip, hide button or move cursor outside the mode', () => {
    const out = card(false);
    expect(out).not.toContain('Ocultar Fluxo de caixa');
    expect(out).not.toContain('Mover Fluxo de caixa');
    expect(out).not.toContain('cursor-grab');
  });

  it('shows the grip, the hide button and the strong border in the mode', () => {
    const out = card(true);
    expect(out).toContain('aria-label="Ocultar Fluxo de caixa"');
    expect(out).toContain('aria-label="Mover Fluxo de caixa"');
    expect(out).toContain('border-border-strong');
  });
});
