// Small text helpers of the task screens (pure, tested in format.test.ts).

import { dateInTimeZone, diffInDays, formatDateBR, type ISODate } from '@effinance/shared';

/** "agora", "há 5 min", "há 2 h", "ontem", "12/10" (or "12/10/25" in another year) for comments. */
export function commentTime(iso: string, now: Date = new Date()): string {
  const at = new Date(iso);
  const minutes = Math.floor((now.getTime() - at.getTime()) / 60_000);
  const today = dateInTimeZone(now);
  const day = dateInTimeZone(at);
  if (minutes < 1) return 'agora';
  if (day === today && minutes < 60) return `há ${minutes} min`;
  if (day === today) return `há ${Math.floor(minutes / 60)} h`;
  if (diffInDays(today, day) === 1) return 'ontem';
  const [y, m, d] = day.split('-');
  return y === today.slice(0, 4) ? `${d}/${m}` : `${d}/${m}/${y!.slice(2)}`;
}

const WEEKDAYS = ['Domingo', 'Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

/** "Quarta-feira, 28 de outubro" (head of Início and Tarefas). */
export function longDay(date: ISODate): string {
  const [y, m, d] = date.split('-').map(Number) as [number, number, number];
  const weekday = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
  return `${WEEKDAYS[weekday]}, ${d} de ${MONTHS[m - 1]}`;
}

/** "12/10/2026 às 14:32" in the office time zone. */
export function dateTimeBR(iso: string): string {
  const at = new Date(iso);
  const time = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' }).format(at);
  return `${formatDateBR(dateInTimeZone(at))} às ${time}`;
}

/** "Ana Paula, Bruno e mais 2" / "Sem membros". */
export function namesSummary(names: string[], max = 2): string {
  const first = names.map((n) => n.trim().split(/\s+/).slice(0, 2).join(' '));
  if (first.length === 0) return 'Sem membros';
  if (first.length <= max) return first.length === 1 ? first[0]! : `${first.slice(0, -1).join(', ')} e ${first.at(-1)}`;
  return `${first.slice(0, max).join(', ')} e mais ${first.length - max}`;
}
