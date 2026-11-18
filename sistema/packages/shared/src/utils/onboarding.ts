// Assembly of the client onboarding (pure): factory template ← office's template ← client's adjustment,
// the client's data and the recurring tasks that apply to it → the document with every text resolved.
// Used by the API (preview and public page), the browser demo and the web.

import { TASK_TIME_ZONE, TAX_REGIME_LABELS, type TaxRegime } from '../constants';
import {
  type OnboardingArea,
  type OnboardingCondition,
  type OnboardingDocument,
  type OnboardingObligationRow,
  type OnboardingOfficeData,
  type OnboardingOverridesStored,
  type OnboardingRecurringInput,
  type OnboardingSlide,
  type OnboardingTemplateStored,
} from '../onboarding';
import {
  ONBOARDING_DEFAULT_NEED,
  ONBOARDING_DEFAULT_OFFICE,
  ONBOARDING_OBLIGATION_TEXTS,
  ONBOARDING_TEMPLATE_SLIDES,
} from '../onboarding-template';
import { matchSuggestedDepartment, REGIME_GROUP_ITEMS, type SuggestedDepartment } from '../regime-groups';
import { addMonthKey, formatDateBR, monthKey, type ISODate } from './dates';
import { formatCNPJ, onlyDigits } from './documents';
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

export interface OnboardingBuildInput {
  template: OnboardingTemplateStored | null;
  overrides: OnboardingOverridesStored | null;
  /** From the office registry (Escritório): the name used when the template has none, and the logo. */
  office: { name: string | null; logo: string | null };
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

/** The office data with the factory values where nothing was saved. */
export function effectiveOnboardingOffice(saved: Partial<OnboardingOfficeData> | null | undefined): OnboardingOfficeData {
  return {
    ...ONBOARDING_DEFAULT_OFFICE,
    ...(saved ?? {}),
    emails: { ...ONBOARDING_DEFAULT_OFFICE.emails, ...(saved?.emails ?? {}) },
    deadlines: { ...ONBOARDING_DEFAULT_OFFICE.deadlines, ...(saved?.deadlines ?? {}) },
  };
}

export function conditionHolds(when: OnboardingCondition | undefined, regime: TaxRegime | null, employees: number): boolean {
  if (!when) return true;
  if (when.regimes && (!regime || !when.regimes.includes(regime))) return false;
  if (when.notRegimes && regime && when.notRegimes.includes(regime)) return false;
  if (when.employees === 'some' && employees <= 0) return false;
  if (when.employees === 'none' && employees > 0) return false;
  return true;
}

const ordinalDay = (day: number) => (day === 1 ? 'dia 1º' : `dia ${day}`);

export function employeesText(n: number): string {
  if (n <= 0) return 'Sem empregados';
  return n === 1 ? '1 empregado' : `${n} empregados`;
}

/** Legal deadline of a recurring task without catalog text, from its schedule ("dia 20 do mês seguinte"). */
export function describeRecurringDeadline(r: Pick<OnboardingRecurringInput, 'period' | 'dueDay' | 'dueMonth' | 'referenceOffset'>): string {
  const day = r.dueDay >= 31 ? 'último dia' : `dia ${r.dueDay}`;
  const offset = r.referenceOffset === 0 ? 'de cada mês' : r.referenceOffset === 1 ? 'do mês seguinte' : `do ${r.referenceOffset}º mês seguinte`;
  switch (r.period) {
    case 'annual':
      return r.dueMonth ? `anual: ${r.dueDay >= 31 ? 'último dia' : String(r.dueDay).padStart(2, '0')}/${String(r.dueMonth).padStart(2, '0')}` : 'anual';
    case 'semiannual':
      return `semestral: ${day}`;
    case 'quarterly':
      return `trimestral: ${day} ${offset}`;
    case 'bimonthly':
      return `bimestral: ${day} ${offset}`;
    case 'monthly':
      return `${day} ${offset}`;
    case 'weekly':
      return 'semanal';
    default:
      return 'diária';
  }
}

const CATALOG_ORDER = new Map(REGIME_GROUP_ITEMS.map((item, i) => [item.key, i]));
const CATALOG_DEPARTMENT = new Map(REGIME_GROUP_ITEMS.map((item) => [item.key, item.department]));

export function buildOnboardingDocument(input: OnboardingBuildInput): OnboardingDocument {
  const office = effectiveOnboardingOffice(input.template?.office);
  const texts: Record<string, string> = { ...(input.template?.texts ?? {}), ...(input.overrides?.texts ?? {}) };
  const hidden = new Set([...(input.template?.hidden ?? []), ...(input.overrides?.hidden ?? [])]);
  const { client } = input;
  const employees = Math.max(0, input.overrides?.employees ?? client.employees ?? 0);
  const regime = client.taxRegime;
  const officeName = office.name ?? input.office.name ?? FALLBACK_OFFICE_NAME;
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
    mesExemplo: `${example.slice(5, 7)}/${example.slice(0, 4)}`,
    'escritorio.nome': officeName,
    'escritorio.whatsapp': office.whatsapp,
    'escritorio.email': office.email,
    'escritorio.horario': office.hours,
    'escritorio.crc': office.crc,
    'escritorio.emailFiscal': office.emails.fiscal,
    'escritorio.emailPessoal': office.emails.personnel,
    'escritorio.emailContabil': office.emails.accounting,
    'prazo.documentos': ordinalDay(office.deadlines.documentsDay),
    'prazo.variaveisFolha': ordinalDay(office.deadlines.payrollVariablesDay),
    'prazo.admissao': office.deadlines.admissionBusinessDays === 1 ? '1 dia útil' : `${office.deadlines.admissionBusinessDays} dias úteis`,
    'prazo.ferias': office.deadlines.vacationDaysBefore === 1 ? '1 dia' : `${office.deadlines.vacationDaysBefore} dias`,
  };
  const missing = new Set<string>();
  const fill = (raw: string): string =>
    raw.replace(/\{\{\s*([a-zA-Z.]+)\s*\}\}/g, (match, name: string) => {
      if (!(name in values)) return match;
      const value = values[name];
      if (value === null || value === undefined || value === '') {
        missing.add(name);
        return MISSING;
      }
      return value;
    });
  /** The text of a key (adjustment → office → factory), filled; null when absent or blank. */
  const resolve = (key: string, factory: string | undefined): string | null => {
    const raw = texts[key] ?? factory;
    if (raw === undefined) return null;
    const out = fill(raw).trim();
    return out === '' ? null : out;
  };
  const holds = (when: OnboardingCondition | undefined) => conditionHolds(when, regime, employees);

