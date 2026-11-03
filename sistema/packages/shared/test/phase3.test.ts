import { describe, expect, it } from 'vitest';
import {
  blocksFromPlainText,
  clientDocumentInputSchema,
  clientInputSchema,
  CONTRACT_FACTORY_BLOCKS,
  CONTRACT_FACTORY_WATERMARK,
  CONTRACT_PLACEHOLDERS,
  contractCharCount,
  contractTemplateInputSchema,
  contractValues,
  credentialUpdateSchema,
  dateToWords,
  deadlineStatus,
  deadlineText,
  effectivePermissions,
  fillContractBlocks,
  formatPercentBps,
  grantedPermissions,
  MAX_CONTRACT_BLOCK_CHARS,
  MAX_CONTRACT_BLOCKS,
  memberPermissionsInputSchema,
  missingFactoryPlaceholders,
  moneyToWords,
  normalizePermissionOverrides,
  normalizePixKey,
  numberToWords,
  officeInputSchema,
  PERMISSION_KEYS,
  percentBpsToWords,
  placeholdersIn,
  profilePhotoInputSchema,
  rolePermissions,
  sanitizePermissionOverrides,
  trackedConvention,
  unionConventionsInputSchema,
  unionInputSchema,
  unionSituationOf,
  unknownPlaceholders,
} from '../src';

describe('permissions per person (spec §13.10)', () => {
  it('role defaults are the behavior of phases 1 and 2', () => {
    const actions = ['finance', 'registry', 'deleteRegistry', 'deleteTasks', 'reopenOthers', 'clientCredentials', 'office'] as const;
    for (const k of actions) {
      expect(rolePermissions('owner')[k], k).toBe(true);
      expect(rolePermissions('editor')[k], k).toBe(true);
      expect(rolePermissions('viewer')[k], k).toBe(false);
    }
    expect(rolePermissions('owner').members).toBe(true);
    expect(rolePermissions('editor').members).toBe(false);
    expect(rolePermissions('viewer').members).toBe(false);
    for (const role of ['owner', 'editor', 'viewer'] as const) {
      for (const k of PERMISSION_KEYS.filter((key) => key.startsWith('page.'))) expect(rolePermissions(role)[k]).toBe(true);
    }
  });

  it('unknown roles get nothing; unknown keys and non-booleans are discarded', () => {
    expect(Object.values(rolePermissions('collaborator')).some(Boolean)).toBe(false);
    expect(Object.values(effectivePermissions(null, { finance: true })).some(Boolean)).toBe(false);
    expect(sanitizePermissionOverrides({ finance: true, admin: true, registry: 'yes', 'page.audit': false })).toEqual({
      finance: true,
      'page.audit': false,
    });
    expect(sanitizePermissionOverrides(['finance'])).toEqual({});
    expect(sanitizePermissionOverrides(null)).toEqual({});
  });

  it('adjustments override the role; the owner is never adjusted', () => {
    expect(effectivePermissions('viewer', { finance: true }).finance).toBe(true);
    expect(effectivePermissions('editor', { finance: false }).finance).toBe(false);
    expect(effectivePermissions('owner', { finance: false }).finance).toBe(true);
    expect(normalizePermissionOverrides('owner', { finance: false })).toEqual({});
  });

  it('only the keys that differ from the role are stored', () => {
    expect(normalizePermissionOverrides('viewer', { finance: true, registry: false, 'page.audit': true })).toEqual({ finance: true });
    expect(normalizePermissionOverrides('editor', { finance: false, members: false })).toEqual({ finance: false });
  });

  it('lists what a change grants', () => {
    expect(grantedPermissions(rolePermissions('viewer'), effectivePermissions('viewer', { office: true }))).toEqual(['office']);
    expect(grantedPermissions(rolePermissions('editor'), rolePermissions('viewer'))).toEqual([]);
  });

  it('the input schema discards unknown keys and caps the size', () => {
    expect(memberPermissionsInputSchema.parse({ overrides: { finance: true, hack: true } })).toEqual({ overrides: { finance: true } });
    expect(memberPermissionsInputSchema.safeParse({ role: 'owner', overrides: {} }).success).toBe(false);
    const many = Object.fromEntries(Array.from({ length: 101 }, (_, i) => [`k${i}`, true]));
    expect(memberPermissionsInputSchema.safeParse({ overrides: many }).success).toBe(false);
  });
});

