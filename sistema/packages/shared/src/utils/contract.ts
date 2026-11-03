// Service contract of a client (spec §13.9): the template is a list of blocks with fields between
// brackets ("[RAZAO SOCIAL CLIENTE]", Effy's keys) that are replaced by the data of the client, the
// office and the fee period in force. Pure: the API fills the contract of a client and the web uses the
// same functions for the editor preview and the warnings (unknown fields, factory fields gone).

import type { ContractBlockRule, ContractBlockType } from '../constants';
import { formatCEP, formatCNPJ, formatCPF, onlyDigits } from './documents';
import type { ISODate } from './dates';

export interface ContractBlock {
  type: ContractBlockType;
  /** Absent in `spacer` blocks. */
  text?: string;
  /** `discount`: the block enters only when the fee period has a punctuality discount. */
  rule?: ContractBlockRule;
}

export type ContractPlaceholderGroup = 'client' | 'office' | 'fee';

export interface ContractPlaceholder {
  key: string;
  label: string;
  group: ContractPlaceholderGroup;
  /** Filled only when the fee period has a discount (empty otherwise). */
  onlyWithDiscount?: boolean;
}

/**
 * Fields the system fills. The keys are Effy's (templates imported from it keep working), plus the
 * office's Pix key, which Effy had hard-coded in the clause 2.4.
 */
export const CONTRACT_PLACEHOLDERS: readonly ContractPlaceholder[] = [
  { key: '[RAZAO SOCIAL CLIENTE]', label: 'Cliente: razão social', group: 'client' },
  { key: '[CNPJ CLIENTE]', label: 'Cliente: CNPJ', group: 'client' },
  { key: '[ENDEREÇO CLIENTE]', label: 'Cliente: logradouro', group: 'client' },
  { key: '[NUMERO ENDEREÇO]', label: 'Cliente: número', group: 'client' },
  { key: '[BAIRRO CLIENTE]', label: 'Cliente: bairro', group: 'client' },
  { key: '[CIDADE CLIENTE]', label: 'Cliente: cidade', group: 'client' },
  { key: '[ESTADO CLIENTE]', label: 'Cliente: estado', group: 'client' },
  { key: '[CEP CLIENTE]', label: 'Cliente: CEP', group: 'client' },
  { key: '[NOME SOCIO CLIENTE]', label: 'Cliente: responsável (sócio administrador)', group: 'client' },
  { key: '[CPF CLIENTE]', label: 'Cliente: CPF do responsável', group: 'client' },
  { key: '[RAZAO SOCIAL ESCRITORIO]', label: 'Escritório: razão social', group: 'office' },
  { key: '[CNPJ ESCRITORIO]', label: 'Escritório: CNPJ', group: 'office' },
  { key: '[ENDERECO ESCRITORIO]', label: 'Escritório: endereço completo', group: 'office' },
  { key: '[NOME RESPONSAVEL ESCRITORIO]', label: 'Escritório: responsável', group: 'office' },
  { key: '[CPF RESPONSAVEL ESCRITORIO]', label: 'Escritório: CPF do responsável', group: 'office' },
  { key: '[CHAVE PIX ESCRITORIO]', label: 'Escritório: chave Pix', group: 'office' },
  { key: '[VALOR HONORARIOS]', label: 'Honorário mensal', group: 'fee' },
  { key: '[HONORÁRIOS POR EXTENSO]', label: 'Honorário mensal por extenso', group: 'fee' },
  { key: '[TAXA EMPREGADO]', label: 'Taxa por empregado', group: 'fee' },
  { key: '[TAXA EMPREGADO EXTENSO]', label: 'Taxa por empregado por extenso', group: 'fee' },
  { key: '[DIA VENCIMENTO]', label: 'Dia do vencimento', group: 'fee' },
  { key: '[DIA VENCIMENTO EXTENSO]', label: 'Dia do vencimento por extenso', group: 'fee' },
  { key: '[DATA INICIO CONTRATO]', label: 'Início do contrato por extenso', group: 'fee' },
  { key: '[DESCONTO PCT]', label: 'Desconto (%)', group: 'fee', onlyWithDiscount: true },
  { key: '[DESCONTO EXTENSO]', label: 'Desconto por extenso', group: 'fee', onlyWithDiscount: true },
];

