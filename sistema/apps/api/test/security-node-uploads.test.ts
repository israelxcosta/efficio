// Security review of the Node API (19/11/2026), findings raised by the web review: CSV cells that a
// spreadsheet evaluates after trimming spaces, stored office images served as data URIs without
// re-checking what they are, and the recipient of an onboarding link.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CONTRACT_FACTORY_WATERMARK } from '@effinance/shared';
import type { App } from '../src/app';
import { toDataUri } from '../src/lib/images';
import { csvCell as taskCsvCell } from '../src/modules/tasks/csv';
import { csvCell as auditCsvCell } from '../src/modules/workspaces/audit-retention';
import { admin, createTestApp, registerUser, resetDb } from './helpers';
import { cnpj } from './task-helpers';

/** A real 160×64 PNG. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABACAIAAAAS6ev4AAAAtklEQVR42u3cYQnAIBCAUUuYwlT2McmCWUMjCIIHO558AcY9Njh/rNTWlbhiBIAFWIAFWIAFWIABC7AAC7AAKwh4PTsYAAuwAAMGDBgw4BfAy7l6JQADPo045lMDFTBgwIABAwYMGLA1yRVE8osOowcswAIMGDBgwIABpwWOedDxzV8HGDBgwIABAwYMGLCVyR4MGDBgwAIswIABAwbsJywCLMACLMACDFiABViABViABRiwkrUBk0U/aDulaGkAAAAASUVORK5CYII=';

describe('CSV exports neutralize formulas behind leading spaces (CWE-1236)', () => {
  it.each([
    ['tasks', taskCsvCell],
    ['audit trail', auditCsvCell],
  ] as const)('%s', (_name, cell) => {
    expect(cell(' =HYPERLINK("http://evil","x")')).toBe(`"' =HYPERLINK(""http://evil"",""x"")"`);
    expect(cell('   +cmd')).toBe("'   +cmd");
    expect(cell('  @SUM(A1)')).toBe("'  @SUM(A1)");
    expect(cell('=1+1')).toBe("'=1+1");
    // Ordinary text is untouched.
    expect(cell(' texto comum')).toBe(' texto comum');
    expect(cell('a - b')).toBe('a - b');
  });
});

describe('stored office images are re-checked before becoming a data URI (CWE-434)', () => {
  const bytes = (dataUri: string) => Uint8Array.from(Buffer.from(dataUri.split(',')[1]!, 'base64'));

  it('only an allowed type whose bytes match it becomes a data URI', () => {
    const png = bytes(PNG);
    expect(toDataUri('image/png', png)).toBe(PNG);
    expect(toDataUri('image/svg+xml', png)).toBeNull();
    expect(toDataUri('text/html', png)).toBeNull();
    expect(toDataUri('image/jpeg', png)).toBeNull();
    expect(toDataUri('image/png', new TextEncoder().encode('<svg onload="alert(1)"/>'))).toBeNull();
  });

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

  it('a tampered row reaches nobody: no logo, and the factory watermark instead', async () => {
    const owner = await registerUser(app, 'Dona do Escritório');
    expect((await owner.put('/office/logo', { logo: PNG })).status).toBe(200);
    expect((await owner.put('/office/contract-template', { watermark: PNG })).status).toBe(200);
    expect((await owner.get('/office/branding')).body.logo).toBe(PNG);
    expect((await owner.get('/office/contract-template')).body.watermarkImage).toBe(PNG);

    // An old or tampered row: the type no longer matches the bytes.
    await admin().execute(sql`update offices set logo_type = 'image/jpeg', contract_watermark_type = 'image/webp'`);
    expect((await owner.get('/office/branding')).body.logo).toBeNull();
    expect((await owner.get('/office/contract-template')).body.watermarkImage).toBe(CONTRACT_FACTORY_WATERMARK);
  });
});

describe('onboarding link recipient is validated by the server', () => {
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

  it('refuses a WhatsApp number outside 10–13 digits (or not Brazilian) and never returns an empty recipient', async () => {
    const owner = await registerUser(app, 'Dona do Escritório');
    const client = await owner.post('/clients', {
      name: 'Padaria Segura Ltda',
      document: cnpj(41_000_007),
      taxRegime: 'simples_nacional',
      simplesAnnex: 'I',
      contractStartDate: '2025-01-10',
      phone: '',
      email: 'contato@segura.com.br',
    });
    expect(client.status, JSON.stringify(client.body)).toBe(201);
    const link = (body: unknown) => owner.post(`/clients/${client.body.id}/onboarding/links`, body);

    for (const to of ['123456789', '12345678901234', 'abc', '(19) 9876-543', '+1 (415) 555-0100', '(01) 98765-4321', '(19) 18765-4321', '(19) 8765-4321']) {
      const res = await link({ channel: 'whatsapp', to });
      expect([400, 422], `${to}: ${res.status}`).toContain(res.status);
    }
    expect((await link({ channel: 'email', to: 'nao-e-email' })).status).toBe(400);
    expect((await link({ channel: 'whatsapp', to: '   ' })).status).toBe(400);
    // The registry has no phone: no link to nobody.
    expect((await link({ channel: 'whatsapp', contact: 'company' })).status).toBe(422);
    // Both or neither: refused.
    expect((await link({ channel: 'whatsapp' })).status).toBe(400);
    expect((await link({ channel: 'whatsapp', contact: 'company', to: '19987654321' })).status).toBe(400);

    const ok = await link({ channel: 'whatsapp', to: '(19) 98765-4321' });
    expect(ok.status, JSON.stringify(ok.body)).toBe(201);
    expect(ok.body.to).toBe('5519987654321');
    const mail = await link({ channel: 'email', contact: 'company' });
    expect(mail.status).toBe(201);
    expect(mail.body.to).toBe('contato@segura.com.br');
  });
});
