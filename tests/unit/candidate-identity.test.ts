import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { eq, inArray } from 'drizzle-orm';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '../../src/db/schema';
import { candidateIdentitySelection } from '../../src/lib/candidate-identity';
import { publishAffidavitFields } from '../../src/lib/affidavit-publish';
import { searchCurator } from '../../src/lib/curator';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL required; see AGENTS.md');
const client = postgres(process.env.DATABASE_URL, { max: 1 });
const db = drizzle(client, { schema });
const wardId = 99871;
const ids: number[] = [];
beforeAll(async () => {
  await migrate(db, { migrationsFolder: './drizzle' });
  await db.insert(schema.wards).values({ id: wardId, nameEn: '1 - Identity Test', nameKn: 'ಪರೀಕ್ಷೆ', corporation: 'north', zone: 'Test', boundaryRef: 'identity-test' }).onConflictDoNothing();
});
afterAll(async () => {
  if (ids.length) {
    await db.delete(schema.candidateFields).where(inArray(schema.candidateFields.candidateId, ids));
    await db.delete(schema.candidates).where(inArray(schema.candidates.id, ids));
  }
  await db.delete(schema.wards).where(eq(schema.wards.id, wardId));
  await client.end();
});
async function candidate() {
  const [c] = await db.insert(schema.candidates).values({
    wardId, slug: 'identity-test-' + crypto.randomUUID(),
    nameEn: 'Old Name (FICTIONAL)', nameKn: 'ಹಳೆಯ ಹೆಸರು',
    partyEn: 'Demo Party', partyKn: 'ಡೆಮೊ ಪಕ್ಷ',
  }).returning();
  ids.push(c.id);
  return c;
}
async function identity(id: number) {
  return (await db.select(candidateIdentitySelection()).from(schema.candidates).where(eq(schema.candidates.id, id)))[0];
}
describe('report-card identity', () => {
  it('reads both languages from report-card rows and searches the same Kannada name', async () => {
    const c = await candidate();
    await db.insert(schema.candidateFields).values([
      { candidateId: c.id, fieldKey: 'full_name', valueEn: 'Corrected Name (FICTIONAL)', valueKn: 'ಸರಿಪಡಿಸಿದಪರೀಕ್ಷೆ' },
      { candidateId: c.id, fieldKey: 'party', valueEn: 'Demo Party B', valueKn: 'ಡೆಮೊ ಪಕ್ಷ ಬಿ' },
    ]);
    expect(await identity(c.id)).toEqual({ nameEn: 'Corrected Name (FICTIONAL)', nameKn: 'ಸರಿಪಡಿಸಿದಪರೀಕ್ಷೆ', partyEn: 'Demo Party B', partyKn: 'ಡೆಮೊ ಪಕ್ಷ ಬಿ' });
    expect((await searchCurator('ಸರಿಪಡಿಸಿದಪರೀಕ್ಷೆ'))!.candidates.some(row => row.id === c.id)).toBe(true);
    await db.transaction(tx => publishAffidavitFields(tx, { userId: null, role: 'system' }, c.id,
      [{ key: 'full_name', status: 'value', text: 'Another Name (FICTIONAL)' }], { sourceUrl: '/media/test/affidavit', checked: false }));
    expect((await identity(c.id)).nameKn).toBeNull();
    expect((await identity(c.id)).nameEn).toBe('Another Name (FICTIONAL)');
  });

  it('backfills legacy translations without replacing current translations or attaching stale ones', async () => {
    const legacy = await candidate();
    const current = await candidate();
    const changed = await candidate();
    await db.insert(schema.candidateFields).values([
      { candidateId: current.id, fieldKey: 'full_name', valueEn: current.nameEn, valueKn: 'ಪ್ರಸ್ತುತ ಹೆಸರು', translationStatus: 'manual' },
      { candidateId: changed.id, fieldKey: 'full_name', valueEn: 'Changed Name', valueKn: null },
    ]);
    const migration = readFileSync('drizzle/0014_report_card_identity.sql', 'utf8');
    await client.unsafe(migration);
    await client.unsafe(migration); // reruns must preserve the same result
    expect((await identity(legacy.id)).nameKn).toBe(legacy.nameKn);
    expect((await identity(legacy.id)).partyKn).toBe(legacy.partyKn);
    expect((await identity(current.id)).nameKn).toBe('ಪ್ರಸ್ತುತ ಹೆಸರು');
    expect((await identity(changed.id)).nameKn).toBeNull();
    const [field] = await db.select().from(schema.candidateFields).where(eq(schema.candidateFields.candidateId, legacy.id));
    expect(field.checkedBy).toBeNull();
    expect(field.checkedAt).toBeNull();
  });
});
