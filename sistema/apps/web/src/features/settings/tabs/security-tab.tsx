import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { KeyRound, LogOut, Monitor, ShieldCheck, ShieldOff, Smartphone } from 'lucide-react';
import { toast } from 'sonner';
import { z } from 'zod';
import { newPasswordSchema, type MfaSetupResponse, type SessionInfo } from '@effinance/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardHeader } from '@/components/ui/card';
import { CodeInput } from '@/components/ui/code-input';
import { ConfirmDialog, Modal } from '@/components/ui/dialog';
import { Field, Input } from '@/components/ui/input';
import { ErrorState } from '@/components/ui/misc';
import { Sheet } from '@/components/ui/sheet';
import { SkeletonRows } from '@/components/ui/skeleton';
import { ApiRequestError, errorMessage } from '@/lib/api';
import { formatDateTime, formatRelative } from '@/lib/datetime';
import { toastError } from '@/lib/notify';
import { useAuth } from '@/features/auth/auth-context';
import { useChangePassword, useMfaDisable, useMfaEnable, useMfaSetup, useRevokeSession, useSessions } from '@/features/auth/api';
import { PasswordChecklist } from '@/features/auth/password-checklist';
import { MfaQrCode, MfaStep, RecoveryCodes } from '@/features/auth/mfa-parts';
import { PasswordInput } from '@/features/auth/pages/login';
import { Cell, TabGrid } from './layout';

export function SecurityTab() {
  return (
    <TabGrid>
      <Cell>
        <ChangePasswordCard />
      </Cell>
      <Cell>
        <TwoFactorCard />
      </Cell>
      <Cell wide>
        <SessionsCard />
      </Cell>
      <Cell wide>
        <LogoutCard />
      </Cell>
    </TabGrid>
  );
}

const passwordForm = z
  .object({
    currentPassword: z.string().min(1, { message: 'Informe a senha atual' }),
    newPassword: newPasswordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, { message: 'As senhas não conferem', path: ['confirm'] })
  .refine((v) => v.newPassword !== v.currentPassword, { message: 'Use uma senha diferente da atual', path: ['newPassword'] });

function ChangePasswordCard() {
  const change = useChangePassword();
  const [show, setShow] = useState(false);
  const form = useForm<z.input<typeof passwordForm>, unknown, z.output<typeof passwordForm>>({
    resolver: zodResolver(passwordForm),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const onSubmit = form.handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      form.reset();
      toast.success('Senha alterada. As sessões em outros dispositivos foram encerradas.');
    } catch (error) {
      toastError(error);
    } finally {
      // The mutation keeps its variables (both passwords) in memory until reset.
      change.reset();
    }
  });

  return (
    <Card className="p-6">
      <CardHeader title="Senha" subtitle="Ao trocar a senha, as sessões em outros dispositivos são encerradas." icon={<KeyRound />} />
      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
        <Field label="Senha atual" error={form.formState.errors.currentPassword?.message} className="sm:max-w-[calc(50%-6px)]">
          <PasswordInput show={show} onToggle={() => setShow((s) => !s)} autoComplete="current-password" {...form.register('currentPassword')} />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Nova senha" error={form.formState.errors.newPassword?.message}>
            <PasswordInput show={show} onToggle={() => setShow((s) => !s)} autoComplete="new-password" {...form.register('newPassword')} />
          </Field>
          <Field label="Confirme a nova senha" error={form.formState.errors.confirm?.message}>
            <PasswordInput show={show} onToggle={() => setShow((s) => !s)} autoComplete="new-password" {...form.register('confirm')} />
          </Field>
        </div>
        <PasswordChecklist value={form.watch('newPassword') ?? ''} />
        <div>
          <Button type="submit" loading={form.formState.isSubmitting}>
            Alterar senha
          </Button>
        </div>
      </form>
    </Card>
  );
}

