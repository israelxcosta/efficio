// Assembly of the client onboarding (pure): factory template ← office's template ← client's adjustment,
// the client's data and the recurring tasks that apply to it → the document with every text resolved.
// Used by the API (preview and public page), the browser demo and the web.

import { TASK_TIME_ZONE, TAX_REGIME_LABELS, type TaxRegime } from '../constants';
import {
  type OnboardingArea,
  type OnboardingCondition,
  type OnboardingDocument,
  ONBOARDING_DEPARTMENT_LABELS,
  type OnboardingObligationRow,
  type OnboardingOverridesStored,
  type OnboardingParams,
  type OnboardingRecurringInput,
  type OnboardingSlide,
  type OnboardingRuleKey,
  type OnboardingTemplateStored,
} from '../onboarding';
import {
  ONBOARDING_DEFAULT_DUE,
  ONBOARDING_DEFAULT_NEED,
  ONBOARDING_DEFAULT_PARAMS,
  ONBOARDING_OBLIGATION_TEXTS,
  ONBOARDING_PLACEHOLDER_ALIASES,
  ONBOARDING_TEMPLATE_SLIDES,
} from '../onboarding-template';
import { matchSuggestedDepartment, normalizeRecurringName, REGIME_GROUP_ITEMS, type SuggestedDepartment } from '../regime-groups';
import { addMonthKey, formatDateBR, monthKey, type ISODate } from './dates';
import { formatCNPJ, formatPhone, onlyDigits } from './documents';
import { dateInTimeZone } from './tasks';

export interface OnboardingClientInput {
  name: string;
  tradeName: string | null;
  /** Digits or formatted. */
  cnpj: string | null;
  taxRegime: TaxRegime | null;
  clientSince: ISODate | null;
  /** From the registry (last "+ Empregados" charge); the adjustment may replace it. null = unknown (0). */
  employees: number | null;
  /** Names of the client's unions (acronym or name). */
  unions: string[];
}

export interface OnboardingRegistryOffice {
  name: string | null;
  logo: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  address?: string | null;
}

export interface OnboardingBuildInput {
  template: OnboardingTemplateStored | null;
  overrides: OnboardingOverridesStored | null;
  /**
   * From the office registry (Configurações › Escritório): name, logo and contact data. The logo comes
   * only from here (the onboarding has no logo of its own).
   */
  office: OnboardingRegistryOffice;
  client: OnboardingClientInput;
  /** Recurring tasks of the registry that apply to the client (any order). */
  recurring: OnboardingRecurringInput[];
  /** ISO timestamp of the latest relevant change. */
  updatedAt: string;
  /** Today (office time zone): `{{mesExemplo}}` is the previous month. */
  today: ISODate;
}

const FALLBACK_OFFICE_NAME = 'Efficio Contabilidade';
const NO_UNION = 'convenção coletiva da sua categoria';
const MISSING = '—';

const AREA_OF_DEPARTMENT: Record<SuggestedDepartment, Exclude<OnboardingArea, 'other'>> = {
  fiscal: 'fiscal',
  accounting: 'accounting',
  personnel: 'personnel',
};

type Saved = Pick<OnboardingTemplateStored, 'params' | 'office'> | null | undefined;

/**
 * The effective parameters: what was saved over the factory values (field by field). A template saved
 * before the parameters has `office` (WhatsApp, hours, CRC, e-mails and four deadlines): it is converted;
 * its name and general e-mail are dropped (the office registry is the source now).
 */
export function normalizeOnboardingParams(saved: Saved): OnboardingParams {
  const d = ONBOARDING_DEFAULT_PARAMS;
  const p = saved?.params;
  if (p) {
    return {
      contact: { ...d.contact, ...(p.contact ?? {}) },
      emails: { ...d.emails, ...(p.emails ?? {}) },
      subjects: { ...d.subjects, ...(p.subjects ?? {}) },
      deadlines: { ...d.deadlines, ...(p.deadlines ?? {}) },
      rules: { ...d.rules, ...(p.rules ?? {}) },
    };
  }
  const o = saved?.office;
  if (!o) return structuredClone(d);
  const days = o.deadlines ?? {};
  return {
    contact: {
      whatsapp: o.whatsapp ?? d.contact.whatsapp,
      hours: o.hours ?? d.contact.hours,
      crc: o.crc ?? d.contact.crc,
    },
    emails: { ...d.emails, ...(o.emails ?? {}) },
    subjects: { ...d.subjects },
    deadlines: {
      ...d.deadlines,
      ...(days.documentsDay ? { documentsDay: days.documentsDay, cardsDay: days.documentsDay } : {}),
      ...(days.payrollVariablesDay ? { payrollVariablesDay: days.payrollVariablesDay, proLaboreDay: days.payrollVariablesDay } : {}),
      ...(days.admissionBusinessDays !== undefined ? { admissionBusinessDays: days.admissionBusinessDays } : {}),
      ...(days.vacationDaysBefore !== undefined ? { vacationDaysBefore: days.vacationDaysBefore } : {}),
    },
    rules: { ...d.rules },
  };
}

