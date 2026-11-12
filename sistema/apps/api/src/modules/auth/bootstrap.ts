// First access of a new install (CLI `bootstrap:owner`, src/db/bootstrap-owner.ts): creates the owner
// account and its company (business workspace) WITHOUT a password and returns a single-use link of the
// password-reset flow (30 min) to set it. Idempotent: an existing account is never changed — a new
// link only when asked (`resetLink`), with the same hourly limit as "Esqueci minha senha".

import { and, asc, eq } from 'drizzle-orm';
import { registerSchema, workspaceInputSchema } from '@effinance/shared';
import { z } from 'zod';
import type { DbExecutor } from '../../db/client';
import { users, workspaceMembers, workspaces } from '../../db/schema';
import { audit } from '../../lib/audit';
import { randomToken } from '../../lib/crypto/encoding';
import { TooManyRequestsError, ValidationError } from '../../lib/errors';
import { hashPassword } from '../../lib/password';
import { createWorkspace, DEFAULT_COMPANY_NAME } from '../workspaces/service';
import {
  isUniqueViolation,
  PASSWORD_RESET_MAX_PER_HOUR,
  passwordResetLink,
  requestPasswordReset,
  seedCompanyDefaults,
} from './service';

export const OWNER_BOOTSTRAPPED_ACTION = 'auth.owner_bootstrapped';
/** Audit trail: the link was issued by the operator's command, not by a request (no IP). */
const CLI_CONTEXT = { userAgent: 'bootstrap-owner (cli)' };

export const bootstrapOwnerSchema = z.object({
  email: registerSchema.shape.email,
  /** Required to create the account; ignored when it already exists. */
  name: registerSchema.shape.name.optional(),
  /** Company created with the account ("Minha empresa" when omitted, like the sign-up form). */
  workspace: workspaceInputSchema.shape.name.optional(),
});
export type BootstrapOwnerInput = z.input<typeof bootstrapOwnerSchema>;

export type BootstrapOwnerResult =
  | { status: 'created'; userId: string; workspaceId: string; workspaceName: string; link: string }
  /** `link` only with `resetLink`; `ownedWorkspaces` are names, for the operator to check. */
  | { status: 'exists'; userId: string; ownedWorkspaces: string[]; link: string | null };

export interface BootstrapOwnerOptions {
  /** Public URL of the web app (`APP_URL`): the link opens its reset screen. */
  appUrl: string;
  /** Existing account: issue a new link (voids the previous one). */
  resetLink?: boolean;
}

async function issueLink(db: DbExecutor, email: string, appUrl: string): Promise<string> {
  const result = await requestPasswordReset(db, email, CLI_CONTEXT);
  if (!result) {
    throw new TooManyRequestsError(
      `Limite de ${PASSWORD_RESET_MAX_PER_HOUR} links de definição de senha por hora atingido para esta conta. Tente novamente mais tarde.`,
    );
  }
  return passwordResetLink(appUrl, result.token);
}

async function existingOwner(
  db: DbExecutor,
  userId: string,
  email: string,
  options: BootstrapOwnerOptions,
): Promise<BootstrapOwnerResult> {
  const owned = await db
    .select({ name: workspaces.name })
    .from(workspaceMembers)
    .innerJoin(workspaces, eq(workspaces.id, workspaceMembers.workspaceId))
    .where(and(eq(workspaceMembers.userId, userId), eq(workspaceMembers.role, 'owner')))
    .orderBy(asc(workspaces.createdAt));
  const link = options.resetLink ? await issueLink(db, email, options.appUrl) : null;
  return { status: 'exists', userId, ownedWorkspaces: owned.map((w) => w.name), link };
}

export async function bootstrapOwner(
  db: DbExecutor,
  input: BootstrapOwnerInput,
  options: BootstrapOwnerOptions,
): Promise<BootstrapOwnerResult> {
  const parsed = bootstrapOwnerSchema.safeParse(input);
  if (!parsed.success) {
    throw new ValidationError(parsed.error.issues[0]?.message ?? 'Dados inválidos', z.flattenError(parsed.error).fieldErrors);
  }
  const { email, name, workspace } = parsed.data;

  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
  if (existing) return existingOwner(db, existing.id, email, options);
  if (!name) throw new ValidationError('Informe o nome do usuário (--name) para criar a conta');

  // Nobody can sign in until the link is used: the hash is of a random value that is never stored
  // nor shown. No terms acceptance either: the owner accepts them, not the operator.
  const unusableHash = await hashPassword(randomToken());
  const workspaceName = workspace ?? DEFAULT_COMPANY_NAME;
  try {
    return await db.transaction(async (tx) => {
      const [user] = await tx.insert(users).values({ name, email, passwordHash: unusableHash }).returning({ id: users.id });
      const userId = user!.id;
      const workspaceId = await createWorkspace(tx, { name: workspaceName, kind: 'business', ownerId: userId });
      await tx.update(users).set({ lastWorkspaceId: workspaceId }).where(eq(users.id, userId));
      await audit(tx, { ...CLI_CONTEXT, action: OWNER_BOOTSTRAPPED_ACTION, userId, workspaceId, entity: 'user', entityId: userId });
      // In the same transaction: an account is never left without its link.
      const link = await issueLink(tx, email, options.appUrl);
      await seedCompanyDefaults(tx, workspaceId); // tenant role from here on: last step
      return { status: 'created' as const, userId, workspaceId, workspaceName, link };
    });
  } catch (error) {
    // A concurrent run created it first: same answer as a second run.
    if (!isUniqueViolation(error)) throw error;
    const [row] = await db.select({ id: users.id }).from(users).where(eq(users.email, email));
    if (!row) throw error;
    return existingOwner(db, row.id, email, options);
  }
}
