import type { TaskOptionsResponse } from '@effinance/shared';

/** Department of the home page: `all`, an id, or undefined (the member's own; the API decides). */
export function resolveHomeDepartment(
  options: Pick<TaskOptionsResponse, 'me' | 'departments'>,
  fromUrl: string | null,
  stored: string | null,
): string | undefined {
  const valid = (v: string | null) => (v === 'all' || (v && options.departments.some((d) => d.id === v)) ? v : null);
  if (!options.me.isAdmin) return undefined;
  const url = fromUrl === 'todos' ? 'all' : valid(fromUrl);
  return url ?? valid(stored) ?? options.me.department?.id ?? 'all';
}
