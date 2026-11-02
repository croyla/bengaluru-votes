# Anonymous candidate-field reports

Status: approved by the owner on 2026-11-02. The owner selected CAPTCHA + limits + deduplication + curator controls. Numerical defaults and scope choices below are the author's proposed defaults, not separately agreed requirements.

## Intent and boundaries

Let any visitor report an error in the eight existing flaggable candidate fields without registering, providing contact details, or completing OTP. Preserve curator-only publication: reports and their counts remain private, never automatically change data, add a public warning, or determine candidate ranking. Keep the existing Astro/Postgres/nginx architecture and bilingual modal.

The risks are automated submissions, coordinated human complaints, repetitive reopening, and exhausting curator time. We reduce these risks rather than promise one-person-one-report. Browser cookies and IP addresses are not identities. Shared networks must not be treated as a single person.

## Citizen experience

Flag opens the existing modal directly. Keep the field selection, required explanation, optional suggested correction and optional source URL. Explain that the team checks reports against the affidavit; ask for an affidavit page where helpful, without making a source URL compulsory. No file uploads or new identity inputs.

Trim input and enforce server and client limits: explanation 1–2,000 characters, suggested value at most 1,000, URL at most 2,048, target reference at most 128. Limit the encoded request to 32 KiB both at the proxy and application boundary, before JSON parsing. Reject disallowed fields and invalid/nonexistent targets as today. Render text escaped; never fetch submitted URLs automatically.

Run CAPTCHA when submitting. Preserve entered text on CAPTCHA/network/rate-limit errors; explain temporary failures and offer retry. Success confirms receipt for review without a response-time promise. An exact retry returns the same successful result. A second different report from the same browser/account on the same pending field returns 'You have already reported this field; it is awaiting review.' Do not count it again.

First-release scope: anonymous visitors get confirmation, but no new anonymous history page or outcome lookup. Signed-in submissions retain the existing account history. Signing in later does not retrospectively attach anonymous reports. No notification delivery or registration prompt is added to the reporting flow.

## Anonymous identity and data

Use a dedicated server-issued cryptographically random flag-browser token, distinct from the voting receipt. It is an HttpOnly, SameSite=Strict cookie, Secure in production, with a 30-day lifetime. Store a keyed hash rather than its bearer value. Initialize it through an uncached same-origin API operation on modal interaction; never set it on a public page GET or in middleware. A request without a valid issued token cannot submit; initialization itself is network-rate-limited. Reject arbitrary fabricated cookie tokens.

Make flag_submissions.user_id nullable and retain historical account associations. New reports always carry the browser identifier; signed-in reports additionally carry user_id. Pending-item uniqueness is enforced independently per browser and, when present, per account, so cookie resets while signed in cannot inflate the count. Keep the existing unique pending item per target. Legacy rows remain unchanged and readable; do not silently delete old duplicates.

Add structured submission moderation state (active/spam) and a report fingerprint. Fingerprints are computed over target and conservatively normalized explanation, correction and URL (trim and whitespace normalization; no semantic AI matching). Group matching active text in the curator display, retain access to constituent submissions and label counts as submissions rather than verified people.

Browser identity and abuse records have explicit expiry/cleanup. Run abuse-metadata cleanup daily independently of RETENTION_ENABLED; expiry is enforced in queries immediately and physical deletion happens by the next daily run. Retain pseudonymous browser identifiers with submissions for 30 days, then clear them; clear expired token and rate-limit records. Fingerprints on closed reports need only 7 days of duplicate-suppression retention, then clear them. Preserve report text and resolution under the existing report-retention policy; anonymous metadata must not change account-erasure behavior or expose another reporter's data. Document this in privacy copy. Do not log tokens, raw IPs, report text or supplied links in new application events. Review existing nginx logs separately and document their actual retention; do not claim raw IPs are absent system-wide.

## Layered admission controls

Apply protections to signed-in and anonymous reporters alike; signing in is not a bypass.

1. **Network requests:** dedicated nginx limits for initialization and submission, initially 10 requests/minute/IP with burst 5. Trust only the configured proxy chain; overwrite the application client-IP header at nginx and keep production application ports inaccessible externally. Do not trust arbitrary X-Forwarded-For. The localhost stack uses the direct peer address.
2. **Browser and account:** at most 3 accepted new reports per 10 minutes and 10 per rolling 24 hours, checked independently for browser and optional account. A duplicate consumes request protection but not another accepted-report allowance.
3. **Network daily allowance:** at most 100 accepted new reports per rolling 24 hours/IP as a configurable starting point. Store a keyed hash of canonical client IP with a dedicated secret and a 48-hour cleanup window; a plain IP hash is insufficient. This limit deliberately permits more than one user per network; monitor false positives. Never expose these identifiers to curators.
4. **CAPTCHA:** reuse reCAPTCHA with expected action `candidate_flag`; verify success, action, hostname, score and provider errors, with bounded timeout. Start with the existing 0.5 threshold, configurable and adjusted from observed legitimate failures. Explicitly reject quota/error responses even if the provider also reports success. Production missing keys, unavailable verification, or invalid responses fail closed with recoverable feedback. Maintain the explicitly scoped local bypass only. Check billing/quota/domain configuration before rollout.
5. **Atomicity:** reserve/check accepted-report allowances and insert the submission in one transaction under consistent locking; concurrent requests cannot exceed quotas or create duplicate rows. Validate target before writing report data. Limit cheap requests before paying for CAPTCHA; recheck acceptance limits transactionally afterwards. Failed CAPTCHA never creates a report.

