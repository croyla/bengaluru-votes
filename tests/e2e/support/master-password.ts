/**
 * The shared staff password the e2e app server is started with
 * (playwright.config.ts sets it as `MASTER_PASSWORD`) and the specs sign in
 * with. Test-only; at least 16 characters, as src/lib/master-login.ts
 * requires.
 */
export const E2E_MASTER_PASSWORD = 'e2e-test-only-master-password';