describe('deadline bands (office calendar)', () => {
  const today = '2026-10-20';
  it('overdue before today, 30 days inclusive, 31 to 60, later, no date', () => {
    expect(deadlineStatus('2026-10-19', today)).toEqual({ bucket: 'overdue', days: -1 });
    expect(deadlineStatus('2026-10-20', today)).toEqual({ bucket: 'within30', days: 0 });
    expect(deadlineStatus('2026-11-19', today)).toEqual({ bucket: 'within30', days: 30 });
    expect(deadlineStatus('2026-11-20', today)).toEqual({ bucket: 'within60', days: 31 });
    expect(deadlineStatus('2026-12-19', today)).toEqual({ bucket: 'within60', days: 60 });
    expect(deadlineStatus('2026-12-20', today)).toEqual({ bucket: 'later', days: 61 });
    expect(deadlineStatus(null, today)).toEqual({ bucket: 'noDate', days: null });
  });

  it('texts', () => {
    expect(deadlineText(-3)).toBe('Venceu há 3 dias');
    expect(deadlineText(-1)).toBe('Venceu há 1 dia');
    expect(deadlineText(0)).toBe('Vence hoje');
    expect(deadlineText(12)).toBe('Vence em 12 dias');
    expect(deadlineText(null)).toBeNull();
  });
});

describe('collective agreement being tracked (Effy cicloEmControle)', () => {
  const today = '2026-10-20';
  it('starts at the current year and stays until marked as published, even when overdue', () => {
    const t = trackedConvention(3, [], today)!;
    expect(t).toMatchObject({ year: 2026, label: '2026/2027', dueDate: '2026-03-01', bucket: 'overdue' });
    expect(t.days).toBeLessThan(0);
    expect(unionSituationOf(t)).toBe('overdue');
  });

  it('advances while published', () => {
    const t = trackedConvention(3, [{ year: 2026, published: true }, { year: 2025, published: true }], today)!;
    expect(t).toMatchObject({ year: 2027, dueDate: '2027-03-01', bucket: 'later' });
    expect(unionSituationOf(t)).toBe('ok');
    const twice = trackedConvention(11, [{ year: 2026, published: true }, { year: 2027, published: true }], today)!;
    expect(twice.year).toBe(2028);
  });

  it('a cycle stored but not published keeps the alert', () => {
    expect(trackedConvention(11, [{ year: 2026, published: false }], today)).toMatchObject({ dueDate: '2026-11-01', bucket: 'within30', days: 12 });
  });

  it('without base month there is nothing to track', () => {
    expect(trackedConvention(null, [], today)).toBeNull();
    expect(trackedConvention(13, [], today)).toBeNull();
    expect(unionSituationOf(null)).toBe('noBaseMonth');
  });
});

describe('numbers in words (contract)', () => {
  it('integers', () => {
    expect(numberToWords(0)).toBe('zero');
    expect(numberToWords(1)).toBe('um');
    expect(numberToWords(16)).toBe('dezesseis');
    expect(numberToWords(100)).toBe('cem');
    expect(numberToWords(101)).toBe('cento e um');
    expect(numberToWords(1000)).toBe('mil');
    expect(numberToWords(1100)).toBe('mil e cem');
    expect(numberToWords(1200)).toBe('mil e duzentos');
    expect(numberToWords(1234)).toBe('mil duzentos e trinta e quatro');
    expect(numberToWords(2025)).toBe('dois mil e vinte e cinco');
    expect(numberToWords(1_000_000)).toBe('um milhão');
    expect(numberToWords(2_500_000)).toBe('dois milhões e quinhentos mil');
  });

  it('money', () => {
    expect(moneyToWords(120_000)).toBe('mil e duzentos reais');
    expect(moneyToWords(150)).toBe('um real e cinquenta centavos');
    expect(moneyToWords(1)).toBe('um centavo');
    expect(moneyToWords(0)).toBe('zero reais');
    expect(moneyToWords(100_000_000)).toBe('um milhão de reais');
  });

  it('percent and dates', () => {
    expect(formatPercentBps(500)).toBe('5');
    expect(formatPercentBps(250)).toBe('2,5');
    expect(formatPercentBps(1205)).toBe('12,05');
    expect(percentBpsToWords(500)).toBe('cinco por cento');
    expect(percentBpsToWords(250)).toBe('dois vírgula cinco por cento');
    expect(percentBpsToWords(1205)).toBe('doze vírgula zero cinco por cento');
    expect(dateToWords('2026-01-10')).toBe('10 de janeiro de 2026');
  });
});

