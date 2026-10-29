import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { adminsToAsk, FinanceGateView } from './finance-gate';

/** A finance page: rendering it would start its queries. */
function FinancePage({ onRender }: { onRender: () => void }) {
  onRender();
  return <h1>Contas a pagar</h1>;
}

describe('FinanceGateView', () => {
  it('renders the finance page for administrators', () => {
    let rendered = 0;
    const html = renderToStaticMarkup(
      <FinanceGateView canAccessFinance restricted={<p>Acesso restrito</p>}>
        <FinancePage onRender={() => rendered++} />
      </FinanceGateView>,
    );
    expect(html).toContain('Contas a pagar');
    expect(html).not.toContain('Acesso restrito');
    expect(rendered).toBe(1);
  });

  it('shows "Acesso restrito" to collaborators without mounting the page (no financial request)', () => {
    let rendered = 0;
    const html = renderToStaticMarkup(
      <FinanceGateView canAccessFinance={false} restricted={<p>Acesso restrito</p>}>
        <FinancePage onRender={() => rendered++} />
      </FinanceGateView>,
    );
    expect(html).toContain('Acesso restrito');
    expect(html).not.toContain('Contas a pagar');
    expect(rendered).toBe(0);
  });
});

describe('adminsToAsk', () => {
  const member = (name: string, role: 'owner' | 'editor' | 'viewer', isYou = false) => ({ name, role, isAdmin: role !== 'viewer', isYou });

  it('names up to two administrators, the owner first', () => {
    expect(adminsToAsk([member('Bruno', 'editor'), member('Rafael', 'viewer'), member('Ana', 'owner')])).toEqual({ names: ['Ana', 'Bruno'], more: false });
  });

  it('says there are more when there are', () => {
    expect(adminsToAsk([member('Carla', 'editor'), member('Bruno', 'editor'), member('Ana', 'owner')])).toEqual({ names: ['Ana', 'Bruno'], more: true });
  });

  it('never names the collaborator who is asking, nor other collaborators', () => {
    expect(adminsToAsk([member('Eu', 'viewer', true), member('Rafael', 'viewer')])).toEqual({ names: [], more: false });
  });
});
