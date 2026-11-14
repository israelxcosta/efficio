import { createHash } from 'node:crypto';
import { z } from 'zod';
import { BILLING_ENABLED } from '@effinance/shared';

const optional = z
  .string()
  .optional()
  .transform((v) => (v && v.trim() ? v.trim() : undefined));

const booleanFlag = z
  .enum(['true', 'false'])
  .optional()
  .transform((v) => (v === undefined ? undefined : v === 'true'));

/**
 * Hosts that only exist on the private network of the Docker Compose stack (VPS): there the database
 * is never published, so production may talk to it without TLS (`DATABASE_SSL=disable`).
 */
export const PRIVATE_DATABASE_HOSTS: readonly string[] = ['db', 'postgres', 'localhost', '127.0.0.1', '::1'];

/** Host of a database URL (IPv6 without brackets), or null when the URL does not parse. */
export function databaseHostOf(url: string): string | null {
  try {
    return new URL(url).hostname.replace(/^\[|\]$/g, '').toLowerCase();
  } catch {
    return null;
  }
}

/** The public development master key (setup.ts): refused in production even when given explicitly. */
const DEV_MASTER_KEY_B64 = createHash('sha256').update('effinance-insecure-development-master-key').digest('base64');

/**
 * What is wrong with an `ENCRYPTION_MASTER_KEY`, or null. Always: standard base64 of exactly 32 bytes
 * (`openssl rand -base64 32`). In production also: not the development key and not an obviously
 * non-random value (a random 32-byte key practically always has 20+ distinct bytes).
 */
export function masterKeyProblem(value: string, production: boolean): string | null {
  if (!/^[A-Za-z0-9+/]{43}=$/.test(value)) {
    return 'must be the base64 of exactly 32 random bytes (44 characters ending in "="): openssl rand -base64 32';
  }
  if (!production) return null;
  if (value === DEV_MASTER_KEY_B64) return 'is the public development key; generate a new one (openssl rand -base64 32)';
  if (new Set(Buffer.from(value, 'base64')).size < 16) {
    return 'does not look random (repeated bytes / example value); generate one with openssl rand -base64 32';
  }
  return null;
}

export interface EnvOptions {
  /**
   * Paid subscriptions on (default `BILLING_ENABLED`, shared): only then does production need a real
   * charging provider (Mercado Pago). Tests pass it to cover both paths.
   */
  billingEnabled?: boolean;
}

