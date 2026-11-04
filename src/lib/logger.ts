/**
 * Structured logging (pino) to stdout via Compose logging (architecture
 * §10; §13 "Logs & telemetry carry IDs, not identities").
 *
 * ============================================================================
 * PII SCRUB — THE LOAD-BEARING PART OF THIS FILE
 * ============================================================================
 * `scrubPii` is a pure, recursive redactor: it walks any plain object/array
 * and replaces the VALUE of any key matching (case-insensitively) the PII
 * key set below with `'[redacted]'`. It is wired into pino: every log
 * line's merging object is scrubbed by `formatters.log` before
 * serialization — this covers arbitrary nesting/keys, which a static
 * `redact` path list cannot. String VALUES are additionally passed
 * through a best-effort email/phone regex scrub as defense-in-depth, since
 * an opaque-looking field could still carry PII in free text (e.g. an
 * error message that happens to interpolate an address) — the key-based
 * redaction above is the primary control and what tests must exercise.
 *
 * Cycles and pathological nesting are guarded: a `seen` set tracks the
 * object chain currently being walked (only true cycles up the ancestor
 * chain trip it, not two sibling fields that happen to share a reference),
 * and a hard depth cap stops runaway recursion on deeply-nested-but-acyclic
 * input.
 * ============================================================================
 */
import pino from 'pino';

/**
 * Keys whose VALUE gets redacted, wherever they appear in the object graph.
 * Contact/address PII (architecture §13) plus credential-ish keys, since a
 * leaked token/secret in an error report is just as much an incident.
 */
const PII_KEYS = new Set([
  'email',
  'phone',
  'contact',
  'destination',
  'address',
  'to',
  'recipient',
  'password',
  'token',
  'secret',
  'authorization',
  'cookie',
  'api_key',
  'apikey',
]);

const REDACTED = '[redacted]';

/** Hard cap on recursion depth — bounds pathological (but acyclic) deep nesting. */
const MAX_DEPTH = 20;

const EMAIL_RE = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
// A conservative "looks like a phone number" pattern: 8+ digits, optionally
// grouped with spaces/hyphens/dots and an optional leading `+`. Deliberately
// permissive (defense-in-depth on free text) — the key-based redaction
// above is what tests hold to a strict contract.
const PHONE_RE = /\+?\d[\d\-\s.]{7,}\d/g;

function isPiiKey(key: string): boolean {
  return PII_KEYS.has(key.toLowerCase());
}

/** Best-effort email/phone scrub of a free-text string. Defense-in-depth only. */
function scrubString(value: string): string {
  return value.replace(EMAIL_RE, REDACTED).replace(PHONE_RE, REDACTED);
}

/**
 * Recursively redacts PII from `value`. Exported for tests and for direct
 * use by callers that want to scrub a payload before it reaches pino.
 */
export function scrubPii(value: unknown, depth = 0, seen: Set<object> = new Set()): unknown {
  if (depth > MAX_DEPTH) return '[max-depth]';

  if (value === null || value === undefined) return value;

  if (typeof value === 'string') return scrubString(value);

  if (typeof value !== 'object') return value;

  // Leave non-plain objects (Error, Date, RegExp, etc.) alone rather than
  // risk mangling them — pino's own serializers handle those types;
  // this function's job is plain data (the fields object).
  if (value instanceof Date || value instanceof RegExp) return value;

  if (seen.has(value)) return '[circular]';
  seen.add(value);
  try {
    if (Array.isArray(value)) {
      return value.map((item) => scrubPii(item, depth + 1, seen));
    }

    if (value instanceof Error) {
      return { name: value.name, message: scrubString(value.message), stack: value.stack };
    }

    const out: Record<string, unknown> = {};
    for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
      out[key] = isPiiKey(key) ? REDACTED : scrubPii(val, depth + 1, seen);
    }
    return out;
  } finally {
    seen.delete(value);
  }
}

/**
 * Structured JSON logger to stdout (Compose logging, architecture §10).
 * `formatters.log` scrubs every merging object before pino serializes it —
 * the primary PII-redaction mechanism, since it covers arbitrary nesting
 * and key names rather than a fixed set of static paths. Output shape is
 * still pino's usual `{level, time, msg, ...fields}` JSON line, matching
 * the `{event, ...fields}` convention `logEvent` already writes.
 */
export const logger = pino({
  formatters: {
    log(object) {
      return scrubPii(object) as Record<string, unknown>;
    },
  },
  // Belt-and-suspenders: also declare pino's own top-level redact paths for
  // the same key set, in case a future change bypasses `formatters.log`
  // (e.g. a child logger built with `pino.destination` options that skip
  // formatters). Harmless no-op today since `formatters.log` already
  // scrubs everything these paths would catch.
  redact: {
    paths: Array.from(PII_KEYS),
    censor: REDACTED,
  },
});

/**
 * Logs `err` via pino (scrubbed). `context` is extra structured data
 * (opaque fields only, same convention as `logEvent`) attached to the log
 * line.
 */
export function captureException(err: unknown, context?: Record<string, unknown>): void {
  const message = err instanceof Error ? err.message : String(err);
  logger.error({ event: 'exception', message, ...(context ?? {}) });
}
