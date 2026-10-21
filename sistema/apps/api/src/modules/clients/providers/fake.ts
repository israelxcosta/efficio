// Simulated Receita Federal (development without network, tests): a few fictitious companies with
// valid CNPJs. Any other CNPJ is "not found".

import type { CnpjLookupResult } from '@effinance/shared';
import type { CnpjProvider } from './types';

const address = { complement: null, district: 'Centro', city: 'Campinas', state: 'SP' } as const;

export const FAKE_COMPANIES: CnpjLookupResult[] = [
  {
    document: '11222333000181',
    name: 'PADARIA PAO QUENTE LTDA',
    tradeName: 'Pão Quente',
    openedAt: '2015-04-06',
    mainActivity: '1091-1/02 — Fabricação de produtos de padaria e confeitaria com predominância de produção própria',
    registrationStatus: 'ATIVA',
    email: 'financeiro@paoquente.com.br',
    phone: '1932345678',
    zipCode: '13010111',
    street: 'Rua Barão de Jaguara',
    number: '1200',
    ...address,
    taxRegime: 'simples_nacional',
    partners: [
      { name: 'Marina Albuquerque', role: 'Sócio-Administrador' },
      { name: 'Carlos Albuquerque', role: 'Sócio' },
    ],
    responsibleName: 'Marina Albuquerque',
  },
  {
    document: '45723174000110',
    name: 'TECNOVA SOLUCOES EM SOFTWARE LTDA',
    tradeName: 'Tecnova',
    openedAt: '2019-09-16',
    mainActivity: '6201-5/01 — Desenvolvimento de programas de computador sob encomenda',
    registrationStatus: 'ATIVA',
    email: 'contato@tecnova.dev',
    phone: '19987654321',
    zipCode: '13087500',
    street: 'Avenida José Rocha Bomfim',
    number: '214',
    ...address,
    district: 'Santa Genebra',
    taxRegime: null,
    partners: [{ name: 'Renato Siqueira', role: 'Diretor' }],
    responsibleName: 'Renato Siqueira',
  },
  {
    document: '34028316000103',
    name: 'JULIANA PRADO DESIGN 31847759806',
    tradeName: 'Ju Prado Design',
    openedAt: '2021-02-01',
    mainActivity: '7410-2/02 — Design de interiores',
    registrationStatus: 'ATIVA',
    email: null,
    phone: '19991112233',
    zipCode: '13025320',
    street: 'Rua Coronel Quirino',
    number: '88',
    ...address,
    district: 'Cambuí',
    taxRegime: 'mei',
    partners: [],
    responsibleName: null,
  },
];

export class FakeCnpjProvider implements CnpjProvider {
  readonly name = 'fake' as const;

  constructor(private readonly companies: CnpjLookupResult[] = FAKE_COMPANIES) {}

  async lookup(cnpj: string): Promise<CnpjLookupResult | null> {
    return this.companies.find((c) => c.document === cnpj) ?? null;
  }
}
