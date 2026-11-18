import { describe, expect, it } from 'vitest';
import {
  buildOnboardingDocument,
  describeRecurringDeadline,
  maskCpf,
  ONBOARDING_SLIDE_KEYS,
  ONBOARDING_TEMPLATE_SLIDES,
  onboardingFactoryText,
  onboardingHideableKeys,
  onboardingOverridesInputSchema,
  onboardingTemplateInputSchema,
  onboardingTextKeys,
  regimeGroupItems,
  ONBOARDING_DEFAULT_PARAMS,
  normalizeOnboardingParams,
  onboardingParamsSchema,
  type OnboardingBuildInput,
  type OnboardingDocument,
  type RegimeGroupRegime,
  type TaxRegime,
} from '../src';

const recurringOf = (regime: RegimeGroupRegime) =>
  regimeGroupItems(regime).map((i) => ({
    catalogKey: i.key,
    name: i.name,
    department: { fiscal: 'Fiscal', personnel: 'Pessoal/DP', accounting: 'Contábil' }[i.department],
    period: i.period,
    dueDay: i.dueDay,
    dueMonth: i.dueMonth,
    referenceOffset: i.referenceOffset,
  }));

function build(regime: TaxRegime, employees: number, extra: Partial<OnboardingBuildInput> = {}): OnboardingDocument {
  return buildOnboardingDocument({
    template: null,
    overrides: null,
    office: { name: 'Efficio Contabilidade', logo: null },
    client: {
      name: 'Padaria Pão Quente Ltda',
      tradeName: 'Pão Quente',
      cnpj: '11222333000181',
      taxRegime: regime,
      clientSince: '2025-01-10',
      employees,
      unions: ['SINDCOM'],
    },
    recurring: regime === 'exempt' || regime === 'other' ? [] : recurringOf(regime),
    updatedAt: '2026-11-18T15:00:00.000Z',
    today: '2026-11-18',
    ...extra,
  });
}

const slide = (doc: OnboardingDocument, key: string) => doc.slides.find((s) => s.key === key)!;
const names = (doc: OnboardingDocument, key: string) => slide(doc, key).table!.map((r) => r.name);
const allText = (doc: OnboardingDocument) => JSON.stringify(doc.slides);

describe('onboarding template', () => {
  it('has the 18 slides in order and every key resolves to its factory text', () => {
    expect(ONBOARDING_TEMPLATE_SLIDES.map((s) => s.key)).toEqual([...ONBOARDING_SLIDE_KEYS]);
    const keys = onboardingTextKeys();
    expect(new Set(keys).size).toBe(keys.length);
    for (const key of keys) expect(onboardingFactoryText(key), key).toBeTypeOf('string');
    expect(onboardingFactoryText('cover.nope')).toBeUndefined();
    expect(new Set(onboardingHideableKeys()).size).toBe(onboardingHideableKeys().length);
  });

  it('refuses unknown text and hidden keys', () => {
    const params = ONBOARDING_DEFAULT_PARAMS;
    expect(onboardingTemplateInputSchema.safeParse({ params, texts: { 'cover.title': 'X' } }).success).toBe(true);
    expect(onboardingTemplateInputSchema.safeParse({ params, texts: { 'cover.bogus': 'X' } }).success).toBe(false);
    expect(onboardingOverridesInputSchema.safeParse({ hidden: ['fiscal.items.simples-cards', 'obligations.defis'] }).success).toBe(true);
    expect(onboardingOverridesInputSchema.safeParse({ hidden: ['fiscal.items.nope'] }).success).toBe(false);
  });
});

