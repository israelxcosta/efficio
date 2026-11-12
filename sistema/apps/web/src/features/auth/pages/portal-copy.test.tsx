// The login is the office's portal: its words are the portal's, and it offers no sign-up (access is
// by invitation of the office); the sign-up screen is only reached from an invite.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthLayout, PORTAL_NODES } from './auth-layout';
import { LoginFooter, PORTAL_LOGIN_COPY } from './login';

const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const GENERIC = /finanças|grátis|honorários gerados|O financeiro da empresa/i;

describe('portal login', () => {
  it('speaks as the office portal', () => {
    expect(PORTAL_LOGIN_COPY).toEqual({ title: 'Portal Efficio', subtitle: 'Entre com o e-mail cadastrado pelo escritório.' });
    const html = render(
      <AuthLayout title={PORTAL_LOGIN_COPY.title} subtitle={PORTAL_LOGIN_COPY.subtitle} footer={<LoginFooter state={null} fromInvite={false} />}>
        <form />
      </AuthLayout>,
    );
    expect(html).toContain('Portal Efficio');
    expect(html).not.toMatch(GENERIC);
    for (const node of PORTAL_NODES) expect(html).toContain(node.title);
    // The wordmark leads back to the office's site.
    expect(html).toContain('href="/site"');
  });

  it('offers no sign-up on the login, only the invitation hint', () => {
    const html = render(<LoginFooter state={null} fromInvite={false} />);
    expect(html).not.toContain('href="/cadastro"');
    expect(html).toContain('convite');
    expect(html).not.toMatch(GENERIC);
  });

  it('keeps the way to the sign-up for someone who came from an invite', () => {
    const html = render(<LoginFooter state={{ from: '/convite/abc' }} fromInvite />);
    expect(html).toContain('href="/cadastro"');
    expect(html).toContain('Criar acesso com o convite');
  });
});