export function conditionHolds(
  when: OnboardingCondition | undefined,
  regime: TaxRegime | null,
  employees: number,
  rules: Record<OnboardingRuleKey, boolean> = ONBOARDING_DEFAULT_PARAMS.rules,
): boolean {
  if (!when) return true;
  if (when.rules) {
    for (const [key, value] of Object.entries(when.rules)) if (rules[key as OnboardingRuleKey] !== value) return false;
  }
  if (when.regimes && (!regime || !when.regimes.includes(regime))) return false;
  if (when.notRegimes && regime && when.notRegimes.includes(regime)) return false;
  if (when.employees === 'some' && employees <= 0) return false;
  if (when.employees === 'none' && employees > 0) return false;
  return true;
}

const ordinalDay = (day: number) => (day === 1 ? 'dia 1º' : `dia ${day}`);
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
const pad2 = (n: number) => String(n).padStart(2, '0');

/** "Rua X, 123, sala 4 - Centro, Campinas/SP" from the registry fields (null when nothing is filled). */
export function formatOfficeAddress(o: {
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
}): string | null {
  const street = [o.street, o.number, o.complement].filter((v) => v?.trim()).join(', ');
  const city = [o.city, o.state].filter((v) => v?.trim()).join('/');
  const district = o.district?.trim() ?? '';
  const head = [street, district].filter(Boolean).join(' - ');
  const out = [head, city].filter(Boolean).join(', ');
  return out || null;
}

const DEPARTMENT_EMAIL_KEY = { fiscal: 'fiscal', accounting: 'accounting', personnel: 'personnel' } as const;

/** Values of the parameters' placeholders (`prazos.*`, `emails.*`, `escritorio.whatsapp|horario|crc`…), subjects not filled. */
export function onboardingParamValues(params: OnboardingParams): Record<string, string | null> {
  const d = params.deadlines;
  return {
    'escritorio.whatsapp': params.contact.whatsapp,
    'escritorio.horario': params.contact.hours,
    'escritorio.crc': params.contact.crc,
    'emails.fiscal': params.emails.fiscal,
    'emails.pessoal': params.emails.personnel,
    'emails.contabil': params.emails.accounting,
    'emails.maquininhas': params.emails[DEPARTMENT_EMAIL_KEY[d.cardsDepartment]],
    'departamentos.maquininhas': ONBOARDING_DEPARTMENT_LABELS[d.cardsDepartment],
    'prazos.notas': ordinalDay(d.documentsDay),
    'prazos.extratos': ordinalDay(d.documentsDay),
    'prazos.maquininhas': ordinalDay(d.cardsDay),
    'prazos.folha': ordinalDay(d.payrollVariablesDay),
    'prazos.proLabore': ordinalDay(d.proLaboreDay),
    'prazos.admissao': plural(d.admissionBusinessDays, 'dia útil', 'dias úteis'),
    'prazos.ferias': plural(d.vacationDaysBefore, 'dia', 'dias'),
    'prazos.defis': `${pad2(d.defisDay)}/${pad2(d.defisMonth)}`,
    'prazos.link': plural(d.linkDays, 'dia', 'dias'),
  };
}

export function employeesText(n: number): string {
  if (n <= 0) return 'Sem empregados';
  return n === 1 ? '1 empregado' : `${n} empregados`;
}

const CATALOG_ORDER = new Map(REGIME_GROUP_ITEMS.map((item, i) => [item.key, i]));
const CATALOG_DEPARTMENT = new Map(REGIME_GROUP_ITEMS.map((item) => [item.key, item.department]));
const CATALOG_BY_NAME = new Map(REGIME_GROUP_ITEMS.map((item) => [normalizeRecurringName(item.name), item.key]));
/** The catalog key of a recurring task: its own, else a handmade task named like a catalog item ("DCTFWeb"). */
const catalogKeyOf = (r: Pick<OnboardingRecurringInput, 'catalogKey' | 'name'>) => r.catalogKey ?? CATALOG_BY_NAME.get(normalizeRecurringName(r.name)) ?? null;

