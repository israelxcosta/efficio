import { useId, useState, type ReactNode } from 'react';
import { Link } from 'react-router';
import {
  MAX_REFERENCE_OFFSET,
  RECURRENCE_FREQUENCIES,
  RECURRENCE_FREQUENCY_LABELS,
  RECURRENCE_INTERVAL_UNITS,
  WEEKDAY_LABELS,
  type ISODate,
  type RecurrenceFrequency,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Select } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { dueRuleHint, referenceOptionLabel } from '../recurring-rules';
import { firstDateNotice, hasInterval, isAnchored, isDayBased, repeatSummary, type repeatErrors, type RepeatForm } from '../repeat-rules';
import { AnchorMonthField, DueDayField, NonBusinessField } from './recurrence-fields';

/** "S T Q Q S S D", Monday first (ISO 1 … 7). */
const WEEKDAY_LETTERS: [number, string][] = [
  [1, 'S'],
  [2, 'T'],
  [3, 'Q'],
  [4, 'Q'],
  [5, 'S'],
  [6, 'S'],
  [7, 'D'],
];

export interface RepeatFieldViewProps {
  on: boolean;
  onToggle: (on: boolean) => void;
  form: RepeatForm;
  onForm: (form: RepeatForm) => void;
  /** "Começa em" (the due date field while it repeats). */
  start: ISODate | '';
  today: ISODate;
  errors: ReturnType<typeof repeatErrors>;
  readOnly: boolean;
  /** Who has `registry` gets the way to the registry ("Recorrente para vários clientes"). */
  canRegistry: boolean;
  /** Below the block: Repetir / Cancelar, Salvar repetição… (the detail). */
  footer?: ReactNode;
  /** Note above the footer ("Vale para esta e as próximas…"). */
  note?: ReactNode;
  /** The control cannot change: the reason under it. */
  disabledReason?: string;
  /** A note under the control that does not lock it ("Parou de repetir."). */
  hint?: string;
}

/**
 * "Não se repete · Repete" and, on, the rule (spec §9.4): frequency and "a cada N", the weekdays, the
 * day and the month, the non-business day, the end, the target and the reference (collapsed), the live
 * summary and the notice of a moved first date. No data hooks.
 */