describe('contract template', () => {
  it('the factory template is the office contract with known fields and the discount clause', () => {
    expect(CONTRACT_FACTORY_BLOCKS.length).toBeGreaterThan(90);
    expect(CONTRACT_FACTORY_BLOCKS[0]).toEqual({ type: 'title', text: 'CONTRATO DE PRESTAÇÃO DE SERVIÇOS CONTÁBEIS' });
    expect(unknownPlaceholders(CONTRACT_FACTORY_BLOCKS)).toEqual([]);
    expect(CONTRACT_FACTORY_BLOCKS.filter((b) => b.rule === 'discount')).toHaveLength(1);
    // The Pix key comes from the office (Effy had it hard-coded).
    expect(CONTRACT_FACTORY_BLOCKS.some((b) => b.text?.includes('[CHAVE PIX ESCRITORIO]'))).toBe(true);
    expect(CONTRACT_FACTORY_BLOCKS.some((b) => b.text?.includes('pix@'))).toBe(false);
    expect(contractCharCount(CONTRACT_FACTORY_BLOCKS)).toBeLessThan(400_000);
    expect(Object.isFrozen(CONTRACT_FACTORY_BLOCKS)).toBe(true);
    expect(CONTRACT_FACTORY_WATERMARK.startsWith('data:image/png;base64,iVBOR')).toBe(true);
    // Every placeholder of the catalog is in the factory template.
    expect(CONTRACT_PLACEHOLDERS.map((p) => p.key).filter((k) => !CONTRACT_FACTORY_BLOCKS.some((b) => b.text?.includes(k)))).toEqual([]);
  });

  const client = {
    name: 'Padaria Pão Dourado Ltda',
    document: '11222333000181',
    street: 'Rua A',
    number: '10',
    district: 'Centro',
    city: 'Mogi Guaçu',
    state: 'SP',
    zipCode: '13840000',
    responsibleName: 'Joaquim',
    responsibleDocument: '52998224725',
    contractStartDate: '2026-01-10',
  };
  const office = {
    legalName: 'Efficio Contabilidade Ltda',
    document: '60415732000174',
    street: 'Rua das Palmeiras',
    number: '120',
    complement: 'Sala 4',
    district: 'Centro',
    city: 'Mogi Guaçu',
    state: 'SP',
    zipCode: '13840000',
    responsibleName: 'Marina Costa',
    responsibleDocument: '98765432100',
    pixKey: 'financeiro@efficio.app',
  };

  it('fills the fields and leaves the discount clause out without discount', () => {
    const values = contractValues(client, office, { amount: 120_000, employeeFee: 4_500, dueDay: 10, discountBps: 0 });
    expect(values['[CNPJ CLIENTE]']).toBe('11.222.333/0001-81');
    expect(values['[ESTADO CLIENTE]']).toBe('São Paulo');
    expect(values['[CEP CLIENTE]']).toBe('13840-000');
    expect(values['[CPF CLIENTE]']).toBe('529.982.247-25');
    expect(values['[VALOR HONORARIOS]']).toBe('R$ 1.200,00');
    expect(values['[HONORÁRIOS POR EXTENSO]']).toBe('mil e duzentos reais');
    expect(values['[DIA VENCIMENTO EXTENSO]']).toBe('dez');
    expect(values['[ENDERECO ESCRITORIO]']).toBe(
      'Rua das Palmeiras, nº 120, Sala 4, bairro Centro, município de Mogi Guaçu, estado de São Paulo, CEP nº 13840-000',
    );
    expect(values['[DESCONTO PCT]']).toBe('');
    const filled = fillContractBlocks(CONTRACT_FACTORY_BLOCKS, values, { withDiscount: false });
    expect(filled.some((b) => b.rule === 'discount')).toBe(false);
    expect(filled.some((b) => b.text?.includes('['))).toBe(false);
    expect(filled[1]).toEqual({ type: 'subtitle', text: 'Padaria Pão Dourado Ltda' });
  });

  it('keeps the discount clause with discount and unknown fields as written', () => {
    const values = contractValues(client, office, { amount: 120_000, employeeFee: 0, dueDay: 5, discountBps: 500 });
    const blocks = [
      { type: 'paragraph' as const, rule: 'discount' as const, text: 'Desconto de [DESCONTO PCT]% ([DESCONTO EXTENSO]).' },
      { type: 'paragraph' as const, text: 'Campo [NAO EXISTE] fica.' },
    ];
    expect(fillContractBlocks(blocks, values, { withDiscount: true })).toEqual([
      { type: 'paragraph', rule: 'discount', text: 'Desconto de 5% (cinco por cento).' },
      { type: 'paragraph', text: 'Campo [NAO EXISTE] fica.' },
    ]);
    expect(unknownPlaceholders(blocks)).toEqual(['[NAO EXISTE]']);
    expect(missingFactoryPlaceholders(blocks, CONTRACT_FACTORY_BLOCKS)).toContain('[RAZAO SOCIAL CLIENTE]');
    expect(placeholdersIn('a [X] b [Y]')).toEqual(['[X]', '[Y]']);
  });

  it('imports plain text into blocks', () => {
    expect(blocksFromPlainText('CLÁUSULA PRIMEIRA\n\nO objeto\ndo contrato.\n\n')).toEqual([
      { type: 'heading1', text: 'CLÁUSULA PRIMEIRA' },
      { type: 'paragraph', text: 'O objeto do contrato.' },
    ]);
  });

  it('enforces the limits (500 blocks, 20 000 per block, 400 000 in total)', () => {
    const block = { type: 'paragraph' as const, text: 'x' };
    expect(contractTemplateInputSchema.safeParse({ blocks: Array(MAX_CONTRACT_BLOCKS).fill(block) }).success).toBe(true);
    expect(contractTemplateInputSchema.safeParse({ blocks: Array(MAX_CONTRACT_BLOCKS + 1).fill(block) }).success).toBe(false);
    expect(contractTemplateInputSchema.safeParse({ blocks: [{ type: 'paragraph', text: 'x'.repeat(MAX_CONTRACT_BLOCK_CHARS + 1) }] }).success).toBe(false);
    const big = { type: 'paragraph' as const, text: 'x'.repeat(MAX_CONTRACT_BLOCK_CHARS) };
    expect(contractTemplateInputSchema.safeParse({ blocks: Array(21).fill(big) }).success).toBe(false);
    expect(contractTemplateInputSchema.safeParse({ blocks: [{ type: 'image', text: 'x' }] }).success).toBe(false);
    expect(contractTemplateInputSchema.safeParse({ blocks: null }).success).toBe(true);
    expect(contractTemplateInputSchema.safeParse({}).success).toBe(false);
    expect(contractTemplateInputSchema.safeParse({ watermark: 'data:image/svg+xml;base64,PHN2Zz4=' }).success).toBe(false);
  });
});

