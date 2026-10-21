import type { Contact } from '@effinance/shared';

/**
 * `<optgroup>`s of a contact select: clients first for income, suppliers first for expenses.
 * Inactive clients are left out unless already selected. A plain function (not a component):
 * the design-system Select reads its `<option>`/`<optgroup>` children directly.
 */
export function contactOptions(
  contacts: Contact[],
  { type, selected }: { type?: 'income' | 'expense'; selected?: string | null } = {},
) {
  const visible = contacts.filter((c) => c.status === 'active' || c.id === selected);
  const group = (kind: Contact['kind'], label: string) => {
    const items = visible.filter((c) => c.kind === kind);
    return items.length ? (
      <optgroup key={kind} label={label}>
        {items.map((c) => (
          <option key={c.id} value={c.id}>
            {c.status === 'inactive' ? `${c.name} (inativo)` : c.name}
          </option>
        ))}
      </optgroup>
    ) : null;
  };
  const clients = group('client', 'Clientes');
  const suppliers = group('supplier', 'Fornecedores');
  return type === 'expense' ? [suppliers, clients] : [clients, suppliers];
}
