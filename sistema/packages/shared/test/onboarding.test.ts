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
  ONBOARDING_DEFAULT_OFFICE,
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
    const office = ONBOARDING_DEFAULT_OFFICE;
    expect(onboardingTemplateInputSchema.safeParse({ office, texts: { 'cover.title': 'X' } }).success).toBe(true);
    expect(onboardingTemplateInputSchema.safeParse({ office, texts: { 'cover.bogus': 'X' } }).success).toBe(false);
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
    expect(das.need).toBe('notas emitidas e recebidas e relatório das maquininhas até o dia 10');
    expect(slide(doc, 'personnel').subtitle).toBe('Hoje são 3 empregados, com obrigações todo mês. A maior parte é com a gente.');
    expect(slide(doc, 'sending').items[0]).toMatchObject({ label: 'fiscal@efficio.com.br', code: 'Notas fiscais 10/2026 | Padaria Pão Quente Ltda' });
    expect(slide(doc, 'firstSteps').items.map((i) => i.id)).toEqual(['contract', 'ecac', 'access-simples', 'closing', 'employees']);
    expect(doc.missing).toEqual(['escritorio.crc', 'escritorio.email', 'escritorio.horario', 'escritorio.whatsapp']);
    expect(allText(doc)).not.toMatch(/\{\{/);
  });

  it('MEI without employees: MEI rows only, every section still there', () => {
    const doc = build('mei', 0);
    expect(names(doc, 'fiscal')).toEqual(['DAS-MEI', 'DASN-SIMEI']);
    expect(names(doc, 'accounting')).toEqual(['Controle de receitas e livro caixa', 'Pró-labore e distribuição de lucros']);
    expect(names(doc, 'personnel')).toEqual(['Folha e salários', 'eSocial', '13º e informe de rendimentos']);
    expect(slide(doc, 'personnel').subtitle).toBe('Hoje você não tem empregados. Quando contratar, é assim que funciona.');
    expect(slide(doc, 'cover').items[3]!.text).toBe('Sem empregados · SINDCOM');
    expect(slide(doc, 'numbers').items.map((i) => i.id)).toEqual(['mei-fiscal', 'mei-accounting', 'personnel-none', 'dates']);
    expect(slide(doc, 'firstSteps').items.map((i) => i.id)).toEqual(['ccmei', 'ecac', 'access-simples', 'closing']);
    expect(slide(doc, 'month').items.map((i) => i.id)).toContain('pay-mei');
    for (const key of ['admission', 'vacation', 'termination', 'esocial']) expect(slide(doc, key).items.length).toBeGreaterThan(0);
  });

  it('MEI with an employee gets FGTS and DCTFWeb rows', () => {
    expect(names(build('mei', 1), 'fiscal')).toEqual(['DAS-MEI', 'DASN-SIMEI', 'FGTS Digital (MEI pode ter 1 empregado)', 'DCTFWeb e DARF (INSS do empregado + 3% patronal)']);
  });

  it('Lucro Presumido and Lucro Real', () => {
    const presumed = build('presumed_profit', 2);
    expect(names(presumed, 'fiscal')).toEqual(['DCTFWeb', 'EFD-Reinf', 'PIS/COFINS', 'EFD-Contribuições', 'EFD ICMS/IPI', 'IRPJ e CSLL trimestrais']);
    expect(names(presumed, 'accounting')).toEqual(['ECD', 'ECF', 'Conciliação e balancete', 'Pró-labore', 'Lucros dos sócios']);
    expect(slide(presumed, 'month').items.map((i) => i.id)).toEqual(['variables', 'salaries', 'documents', 'esocial', 'pay-profit', 'pis-cofins']);
    const real = build('real_profit', 0);
    expect(names(real, 'fiscal')).toContain('IRPJ e CSLL — estimativa mensal');
    expect(names(real, 'accounting')).toEqual(['ECD', 'ECF', 'Conciliação e balancete', 'Inventário de estoque', 'Pró-labore e lucros']);
    expect(slide(real, 'firstSteps').items.map((i) => i.id)).toEqual(['contract', 'ecac', 'access', 'closing']);
  });

  it('office template then client adjustment, hidden items, office data and deadlines', () => {
    const doc = build('simples_nacional', 0, {
      template: {
        office: { ...ONBOARDING_DEFAULT_OFFICE, whatsapp: '(19) 99999-0000', crc: 'SP-123456/O', deadlines: { ...ONBOARDING_DEFAULT_OFFICE.deadlines, documentsDay: 5 } },
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

  it('a recurring task outside the catalog: area by department, deadline from the schedule', () => {
    const doc = build('exempt', 0, {
      client: { name: 'Associação X', tradeName: null, cnpj: null, taxRegime: 'exempt', clientSince: null, employees: null, unions: [] },
      recurring: [
        { catalogKey: null, name: 'RAIS', department: 'Departamento Pessoal', period: 'annual', dueDay: 31, dueMonth: 3, referenceOffset: 3 },
        { catalogKey: null, name: 'Relatório', department: 'Diretoria', period: 'monthly', dueDay: 12, dueMonth: null, referenceOffset: 1 },
      ],
    });
    expect(names(doc, 'personnel')).toEqual(['RAIS', '13º e informe de rendimentos']);
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
