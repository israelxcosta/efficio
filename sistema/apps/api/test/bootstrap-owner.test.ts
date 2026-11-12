// First access of a production install: `bootstrap:owner` creates the owner and the company without
// any password and prints a single-use link (the password-reset flow) to set it.
import { count, eq } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { App } from '../src/app';
import { runBootstrapOwner } from '../src/db/bootstrap-owner';
import { auditLogs, passwordResets, users, workspaceMembers, workspaces } from '../src/db/schema';
import { PASSWORD_RESET_TTL_MS } from '../src/modules/auth/service';
import { admin, clientFor, createTestApp, resetDb } from './helpers';

const EMAIL = 'israel@efficio.com.br';
const ARGS = ['--email', EMAIL, '--name', 'Israel', '--workspace', 'Efficio Contabilidade'];
const NEW_PASSWORD = 'senha-do-israel-2026';

let app: App;

beforeAll(async () => {
  app = await createTestApp();
});

afterAll(async () => {
  await app.close();
});

beforeEach(async () => {
  await resetDb(app);
});

async function run(args: string[]) {
  const out: string[] = [];
  const err: string[] = [];
  const code = await runBootstrapOwner(args, {
    db: app.db,
    appUrl: app.platform.appUrl,
    out: (line) => out.push(line),
    err: (line) => err.push(line),
  });
  return { code, out: out.join('\n'), err: err.join('\n') };
}

const tokenIn = (text: string) => /\/redefinir-senha#token=([\w-]+)/.exec(text)?.[1];
const login = (password: string, email = EMAIL) =>
  app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password } });
const reset = (token: string, password = NEW_PASSWORD) =>
  app.inject({ method: 'POST', url: '/api/auth/password/reset', payload: { token, password } });

async function ownedWorkspaces(userId: string) {
  return admin()
    .select({ name: workspaces.name, kind: workspaces.kind, role: workspaceMembers.role })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(eq(workspaceMembers.userId, userId));
}

