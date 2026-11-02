import { sql } from 'drizzle-orm';
import { candidates } from '../db/schema';

/** One identity source for lists, profiles, comparisons and curator search.
 * English columns on candidates are a bootstrap/search projection for records
 * created before report-card fields existed. Kannada comes only from the same
 * report-card row as the English value, never from the retired core inputs.
 * The candidate_field_uq index keeps these lookups bounded per candidate.
 */
export function candidateIdentitySelection() {
  return {
    nameEn: sql<string>`coalesce((select value_en from candidate_fields where candidate_id = "candidates"."id" and field_key = 'full_name'), ${candidates.nameEn})`,
    nameKn: sql<string | null>`(select value_kn from candidate_fields where candidate_id = "candidates"."id" and field_key = 'full_name' and not not_declared and not unreadable)`,
    partyEn: sql<string>`coalesce((select value_en from candidate_fields where candidate_id = "candidates"."id" and field_key = 'party'), ${candidates.partyEn})`,
    partyKn: sql<string | null>`(select value_kn from candidate_fields where candidate_id = "candidates"."id" and field_key = 'party' and not not_declared and not unreadable)`,
  };
}
