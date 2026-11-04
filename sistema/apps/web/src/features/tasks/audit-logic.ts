// Monthly audit (spec §11): the URL of the page, the client × recurring task data with its filters,
// the client list ("Por cliente", every width) and the task accordion ("Por tarefa"), the cell cycle
// (A fazer → Em andamento → Concluída) and the derived "mês concluído". Pure functions, tested in
// phase2-logic.test.ts and audit-list.test.ts.

import {
  dateInTimeZone,
  diffInDays,
  monthKeySchema,
  TAX_REGIMES,
  type AuditClientRow,
  type AuditColumn,
  type AuditMatrixResponse,
  type ISODate,
  type MonthKey,
  type OccurrenceCell,
  type TaskAuditQuery,
  type TaskStatus,
  type TaxRegime,
} from '@effinance/shared';
import { isUuid } from '@/lib/safe-url';
import { daysText, shortDate, shortName, type DueInfo, type DueTone } from './due';
import { occurrenceKey, openDeadlineInfo } from './occurrence';

// ---------------------------------------------------------------------------
// URL (`competencia`, `visao`, `regime`, `departamento`, `responsavel`, `clientes`, `busca`, `recorrente`)
// ---------------------------------------------------------------------------

export type AuditView = 'client' | 'task';
export type AuditClientsFilter = '' | 'pending' | 'concluded';

export interface AuditFilters {
  competence: MonthKey;
  view: AuditView;
  regime: TaxRegime | '';
  department: string;
  assignee: string;
  clients: AuditClientsFilter;
  search: string;
  /** Recurring task opened in "Por tarefa". */
  recurring: string;
}

export function parseAuditFilters(params: URLSearchParams, today: ISODate): AuditFilters {
  const competence = params.get('competencia') ?? '';
  const regime = params.get('regime') ?? '';
  const clients = params.get('clientes');
  const id = (v: string | null) => (isUuid(v) ? v : '');
  return {
    competence: monthKeySchema.safeParse(competence).success ? competence : today.slice(0, 7),
    view: params.get('visao') === 'tarefa' ? 'task' : 'client',
    regime: (TAX_REGIMES as readonly string[]).includes(regime) ? (regime as TaxRegime) : '',
    department: id(params.get('departamento')),
    assignee: id(params.get('responsavel')),
    clients: clients === 'pendentes' ? 'pending' : clients === 'concluidos' ? 'concluded' : '',
    search: (params.get('busca') ?? '').slice(0, 200),
    recurring: id(params.get('recorrente')),
  };
}

export function writeAuditFilters(params: URLSearchParams, patch: Partial<AuditFilters>, today: ISODate): URLSearchParams {
  const next = new URLSearchParams(params);
  const set = (key: string, value: string | null | undefined) => (value ? next.set(key, value) : next.delete(key));
  if (patch.competence !== undefined) set('competencia', patch.competence === today.slice(0, 7) ? null : patch.competence);
  if (patch.view !== undefined) set('visao', patch.view === 'task' ? 'tarefa' : null);
  if (patch.regime !== undefined) set('regime', patch.regime);
  if (patch.department !== undefined) set('departamento', patch.department);
  if (patch.assignee !== undefined) set('responsavel', patch.assignee);
  if (patch.clients !== undefined) set('clientes', patch.clients === 'pending' ? 'pendentes' : patch.clients === 'concluded' ? 'concluidos' : null);
  if (patch.search !== undefined) set('busca', patch.search.trim());
  if (patch.recurring !== undefined) set('recorrente', patch.recurring);
  return next;
}

export function auditFilterCount(f: AuditFilters): number {
  return [f.regime, f.department, f.assignee, f.clients, f.search].filter(Boolean).length;
}

/** The API query: the matrix filters the server knows (search and the clients filter are local). */
export function toAuditQuery(f: AuditFilters): TaskAuditQuery {
  return {
    competence: f.competence,
    taxRegime: f.regime || undefined,
    departmentId: f.department || undefined,
    assigneeId: f.assignee || undefined,
  };
}

// ---------------------------------------------------------------------------
// Cells
// ---------------------------------------------------------------------------

export function cellKey(clientId: string, column: Pick<AuditColumn, 'recurringTaskId' | 'periodKey'>): string {
  return `${clientId}|${occurrenceKey(column)}`;
}

export function indexCells(cells: OccurrenceCell[]): Map<string, OccurrenceCell> {
  return new Map(cells.map((c) => [cellKey(c.clientId, c), c]));
}

/** What a click does: A fazer → Em andamento → Concluída (Aguardando cliente → Em andamento). */
export function nextCellStatus(status: TaskStatus): TaskStatus | null {
  if (status === 'todo' || status === 'waiting_client') return 'in_progress';
  if (status === 'in_progress') return 'done';
  return null;
}

