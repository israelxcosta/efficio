// Fields shared by the registry's recurring task (`RecurringTaskSheet`, group Quando) and a task's
// repetition (`RepeatField`): the day of the deadline, the anchor month and the non-business-day rule
// (spec §10.6). The wording stays in recurring-rules.ts.
import { MONTH_NAMES, NON_BUSINESS_DAY_RULES, type NonBusinessDayRule } from '@effinance/shared';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { NON_BUSINESS_HINTS } from '../recurring-rules';

/** "Dia 1" … "Dia 30" and "31 ou o último dia do mês". */
export function DueDayField({
  value,
  onChange,
  disabled,
  placeholder,
  'aria-label': ariaLabel,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  /** An empty first option ("Dia") while nothing is chosen. */
  placeholder?: string;
  'aria-label'?: string;
  id?: string;
}) {
  return (
    <Select id={id} disabled={disabled} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder !== undefined ? <option value="">{placeholder}</option> : null}
      {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
        <option key={d} value={String(d)}>
          {d === 31 ? '31 ou o último dia do mês' : `Dia ${d}`}
        </option>
      ))}
    </Select>
  );
}

/** January … December; "Mês" (annual) or "1º mês" (bimonthly, quarterly, semiannual). */
export function AnchorMonthField({
  value,
  onChange,
  annual,
  disabled,
  placeholder,
  'aria-label': ariaLabel,
  id,
}: {
  value: string;
  onChange: (value: string) => void;
  annual: boolean;
  disabled?: boolean;
  /** Show the empty first option ("Mês" / "1º mês"). */
  placeholder?: boolean;
  'aria-label'?: string;
  id?: string;
}) {
  return (
    <Select id={id} disabled={disabled} aria-label={ariaLabel} value={value} onChange={(e) => onChange(e.target.value)}>
      {placeholder ? <option value="">{annual ? 'Mês' : '1º mês'}</option> : null}
      {MONTH_NAMES.map((m, i) => (
        <option key={m} value={String(i + 1)}>
          {m}
        </option>
      ))}
    </Select>
  );
}

const NON_BUSINESS_LABELS: Record<NonBusinessDayRule, string> = { anticipate: 'Antecipar', postpone: 'Postergar', keep: 'Manter' };

/** Antecipar · Postergar · Manter, with the hint of each option in its `title`. */
export function NonBusinessField({
  value,
  onChange,
  disabled,
  ariaLabel = 'Se cair em dia não útil',
}: {
  value: NonBusinessDayRule;
  onChange: (value: NonBusinessDayRule) => void;
  disabled?: boolean;
  ariaLabel?: string;
}) {
  return (
    <SegmentedControl<NonBusinessDayRule>
      size="sm"
      ariaLabel={ariaLabel}
      value={value}
      onChange={(v) => !disabled && onChange(v)}
      options={NON_BUSINESS_DAY_RULES.map((r) => ({ value: r, label: NON_BUSINESS_LABELS[r], title: NON_BUSINESS_HINTS[r] }))}
      className="self-start"
    />
  );
}
