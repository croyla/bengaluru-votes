import { beforeAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { randomUUID } from 'node:crypto';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../src/db/client';
import * as s from '../../src/db/schema';
import * as flags from '../../src/lib/flags';

const wardId = 99762;
let admin: number;
let user: number;
const reporter = (extra = {}) => ({ browserHash: randomUUID(), networkHash: randomUUID(), userId: null, ...extra });
async function target() {
  const [c] = await db.insert(s.candidates).values({ slug: randomUUID(), wardId, nameEn: 'Demo (FICTIONAL)', partyEn: 'Demo Party A' }).returning();
  return `candidate:${c!.id}:age`;
}
const input = (targetRef: string, detail = 'Age differs from the affidavit, page 2.') => ({ targetType: 'candidate_field' as const, targetRef, detail });
beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' });
  await db.insert(s.wards).values({ id: wardId, nameEn: 'Test', nameKn: 'ಪರೀಕ್ಷೆ', corporation: 'south', zone: 'test', boundaryRef: 'test' }).onConflictDoNothing();
  const rows = await db.insert(s.users).values([
    { email: `${randomUUID()}@example.com`, role: 'admin', status: 'active' },
    { email: `${randomUUID()}@example.com`, role: 'citizen', status: 'active' },
  ]).returning();
  admin = rows[0]!.id; user = rows[1]!.id;
});
describe('anonymous flag admission', () => {
  it('accepts an anonymous report and retries it without inflating counts', async () => {
    const ref = await target(), who = reporter();
    const first = await flags.submitPublicFlag(who, input(ref));
    expect(first.state).toBe('accepted');
    expect(await flags.submitPublicFlag(who, input(ref))).toEqual({ ...first, state: 'duplicate' });
    expect((await flags.submitPublicFlag(who, input(ref, 'Different claim'))).state).toBe('already_reported');
    const rows = await db.select().from(s.flagSubmissions).where(eq(s.flagSubmissions.flagItemId, first.flagItemId!));
    expect(rows).toHaveLength(1); expect(rows[0]!.userId).toBeNull();
  });
  it('serializes simultaneous duplicates', async () => {
    const ref = await target(), who = reporter();
    const results = await Promise.all(Array.from({ length: 6 }, () => flags.submitPublicFlag(who, input(ref))));
    expect(results.filter(r => r.state === 'accepted')).toHaveLength(1);
  });
  it('atomically allows only three new reports in ten minutes', async () => {
    const refs = await Promise.all(Array.from({ length: 6 }, target)), who = reporter();
    const results = await Promise.allSettled(refs.map(ref => flags.submitPublicFlag(who, input(ref))));
    expect(results.filter(r => r.status === 'fulfilled')).toHaveLength(3);
    expect(results.filter(r => r.status === 'rejected' && r.reason.message === 'flag_rate_limited')).toHaveLength(3);
  });
  it('changing cookies cannot escape a signed-in account burst limit', async () => {
    const refs = await Promise.all(Array.from({ length: 4 }, target));
    for (const ref of refs.slice(0, 3)) await flags.submitPublicFlag(reporter({ userId: user }), input(ref));
    await expect(flags.submitPublicFlag(reporter({ userId: user }), input(refs[3]!))).rejects.toThrow('flag_rate_limited');
  });
  it('suppresses exact resolved repeats without adding a reporter to private history', async () => {
    const ref = await target();
    const first = await flags.submitPublicFlag(reporter(), input(ref));
    await flags.resolveFlag({ userId: admin, role: 'admin' }, first.flagItemId!, { accept: false, reason: 'Private curator reasoning' });
    expect(await flags.submitPublicFlag(reporter(), input(ref))).toEqual({ state: 'already_reviewed' });
    expect(await db.select().from(s.flagSubmissions).where(eq(s.flagSubmissions.flagItemId, first.flagItemId!))).toHaveLength(1);
    expect((await flags.submitPublicFlag(reporter(), input(ref, 'New evidence on page 3'))).state).toBe('accepted');
    expect(await flags.submitPublicFlag(reporter(), input(ref))).toEqual({ state: 'already_reviewed' });
  });
  it('allows a previously resolved report after the displayed field changes', async () => {
    const ref = await target();
    const first = await flags.submitPublicFlag(reporter(), input(ref));
    await flags.resolveFlag({ userId: admin, role: 'admin' }, first.flagItemId!, { accept: false, reason: 'checked' });
    await db.insert(s.candidateFields).values({ candidateId: Number(ref.split(':')[1]), fieldKey: 'age', valueEn: 'Different value', valueKn: 'ಬದಲಾವಣೆ', sourceUrl: 'https://example.com' });
    expect((await flags.submitPublicFlag(reporter(), input(ref))).state).toBe('accepted');
  });
});

