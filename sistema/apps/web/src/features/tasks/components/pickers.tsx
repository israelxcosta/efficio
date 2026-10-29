import type { ReactElement } from 'react';
import { TAX_REGIME_LABELS, type TaskClientOption, type TaskMember } from '@effinance/shared';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { SearchSelect, type SearchSelectOption } from '@/components/ui/search-select';

/** Value of "Todos" in filters (empty: no filter). */
export const ALL = '';
/** Value of "Sem responsável" / "Interna". */
export const NONE = 'none';
export const INTERNAL = 'internal';

interface MemberPickerProps {
  value: string;
  onChange: (value: string) => void;
  members: TaskMember[];
  /** "Sem responsável" (value `none`). */
  allowNone?: boolean;
  noneLabel?: string;
  /** "Todos os responsáveis" (value ''). */
  allowAll?: boolean;
  allLabel?: string;
  /** You first, as "Atribuir a mim". */
  meFirst?: boolean;
  /** Members of this department first ("Do Fiscal"), then "Outros membros". */
  departmentId?: string | null;
  size_?: 'sm' | 'md';
  disabled?: boolean;
  placeholder?: string;
  trigger?: ReactElement;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

/** Member options for the pickers, in the order of spec §4.2 (pure, tested). */
export function memberOptions(
  members: TaskMember[],
  { allowNone, noneLabel = 'Sem responsável', allowAll, allLabel = 'Todos os responsáveis', meFirst, departmentId }: Partial<MemberPickerProps>,
): SearchSelectOption[] {
  const out: SearchSelectOption[] = [];
  if (allowAll) out.push({ value: ALL, label: allLabel });
  if (allowNone) out.push({ value: NONE, label: noneLabel, leading: <MemberAvatar unassigned /> });
  const sorted = [...members].sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  const me = meFirst ? sorted.find((m) => m.isYou) : undefined;
  if (me) out.push({ value: me.id, label: `${me.name} (você)`, hint: me.department?.name, leading: <MemberAvatar name={me.name} /> });
  const rest = sorted.filter((m) => m !== me);
  const dept = departmentId ? rest.filter((m) => m.department?.id === departmentId) : [];
  const others = departmentId ? rest.filter((m) => m.department?.id !== departmentId) : rest;
  const deptName = dept[0]?.department?.name;
  const option = (m: TaskMember, group?: string): SearchSelectOption => ({
    value: m.id,
    label: m.name,
    hint: m.department?.name ?? 'Sem departamento',
    leading: <MemberAvatar name={m.name} />,
    group,
  });
  out.push(...dept.map((m) => option(m, deptName ? `Do ${deptName}` : undefined)));
  out.push(...others.map((m) => option(m, dept.length ? 'Outros membros' : undefined)));
  return out;
}

export function MemberPicker({ value, onChange, members, placeholder = 'Responsável', size_ = 'md', ...rest }: MemberPickerProps) {
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={memberOptions(members, rest)}
      placeholder={placeholder}
      searchPlaceholder="Buscar pessoa"
      emptyText="Ninguém com esse nome"
      size_={size_}
      disabled={rest.disabled}
      trigger={rest.trigger}
      className={rest.className}
      id={rest.id}
      aria-label={rest['aria-label']}
      aria-invalid={rest['aria-invalid']}
      aria-describedby={rest['aria-describedby']}
    />
  );
}

interface ClientPickerProps {
  value: string;
  onChange: (value: string) => void;
  clients: TaskClientOption[];
  /** "Interna (sem cliente)" pinned on top (value `internal`). */
  allowInternal?: boolean;
  internalLabel?: string;
  allowAll?: boolean;
  allLabel?: string;
  size_?: 'sm' | 'md';
  disabled?: boolean;
  placeholder?: string;
  className?: string;
  id?: string;
  'aria-label'?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
}

export function clientOptionsFor(
  clients: TaskClientOption[],
  value: string,
  { allowInternal, internalLabel = 'Interna (sem cliente)', allowAll, allLabel = 'Todos os clientes' }: Partial<ClientPickerProps>,
): SearchSelectOption[] {
  const out: SearchSelectOption[] = [];
  if (allowAll) out.push({ value: ALL, label: allLabel });
  if (allowInternal) out.push({ value: INTERNAL, label: internalLabel });
  // Active clients; an inactive one only when it is the current value (an old task).
  const shown = clients
    .filter((c) => c.status === 'active' || c.id === value)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  for (const c of shown) {
    out.push({
      value: c.id,
      label: c.name,
      hint: c.status === 'active' ? TAX_REGIME_LABELS[c.taxRegime] : 'Inativo',
      keywords: c.legalName,
    });
  }
  return out;
}

export function ClientPicker({ value, onChange, clients, placeholder = 'Cliente', size_ = 'md', ...rest }: ClientPickerProps) {
  return (
    <SearchSelect
      value={value}
      onChange={onChange}
      options={clientOptionsFor(clients, value, rest)}
      placeholder={placeholder}
      searchPlaceholder="Buscar cliente"
      emptyText="Nenhum cliente encontrado"
      size_={size_}
      disabled={rest.disabled}
      className={rest.className}
      id={rest.id}
      aria-label={rest['aria-label']}
      aria-invalid={rest['aria-invalid']}
      aria-describedby={rest['aria-describedby']}
    />
  );
}
