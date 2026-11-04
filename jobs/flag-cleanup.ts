#!/usr/bin/env tsx
/** Expires short-lived abuse metadata on anonymous reports (not the report content). */
import { cleanupFlagAbuse } from '../src/lib/flag-abuse';
cleanupFlagAbuse().then(() => { console.log('flag abuse metadata cleanup complete'); process.exit(0); }).catch(() => { console.error('flag abuse metadata cleanup failed'); process.exit(1); });
