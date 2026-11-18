// The public onboarding page (`/o/<token>` on the web, no login). The token travels only in the path; the
// database keeps its SHA-256 (`onboarding_links.token_hash`). To learn the workspace, a short transaction
// as the tenant role with no workspace and `app.onboarding_token` = that hash: the SELECT-only policy
// `onboarding_links_public_token` (migration 0025) shows that single row, nothing else. Everything else
// happens in the workspace's tenant transaction (RLS), like any request. Unknown, expired and revoked
// tokens get the same 404 (nothing to enumerate). Free of Node-only imports (browser demo).

import { sql } from 'drizzle-orm';
import {
  onboardingTokenSchema,
  TASK_TIME_ZONE,
  type OnboardingAccessView,
  type PublicOnboardingConfirmResponse,
  type PublicOnboardingResponse,
} from '@effinance/shared';
import type { DbExecutor } from '../../db/client';
import type { OnboardingLinkRow } from '../../db/schema';
import { todayIn } from '../../lib/clock';
import { sha256Hex } from '../../lib/crypto/encoding';
import { AppError, ConflictError } from '../../lib/errors';
import { maskIp } from '../../lib/ip';
import { executeRows } from '../../lib/sql';
import { TENANT_STATEMENT_TIMEOUT } from '../../lib/tenant';
import { inTenant } from '../../lib/tenant-scope';
import { confirmLink, linkById, linkStatus, loadDocument, recordAccess } from './service';

export const LINK_UNAVAILABLE_MESSAGE = 'Link inválido ou expirado. Peça um novo link ao escritório.';

/** Unknown, expired or revoked: one answer for all. */
export class LinkUnavailableError extends AppError {
  constructor() {
    super(404, 'not_found', LINK_UNAVAILABLE_MESSAGE);
  }
}

/** Device, browser and system from the user agent (only these summaries are stored, never the full string). */
export function summarizeUserAgent(ua: string | null | undefined): Pick<OnboardingAccessView, 'device' | 'browser' | 'os'> {
  if (!ua) return { device: 'unknown', browser: null, os: null };
  const device: OnboardingAccessView['device'] = /iPad|Tablet|Android(?!.*Mobile)/i.test(ua)
    ? 'tablet'
    : /Mobi|iPhone|iPod|Android/i.test(ua)
      ? 'mobile'
      : /Windows|Macintosh|X11|Linux|CrOS/i.test(ua)
        ? 'desktop'
        : 'unknown';
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\/|Opera/.test(ua)
      ? 'Opera'
      : /SamsungBrowser/.test(ua)
        ? 'Samsung Internet'
        : /Firefox|FxiOS/.test(ua)
          ? 'Firefox'
          : /Chrome|CriOS/.test(ua)
            ? 'Chrome'
            : /Safari/.test(ua)
              ? 'Safari'
              : null;
  const os = /Windows/.test(ua)
    ? 'Windows'
    : /iPhone|iPad|iPod/.test(ua)
      ? 'iOS'
      : /Android/.test(ua)
        ? 'Android'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /CrOS/.test(ua)
            ? 'ChromeOS'
            : /Linux/.test(ua)
              ? 'Linux'
              : null;
  return { device, browser, os };
}

interface Route {
  workspaceId: string;
  linkId: string;
}

/** The workspace and link of a token, or the generic 404. */
async function routeOf(system: DbExecutor, token: string): Promise<Route> {
  if (!onboardingTokenSchema.safeParse(token).success) throw new LinkUnavailableError();
  const hash = await sha256Hex(token);
  const [route] = await system.transaction(async (tx) => {
    await tx.execute(
      sql`select set_config('role', 'effinance_app', true), set_config('app.onboarding_token', ${hash}, true),
                 set_config('statement_timeout', ${TENANT_STATEMENT_TIMEOUT}, true)`,
    );
    return executeRows<{ workspace_id: string; id: string }>(tx, sql`select workspace_id, id from onboarding_links where token_hash = ${hash}`);
  });
  if (!route) throw new LinkUnavailableError();
  return { workspaceId: route.workspace_id, linkId: route.id };
}

function assertUsable(link: OnboardingLinkRow | null): asserts link is OnboardingLinkRow {
  if (!link || linkStatus(link) !== 'active') throw new LinkUnavailableError();
}

export interface Visitor {
  ip: string | null | undefined;
  userAgent: string | null | undefined;
}

/** Opens the document of a link and records the access (same visitor within 30 minutes counts once). */
export async function openPublicOnboarding(system: DbExecutor, token: string, visitor: Visitor): Promise<PublicOnboardingResponse> {
  const route = await routeOf(system, token);
  return inTenant(system, route.workspaceId, async (db, cipher) => {
    const link = await linkById(db, route.workspaceId, route.linkId);
    assertUsable(link);
    const document = await loadDocument({ db, workspaceId: route.workspaceId, cipher, today: todayIn(TASK_TIME_ZONE) }, link.clientId);
    await recordAccess(db, route.workspaceId, link.id, { ...summarizeUserAgent(visitor.userAgent), ip: maskIp(visitor.ip) });
    return { document, expiresAt: link.expiresAt.toISOString(), confirmedAt: link.confirmedAt?.toISOString() ?? null };
  });
}

/** Records "Li e entendi" (name and CPF, encrypted). A second confirmation of the same link is a 409. */
export async function confirmPublicOnboarding(
  system: DbExecutor,
  token: string,
  input: { name: string; cpf: string },
  visitor: Visitor,
): Promise<PublicOnboardingConfirmResponse & { workspaceId: string; linkId: string; clientId: string }> {
  const route = await routeOf(system, token);
  return inTenant(system, route.workspaceId, async (db, cipher) => {
    const link = await linkById(db, route.workspaceId, route.linkId);
    assertUsable(link);
    const at = await confirmLink(db, cipher, route.workspaceId, link.id, { ...input, ip: maskIp(visitor.ip) });
    if (!at) throw new ConflictError('A leitura já foi confirmada neste link.');
    return { confirmedAt: at.toISOString(), workspaceId: route.workspaceId, linkId: link.id, clientId: link.clientId };
  });
}