/** Keys 1, 2 and 3 on a focused cell. */
export function statusForKey(key: string): TaskStatus | null {
  return key === '1' ? 'todo' : key === '2' ? 'in_progress' : key === '3' ? 'done' : null;
}

export const isPendingCell = (c: Pick<OccurrenceCell, 'status'>) => c.status !== 'done' && c.status !== 'canceled';

/** The client's month closes when this cell concludes: every other cell is done or canceled. */
export function monthClosesWith(cells: OccurrenceCell[], cell: Pick<OccurrenceCell, 'taskId' | 'clientId'>): boolean {
  const mine = cells.filter((c) => c.clientId === cell.clientId);
  const live = mine.filter((c) => c.status !== 'canceled');
  return live.length > 0 && live.every((c) => c.taskId === cell.taskId || c.status === 'done');
}

/** Initials of who concluded (the pill of a concluded cell). */
export function concludedInitials(name: string | null | undefined): string {
  if (!name) return '✓';
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? '') : '')).toUpperCase();
}

// ---------------------------------------------------------------------------
// Rows and columns in view
// ---------------------------------------------------------------------------

const normalize = (s: string) =>
  s
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export function clientPending(row: Pick<AuditClientRow, 'total' | 'done' | 'canceled'>): number {
  return row.total - row.done - row.canceled;
}

function matchesClient(row: AuditClientRow, search: string): boolean {
  if (!search) return true;
  const q = normalize(search.trim());
  const digits = search.replace(/\D/g, '');
  return normalize(row.name).includes(q) || normalize(row.legalName).includes(q) || (digits.length >= 3 && row.document.includes(digits));
}

/**
 * Clients of the matrix ("Por cliente"): by name; "Com pendências" keeps the ones with something
 * pending, overdue ones first; "Mês concluído", the ones whose month is concluded.
 */
export function visibleClients(data: Pick<AuditMatrixResponse, 'clients'>, f: Pick<AuditFilters, 'search' | 'clients' | 'view'>): AuditClientRow[] {
  let rows = data.clients.filter((r) => (f.view === 'client' ? matchesClient(r, f.search) : true));
  if (f.clients === 'pending') rows = rows.filter((r) => clientPending(r) > 0);
  if (f.clients === 'concluded') rows = rows.filter((r) => r.monthConcludedAt !== null);
  const byName = (a: AuditClientRow, b: AuditClientRow) => a.name.localeCompare(b.name, 'pt-BR');
  if (f.clients === 'pending') return [...rows].sort((a, b) => Number(b.overduePending > 0) - Number(a.overduePending > 0) || byName(a, b));
  return [...rows].sort(byName);
}

/** Columns in view: "Por tarefa" searches by name; "Com pendências" drops the complete ones. */
export function visibleColumns(data: Pick<AuditMatrixResponse, 'columns'>, f: Pick<AuditFilters, 'search' | 'clients' | 'view'>): AuditColumn[] {
  let cols = data.columns;
  if (f.view === 'task' && f.search) cols = cols.filter((c) => normalize(c.name).includes(normalize(f.search.trim())));
  if (f.clients === 'pending') cols = cols.filter((c) => c.pending > 0);
  return cols;
}

export interface AccordionTask {
  column: AuditColumn;
  cells: (OccurrenceCell & { client: AuditClientRow })[];
}

/** "Por tarefa": each recurring task with its clients (only the pending ones with "Com pendências"). */
export function accordionByTask(data: AuditMatrixResponse, f: Pick<AuditFilters, 'search' | 'clients' | 'view'>): AccordionTask[] {
  const clients = new Map(visibleClients(data, { ...f, view: 'task', search: '' }).map((c) => [c.id, c]));
  const index = indexCells(data.cells);
  return visibleColumns(data, f).map((column) => ({
    column,
    cells: [...clients.values()]
      .map((client) => {
        const cell = index.get(cellKey(client.id, column));
        return cell ? { ...cell, client } : null;
      })
      .filter((c): c is OccurrenceCell & { client: AuditClientRow } => c !== null && (f.clients !== 'pending' || isPendingCell(c))),
  }));
}

export interface AccordionClient {
  client: AuditClientRow;
  items: { column: AuditColumn; cell: OccurrenceCell }[];
}

/** "Por cliente": each client with its recurring tasks of the competence (the cells that exist). */
export function accordionByClient(data: AuditMatrixResponse, f: Pick<AuditFilters, 'search' | 'clients' | 'view'>): AccordionClient[] {
  const index = indexCells(data.cells);
  return visibleClients(data, f).map((client) => ({
    client,
    items: data.columns
      .map((column) => ({ column, cell: index.get(cellKey(client.id, column)) }))
      .filter((x): x is { column: AuditColumn; cell: OccurrenceCell } => Boolean(x.cell) && (f.clients !== 'pending' || isPendingCell(x.cell!))),
  }));
}

