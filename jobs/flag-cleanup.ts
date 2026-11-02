#!/usr/bin/env tsx
/** Abuse metadata expires independently of the general account-retention switch. */
import { cleanupFlagAbuse } from '../src/lib/flag-abuse';
cleanupFlagAbuse().then(() => { console.log('flag abuse metadata cleanup complete'); process.exit(0); }).catch(() => { console.error('flag abuse metadata cleanup failed'); process.exit(1); });