  // --- obligation rows from the recurring tasks ---
  const obligations: Record<OnboardingArea, OnboardingObligationRow[]> = { fiscal: [], accounting: [], personnel: [], other: [] };
  const sorted = [...input.recurring].sort((a, b) => {
    const oa = a.catalogKey ? (CATALOG_ORDER.get(a.catalogKey) ?? 999) : 999;
    const ob = b.catalogKey ? (CATALOG_ORDER.get(b.catalogKey) ?? 999) : 999;
    return oa - ob || a.name.localeCompare(b.name, 'pt-BR');
  });
  let custom = 0;
  const seen = new Set<string>();
  for (const r of sorted) {
    const catalog = r.catalogKey && ONBOARDING_OBLIGATION_TEXTS[r.catalogKey] ? r.catalogKey : null;
    if (catalog && (hidden.has(`obligations.${catalog}`) || seen.has(catalog))) continue;
    if (catalog) seen.add(catalog);
    const byName = r.department ? matchSuggestedDepartment(r.department) : null;
    const byCatalog = r.catalogKey ? CATALOG_DEPARTMENT.get(r.catalogKey) : undefined;
    const suggested = byName ?? byCatalog ?? null;
    const area: OnboardingArea = suggested ? AREA_OF_DEPARTMENT[suggested] : 'other';
    obligations[area].push({
      key: catalog ?? `task-${++custom}`,
      area,
      name: r.name,
      deadline: (catalog ? resolve(`obligations.${catalog}.deadline`, ONBOARDING_OBLIGATION_TEXTS[catalog]!.deadline) : null) ?? describeRecurringDeadline(r),
      need:
        (catalog ? resolve(`obligations.${catalog}.need`, ONBOARDING_OBLIGATION_TEXTS[catalog]!.need) : resolve('obligations.default.need', ONBOARDING_DEFAULT_NEED)) ??
        '',
      source: 'task',
    });
  }

  // --- slides ---
  const slides: OnboardingSlide[] = ONBOARDING_TEMPLATE_SLIDES.map((slide, index) => {
    const subtitle = slide.subtitles.find((s) => holds(s.when));
    const items = slide.items
      .filter((item) => holds(item.when) && !hidden.has(`${slide.key}.items.${item.id}`))
      .map((item) => {
        const base = `${slide.key}.items.${item.id}`;
        return {
          id: item.id,
          label: resolve(`${base}.label`, item.label),
          text: resolve(`${base}.text`, item.text),
          detail: resolve(`${base}.detail`, item.detail),
          code: resolve(`${base}.code`, item.code),
        };
      })
      .filter((item) => item.label !== null || item.text !== null || item.detail !== null || item.code !== null);
    let table: OnboardingObligationRow[] | null = null;
    if (slide.area) {
      const fixed: OnboardingObligationRow[] = items.map((item) => ({
        key: item.id,
        area: slide.area!,
        name: item.label ?? '',
        deadline: item.text ?? '',
        need: item.detail ?? '',
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
      items: slide.area ? [] : items,
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
      logo: input.office.logo,
      whatsapp: office.whatsapp,
      email: office.email,
      hours: office.hours,
      crc: office.crc,
      emails: office.emails,
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
  return `Olá! Este é o onboarding da ${params.clientName} com a ${params.officeName}: como trabalhamos, suas obrigações, prazos e como enviar documentos. Leva uns 10 minutos. No fim, confirme a leitura. O link vale por ${params.days} dias: ${params.url}`;
}
