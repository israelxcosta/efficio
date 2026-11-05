// "· atualizado às 14:32" under the title of the dashboards (docs/dashboards-redesign.md §10), from
// the `dataUpdatedAt` of the page's main query, in the office time zone.

import { useEffect, useState } from 'react';
import { TASK_TIME_ZONE } from '@effinance/shared';

const timeFormat = new Intl.DateTimeFormat('pt-BR', { timeZone: TASK_TIME_ZONE, hour: '2-digit', minute: '2-digit' });

/** "atualizado agora" (< 1 min), "atualizado há N min" (< 1 h), "atualizado às HH:MM"; '' before the first load. */
export function updatedLabel(updatedAt: number, now: number): string {
  if (!updatedAt) return '';
  const minutes = Math.floor(Math.max(0, now - updatedAt) / 60_000);
  if (minutes < 1) return 'atualizado agora';
  if (minutes < 60) return `atualizado há ${minutes} min`;
  return `atualizado às ${timeFormat.format(updatedAt)}`;
}

/** The label, recalculated every minute. */
export function useUpdatedLabel(updatedAt: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    setNow(Date.now());
    const id = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(id);
  }, [updatedAt]);
  return updatedLabel(updatedAt, Math.max(now, updatedAt));
}
