import {
  ONBOARDING_LINK_DAYS,
  ONBOARDING_OBLIGATION_TEXTS,
  ONBOARDING_TEMPLATE_SLIDES,
  onboardingFactoryText,
  onboardingMessage,
  onlyDigits,
  REGIME_GROUP_ITEMS,
  type OnboardingAccessView,
  type OnboardingCondition,
  type OnboardingHistoryResponse,
  type OnboardingRuleKey,
  type OnboardingSlideKey,
  TAX_REGIME_LABELS,
} from '@effinance/shared';

// Pure helpers of the client onboarding screens (tested in onboarding.test.tsx).

// --- sending -----------------------------------------------------------------------------------------

/** Where the link goes in the editable message (replaced by the URL once the link exists). */
export const LINK_PLACEHOLDER = '{{link}}';

export function defaultLinkMessage(
  clientName: string,
  officeName: string,
  days: number = ONBOARDING_LINK_DAYS,
): string {
  return onboardingMessage({ clientName, officeName, url: LINK_PLACEHOLDER, days });
}

/** The edited message with the link: in place of `{{link}}`, else at the end. */
export function fillLinkMessage(message: string, url: string): string {
  const text = message.trim();
  if (text.includes(LINK_PLACEHOLDER)) return text.split(LINK_PLACEHOLDER).join(url);
  return text ? `${text}\n${url}` : url;
}

/** `https://wa.me/<digits>?text=<message>` (the API sends the number with 55). */
export function whatsappUrl(to: string, message: string): string {
  return `https://wa.me/${onlyDigits(to)}?text=${encodeURIComponent(message)}`;
}

export function mailtoUrl(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to).replace(/%40/g, '@')}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// --- history -----------------------------------------------------------------------------------------

export type OnboardingStatus = 'none' | 'sent' | 'accessed' | 'confirmed';

export const ONBOARDING_STATUS_LABELS: Record<OnboardingStatus, string> = {
  none: 'Não enviado',
  sent: 'Enviado',
  accessed: 'Acessado',
  confirmed: 'Leitura confirmada',
};

export const ONBOARDING_STATUS_TONES: Record<
  OnboardingStatus,
  'neutral' | 'brand' | 'warning' | 'success'
> = {
  none: 'neutral',
  sent: 'brand',
  accessed: 'warning',
  confirmed: 'success',
};

export function onboardingStatus(
  history: Pick<OnboardingHistoryResponse, 'links' | 'accesses' | 'confirmation'>,
): OnboardingStatus {
  if (history.confirmation) return 'confirmed';
  if (history.accesses.count > 0) return 'accessed';
  return history.links.length > 0 ? 'sent' : 'none';
}

export const LINK_STATUS_LABELS = {
  active: 'Ativo',
  expired: 'Expirado',
  revoked: 'Revogado',
} as const;

export const DEVICE_LABELS: Record<OnboardingAccessView['device'], string> = {
  mobile: 'Celular',
  tablet: 'Tablet',
  desktop: 'Computador',
  unknown: 'Aparelho desconhecido',
};

export function accessDescription(a: Pick<OnboardingAccessView, 'browser' | 'os'>): string {
  return [a.browser, a.os].filter(Boolean).join(' · ') || 'Navegador não identificado';
}

/** "escritorio.whatsapp" → "WhatsApp do escritório" (the editor's description of the placeholder). */
export function missingFieldLabel(name: string, placeholders: Record<string, string>): string {
  return placeholders[name] ?? name;
}

// --- deck --------------------------------------------------------------------------------------------

/** Dark (gradient) slides and white ones; the others are light lilac. */
export const DARK_SLIDES: readonly OnboardingSlideKey[] = ['cover', 'summary', 'month', 'confirm'];
export const WHITE_SLIDES: readonly OnboardingSlideKey[] = ['team', 'numbers', 'vacation'];

/** The section pill of each slide (the summary's five parts). */
export const SLIDE_SECTION: Partial<Record<OnboardingSlideKey, number>> = {
  howWeWork: 1,
  team: 1,
  numbers: 2,
  fiscal: 2,
  accounting: 2,
  personnel: 2,
  month: 2,
  documents: 3,
  sending: 3,
  admission: 4,
  vacation: 4,
  termination: 4,
  safety: 4,
  esocial: 4,
  fines: 5,
  firstSteps: 5,
};
export const SECTION_NAMES = [
  '',
  'Como trabalhamos',
  'Obrigações e prazos',
  'Documentos',
  'Empregados',
  'Multas e primeiros passos',
];

