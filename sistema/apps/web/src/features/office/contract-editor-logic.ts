import {
  CONTRACT_PLACEHOLDERS,
  MAX_CONTRACT_BLOCK_CHARS,
  contractValues,
  formatDateBR,
  type ContractBlock,
  type ContractOfficeData,
  type ContractPlaceholderGroup,
  type ContractTemplateResponse,
  type Office,
} from '@effinance/shared';

// The contract template editor (spec §13.9). Pure (tested).

export interface DraftBlock extends ContractBlock {
  /** Stable key of the row (never saved). */
  key: string;
}

let seq = 0;
export const blockKey = () => `b${++seq}`;

export function toDraft(blocks: readonly ContractBlock[]): DraftBlock[] {
  return blocks.map((b) => ({ ...b, key: blockKey() }));
}

/** The blocks to save (without the keys; a spacer has no text). */
export function fromDraft(blocks: readonly DraftBlock[]): ContractBlock[] {
  return blocks.map(({ key: _key, ...b }) => {
    const out: ContractBlock = { type: b.type };
    if (b.type !== 'spacer') out.text = b.text ?? '';
    if (b.rule) out.rule = b.rule;
    return out;
  });
}

export function sameBlocks(a: readonly ContractBlock[], b: readonly ContractBlock[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((x, i) => {
    const y = b[i]!;
    return x.type === y.type && (x.text ?? '') === (y.text ?? '') && (x.rule ?? null) === (y.rule ?? null);
  });
}

/** "Subir"/"Descer" (and Alt+↑/↓): the list unchanged at the edges. */
export function moveBlock<T>(blocks: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= blocks.length || target < 0 || target >= blocks.length) return [...blocks];
  const next = [...blocks];
  [next[index], next[target]] = [next[target]!, next[index]!];
  return next;
}

/** A field inserted where the cursor was (replacing the selection); the new cursor goes after it. */
export function insertAtCursor(text: string, start: number, end: number, insert: string): { text: string; caret: number } {
  const s = Math.max(0, Math.min(start, text.length));
  const e = Math.max(s, Math.min(end, text.length));
  return { text: text.slice(0, s) + insert + text.slice(e), caret: s + insert.length };
}

/** "Importar texto": replace the template or append to it. */
export function importBlocks(current: readonly DraftBlock[], imported: readonly ContractBlock[], mode: 'replace' | 'append'): DraftBlock[] {
  const fresh = toDraft(imported);
  return mode === 'replace' ? fresh : [...current, ...fresh];
}

/** "19.850 de 20.000 caracteres", only near the limit of a block (90%). */
export function blockCharWarning(length: number): string | null {
  if (length < MAX_CONTRACT_BLOCK_CHARS * 0.9) return null;
  return `${length.toLocaleString('pt-BR')} de ${MAX_CONTRACT_BLOCK_CHARS.toLocaleString('pt-BR')} caracteres`;
}

/** "Ana P." */
export function shortName(name: string): string {
  const [first, second] = name.trim().split(/\s+/);
  return second ? `${first} ${second[0]}.` : (first ?? name);
}

/** "Contrato de prestação de serviços contábeis · modelo próprio, editado por Ana P. em 12/10/2026". */
export function templateDescription(t: Pick<ContractTemplateResponse, 'source' | 'updatedAt' | 'updatedBy'>): string {
  const head = 'Contrato de prestação de serviços contábeis';
  if (t.source === 'factory') return `${head} · modelo de fábrica`;
  const who = t.updatedBy ? `, editado por ${shortName(t.updatedBy.name)}` : '';
  const when = t.updatedAt ? ` em ${formatDateBR(t.updatedAt.slice(0, 10))}` : '';
  return `${head} · modelo próprio${who}${when}`;
}

export const PLACEHOLDER_GROUP_LABELS: Record<ContractPlaceholderGroup, string> = { client: 'Cliente', office: 'Escritório', fee: 'Honorário' };

/** Options of "Inserir campo", grouped like the spec (Cliente, Escritório, Honorário). */
export function placeholderOptions() {
  return CONTRACT_PLACEHOLDERS.map((p) => ({
    value: p.key,
    label: p.label.replace(/^(Cliente|Escritório): /, ''),
    hint: p.onlyWithDiscount ? 'só com desconto cadastrado' : undefined,
    group: PLACEHOLDER_GROUP_LABELS[p.group],
    keywords: p.key,
  }));
}

/** The example client of the preview (the office's own data, when registered). */
export function sampleValues(office: Office | null | undefined): Record<string, string> {
  const officeData: ContractOfficeData | null = office?.registered
    ? {
        legalName: office.legalName ?? '',
        document: office.document ?? '',
        street: office.street,
        number: office.number,
        complement: office.complement,
        district: office.district,
        city: office.city,
        state: office.state,
        zipCode: office.zipCode,
        responsibleName: office.responsibleName,
        responsibleDocument: office.responsibleDocument,
        pixKey: office.pixKey,
      }
    : null;
  const values = contractValues(
    {
      name: 'Padaria Pão Dourado Ltda',
      document: '45723174000110',
      street: 'Rua das Flores',
      number: '120',
      district: 'Centro',
      city: 'Mogi Guaçu',
      state: 'SP',
      zipCode: '13840000',
      responsibleName: 'Mariana Souza',
      responsibleDocument: '52998224725',
      contractStartDate: '2026-03-01',
    },
    officeData,
    { amount: 120000, employeeFee: 3500, dueDay: 10, discountBps: 500 },
  );
  // Office fields still blank show their marker, so the preview says what is missing.
  for (const [k, v] of Object.entries(values)) if (!v) delete values[k];
  return values;
}

/**
 * The tab title of a client's contract (it goes to the browser history and becomes the PDF's name):
 * "Contrato · Padaria Pão Dourado". An MEI's legal name may end with the owner's CPF ("João da Silva
 * 12345678901"); a CPF-like run of 11 digits never reaches the title.
 */
export function contractDocumentTitle(name: string): string {
  const clean = name
    .replace(/(?<!\d)\d{3}\.?\d{3}\.?\d{3}-?\d{2}(?!\d)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return `Contrato · ${clean || 'Cliente'}`;
}
