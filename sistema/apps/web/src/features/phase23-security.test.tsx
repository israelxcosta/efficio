// Security regressions of the task module's phases 2 and 3 in the web (audit of 2026-11): downloads,
// profile photos, client accesses, permissions per person, URL parameters and the contract.
import { renderToStaticMarkup } from 'react-dom/server';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { rolePermissions, type MeResponse, type MemberRole, type PermissionKey } from '@effinance/shared';
import { AuthProvider } from '@/features/auth/auth-context';
import { CredentialField } from '@/features/clients/client-records';
import { SecretInput } from '@/features/clients/secret-input';
import { ContractPages, ContractPrintFlow } from '@/features/office/components/contract-preview';
import { contractDocumentTitle } from '@/features/office/contract-editor-logic';
import { canEditMemberAccess, ungrantableKeys } from '@/features/settings/member-access';
import { newTaskDefaults } from '@/features/tasks/components/task-sheet';
import { isOccurrenceRef } from '@/features/tasks/occurrence';
import { makeOptions } from '@/features/tasks/test-fixtures';
import { apiDownload, downloadable, onUnauthorized, saveBlob, setBearerToken } from '@/lib/api';
import { clearPhotoCache, loadPhoto, photosBelongToAnotherSession } from '@/lib/photo-cache';
import { qk } from '@/lib/query-keys';

