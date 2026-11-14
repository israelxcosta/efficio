// Mandatory two-step verification (REQUIRE_MFA): when the enrollment screen shows, the 403
// `mfa_enrollment_required` interception in the API client and the enrollment flow with re-authentication.
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MFA_ENROLLMENT_REQUIRED_ERROR, MFA_ENROLLMENT_REQUIRED_MESSAGE, type MeResponse } from '@effinance/shared';
import { api, isAccessError, onAccessError, onMfaEnrollmentRequired, setBearerToken } from '@/lib/api';
import { shellEntry } from '@/features/site/site-entry';
import { markMfaEnrollmentRequired, needsMfaEnrollment, submitMfaEnrollment } from './mfa-enrollment';
import { recoveryCodesFile } from './mfa-parts';

const auth = vi.hoisted(() => ({ value: {} as Record<string, unknown> }));
vi.mock('./auth-context', () => ({ useAuth: () => auth.value }));
const { default: MfaEnrollmentPage } = await import('./pages/mfa-enrollment');

const me = (over: { mfaRequired?: boolean; mfaEnabled?: boolean } = {}): MeResponse =>
  ({
    user: { id: 'u1', name: 'Ana', email: 'ana@efficio.test', mfaEnabled: over.mfaEnabled ?? false, photoUpdatedAt: null },
    workspace: { id: 'w1', name: 'Efficio', role: 'owner' },
    workspaces: [],
    ...(over.mfaRequired === undefined ? {} : { mfaRequired: over.mfaRequired }),
  }) as unknown as MeResponse;

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

describe('when the enrollment screen shows', () => {
  it('only with the verification required and not enabled', () => {
    expect(needsMfaEnrollment(me({ mfaRequired: true }))).toBe(true);
    expect(needsMfaEnrollment(me({ mfaRequired: true, mfaEnabled: true }))).toBe(false);
    // Demo / dev: REQUIRE_MFA off (absent or false) never asks.
    expect(needsMfaEnrollment(me())).toBe(false);
    expect(needsMfaEnrollment(me({ mfaRequired: false }))).toBe(false);
    expect(needsMfaEnrollment(null)).toBe(false);
  });

  it('marks the cached session when the server says so first (login flag or 403)', () => {
    const marked = markMfaEnrollmentRequired(me({ mfaEnabled: true }));
    expect(needsMfaEnrollment(marked)).toBe(true);
    expect(markMfaEnrollmentRequired(null)).toBeNull();
    const pending = me({ mfaRequired: true });
    expect(markMfaEnrollmentRequired(pending)).toBe(pending);
  });

  it('sends a signed-in session to the enrollment instead of the app, wherever it was going', () => {
    expect(shellEntry({ loading: false, signedIn: true, pathname: '/tarefas', mfaPending: true })).toBe('mfa');
    expect(shellEntry({ loading: false, signedIn: true, pathname: '/', mfaPending: true })).toBe('mfa');
    expect(shellEntry({ loading: false, signedIn: true, pathname: '/tarefas' })).toBe('app');
    expect(shellEntry({ loading: true, signedIn: true, pathname: '/', mfaPending: true })).toBe('loading');
    expect(shellEntry({ loading: false, signedIn: false, pathname: '/tarefas', mfaPending: true })).toBe('login');
  });
});

describe('403 mfa_enrollment_required interception', () => {
  const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
  const onMfa = vi.fn();
  const onAccess = vi.fn();
  beforeEach(() => {
    fetchMock.mockReset();
    onMfa.mockReset();
    onAccess.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    setBearerToken(null);
    onMfaEnrollmentRequired(onMfa);
    onAccessError(onAccess);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    onMfaEnrollmentRequired(null);
    onAccessError(null);
  });

  it('calls the enrollment handler (not the generic "forbidden" toast) and keeps the error silent', async () => {
    fetchMock.mockResolvedValue(json(403, { error: MFA_ENROLLMENT_REQUIRED_ERROR, message: MFA_ENROLLMENT_REQUIRED_MESSAGE }));
    const error = await api('/tasks').catch((e: unknown) => e);
    expect(error).toMatchObject({ status: 403, code: MFA_ENROLLMENT_REQUIRED_ERROR });
    expect(onMfa).toHaveBeenCalledTimes(1);
    expect(onAccess).not.toHaveBeenCalled();
    // Screens don't toast it a second time.
    expect(isAccessError(error)).toBe(true);
  });

  it('leaves the other 403s to the access handler', async () => {
    fetchMock.mockResolvedValue(json(403, { error: 'forbidden', message: 'Sem permissão' }));
    await expect(api('/tasks')).rejects.toMatchObject({ status: 403 });
    expect(onMfa).not.toHaveBeenCalled();
    expect(onAccess).toHaveBeenCalledWith('forbidden', expect.anything());
  });
});

