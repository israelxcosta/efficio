import { useEffect, useRef, useState } from 'react';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { useQueryClient } from '@tanstack/react-query';
import { LogOut, ShieldCheck } from 'lucide-react';
import { toast } from 'sonner';
import type { MfaSetupResponse } from '@effinance/shared';
import { Button } from '@/components/ui/button';
import { CodeInput } from '@/components/ui/code-input';
import { ErrorState } from '@/components/ui/misc';
import { SkeletonRows } from '@/components/ui/skeleton';
import { FullPageLoader } from '@/components/layout/app-shell';
import { landingPath } from '@/components/layout/area-memory';
import { safeInternalPath } from '@/lib/safe-url';
import { useAuth } from '../auth-context';
import { useMfaEnable, useMfaSetup } from '../api';
import { MfaQrCode, MfaStep, RecoveryCodes } from '../mfa-parts';
import { submitMfaEnrollment } from '../mfa-enrollment';
import { AuthLayout } from './auth-layout';
import { PasswordInput } from './login';

/**
 * Mandatory two-step verification (`REQUIRE_MFA`): who signs in without it lands here (after the
 * login, or on a 403 `mfa_enrollment_required` from any request) and only leaves enrolled or signed out.
 */
export default function MfaEnrollmentPage() {
  const { user, workspace, loading, mfaEnrollmentPending, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const qc = useQueryClient();
  // Only in-app paths (the shell passes the address the person wanted).
  const from = safeInternalPath((location.state as { from?: unknown } | null)?.from);

  const setup = useMfaSetup();
  const enable = useMfaEnable();
  const [data, setData] = useState<MfaSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [codeError, setCodeError] = useState<string | null>(null);
  // The password is asked only when the login is no longer recent (422 `reauthRequired`).
  const [needPassword, setNeedPassword] = useState(false);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [recoveryCodes, setRecoveryCodes] = useState<string[] | null>(null);
  const [saved, setSaved] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const passwordRef = useRef<HTMLInputElement>(null);
  const started = useRef(false);

  const signedIn = Boolean(user);
  const { mutate: startSetup } = setup;
  useEffect(() => {
    if (!signedIn || !mfaEnrollmentPending || started.current) return;
    started.current = true;
    startSetup(undefined, { onSuccess: setData });
  }, [signedIn, mfaEnrollmentPending, startSetup]);

  useEffect(() => {
    if (needPassword) passwordRef.current?.focus();
  }, [needPassword]);

  if (loading) return <FullPageLoader />;
  if (!user) return <Navigate to="/login" replace />;
  // Nothing to enroll (already enabled, or not required): back to the app. The recovery codes stay on
  // screen until the person confirms having saved them.
  if (!mfaEnrollmentPending && !recoveryCodes) return <Navigate to={landingPath(from, workspace?.role)} replace />;

  async function confirm(value = code) {
    setCodeError(null);
    setPasswordError(null);
    // The mutation keeps its variables (code and password) in memory until reset.
    const outcome = await submitMfaEnrollment({ code: value, password, needPassword }, enable.mutateAsync).finally(() => enable.reset());
    if (outcome.kind === 'enabled') {
      setRecoveryCodes(outcome.recoveryCodes);
      setPassword('');
      // The same session is released right away: reload it and whatever was refused meanwhile.
      void qc.invalidateQueries();
    } else if (outcome.kind === 'reauth') {
      setNeedPassword(true);
      passwordRef.current?.focus();
    } else if (outcome.field === 'password') {
      setPasswordError(outcome.message);
      if (password) setPassword('');
      passwordRef.current?.focus();
    } else {
      setCodeError(outcome.message);
      if (value.length === 6) setCode('');
    }
  }

  async function signOut() {
    setLeaving(true);
    try {
      await logout();
    } catch {
      // The local session is cleared anyway (see `logout`).
    }
  }

  const footer = (
    <Button variant="ghost" size="sm" onClick={() => void signOut()} loading={leaving}>
      <LogOut /> Sair
    </Button>
  );

  if (recoveryCodes) {
    return (
      <AuthLayout
        title="Guarde seus códigos de recuperação"
        subtitle="Cada código funciona uma única vez, caso você perca o acesso ao aplicativo. Eles não serão mostrados de novo."
        footer={null}
      >
        <div className="flex flex-col gap-5">
          <RecoveryCodes codes={recoveryCodes} saved={saved} onSavedChange={setSaved} />
          <Button
            size="lg"
            disabled={!saved}
            onClick={() => {
              toast.success('Verificação em duas etapas ativada');
              navigate(landingPath(from, workspace?.role), { replace: true });
            }}
          >
            Continuar
          </Button>
        </div>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title="Ative a verificação em duas etapas"
      subtitle="Para proteger os dados dos clientes, o escritório exige, além da senha, um código do aplicativo autenticador do seu celular."
      footer={footer}
    >
      {setup.isError ? (
        <ErrorState error={setup.error} onRetry={() => startSetup(undefined, { onSuccess: setData })} />
      ) : !data ? (
        <SkeletonRows rows={4} />
      ) : (
        <form
          className="flex flex-col gap-6"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            void confirm();
          }}
        >
          <MfaStep n={1} title="Escaneie o QR code">
            <p className="mt-1 text-[13px] text-muted">Use Google Authenticator, Microsoft Authenticator, 1Password ou similar.</p>
            <MfaQrCode data={data} stacked />
          </MfaStep>
          <MfaStep n={2} title="Digite o código de 6 dígitos">
            <div className="mt-3 flex flex-col gap-1.5">
              <CodeInput
                value={code}
                onChange={setCode}
                onComplete={(v) => {
                  if (!needPassword || password) void confirm(v);
                }}
                invalid={!!codeError}
                disabled={enable.isPending}
              />
              {codeError ? (
                <p role="alert" className="text-xs font-medium text-danger">
                  {codeError}
                </p>
              ) : null}
            </div>
          </MfaStep>
          {needPassword ? (
            <MfaStep n={3} title="Confirme sua senha">
              <p className="mt-1 text-[13px] text-muted">Por segurança, como o login não é recente, confirme a senha para ativar.</p>
              <div className="mt-3 flex flex-col gap-1.5">
                <PasswordInput
                  ref={passwordRef}
                  show={showPassword}
                  onToggle={() => setShowPassword((v) => !v)}
                  autoComplete="current-password"
                  aria-label="Senha atual"
                  aria-invalid={passwordError ? true : undefined}
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
          ) : null}
          <Button type="submit" size="lg" loading={enable.isPending}>
            <ShieldCheck /> Ativar e continuar
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
