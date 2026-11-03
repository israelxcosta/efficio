// The office and its contract template (spec §13.9, §18.15–16): one registry per workspace, `office`
// for everything but the name and the logo (every member reads them); logo and watermark checked by
// signature and size; the template with its limits (500 blocks, 20 000 characters each, 400 000 in
// total), "voltar ao modelo de fábrica" saved right away; the contract of a client (permission
// `finance`) with the fields filled and the list of what is missing. Today is 2026-10-20.

import { sql } from 'drizzle-orm';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { CONTRACT_FACTORY_BLOCKS, CONTRACT_FACTORY_WATERMARK, MAX_CONTRACT_BLOCK_CHARS } from '@effinance/shared';
import type { App } from '../src/app';
import { FINANCE_FORBIDDEN_MESSAGE } from '../src/lib/finance-access';
import { executeRows } from '../src/lib/sql';
import { admin, createTestApp, registerUser, resetDb } from './helpers';
import { office } from './task-helpers';

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

/** A real 160×64 PNG. */
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAKAAAABACAIAAAAS6ev4AAAAtklEQVR42u3cYQnAIBCAUUuYwlT2McmCWUMjCIIHO558AcY9Njh/rNTWlbhiBIAFWIAFWIAFWIABC7AAC7AAKwh4PTsYAAuwAAMGDBgw4BfAy7l6JQADPo045lMDFTBgwIABAwYMGLA1yRVE8osOowcswAIMGDBgwIABpwWOedDxzV8HGDBgwIABAwYMGLCVyR4MGDBgwAIswIABAwbsJywCLMACLMACDFiABViABViABRiwkrUBk0U/aDulaGkAAAAASUVORK5CYII=';
const b64 = (bytes: number[]) => Buffer.from(bytes).toString('base64');
/** Declared PNG, actually HTML. */
const FAKE_PNG = `data:image/png;base64,${Buffer.from('<html><script>alert(1)</script></html>').toString('base64')}`;
const WEBP = `data:image/webp;base64,${b64([0x52, 0x49, 0x46, 0x46, 0x24, 0, 0, 0, 0x57, 0x45, 0x42, 0x50, 0x56, 0x50, 0x38, 0x20])}`;

const OFFICE = {
  document: '60.415.732/0001-74',
  legalName: 'Efficio Contabilidade Ltda',
  tradeName: 'Efficio Contabilidade',
  zipCode: '13840-000',
  street: 'Rua das Palmeiras',
  number: '120',
  district: 'Centro',
  city: 'Mogi Guaçu',
  state: 'SP',
  responsibleName: 'Marina Costa',
  responsibleDocument: '987.654.321-00',
  pixKeyType: 'email',
  pixKey: 'Financeiro@Efficio.app',
};

const CLIENT = {
  name: 'Padaria Pão Dourado Ltda',
  tradeName: 'Pão Dourado',
  document: '11.222.333/0001-81',
  taxRegime: 'simples_nacional',
  simplesAnnex: 'I',
  contractStartDate: '2026-01-10',
  feeDueDay: 5,
};

