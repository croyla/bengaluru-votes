/**
 * A fresh anonymous reporter for `submitPublicFlag`: distinct browser and
 * network hashes on every call, so the per-browser and per-network
 * admission limits never trip in a test that is not about them.
 */
import { randomBytes } from 'node:crypto';
import type { FlagReporter } from '../../src/lib/flag-abuse';

export function anonReporter(): FlagReporter {
  return { browserHash: randomBytes(32).toString('hex'), networkHash: randomBytes(32).toString('hex') };
}