export function buildOnboardingDocument(input: OnboardingBuildInput): OnboardingDocument {
  const params = normalizeOnboardingParams(input.template);
  const texts: Record<string, string> = { ...(input.template?.texts ?? {}), ...(input.overrides?.texts ?? {}) };
  const hidden = new Set([...(input.template?.hidden ?? []), ...(input.overrides?.hidden ?? [])]);
  const { client } = input;
  const employees = Math.max(0, input.overrides?.employees ?? client.employees ?? 0);
  const regime = client.taxRegime;
  const registry = input.office;
  const officeName = registry.name?.trim() ? registry.name : FALLBACK_OFFICE_NAME;
  const blank = (v: string | null | undefined) => (v?.trim() ? v : null);
  const cnpj = client.cnpj ? formatCNPJ(onlyDigits(client.cnpj)) : '';
  const union = client.unions.length > 0 ? client.unions.join(' · ') : null;
  const updatedDate = dateInTimeZone(new Date(input.updatedAt), TASK_TIME_ZONE);
  const example = addMonthKey(monthKey(input.today), -1);

  const values: Record<string, string | null> = {
    razaoSocial: client.name,
    nomeFantasia: client.tradeName?.trim() ? client.tradeName : client.name,
    cnpj: cnpj || null,
    regime: regime ? TAX_REGIME_LABELS[regime] : null,
    clienteDesde: client.clientSince ? formatDateBR(client.clientSince) : null,
    empregados: String(employees),
    empregadosTexto: employeesText(employees),
    sindicato: union ?? NO_UNION,
    atualizadoEm: formatDateBR(updatedDate),
    competencia: `${example.slice(5, 7)}/${example.slice(0, 4)}`,
    'escritorio.nome': officeName,
    'escritorio.telefone': registry.phone?.trim() ? formatPhone(registry.phone) : null,
    'escritorio.email': blank(registry.email),
    'escritorio.site': blank(registry.website),
    'escritorio.endereco': blank(registry.address),
    ...onboardingParamValues(params),
  };
  const missing = new Set<string>();
  const fill = (raw: string): string =>
    raw.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (match, found: string) => {
      const name = ONBOARDING_PLACEHOLDER_ALIASES[found] ?? found;
      if (!(name in values)) return match;
      const value = values[name];
      if (value === null || value === undefined || value === '') {
        missing.add(name);
        return MISSING;
      }
      return value;
    });
  // Standard subjects: filled with the client's data (`{{competencia}}`, `{{razaoSocial}}`…).
  const subjects = params.subjects;
  Object.assign(values, {
    'assuntos.extratos': fill(subjects.statements),
    'assuntos.notas': fill(subjects.invoices),
    'assuntos.folha': fill(subjects.payrollVariables),
    'assuntos.admissao': fill(subjects.admission),
    'assuntos.ferias': fill(subjects.vacation),
    'assuntos.rescisao': fill(subjects.termination),
  });
  /** The text of a key (adjustment → office → factory), filled; null when absent or blank. */
  const resolve = (key: string, factory: string | undefined): string | null => {
    const raw = texts[key] ?? factory;
    if (raw === undefined) return null;
    const out = fill(raw).trim();
    return out === '' ? null : out;
  };
  const holds = (when: OnboardingCondition | undefined) => conditionHolds(when, regime, employees, params.rules);

  // --- obligation rows from the recurring tasks ---
  const obligations: Record<OnboardingArea, OnboardingObligationRow[]> = { fiscal: [], accounting: [], personnel: [], other: [] };
  const sorted = input.recurring
    .map((r) => ({ ...r, catalogKey: catalogKeyOf(r) }))
    .sort((a, b) => {
      const oa = a.catalogKey ? (CATALOG_ORDER.get(a.catalogKey) ?? 999) : 999;
      const ob = b.catalogKey ? (CATALOG_ORDER.get(b.catalogKey) ?? 999) : 999;
      return oa - ob || a.name.localeCompare(b.name, 'pt-BR');
    });
  let custom = 0;
  const seen = new Set<string>();
  for (const r of sorted) {
    const catalog = r.catalogKey && ONBOARDING_OBLIGATION_TEXTS[r.catalogKey] ? r.catalogKey : null;
    if (catalog && seen.has(catalog)) continue;
    if (catalog) seen.add(catalog);
    if (catalog && hidden.has(`obligations.${catalog}`)) continue;
    const byName = r.department ? matchSuggestedDepartment(r.department) : null;
    const byCatalog = r.catalogKey ? CATALOG_DEPARTMENT.get(r.catalogKey) : undefined;
    const suggested = byName ?? byCatalog ?? null;
    const area: OnboardingArea = suggested ? AREA_OF_DEPARTMENT[suggested] : 'other';
    // No legal deadline: only what the client delivers and until when (owner's rule, 20/11/2026).
    const text = catalog ? ONBOARDING_OBLIGATION_TEXTS[catalog]! : { need: ONBOARDING_DEFAULT_NEED, due: ONBOARDING_DEFAULT_DUE };
    const base = `obligations.${catalog ?? 'default'}`;
    obligations[area].push({
      key: catalog ?? `task-${++custom}`,
      area,
      name: r.name,
      need: resolve(`${base}.need`, text.need) ?? '',
      due: text.due !== undefined ? resolve(`${base}.due`, text.due) : null,
      source: 'task',
    });
  }

  // --- slides ---
  const slides: OnboardingSlide[] = ONBOARDING_TEMPLATE_SLIDES.map((slide, index) => {
    const subtitle = slide.subtitles.find((s) => holds(s.when));
    const items = slide.items
      .filter((item) => holds(item.when) && !hidden.has(`${slide.key}.items.${item.id}`))
      // A fixed row standing for a catalog task: only when that task's row is not there (or was hidden).
      .filter((item) => !item.covers || !seen.has(item.covers))
      .map((item) => {
        const base = `${slide.key}.items.${item.id}`;
        return {
          id: item.id,
          label: resolve(`${base}.label`, item.label),
          text: resolve(`${base}.text`, item.text),
          detail: resolve(`${base}.detail`, item.detail),
          code: resolve(`${base}.code`, item.code),
          due: resolve(`${base}.due`, item.due),
        };
      })
      .filter((item) => item.label !== null || item.text !== null || item.detail !== null || item.code !== null);
    if (slide.key === 'sending') mergeSameAddress(items);
    let table: OnboardingObligationRow[] | null = null;
    if (slide.area) {
      const fixed: OnboardingObligationRow[] = items.map((item) => ({
        key: item.id,
        area: slide.area!,
        name: item.label ?? '',
        need: item.detail ?? '',
        due: item.due,
        source: 'template',
      }));
      obligations[slide.area].push(...fixed);
      table = [...obligations[slide.area], ...(slide.area === 'fiscal' ? obligations.other : [])];
    }
    return {
      key: slide.key,
      number: index + 1,
      title: resolve(`${slide.key}.title`, slide.title) ?? '',
      kicker: slide.kicker !== undefined ? resolve(`${slide.key}.kicker`, slide.kicker) : null,
      subtitle: subtitle ? resolve(`${slide.key}.subtitle.${subtitle.id}`, subtitle.text) : null,
      items: slide.area ? [] : items.map(({ due: _due, ...item }) => item),
      table,
    };
  });

  return {
    title: `${officeName} · Onboarding do cliente · ${client.name}`,
    updatedAt: input.updatedAt,
    client: {
      name: client.name,
      tradeName: client.tradeName,
      cnpj,
      regime,
      regimeLabel: regime ? TAX_REGIME_LABELS[regime] : '',
      clientSince: client.clientSince,
      employees,
      union,
    },
    office: {
      name: officeName,
      logo: blank(registry.logo),
      phone: registry.phone?.trim() ? formatPhone(registry.phone) : null,
      email: blank(registry.email),
      website: blank(registry.website),
      address: blank(registry.address),
      whatsapp: params.contact.whatsapp,
      hours: params.contact.hours,
      crc: params.contact.crc,
      emails: params.emails,
    },
    slides,
    obligations,
    missing: [...missing].sort(),
  };
}

