import { forwardRef, type InputHTMLAttributes } from 'react';
import { formatDecimal } from '@effinance/shared';
import { cn } from '@/lib/utils';
import { inputClasses } from './input';

interface MoneyInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'size'> {
  /** Value in cents. */
  value: number | null | undefined;
  onChange: (cents: number) => void;
  allowNegative?: boolean;
  size?: 'md' | 'lg';
}

const MAX_DIGITS = 13;

/**
 * Next value (absolute cents) after the browser edited the field text from `prevDisplay` to `raw`.
 * The digits typed are always appended on the right (cents) and the ones erased always leave from the
 * right, whatever the caret position: a click in the middle (or an autofocus that put the caret at the
 * start) can never shift the value by 1000×. Returns null when nothing changed or it would overflow.
 */
export function nextMoneyCents(prevCents: number, prevDisplay: string, raw: string): number | null {
  const before = prevDisplay.replace(/\D/g, '');
  const after = raw.replace(/\D/g, '');
  let prefix = 0;
  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  )
    suffix++;
  const removed = before.length - prefix - suffix;
  const inserted = after.slice(prefix, after.length - suffix);
  if (removed === 0 && !inserted) return null;
  let next = Math.floor(Math.abs(prevCents) / 10 ** removed);
  for (const digit of inserted) next = next * 10 + Number(digit);
  return String(next).length > MAX_DIGITS ? null : next;
}

/**
 * Pasted text → absolute cents: "1.234,56", "R$ 1.234,56", "1234,5", "1234.56" and "1.234" (thousands)
 * are read as reais. Null when there is no number.
 */
export function parsePastedMoney(text: string): number | null {
  const cleaned = text.replace(/[^\d,.]/g, '');
  if (!/\d/.test(cleaned)) return null;
  let reais = cleaned;
  let decimals = '';
  const comma = cleaned.lastIndexOf(',');
  if (comma >= 0) {
    reais = cleaned.slice(0, comma);
    decimals = cleaned.slice(comma + 1);
  } else {
    const dot = cleaned.lastIndexOf('.');
    // "1234.56" uses the dot as decimal separator; "1.234" / "1.234.567" use it for thousands.
    if (dot >= 0 && cleaned.length - dot - 1 <= 2) {
      reais = cleaned.slice(0, dot);
      decimals = cleaned.slice(dot + 1);
    }
  }
  const whole = reais.replace(/\D/g, '').replace(/^0+(?=\d)/, '') || '0';
  const cents = (decimals.replace(/\D/g, '') + '00').slice(0, 2);
  const digits = (whole + cents).replace(/^0+(?=\d)/, '');
  return digits.length > MAX_DIGITS ? null : Number(digits);
}

/**
 * Bank-style money input: digits fill from the right (typing 1, 2, 3 → 1,23).
 * Value is kept as integer cents.
 */
export const MoneyInput = forwardRef<HTMLInputElement, MoneyInputProps>(function MoneyInput(
  { value, onChange, allowNegative, size = 'md', className, ...props },
  ref,
) {
  const cents = value ?? 0;
  const negative = cents < 0;
  const display = formatDecimal(Math.abs(cents));

  function emit(abs: number) {
    const next = allowNegative && negative && abs !== 0 ? -abs : abs;
    if (next !== cents) onChange(next);
  }

  function handleChange(raw: string) {
    const abs = nextMoneyCents(cents, display, raw);
    if (abs !== null) emit(abs);
  }

  function caretToEnd(el: HTMLInputElement) {
    if (el.selectionStart !== el.selectionEnd) return;
    el.setSelectionRange(el.value.length, el.value.length);
  }

  return (
    <div className={cn('relative', allowNegative && 'mr-11', className)}>
      <span
        aria-hidden
        className={cn(
          'pointer-events-none absolute top-1/2 left-3.5 -translate-y-1/2 font-semibold text-muted',
          size === 'lg' ? 'text-base' : 'text-body-sm',
        )}
      >
        {negative ? '-R$' : 'R$'}
      </span>
      <input
        ref={ref}
        inputMode="numeric"
        autoComplete="off"
        className={cn(
          inputClasses,
          'tabular text-right font-semibold',
          size === 'lg' ? 'h-14 pl-12 text-2xl tracking-tight' : negative ? 'pl-12' : 'pl-10',
          negative && 'text-danger',
        )}
        value={display}
        onChange={(e) => handleChange(e.target.value)}
        onKeyDown={(e) => {
          if (allowNegative && e.key === '-') {
            e.preventDefault();
            onChange(-cents);
          }
        }}
        onPaste={(e) => {
          // A pasted amount replaces the value ("1.234,56" → R$ 1.234,56), wherever the caret is.
          e.preventDefault();
          const abs = parsePastedMoney(e.clipboardData.getData('text'));
          if (abs !== null) emit(abs);
        }}
        {...props}
        onFocus={(e) => {
          const el = e.currentTarget;
          requestAnimationFrame(() => caretToEnd(el));
          props.onFocus?.(e);
        }}
        onMouseUp={(e) => {
          // The caret is kept on the right (where the digits go); a drag selection is left alone.
          caretToEnd(e.currentTarget);
          props.onMouseUp?.(e);
        }}
      />
      {allowNegative ? (
        <button
          type="button"
          onClick={() => onChange(-cents)}
          className="absolute top-1/2 right-[-2.75rem] flex size-9 -translate-y-1/2 items-center justify-center rounded-md border border-border bg-surface text-body-sm font-semibold text-muted hover:text-fg"
          aria-label={negative ? 'Tornar positivo' : 'Tornar negativo'}
          title="Alternar sinal (+/−)"
        >
          ±
        </button>
      ) : null}
    </div>
  );
});