/** "Meta 15/10 · legal 20/10", or the overdue line of the column when it has pending cells. */
export function columnDeadline(c: Pick<AuditColumn, 'legalDueDate' | 'targetDate' | 'pending' | 'overdue' | 'targetMissed'>, today: ISODate): { text: string; tone: DueTone } {
  if (c.pending > 0 && c.overdue) return { text: `Prazo legal venceu há ${daysText(diffInDays(today, c.legalDueDate))}`, tone: 'danger' };
  if (c.pending > 0 && c.targetMissed) return { text: `Meta venceu há ${daysText(diffInDays(today, c.targetDate))}`, tone: 'warning-strong' };
  if (c.targetDate < c.legalDueDate) return { text: `Meta ${shortDate(c.targetDate, today)} · legal ${shortDate(c.legalDueDate, today)}`, tone: 'muted' };
  return { text: `Prazo legal ${shortDate(c.legalDueDate, today)}`, tone: 'muted' };
}

/** "Outubro de 2026: 182 de 240 concluídas (76%). 12 pendências já passaram do prazo legal." */
export function auditHeadline(summary: AuditMatrixResponse['summary'], monthLabel: string): string {
  const live = summary.total - summary.canceled;
  if (live === 0) return `${monthLabel}: nenhuma tarefa recorrente na competência.`;
  const pct = Math.round((summary.done / live) * 100);
  const late =
    summary.overduePending > 0
      ? `${summary.overduePending} ${summary.overduePending === 1 ? 'pendência já passou' : 'pendências já passaram'} do prazo legal.`
      : 'Nenhuma pendência passou do prazo legal.';
  return `${monthLabel}: ${summary.done} de ${live} concluídas (${pct}%). ${late}`;
}

// ---------------------------------------------------------------------------
// "Por cliente" as a list (every width): each client with its progress, opened to its obligations
// ---------------------------------------------------------------------------

/** Concluded of the client in the competence: "N de M" (canceled ones out) and the bar's proportion. */
export function clientProgress(row: Pick<AuditClientRow, 'total' | 'done' | 'canceled'>): { done: number; live: number; ratio: number; text: string } {
  const live = Math.max(0, row.total - row.canceled);
  return { done: row.done, live, ratio: live ? row.done / live : 0, text: `${row.done} de ${live}` };
}

export type AuditListKeyAction = { type: 'focus'; index: number } | { type: 'expand' } | { type: 'collapse' } | null;

/** Keys on a focused client row: ↑/↓, Home/End move the focus; → opens and ← closes (a tree's rule). */
export function auditListKey(key: string, index: number, count: number, expanded: boolean): AuditListKeyAction {
  if (count <= 0) return null;
  const clamp = (i: number) => ({ type: 'focus' as const, index: Math.min(count - 1, Math.max(0, i)) });
  switch (key) {
    case 'ArrowDown':
      return clamp(index + 1);
    case 'ArrowUp':
      return clamp(index - 1);
    case 'Home':
      return clamp(0);
    case 'End':
      return clamp(count - 1);
    case 'ArrowRight':
      return expanded ? null : { type: 'expand' };
    case 'ArrowLeft':
      return expanded ? { type: 'collapse' } : null;
    default:
      return null;
  }
}

/** Clients opened on arrival: the only one of a search ("Ver na auditoria"), never a long list. */
export function autoExpandedClients(clients: Pick<AuditClientRow, 'id'>[]): string[] {
  return clients.length === 1 ? [clients[0]!.id] : [];
}

/** "Meta 15/10 · legal 20/10" (or "Legal 20/10") and, while pending, the delay or how long is left. */
export function cellDeadlines(cell: Pick<OccurrenceCell, 'status' | 'targetDate' | 'legalDueDate'>, today: ISODate): { dates: string; status: DueInfo | null } {
  const legal = shortDate(cell.legalDueDate, today);
  const dates = cell.targetDate < cell.legalDueDate ? `Meta ${shortDate(cell.targetDate, today)} · legal ${legal}` : `Legal ${legal}`;
  const pending = cell.status !== 'done' && cell.status !== 'canceled';
  return { dates, status: pending ? openDeadlineInfo(cell, today, true) : null };
}

const SITUATION_TEXT: Record<TaskStatus, string> = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  waiting_client: 'Aguardando cliente',
  done: 'Concluída',
  canceled: 'Cancelada',
};

/** "A fazer", "Em andamento", "Concluída por Marina S. em 27/10". */
export function cellSituationText(cell: Pick<OccurrenceCell, 'status' | 'concludedBy' | 'concludedAt'>, today: ISODate): string {
  if (cell.status !== 'done') return SITUATION_TEXT[cell.status];
  const who = cell.concludedBy ? ` por ${shortName(cell.concludedBy.name)}` : '';
  const day = cell.concludedAt ? ` em ${shortDate(dateInTimeZone(new Date(cell.concludedAt)), today)}` : '';
  return `Concluída${who}${day}`;
}