describe('curator abuse controls', () => {
  it('marks only selected submissions as spam and preserves a legitimate report', async () => {
    const ref = await target();
    const bad = await flags.submitPublicFlag(reporter(), input(ref,'Spam'));
    await flags.submitPublicFlag(reporter(), input(ref,'Affidavit page 4 contradicts the age'));
    const rows = await db.select().from(s.flagSubmissions).where(eq(s.flagSubmissions.flagItemId,bad.flagItemId!));
    await flags.markFlagSpam({ userId:admin,role:'admin' },bad.flagItemId!,[rows[0]!.id],'Repeated irrelevant content');
    const [item] = await db.select().from(s.flagItems).where(eq(s.flagItems.id,bad.flagItemId!));
    expect(item!.status).toBe('pending');
    await flags.markFlagSpam({ userId:admin,role:'admin' },bad.flagItemId!,[rows[1]!.id],'Also irrelevant');
    const [closed] = await db.select().from(s.flagItems).where(eq(s.flagItems.id,bad.flagItemId!));
    expect(closed!.status).toBe('rejected');
  });
  it('rejects moderation IDs belonging to another item', async () => {
    const a = await flags.submitPublicFlag(reporter(), input(await target()));
    const b = await flags.submitPublicFlag(reporter(), input(await target()));
    const [row] = await db.select().from(s.flagSubmissions).where(eq(s.flagSubmissions.flagItemId,b.flagItemId!));
    await expect(flags.markFlagSpam({ userId:admin,role:'admin' },a.flagItemId!,[row!.id],'spam')).rejects.toThrow('invalid_spam_selection');
  });
  it('does not display accepted outcomes or private moderation notes for spam reporters', async () => {
    const [u] = await db.insert(s.users).values({email:`${randomUUID()}@example.com`}).returning();
    const result = await flags.submitPublicFlag(reporter({userId:u!.id}),input(await target()));
    const [row] = await db.select().from(s.flagSubmissions).where(eq(s.flagSubmissions.flagItemId,result.flagItemId!));
    await flags.markFlagSpam({userId:admin,role:'admin'},result.flagItemId!,[row!.id],'Private abuse evidence');
    await db.update(s.flagItems).set({status:'accepted'}).where(eq(s.flagItems.id,result.flagItemId!));
    const {loadSubmissions} = await import('../../src/lib/account-flow');
    const [visible] = await loadSubmissions(u!.id);
    expect(visible!.status).toBe('rejected'); expect(visible!.resolutionReason).toBeNull();
  });
  it('cleans abuse metadata even when general retention is disabled', async () => {
    const abuse = await import('../../src/lib/flag-abuse');
    const result = await flags.submitPublicFlag(reporter(),input(await target()));
    await db.execute(sql`update flag_submissions set created_at=now()-interval '31 days' where flag_item_id=${result.flagItemId!}`);
    await db.execute(sql`insert into flag_admissions(network_hash,created_at) values('expired-network',now()-interval '49 hours')`);
    process.env.RETENTION_ENABLED='false';
    await abuse.cleanupFlagAbuse();
    const [row] = await db.select().from(s.flagSubmissions).where(eq(s.flagSubmissions.flagItemId,result.flagItemId!));
    expect(row!.browserHash).toBeNull(); expect(row!.detail).toBeTruthy();
    expect(await db.execute(sql`select * from flag_admissions where network_hash='expired-network'`)).toHaveLength(0);
  });
});

describe('report budgets and bounded review', () => {
  it('enforces the rolling daily limit independently of the burst allowance', async () => {
    const who=reporter();
    await db.execute(sql`insert into flag_admissions(browser_hash,network_hash,created_at) select ${who.browserHash},${who.networkHash},now()-interval '1 hour' from generate_series(1,10)`);
    await expect(flags.submitPublicFlag(who,input(await target()))).rejects.toThrow('flag_rate_limited');
    await db.execute(sql`update flag_admissions set created_at=now()-interval '25 hours' where browser_hash=${who.browserHash}`);
    expect((await flags.submitPublicFlag(who,input(await target()))).state).toBe('accepted');
  });
  it('permits multiple browsers on a network but caps new reports at 100', async () => {
    const networkHash=randomUUID();
    await db.execute(sql`insert into flag_admissions(network_hash) select ${networkHash} from generate_series(1,99)`);
    expect((await flags.submitPublicFlag(reporter({networkHash}),input(await target()))).state).toBe('accepted');
    await expect(flags.submitPublicFlag(reporter({networkHash}),input(await target()))).rejects.toThrow('flag_rate_limited');
  });
  it('bounds queue pages to 50 and submission pages to 20 with no overlap', async () => {
    const refs=await Promise.all(Array.from({length:51},target));
    const items=await db.insert(s.flagItems).values(refs.map(targetRef=>({wardId,targetType:'candidate_field' as const,targetRef}))).returning();
    await db.insert(s.flagSubmissions).values(Array.from({length:21},(_,i)=>({flagItemId:items[0]!.id,detail:`Test report ${i}`})));
    const {loadQueueList,loadQueueItem}=await import('../../src/lib/curator');
    const first=await loadQueueList('recent',1), second=await loadQueueList('recent',2);
    expect(first).toHaveLength(50); expect(second.length).toBeGreaterThan(0);
    expect(second.some(item=>first.some(prior=>prior.id===item.id))).toBe(false);
    const a=await loadQueueItem(items[0]!.id,1), b=await loadQueueItem(items[0]!.id,2);
    expect(a!.submissions).toHaveLength(20); expect(a!.hasMore).toBe(true);
    expect(b!.submissions).toHaveLength(1); expect(b!.hasMore).toBe(false);
  });
  it('records aggregate counters without reporter identifiers', async () => {
    const {loadFlagMetrics}=await import('../../src/lib/flag-abuse');
    const snapshot=await loadFlagMetrics();
    expect(snapshot.counts.accepted).toBeGreaterThan(0);
    expect(snapshot.counts.spam).toBeGreaterThan(0);
    expect(snapshot.pending).toBeGreaterThan(0);
    expect(JSON.stringify(snapshot)).not.toContain('browserHash');
  });
});