describe('office: registry, branding and logo', () => {
  it('every member reads name and logo; the rest needs `office`; personal data is encrypted', async () => {
    const { ana, bruno, carla } = await office(app);
    expect((await carla.get('/office/branding')).body).toEqual({ name: null, legalName: null, logo: null });
    const empty = await ana.get('/office');
    expect(empty.body).toMatchObject({ registered: false, missingForContract: ['Cadastro do escritório'], contract: { source: 'factory', watermark: { enabled: true, source: 'factory' } } });

    for (const [method, url, body] of [
      ['get', '/office', undefined],
      ['put', '/office', OFFICE],
      ['put', '/office/logo', { logo: PNG }],
      ['del', '/office/logo', undefined],
      ['get', '/office/contract-template', undefined],
      ['put', '/office/contract-template', { watermarkEnabled: false }],
      ['post', '/office/contract-template/reset', {}],
    ] as const) {
      const res = await (carla[method] as (u: string, b?: unknown) => Promise<{ status: number; body: { message: string } }>)(url, body);
      expect(res.status, `${method} ${url}`).toBe(403);
      expect(res.body.message).toBe('O modelo de contrato e os dados do escritório são restritos aos administradores do espaço.');
    }

    const saved = await bruno.put('/office', OFFICE);
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toMatchObject({
      registered: true,
      document: '60415732000174',
      responsibleDocument: '98765432100',
      pixKeyType: 'email',
      pixKey: 'financeiro@efficio.app',
      missingForContract: [],
      updatedBy: { id: bruno.userId, name: 'Bruno Carvalho' },
    });
    const [row] = await executeRows<{ responsible_document: string; pix_key: string; legal_name: string }>(
      admin(),
      sql`select responsible_document, pix_key, legal_name from offices`,
    );
    expect(row!.responsible_document).toMatch(/^v1\./);
    expect(row!.pix_key).toMatch(/^v1\./);
    expect(row!.legal_name).toBe('Efficio Contabilidade Ltda');

    expect((await bruno.put('/office/logo', { logo: PNG })).body).toEqual({ name: 'Efficio Contabilidade', legalName: 'Efficio Contabilidade Ltda', logo: PNG });
    expect((await carla.get('/office/branding')).body.logo).toBe(PNG);
    expect((await ana.get('/office')).body.logo).toBe(PNG);
    expect((await bruno.del('/office/logo')).status).toBe(204);
    expect((await carla.get('/office/branding')).body.logo).toBeNull();

    // Without the key (an adjustment), even an administrator is refused; the branding stays open.
    expect((await ana.put(`/workspaces/current/members/${bruno.userId}/permissions`, { overrides: { office: false } })).status).toBe(200);
    expect((await bruno.get('/office')).status).toBe(403);
    expect((await bruno.get('/office/branding')).status).toBe(200);

    // One office per workspace: another sees its own (empty).
    const other = await registerUser(app, 'Outro Escritório');
    expect((await other.get('/office')).body.registered).toBe(false);
    expect((await other.get('/office/branding')).body.name).toBeNull();
  });

  it('images: PNG, JPG or WebP checked by signature, up to 500 KB, never SVG', async () => {
    const { ana } = await office(app);
    expect((await ana.put('/office/logo', { logo: WEBP })).status).toBe(200);
    const fake = await ana.put('/office/logo', { logo: FAKE_PNG });
    expect(fake.status).toBe(422);
    expect(fake.body.message).toMatch(/não corresponde a uma imagem/);
    expect((await ana.put('/office/logo', { logo: 'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=' })).status).toBe(400);
    const big = `data:image/png;base64,${Buffer.concat([Buffer.from(PNG.split(',')[1]!, 'base64'), Buffer.alloc(520 * 1024)]).toString('base64')}`;
    expect((await ana.put('/office/logo', { logo: big })).status).toBe(400);
    // The database refuses a type outside the list even if the API were bypassed.
    expect((await ana.put('/office/contract-template', { watermark: FAKE_PNG })).status).toBe(422);
  });

  it('validates CNPJ, CPF and the Pix key by type', async () => {
    const { ana } = await office(app);
    expect((await ana.put('/office', { ...OFFICE, document: '' })).body.message).toBe('Informe o CNPJ do escritório.');
    expect((await ana.put('/office', { ...OFFICE, responsibleDocument: '111.111.111-12' })).body.message).toBe('CPF inválido.');
    expect((await ana.put('/office', { ...OFFICE, pixKeyType: 'cpf', pixKey: 'x@y.com' })).body.message).toBe('Chave Pix inválida para o tipo escolhido.');
    expect((await ana.put('/office', { ...OFFICE, pixKeyType: 'phone', pixKey: '(19) 99876-5432' })).body.pixKey).toBe('+5519998765432');
  });
});