const json = (status: number, body: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

const ID = '33333333-3333-4333-8333-333333333333';

describe('downloads (attachments, CSV)', () => {
  it('never hands the browser a type it would render as a document, and sanitizes the name', () => {
    for (const type of ['text/html', 'image/svg+xml', 'application/xml', 'text/xml; charset=utf-8', 'application/xhtml+xml', 'application/rss+xml']) {
      expect(downloadable(new Blob(['<svg onload="alert(1)"/>'], { type }), 'x.xml').blob.type).toBe('application/octet-stream');
    }
    // Plain data keeps its type.
    for (const type of ['application/pdf', 'text/csv;charset=utf-8', 'image/png', 'application/zip']) {
      expect(downloadable(new Blob(['x'], { type }), 'x').blob.type).toBe(type);
    }
    // Paths, bidi overrides ("…gnp.exe" shown as "…exe.png"), control characters and Windows-reserved ones.
    expect(downloadable(new Blob(['x']), '../../etc/rela‮gnp.exe').fileName).toBe('relagnp.exe');
    expect(downloadable(new Blob(['x']), 'a\u0000b:c?.pdf').fileName).toBe('abc.pdf');
    expect(downloadable(new Blob(['x']), '..').fileName).toBe('arquivo');
  });

  describe('in the page', () => {
    const anchor = { href: '', download: '', rel: '', click: vi.fn(), remove: vi.fn() };
    beforeEach(() => {
      vi.useFakeTimers();
      vi.stubGlobal('document', { createElement: () => anchor, body: { appendChild: vi.fn() } });
    });
    afterEach(() => {
      vi.useRealTimers();
      vi.unstubAllGlobals();
    });

    it('saves as a file (download attribute) with the safe name and releases the object URL', () => {
      const revoke = vi.spyOn(URL, 'revokeObjectURL');
      saveBlob(new Blob(['<html><script>alert(1)</script>'], { type: 'text/html' }), 'pasta/relatorio.html');
      expect(anchor.download).toBe('relatorio.html');
      expect(anchor.href).toMatch(/^blob:/);
      expect(anchor.click).toHaveBeenCalledTimes(1);
      vi.advanceTimersByTime(1000);
      expect(revoke).toHaveBeenCalledWith(anchor.href);
    });
  });

  describe('session', () => {
    const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
    beforeEach(() => {
      fetchMock.mockReset();
      vi.stubGlobal('fetch', fetchMock);
      setBearerToken(null);
    });
    afterEach(() => {
      vi.unstubAllGlobals();
      onUnauthorized(null);
    });

    it('ends the local session when the refresh is refused (as every other request does)', async () => {
      const ended = vi.fn();
      onUnauthorized(ended);
      fetchMock.mockResolvedValue(json(401, { error: 'unauthorized' }));
      await expect(apiDownload(`/tasks/${ID}/attachments/${ID}/download`)).rejects.toMatchObject({ status: 401 });
      expect(fetchMock.mock.calls.map(([url]) => url)).toEqual([`/api/tasks/${ID}/attachments/${ID}/download`, '/api/auth/refresh']);
      expect(ended).toHaveBeenCalledTimes(1);
    });
  });
});

describe('profile photos (personal data)', () => {
  const fetchMock = vi.fn<(input: string, init: RequestInit) => Promise<Response>>();
  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
    clearPhotoCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('a download that was on its way when the session ended never lands in the next one', async () => {
    let answer!: (r: Response) => void;
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => (answer = resolve)));
    const create = vi.spyOn(URL, 'createObjectURL');
    const pending = loadPhoto(ID, 'v1');
    clearPhotoCache();
    answer(new Response(new Blob([new Uint8Array([0x52, 0x49, 0x46, 0x46])], { type: 'image/webp' }), { status: 200 }));
    expect(await pending).toBeNull();
    expect(create).not.toHaveBeenCalled();
    // The next session asks the server again (it decides whether this person may see the photo).
    fetchMock.mockResolvedValue(new Response(new Blob(['x'], { type: 'image/webp' }), { status: 200 }));
    expect(await loadPhoto(ID, 'v1')).toMatch(/^blob:/);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('goes away on sign out and when another person signs in, not on a workspace switch', () => {
    const session = (id: string) => ({ user: { id } });
    expect(photosBelongToAnotherSession('ana', null)).toBe(true);
    expect(photosBelongToAnotherSession('ana', session('bruno'))).toBe(true);
    expect(photosBelongToAnotherSession('ana', session('ana'))).toBe(false);
    expect(photosBelongToAnotherSession(null, session('ana'))).toBe(false);
  });
});

describe('client accesses (spec §13.8)', () => {
  it('the secret input is not the user password: no autofill of the saved login, no password managers', () => {
    const html = renderToStaticMarkup(
      <SecretInput label="Senha do contador" hint="" stored={false} value={{ action: 'set', value: 'digitado' }} onChange={() => {}} resetKey="new" />,
    );
    expect(html).toContain('type="password"');
    expect(html).toContain('autoComplete="new-password"');
    expect(html).not.toContain('autoComplete="off"');
    expect(html).toContain('data-1p-ignore="true"');
    expect(html).toContain('data-lpignore="true"');
    expect(html).toContain('spellCheck="false"');
  });

  it('a stored access is never prefilled in the form', () => {
    const html = renderToStaticMarkup(<SecretInput label="Senha do contador" hint="" stored value={{ action: 'keep' }} onChange={() => {}} resetKey="c1" />);
    expect(html).not.toContain('<input');
    expect(html).toContain('cadastrado');
  });

  function asMember(permissions: Partial<Record<PermissionKey, boolean>>, role: MemberRole = 'viewer') {
    const qc = new QueryClient();
    const workspace = { id: ID, name: 'Escritório', kind: 'business', role, permissions: { ...rolePermissions(role), ...permissions }, subscription: { canWrite: true } };
    qc.setQueryData(qk.me, { user: { id: 'me', name: 'Ana', email: 'a@x.com', photoUpdatedAt: null }, workspace, workspaces: [workspace] } as unknown as MeResponse);
    return (node: React.ReactNode) =>
      renderToStaticMarkup(
        <QueryClientProvider client={qc}>
          <AuthProvider>{node}</AuthProvider>
        </QueryClientProvider>,
      );
  }

  it('starts masked: "Mostrar" only with clientCredentials, "Restrito" otherwise, never the value', () => {
    const field = <CredentialField clientId={ID} clientName="Padaria Pão Dourado" field="accountantPassword" stored />;
    const allowed = asMember({ clientCredentials: true })(field);
    expect(allowed).toContain('••••••••');
    expect(allowed).toContain('aria-label="Mostrar a senha do contador de Padaria Pão Dourado"');
    const denied = asMember({ clientCredentials: false }, 'editor')(field);
    expect(denied).toContain('Restrito: peça a um administrador');
    expect(denied).not.toContain('Mostrar');
    expect(asMember({ clientCredentials: true })(<CredentialField clientId={ID} clientName="X" field="simplesAccessCode" stored={false} />)).toContain('Não cadastrado');
  });
});

describe('permissions per person (spec §13.10)', () => {
  const stored = { role: 'viewer' as const, overrides: {} };

  it('refuses a role whose defaults the editor cannot grant (nobody grants what they do not have)', () => {
    // An administrator with `members` but without the finances turns a collaborator into an administrator.
    const grantable = (Object.keys(rolePermissions('editor')) as PermissionKey[]).filter((k) => k !== 'finance');
    expect(ungrantableKeys(stored, { role: 'editor', overrides: {} }, grantable)).toEqual(['finance']);
    // Keeping the key off for that person makes the role change grantable.
    expect(ungrantableKeys(stored, { role: 'editor', overrides: { finance: false } }, grantable)).toEqual([]);
    // Turning keys off is never a grant.
    expect(ungrantableKeys({ role: 'editor', overrides: {} }, { role: 'viewer', overrides: {} }, [])).toEqual([]);
  });

  it('never opens the switches for the owner nor for the signed-in person, whatever the API says', () => {
    expect(canEditMemberAccess({ userId: 'bruno', role: 'viewer', editable: true }, 'ana')).toBe(true);
    expect(canEditMemberAccess({ userId: 'ana', role: 'viewer', editable: true }, 'ana')).toBe(false);
    expect(canEditMemberAccess({ userId: 'dono', role: 'owner', editable: true }, 'ana')).toBe(false);
    expect(canEditMemberAccess({ userId: 'bruno', role: 'viewer', editable: false }, 'ana')).toBe(false);
    expect(canEditMemberAccess({ userId: 'bruno', role: 'viewer', editable: true }, null)).toBe(false);
  });
});

describe('URL parameters', () => {
  it('`?recorrente=&periodo=` must name an occurrence before anything is requested', () => {
    expect(isOccurrenceRef(ID, '2026-10')).toBe(true);
    expect(isOccurrenceRef(ID, '2026-10-05')).toBe(true);
    // Another endpoint under the same path, a malformed id or period: never requested.
    for (const [id, period] of [
      [ID, '2026-10/comments'],
      [ID, '2026-13'],
      [ID, '..'],
      ['nova', '2026-10'],
      [ID, null],
      [null, '2026-10'],
    ] as const) {
      expect(isOccurrenceRef(id, period)).toBe(false);
    }
  });

  it('`?prazo=` must be a real day and `?titulo=` is only text for the name field', () => {
    const o = makeOptions();
    expect(newTaskDefaults(new URLSearchParams('nova=1&prazo=2026-02-31'), o, undefined).dueDate).toBe('');
    expect(newTaskDefaults(new URLSearchParams('nova=1&prazo=2026-11-30'), o, undefined).dueDate).toBe('2026-11-30');
    const payload = '<img src=x onerror=alert(1)>'.padEnd(250, 'x');
    const title = newTaskDefaults(new URLSearchParams({ nova: '1', titulo: payload }), o, undefined).title;
    expect(title).toHaveLength(200);
    expect(title.startsWith('<img src=x onerror=alert(1)>')).toBe(true);
  });
});

describe('contract (spec §13.9): the template and the client data are text, never HTML', () => {
  const blocks = [
    { type: 'title' as const, text: '<script>alert(1)</script>' },
    { type: 'paragraph' as const, text: 'CONTRATANTE: <img src=x onerror=alert(2)> [RAZAO SOCIAL CLIENTE]' },
  ];

  it('preview and print escape what the template or the registry carry', () => {
    for (const html of [renderToStaticMarkup(<ContractPages blocks={blocks} />), renderToStaticMarkup(<ContractPrintFlow blocks={blocks} />)]) {
      expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
      expect(html).toContain('&lt;img src=x onerror=alert(2)&gt;');
      expect(html).not.toMatch(/<script|<img src=x/);
    }
  });

  it('the tab title (history, PDF name) never carries a CPF from an MEI legal name', () => {
    expect(contractDocumentTitle('João da Silva 12345678901')).toBe('Contrato · João da Silva');
    expect(contractDocumentTitle('JOÃO DA SILVA 123.456.789-01')).toBe('Contrato · JOÃO DA SILVA');
    expect(contractDocumentTitle('Padaria Pão Dourado')).toBe('Contrato · Padaria Pão Dourado');
    // A CNPJ base (the newer MEI names) and longer numbers stay as they are.
    expect(contractDocumentTitle('12.345.678 João da Silva')).toBe('Contrato · 12.345.678 João da Silva');
    expect(contractDocumentTitle('Loja 12345678000190')).toBe('Contrato · Loja 12345678000190');
    expect(contractDocumentTitle('12345678901')).toBe('Contrato · Cliente');
  });
});
