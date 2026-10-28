import { dateInTimeZone, todayISO, type ISODate } from '@effinance/shared';

function pinned(name: 'EFFINANCE_TODAY' | 'EFFINANCE_NOW'): string | undefined {
  // `process` does not exist in the browser demo; production never honors the pins.
  const vars = typeof process === 'undefined' ? undefined : process.env;
  if (!vars || vars.NODE_ENV === 'production') return undefined;
  // Literal accesses: the demo build replaces `process.env.EFFINANCE_TODAY` at compile time.
  return name === 'EFFINANCE_TODAY' ? vars.EFFINANCE_TODAY : vars.EFFINANCE_NOW;
}

/**
 * Current calendar date. `EFFINANCE_TODAY` (YYYY-MM-DD) pins it — used by tests for
 * deterministic results; never set it in production.
 */
export function today(): ISODate {
  const pin = pinned('EFFINANCE_TODAY');
  return pin && /^\d{4}-\d{2}-\d{2}$/.test(pin) ? pin : todayISO();
}

/** Today in a time zone (the office's, for tasks). Honors the `EFFINANCE_TODAY` pin like `today()`. */
export function todayIn(timeZone: string): ISODate {
  const pin = pinned('EFFINANCE_TODAY');
  return pin && /^\d{4}-\d{2}-\d{2}$/.test(pin) ? pin : dateInTimeZone(now(), timeZone);
}

/**
 * Current instant for business records (a task's conclusion, a flow step's activation).
 * `EFFINANCE_NOW` (ISO 8601) pins it outside production — tests of time-zone rules. Tokens and
 * sessions keep the real clock.
 */
export function now(): Date {
  const pin = pinned('EFFINANCE_NOW');
  const date = pin ? new Date(pin) : null;
  return date && !Number.isNaN(date.getTime()) ? date : new Date();
}