describe('client fiscal data, accesses and documents (input)', () => {
  const base = {
    name: 'Padaria Ltda',
    document: '11.222.333/0001-81',
    taxRegime: 'simples_nacional',
    simplesAnnex: 'I',
    contractStartDate: '2026-01-10',
  };
  it('absent phase 3 fields stay undefined (keep what is stored)', () => {
    const parsed = clientInputSchema.parse(base);
    expect(parsed.stateRegistration).toBeUndefined();
    expect(parsed.municipalRegistration).toBeUndefined();
    expect(parsed.responsibleDocument).toBeUndefined();
    expect(parsed.simplesAccessCode).toBeUndefined();
    expect(parsed.documents).toBeUndefined();
  });

  it('exempt clears the state registration; empty means remove; CPF is validated', () => {
    expect(clientInputSchema.parse({ ...base, stateRegistration: '110.042', stateRegistrationExempt: true }).stateRegistration).toBeNull();
    expect(clientInputSchema.parse({ ...base, municipalRegistration: '' }).municipalRegistration).toBeNull();
    expect(clientInputSchema.parse({ ...base, responsibleDocument: '529.982.247-25' }).responsibleDocument).toBe('52998224725');
    expect(clientInputSchema.safeParse({ ...base, responsibleDocument: '111.111.111-12' }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...base, stateRegistration: '<script>' }).success).toBe(false);
  });

  it('accesses in three states; the Simples code only for Simples Nacional and MEI', () => {
    expect(credentialUpdateSchema.parse({ action: 'keep' })).toEqual({ action: 'keep' });
    expect(credentialUpdateSchema.safeParse({ action: 'set', value: '   ' }).success).toBe(false);
    expect(credentialUpdateSchema.safeParse({ action: 'set', value: 'x'.repeat(201) }).success).toBe(false);
    expect(credentialUpdateSchema.safeParse({ action: 'reveal' }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...base, simplesAccessCode: { action: 'set', value: '123' } }).success).toBe(true);
    expect(
      clientInputSchema.safeParse({ ...base, taxRegime: 'real_profit', simplesAnnex: null, simplesAccessCode: { action: 'set', value: '123' } })
        .success,
    ).toBe(false);
    expect(clientInputSchema.safeParse({ ...base, taxRegime: 'mei', simplesAccessCode: { action: 'set', value: '1' } }).success).toBe(true);
  });

  it('documents: type from the catalog, a name for "other", note up to 200, up to 50, no repeated id', () => {
    expect(clientDocumentInputSchema.safeParse({ kind: 'alvara' }).success).toBe(false);
    expect(clientDocumentInputSchema.safeParse({ kind: 'other' }).success).toBe(false);
    expect(clientDocumentInputSchema.parse({ kind: 'cndt', customName: 'Ignored' }).customName).toBeNull();
    expect(clientDocumentInputSchema.safeParse({ kind: 'cndt', note: 'x'.repeat(201) }).success).toBe(false);
    expect(clientInputSchema.safeParse({ ...base, documents: Array(51).fill({ kind: 'cndt' }) }).success).toBe(false);
    const id = '6f9619ff-8b86-4d01-b42d-00c04fc964ff';
    expect(clientInputSchema.safeParse({ ...base, documents: [{ id, kind: 'cndt' }, { id, kind: 'pgr' }] }).success).toBe(false);
  });
});

