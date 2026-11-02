# Anonymous Flags Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Native execution follows AGENTS.md; defer all commits to the owner's integration approval.

**Goal:** Allow anonymous candidate-field reporting with layered admission controls and manageable curator workload.
**Architecture:** Preserve Astro/Postgres/nginx. Issue signed opaque browser receipts, serialize per-target and per-reporter admission in Postgres, and retain private curator resolution.
**Tech Stack:** TypeScript, Astro, Drizzle/Postgres, nginx, Vitest, agent-browser.
**Spec:** ../specs/2026-11-02-anonymous-flags-design.md (approved).

## Global Constraints
- No public session-dependent HTML or public GET cookies.
- 3 reports/10 minutes and 10/24 hours per browser and account; 100/24 hours per IP, configurable.
- 32 KiB body; explanation 2,000, correction 1,000, URL 2,048, reference 128 characters.
- Eight existing fields only; no auto-publication, public report counts, or contact requirement.
- 30-day browser metadata, 48-hour network metadata, seven-day closed fingerprints, daily independent cleanup.
- Dedicated worktree/database/ports; no commit/merge/push before approval.

## Review Focus
- Rotating cookies while signed in cannot escape account limits (Task 1).
- Spoofed forwarding headers and chunked oversized bodies cannot bypass protections (Task 2).
- Spam alongside legitimate reports cannot close the shared item (Task 3).
- Replayed closed reports cannot reveal private rejection reasons (Task 1).
- CAPTCHA failure and expired browser tokens preserve user text (Task 2).

### Task 1: Persistence and atomic admission
**Files:** drizzle/0015_anonymous_flags.sql, drizzle/meta/_journal.json, src/db/schema.ts, src/lib/flag-abuse.ts, src/lib/flags.ts, tests/unit/anonymous-flags.test.ts.
**Interfaces:** `issueFlagToken(): string`, `flagBrowserHash(token: string): string | null`, `submitPublicFlag(reporter: FlagReporter, input: SubmitFlagInput): Promise<FlagResult>`, `flagValueHash(tx, targetRef): Promise<string>`; result state accepted/duplicate/already_reviewed, optional item id. Reporter carries browserHash, networkHash, optional userId.
- [x] Write DB tests for anonymous acceptance, exact/different duplicates, simultaneous admission, account cookie rotation, recent resolved repeats and changed values.
- [x] Run tests and observe missing feature failures.
- [x] Add compatible nullable reporter fields, partial uniqueness excluding legacy rows, abuse admissions and hourly aggregate tables; signed tokens and transactional locking/quotas.
- [x] Capture value fingerprints on resolution under the same per-target lock; pass tests.

### Task 2: API, bot verification and citizen modal
**Files:** src/pages/api/flags.ts, src/pages/api/flags/identity.ts, src/lib/flag-http.ts, src/lib/recaptcha.ts, src/components/FlagModal.astro, src/islands/FlagModal.ts, src/layouts/Base.astro, deploy/nginx/conf.d/site.conf, deploy/nginx/snippets/rate-limits.conf, tests/routes/flags.test.ts, tests/unit/flag-modal.test.ts, tests/unit/recaptcha.test.ts.
**Interfaces:** use Task 1 admission; `readFlagBody(request): Promise<unknown>`, `flagNetworkHash(request, clientAddress): string`; identity POST issues cookie, submission POST validates JSON/CAPTCHA and returns state. Neither requires a session.
- [x] Replace login-contract tests with anonymous API/modal tests, including bounded bodies, pause, spoofed headers, cookie expiry and preserved text on retry.
- [x] Observe failures; implement token initialization, bounded parsing, cheap admission, server CAPTCHA verification/timeout/error handling and no-login modal.
- [x] Add nginx dedicated limits and trusted client header; preserve origin middleware; run route/island/CAPTCHA tests.

### Task 3: Curator workload, admin counters and cleanup
**Files:** src/lib/curator.ts, src/lib/account-flow.ts, src/lib/flag-abuse.ts, src/features/pages/curator/Queue.astro, src/features/pages/curator/QueueItem.astro, src/pages/curator/queue/index.astro, src/pages/curator/queue/[id].astro, src/pages/admin/index.astro, src/features/pages/admin/Console.astro, jobs/flag-cleanup.ts, deploy/crontab, tests/unit/anonymous-flags.test.ts.
**Interfaces:** `markFlagSpam(actor, itemId, submissionIds, reason): Promise<void>`; `cleanupFlagAbuse(): Promise<void>`; `loadFlagMetrics()` aggregated counters and backlog. Queue 50/page, submissions 20/page.
- [x] Write tests for mixed spam/valid item, account history override, pagination, independent cleanup, previous-resolution privacy and metrics.
- [x] Observe failures; implement scoped moderation, paginated grouped display, previous resolutions, admin aggregates and scheduled cleanup.
- [x] Run associated DB/route tests; verify nullable account-erasure handling.

### Task 4: Bilingual copy, docs and end-to-end verification
**Files:** src/i18n/en.json, src/i18n/kn.json, content/pages/en/privacy.md, content/pages/kn/privacy.md, AGENTS.md, docs/overview.md, docs/architecture.md, docs/milestones.md, deploy/runbook.md, curator guide, tests/e2e/flag.spec.ts.
**Interfaces:** existing t() hash metadata and translated editorial sourceHash; no new translation service.
- [x] Update localized citizen feedback, curator controls and admin metrics; author Kannada and update metadata using repository hashing conventions.
- [x] Update operational docs and project decision; preserve unrelated changes.
- [x] Run full Vitest suite in isolated bv_test, typecheck, translation gate and build.
- [x] Use agent-browser desktop/mobile to inspect modal, curator controls and admin layout; verify real submission and duplicate retry.
- [x] Obtain fresh whole-branch review, resolve material findings with regressions, report review URL and verification; ask once for commit/merge/push approval.

Validation: 1,717 tests passed across 108 files; typecheck, build, translation gate and nginx changed-snippet syntax check passed. Desktop/mobile browser checks completed. Fresh review found one direct-mode forwarded-IP issue, fixed with an adapter-level regression. Integration remains pending owner approval.
