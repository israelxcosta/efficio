// External services and settings the route plugins need, decorated on the app as `app.platform`.
// Built from the environment by the API (src/setup.ts) and by hand in the browser demo, so the
// modules never import `env.ts` directly.

import { BILLING_ENABLED } from '@effinance/shared';
import type { BillingProvider } from '../modules/billing/providers/types';
import type { CnpjProvider } from '../modules/clients/providers/types';
import type { OpenFinanceSetup } from '../modules/open-finance/providers/types';
import type { Mailer } from './mailer';

export interface Platform {
  /** Public URL of the web app (links in e-mails, checkout return URL). */
  appUrl: string;
  mailer: Mailer;
  billing: BillingProvider;
  /**
   * Paid subscriptions on (402 without a plan, trial expiry, checkout/webhook routes)? Absent =
   * `BILLING_ENABLED` (shared); tests inject it to cover both paths. Read per request: use `billingEnabled()`.
   */
  billingEnabled?: boolean;
  /** Read-only bank connections (Pluggy, or the simulated provider); null/absent = feature disabled. */
  openFinance?: OpenFinanceSetup | null;
  /** Company data by CNPJ (Receita Federal) for the client form; null/absent = feature disabled. */
  cnpj?: CnpjProvider | null;
  /** Tests only: per-IP route limits become 1000/window so suites can hammer an endpoint. */
  relaxedRateLimits?: boolean;
}

/** Whether paid subscriptions are on: the platform's setting, else `BILLING_ENABLED`. */
export function billingEnabled(platform: Pick<Platform, 'billingEnabled'> | null | undefined): boolean {
  return platform?.billingEnabled ?? BILLING_ENABLED;
}

/**
 * Per-IP rate limit for a route (`config` of the route options; @fastify/rate-limit). The browser
 * demo's router ignores it. Per-account limits live in the services (they also cover the demo).
 */
export function rateLimited(platform: Pick<Platform, 'relaxedRateLimits'> | undefined, max: number, timeWindow: string) {
  return { rateLimit: { max: platform?.relaxedRateLimits ? 1000 : max, timeWindow } };
}

declare module 'fastify' {
  interface FastifyInstance {
    platform: Platform;
  }
}
