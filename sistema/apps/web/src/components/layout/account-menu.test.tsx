// Minha área › the avatar of the rail is a link to the page (spec §2.2), and the account menu of its
// header (spec §15.4). The menu's content is in a Radix portal (not rendered here); its two parts
// without portal are: the trigger and the header of the menu.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { TooltipProvider } from '@/components/ui/tooltip';
import { AccountMenuHeader, AccountMenuTrigger } from './account-menu';
import { AvatarLink } from './sidebar';

const wrap = (node: React.ReactNode) =>
  renderToStaticMarkup(
    <MemoryRouter>
      <TooltipProvider>{node}</TooltipProvider>
    </MemoryRouter>,
  );

describe('avatar of the rail', () => {
  it('opens Minha área and says when it is the current page', () => {
    const html = wrap(<AvatarLink name="Marina Costa" userId="u1" photoVersion={null} active badge={null} />);
    expect(html).toContain('href="/minha-area"');
    expect(html).toContain('aria-label="Minha área — Marina Costa"');
    expect(html).toContain('aria-current="page"');
    expect(html).toContain('ring-primary');
    const idle = wrap(<AvatarLink name="Marina Costa" userId="u1" photoVersion={null} active={false} badge={null} />);
    expect(idle).not.toContain('aria-current');
    expect(idle).toContain('ring-surface');
  });
});

describe('account menu', () => {
  it('names the workspace on its trigger', () => {
    const html = wrap(<AccountMenuTrigger workspace={{ name: 'Efficio Contabilidade', kind: 'business' }} />);
    expect(html).toContain('aria-label="Conta e espaço: Efficio Contabilidade"');
    expect(html).toContain('>Efficio Contabilidade<');
  });

  it('says who is logged in and the current workspace', () => {
    const html = wrap(<AccountMenuHeader name="Marina Costa" email="marina@efficio.com.br" workspace="Efficio Contabilidade" kindLabel="Empresarial" />);
    expect(html).toContain('Marina Costa');
    expect(html).toContain('marina@efficio.com.br');
    expect(html.replace(/<[^>]+>/g, '')).toContain('Espaço atual: Efficio Contabilidade · Empresarial');
  });
});
