// In-process daily scheduler (JOBS_ENABLED; the VPS runs a single API instance, no cron or queue).
// Fires once a day at a wall-clock time of a time zone (default 03:00 America/Sao_Paulo), never runs
// two jobs at once (in-process flag + a PostgreSQL advisory lock, which also covers a second container
// during a deploy) and never lets a failure escape: it is logged and the next day is scheduled.

import type postgres from 'postgres';
import type { JobLog } from './daily';

export interface DailySchedule {
  hour: number;
  minute: number;
  timeZone: string;
}

export const DEFAULT_SCHEDULE: DailySchedule = { hour: 3, minute: 0, timeZone: 'America/Sao_Paulo' };

/** Offset (ms) of `timeZone` from UTC at `instant` (local wall clock − UTC). */
function zoneOffsetMs(instant: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(new Date(instant));
  const n = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wall = Date.UTC(n('year'), n('month') - 1, n('day'), n('hour'), n('minute'), n('second'));
  return wall - Math.floor(instant / 1000) * 1000;
}

/** UTC instant of a wall-clock time on a calendar day of `timeZone`. */
function zonedInstant(year: number, month: number, day: number, s: DailySchedule): number {
  const guess = Date.UTC(year, month - 1, day, s.hour, s.minute);
  const first = guess - zoneOffsetMs(guess, s.timeZone);
  // Second pass for days where the offset changes (DST); harmless otherwise.
  return guess - zoneOffsetMs(first, s.timeZone);
}

/** The first scheduled instant strictly after `from`. */
export function nextRunAt(from: Date, schedule: DailySchedule = DEFAULT_SCHEDULE): Date {
  const local = new Date(from.getTime() + zoneOffsetMs(from.getTime(), schedule.timeZone));
  for (let addDays = 0; addDays <= 2; addDays++) {
    const day = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() + addDays));
    const at = zonedInstant(day.getUTCFullYear(), day.getUTCMonth() + 1, day.getUTCDate(), schedule);
    if (at > from.getTime()) return new Date(at);
  }
  throw new Error('unreachable: no scheduled instant within two days');
}

/** Acquires the cross-process lock; resolves to its release function, or null when it is taken. */
export type TryLock = () => Promise<(() => Promise<void>) | null>;

/** Key of the advisory lock of the daily jobs (any constant shared by every API process). */
export const DAILY_JOBS_LOCK_KEY = 7_202_611;

/** Session-level `pg_try_advisory_lock` on a reserved connection (released on the same one). */
export function advisoryLock(client: postgres.Sql, key: number = DAILY_JOBS_LOCK_KEY): TryLock {
  return async () => {
    const conn = await client.reserve();
    try {
      const [row] = await conn<{ locked: boolean }[]>`select pg_try_advisory_lock(${key}::bigint) as locked`;
      if (!row?.locked) {
        conn.release();
        return null;
      }
    } catch (error) {
      conn.release();
      throw error;
    }
    return async () => {
      try {
        await conn`select pg_advisory_unlock(${key}::bigint)`;
      } finally {
        conn.release();
      }
    };
  };
}

export type RunOutcome = 'ran' | 'skipped' | 'failed';

export interface SchedulerOptions {
  /** The work; whatever it returns is logged as the result. */
  run: () => Promise<unknown>;
  log: JobLog;
  name?: string;
  schedule?: DailySchedule;
  tryLock?: TryLock;
  now?: () => Date;
  setTimer?: (fn: () => void, ms: number) => unknown;
  clearTimer?: (handle: unknown) => void;
}

export interface DailyScheduler {
  /** Runs now (outside the timer), honoring the locks. */
  runNow(): Promise<RunOutcome>;
  /** When the next run is due (null after stop). */
  nextRun(): Date | null;
  stop(): void;
}

export function startDailyScheduler(o: SchedulerOptions): DailyScheduler {
  const name = o.name ?? 'daily';
  const schedule = o.schedule ?? DEFAULT_SCHEDULE;
  const now = o.now ?? (() => new Date());
  const setTimer =
    o.setTimer ??
    ((fn: () => void, ms: number) => {
      const t = setTimeout(fn, ms);
      t.unref(); // never keeps the process alive on shutdown
      return t;
    });
  const clearTimer = o.clearTimer ?? ((h: unknown) => clearTimeout(h as ReturnType<typeof setTimeout>));
  let running = false;
  let stopped = false;
  let timer: unknown = null;
  let due: Date | null = null;

  async function runNow(): Promise<RunOutcome> {
    if (running) {
      o.log.warn({ job: name }, 'job skipped: still running');
      return 'skipped';
    }
    running = true;
    const started = Date.now();
    let release: (() => Promise<void>) | null = null;
    try {
      if (o.tryLock) {
        release = await o.tryLock();
        if (!release) {
          o.log.warn({ job: name }, 'job skipped: another process holds the lock');
          return 'skipped';
        }
      }
      const result = await o.run();
      o.log.info({ job: name, ms: Date.now() - started, result }, 'job finished');
      return 'ran';
    } catch (error) {
      o.log.error({ job: name, ms: Date.now() - started, err: error }, 'job failed');
      return 'failed';
    } finally {
      running = false;
      if (release) await release().catch((err: unknown) => o.log.error({ job: name, err }, 'job lock release failed'));
    }
  }

  function arm(after: Date): Date | null {
    if (stopped) return null;
    const slot = nextRunAt(after, schedule);
    due = slot;
    timer = setTimer(() => {
      void runNow().finally(() => {
        // A timer firing a little early must not schedule the same slot again.
        arm(new Date(Math.max(now().getTime(), slot.getTime() + 60_000)));
      });
    }, Math.max(0, slot.getTime() - now().getTime()));
    return slot;
  }

  o.log.info({ job: name, nextRun: arm(now())?.toISOString() }, 'job scheduled');

  return {
    runNow,
    nextRun: () => due,
    stop() {
      stopped = true;
      due = null;
      if (timer !== null) clearTimer(timer);
      timer = null;
    },
  };
}
