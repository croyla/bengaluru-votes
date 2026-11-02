-- Preserve legacy identity translations before public pages stop reading the
-- separate candidate Kannada columns. Do not overwrite a report-card translation
-- or attach an old translation to a corrected English value.
INSERT INTO candidate_fields
  (candidate_id, field_key, value_en, value_kn, value_data, translation_status)
SELECT c.id, identity.field_key, identity.value_en, nullif(btrim(identity.value_kn), ''),
       jsonb_build_object('key', identity.field_key, 'status', 'value', 'text', identity.value_en),
       CASE WHEN nullif(btrim(identity.value_kn), '') IS NULL THEN 'pending'::translation_status
            ELSE 'manual'::translation_status END
FROM candidates c
CROSS JOIN LATERAL (VALUES
  ('full_name', c.name_en, c.name_kn),
  ('party', c.party_en, c.party_kn)
) AS identity(field_key, value_en, value_kn)
ON CONFLICT (candidate_id, field_key) DO UPDATE
SET value_kn = EXCLUDED.value_kn, translation_status = 'manual'
WHERE nullif(btrim(candidate_fields.value_kn), '') IS NULL
  AND EXCLUDED.value_kn IS NOT NULL
  AND candidate_fields.value_en = EXCLUDED.value_en
  AND NOT candidate_fields.not_declared AND NOT candidate_fields.unreadable;
-- Legacy columns remain dormant so this data-only migration does not destroy
-- older content. Runtime display and editing use candidate_fields exclusively
-- for Kannada; candidates.name_en/party_en remain the English search projection.
