import Ajv2020 from 'ajv/dist/2020';
import fs from 'fs';
import path from 'path';

import { buildActivityExport, parseActivityFile, type ActivityTrip } from './activityFormat';
import schema from './activityFormat.schema.json';
import { AI_INSTRUCTIONS, EXAMPLE_ACTIVITY_FILE } from './activityTemplate';
import { SUBKINDS } from './tripItem';
import type { TripItem } from './tripItem';

/**
 * The published contract and the app must say the same thing: the JSON Schema in the docs is the
 * one the app shares, the examples in the docs import cleanly, and the schema and the parser agree
 * on what is acceptable.
 */

const trip: ActivityTrip = { defaultTz: 'Europe/Helsinki', startDate: '2026-11-20', endDate: '2026-11-24' };
const root = path.resolve(__dirname, '../..');
const validate = new Ajv2020({ allErrors: true, allowUnionTypes: true, multipleOfPrecision: 6 }).compile(schema);

const imports = (document: unknown) => {
  const result = parseActivityFile(JSON.stringify(document), trip);
  if (!result.ok) return { fatal: result.reason, clean: false };
  const clean =
    result.ignored.length === 0 &&
    result.activities.every((a) => a.errors.length === 0 && a.ignored.length === 0);
  return { fatal: null, clean, result };
};

describe('the published schema', () => {
  it('is the file in docs/schema, byte for byte in content', () => {
    const published = JSON.parse(
      fs.readFileSync(path.join(root, 'docs/schema/travel-organizer-activities-v1.schema.json'), 'utf8'),
    );
    expect(published).toEqual(schema);
  });

  it('lists exactly the app’s types', () => {
    const types = schema.$defs.activity.properties.type.enum.filter((t) => t !== null);
    const appTypes = Object.entries(SUBKINDS)
      .filter(([kind]) => kind !== 'task')
      .flatMap(([, list]) => list);
    expect([...types].sort()).toEqual([...appTypes].sort());
  });
});

describe('the example and the AI instructions', () => {
  it('validate against the schema and import with no warning at all', () => {
    expect(validate(EXAMPLE_ACTIVITY_FILE)).toBe(true);
    const { fatal, clean, result } = imports(EXAMPLE_ACTIVITY_FILE);
    expect(fatal).toBeNull();
    expect(clean).toBe(true);
    expect(result!.activities.every((a) => a.warnings.length === 0)).toBe(true);
  });

  it('carry the example itself, and say nothing about the database', () => {
    expect(AI_INSTRUCTIONS).toContain(JSON.stringify(EXAMPLE_ACTIVITY_FILE, null, 2));
    for (const internal of ['sqlite', 'database', 'trip_items', 'subkind', 'minor units', '_id', 'uuid']) {
      expect(AI_INSTRUCTIONS.toLowerCase()).not.toContain(internal);
    }
    // "confirmed" appears only to forbid it.
    expect(AI_INSTRUCTIONS).toMatch(/Never write "booked" or "confirmed"/);
  });

  it('match every JSON example in docs/ai-activities-format.md', () => {
    const doc = fs.readFileSync(path.join(root, 'docs/ai-activities-format.md'), 'utf8');
    const blocks = [...doc.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => JSON.parse(m[1]));
    expect(blocks.length).toBeGreaterThan(0);
    for (const block of blocks) {
      expect(validate(block)).toBe(true);
      expect(imports(block).clean).toBe(true);
    }
    // The rules, word for word, as the app copies them.
    expect(doc).toContain(AI_INSTRUCTIONS.split('\nExample:')[0]);
  });
});

describe('schema and parser agree', () => {
  const base = { format: 'travel-organizer-activities', version: 1 };
  const bad: [string, unknown][] = [
    ['wrong format', { ...base, format: 'other', activities: [{ title: 'x' }] }],
    ['newer version', { ...base, version: 2, activities: [{ title: 'x' }] }],
    ['no activities', { ...base, activities: [] }],
    ['no title', { ...base, activities: [{}] }],
    ['a to-do', { ...base, activities: [{ title: 'x', kind: 'task' }] }],
    ['booked', { ...base, activities: [{ title: 'x', status: 'booked' }] }],
    ['bad time', { ...base, activities: [{ title: 'x', date: '2026-11-21', startTime: '25:00' }] }],
    ['bad date shape', { ...base, activities: [{ title: 'x', date: '21.11.2026' }] }],
    ['latitude alone', { ...base, activities: [{ title: 'x', location: { latitude: 1 } }] }],
    ['latitude out of range', { ...base, activities: [{ title: 'x', location: { latitude: 91, longitude: 0 } }] }],
    ['three decimals', { ...base, activities: [{ title: 'x', price: { amount: '1.234', currency: 'EUR' } }] }],
    ['negative', { ...base, activities: [{ title: 'x', price: { amount: -1, currency: 'EUR' } }] }],
    ['lower-case currency', { ...base, activities: [{ title: 'x', price: { amount: 1, currency: 'eur' } }] }],
    ['no currency', { ...base, activities: [{ title: 'x', price: { amount: 1 } }] }],
    ['per-person price', { ...base, activities: [{ title: 'x', price: { amount: 1, currency: 'EUR', perPerson: 1 } }] }],
    ['javascript link', { ...base, activities: [{ title: 'x', links: [{ url: 'javascript:alert(1)' }] }] }],
    ['unknown field', { ...base, activities: [{ title: 'x', bookingReference: 'ABC' }] }],
    ['id', { ...base, activities: [{ title: 'x', id: 'abc' }] }],
    ['title too long', { ...base, activities: [{ title: 'a'.repeat(121) }] }],
  ];

  it.each(bad)('%s: refused by both', (_, document) => {
    expect(validate(document)).toBe(false);
    expect(imports(document).clean).toBe(false);
  });

  it('an exported file is valid against the schema', () => {
    const item = {
      id: 'x', tripId: 't', kind: 'transport', subkind: 'flight', status: 'confirmed', priority: null,
      title: 'Flight', start: { local: '2026-11-20T07:10', tz: 'Europe/Sofia', precision: 'time' },
      end: { local: '2026-11-20T10:40', tz: 'Europe/Helsinki', precision: 'time' },
      startTzOverride: 'Europe/Sofia', endTzOverride: 'Europe/Helsinki', completedAt: null,
      locationName: 'SOF', address: 'Sofia Airport', latitude: 42.69, longitude: 23.41,
      confirmationCode: 'X', notes: 'n', details: { from: 'SOF', to: 'RVN' }, priceAmount: 12345,
      priceCurrency: 'EUR', isPaid: true, createdAt: '', updatedAt: '',
    } as TripItem;
    const built = buildActivityExport([item], new Map([['x', [{ label: 'L', url: 'https://a.b', subtype: 'website' as const }]]]), trip);
    expect(validate(built.document)).toBe(true);
  });
});