/** Summary item → the first slide of its part. */
export const SUMMARY_TARGETS: Record<string, OnboardingSlideKey> = {
  work: 'howWeWork',
  obligations: 'numbers',
  documents: 'documents',
  employees: 'admission',
  fines: 'fines',
};

export const slideAnchor = (key: OnboardingSlideKey) => `slide-${key}`;

/** "2 · Fiscal" → { big: '2', label: 'Fiscal' }; "Suas datas no mês" with "dia 1º, dia 10 e 5º dia útil" → 3. */
export function numberBlock(
  id: string,
  label: string | null,
  text: string | null,
): { big: string | null; label: string } {
  const m = /^(\d+)\s*·\s*(.+)$/.exec(label ?? '');
  if (m) return { big: m[1]!, label: m[2]! };
  if (id.startsWith('dates') && text)
    return {
      big: String(text.split(/,\s*|\s+e\s+/).filter((p) => p.trim()).length),
      label: label ?? '',
    };
  return { big: null, label: label ?? '' };
}

/** "Até o 5º dia útil" → { pre: 'Até o', big: '5º', post: 'dia útil' }; "Até o vencimento da guia" → { pre: 'Até o', big: 'vencimento', post: 'da guia' }. */
export function dayBlock(label: string): { pre: string; big: string; post: string } {
  const m = /^(.*?)(\d+º?)(.*)$/.exec(label);
  if (!m) {
    const w = /^(até o|até a|no|na)\s+(\S+)\s*(.*)$/i.exec(label.trim());
    return w ? { pre: w[1]!, big: w[2]!, post: w[3]!.trim() } : { pre: '', big: label, post: '' };
  }
  return { pre: m[1]!.trim(), big: m[2]!, post: m[3]!.trim() };
}

/** "você envia as variáveis…" → { who: 'Você envia', what: 'as variáveis…', office: false }. */
export function whoBlock(text: string): { who: string; what: string; office: boolean } {
  const m = /^(\S+\s+\S+)\s+(.*)$/.exec(text.trim());
  if (!m) return { who: '', what: text, office: false };
  const who = m[1]!.charAt(0).toUpperCase() + m[1]!.slice(1);
  return { who, what: m[2]!, office: /^n[óo]s\b/i.test(m[1]!) };
}

/** "30 dias antes" → { big: '30', small: 'dias antes' }. */
export function daysBeforeBlock(label: string): { big: string; small: string } | null {
  const m = /^(\d+)\s+(.+)$/.exec(label.trim());
  return m ? { big: m[1]!, small: m[2]! } : null;
}

/** Only `data:image/…` logos (the API sends nothing else; never an external address). */
export function safeLogo(logo: string | null): string | null {
  return logo && /^data:image\/(png|jpe?g|webp|gif|svg\+xml);base64,/i.test(logo) ? logo : null;
}

// --- editor ------------------------------------------------------------------------------------------

export interface EditorBlock {
  /** Text key (`onboardingTextKeys`). */
  key: string;
  label: string;
  factory: string;
}

export interface EditorGroup {
  /** Item id (or 'head' for title/subtitles, or the obligation's catalog key). */
  id: string;
  title: string;
  /** Hideable key (`onboardingHideableKeys`), or null. */
  hideKey: string | null;
  when: string | null;
  blocks: EditorBlock[];
}

export interface EditorSection {
  /** Slide key or 'obligations'. */
  key: string;
  title: string;
  groups: EditorGroup[];
}

const FIELD_LABELS = {
  label: 'Título do item',
  text: 'Texto',
  detail: 'Detalhe',
  code: 'Assunto (e-mail)',
  due: 'Até quando',
} as const;
/** Obligation tables: no legal deadline (the client's document shows only what it delivers and when). */
const OBLIGATION_FIELD_LABELS = {
  label: 'O que fazemos',
  text: 'Texto',
  detail: 'O que precisamos',
  code: 'Assunto (e-mail)',
  due: 'Até quando',
} as const;

/** Condition of a yes/no parameter: [when on, when off]. */
const RULE_CONDITION_LABELS: Record<OnboardingRuleKey, [string, string]> = {
  admissionExamByClient: ['se o cliente agenda o exame', 'se o escritório agenda o exame'],
  terminationRequestFirst: [
    'se o cliente pede a rescisão antes de comunicar',
    'se o cliente avisa no dia do aviso',
  ],
  unionAssistance: ['se o escritório faz a homologação', 'se o cliente agenda a homologação'],
  payrollAdvance: ['com adiantamento quinzenal', 'sem adiantamento quinzenal'],
};

