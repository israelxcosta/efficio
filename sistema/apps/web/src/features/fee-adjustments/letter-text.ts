// Texts of the adjustment letter (comunicação formal com memória de cálculo, contract clause 3.5). Pure,
// tested: the letter component only lays them out.

import {
  dateToWords,
  formatCEP,
  formatCNPJ,
  formatPhone,
  indexValuesOf,
  suggestedAdjustment,
  todayISO,
  type FeeAdjustment,
  type FeeAdjustmentLetter,
  type FeeAdjustmentLetterOffice,
  type ISODate,
} from '@effinance/shared';

interface Address {
  street: string | null;
  number: string | null;
  complement: string | null;
  district: string | null;
  city: string | null;
  state: string | null;
  zipCode: string | null;
}

/** The date of the letters: the day the batch was applied, so a reprint is the same letter. */
export function letterDate(createdAt: string): ISODate {
  return todayISO(new Date(createdAt));
}

/** "São Paulo, 14 de novembro de 2026." (without the city when the office has none). */
export function dateLine(city: string | null, date: ISODate): string {
  return `${city?.trim() ? `${city.trim()}, ` : ''}${dateToWords(date)}.`;
}

/** ["Rua das Flores, 100 – sala 2", "Centro – São Paulo/SP", "CEP 01310-100"], skipping what is blank. */
export function addressLines(a: Address): string[] {
  const street = [a.street, a.number].filter(Boolean).join(', ');
  const first = [street, a.complement].filter(Boolean).join(' – ');
  const cityState = [a.city, a.state].filter(Boolean).join('/');
  const second = [a.district, cityState].filter(Boolean).join(' – ');
  return [first, second, a.zipCode ? `CEP ${formatCEP(a.zipCode)}` : ''].filter(Boolean);
}

/** The letterhead: name, legal name + CNPJ, address, contacts (blank parts left out). */
export function letterheadLines(office: FeeAdjustmentLetterOffice): { name: string; lines: string[] } {
  const name = office.name ?? office.legalName ?? '';
  const legal = office.legalName && office.legalName !== name ? office.legalName : '';
  const registry = [legal, office.document ? `CNPJ ${formatCNPJ(office.document)}` : ''].filter(Boolean).join(' · ');
  const contacts = [office.phone ? formatPhone(office.phone) : '', office.email ?? '', office.website ?? ''].filter(Boolean).join(' · ');
  return { name, lines: [registry, addressLines(office).join(' · '), contacts].filter(Boolean) };
}

/** The addressee block under "À": legal name, CNPJ, "A/C" the responsible person and the address. */
export function recipientLines(client: FeeAdjustmentLetter['client']): string[] {
  return [
    client.name,
    client.document ? `CNPJ ${formatCNPJ(client.document)}` : '',
    client.responsibleName ? `A/C ${client.responsibleName}` : '',
    ...addressLines(client),
  ].filter(Boolean);
}

/** How the percentage of the batch came: the largest index, typed by hand (negotiated) or none positive. */
export function batchBasis(batch: Pick<FeeAdjustment, 'indices' | 'appliedBps'>): 'largest' | 'negotiated' | 'none' {
  if (batch.appliedBps === 0) return 'none';
  return suggestedAdjustment(indexValuesOf(batch.indices)).bps === batch.appliedBps ? 'largest' : 'negotiated';
}

/** The notice went out in time: the letter is dated up to 30 days before the new period. */
export function noticeOnTime(letter: Pick<FeeAdjustmentLetter, 'noticeDeadline'>, date: ISODate): boolean {
  return date <= letter.noticeDeadline;
}
