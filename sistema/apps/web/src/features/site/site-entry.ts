import { lazy } from 'react';

/** The office's public site (landing page), loaded on demand. */
export const SitePage = lazy(() => import('./pages/site'));

/** Public address of the site, open to everyone (signed in or not). */
export const SITE_PATH = '/site';

export type ShellEntry = 'loading' | 'site' | 'login' | 'mfa' | 'app';

/**
 * What the app shell shows at `pathname`: visitors who are not signed in see the site at `/` and the
 * login anywhere else (the address they wanted is kept for after the login); signed-in users get the
 * app, whose index is the Gestão — or, while the mandatory two-step verification is not enabled
 * (`mfaPending`), the enrollment screen.
 */
export function shellEntry({
  loading,
  signedIn,
  pathname,
  mfaPending = false,
}: {
  loading: boolean;
  signedIn: boolean;
  pathname: string;
  mfaPending?: boolean;
}): ShellEntry {
  if (loading) return 'loading';
  if (signedIn) return mfaPending ? 'mfa' : 'app';
  return pathname === '/' ? 'site' : 'login';
}