describe('unions, office and photo (input)', () => {
  it('union: CNPJ, name, base month; no cycles in the registry', () => {
    const u = unionInputSchema.parse({ name: 'Sindicato', document: '11.222.333/0001-81', baseMonth: 11, cycles: [{ year: 2026 }] });
    expect(u.document).toBe('11222333000181');
    expect('cycles' in u).toBe(false);
    expect(u.active).toBeUndefined();
    expect(u.clientIds).toBeUndefined();
    expect(unionInputSchema.safeParse({ name: 'S', document: '11.222.333/0001-80' }).error?.issues[0]?.message).toBe('CNPJ inválido.');
    expect(unionInputSchema.safeParse({ name: '', document: '11222333000181' }).success).toBe(false);
    expect(unionInputSchema.safeParse({ name: 'S', document: '11222333000181', baseMonth: 13 }).success).toBe(false);
    expect(unionConventionsInputSchema.safeParse({ cycles: [{ year: 2026, published: true }, { year: 2026, published: false }] }).success).toBe(false);
    expect(unionConventionsInputSchema.safeParse({ cycles: [{ year: 1999, published: true }] }).success).toBe(false);
  });

  it('Pix keys are validated and normalized by type', () => {
    expect(normalizePixKey('email', 'Financeiro@Efficio.app')).toBe('financeiro@efficio.app');
    expect(normalizePixKey('cpf', '529.982.247-25')).toBe('52998224725');
    expect(normalizePixKey('cpf', '111.111.111-11')).toBeNull();
    expect(normalizePixKey('cnpj', '11.222.333/0001-81')).toBe('11222333000181');
    expect(normalizePixKey('phone', '(19) 99876-5432')).toBe('+5519998765432');
    expect(normalizePixKey('random', '123e4567-e89b-12d3-a456-426614174000')).toBe('123e4567-e89b-12d3-a456-426614174000');
    expect(normalizePixKey('random', 'abc')).toBeNull();
    const office = { document: '60.415.732/0001-74', legalName: 'Efficio' };
    expect(officeInputSchema.safeParse({ ...office, pixKeyType: 'cpf', pixKey: 'x@y.com' }).error?.issues[0]?.message).toBe(
      'Chave Pix inválida para o tipo escolhido.',
    );
    expect(officeInputSchema.parse({ ...office, pixKeyType: 'phone', pixKey: '19998765432' }).pixKey).toBe('+5519998765432');
    expect(officeInputSchema.parse({ ...office, pixKeyType: 'email' }).pixKeyType).toBeNull();
    expect(officeInputSchema.safeParse({ legalName: 'x', document: '' }).error?.issues[0]?.message).toBe('Informe o CNPJ do escritório.');
  });

  it('profile photo: PNG, JPEG or WebP data URI only', () => {
    expect(profilePhotoInputSchema.safeParse({ photo: 'data:image/png;base64,iVBORw0KGgo=' }).success).toBe(true);
    expect(profilePhotoInputSchema.safeParse({ photo: 'data:image/svg+xml;base64,PHN2Zz4=' }).success).toBe(false);
    expect(profilePhotoInputSchema.safeParse({ photo: 'https://example.com/a.png' }).success).toBe(false);
  });
});
