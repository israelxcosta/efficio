// Client onboarding in the demo: the office's template with its contact data and an example link of the
// Padaria Pão Quente sent by WhatsApp a few days ago, opened three times (phone and computer) and with
// the reading confirmed. The token is fixed and public (demo only), so `/o/<token>` opens in the demo.
// Dates relative to now. Free of Node-only imports.

import { and, eq } from 'drizzle-orm';
import { ONBOARDING_DEFAULT_OFFICE, ONBOARDING_LINK_DAYS, type OnboardingTemplateStored } from '@effinance/shared';
import type { DbExecutor } from './client';
import { contacts, onboardingAccesses, onboardingLinks, onboardingTemplates } from './schema';
import { sha256Hex, toBase64Url, utf8 } from '../lib/crypto/encoding';
import { getCipher } from '../lib/crypto/keyring';
import { withTenant } from '../lib/tenant';

/** Public on purpose: the demo's example link (`/o/<token>`). Never a real token. */
export async function demoOnboardingToken(): Promise<string> {
  const hex = await sha256Hex('effinance-public-demo-onboarding-pao-quente');
  return toBase64Url(utf8(hex)).slice(0, 43);
}

const DAY = 86_400_000;

export async function seedOnboarding(db: DbExecutor, workspaceId: string, ownerId: string, ownerName: string): Promise<void> {
  const cipher = await getCipher(workspaceId);
  const token = await demoOnboardingToken();
  const now = Date.now();
  await withTenant(db, workspaceId, async (tx) => {
    const content: OnboardingTemplateStored = {
      office: { ...ONBOARDING_DEFAULT_OFFICE, whatsapp: '(19) 99876-5432', email: 'atendimento@efficio.com.br', hours: 'Segunda a sexta, das 8h às 18h', crc: 'SP-012345/O-6' },
      texts: {},
      hidden: [],
    };
    await tx.insert(onboardingTemplates).values({ workspaceId, content, updatedBy: ownerId, updatedByName: ownerName }).onConflictDoNothing();
    const [client] = await tx
      .select({ id: contacts.id })
      .from(contacts)
      .where(and(eq(contacts.workspaceId, workspaceId), eq(contacts.kind, 'client'), eq(contacts.tradeName, 'Pão Quente')));
    if (!client) return;
    const sentAt = new Date(now - 6 * DAY);
    const T = 'onboarding_links';
    const [link] = await tx
      .insert(onboardingLinks)
      .values({
        workspaceId,
        clientId: client.id,
        tokenHash: await sha256Hex(token),
        channel: 'whatsapp',
        recipientContact: 'responsible',
        recipientName: await cipher.encrypt(T, 'recipientName', 'Marina Albuquerque'),
        recipientTo: (await cipher.encrypt(T, 'recipientTo', '5519998765432'))!,
        createdBy: ownerId,
        createdByName: ownerName,
        createdAt: sentAt,
        expiresAt: new Date(sentAt.getTime() + ONBOARDING_LINK_DAYS * DAY),
        confirmedAt: new Date(now - 4 * DAY + 3_600_000),
        confirmedName: await cipher.encrypt(T, 'confirmedName', 'Marina Albuquerque'),
        confirmedCpf: await cipher.encrypt(T, 'confirmedCpf', '52998224725'),
        confirmedIp: '177.92.40.x',
      })
      .returning({ id: onboardingLinks.id });
    await tx.insert(onboardingAccesses).values([
      { workspaceId, linkId: link!.id, accessedAt: new Date(now - 6 * DAY + 2 * 3_600_000), device: 'mobile', browser: 'Chrome', os: 'Android', ip: '177.92.40.x' },
      { workspaceId, linkId: link!.id, accessedAt: new Date(now - 4 * DAY), device: 'desktop', browser: 'Edge', os: 'Windows', ip: '189.6.12.x' },
      { workspaceId, linkId: link!.id, accessedAt: new Date(now - 1 * DAY), device: 'mobile', browser: 'Chrome', os: 'Android', ip: '177.92.40.x' },
    ]);
  });
}
