/**
 * Conversion lifecycle for legacy trip traveller names.
 * Tracks legacy names converted to profiles on a trip so they never reappear
 * under "Names from older trip notes" even if the linked profile is renamed or removed.
 */
export const sql = /* sql */ `
ALTER TABLE trips ADD COLUMN converted_travellers TEXT NOT NULL DEFAULT '[]';
`;