export function describeCondition(when: OnboardingCondition | undefined): string | null {
  if (!when) return null;
  const parts: string[] = [];
  if (when.regimes) parts.push(when.regimes.map((r) => TAX_REGIME_LABELS[r]).join(' ou '));
  if (when.notRegimes)
    parts.push(`exceto ${when.notRegimes.map((r) => TAX_REGIME_LABELS[r]).join(' e ')}`);
  if (when.employees === 'some') parts.push('com empregados');
  if (when.employees === 'none') parts.push('sem empregados');
  for (const [key, value] of Object.entries(when.rules ?? {}))
    parts.push(RULE_CONDITION_LABELS[key as OnboardingRuleKey][value ? 0 : 1]);
  return parts.length ? `Só ${parts.join(', ')}` : null;
}

/** The template by slide and block, for the texts editor (factory texts beside each block). */
export function editorSections(): EditorSection[] {
  const sections: EditorSection[] = ONBOARDING_TEMPLATE_SLIDES.map((slide, i) => {
    const head: EditorBlock[] = [
      { key: `${slide.key}.title`, label: 'Título', factory: slide.title },
    ];
    if (slide.kicker !== undefined)
      head.push({
        key: `${slide.key}.kicker`,
        label: 'Linha acima do título',
        factory: slide.kicker,
      });
    for (const s of slide.subtitles) {
      head.push({
        key: `${slide.key}.subtitle.${s.id}`,
        label: describeCondition(s.when)
          ? `Subtítulo (${describeCondition(s.when)!.toLowerCase()})`
          : 'Subtítulo',
        factory: s.text,
      });
    }
    const labels = slide.area ? OBLIGATION_FIELD_LABELS : FIELD_LABELS;
    const groups: EditorGroup[] = [
      { id: 'head', title: 'Cabeçalho', hideKey: null, when: null, blocks: head },
    ];
    for (const item of slide.items) {
      const blocks: EditorBlock[] = [];
      for (const field of ['label', 'text', 'detail', 'code', 'due'] as const) {
        const factory = item[field];
        if (factory !== undefined)
          blocks.push({
            key: `${slide.key}.items.${item.id}.${field}`,
            label: labels[field],
            factory,
          });
      }
      groups.push({
        id: item.id,
        title: item.label ?? item.text ?? item.id,
        hideKey: `${slide.key}.items.${item.id}`,
        when: describeCondition(item.when),
        blocks,
      });
    }
    return {
      key: slide.key,
      title: `${String(i + 1).padStart(2, '0')} · ${slide.title.replace(/\{\{razaoSocial\}\}/, 'Capa')}`,
      groups,
    };
  });
  sections.push({
    key: 'obligations',
    title: 'Tarefas recorrentes nas tabelas',
    groups: [
      ...Object.keys(ONBOARDING_OBLIGATION_TEXTS).map((key) => ({
        id: key,
        title: REGIME_GROUP_ITEMS.find((i) => i.key === key)?.name ?? key,
        hideKey: `obligations.${key}`,
        when: null,
        blocks: (['need', 'due'] as const)
          .filter((field) => onboardingFactoryText(`obligations.${key}.${field}`) !== undefined)
          .map((field) => ({
            key: `obligations.${key}.${field}`,
            label: field === 'need' ? 'O que precisamos' : 'Até quando',
            factory: onboardingFactoryText(`obligations.${key}.${field}`) ?? '',
          })),
      })),
      {
        id: 'default',
        title: 'Tarefa sem texto próprio',
        hideKey: null,
        when: null,
        blocks: [
          {
            key: 'obligations.default.need',
            label: 'O que precisamos',
            factory: onboardingFactoryText('obligations.default.need') ?? '',
          },
          {
            key: 'obligations.default.due',
            label: 'Até quando',
            factory: onboardingFactoryText('obligations.default.due') ?? '',
          },
        ],
      },
    ],
  });
  return sections;
}

/** Only the texts that differ from `base` (what the layer below shows): the API stores the rest as "no change". */
export function changedTexts(
  texts: Record<string, string>,
  base: (key: string) => string,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(texts)) if (value !== base(key)) out[key] = value;
  return out;
}
