import { useEffect, useState } from 'react';
import type { Member, MemberHandoverCounts } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field } from '@/components/ui/input';
import { MemberAvatar } from '@/components/ui/member-avatar';
import { Select } from '@/components/ui/select';
import { ApiRequestError } from '@/lib/api';
import { pluralize } from '@/lib/utils';

/**
 * The 409 of `DELETE /workspaces/current/members/:userId` when the person still answers for work in
 * the task module (migration 0024): the counts to hand over. Null for any other error.
 */
export function handoverCountsOf(error: unknown): MemberHandoverCounts | null {
  if (!(error instanceof ApiRequestError) || error.status !== 409) return null;
  const d = error.details as
    Partial<Record<keyof MemberHandoverCounts, unknown>> | null | undefined;
  if (!d || typeof d !== 'object') return null;
  const n = (v: unknown) => (typeof v === 'number' && Number.isInteger(v) && v >= 0 ? v : null);
  const openTasks = n(d.openTasks);
  const recurringTasks = n(d.recurringTasks);
  const flowSteps = n(d.flowSteps);
  if (openTasks === null || recurringTasks === null || flowSteps === null) return null;
  return { openTasks, recurringTasks, flowSteps };
}

/** "3 tarefas abertas", "1 tarefa recorrente (responsável padrão)", "2 etapas de processo aguardando". */
export function handoverLines(c: MemberHandoverCounts): string[] {
  return [
    c.openTasks ? pluralize(c.openTasks, 'tarefa aberta', 'tarefas abertas') : null,
    c.recurringTasks
      ? `${pluralize(c.recurringTasks, 'tarefa recorrente', 'tarefas recorrentes')} (responsável padrão)`
      : null,
    c.flowSteps
      ? pluralize(c.flowSteps, 'etapa de processo aguardando', 'etapas de processo aguardando')
      : null,
  ].filter((l): l is string => l !== null);
}

interface MemberHandoverDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Who leaves (removed, or yourself leaving). */
  person: Pick<Member, 'userId' | 'name' | 'isYou'> | null;
  counts: MemberHandoverCounts | null;
  members: Member[];
  busy?: boolean;
  onConfirm: (replacementId: string) => void;
}

/**
 * "Quem assume?": removing (or leaving) with open work hands it all to one member — open tasks,
 * recurring tasks where the person is the default responsible and the process steps still waiting.
 * The removal is sent again with `?replacementId=`.
 */
export function MemberHandoverDialog({
  open,
  onOpenChange,
  person,
  counts,
  members,
  busy,
  onConfirm,
}: MemberHandoverDialogProps) {
  const candidates = members
    .filter((m) => m.userId !== person?.userId)
    .sort((a, b) => a.name.localeCompare(b.name, 'pt-BR'));
  // You first when you are not the one leaving; else the owner.
  const preferred =
    candidates.find((m) => m.isYou) ?? candidates.find((m) => m.role === 'owner') ?? candidates[0];
  const [replacementId, setReplacementId] = useState(preferred?.userId ?? '');
  useEffect(() => {
    if (open) setReplacementId(preferred?.userId ?? '');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, person?.userId]);
  return (
    <Modal
      open={open}
      onOpenChange={(o) => !busy && onOpenChange(o)}
      className="max-w-md"
      title="Quem assume?"
      description="Toda tarefa precisa de um responsável. Escolha quem fica com o trabalho em aberto antes de remover."
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancelar
          </Button>
          <Button
            variant="danger"
            loading={busy}
            disabled={!replacementId}
            onClick={() => onConfirm(replacementId)}
          >
            {person?.isYou ? 'Transferir e sair' : 'Transferir e remover'}
          </Button>
        </>
      }
    >
      <HandoverBody
        person={person}
        counts={counts}
        candidates={candidates}
        value={replacementId}
        onChange={setReplacementId}
        disabled={busy}
      />
    </Modal>
  );
}

/** The body of "Quem assume?" (what the person answers for and the picker), without the modal. */
export function HandoverBody({
  person,
  counts,
  candidates,
  value,
  onChange,
  disabled,
}: {
  person: Pick<Member, 'userId' | 'name' | 'isYou'> | null;
  counts: MemberHandoverCounts | null;
  candidates: Member[];
  value: string;
  onChange: (userId: string) => void;
  disabled?: boolean;
}) {
  const lines = counts ? handoverLines(counts) : [];
  const who = person?.isYou
    ? 'Você ainda responde'
    : `${person?.name ?? 'Esta pessoa'} ainda responde`;
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-lg border border-border bg-surface-muted p-3">
        <p className="flex items-center gap-2 text-body-sm font-medium text-fg">
          {person ? <MemberAvatar name={person.name} userId={person.userId} /> : null}
          {who} por:
        </p>
        <ul
          className="mt-2 flex flex-col gap-1 pl-1 text-body-sm text-fg"
          aria-label="Trabalho em aberto"
        >
          {lines.map((l) => (
            <li key={l} className="tabular">
              • {l}
            </li>
          ))}
        </ul>
      </div>
      <Field
        label="Quem assume"
        hint="As tarefas abertas passam para o departamento dessa pessoa; as das recorrentes ficam no departamento da recorrente. O histórico registra a troca."
      >
        <Select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled || candidates.length === 0}
        >
          {candidates.length === 0 ? <option value="">Nenhum outro membro</option> : null}
          {candidates.map((m) => (
            <option key={m.userId} value={m.userId}>
              {m.isYou ? `${m.name} (você)` : m.name}
            </option>
          ))}
        </Select>
      </Field>
      <p className="text-caption text-muted">
        Tarefas já concluídas ficam no histórico e aparecem como “Ex&#8209;membro” nos relatórios.
      </p>
    </div>
  );
}