function TwoFactorCard() {
  const { user, mfaRequired } = useAuth();
  const [setupOpen, setSetupOpen] = useState(false);
  const [disableOpen, setDisableOpen] = useState(false);
  const enabled = Boolean(user?.mfaEnabled);

  return (
    <Card className="p-6">
      <CardHeader
        title="Verificação em duas etapas"
        subtitle="Além da senha, pede um código do aplicativo autenticador (Google Authenticator, Microsoft Authenticator, 1Password…)."
        action={enabled ? <Badge tone="success" size="md"><ShieldCheck /> Ativa</Badge> : <Badge tone="neutral" size="md">Desativada</Badge>}
      />
      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-surface-muted px-4 py-3">
        <p className="max-w-lg text-[13px] text-muted">
          {enabled && mfaRequired
            ? 'Obrigatória neste escritório: sua conta pede o código do aplicativo a cada novo login. Trocou de celular? Cadastre o novo aqui.'
            : enabled
            ? 'Sua conta pede o código do aplicativo a cada novo login. Guarde os códigos de recuperação para não perder o acesso.'
            : 'Recomendado: mesmo que alguém descubra sua senha, não conseguirá entrar sem o seu celular.'}
        </p>
        {enabled ? (
          mfaRequired ? (
            <Button variant="outline" onClick={() => setDisableOpen(true)}>
              <Smartphone /> Trocar de celular
            </Button>
          ) : (
            <Button variant="danger-soft" onClick={() => setDisableOpen(true)}>
              <ShieldOff /> Desativar
            </Button>
          )
        ) : (
          <Button onClick={() => setSetupOpen(true)}>
            <ShieldCheck /> Ativar
          </Button>
        )}
      </div>
      <MfaSetupSheet open={setupOpen} onOpenChange={setSetupOpen} />
      <DisableMfaDialog open={disableOpen} onOpenChange={setDisableOpen} required={mfaRequired} />
    </Card>
  );
}

function MfaSetupSheet({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const { refreshMe } = useAuth();
  const setup = useMfaSetup();
  const enable = useMfaEnable();
  const [data, setData] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  // The API asks for the password so a stolen session can't enroll the attacker's authenticator.
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const started = useRef(false);

  const { mutate: startSetup, reset: resetSetup } = setup;
  const { reset: resetEnable } = enable;
  useEffect(() => {
    if (!open) {
      started.current = false;
      // The secret (QR code) and the recovery codes are shown once: drop them from memory, including
      // the mutation results, once the sheet has closed (after its 200 ms exit animation).
      const timer = setTimeout(() => {
        setData(null);
        setCode('');
        setPassword('');
        setRecoveryCodes(null);
        setSaved(false);
        resetSetup();
        resetEnable();
      }, 300);
      return () => clearTimeout(timer);
    }
    if (started.current) return;
    started.current = true;
    setData(null);
    setCode('');
    setCodeError(null);
    setPassword('');
    setPasswordError(null);
    setRecoveryCodes(null);
    setSaved(false);
    startSetup(undefined, { onSuccess: setData });
  }, [open, startSetup, resetSetup, resetEnable]);

  async function confirm(value = code) {
    if (!password) {
      setPasswordError('Informe sua senha atual.');
      return;
    }
    setPasswordError(null);
    if (!/^\d{6}$/.test(value)) {
      setCodeError('Digite os 6 dígitos do aplicativo.');
      return;
    }
    setCodeError(null);
    try {
      const res = await enable.mutateAsync({ code: value, password });
      setRecoveryCodes(res.recoveryCodes);
      setPassword('');
      void refreshMe();
    } catch (error) {
      // The API answers 422 "Senha incorreta" for the password; other errors belong to the code.
      if (error instanceof ApiRequestError && error.status === 422 && /senha/i.test(error.message)) {
        setPasswordError(error.message);
        setPassword('');
      } else {
        setCodeError(errorMessage(error));
      }
      setCode('');
    }
  }

  const done = Boolean(recoveryCodes);

  return (
    <Sheet
      open={open}
      onOpenChange={(o) => {
        // Closing before saving the recovery codes would lose them for good.
        if (!o && done && !saved) {
          toast.warning('Marque que guardou os códigos de recuperação antes de fechar.');
          return;
        }
        onOpenChange(o);
      }}
      title={done ? 'Guarde seus códigos de recuperação' : 'Ativar verificação em duas etapas'}
      description={
        done
          ? 'Cada código funciona uma única vez, caso você perca o acesso ao aplicativo. Eles não serão mostrados de novo.'
          : 'Escaneie o QR code no aplicativo autenticador e digite o código gerado.'
      }
      footer={
        done ? (
          <Button
            disabled={!saved}
            onClick={() => {
              toast.success('Verificação em duas etapas ativada');
              onOpenChange(false);
            }}
          >
            Concluir
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button onClick={() => void confirm()} loading={enable.isPending} disabled={!data}>
              Ativar
            </Button>
          </>
        )
      }
    >
      {done && recoveryCodes ? (
        <RecoveryCodes codes={recoveryCodes} saved={saved} onSavedChange={setSaved} />
      ) : setup.isError ? (
        <ErrorState error={setup.error} onRetry={() => setup.mutate(undefined, { onSuccess: setData })} />
      ) : !data ? (
        <SkeletonRows rows={3} />
      ) : (
        <div className="flex flex-col gap-5">
          <MfaStep n={1} title="Escaneie o QR code">
            <MfaQrCode data={data} />
          </MfaStep>
          <MfaStep n={2} title="Confirme sua senha">
            <div className="mt-3 flex max-w-xs flex-col gap-1.5">
              <PasswordInput
                show={showPassword}
                onToggle={() => setShowPassword((v) => !v)}
                autoComplete="current-password"
                aria-label="Senha atual"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {passwordError ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {passwordError}
                </p>
              ) : null}
            </div>
          </MfaStep>
          <MfaStep n={3} title="Digite o código de 6 dígitos">
            <div className="mt-3 flex max-w-xs flex-col gap-1.5">
              <CodeInput value={code} onChange={setCode} onComplete={(v) => void confirm(v)} invalid={!!codeError} disabled={enable.isPending} />
              {codeError ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {codeError}
                </p>
              ) : null}
            </div>
          </MfaStep>
        </div>
      )}
    </Sheet>
  );
}

