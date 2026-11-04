/**
 * Staff sign-in with the shared `MASTER_PASSWORD` — the only way into
 * `/login` until per-staff passwords replace it (docs/architecture.md §4).
 *
 * Anyone holding the password can sign in as any EXISTING, ACTIVE staff
 * account (admin, curator, transcriber), looked up by email. It never
 * creates a user. Unset or empty -> nobody can sign in.
 *
 * The variable is read at call time rather than at module load, so it can
 * be set per test and so a too-short value throws on the very next request
 * (src/middleware.ts calls `assertMasterPasswordConfig()` on every one)
 * instead of running silently with a guessable password.
 *
 * NON-DISCLOSURE: a wrong password, an unknown email and a banned or
 * erased account all return the same `{ ok: false }`.
 *
 * PRIVACY: logs carry an opaque user id only — never the email, never the
 * password.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { users } from '../db/schema';
import { logEvent } from './log';
import { createSession } from './session';

export const MASTER_PASSWORD_MIN_LENGTH = 16;

export type MasterLoginResult = { ok: true; setCookie: string } | { ok: false };

function configuredPassword(): string | null {
  const value = process.env.MASTER_PASSWORD ?? '';
  if (value === '') return null;
  if (value.length < MASTER_PASSWORD_MIN_LENGTH) {
    throw new Error(`MASTER_PASSWORD must be at least ${MASTER_PASSWORD_MIN_LENGTH} characters`);
  }
  return value;
}

/** Throws when `MASTER_PASSWORD` is set but too short; a no-op otherwise. */
export function assertMasterPasswordConfig(): void {
  configuredPassword();
}

/** Lowercased and trimmed: `users.email` is stored that way. */
export function normalizeEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/** SHA-256 first, so `timingSafeEqual` always gets two equal-length buffers. */
function digest(value: string): Buffer {
  return createHash('sha256').update(value).digest();
}

export async function loginWithMasterPassword(destinationRaw: string, password: string): Promise<MasterLoginResult> {
  const configured = configuredPassword();
  if (configured === null) return { ok: false };

  const passwordOk = timingSafeEqual(digest(password), digest(configured));

  const email = normalizeEmail(destinationRaw);
  const [user] =
    email === ''
      ? []
      : await db
          .select({ id: users.id, status: users.status })
          .from(users)
          .where(eq(users.email, email));

  if (!passwordOk || !user || user.status !== 'active') {
    logEvent('master_login_failed', { userId: user?.id ?? null });
    return { ok: false };
  }

  const session = await createSession(user.id);
  logEvent('master_login_succeeded', { userId: user.id });
  return { ok: true, setCookie: session.setCookie };
}
