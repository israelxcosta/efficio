// Step-up re-authentication for the sensitive actions (threat model T2): exporting the workspace,
// deleting it, turning 2FA off, changing the password, deleting the account and new recovery codes. A
// stolen session (cookie, unlocked computer) must not be enough: the current password — and a 2FA code
// when it is on — in the request itself, or a re-authentication of the same session at most
// REAUTH_WINDOW_MINUTES old (POST /auth/reauthenticate, or the login that opened it). Wrong passwords
// spend a per-account budget (any IP); wrong codes spend the 2FA budget (mfa.ts). The stamp lives in the
// audit trail (`auth.reauthenticated`, entity = the session family): no schema change. Browser-safe.

import { REAUTH_REQUIRED_ERROR, REAUTH_REQUIRED_MESSAGE, REAUTH_WINDOW_MINUTES } from '@effinance/shared';
import { and, count, eq, gt, sql } from 'drizzle-orm';
import type { DbExecutor } from '../../db/client';
import { auditLogs, sessions, type UserRow } from '../../db/schema';
import { audit, type AuditContext } from '../../lib/audit';
import { AppError, TooManyRequestsError, ValidationError } from '../../lib/errors';
import { verifyPassword } from '../../lib/password';
import { verifyMfaCode } from './mfa';

export const REAUTH_ACTION = 'auth.reauthenticated';
export const REAUTH_FAILED_ACTION = 'auth.reauth_failed';
/** Wrong passwords in step-ups allowed per account within 15 minutes, whatever the source IP. */
export const REAUTH_MAX_FAILURES = 10;

/** 422 `reauth_required`: the client asks for the password (and the code when `mfa`) and retries. */
export class ReauthRequiredError extends AppError {
  constructor(mfa: boolean, message = REAUTH_REQUIRED_MESSAGE) {
    super(422, REAUTH_REQUIRED_ERROR, message, { reauthRequired: true, mfa });
  }
}

export interface StepUpInput {
  password?: string | null;
  code?: string | null;
}

export interface StepUpOptions {
  /** The action checks the 2FA code itself (turning 2FA off): only the password part is asked here. */
  skipMfa?: boolean;
  /** Message of a wrong password (e.g. "Senha atual incorreta"). */
  wrongPasswordMessage?: string;
}

/** Whether the session (family) logged in or re-authenticated within the window. */
export async function recentlyReauthenticated(db: DbExecutor, userId: string, sessionId: string | null): Promise<boolean> {
  if (!sessionId) return false;
  const window = sql`now() - make_interval(mins => ${REAUTH_WINDOW_MINUTES})`;
  const [fresh] = await db
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.familyId, sessionId), eq(sessions.userId, userId), gt(sessions.sessionStartedAt, window)))
    .limit(1);
  if (fresh) return true;
  const [stamp] = await db
    .select({ id: auditLogs.id })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.userId, userId),
        eq(auditLogs.action, REAUTH_ACTION),
        eq(auditLogs.entityId, sessionId),
        gt(auditLogs.createdAt, window),
      ),
    )
    .limit(1);
  return Boolean(stamp);
}

async function assertPasswordAttemptsLeft(db: DbExecutor, userId: string): Promise<void> {
  const [row] = await db
    .select({ n: count() })
    .from(auditLogs)
    .where(
      and(
        eq(auditLogs.userId, userId),
        eq(auditLogs.action, REAUTH_FAILED_ACTION),
        gt(auditLogs.createdAt, sql`now() - interval '15 minutes'`),
      ),
    );
  if ((row?.n ?? 0) >= REAUTH_MAX_FAILURES) {
    throw new TooManyRequestsError('Muitas tentativas de senha. Aguarde 15 minutos e tente novamente.');
  }
}

/**
 * Checks the step-up of a sensitive action; throws {@link ReauthRequiredError} (422) when it is missing,
 * 422 for a wrong password or code and 429 once the account's budget is spent. A full check (password,
 * plus the code when 2FA is on) stamps the session, so the next sensitive action within the window does
 * not ask again.
 */
export async function assertStepUp(
  db: DbExecutor,
  user: UserRow,
  sessionId: string | null,
  input: StepUpInput,
  ctx: AuditContext = {},
  options: StepUpOptions = {},
): Promise<void> {
  const needsCode = user.mfaEnabled === true && options.skipMfa !== true;
  if (input.password) {
    await assertPasswordAttemptsLeft(db, user.id);
    if (!(await verifyPassword(input.password, user.passwordHash))) {
      await audit(db, { ...ctx, action: REAUTH_FAILED_ACTION, userId: user.id });
      throw new ValidationError(options.wrongPasswordMessage ?? 'Senha incorreta');
    }
  }
  const recent = await recentlyReauthenticated(db, user.id, sessionId);
  if (recent) return;
  if (!input.password) throw new ReauthRequiredError(needsCode);
  if (needsCode) {
    if (!input.code) throw new ReauthRequiredError(true, 'Informe também o código da verificação em duas etapas.');
    if (!(await verifyMfaCode(db, user, input.code, ctx))) throw new ValidationError('Código inválido');
  }
  if (sessionId) await audit(db, { ...ctx, action: REAUTH_ACTION, userId: user.id, entity: 'session', entityId: sessionId });
}