const buildEnvSchema = ({ billingEnabled = BILLING_ENABLED }: EnvOptions = {}) =>
  z
    .object({
      NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
      PORT: z.coerce.number().int().positive().default(3333),
      HOST: z.string().default('0.0.0.0'),
      /** Proxy hops whose X-Forwarded-For is trusted (1 = the load balancer in front of the API). */
      TRUST_PROXY: z.coerce.number().int().min(0).default(1),
      DATABASE_URL: z.url(),
      /**
       * `verify-full`: TLS with certificate and host verification (any host reachable over a network).
       * `disable` is accepted in production only for a host of `PRIVATE_DATABASE_HOSTS` (Docker network).
       */
      DATABASE_SSL: z.enum(['disable', 'require', 'verify-full']).default('disable'),
      /** PEM bundle used with verify-full (e.g. the RDS global CA bundle). */
      DATABASE_CA_FILE: optional,
      JWT_SECRET: z.string().min(32, 'JWT_SECRET must have at least 32 characters'),
      CORS_ORIGIN: z
        .string()
        .default('http://localhost:5173')
        .transform((v) =>
          v
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        ),
      /** Public URL of the web app (links in e-mails and checkout return). */
      APP_URL: z
        .string()
        .default('http://localhost:5173')
        .transform((v) => v.replace(/\/+$/, '')),
      LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

      KEY_PROVIDER: z.enum(['local', 'aws']).default('local'),
      /**
       * base64 of 32 random bytes (KEY_PROVIDER=local). In production (single VPS) it wraps every
       * workspace data key and the TOTP seeds: whoever holds it plus a database dump reads everything,
       * and losing it loses the encrypted data for good — there is no rotation for the local provider
       * (a different key cannot unwrap the stored keys). Keep it only in the server's env file (chmod
       * 600) and in an offline copy (password manager / paper in a safe), never in backups of the database.
       */
      ENCRYPTION_MASTER_KEY: optional,
      KMS_KEY_ID: optional,
      AWS_REGION: optional,

      MAILER: z.enum(['console', 'memory', 'webhook', 'ses', 'smtp']).optional(),
      MAIL_FROM: z.string().default('Efficio <nao-responda@efficio.app>'),
      MAIL_WEBHOOK_URL: optional,
      MAIL_WEBHOOK_SECRET: optional,
      /** MAILER=smtp: the office's mailbox (e.g. smtp.hostinger.com, port 465 with implicit TLS). */
      SMTP_HOST: optional,
      SMTP_PORT: z.coerce.number().int().min(1).max(65_535).default(465),
      /** true = implicit TLS (465); false = STARTTLS, which is then mandatory (587). */
      SMTP_SECURE: z
        .enum(['true', 'false'])
        .default('true')
        .transform((v) => v === 'true'),
      SMTP_USER: optional,
      SMTP_PASSWORD: optional,

      /**
       * Two-step verification required for everyone (default: on in production, off elsewhere). A
       * session without it only reaches the enrollment until it is done (lib/auth.ts).
       */
      REQUIRE_MFA: booleanFlag,
      /**
       * Daily maintenance inside the API (src/jobs: retention clean-up and recurring obligations at
       * ~03:00 America/Sao_Paulo). Default: on in production, off elsewhere. One API instance only.
       */
      JOBS_ENABLED: booleanFlag,

      BILLING_PROVIDER: z.enum(['fake', 'mercadopago']).default('fake'),
      MP_ACCESS_TOKEN: optional,
      MP_WEBHOOK_SECRET: optional,

      /**
       * Public sign-up (`POST /auth/register` without an invite). Default: on in development and tests
       * (the suites sign up), off in production — accounts then come from invites (and bootstrap:owner).
       */
      SIGNUP_ENABLED: booleanFlag,

      /**
       * Read-only bank connections (Open Finance Brasil). fake = simulated institutions (development,
       * tests, demo); pluggy = aggregator (production); disabled = feature hidden. Default: fake outside
       * production, disabled in production.
       */
      OPEN_FINANCE_PROVIDER: z.enum(['fake', 'pluggy', 'disabled']).optional(),
      PLUGGY_CLIENT_ID: optional,
      PLUGGY_CLIENT_SECRET: optional,
      /** Accept Pluggy sandbox connectors (non-Open-Finance test banks). Never in production. */
      PLUGGY_SANDBOX: z
        .enum(['true', 'false'])
        .default('false')
        .transform((v) => v === 'true'),
      /** Secret path segment of the webhook URL (URL-safe, 32+ characters; 43+ in production). */
      OPEN_FINANCE_WEBHOOK_SECRET: optional,
      /** Public base URL of this API (webhook URL given to the aggregator), e.g. https://api.effinance.com.br. */
      API_PUBLIC_URL: optional.transform((v) => v?.replace(/\/+$/, '')),

      /**
       * Company data by CNPJ (Receita Federal) in the client form. brasilapi = public BrasilAPI
       * (default outside tests); fake = fictitious companies (tests, offline development); disabled.
       */
      CNPJ_PROVIDER: z.enum(['brasilapi', 'fake', 'disabled']).optional(),

      /** Shared rate-limit store for multiple API instances. */
      REDIS_URL: optional,
    })
    .superRefine((e, ctx) => {
      const issue = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
      if (e.KEY_PROVIDER === 'aws' && !e.KMS_KEY_ID) issue('KMS_KEY_ID', 'required when KEY_PROVIDER=aws');
      if (e.KEY_PROVIDER === 'local' && e.NODE_ENV === 'production' && !e.ENCRYPTION_MASTER_KEY) {
        issue('ENCRYPTION_MASTER_KEY', 'required in production when KEY_PROVIDER=local');
      }
      if (e.BILLING_PROVIDER === 'mercadopago' && (!e.MP_ACCESS_TOKEN || !e.MP_WEBHOOK_SECRET)) {
        issue('MP_ACCESS_TOKEN', 'MP_ACCESS_TOKEN and MP_WEBHOOK_SECRET are required with BILLING_PROVIDER=mercadopago');
      }
      // With billing off the charging routes answer 404 (lib/platform.ts): no provider is ever called.
      if (e.NODE_ENV === 'production' && billingEnabled && e.BILLING_PROVIDER === 'fake') {
        issue('BILLING_PROVIDER', 'the fake provider is not allowed in production while billing is enabled');
      }
      if (e.MAILER === 'webhook' && !e.MAIL_WEBHOOK_URL) issue('MAIL_WEBHOOK_URL', 'required when MAILER=webhook');
      if (e.MAILER === 'smtp') {
        if (!e.SMTP_HOST) issue('SMTP_HOST', 'required when MAILER=smtp');
        if (!e.SMTP_USER || !e.SMTP_PASSWORD) issue('SMTP_USER', 'SMTP_USER and SMTP_PASSWORD are required when MAILER=smtp');
      }
      if (e.ENCRYPTION_MASTER_KEY) {
        const problem = masterKeyProblem(e.ENCRYPTION_MASTER_KEY, e.NODE_ENV === 'production');
        if (problem) issue('ENCRYPTION_MASTER_KEY', problem);
      }
      if (e.DATABASE_SSL === 'verify-full' && !e.DATABASE_CA_FILE) {
        issue('DATABASE_CA_FILE', 'required when DATABASE_SSL=verify-full');
      }
      const openFinance = openFinanceProviderOf(e);
      if (openFinance === 'pluggy') {
        if (!e.PLUGGY_CLIENT_ID || !e.PLUGGY_CLIENT_SECRET) {
          issue('PLUGGY_CLIENT_ID', 'PLUGGY_CLIENT_ID and PLUGGY_CLIENT_SECRET are required with OPEN_FINANCE_PROVIDER=pluggy');
        }
        if (!e.OPEN_FINANCE_WEBHOOK_SECRET) issue('OPEN_FINANCE_WEBHOOK_SECRET', 'required with OPEN_FINANCE_PROVIDER=pluggy');
        if (!e.API_PUBLIC_URL) issue('API_PUBLIC_URL', 'required with OPEN_FINANCE_PROVIDER=pluggy (webhook URL)');
      }
      if (e.OPEN_FINANCE_WEBHOOK_SECRET && !/^[A-Za-z0-9_-]{32,200}$/.test(e.OPEN_FINANCE_WEBHOOK_SECRET)) {
        issue('OPEN_FINANCE_WEBHOOK_SECRET', 'must be 32–200 URL-safe characters (it is a path segment): openssl rand -base64 48 | tr "+/" "-_" | tr -d =');
      }
      if (e.API_PUBLIC_URL && !/^https?:\/\/[^/\s?#]+(\/[^\s?#]*)?$/.test(e.API_PUBLIC_URL)) {
        issue('API_PUBLIC_URL', 'must be an absolute http(s) URL without query or fragment');
      }
      if (e.NODE_ENV === 'production') {
        // Fail closed: development defaults must never reach production (docs/deploy-aws.md).
        if (e.JWT_SECRET.length < 43 || /dev-?only|change-?me|replace-?me|example|placeholder|secret-of-32/i.test(e.JWT_SECRET)) {
          issue('JWT_SECRET', 'must be a random secret of 43+ characters in production (openssl rand -base64 48), not a placeholder');
        }
        // KEY_PROVIDER=local is accepted (single VPS): the master key is then required and checked above.
        if (e.MAILER !== 'ses' && e.MAILER !== 'webhook' && e.MAILER !== 'smtp') {
          issue('MAILER', 'must be "smtp", "ses" or "webhook" in production (the console mailer writes reset/invite links to the logs)');
        }
        if (e.MAILER === 'webhook' && e.MAIL_WEBHOOK_URL && !e.MAIL_WEBHOOK_URL.startsWith('https://')) {
          issue('MAIL_WEBHOOK_URL', 'must use https in production');
        }
        if (e.MAILER === 'webhook' && !e.MAIL_WEBHOOK_SECRET) {
          issue('MAIL_WEBHOOK_SECRET', 'required with MAILER=webhook in production (the endpoint must authenticate us)');
        }
        const dbHost = databaseHostOf(e.DATABASE_URL);
        const privateHost = dbHost !== null && PRIVATE_DATABASE_HOSTS.includes(dbHost);
        if (e.DATABASE_SSL !== 'verify-full' && !(e.DATABASE_SSL === 'disable' && privateHost)) {
          issue(
            'DATABASE_SSL',
            `must be verify-full in production (TLS with certificate and host verification); disable is only allowed for a database on the private Docker network (host ${PRIVATE_DATABASE_HOSTS.join(', ')})`,
          );
        }
        if (!e.APP_URL.startsWith('https://')) issue('APP_URL', 'must be an https URL in production');
        if (e.CNPJ_PROVIDER === 'fake') {
          issue('CNPJ_PROVIDER', 'the fake provider is not allowed in production (fictitious companies; use brasilapi or disabled)');
        }
        if (e.OPEN_FINANCE_PROVIDER === 'fake') {
          issue('OPEN_FINANCE_PROVIDER', 'the fake provider is not allowed in production (use pluggy or disabled)');
        }
        if (openFinance === 'pluggy') {
          if (e.PLUGGY_SANDBOX) issue('PLUGGY_SANDBOX', 'sandbox connectors are not allowed in production');
          if (e.API_PUBLIC_URL && !e.API_PUBLIC_URL.startsWith('https://')) issue('API_PUBLIC_URL', 'must be an https URL in production');
          const secret = e.OPEN_FINANCE_WEBHOOK_SECRET ?? '';
          if (secret.length < 43 || /dev-?only|change-?me|replace-?me|example|placeholder/i.test(secret)) {
            issue('OPEN_FINANCE_WEBHOOK_SECRET', 'must be a random secret of 43+ characters in production, not a placeholder');
          }
        }
        if (e.CORS_ORIGIN.length === 0 || e.CORS_ORIGIN.some((o) => !o.startsWith('https://'))) {
          issue('CORS_ORIGIN', 'must list only https origins in production');
        }
      }
    });

export type Env = z.infer<ReturnType<typeof buildEnvSchema>>;

/** Effective Open Finance provider: explicit, or fake outside production and disabled in it. */
export function openFinanceProviderOf(e: Pick<Env, 'OPEN_FINANCE_PROVIDER' | 'NODE_ENV'>): 'fake' | 'pluggy' | 'disabled' {
  return e.OPEN_FINANCE_PROVIDER ?? (e.NODE_ENV === 'production' ? 'disabled' : 'fake');
}

/** Effective two-step verification requirement: explicit, or on in production only. */
export function requireMfaOf(e: Pick<Env, 'REQUIRE_MFA' | 'NODE_ENV'>): boolean {
  return e.REQUIRE_MFA ?? e.NODE_ENV === 'production';
}

/** Effective scheduled jobs switch: explicit, or on in production only. */
export function jobsEnabledOf(e: Pick<Env, 'JOBS_ENABLED' | 'NODE_ENV'>): boolean {
  return e.JOBS_ENABLED ?? e.NODE_ENV === 'production';
}

/** Effective public sign-up: explicit, or on outside production and off in it. */
export function signupEnabledOf(e: Pick<Env, 'SIGNUP_ENABLED' | 'NODE_ENV'>): boolean {
  return e.SIGNUP_ENABLED ?? e.NODE_ENV !== 'production';
}

/** Validates an environment (`process.env` by default); throws listing every invalid variable. */
export function parseEnv(source: Record<string, string | undefined> = process.env, options: EnvOptions = {}): Env {
  const parsed = buildEnvSchema(options).safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new Error(`Invalid environment variables:\n${issues}`);
  }
  return parsed.data;
}

export const env = parseEnv();
