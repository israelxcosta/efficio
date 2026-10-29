// Last page visited in each area during the browser session, per workspace and user, so the area
// switch button takes the administrator back where they were (spec §2.3). sessionStorage: a new tab
// starts at the area's home. Every read is validated: only in-app paths of the right area survive.

import { safeInternalPath } from '@/lib/safe-url';
import { AREA_HOME, areaOf, type Area } from './nav';

export interface AreaMemory {
  gestao?: string;
  financeiro?: string;
  /** Area of the last page that belonged to one (keeps the rail on /configuracoes and the 404). */
  last?: Area;
}

const PREFIX = 'effinance.area.last.v1:';

export function areaMemoryKey(workspaceId: string, userId: string): string {
  return `${PREFIX}${workspaceId}:${userId}`;
}

function storage(): Storage | null {
  try {
    return typeof sessionStorage === 'undefined' ? null : sessionStorage;
  } catch {
    return null;
  }
}

/** A stored path is kept only when it is an in-app path of that area. */
function pathOfArea(value: unknown, area: Area): string | undefined {
  const path = safeInternalPath(value, '');
  return path && areaOf(path) === area ? path : undefined;
}

/** Parses whatever is stored (tampered, older, foreign) into a clean memory. */
export function sanitizeAreaMemory(raw: unknown): AreaMemory {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: AreaMemory = {};
  const gestao = pathOfArea(r.gestao, 'gestao');
  const financeiro = pathOfArea(r.financeiro, 'financeiro');
  if (gestao) out.gestao = gestao;
  if (financeiro) out.financeiro = financeiro;
  if (r.last === 'gestao' || r.last === 'financeiro') out.last = r.last;
  return out;
}

export function readAreaMemory(key: string): AreaMemory {
  const s = storage();
  if (!s) return {};
  try {
    const value = s.getItem(key);
    return value ? sanitizeAreaMemory(JSON.parse(value)) : {};
  } catch {
    return {};
  }
}

function write(key: string, memory: AreaMemory): void {
  try {
    storage()?.setItem(key, JSON.stringify(memory));
  } catch {
    // Storage full or blocked: the switch falls back to the area's home.
  }
}

/** Records a visited page (path + query) under its area; common pages are not remembered. */
export function rememberAreaPath(key: string, pathWithSearch: string): AreaMemory {
  const memory = readAreaMemory(key);
  const area = areaOf(pathWithSearch);
  if (area === 'common') return memory;
  const path = pathOfArea(pathWithSearch, area);
  if (!path) return memory;
  const next: AreaMemory = { ...memory, [area]: path, last: area };
  write(key, next);
  return next;
}

/** Where the switch button leads: the last page of that area in this session, else its home. */
export function lastPathOf(memory: AreaMemory, area: Area): string {
  return memory[area] ?? AREA_HOME[area];
}

/** Forgets every area memory of the browser session except `keep` (switching workspaces clears it). */
export function clearAreaMemories(keep?: string): void {
  const s = storage();
  if (!s) return;
  try {
    const keys: string[] = [];
    for (let i = 0; i < s.length; i++) {
      const k = s.key(i);
      if (k && k.startsWith(PREFIX) && k !== keep) keys.push(k);
    }
    for (const k of keys) s.removeItem(k);
  } catch {
    // ignore
  }
}

/**
 * Keeps the memories in step with the session: with a workspace open, only its own memory stays
 * (switching workspaces starts clean); signed out (logout, expired session, account deleted), every
 * memory goes, so the tab keeps no trace of the pages visited (ids and search terms in the query)
 * for the scripts of the next session. Nothing happens while the session is loading (a reload keeps it).
 */
export function forgetStaleAreaMemories(session: { loading: boolean; signedIn: boolean; key: string | null }): void {
  if (session.key) clearAreaMemories(session.key);
  else if (!session.loading && !session.signedIn) clearAreaMemories();
}

/**
 * Area whose rail a page shows. Gestão and Financeiro pages show their own; common pages keep the
 * last area used. Members without finance access always see the Gestão rail (also on a finance URL,
 * where the page says "Acesso restrito").
 */
export function railAreaFor(pathname: string, memory: AreaMemory, canAccessFinance: boolean): Area {
  if (!canAccessFinance) return 'gestao';
  const area = areaOf(pathname);
  if (area !== 'common') return area;
  return memory.last ?? 'gestao';
}

/**
 * Where to land after signing in: the page the visitor first opened (`from`), unless it is a finance
 * page and the member cannot open it — then the Início, not "Acesso restrito" right at the entrance.
 */
export function landingPath(from: string, role: string | null | undefined): string {
  const admin = role === 'owner' || role === 'editor';
  return areaOf(from) === 'financeiro' && !admin ? '/' : from;
}
