import type { FastifyPluginAsyncZod } from 'fastify-type-provider-zod';
import { accountRoutes } from './modules/accounts/routes';
import { clientRecordRoutes } from './modules/client-records/routes';
import { deadlineRoutes } from './modules/deadlines/routes';
import { officeRoutes } from './modules/office/routes';
import { clientOnboardingRoutes, onboardingTemplateRoutes, publicOnboardingRoutes } from './modules/onboarding/routes';
import { profileRoutes } from './modules/profile/routes';
import { unionRoutes } from './modules/unions/routes';
import { categoryRoutes } from './modules/categories/routes';
import { clientRoutes, cnpjRoutes } from './modules/clients/routes';
import { contactRoutes } from './modules/contacts/routes';
import { creditCardRoutes } from './modules/credit-cards/routes';
import { dashboardRoutes } from './modules/dashboard/routes';
import { feeAdjustmentRoutes } from './modules/fee-adjustments/routes';
import { feeChargeRoutes } from './modules/fee-charges/routes';
import { goalRoutes } from './modules/goals/routes';
import { importRoutes } from './modules/imports/routes';
import { openFinanceRoutes } from './modules/open-finance/routes';
import { reportRoutes } from './modules/reports/routes';
import { searchRoutes } from './modules/search/routes';
import { statementRoutes } from './modules/statement/routes';
import { taskRoutes } from './modules/tasks/routes';
import { transactionRoutes } from './modules/transactions/routes';
import { transferRoutes } from './modules/transfers/routes';

/**
 * Every authenticated domain module, mounted under `/api`. Auth routes are registered separately
 * because they depend on the JWT/cookie plugin (the browser demo provides its own).
 */
export const domainRoutes: { prefix: string; plugin: FastifyPluginAsyncZod }[] = [
  { prefix: '/categories', plugin: categoryRoutes },
  { prefix: '/accounts', plugin: accountRoutes },
  { prefix: '/credit-cards', plugin: creditCardRoutes },
  { prefix: '/goals', plugin: goalRoutes },
  { prefix: '/contacts', plugin: contactRoutes },
  { prefix: '/clients', plugin: clientRoutes },
  { prefix: '/transactions', plugin: transactionRoutes },
  { prefix: '/fee-charges', plugin: feeChargeRoutes },
  { prefix: '/transfers', plugin: transferRoutes },
  { prefix: '/statement', plugin: statementRoutes },
  { prefix: '/dashboard', plugin: dashboardRoutes },
  { prefix: '/reports', plugin: reportRoutes },
  { prefix: '/search', plugin: searchRoutes },
];

/**
 * Modules whose requests run several tenant transactions (lib/tenant-scope.ts: same authentication
 * and write checks, explicit RLS phases): mounted under `/api` next to `tenantRoutes`, not inside it.
 * Tasks bring their own guards (modules/tasks/access.ts): every member writes there, `viewer` included.
 * Phase 3 modules check a permission key per route (lib/permissions.ts, lib/scoped-context.ts):
 * unions, deadlines, the office, the clients' accesses, contract issues and registry (`/clients`, next
 * to the financial client routes; the registry with `clients`), and the profile photo.
 */
export const scopedRoutes: { prefix: string; plugin: FastifyPluginAsyncZod }[] = [
  { prefix: '/imports', plugin: importRoutes },
  { prefix: '/open-finance', plugin: openFinanceRoutes },
  // Yearly fee adjustment in batch: financial (`finance`), audited after its transaction commits.
  { prefix: '/fee-adjustments', plugin: feeAdjustmentRoutes },
  { prefix: '/cnpj', plugin: cnpjRoutes },
  { prefix: '/tasks', plugin: taskRoutes },
  { prefix: '/unions', plugin: unionRoutes },
  { prefix: '/deadlines', plugin: deadlineRoutes },
  { prefix: '/office', plugin: officeRoutes },
  { prefix: '/clients', plugin: clientRecordRoutes },
  { prefix: '/profile', plugin: profileRoutes },
  // Client onboarding: the template (`office` to save) and, per client, preview, adjustment, links, history.
  { prefix: '/onboarding', plugin: onboardingTemplateRoutes },
  { prefix: '/clients', plugin: clientOnboardingRoutes },
];

/**
 * Public routes without a session (the secret token in the path is the credential), mounted under `/api`
 * by the server and by the browser demo: the client onboarding page (`/o/<token>` on the web).
 */
export const publicRoutes: { prefix: string; plugin: FastifyPluginAsyncZod }[] = [
  { prefix: '/public/onboarding', plugin: publicOnboardingRoutes },
];
