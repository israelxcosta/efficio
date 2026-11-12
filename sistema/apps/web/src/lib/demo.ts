/** True in the self-contained demo build (`vite build --mode demo`): the API runs in the browser. */
export const IS_DEMO = import.meta.env.VITE_DEMO === 'true';

/**
 * The office owner seeded in the demo (`DEMO_EMAIL`/`DEMO_PASSWORD` of apps/api/src/db/demo-seed.ts,
 * checked by src/demo/demo.test.ts), prefilled on the demo's login screen. Null outside the demo build
 * and the tests: the condition is folded at build time, so the production bundle never carries it.
 */
export const DEMO_LOGIN: Readonly<{ email: string; password: string }> | null =
  IS_DEMO || import.meta.env.MODE === 'test' ? { email: 'israel@efficio.com.br', password: 'demo12345' } : null;
