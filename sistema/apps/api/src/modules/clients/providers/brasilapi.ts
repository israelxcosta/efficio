// BrasilAPI (https://brasilapi.com.br) over plain fetch: GET /api/cnpj/v1/:cnpj returns the public
// registry of the Receita Federal (razão social, endereço, situação cadastral, CNAE, QSA and the
// Simples/MEI options). No credentials. Works in Node (API) and in the browser demo (CORS enabled).
// Every field is treated as untrusted text: trimmed, size-limited and validated before reaching the
// form.

import { isISODate, onlyDigits, type CnpjLookupResult, type CnpjPartner, type TaxRegime } from '@effinance/shared';
import { CnpjProviderError, type CnpjProvider } from './types';

export const BRASILAPI_URL = 'https://brasilapi.com.br';

interface BrasilApiPartner {
  nome_socio?: unknown;
  qualificacao_socio?: unknown;
}

interface BrasilApiCompany {
  cnpj?: unknown;
  razao_social?: unknown;
  nome_fantasia?: unknown;
  data_inicio_atividade?: unknown;
  cnae_fiscal?: unknown;
  cnae_fiscal_descricao?: unknown;
  descricao_situacao_cadastral?: unknown;
  email?: unknown;
  ddd_telefone_1?: unknown;
  ddd_telefone_2?: unknown;
  cep?: unknown;
  descricao_tipo_de_logradouro?: unknown;
  logradouro?: unknown;
  numero?: unknown;
  complemento?: unknown;
  bairro?: unknown;
  municipio?: unknown;
  uf?: unknown;
  opcao_pelo_simples?: unknown;
  opcao_pelo_mei?: unknown;
  qsa?: unknown;
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const clean = String(value).replace(/\s+/g, ' ').trim();
  return clean ? clean.slice(0, max) : null;
}

/** "SAO PAULO" → "Sao Paulo"; keeps short connectors in lower case ("Rio de Janeiro"). */
export function titleCase(value: string | null): string | null {
  if (!value) return null;
  return value
    .toLocaleLowerCase('pt-BR')
    .split(' ')
    .map((word, i) => (i > 0 && /^(d[aeo]s?|e)$/.test(word) ? word : word.charAt(0).toLocaleUpperCase('pt-BR') + word.slice(1)))
    .join(' ');
}

function phone(...values: unknown[]): string | null {
  for (const value of values) {
    const digits = onlyDigits(text(value, 20));
    if (digits.length === 10 || digits.length === 11) return digits;
  }
  return null;
}

function email(value: unknown): string | null {
  const v = text(value, 120)?.toLowerCase() ?? null;
  return v && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v) ? v : null;
}

/** "6920601" + description → "6920-6/01 — Atividades de contabilidade". */
function activity(code: unknown, description: unknown): string | null {
  const digits = onlyDigits(text(code, 10)).padStart(7, '0');
  const label = text(description, 160);
  const formatted = digits.length === 7 && digits !== '0000000' ? `${digits.slice(0, 4)}-${digits.slice(4, 5)}/${digits.slice(5)}` : null;
  if (formatted && label) return `${formatted} — ${label}`;
  return formatted ?? label;
}

function street(type: unknown, name: unknown): string | null {
  const t = text(type, 30);
  const n = text(name, 100);
  if (!n) return null;
  const full = t && !n.toUpperCase().startsWith(t.toUpperCase()) ? `${t} ${n}` : n;
  return titleCase(full)!.slice(0, 120);
}

/** Only the regimes that are public: MEI and Simples Nacional options. */
function regime(company: BrasilApiCompany): TaxRegime | null {
  if (company.opcao_pelo_mei === true) return 'mei';
  if (company.opcao_pelo_simples === true) return 'simples_nacional';
  return null;
}

function partners(value: unknown): CnpjPartner[] {
  if (!Array.isArray(value)) return [];
  return value
    .slice(0, 30)
    .map((p: BrasilApiPartner) => ({ name: titleCase(text(p?.nome_socio, 120)), role: text(p?.qualificacao_socio, 80) }))
    .filter((p): p is CnpjPartner => Boolean(p.name));
}

export function normalizeCompany(cnpj: string, company: BrasilApiCompany): CnpjLookupResult {
  const name = text(company.razao_social, 160);
  if (!name) throw new CnpjProviderError('BrasilAPI: resposta sem razão social');
  const openedAt = text(company.data_inicio_atividade, 10);
  const zip = onlyDigits(text(company.cep, 10));
  const uf = text(company.uf, 2)?.toUpperCase() ?? null;
  const qsa = partners(company.qsa);
  const administrator = qsa.find((p) => /administrador|diretor|presidente|titular/i.test(p.role ?? '')) ?? qsa[0];
  return {
    document: cnpj,
    name,
    tradeName: text(company.nome_fantasia, 160),
    openedAt: openedAt && isISODate(openedAt) ? openedAt : null,
    mainActivity: activity(company.cnae_fiscal, company.cnae_fiscal_descricao),
    registrationStatus: text(company.descricao_situacao_cadastral, 40),
    email: email(company.email),
    phone: phone(company.ddd_telefone_1, company.ddd_telefone_2),
    zipCode: zip.length === 8 ? zip : null,
    street: street(company.descricao_tipo_de_logradouro, company.logradouro),
    number: text(company.numero, 20),
    complement: titleCase(text(company.complemento, 60)),
    district: titleCase(text(company.bairro, 80)),
    city: titleCase(text(company.municipio, 80)),
    state: uf && /^[A-Z]{2}$/.test(uf) ? uf : null,
    taxRegime: regime(company),
    partners: qsa,
    responsibleName: administrator?.name ?? null,
  };
}

export class BrasilApiCnpjProvider implements CnpjProvider {
  readonly name = 'brasilapi' as const;

  constructor(
    private readonly options: { baseUrl?: string; timeoutMs?: number; fetch?: typeof fetch } = {},
  ) {}

  async lookup(cnpj: string): Promise<CnpjLookupResult | null> {
    const digits = onlyDigits(cnpj);
    if (digits.length !== 14) throw new CnpjProviderError('CNPJ inválido');
    const doFetch = this.options.fetch ?? globalThis.fetch.bind(globalThis);
    let res: Response;
    try {
      res = await doFetch(`${this.options.baseUrl ?? BRASILAPI_URL}/api/cnpj/v1/${digits}`, {
        headers: { accept: 'application/json' },
        signal: AbortSignal.timeout(this.options.timeoutMs ?? 10_000),
      });
    } catch {
      throw new CnpjProviderError('BrasilAPI indisponível');
    }
    if (res.status === 404) return null;
    if (!res.ok) throw new CnpjProviderError(`BrasilAPI respondeu ${res.status}`, res.status);
    let body: unknown;
    try {
      body = await res.json();
    } catch {
      throw new CnpjProviderError('BrasilAPI respondeu um corpo inválido', res.status);
    }
    if (!body || typeof body !== 'object') throw new CnpjProviderError('BrasilAPI respondeu um corpo inválido', res.status);
    return normalizeCompany(digits, body as BrasilApiCompany);
  }
}
