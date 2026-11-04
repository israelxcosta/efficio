import { useRef, useState } from 'react';
import { Plus, X } from 'lucide-react';
import {
  CLIENT_DOCUMENT_GROUPS,
  CLIENT_DOCUMENT_GROUP_LABELS,
  CLIENT_DOCUMENT_KINDS,
  CLIENT_DOCUMENT_KIND_GROUP,
  CLIENT_DOCUMENT_KIND_LABELS,
  CLIENT_DOCUMENT_NOTE_MAX,
  MAX_CLIENT_DOCUMENTS,
  deadlineStatus,
  todayISO,
  type ClientDocumentInput,
  type ClientDocumentKind,
} from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Field, Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import { deadlineClass, deadlineLabel } from '@/features/deadlines/deadline-logic';
import { cn } from '@/lib/utils';

export type DocumentRowErrors = Partial<Record<'kind' | 'customName' | 'expiresAt' | 'note', string>>;

let seq = 0;
const newKey = () => `doc-${++seq}`;

/** The catalog label without the parenthetical, for "Outro…" the name field replaces the type. */
function kindOptions() {
  return CLIENT_DOCUMENT_GROUPS.map((g) => (
    <optgroup key={g} label={CLIENT_DOCUMENT_GROUP_LABELS[g]}>
      {CLIENT_DOCUMENT_KINDS.filter((k) => CLIENT_DOCUMENT_KIND_GROUP[k] === g).map((k) => (
        <option key={k} value={k}>
          {k === 'other' ? 'Outro…' : CLIENT_DOCUMENT_KIND_LABELS[k]}
        </option>
      ))}
    </optgroup>
  ));
}

/**
 * "Documentos com vencimento" of the finance client form (spec §13.8.1): one row per document (type,
 * expiry with its situation, note), up to 50. The list is substitutive when saved.
 */
export function ClientDocumentsEditor({
  value,
  onChange,
  errors,
  disabled,
}: {
  value: ClientDocumentInput[];
  onChange: (docs: ClientDocumentInput[]) => void;
  errors?: (DocumentRowErrors | undefined)[];
  disabled?: boolean;
}) {
  // Stable keys for the rows (every change goes through here, so they stay aligned with `value`).
  const keys = useRef<string[]>([]);
  if (keys.current.length !== value.length) keys.current = value.map((d) => d.id ?? newKey());
  const [today] = useState(todayISO);

  function update(i: number, patch: Partial<ClientDocumentInput>) {
    onChange(value.map((d, j) => (j === i ? { ...d, ...patch } : d)));
  }
  function remove(i: number) {
    keys.current = keys.current.filter((_, j) => j !== i);
    onChange(value.filter((_, j) => j !== i));
  }
  function add() {
    const key = newKey();
    keys.current = [...keys.current, key];
    onChange([...value, { kind: '' as ClientDocumentKind, customName: '', expiresAt: '', note: '' }]);
    requestAnimationFrame(() => document.getElementById(`${key}-kind`)?.focus());
  }

  return (
    <div className="flex flex-col gap-3">
      {value.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border-strong/80 px-4 py-4 text-center text-body-sm text-muted">
          Nenhum documento. Adicione certificados, certidões e alvarás para receber o aviso de vencimento.
        </p>
      ) : (
        <ul className="flex flex-col gap-3 sm:gap-2">
          {value.map((d, i) => {
            const key = keys.current[i]!;
            const err = errors?.[i];
            const status = d.expiresAt ? deadlineStatus(d.expiresAt, today) : null;
            const isOther = d.kind === 'other';
            return (
              <li
                key={key}
                className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-[minmax(0,1.3fr)_10rem_minmax(0,1fr)_auto] sm:items-start sm:rounded-none sm:border-0 sm:p-0"
              >
                <div className="flex min-w-0 flex-col gap-2">
                  <Field label={i === 0 ? 'Tipo' : <span className="sm:sr-only">Tipo</span>} error={err?.kind}>
                    <Select
                      id={`${key}-kind`}
                      value={d.kind ?? ''}
                      disabled={disabled}
                      aria-label={`Tipo do documento ${i + 1}`}
                      onChange={(e) => update(i, { kind: e.target.value as ClientDocumentKind, customName: e.target.value === 'other' ? d.customName : '' })}
                    >
                      <option value="">Escolha o tipo…</option>
                      {kindOptions()}
                    </Select>
                  </Field>
                  {isOther ? (
                    <Field label="Nome do documento*" error={err?.customName}>
                      <Input value={d.customName ?? ''} maxLength={80} disabled={disabled} onChange={(e) => update(i, { customName: e.target.value })} />
                    </Field>
                  ) : null}
                </div>
                <Field label={i === 0 ? 'Vencimento' : <span className="sm:sr-only">Vencimento</span>} error={err?.expiresAt}>
                  <Input type="date" value={d.expiresAt ?? ''} disabled={disabled} aria-label={`Vencimento do documento ${i + 1}`} onChange={(e) => update(i, { expiresAt: e.target.value })} />
                </Field>
                <Field label={i === 0 ? 'Observação' : <span className="sm:sr-only">Observação</span>} error={err?.note}>
                  <Input
                    value={d.note ?? ''}
                    maxLength={CLIENT_DOCUMENT_NOTE_MAX}
                    placeholder="Ex.: A1, emitido pela Certisign"
                    disabled={disabled}
                    aria-label={`Observação do documento ${i + 1}`}
                    onChange={(e) => update(i, { note: e.target.value })}
                  />
                </Field>
                <div className={cn('flex items-center justify-between gap-2 sm:justify-end', i === 0 && 'sm:pt-[26px]')}>
                  {status && (status.bucket === 'overdue' || status.bucket === 'within30') ? (
                    <span className={cn('text-xs sm:hidden', deadlineClass(status))}>{deadlineLabel(status)}</span>
                  ) : (
                    <span className="sm:hidden" />
                  )}
                  {!disabled ? (
                    <Button type="button" variant="ghost" size="icon-sm" className="sm:mt-1.5" aria-label="Remover documento" title="Remover documento" onClick={() => remove(i)}>
                      <X />
                    </Button>
                  ) : null}
                </div>
                {status && (status.bucket === 'overdue' || status.bucket === 'within30') ? (
                  <p className={cn('-mt-1 hidden text-xs sm:col-start-2 sm:block', deadlineClass(status))}>{deadlineLabel(status)}</p>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}
      {!disabled ? (
        <Button type="button" variant="ghost" size="sm" className="self-start" onClick={add} disabled={value.length >= MAX_CLIENT_DOCUMENTS}>
          <Plus /> Adicionar documento
        </Button>
      ) : null}
      {value.length >= MAX_CLIENT_DOCUMENTS ? <p className="text-caption text-muted">Até {MAX_CLIENT_DOCUMENTS} documentos por cliente.</p> : null}
    </div>
  );
}
