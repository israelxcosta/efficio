import { useEffect, useRef, useState } from 'react';
import { REAUTH_REQUIRED_ERROR } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { Modal } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { api, ApiRequestError, errorMessage, onReauthRequired } from '@/lib/api';

/** Whether the API asks for the 2FA code too (`details.mfa` of a 422 `reauth_required`). */
function asksCode(error: unknown): boolean {
  return error instanceof ApiRequestError && (error.details as { mfa?: unknown } | null | undefined)?.mfa === true;
}

/**
 * Step-up before a sensitive action (export, deletions, password, recovery codes): any request answered
 * 422 `reauth_required` opens this dialog; the password (and the 2FA code when asked) go to
 * `/auth/reauthenticate`, and the original request is replayed (lib/api.ts). Mounted once (AuthProvider).
 */
export function ReauthDialog() {
  const [open, setOpen] = useState(false);
  const [needCode, setNeedCode] = useState(false);
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const resolver = useRef<((ok: boolean) => void) | null>(null);

  useEffect(() => {
    onReauthRequired(
      (err) =>
        new Promise<boolean>((resolve) => {
          resolver.current?.(false);
          resolver.current = resolve;
          setNeedCode(asksCode(err));
          setPassword('');
          setCode('');
          setError(null);
          setOpen(true);
        }),
    );
    return () => onReauthRequired(null);
  }, []);

  function finish(ok: boolean) {
    // The password leaves memory with the dialog.
    setPassword('');
    setCode('');
    setOpen(false);
    resolver.current?.(ok);
    resolver.current = null;
  }

  async function submit() {
    if (!password) return setError('Informe sua senha.');
    if (needCode && !code.trim()) return setError('Informe o código do aplicativo ou de recuperação.');
    setPending(true);
    setError(null);
    try {
      await api<void>('/auth/reauthenticate', { method: 'POST', body: { password, ...(needCode ? { code: code.trim() } : {}) } });
      finish(true);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === REAUTH_REQUIRED_ERROR && asksCode(err)) {
        setNeedCode(true);
        setError(null);
      } else setError(errorMessage(err));
    } finally {
      setPending(false);
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (!o) finish(false);
      }}
      title="Confirme que é você"
      description="Por segurança, esta ação pede sua senha novamente."
      footer={
        <>
          <Button variant="ghost" onClick={() => finish(false)}>
            Cancelar
          </Button>
          <Button loading={pending} onClick={() => void submit()}>
            Confirmar
          </Button>
        </>
      }
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
        noValidate
        className="space-y-4"
      >
        <Field label="Senha" error={needCode ? undefined : (error ?? undefined)}>
          <Input autoFocus type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {needCode ? (
          <Field label="Código da verificação em duas etapas" error={error ?? undefined}>
            <Input
              inputMode="text"
              autoComplete="one-time-code"
              placeholder="000000 ou xxxx-xxxx"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="tabular tracking-widest"
            />
          </Field>
        ) : null}
      </form>
    </Modal>
  );
}