describe('enrollment flow', () => {
  const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
  const enable = (body: { code: string; password?: string }) =>
    api<{ recoveryCodes: string[] }>('/auth/mfa/enable', { method: 'POST', body });
  const bodies = () => fetchMock.mock.calls.map(([, init]) => JSON.parse(String(init.body)) as Record<string, string>);
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('asks for the password only after reauthRequired, then enables with it', async () => {
    fetchMock
      .mockResolvedValueOnce(
        json(422, { error: 'unprocessable_entity', message: 'Por segurança, confirme sua senha…', details: { reauthRequired: true } }),
      )
      .mockResolvedValueOnce(json(200, { recoveryCodes: ['aaaa-1111', 'bbbb-2222'] }));

    // Recent login: no password sent.
    expect(await submitMfaEnrollment({ code: '123456', password: '', needPassword: false }, enable)).toEqual({ kind: 'reauth' });
    expect(bodies()[0]).toEqual({ code: '123456' });

    // Password asked but empty: told on the field, no request.
    expect(await submitMfaEnrollment({ code: '123456', password: '', needPassword: true }, enable)).toMatchObject({
      kind: 'error',
      field: 'password',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    expect(await submitMfaEnrollment({ code: '654321', password: 's3nha', needPassword: true }, enable)).toEqual({
      kind: 'enabled',
      recoveryCodes: ['aaaa-1111', 'bbbb-2222'],
    });
    expect(bodies()[1]).toEqual({ code: '654321', password: 's3nha' });
  });

  it('tells a wrong password on the password and a wrong code on the code', async () => {
    fetchMock
      .mockResolvedValueOnce(json(422, { error: 'unprocessable_entity', message: 'Senha incorreta' }))
      .mockResolvedValueOnce(json(422, { error: 'unprocessable_entity', message: 'Código inválido' }));
    expect(await submitMfaEnrollment({ code: '123456', password: 'x', needPassword: true }, enable)).toEqual({
      kind: 'error',
      field: 'password',
      message: 'Senha incorreta',
    });
    expect(await submitMfaEnrollment({ code: '123456', password: 'x', needPassword: true }, enable)).toEqual({
      kind: 'error',
      field: 'code',
      message: 'Código inválido',
    });
    expect(await submitMfaEnrollment({ code: '12', password: '', needPassword: false }, enable)).toMatchObject({ field: 'code' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('downloads the recovery codes as a text file with an explanation', () => {
    const text = recoveryCodesFile(['aaaa-1111', 'bbbb-2222']);
    expect(text).toContain('códigos de recuperação');
    expect(text).toContain('aaaa-1111\nbbbb-2222');
  });
});

describe('enrollment screen', () => {
  const render = () =>
    renderToStaticMarkup(
      <QueryClientProvider client={new QueryClient()}>
        <MemoryRouter initialEntries={['/verificacao-em-duas-etapas']}>
          <MfaEnrollmentPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
  const session = me({ mfaRequired: true });

  it('explains why it is mandatory and offers to sign out', () => {
    auth.value = { user: session.user, workspace: session.workspace, loading: false, mfaEnrollmentPending: true, logout: vi.fn() };
    const html = render();
    expect(html).toContain('Ative a verificação em duas etapas');
    expect(html).toMatch(/o escritório exige/);
    expect(html).toContain('Sair');
  });

  it('shows nothing of the enrollment when there is nothing to enroll', () => {
    auth.value = { user: session.user, workspace: session.workspace, loading: false, mfaEnrollmentPending: false, logout: vi.fn() };
    expect(render()).not.toContain('Ative a verificação');
    auth.value = { user: null, workspace: null, loading: false, mfaEnrollmentPending: false, logout: vi.fn() };
    expect(render()).not.toContain('Ative a verificação');
  });
});
