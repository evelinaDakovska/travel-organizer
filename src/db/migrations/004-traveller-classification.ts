/**
 * Adult / Child / Not specified traveller classification.
 * Purely additive: two new columns on travellers and trip_travellers, with CHECK constraints.
 * Profile classification is the default copied into trip_travellers, which can be overridden per-trip.
 */
export const sql = /* sql */ `
ALTER TABLE travellers ADD COLUMN classification TEXT NOT NULL DEFAULT 'unspecified' CHECK (classification IN ('adult', 'child', 'unspecified'));

ALTER TABLE trip_travellers ADD COLUMN classification TEXT NOT NULL DEFAULT 'unspecified' CHECK (classification IN ('adult', 'child', 'unspecified'));
`;