export function RepeatFieldView({ on, onToggle, form, onForm, start, today, errors, readOnly, canRegistry, footer, note, disabledReason, hint }: RepeatFieldViewProps) {
  const set = <K extends keyof RepeatForm>(key: K, value: RepeatForm[K]) => onForm({ ...form, [key]: value });
  const f = form.frequency;
  const locked = readOnly || Boolean(disabledReason);
  return (
    <div className="flex flex-col gap-3 sm:col-span-2">
      <div className="flex flex-col gap-1.5">
        <SegmentedControl<'off' | 'on'>
          size="sm"
          ariaLabel="Repetição"
          value={on ? 'on' : 'off'}
          onChange={(v) => !locked && onToggle(v === 'on')}
          options={[
            { value: 'off', label: 'Não se repete' },
            { value: 'on', label: 'Repete' },
          ]}
          className={cn('self-start', locked && 'opacity-60')}
        />
        {disabledReason || hint ? <p className="text-xs text-muted">{disabledReason ?? hint}</p> : null}
      </div>
      {on ? (
        <div className="flex flex-col gap-3 rounded-lg border border-border p-3">
          <div className={cn('grid gap-2', hasInterval(f) && 'grid-cols-[minmax(0,1fr)_auto]')}>
            <Field label="Frequência">
              <Select disabled={locked} value={f} onChange={(e) => set('frequency', e.target.value as RecurrenceFrequency)}>
                {RECURRENCE_FREQUENCIES.map((x) => (
                  <option key={x} value={x}>
                    {RECURRENCE_FREQUENCY_LABELS[x]}
                  </option>
                ))}
              </Select>
            </Field>
            {hasInterval(f) ? <IntervalField form={form} disabled={locked} error={errors.interval} onChange={(v) => set('interval', v)} /> : null}
          </div>
          {errors.interval ? (
            <p role="alert" className="-mt-1 text-xs font-medium text-danger">
              {errors.interval}
            </p>
          ) : null}

          {f === 'weekly' ? (
            <WeekdaysField
              value={form.weekdays}
              disabled={locked}
              error={errors.weekdays}
              onChange={(weekdays) => onForm({ ...form, weekdays, touched: { ...form.touched, weekdays: true } })}
            />
          ) : null}

          {!isDayBased(f) ? (
            <div className={cn('grid gap-2', isAnchored(f) && 'sm:grid-cols-2')}>
              <Field label="Dia">
                <DueDayField disabled={locked} value={form.dueDay} onChange={(v) => onForm({ ...form, dueDay: v, touched: { ...form.touched, dueDay: true } })} />
              </Field>
              {isAnchored(f) ? (
                <Field label={f === 'annual' ? 'Mês' : '1º mês'}>
                  <AnchorMonthField
                    annual={f === 'annual'}
                    disabled={locked}
                    value={form.dueMonth}
                    onChange={(v) => onForm({ ...form, dueMonth: v, touched: { ...form.touched, dueMonth: true } })}
                  />
                </Field>
              ) : null}
              {isAnchored(f) && f !== 'annual' ? (
                <p className="text-xs text-muted sm:col-span-2">{dueRuleHint({ period: f, dueDay: Number(form.dueDay) || 1, dueMonth: Number(form.dueMonth) || 1 })}</p>
              ) : null}
            </div>
          ) : null}

          <div className="flex flex-col gap-1.5">
            <span className="text-[13px] font-medium text-fg">Dia não útil</span>
            {isDayBased(f) ? (
              <label className="flex items-center gap-2 text-[13px] text-fg">
                <Switch checked={form.skipNonBusiness} disabled={locked} onCheckedChange={(v) => set('skipNonBusiness', v)} aria-label="Só em dias úteis" />
                Só em dias úteis
              </label>
            ) : (
              <NonBusinessField ariaLabel="Dia não útil" value={form.nonBusinessDayRule} disabled={locked} onChange={(v) => set('nonBusinessDayRule', v)} />
            )}
          </div>

          <EndsField form={form} disabled={locked} errors={errors} onForm={onForm} />

          <TargetAndReference form={form} disabled={locked} error={errors.targetDaysBefore} onForm={onForm} />

          <p aria-live="polite" className="text-caption text-muted">
            {start ? repeatSummary(form, start, today) : 'Informe quando começa para ver as próximas datas.'}
          </p>
          {start && firstDateNotice(form, start) ? <p className="text-caption text-warning">{firstDateNotice(form, start)}</p> : null}

          {note}
          {footer || canRegistry ? (
            <div className="flex flex-wrap items-center gap-2">
              {footer}
              {canRegistry ? (
                <Button asChild variant="link" size="sm" className="ml-auto">
                  <Link to="/tarefas/recorrentes?recorrente=nova">Recorrente para vários clientes</Link>
                </Button>
              ) : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function IntervalField({ form, disabled, error, onChange }: { form: RepeatForm; disabled: boolean; error?: string; onChange: (v: string) => void }) {
  const id = useId();
  const unit = RECURRENCE_INTERVAL_UNITS[form.frequency];
  const n = Number(form.interval);
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[13px] font-medium text-fg">
        A cada
      </label>
      <div className="flex h-10 items-center gap-2">
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={1}
          max={99}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          className="w-16"
          value={form.interval}
          onChange={(e) => onChange(e.target.value)}
        />
        <span className="text-body-sm text-muted">{n === 1 || !form.interval ? unit?.one : unit?.many}</span>
      </div>
    </div>
  );
}

function WeekdaysField({ value, disabled, error, onChange }: { value: number[]; disabled: boolean; error?: string; onChange: (v: number[]) => void }) {
  const set = new Set(value);
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-fg">Dias da semana</span>
      <div className="grid grid-cols-7 gap-1.5 sm:flex">
        {WEEKDAY_LETTERS.map(([day, letter]) => {
          const pressed = set.has(day);
          return (
            <button
              key={day}
              type="button"
              aria-pressed={pressed}
              aria-label={WEEKDAY_LABELS[day]}
              disabled={disabled}
              onClick={() => onChange(pressed ? value.filter((d) => d !== day) : [...value, day].sort((a, b) => a - b))}
              className={cn(
                'flex h-9 items-center justify-center rounded-[10px] text-[13px] font-semibold transition-colors duration-150 disabled:opacity-60 sm:w-9 pointer-coarse:h-10 sm:pointer-coarse:w-10',
                pressed ? 'bg-primary-soft text-primary-soft-fg' : 'text-muted ring-1 ring-border hover:text-fg',
              )}
            >
              {letter}
            </button>
          );
        })}
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

function EndsField({ form, disabled, errors, onForm }: { form: RepeatForm; disabled: boolean; errors: ReturnType<typeof repeatErrors>; onForm: (f: RepeatForm) => void }) {
  const id = useId();
  const error = form.ends === 'date' ? errors.endDate : form.ends === 'count' ? errors.count : undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <span className="text-[13px] font-medium text-fg">Termina</span>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <SegmentedControl<RepeatForm['ends']>
          size="sm"
          ariaLabel="Termina"
          value={form.ends}
          onChange={(ends) => !disabled && onForm({ ...form, ends })}
          options={[
            { value: 'never', label: 'Nunca' },
            { value: 'date', label: 'Em' },
            { value: 'count', label: 'Após' },
          ]}
          className="self-start"
        />
        {form.ends === 'date' ? (
          <Input
            id={id}
            type="date"
            aria-label="Data de término"
            aria-invalid={error ? true : undefined}
            disabled={disabled}
            className="h-10 sm:w-44"
            value={form.endDate}
            onChange={(e) => onForm({ ...form, endDate: e.target.value as ISODate | '' })}
          />
        ) : form.ends === 'count' ? (
          <span className="flex items-center gap-2">
            <Input
              id={id}
              type="number"
              inputMode="numeric"
              min={1}
              max={500}
              aria-label="Número de vezes"
              aria-invalid={error ? true : undefined}
              disabled={disabled}
              className="w-16"
              value={form.count}
              onChange={(e) => onForm({ ...form, count: e.target.value })}
            />
            <span className="text-body-sm text-muted">vezes</span>
          </span>
        ) : null}
      </div>
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** "Meta e referência", collapsed unless a value is not the default. */
function TargetAndReference({ form, disabled, error, onForm }: { form: RepeatForm; disabled: boolean; error?: string; onForm: (f: RepeatForm) => void }) {
  const f = form.frequency;
  const custom = (f !== 'daily' && Number(form.targetDaysBefore) > 0) || (!isDayBased(f) && Number(form.referenceOffset) > 0);
  const [open, setOpen] = useState(custom || Boolean(error));
  // Daily: the target is the day itself and there is no reference month.
  if (f === 'daily') return null;
  if (!open && !custom && !error) {
    return (
      <Button variant="link" size="sm" className="self-start" onClick={() => setOpen(true)}>
        Meta e referência
      </Button>
    );
  }
  return (
    <div className={cn('grid gap-3', !isDayBased(f) && 'sm:grid-cols-2')}>
      <Field label="Meta interna" error={error}>
        <div className="flex h-10 items-center gap-2">
          <Input
            type="number"
            inputMode="numeric"
            min={0}
            max={f === 'weekly' ? 6 : 30}
            disabled={disabled}
            className="w-16"
            aria-label="Meta interna, em dias antes"
            value={form.targetDaysBefore}
            onChange={(e) => onForm({ ...form, targetDaysBefore: e.target.value })}
          />
          <span className="text-body-sm text-muted">dias antes</span>
        </div>
      </Field>
      {!isDayBased(f) ? (
        <Field label="Competência de referência">
          <Select disabled={disabled} value={form.referenceOffset} onChange={(e) => onForm({ ...form, referenceOffset: e.target.value })}>
            {Array.from({ length: MAX_REFERENCE_OFFSET + 1 }, (_, i) => (
              <option key={i} value={String(i)}>
                {i === 0 ? 'Mesmo mês' : referenceOptionLabel(i)}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
    </div>
  );
}