describe('buildOnboardingDocument', () => {
  it('Simples Nacional with employees: tasks by area, fixed rows, placeholders filled', () => {
    const doc = build('simples_nacional', 3);
    expect(doc.slides).toHaveLength(18);
    expect(doc.title).toBe('Efficio Contabilidade · Onboarding do cliente · Padaria Pão Quente Ltda');
    expect(slide(doc, 'cover').items.map((i) => i.text)).toEqual([
      'Pão Quente · CNPJ 11.222.333/0001-81',
      'Simples Nacional',
      'Cliente desde 10/01/2025',
      '3 empregados · SINDCOM',
      'Atualizado em 18/11/2026',
    ]);
    expect(names(doc, 'fiscal')).toEqual(['DCTFWeb', 'EFD-Reinf', 'PGDAS-D e DAS', 'DEFIS', 'Vendas no cartão e PIX', 'Guias fora do DAS (ICMS-ST, DIFAL, ISS retido)']);
    expect(names(doc, 'personnel')).toEqual(['Folha de pagamento', 'eSocial — eventos periódicos', 'FGTS Digital', '13º e informe de rendimentos']);
    expect(names(doc, 'accounting')).toContain('Balanço anual');
    const das = slide(doc, 'fiscal').table!.find((r) => r.key === 'pgdas_das')!;
    expect(das).toMatchObject({ deadline: 'dia 20 do mês seguinte', source: 'task', area: 'fiscal' });
    expect(das.need).toBe('notas emitidas e recebidas até o dia 10 e relatório das maquininhas até o dia 10');
    expect(slide(doc, 'personnel').subtitle).toBe('Hoje são 3 empregados, com obrigações todo mês. A maior parte é com a gente.');
    expect(slide(doc, 'sending').items[0]).toMatchObject({ label: 'fiscal@efficio.com.br', code: 'Notas fiscais 10/2026 | Padaria Pão Quente Ltda' });
    expect(slide(doc, 'sending').items.find((i) => i.id === 'accounting')!.code).toBe('Extratos bancários 10/2026 | Padaria Pão Quente Ltda');
    expect(slide(doc, 'firstSteps').items.map((i) => i.id)).toEqual(['contract', 'ecac', 'access-simples', 'closing', 'employees', 'routine']);
    expect(doc.missing).toEqual(['escritorio.crc', 'escritorio.email', 'escritorio.whatsapp']);
    expect(allText(doc)).not.toMatch(/\{\{/);
  });

  it('MEI without employees: MEI rows only, every section still there', () => {
    const doc = build('mei', 0);
    expect(names(doc, 'fiscal')).toEqual(['DAS-MEI', 'DASN-SIMEI']);
    expect(names(doc, 'accounting')).toEqual(['Controle de receitas e livro caixa', 'Pró-labore e distribuição de lucros']);
    // No personnel task applies to MEI: the fixed rows of the template fill the table.
    expect(names(doc, 'personnel')).toEqual(['Folha e salários', 'eSocial', 'FGTS Digital', 'DCTFWeb (INSS e IRRF da folha)', '13º e informe de rendimentos']);
    expect(slide(doc, 'personnel').subtitle).toBe('Hoje você não tem empregados. Quando contratar, é assim que funciona.');
    expect(slide(doc, 'cover').items[3]!.text).toBe('Sem empregados · SINDCOM');
    expect(slide(doc, 'numbers').items.map((i) => i.id)).toEqual(['mei-fiscal', 'mei-accounting', 'personnel', 'dates']);
    expect(slide(doc, 'firstSteps').items.map((i) => i.id)).toEqual(['ccmei', 'ecac', 'access-simples', 'closing', 'employees', 'routine']);
    expect(slide(doc, 'month').items.map((i) => i.id)).toContain('pay-mei');
    for (const key of ['admission', 'vacation', 'termination', 'esocial']) expect(slide(doc, key).items.length).toBeGreaterThan(0);
  });

  it('personnel content is the same with 0 or more employees (only the supporting sentence changes)', () => {
    for (const regime of ['mei', 'simples_nacional', 'presumed_profit', 'real_profit', 'exempt'] as TaxRegime[]) {
      const none = build(regime, 0);
      const some = build(regime, 3);
      for (const key of ['numbers', 'personnel', 'month', 'documents', 'sending', 'admission', 'vacation', 'termination', 'esocial', 'fines', 'firstSteps']) {
        const strip = (d: OnboardingDocument) => ({ items: slide(d, key).items.map((i) => i.id), table: slide(d, key).table?.map((r) => r.key) ?? null });
        expect(strip(none), `${regime} ${key}`).toEqual(strip(some));
      }
      expect(slide(none, 'personnel').subtitle).toMatch(/Quando contratar/);
    }
  });

  it('Lucro Presumido and Lucro Real', () => {
    const presumed = build('presumed_profit', 2);
    expect(names(presumed, 'fiscal')).toEqual(['DCTFWeb', 'EFD-Reinf', 'PIS/COFINS', 'EFD-Contribuições', 'EFD ICMS/IPI', 'IRPJ e CSLL trimestrais']);
    expect(names(presumed, 'accounting')).toEqual(['ECD', 'ECF', 'Conciliação e balancete', 'Pró-labore', 'Lucros dos sócios']);
    expect(slide(presumed, 'month').items.map((i) => i.id)).toEqual(['variables', 'salaries', 'documents', 'esocial', 'pay-profit', 'pis-cofins']);
    expect(names(presumed, 'personnel')).toEqual(['Folha de pagamento', 'eSocial — eventos periódicos', 'FGTS Digital', '13º e informe de rendimentos']);
    const real = build('real_profit', 0);
    expect(names(real, 'fiscal')).toContain('IRPJ e CSLL — estimativa mensal');
    expect(names(real, 'accounting')).toEqual(['ECD', 'ECF', 'Conciliação e balancete', 'Inventário de estoque', 'Pró-labore e lucros']);
    expect(slide(real, 'firstSteps').items.map((i) => i.id)).toEqual(['contract', 'ecac', 'access', 'closing', 'employees', 'routine']);
  });

  it('office template then client adjustment, hidden items, office data and deadlines', () => {
    const doc = build('simples_nacional', 0, {
      template: {
        params: {
          ...ONBOARDING_DEFAULT_PARAMS,
          contact: { whatsapp: '(19) 99999-0000', crc: 'SP-123456/O', hours: null },
          deadlines: { ...ONBOARDING_DEFAULT_PARAMS.deadlines, documentsDay: 5 },
        },
        texts: { 'howWeWork.title': 'Como funciona', 'summary.title': 'Índice do escritório' },
        hidden: ['fiscal.items.simples-cards'],
      },
      overrides: { texts: { 'summary.title': 'Índice da padaria' }, hidden: ['obligations.defis'], employees: 4 },
    });
    expect(slide(doc, 'howWeWork').title).toBe('Como funciona');
    expect(slide(doc, 'summary').title).toBe('Índice da padaria');
    expect(names(doc, 'fiscal')).not.toContain('Vendas no cartão e PIX');
    expect(names(doc, 'fiscal')).not.toContain('DEFIS');
    expect(doc.client.employees).toBe(4);
    expect(slide(doc, 'month').items.find((i) => i.id === 'documents')!.label).toBe('Até o dia 5');
    expect(slide(doc, 'confirm').items.find((i) => i.id === 'signature')!.text).toBe('Efficio Contabilidade · CRC SP-123456/O · Bem-vindos!');
    expect(doc.missing).toEqual(['escritorio.email', 'escritorio.horario']);
  });

  it('every parameter reaches the slides through its placeholder or rule', () => {
    const p = ONBOARDING_DEFAULT_PARAMS;
    const doc = build('simples_nacional', 0, {
      office: { name: 'Contábil Alfa', logo: 'data:image/png;base64,AAAA', phone: '(19) 3333-4444', email: 'oi@alfa.com.br', website: null, address: null },
      template: {
        params: {
          contact: { whatsapp: '(19) 90000-1111', hours: 'Seg. a sex.', crc: 'SP-1' },
          emails: { fiscal: 'f@alfa.com.br', personnel: 'dp@alfa.com.br', accounting: 'c@alfa.com.br' },
          subjects: { ...p.subjects, invoices: 'NF {{competencia}} / {{razaoSocial}}', termination: 'Desligamento | {{razaoSocial}}', vacation: 'Ferias | {{razaoSocial}}' },
          deadlines: { documentsDay: 8, cardsDay: 9, cardsDepartment: 'accounting', payrollVariablesDay: 2, proLaboreDay: 3, admissionBusinessDays: 1, vacationDaysBefore: 7, defisDay: 20, defisMonth: 3, linkDays: 10 },
          rules: { admissionExamByClient: false, terminationRequestFirst: false, unionAssistance: false, payrollAdvance: true },
        },
        texts: {},
        hidden: [],
      },
    });
    const item = (key: string, id: string) => slide(doc, key).items.find((i) => i.id === id)!;
    expect(doc.office).toMatchObject({ name: 'Contábil Alfa', logo: 'data:image/png;base64,AAAA', email: 'oi@alfa.com.br', whatsapp: '(19) 90000-1111' });
    expect(slide(doc, 'summary').subtitle).toContain('vale por 10 dias');
    expect(item('documents', 'invoices').detail).toBe('dia 8');
    expect(item('documents', 'cards')).toMatchObject({ detail: 'dia 9', text: 'relatório de vendas do mês de cada operadora, para o Contábil' });
    expect(item('documents', 'pro-labore').detail).toBe('dia 3');
    expect(item('documents', 'defis').detail).toBe('até 20/03');
    expect(item('month', 'variables').label).toBe('Até o dia 2');
    expect(item('sending', 'fiscal')).toMatchObject({ label: 'f@alfa.com.br', code: 'NF 10/2026 / Padaria Pão Quente Ltda' });
    expect(item('sending', 'cards').label).toBe('c@alfa.com.br');
    expect(item('admission', 'data')).toMatchObject({ label: '1 dia útil antes', text: 'envie dados e documentos para dp@alfa.com.br' });
    expect(slide(doc, 'admission').items.map((i) => i.id)).toContain('exam-office');
    expect(item('vacation', 'request')).toMatchObject({ label: '7 dias antes', code: 'Ferias | Padaria Pão Quente Ltda' });
    expect(slide(doc, 'termination').items.map((i) => i.id)).toEqual(['request-after', 'calculate', 'pay', 'fgts', 'union-client']);
    expect(item('termination', 'request-after').code).toBe('Desligamento | Padaria Pão Quente Ltda');
    expect(slide(doc, 'termination').subtitle).toMatch(/no mesmo dia/);
    expect(names(doc, 'personnel')).toContain('Adiantamento quinzenal');
    expect(slide(doc, 'fiscal').table!.find((r) => r.key === 'defis')!.need).toContain('até 20/03');
    expect(allText(doc)).not.toMatch(/\{\{/);
    // Without a registry logo the document has none (the deck shows the Efficio wordmark).
    expect(build('mei', 0).office.logo).toBeNull();
  });

  it('parameters: validation and the first version still read', () => {
    const p = ONBOARDING_DEFAULT_PARAMS;
    const ok = (deadlines: Partial<typeof p.deadlines>) => onboardingParamsSchema.safeParse({ ...p, deadlines: { ...p.deadlines, ...deadlines } }).success;
    expect(ok({})).toBe(true);
    expect(ok({ documentsDay: 0 })).toBe(false);
    expect(ok({ cardsDay: 32 })).toBe(false);
    expect(ok({ admissionBusinessDays: 0 })).toBe(true);
    expect(ok({ admissionBusinessDays: 31 })).toBe(false);
    expect(ok({ vacationDaysBefore: 61 })).toBe(false);
    expect(ok({ defisDay: 30, defisMonth: 2 })).toBe(false);
    expect(ok({ defisDay: 31, defisMonth: 13 })).toBe(false);
    expect(ok({ linkDays: 0 })).toBe(false);
    expect(ok({ linkDays: 91 })).toBe(false);
    expect(ok({ documentsDay: 2.5 })).toBe(false);
    expect(onboardingParamsSchema.safeParse({ ...p, subjects: { ...p.subjects, statements: ' ' } }).success).toBe(false);
    expect(onboardingParamsSchema.safeParse({ ...p, emails: { ...p.emails, fiscal: 'x' } }).success).toBe(false);
    expect(onboardingParamsSchema.safeParse({ ...p, deadlines: { ...p.deadlines, cardsDepartment: 'sales' } }).success).toBe(false);

    expect(normalizeOnboardingParams(null)).toEqual(p);
    const legacy = normalizeOnboardingParams({ office: { name: 'X', whatsapp: '1', email: 'a@b.c', hours: 'h', crc: null, emails: { fiscal: 'f@x.com' }, deadlines: { documentsDay: 6, payrollVariablesDay: 4, admissionBusinessDays: 2, vacationDaysBefore: 9 } } });
    expect(legacy).toMatchObject({ contact: { whatsapp: '1', hours: 'h', crc: null }, emails: { ...p.emails, fiscal: 'f@x.com' } });
    expect(legacy.deadlines).toMatchObject({ documentsDay: 6, cardsDay: 6, payrollVariablesDay: 4, proLaboreDay: 4, admissionBusinessDays: 2, vacationDaysBefore: 9, defisDay: 15, linkDays: 30 });
    // Old placeholder names in saved texts keep working.
    const doc = build('simples_nacional', 0, { template: { texts: { 'howWeWork.title': 'Até o {{prazo.documentos}} para {{escritorio.emailFiscal}} ({{mesExemplo}})' }, hidden: [] } });
    expect(slide(doc, 'howWeWork').title).toBe('Até o dia 10 para fiscal@efficio.com.br (10/2026)');
  });

  it('a recurring task outside the catalog: area by department, deadline from the schedule', () => {
    const doc = build('exempt', 0, {
      client: { name: 'Associação X', tradeName: null, cnpj: null, taxRegime: 'exempt', clientSince: null, employees: null, unions: [] },
      recurring: [
        { catalogKey: null, name: 'RAIS', department: 'Departamento Pessoal', period: 'annual', dueDay: 31, dueMonth: 3, referenceOffset: 3 },
        { catalogKey: null, name: 'Relatório', department: 'Diretoria', period: 'monthly', dueDay: 12, dueMonth: null, referenceOffset: 1 },
      ],
    });
    expect(names(doc, 'personnel')).toEqual(['RAIS', 'Folha e salários', 'eSocial', 'FGTS Digital', 'DCTFWeb (INSS e IRRF da folha)', '13º e informe de rendimentos']);
    expect(doc.obligations.other.map((r) => r.name)).toEqual(['Relatório']);
    expect(names(doc, 'fiscal')).toEqual(['Relatório']);
    expect(doc.obligations.other[0]).toMatchObject({ deadline: 'dia 12 do mês seguinte', need: 'documentos do mês até o dia 10' });
    expect(slide(doc, 'cover').items[3]!.text).toBe('Sem empregados · convenção coletiva da sua categoria');
    expect(doc.missing).toContain('cnpj');
  });

  it('helpers', () => {
    expect(describeRecurringDeadline({ period: 'annual', dueDay: 31, dueMonth: 5, referenceOffset: 5 })).toBe('anual: último dia/05');
    expect(describeRecurringDeadline({ period: 'quarterly', dueDay: 31, dueMonth: 1, referenceOffset: 1 })).toBe('trimestral: último dia do mês seguinte');
    expect(maskCpf('52998224725')).toBe('•••.982.247-••');
  });
});
