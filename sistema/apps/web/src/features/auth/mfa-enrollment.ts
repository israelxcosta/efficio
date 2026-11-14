import type { MeResponse, MfaCodeInput, MfaEnableResponse } from '@effinance/shared';
import { ApiRequestError, errorMessage } from '@/lib/api';

// Mandatory two-step verification (`REQUIRE_MFA`): who has none yet only reaches the enrollment screen.

/** The enrollment screen, outside the app shell (like the login). */
export const MFA_ENROLLMENT_PATH = '/verificacao-em-duas-etapas';

/** The session is limited to the enrollment: the server requires 2FA and the account has none. */
export function needsMfaEnrollment(me: MeResponse | null | undefined): boolean {
  return Boolean(me?.mfaRequired && !me.user.mfaEnabled);
}

/**
 * The server said so (`mfaEnrollmentRequired` at login/registration, or a 403
 * `mfa_enrollment_required` from any request) before `me` caught up: mark the cached session.
 */
export function markMfaEnrollmentRequired(me: MeResponse | null | undefined): MeResponse | null {
  if (!me) return me ?? null;
  if (needsMfaEnrollment(me)) return me;
  return { ...me, mfaRequired: true, user: { ...me.user, mfaEnabled: false } };
}

/** `/auth/mfa/enable` long after the login: 422 with `details.reauthRequired`, ask for the password. */
export function isReauthRequired(error: unknown): boolean {
  if (!(error instanceof ApiRequestError) || error.status !== 422) return false;
  const details = error.details as { reauthRequired?: unknown } | null | undefined;
  return details?.reauthRequired === true;
}

export type EnrollmentOutcome =
  | { kind: 'enabled'; recoveryCodes: string[] }
  /** Ask for the password and submit again. */
  | { kind: 'reauth' }
  | { kind: 'error'; field: 'code' | 'password'; message: string };

/**
 * One submission of the enrollment screen: the code, plus the password once the API asked for it
 * (`reauthRequired`). Errors are told next to the field they belong to.
 */
export async function submitMfaEnrollment(
  input: { code: string; password: string; needPassword: boolean },
  enable: (body: MfaCodeInput) => Promise<MfaEnableResponse>,
): Promise<EnrollmentOutcome> {
  if (!/^\d{6}$/.test(input.code)) return { kind: 'error', field: 'code', message: 'Digite os 6 dígitos do aplicativo.' };
  if (input.needPassword && !input.password) return { kind: 'error', field: 'password', message: 'Informe sua senha.' };
  try {
    const res = await enable(input.needPassword ? { code: input.code, password: input.password } : { code: input.code });
    return { kind: 'enabled', recoveryCodes: res.recoveryCodes };
  } catch (error) {
    if (isReauthRequired(error)) return { kind: 'reauth' };
    // 422 "Senha incorreta" belongs to the password; other errors to the code.
    if (error instanceof ApiRequestError && error.status === 422 && /senha/i.test(error.message)) {
      return { kind: 'error', field: 'password', message: error.message };
    }
    return { kind: 'error', field: 'code', message: errorMessage(error) };
  }
}