/**
 * With the verification mandatory (`mfaRequired`) turning it off is "changing phones": the current
 * authenticator goes and the app sends the person straight to the enrollment of the new one.
 */
function DisableMfaDialog({ open, onOpenChange, required }: { open: boolean; onOpenChange: (open: boolean) => void; required: boolean }) {
  const disable = useMfaDisable();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    const value = code.trim();
    if (!/^(\d{6}|[A-Za-z0-9]{4}-[A-Za-z0-9]{4})$/.test(value)) {
      setError('Digite o código de 6 dígitos ou um código de recuperação.');
      return;
    }
    try {
      await disable.mutateAsync({ code: value });
      toast.success(required ? 'Celular anterior desvinculado. Agora cadastre o novo.' : 'Verificação em duas etapas desativada');
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  return (
    <Modal
      open={open}
      onOpenChange={(o) => {
        if (o) {
          setCode('');
          setError(null);
        }
        onOpenChange(o);
      }}
      title={required ? 'Trocar de celular?' : 'Desativar verificação em duas etapas?'}
      description={
        required
          ? 'A verificação em duas etapas é obrigatória neste escritório: o celular atual deixa de valer e, em seguida, você cadastra o novo. Confirme com um código do aplicativo atual ou de recuperação.'
          : 'Sua conta ficará protegida apenas pela senha. Confirme com um código do aplicativo ou de recuperação.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button variant={required ? 'primary' : 'danger'} loading={disable.isPending} onClick={() => void submit()}>
            {required ? 'Continuar' : 'Desativar'}
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
      >
        <Field label="Código" error={error ?? undefined}>
          <Input
            autoFocus
            inputMode="text"
            autoComplete="one-time-code"
            placeholder="000000 ou xxxx-xxxx"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            className="tabular tracking-widest"
          />
        </Field>
      </form>
    </Modal>
  );
}

/** "Chrome no Windows" from a user agent (good enough for recognizing one's own devices). */
export function describeDevice(ua: string | null): { label: string; mobile: boolean } {
  if (!ua) return { label: 'Dispositivo desconhecido', mobile: false };
  const browser = /Edg\//.test(ua)
    ? 'Edge'
    : /OPR\//.test(ua)
      ? 'Opera'
      : /Firefox\//.test(ua)
        ? 'Firefox'
        : /Chrome\//.test(ua)
          ? 'Chrome'
          : /Safari\//.test(ua)
            ? 'Safari'
            : 'Navegador';
  const os = /iPhone|iPad/.test(ua)
    ? /iPad/.test(ua)
      ? 'iPad'
      : 'iPhone'
    : /Android/.test(ua)
      ? 'Android'
      : /Windows/.test(ua)
        ? 'Windows'
        : /Mac OS X|Macintosh/.test(ua)
          ? 'macOS'
          : /Linux/.test(ua)
            ? 'Linux'
            : null;
  return { label: os ? `${browser} no ${os}` : browser, mobile: /Mobile|iPhone|Android/.test(ua) };
}

function SessionsCard() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const [target, setTarget] = useState<SessionInfo | 'others' | null>(null);
  const others = (sessions.data ?? []).filter((s) => !s.current);

  async function confirm() {
    if (!target) return;
    try {
      if (target === 'others') {
        for (const s of others) await revoke.mutateAsync(s.id);
        toast.success('As outras sessões foram encerradas');
      } else {
        await revoke.mutateAsync(target.id);
        toast.success('Sessão encerrada');
      }
      setTarget(null);
    } catch (error) {
      toastError(error);
    }
  }

  return (
    <Card className="p-6">
      <CardHeader
        title="Sessões ativas"
        subtitle="Dispositivos conectados à sua conta. Encerre os que você não reconhece."
        action={
          others.length > 0 ? (
            <Button variant="outline" size="sm" onClick={() => setTarget('others')}>
              Encerrar todas as outras
            </Button>
          ) : undefined
        }
      />
      <div className="mt-4">
        {sessions.isPending ? (
          <SkeletonRows rows={2} />
        ) : sessions.isError ? (
          <ErrorState error={sessions.error} onRetry={() => sessions.refetch()} />
        ) : (
          <ul className="flex flex-col divide-y divide-border">
            {[...sessions.data].sort((a, b) => Number(b.current) - Number(a.current)).map((s) => {
              const device = describeDevice(s.userAgent);
              const Icon = device.mobile ? Smartphone : Monitor;
              return (
                <li key={s.id} className="flex items-center gap-3 py-3">
                  <span className="flex size-10 shrink-0 items-center justify-center rounded-md bg-bg-subtle text-muted">
                    <Icon className="size-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-semibold">
                      {device.label}
                      {s.current ? <Badge tone="success">Este dispositivo</Badge> : null}
                    </p>
                    <p className="text-xs text-muted">
                      {s.ip ? `${s.ip} · ` : ''}
                      {s.current ? 'Ativa agora' : `Último uso ${formatRelative(s.lastUsedAt)}`} · desde {formatDateTime(s.createdAt)}
                    </p>
                  </div>
                  {s.current ? null : (
                    <Button variant="ghost" size="sm" onClick={() => setTarget(s)}>
                      Encerrar
                    </Button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </div>
      <ConfirmDialog
        open={target !== null}
        onOpenChange={(o) => !o && setTarget(null)}
        title={target === 'others' ? 'Encerrar as outras sessões?' : 'Encerrar sessão?'}
        description={
          target === 'others'
            ? `${others.length} ${others.length === 1 ? 'dispositivo precisará' : 'dispositivos precisarão'} entrar novamente.`
            : target
              ? `${describeDevice(target.userAgent).label} precisará entrar novamente.`
              : undefined
        }
        confirmLabel="Encerrar"
        loading={revoke.isPending}
        onConfirm={() => void confirm()}
      />
    </Card>
  );
}

function LogoutCard() {
  const { logout } = useAuth();
  const navigate = useNavigate();
  return (
    <Card className="flex flex-wrap items-center justify-between gap-4 p-6">
      <div>
        <h2 className="text-[15px] font-semibold">Sair da conta</h2>
        <p className="text-xs text-muted">Encerra a sessão neste dispositivo.</p>
      </div>
      <Button
        variant="danger-soft"
        onClick={async () => {
          await logout();
          navigate('/login', { replace: true });
        }}
      >
        <LogOut /> Sair
      </Button>
    </Card>
  );
}
