import { useEffect, useId, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import type { CredentialUpdateInput } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Input, Label } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Mode = 'stored' | 'editing' | 'removing';

/**
 * An encrypted access of a client in the finance form (spec §13.8.1). Never prefilled: a stored value
 * shows "•••••••• cadastrado" with "Alterar" (an empty field) and "Remover" ("Será removido ao
 * salvar." with "Desfazer"). The form sends `{ action: 'keep' | 'set' | 'clear' }`, so the stored
 * value never travels to the page. What is typed lives only in this input until saving.
 */
export function SecretInput({
  label,
  hint,
  stored,
  value,
  onChange,
  error,
  disabled,
  resetKey,
}: {
  label: string;
  hint: string;
  /** Whether a value is stored (the client's `credentials` flag). */
  stored: boolean;
  value: CredentialUpdateInput | undefined;
  onChange: (v: CredentialUpdateInput) => void;
  error?: string;
  disabled?: boolean;
  /** Changes when the form opens for another client (back to the initial state). */
  resetKey: string;
}) {
  const id = useId();
  const [mode, setMode] = useState<Mode>(stored ? 'stored' : 'editing');
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    setMode(stored ? 'stored' : 'editing');
    setVisible(false);
  }, [stored, resetKey]);
  const typed = value?.action === 'set' ? value.value : '';

  return (
    <div className="flex flex-col gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      {mode === 'stored' ? (
        <div className="flex h-11 flex-wrap items-center gap-x-3 rounded-[10px] border border-border bg-surface-muted px-3 text-sm">
          <span className="tabular tracking-widest text-muted" id={id}>
            ••••••••
          </span>
          <span className="text-muted">cadastrado</span>
          {!disabled ? (
            <span className="ml-auto flex gap-3">
              <button
                type="button"
                className="text-body-sm font-semibold text-brand-text underline-offset-4 hover:underline"
                onClick={() => {
                  setMode('editing');
                  onChange({ action: 'keep' });
                  requestAnimationFrame(() => document.getElementById(id)?.focus());
                }}
              >
                Alterar
              </button>
              <button
                type="button"
                className="text-body-sm font-semibold text-danger underline-offset-4 hover:underline"
                onClick={() => {
                  setMode('removing');
                  onChange({ action: 'clear' });
                }}
              >
                Remover
              </button>
            </span>
          ) : null}
        </div>
      ) : mode === 'removing' ? (
        <div className="flex h-11 items-center gap-3 rounded-[10px] border border-danger/30 bg-danger-soft px-3 text-sm" id={id}>
          <span className="text-danger">Será removido ao salvar.</span>
          <button
            type="button"
            className="ml-auto text-body-sm font-semibold text-brand-text underline-offset-4 hover:underline"
            onClick={() => {
              setMode('stored');
              onChange({ action: 'keep' });
            }}
          >
            Desfazer
          </button>
        </div>
      ) : (
        <div className="relative">
          <Input
            id={id}
            type={visible ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            disabled={disabled}
            className={cn('pr-11', visible && 'font-mono')}
            value={typed}
            maxLength={200}
            aria-invalid={error ? true : undefined}
            aria-describedby={`${id}-hint`}
            placeholder={stored ? 'Novo valor' : undefined}
            onChange={(e) => onChange(e.target.value ? { action: 'set', value: e.target.value } : { action: 'keep' })}
          />
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="absolute top-1/2 right-1.5 -translate-y-1/2"
            aria-label={visible ? 'Ocultar o que foi digitado' : 'Mostrar o que foi digitado'}
            aria-pressed={visible}
            onClick={() => setVisible((v) => !v)}
          >
            {visible ? <EyeOff /> : <Eye />}
          </Button>
        </div>
      )}
      {error ? (
        <p role="alert" className="text-xs font-medium text-danger">
          {error}
        </p>
      ) : (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {mode === 'editing' && stored ? 'Deixe vazio para manter o valor atual. ' : ''}
          {hint}
          {mode === 'editing' && stored ? (
            <>
              {' '}
              <button type="button" className="font-semibold text-brand-text underline-offset-4 hover:underline" onClick={() => { setMode('stored'); onChange({ action: 'keep' }); }}>
                Cancelar alteração
              </button>
            </>
          ) : null}
        </p>
      )}
    </div>
  );
}