describe('bootstrap:owner (first access)', () => {
  it('creates the owner and the business workspace, printing only a single-use link', async () => {
    // pnpm forwards the `--` separator to the script.
    const res = await run(['--', ...ARGS]);
    expect(res.err).toBe('');
    expect(res.code).toBe(0);
    const token = tokenIn(res.out);
    expect(token).toBeTruthy();
    expect(res.out).toContain(`${app.platform.appUrl}/redefinir-senha#token=${token}`);

    const rows = await admin().select().from(users).where(eq(users.email, EMAIL));
    expect(rows).toHaveLength(1);
    const user = rows[0]!;
    expect(user).toMatchObject({ name: 'Israel', passwordChangedAt: null, mfaEnabled: false });
    expect(await ownedWorkspaces(user.id)).toEqual([{ name: 'Efficio Contabilidade', kind: 'business', role: 'owner' }]);
    expect(user.lastWorkspaceId).not.toBeNull();

    // No password exists until the link is used; only the token's hash is stored.
    expect((await login('qualquer-senha-123')).statusCode).toBe(401);
    const resets = await admin().select().from(passwordResets).where(eq(passwordResets.userId, user.id));
    expect(resets).toHaveLength(1);
    expect(resets[0]!.tokenHash).not.toContain(token!);
    const actions = (await admin().select({ action: auditLogs.action }).from(auditLogs).where(eq(auditLogs.userId, user.id))).map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['auth.owner_bootstrapped', 'auth.password_reset_requested']));
  });

  it('the link sets the password once, and the owner signs in to the company', async () => {
    const token = tokenIn((await run(ARGS)).out)!;
    expect((await reset(token)).statusCode).toBe(204);
    expect((await reset(token, 'outra-senha-2026')).statusCode).toBe(422);

    const ok = await login(NEW_PASSWORD);
    expect(ok.statusCode).toBe(200);
    const israel = clientFor(app, ok.json().token);
    const me = (await israel.get('/auth/me')).body;
    expect(me.user).toMatchObject({ name: 'Israel', email: EMAIL });
    expect(me.workspace).toMatchObject({ name: 'Efficio Contabilidade', kind: 'business', role: 'owner' });
    expect(me.workspaces).toHaveLength(1);
    // The same company the sign-up form creates: business categories and a "Caixa" wallet.
    expect((await israel.get('/accounts')).body.map((a: { name: string }) => a.name)).toEqual(['Caixa']);
    expect((await israel.get('/categories?type=income')).body.map((c: { name: string }) => c.name)).toContain('Serviços Prestados');
  });

  it('the link is short-lived and stops working once expired', async () => {
    const token = tokenIn((await run(ARGS)).out)!;
    const [row] = await admin().select().from(passwordResets);
    const ttl = row!.expiresAt.getTime() - Date.now();
    expect(ttl).toBeLessThanOrEqual(PASSWORD_RESET_TTL_MS);
    expect(ttl).toBeGreaterThan(PASSWORD_RESET_TTL_MS - 60_000);

    await admin().update(passwordResets).set({ expiresAt: new Date(Date.now() - 1_000) });
    expect((await reset(token)).statusCode).toBe(422);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(401);
  });

  it('a second run changes nothing and prints no link', async () => {
    const first = tokenIn((await run(ARGS)).out)!;
    const before = await admin().select().from(users);

    const again = await run(['--email', 'Israel@Efficio.com.br', '--name', 'Outro Nome', '--workspace', 'Outra Empresa']);
    expect(again.code).toBe(0);
    expect(again.err).toBe('');
    expect(again.out).toContain('já existe');
    expect(again.out).toContain('Efficio Contabilidade');
    expect(tokenIn(again.out)).toBeUndefined();

    expect(await admin().select().from(users)).toEqual(before);
    expect(await admin().select({ n: count() }).from(workspaces)).toEqual([{ n: 1 }]);
    expect(await admin().select({ n: count() }).from(passwordResets)).toEqual([{ n: 1 }]);
    // The first link keeps working.
    expect((await reset(first)).statusCode).toBe(204);
  });

  it('concurrent runs create a single account', async () => {
    const results = await Promise.all([run(ARGS), run(ARGS)]);
    expect(results.map((r) => r.code)).toEqual([0, 0]);
    expect(results.filter((r) => tokenIn(r.out))).toHaveLength(1);
    expect(await admin().select({ n: count() }).from(users)).toEqual([{ n: 1 }]);
    expect(await admin().select({ n: count() }).from(workspaces)).toEqual([{ n: 1 }]);
  });

  it('--reset-link issues a new link for an existing account and voids the previous one', async () => {
    const first = tokenIn((await run(ARGS)).out)!;

    const again = await run(['--email', EMAIL, '--reset-link']);
    expect(again.err).toBe('');
    expect(again.code).toBe(0);
    const second = tokenIn(again.out)!;
    expect(second).toBeTruthy();
    expect(second).not.toBe(first);

    expect((await reset(first)).statusCode).toBe(422);
    expect((await reset(second)).statusCode).toBe(204);
    expect((await login(NEW_PASSWORD)).statusCode).toBe(200);
    expect(await admin().select({ n: count() }).from(workspaces)).toEqual([{ n: 1 }]);
  });

  it('--reset-link respects the hourly limit of reset links per account', async () => {
    expect((await run(ARGS)).code).toBe(0);
    for (let i = 0; i < 4; i++) expect((await run(['--email', EMAIL, '--reset-link'])).code).toBe(0);
    const blocked = await run(['--email', EMAIL, '--reset-link']);
    expect(blocked.code).toBe(1);
    expect(blocked.err).toContain('Limite');
    expect(tokenIn(blocked.out + blocked.err)).toBeUndefined();
  });

  it('rejects an invalid e-mail without creating anything', async () => {
    const res = await run(['--email', 'israel-efficio.com.br', '--name', 'Israel', '--workspace', 'Efficio Contabilidade']);
    expect(res.code).toBe(1);
    expect(res.err).toContain('E-mail inválido');
    expect(res.out).toBe('');
    expect(await admin().select({ n: count() }).from(users)).toEqual([{ n: 0 }]);
    expect(await admin().select({ n: count() }).from(workspaces)).toEqual([{ n: 0 }]);
  });

  it('requires the e-mail, the name for a new account, and known options', async () => {
    const noEmail = await run(['--name', 'Israel']);
    expect(noEmail.code).toBe(1);
    expect(noEmail.err).toContain('--email');

    const noName = await run(['--email', EMAIL]);
    expect(noName.code).toBe(1);
    expect(noName.err).toContain('--name');

    const unknown = await run([...ARGS, '--password', 'segredo-123']);
    expect(unknown.code).toBe(1);
    expect(unknown.err).toContain('--password');
    expect(unknown.err).not.toContain('segredo-123');

    expect(await admin().select({ n: count() }).from(users)).toEqual([{ n: 0 }]);
  });
});
