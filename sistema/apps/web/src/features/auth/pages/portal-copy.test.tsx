// The login is the team's (there is no client portal yet): it speaks to the office's people and offers
// no sign-up (access is by invitation of the office); the sign-up screen is only reached from an invite.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { describe, expect, it } from 'vitest';
import { AuthLayout, TEAM_NODES } from './auth-layout';
import { LoginFooter, TEAM_LOGIN_COPY } from './login';

const render = (node: React.ReactNode) => renderToStaticMarkup(<MemoryRouter>{node}</MemoryRouter>);
const GENERIC = /finanças|grátis|honorários gerados|O financeiro da empresa/i;

describe('team login', () => {
  it('speaks to the office team, not to clients', () => {
    expect(TEAM_LOGIN_COPY).toEqual({ title: 'Efficio · Acesso da equipe', subtitle: 'Sistema interno do escritório. Entre com o e-mail que o escritório cadastrou para você.' });
    const html = render(
      <AuthLayout title={TEAM_LOGIN_COPY.title} subtitle={TEAM_LOGIN_COPY.subtitle} footer={<LoginFooter state={null} fromInvite={false} />}>
        <form />
      </AuthLayout>,
    );
    expect(html).toContain('Efficio · Acesso da equipe');
    expect(html).not.toMatch(/portal/i);
    expect(html).not.toMatch(GENERIC);
    for (const node of TEAM_NODES) expect(html).toContain(node.title);
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