/** `•••.456.789-••` (the middle six digits). */
export function maskCpf(cpf: string): string {
  const d = onlyDigits(cpf);
  if (d.length !== 11) return '•••.•••.•••-••';
  return `•••.${d.slice(3, 6)}.${d.slice(6, 9)}-••`;
}

/** Message of the WhatsApp/e-mail with the link. */
export function onboardingMessage(params: { clientName: string; officeName: string; url: string; days: number }): string {
  return `Olá! Este é o onboarding da empresa ${params.clientName} com a ${params.officeName}: como trabalhamos, suas obrigações, prazos e como enviar documentos. Leva uns 10 minutos. No fim, confirme a leitura. O link vale por ${params.days} dias: ${params.url}`;
}

/**
 * "Como enviar": when the card-machine report goes to the same e-mail as the invoices (the default, both
 * to the Fiscal), the two blocks become one ("notas fiscais e relatório das maquininhas e PIX").
 */
function mergeSameAddress(items: { id: string; label: string | null; text: string | null }[]): void {
  const fiscal = items.find((i) => i.id === 'fiscal');
  const cards = items.findIndex((i) => i.id === 'cards');
  if (!fiscal || cards < 0) return;
  const other = items[cards]!;
  if (!fiscal.label || fiscal.label !== other.label) return;
  if (other.text) fiscal.text = fiscal.text ? `${fiscal.text} e ${other.text}` : other.text;
  items.splice(cards, 1);
}