No small global daily cap: an attacker could consume it and suppress everyone. No device fingerprinting, AI moderation, new service, or permanent IP bans.

## Curator workload and repeated complaints

Retain one pending queue item per candidate field, and existing fix/reject behavior with its server-enforced publication confirmation. Never rank by report count. Paginate queue items and submissions (50 and 20 respectively) so one targeted field cannot create an unbounded page or query. Group identical text in each item and display active/spam counts separately.

Allow curators/admins to mark individual or selected submissions as spam, with a stored moderation reason and actor/time; this is operational state, not a revival of the removed general audit log. Exclude spam from active counts. If no active submission remains, close the item as rejected with reason category spam. A malicious submission attached to a legitimate report must not close the legitimate report. For account history, a submission marked spam displays a neutral rejected outcome regardless of the shared item’s later status; never expose internal spam notes. Ordinary incorrect-but-good-faith reports use the existing rejection path. No bulk candidate-data edits and no automatic permanent reporter bans.

For seven days after resolution, an exact report fingerprint against an unchanged field is acknowledged as already reviewed without inserting a submission or linking a new reporter to the closed item; return a neutral already-reviewed message without exposing other reports, private resolution notes or reporter identities. Check this resolved-repeat rule before attaching to any newer pending item, under the same per-target transaction lock used for submission and resolution. This suppression does not create an account-history entry. Capture a fingerprint of the published field value (ward for ward flags) at resolution. Changed public data or materially different submitted text is eligible for a new pending item subject to the same limits. Changed text is not proof of new evidence; curators decide. Show recent prior resolutions beside reopened items to make this evasion cheap to identify. Do not globally lock a field after rejection.

## Operations and delivery

Add an environment-controlled `FLAGS_SUBMISSIONS_PAUSED` switch for temporary attack response, returning a localized retry-later response while reads and curator resolution keep working. It applies only to new public submissions, not other contribution routes. Runbook explains how to toggle/reload it and recover. Never acknowledge a paused request as saved.

Expose aggregate counters in the existing admin area: accepted reports, duplicates, CAPTCHA failures/provider errors, rate-limit refusals, spam dispositions and pending queue size/oldest age. Include a simple spike warning comparing recent accepted volume with its preceding interval; do not add outbound alerts or a new monitoring service. Persist bounded hourly counters (30-day retention) without report content or identifiers. Siva/admin checks these during rollout; curators work the queue. Document how to adjust limits and investigate shared-network false positives.

Implementation updates schema/migration, flag API and library, cookie initialization, rate-limiter, proxy config, CAPTCHA integration, modal, curator loaders/actions/screens, account/erasure null handling, admin counters, EN/KN strings and privacy/editorial text. Update AGENTS.md, overview, milestones, architecture, curator guide and runbook to replace login-only flagging claims. Keep unrelated stale documentation outside scope.

Verification must cover migration of existing reports; anonymous and signed-in submissions; invalid targets; request bounds; trusted proxy handling; CAPTCHA failure, quota and timeout; duplicate retries; concurrent duplicate and limit races; shared-network behavior; spam attached to valid reports; resolved-repeat suppression and changed-data reopening; pagination; privacy/erasure; pause mode; and public-page cache invariants. Use a session-owned test database. Run typecheck, relevant tests and translation hash checks. Browser-check the actual public modal and changed curator/admin screens at desktop and mobile widths with agent-browser. No UI code has changed at design time.

Use branch codex/anonymous-flags and its isolated worktree/Compose stack. Before integration inspect changes from other sessions. Commit, merge and push only after the owner's single integration approval; deployment is a separate action.

## Decisions intentionally left to the builder

Choose exact table/index names, transaction lock mechanism and counter implementation, provided bounds and concurrency semantics above hold. Reuse existing shared UI components. Choose a deterministic content-value serialization for the resolution fingerprint that covers the displayed value and its status in both languages. Keep thresholds configurable and validation strict. No requirement for a new framework or separate service.