export const CONTRACT_PLACEHOLDER_KEYS: ReadonlySet<string> = new Set(CONTRACT_PLACEHOLDERS.map((p) => p.key));

export const UF_NAMES: Record<string, string> = {
  AC: 'Acre', AL: 'Alagoas', AP: 'Amapá', AM: 'Amazonas', BA: 'Bahia', CE: 'Ceará', DF: 'Distrito Federal',
  ES: 'Espírito Santo', GO: 'Goiás', MA: 'Maranhão', MT: 'Mato Grosso', MS: 'Mato Grosso do Sul', MG: 'Minas Gerais',
  PA: 'Pará', PB: 'Paraíba', PR: 'Paraná', PE: 'Pernambuco', PI: 'Piauí', RJ: 'Rio de Janeiro', RN: 'Rio Grande do Norte',
  RS: 'Rio Grande do Sul', RO: 'Rondônia', RR: 'Roraima', SC: 'Santa Catarina', SP: 'São Paulo', SE: 'Sergipe', TO: 'Tocantins',
};

// ---------------------------------------------------------------------------
// Numbers in words (pt-BR)
// ---------------------------------------------------------------------------

const UNITS = ['zero', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
const TEENS = ['dez', 'onze', 'doze', 'treze', 'catorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
const TENS = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
const HUNDREDS = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];

function threeDigits(n: number): string {
  if (n === 0) return '';
  if (n === 100) return 'cem';
  const parts: string[] = [];
  const c = Math.floor(n / 100);
  const r = n % 100;
  if (c > 0) parts.push(HUNDREDS[c]!);
  if (r > 0) {
    if (r < 10) parts.push(UNITS[r]!);
    else if (r < 20) parts.push(TEENS[r - 10]!);
    else {
      const d = Math.floor(r / 10);
      const u = r % 10;
      parts.push(u === 0 ? TENS[d]! : `${TENS[d]} e ${UNITS[u]}`);
    }
  }
  return parts.join(' e ');
}

const SCALES = [
  { value: 1_000_000_000, singular: 'bilhão', plural: 'bilhões' },
  { value: 1_000_000, singular: 'milhão', plural: 'milhões' },
  { value: 1_000, singular: 'mil', plural: 'mil' },
];

/** 1234 → "mil duzentos e trinta e quatro"; 2_000_000 → "dois milhões" (non-negative integers). */
export function numberToWords(value: number): string {
  let rest = Math.floor(Math.abs(value));
  if (rest === 0) return 'zero';
  const parts: string[] = [];
  for (const scale of SCALES) {
    if (rest < scale.value) continue;
    const count = Math.floor(rest / scale.value);
    rest %= scale.value;
    if (scale.value === 1_000) parts.push(count === 1 ? 'mil' : `${numberToWords(count)} mil`);
    else parts.push(`${numberToWords(count)} ${count === 1 ? scale.singular : scale.plural}`);
  }
  if (rest > 0) parts.push(threeDigits(rest));
  if (parts.length === 1) return parts[0]!;
  // "e" before the last group when it is below 100 or a round hundred ("mil e cem", "mil e vinte"),
  // nothing otherwise ("mil duzentos e trinta e quatro"); a round thousand/million joins with "e".
  const last = parts.pop()!;
  const joiner = rest > 0 && rest >= 100 && rest % 100 !== 0 ? ' ' : ' e ';
  return `${parts.join(', ')}${joiner}${last}`;
}

/** 120000 → "mil e duzentos reais"; 150 → "um real e cinquenta centavos"; exact millions take "de". */
export function moneyToWords(cents: number): string {
  const total = Math.round(Math.abs(cents));
  const reais = Math.floor(total / 100);
  const centavos = total % 100;
  if (reais === 0 && centavos === 0) return 'zero reais';
  const parts: string[] = [];
  if (reais > 0) {
    const words = numberToWords(reais);
    const ofReais = reais >= 1_000_000 && reais % 1_000_000 === 0 ? ' de' : '';
    parts.push(`${words}${ofReais} ${reais === 1 ? 'real' : 'reais'}`);
  }
  if (centavos > 0) parts.push(`${numberToWords(centavos)} ${centavos === 1 ? 'centavo' : 'centavos'}`);
  return parts.join(' e ');
}

/** Basis points as the contract writes them: 500 → "5", 250 → "2,5", 1234 → "12,34". */
export function formatPercentBps(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  if (fraction === 0) return String(whole);
  return `${whole},${String(fraction).padStart(2, '0').replace(/0$/, '')}`;
}

/** 500 → "cinco por cento"; 250 → "dois vírgula cinco por cento"; 1205 → "doze vírgula zero cinco por cento". */
export function percentBpsToWords(bps: number): string {
  const whole = Math.floor(bps / 100);
  const fraction = bps % 100;
  let text = numberToWords(whole);
  if (fraction > 0) {
    const digits = String(fraction).padStart(2, '0').replace(/0$/, '');
    text += ` vírgula ${digits.length === 2 && digits.startsWith('0') ? `zero ${UNITS[Number(digits[1])]}` : numberToWords(Number(digits))}`;
  }
  return `${text} por cento`;
}

const MONTHS_LOWER = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** 2026-01-10 → "10 de janeiro de 2026" (Effy's `dataPorExtenso`). */
export function dateToWords(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  return `${d} de ${MONTHS_LOWER[m - 1]} de ${y}`;
}

// ---------------------------------------------------------------------------
// Values, filling and checks
// ---------------------------------------------------------------------------

export interface ContractClientData {
  name: string;
  document: string;
  street: string | null;
  number: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  responsibleName: string | null;
  /** CPF, digits only. */
  responsibleDocument: string | null;
  contractStartDate: ISODate;
}

export interface ContractOfficeData {
  legalName: string;
  document: string;
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
  responsibleName: string | null;
  responsibleDocument: string | null;
  pixKey: string | null;
}

export interface ContractFeeData {
  /** Monthly fee (cents). */
  amount: number;
  employeeFee: number;
  dueDay: number;
  /** Basis points; 0 = no discount. */
  discountBps: number;
}

const formatMoney = (cents: number) =>
  `R$ ${(cents / 100).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/** Office address in one sentence, skipping what is blank (Effy's `enderecoEscritorio`). */
export function officeAddressText(office: Pick<ContractOfficeData, 'street' | 'number' | 'complement' | 'district' | 'city' | 'state' | 'zipCode'>): string {
  return [
    office.street,
    office.number && `nº ${office.number}`,
    office.complement,
    office.district && `bairro ${office.district}`,
    office.city && `município de ${office.city}`,
    office.state && `estado de ${UF_NAMES[office.state] ?? office.state}`,
    office.zipCode && `CEP nº ${formatCEP(office.zipCode)}`,
  ]
    .filter(Boolean)
    .join(', ');
}

/** Value of each field for a client (empty strings for what is missing). */
export function contractValues(
  client: ContractClientData,
  office: ContractOfficeData | null,
  fee: ContractFeeData | null,
): Record<string, string> {
  const discount = fee && fee.discountBps > 0 ? fee.discountBps : 0;
  const doc = (v: string | null, f: (s: string) => string) => (v ? f(onlyDigits(v)) : '');
  return {
    '[RAZAO SOCIAL CLIENTE]': client.name,
    '[CNPJ CLIENTE]': doc(client.document, formatCNPJ),
    '[ENDEREÇO CLIENTE]': client.street ?? '',
    '[NUMERO ENDEREÇO]': client.number ?? '',
    '[BAIRRO CLIENTE]': client.district ?? '',
    '[CIDADE CLIENTE]': client.city ?? '',
    '[ESTADO CLIENTE]': client.state ? (UF_NAMES[client.state] ?? client.state) : '',
    '[CEP CLIENTE]': client.zipCode ? formatCEP(client.zipCode) : '',
    '[NOME SOCIO CLIENTE]': client.responsibleName ?? '',
    '[CPF CLIENTE]': doc(client.responsibleDocument, formatCPF),
    '[RAZAO SOCIAL ESCRITORIO]': office?.legalName ?? '',
    '[CNPJ ESCRITORIO]': office ? doc(office.document, formatCNPJ) : '',
    '[ENDERECO ESCRITORIO]': office ? officeAddressText(office) : '',
    '[NOME RESPONSAVEL ESCRITORIO]': office?.responsibleName ?? '',
    '[CPF RESPONSAVEL ESCRITORIO]': office ? doc(office.responsibleDocument, formatCPF) : '',
    '[CHAVE PIX ESCRITORIO]': office?.pixKey ?? '',
    '[VALOR HONORARIOS]': fee ? formatMoney(fee.amount) : '',
    '[HONORÁRIOS POR EXTENSO]': fee ? moneyToWords(fee.amount) : '',
    '[TAXA EMPREGADO]': fee ? formatMoney(fee.employeeFee) : '',
    '[TAXA EMPREGADO EXTENSO]': fee ? moneyToWords(fee.employeeFee) : '',
    '[DIA VENCIMENTO]': fee ? String(fee.dueDay) : '',
    '[DIA VENCIMENTO EXTENSO]': fee ? numberToWords(fee.dueDay) : '',
    '[DATA INICIO CONTRATO]': dateToWords(client.contractStartDate),
    '[DESCONTO PCT]': discount ? formatPercentBps(discount) : '',
    '[DESCONTO EXTENSO]': discount ? percentBpsToWords(discount) : '',
  };
}

/** Fields written in a text: anything between brackets on one line (up to 60 characters). */
export function placeholdersIn(text: string | undefined): string[] {
  return text ? [...text.matchAll(/\[[^[\]\n]{1,60}\]/g)].map((m) => m[0]) : [];
}

/** Fields the system does not recognize ("Saem do jeito que estão escritos"), without repetition. */
export function unknownPlaceholders(blocks: readonly ContractBlock[]): string[] {
  const out = new Set<string>();
  for (const b of blocks) for (const p of placeholdersIn(b.text)) if (!CONTRACT_PLACEHOLDER_KEYS.has(p)) out.add(p);
  return [...out];
}

/** Fields of the factory template that no longer appear in `blocks` ("Pode ser intencional"). */
export function missingFactoryPlaceholders(blocks: readonly ContractBlock[], factory: readonly ContractBlock[]): string[] {
  const present = new Set(blocks.flatMap((b) => placeholdersIn(b.text)));
  const expected = new Set(factory.flatMap((b) => placeholdersIn(b.text)));
  return [...expected].filter((p) => !present.has(p));
}

/**
 * The contract of a client: blocks with a rule they do not meet are left out (the discount clause
 * without discount) and every known field is replaced; unknown ones stay as written.
 */
export function fillContractBlocks(
  blocks: readonly ContractBlock[],
  values: Record<string, string>,
  options: { withDiscount: boolean },
): ContractBlock[] {
  return blocks
    .filter((b) => b.rule !== 'discount' || options.withDiscount)
    .map((b) => {
      if (b.text === undefined) return { ...b };
      const text = b.text.replace(/\[[^[\]\n]{1,60}\]/g, (key) => (key in values ? values[key]! : key));
      return { ...b, text };
    });
}

/** Characters of a template (the 400.000 limit counts the texts). */
export function contractCharCount(blocks: readonly ContractBlock[]): number {
  return blocks.reduce((sum, b) => sum + (b.text?.length ?? 0), 0);
}

/**
 * "Importar texto": each paragraph (blank-line separated, or each line when there are no blank lines)
 * becomes a block; short lines in capitals become clause titles.
 */
export function blocksFromPlainText(text: string): ContractBlock[] {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (!normalized) return [];
  const chunks = /\n\s*\n/.test(normalized) ? normalized.split(/\n\s*\n/) : normalized.split('\n');
  return chunks
    .map((c) => c.replace(/\s*\n\s*/g, ' ').trim())
    .filter(Boolean)
    .map((c) => {
      const letters = c.replace(/[^A-Za-zÀ-ÿ]/g, '');
      const upper = letters.length >= 3 && letters === letters.toUpperCase() && c.length <= 120;
      return { type: upper ? 'heading1' : 'paragraph', text: c } as ContractBlock;
    });
}