describe('office: contract template', () => {
  it('starts with the factory template; saves blocks and watermark; goes back to the factory right away', async () => {
    const { ana, bruno } = await office(app);
    const factory = await ana.get('/office/contract-template');
    expect(factory.body).toMatchObject({ source: 'factory', updatedAt: null, watermark: { enabled: true, source: 'factory' }, watermarkImage: CONTRACT_FACTORY_WATERMARK });
    expect(factory.body.blocks).toEqual(CONTRACT_FACTORY_BLOCKS);

    const blocks = [
      { type: 'title', text: 'CONTRATO' },
      { type: 'paragraph', text: 'Entre [RAZAO SOCIAL ESCRITORIO] e [RAZAO SOCIAL CLIENTE].' },
      { type: 'paragraph', rule: 'discount', text: 'Desconto de [DESCONTO PCT]%.' },
      { type: 'spacer' },
    ];
    const saved = await bruno.put('/office/contract-template', { blocks, watermark: PNG, watermarkEnabled: false });
    expect(saved.status, JSON.stringify(saved.body)).toBe(200);
    expect(saved.body).toMatchObject({ source: 'custom', blocks, watermark: { enabled: false, source: 'custom' }, watermarkImage: PNG, updatedBy: { name: 'Bruno Carvalho' } });
    // Absent keeps.
    const kept = await ana.put('/office/contract-template', { watermarkEnabled: true });
    expect(kept.body).toMatchObject({ source: 'custom', blocks, watermark: { enabled: true, source: 'custom' }, updatedBy: { name: 'Ana Paula Ribeiro' } });
    expect((await ana.get('/office')).body.contract).toMatchObject({ source: 'custom', watermark: { enabled: true, source: 'custom' } });

    const reset = await ana.post('/office/contract-template/reset', {});
    expect(reset.body).toMatchObject({ source: 'factory', watermark: { enabled: true, source: 'factory' }, watermarkImage: CONTRACT_FACTORY_WATERMARK });
    expect(reset.body.blocks).toEqual(CONTRACT_FACTORY_BLOCKS);
    const [row] = await executeRows<{ contract_blocks: unknown; contract_watermark: unknown }>(admin(), sql`select contract_blocks, contract_watermark from offices`);
    expect(row).toEqual({ contract_blocks: null, contract_watermark: null });
  });

  it('limits: 500 blocks, 20 000 characters per block, 400 000 in total; known block types only', async () => {
    const { ana } = await office(app);
    const block = { type: 'paragraph', text: 'x' };
    expect((await ana.put('/office/contract-template', { blocks: Array(500).fill(block) })).status).toBe(200);
    expect((await ana.put('/office/contract-template', { blocks: Array(501).fill(block) })).status).toBe(400);
    const huge = { type: 'paragraph', text: 'x'.repeat(MAX_CONTRACT_BLOCK_CHARS + 1) };
    expect((await ana.put('/office/contract-template', { blocks: [huge] })).status).toBe(400);
    const full = { type: 'paragraph', text: 'x'.repeat(MAX_CONTRACT_BLOCK_CHARS) };
    expect((await ana.put('/office/contract-template', { blocks: Array(20).fill(full) })).status).toBe(200);
    const over = await ana.put('/office/contract-template', { blocks: Array(21).fill(full) });
    expect(over.status).toBe(400);
    expect(over.body.message).toMatch(/400\.000 caracteres/);
    expect((await ana.put('/office/contract-template', { blocks: [{ type: 'html', text: '<b>' }] })).status).toBe(400);
    expect((await ana.put('/office/contract-template', { blocks: [{ type: 'paragraph', text: 'a\u0000b' }] })).status).toBe(400);
  });
});

