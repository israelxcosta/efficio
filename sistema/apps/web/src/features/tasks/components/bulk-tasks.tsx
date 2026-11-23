import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { CircleCheck, UserRound, X } from 'lucide-react';
import type { Task, TaskStatus } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { api } from '@/lib/api';
import { toastError } from '@/lib/notify';
import { pluralize } from '@/lib/utils';
import { invalidateTasks, useTaskMembers } from '../api';

// Bulk actions on the task list ("Selecionar"): conclude or reassign the chosen open tasks. Each change
// goes through the same routes as one by one (permissions and process steps included); the toast offers
// "Desfazer", which restores each task's previous status or responsible. Ready for the client portal:
// requests arriving from it are tasks like any other, so the team triages them here in bulk.

/** Tasks a bulk action can take: open ones (not concluded nor canceled). */
export function bulkSelectable(task: Task): boolean {
  return task.status !== 'done' && task.status !== 'canceled';
}

export function TaskSelectionBar({ tasks, onClear }: { tasks: Task[]; onClear: () => void }) {
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [reassigning, setReassigning] = useState(false);
  if (tasks.length === 0) return null;

  async function run(label: string, apply: (t: Task) => Promise<void>, undo: (t: Task) => Promise<void>) {
    setBusy(true);
    const done: Task[] = [];
    const failed: string[] = [];
    for (const t of tasks) {
      try {
        await apply(t);
        done.push(t);
      } catch {
        failed.push(t.title);
      }
    }
    setBusy(false);
    onClear();
    void invalidateTasks(qc, { change: 'status' });
    if (failed.length) toast.error(`${pluralize(failed.length, 'tarefa não foi alterada', 'tarefas não foram alteradas')}`, { description: failed.slice(0, 3).join(' · ') });
    if (done.length) {
      toast.success(`${pluralize(done.length, 'tarefa', 'tarefas')} ${label}`, {
        duration: 8000,
        action: {
          label: 'Desfazer',
          onClick: () => {
            void Promise.all(done.map(undo)).then(
              () => {
                void invalidateTasks(qc, { change: 'status' });
                toast.info('Alteração desfeita');
              },
              (error) => toastError(error),
            );
          },
        },
      });
    }
  }

  const setStatus = (t: Task, status: TaskStatus) => api(`/tasks/${t.id}/status`, { method: 'PATCH', body: { status } }).then(() => undefined);

  return (
    <>
      <div className="sticky bottom-24 z-[3] mx-auto mb-2 flex w-fit max-w-full items-center gap-2 rounded-xl border border-border bg-surface px-3 py-2 shadow-lg">
        <span className="pr-1 text-body-sm font-semibold text-fg">{pluralize(tasks.length, 'selecionada', 'selecionadas')}</span>
        <Button size="toolbar" disabled={busy} onClick={() => run(tasks.length === 1 ? 'concluída' : 'concluídas', (t) => setStatus(t, 'done'), (t) => setStatus(t, t.status))}>
          <CircleCheck /> Concluir
        </Button>
        <Button variant="outline" size="toolbar" disabled={busy} onClick={() => setReassigning(true)}>
          <UserRound /> Reatribuir
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Limpar seleção" onClick={onClear}>
          <X />
        </Button>
      </div>
      <ReassignDialog
        open={reassigning}
        count={tasks.length}
        onClose={() => setReassigning(false)}
        onConfirm={(assigneeId) => {
          setReassigning(false);
          void run(
            tasks.length === 1 ? 'reatribuída' : 'reatribuídas',
            (t) => api(`/tasks/${t.id}`, { method: 'PATCH', body: { assigneeId } }).then(() => undefined),
            (t) => (t.assignee ? api(`/tasks/${t.id}`, { method: 'PATCH', body: { assigneeId: t.assignee.id } }).then(() => undefined) : Promise.resolve()),
          );
        }}
      />
    </>
  );
}

function ReassignDialog({ open, count, onClose, onConfirm }: { open: boolean; count: number; onClose: () => void; onConfirm: (assigneeId: string) => void }) {
  const members = useTaskMembers({ enabled: open });
  const [assigneeId, setAssigneeId] = useState('');
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !o && onClose()}
      title="Reatribuir tarefas"
      description={pluralize(count, 'tarefa selecionada', 'tarefas selecionadas')}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button disabled={!assigneeId} onClick={() => onConfirm(assigneeId)}>
            Reatribuir
          </Button>
        </>
      }
    >
      <Field label="Novo responsável">
        <Select value={assigneeId} onChange={(e) => setAssigneeId(e.target.value)}>
          <option value="">Escolha uma pessoa</option>
          {(members.data ?? []).map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
              {m.department ? ` · ${m.department.name}` : ''}
            </option>
          ))}
        </Select>
      </Field>
    </Modal>
  );
}
