import { useState } from 'react';
import { toast } from 'sonner';
import type { ClientResponsible, TaskMember, TaskMemberRef, TaskRef } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/input';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Select } from '@/components/ui/select';
import { toastError } from '@/lib/notify';
import { cn } from '@/lib/utils';
import { useSetClientResponsible } from '../api';
import { firstName, shortName } from '../due';
import { MemberPicker, NONE } from './pickers';

/** Responsible of a client in a department, from the grid of the API. */
export function responsibleOf(items: ClientResponsible[], clientId: string, departmentId: string): TaskMemberRef | null {
  return items.find((i) => i.clientId === clientId && i.departmentId === departmentId)?.user ?? null;
}

/** Saves a responsible at once (optimistic) and offers "Desfazer" (spec §17). */
export function useResponsibleChange() {
  const set = useSetClientResponsible();
  const change = async (
    client: { id: string; name: string },
    department: TaskRef,
    next: TaskMemberRef | null,
    previous: TaskMemberRef | null,
    undo = false,
  ): Promise<boolean> => {
    try {
      await set.mutateAsync({ clientId: client.id, departmentId: department.id, userId: next?.id ?? null });
      if (!undo) {
        toast(`${department.name} de ${client.name}: ${next ? `agora com ${firstName(next.name)}` : 'sem responsável'}.`, {
          duration: 6000,
          action: { label: 'Desfazer', onClick: () => void change(client, department, previous, next, true) },
        });
      }
      return true;
    } catch (error) {
      toastError(error);
      return false;
    }
  };
  return { change, pending: set.isPending };
}

interface ClientResponsibleCellProps {
  client: { id: string; name: string };
  department: TaskRef;
  member: TaskMemberRef | null;
  /** Administrators pick; collaborators read. */
  editable: boolean;
  members: TaskMember[];
  /** Full name (the client sheet) instead of the short one (the list). */
  full?: boolean;
}

/**
 * The client's responsible in one department: avatar and name, or the dashed circle and "Sem
 * responsável" (no alert colour: the summary warns once). For administrators it is a button that
 * opens the member picker, saving at once.
 */
export function ClientResponsibleCell({ client, department, member, editable, members, full }: ClientResponsibleCellProps) {
  const { change, pending } = useResponsibleChange();
  const [busy, setBusy] = useState(false);
  const name = member ? (full ? member.name : shortName(member.name)) : 'Sem responsável';
  const content = (
    <>
      <MemberAvatar name={member?.name} unassigned={!member} />
      <span className={cn('truncate', full ? 'text-body-sm' : 'text-[13px]', member ? 'text-fg' : 'text-subtle')}>{name}</span>
    </>
  );
  const label = `Responsável pelo ${department.name} de ${client.name}: ${member ? member.name : 'ninguém'}.`;
  if (!editable) {
    return (
      <span className="flex min-w-0 items-center gap-1.5" aria-label={label}>
        {content}
      </span>
    );
  }
  return (
    <MemberPicker
      value={member?.id ?? NONE}
      members={members}
      allowNone
      departmentId={department.id}
      onChange={async (v) => {
        const next = v === NONE ? null : (members.find((m) => m.id === v) ?? null);
        if ((next?.id ?? null) === (member?.id ?? null)) return;
        setBusy(true);
        await change(client, department, next ? { id: next.id, name: next.name } : null, member);
        setBusy(false);
      }}
      trigger={
        <button
          type="button"
          aria-label={`${label} Alterar.`}
          aria-busy={busy || pending || undefined}
          onClick={(e) => e.stopPropagation()}
          className={cn(
            '-mx-1 flex min-w-0 max-w-[calc(100%+0.5rem)] items-center gap-1.5 rounded-md px-1 py-1 text-left transition-colors hover:bg-bg-subtle data-[state=open]:bg-bg-subtle',
            busy && 'opacity-70',
          )}
        >
          {content}
        </button>
      }
    />
  );
}

interface AssignResponsibleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  clients: { id: string; name: string }[];
  departments: TaskRef[];
  members: TaskMember[];
  items: ClientResponsible[];
  defaultDepartment?: string;
  onDone: () => void;
}

/**
 * Responsible in batch (spec §13.3). The API saves one client × department at a time, so the dialog
 * sends one request per client; "Desfazer" puts the previous responsibles back.
 */
export function AssignResponsibleDialog({ open, onOpenChange, clients, departments, members, items, defaultDepartment, onDone }: AssignResponsibleDialogProps) {
  const set = useSetClientResponsible();
  const [departmentId, setDepartmentId] = useState(defaultDepartment ?? departments[0]?.id ?? '');
  const [userId, setUserId] = useState('');
  const [saving, setSaving] = useState(false);
  const department = departments.find((d) => d.id === departmentId);
  const member = members.find((m) => m.id === userId);
  const n = clients.length;

  async function apply(targets: { clientId: string; userId: string | null }[]) {
    for (const t of targets) await set.mutateAsync({ clientId: t.clientId, departmentId, userId: t.userId });
  }

  async function submit() {
    if (!department || !userId) return;
    const previous = clients.map((c) => ({ clientId: c.id, userId: responsibleOf(items, c.id, departmentId)?.id ?? null }));
    const next = userId === NONE ? null : userId;
    setSaving(true);
    try {
      await apply(clients.map((c) => ({ clientId: c.id, userId: next })));
      onOpenChange(false);
      onDone();
      toast(next ? `Responsável definido para ${n === 1 ? '1 cliente' : `${n} clientes`}.` : `Responsável removido de ${n === 1 ? '1 cliente' : `${n} clientes`}.`, {
        duration: 6000,
        action: { label: 'Desfazer', onClick: () => void apply(previous).catch(toastError) },
      });
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={onOpenChange}
      title={`Definir responsável para ${n === 1 ? '1 cliente' : `${n} clientes`}`}
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button onClick={() => void submit()} loading={saving} disabled={!department || !userId}>
            Aplicar a {n === 1 ? '1 cliente' : `${n} clientes`}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Departamento">
          <Select value={departmentId} onChange={(e) => setDepartmentId(e.target.value)}>
            {departments.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Responsável">
          <MemberPicker
            value={userId}
            onChange={setUserId}
            members={members}
            allowNone
            noneLabel="Remover responsável"
            departmentId={departmentId}
            placeholder="Escolha a pessoa"
          />
        </Field>
        {department && userId ? (
          <p className="text-body-sm text-fg">
            {userId === NONE
              ? `${n === 1 ? 'O cliente fica' : `Os ${n} clientes ficam`} sem responsável no ${department.name}.`
              : `${member ? firstName(member.name) : 'A pessoa'} passa a responder pelo ${department.name} de ${n === 1 ? '1 cliente' : `${n} clientes`}.`}
          </p>
        ) : null}
      </div>
    </Modal>
  );
}