describe('contract of a client', () => {
  it('lists what is missing, then fills the template; the discount clause only with discount', async () => {
    const { ana, carla } = await office(app);
    const client = await ana.post('/clients', CLIENT);
    const id = client.body.id as string;

    const refused = await carla.get(`/clients/${id}/contract`);
    expect(refused).toMatchObject({ status: 403, body: { message: FINANCE_FORBIDDEN_MESSAGE } });
    expect((await carla.post(`/clients/${id}/contract/issues`, {})).status).toBe(403);

    const incomplete = await ana.get(`/clients/${id}/contract`);
    expect(incomplete.status).toBe(200);
    expect(incomplete.body).toMatchObject({
      ready: false,
      missing: {
        client: ['Logradouro', 'Número', 'Bairro', 'Cidade', 'UF', 'CEP', 'Responsável (sócio administrador)', 'CPF do responsável'],
        fee: ['Nenhuma vigência cobre hoje'],
        office: ['Cadastro do escritório'],
      },
      fee: null,
      template: { source: 'factory' },
      watermark: { enabled: true, image: CONTRACT_FACTORY_WATERMARK },
    });

    expect((await ana.put('/office', OFFICE)).status).toBe(200);
    expect(
      (
        await ana.put(`/clients/${id}`, {
          ...CLIENT,
          street: 'Rua do Pão',
          number: '45',
          district: 'Centro',
          city: 'Mogi Guaçu',
          state: 'SP',
          zipCode: '13840-100',
          responsibleName: 'Joaquim Padeiro',
          responsibleDocument: '529.982.247-25',
        })
      ).status,
    ).toBe(200);
    expect((await ana.post(`/clients/${id}/fees`, { amount: 120_000, employeeFee: 4_500 })).status).toBe(201);

    const ready = await ana.get(`/clients/${id}/contract`);
    expect(ready.body).toMatchObject({
      ready: true,
      missing: { client: [], fee: [], office: [] },
      client: { id, name: 'Pão Dourado', legalName: 'Padaria Pão Dourado Ltda' },
      fee: { amount: 120_000, employeeFee: 4_500, dueDay: 5, discountBps: 0, startDate: '2026-01-10', endDate: '2027-01-09' },
      office: { name: 'Efficio Contabilidade', legalName: 'Efficio Contabilidade Ltda' },
    });
    expect(ready.body.values['[CPF CLIENTE]']).toBe('529.982.247-25');
    expect(ready.body.values['[CHAVE PIX ESCRITORIO]']).toBe('financeiro@efficio.app');
    expect(ready.body.values['[DIA VENCIMENTO EXTENSO]']).toBe('cinco');
    const text = JSON.stringify(ready.body.blocks);
    expect(text).toContain('Padaria Pão Dourado Ltda, pessoa jurídica de direito privado, inscrita no CNPJ sob o nº 11.222.333/0001-81');
    expect(text).toContain('R$ 1.200,00 (mil e duzentos reais)');
    expect(text).not.toMatch(/\[[A-ZÁÉÍÓÚÇÃÕ ]+\]/);
    expect(ready.body.blocks.some((b: { rule?: string }) => b.rule === 'discount')).toBe(false);
    expect(ready.body.blocks).toHaveLength(CONTRACT_FACTORY_BLOCKS.length - 1);

    // With a discount in the fee period, the clause enters.
    const fees = await ana.get(`/clients/${id}/fees`);
    expect((await ana.put(`/clients/${id}/fees/${fees.body.current.id}`, { amount: 120_000, employeeFee: 4_500, discountBps: 500 })).status).toBe(200);
    const withDiscount = await ana.get(`/clients/${id}/contract`);
    expect(withDiscount.body.blocks).toHaveLength(CONTRACT_FACTORY_BLOCKS.length);
    expect(JSON.stringify(withDiscount.body.blocks)).toContain('desconto de 5% (cinco por cento)');

    // The office's missing CPF shows up for the client's contract too; the watermark can be off.
    expect((await ana.put('/office', { ...OFFICE, responsibleDocument: null })).body.missingForContract).toEqual(['CPF do responsável']);
    expect((await ana.put('/office/contract-template', { watermarkEnabled: false })).status).toBe(200);
    const off = await ana.get(`/clients/${id}/contract`);
    expect(off.body).toMatchObject({ ready: false, missing: { office: ['CPF do responsável'] }, watermark: { enabled: false, image: null } });

    // Registering the issue (optional) records the template version.
    expect((await ana.post(`/clients/${id}/contract/issues`, {})).status).toBe(204);
    const [issue] = await executeRows<{ metadata: Record<string, unknown> }>(admin(), sql`select metadata from audit_logs where action = 'client.contract_issued'`);
    expect(issue!.metadata).toMatchObject({ templateSource: 'factory', templateVersion: expect.any(String) });

    // Other workspaces: "not found".
    const other = await registerUser(app, 'Outro Escritório');
    expect((await other.get(`/clients/${id}/contract`)).status).toBe(404);
    expect((await other.post(`/clients/${id}/contract/issues`, {})).status).toBe(404);
  });
});
