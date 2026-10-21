import Database from 'better-sqlite3';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { FILES, now, snapshot } from '../db/testing/tripFixture';
import { buildExportDocument, planImport } from '../domain/export';
import { buildPlanningContext, DEFAULT_PLANNING_OPTIONS } from '../domain/planningContext';
import { applyImport } from './backup';
import { readPlanningInput } from './planningContext';

jest.mock('expo-crypto', () => ({ randomUUID: () => crypto.randomUUID() }));

/**
 * Plan with AI reads one trip from a real database (better-sqlite3, every migration) holding the
 * fixture's two trips, travellers, notes, expenses, files and Me — and writes nothing.
 */

async function setup() {
  const raw = new Database(':memory:');
  raw.pragma('foreign_keys = ON');
  for (const m of MIGRATIONS) raw.exec(m.sql);
  const db = asyncDatabase(raw);
  await applyImport(db, planImport(buildExportDocument(snapshot(), { exportedAt: now }), [], 'merge', Object.keys(FILES)));
  return { raw, db };
}

const dump = (raw: Database.Database) =>
  JSON.stringify(
    (raw.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]).map(
      ({ name }) => [name, raw.prepare(`SELECT * FROM ${name} ORDER BY rowid`).all()],
    ),
  );

describe('readPlanningInput', () => {
  it('reads only the one trip and changes nothing', async () => {
    const { raw, db } = await setup();
    const before = dump(raw);
    const input = await readPlanningInput(db, 'lap');
    expect(dump(raw)).toBe(before);
    expect(input).not.toBeNull();
    expect(input!.trip.name).toBe('Lapland');
    // Rome's item is not there; the task-free, cancel-free allowlist of Lapland's is.
    expect(input!.items.map((item) => item.title).sort()).toEqual(['cafe', 'leg1', 'leg2', 'safari']);
    // Classifications only, per trip (Mitko is a child profile but an adult on this trip).
    expect(input!.travellers).toEqual(['adult', 'adult', 'adult']);
    expect(input!.secrets).toEqual(['ABC123', 'ABC123', 'ABC123', 'ABC123']);
  });

  it('builds a context with nothing private from the fixture, for every switch', async () => {
    const { db } = await setup();
    const input = (await readPlanningInput(db, 'lap'))!;
    for (const stays of [false, true]) {
      for (const travellers of [false, true]) {
        const text = buildPlanningContext(input, { ...DEFAULT_PLANNING_OPTIONS, stays, travellers });
        for (const secret of ['ABC123', 'Evelina', 'Misho', 'Mitko', 'Rome only', 'Door code', '4417', 'Rome secret', 'K-Market', 'media/', 'ticket.pdf', 'receipt', 'example.com', 'colosseum', 'j-1', '180.00', 'EUR', 'me_traveller',
          // 3D-1: payments and linked expenses are in the fixture and never in the context.
          'Deposit', 'Safari balance', '200.00', '50.00', '60.00']) {
          expect([secret, text.includes(secret)]).toEqual([secret, false]);
        }
      }
    }
  });

  it('is null for a trip that is gone', async () => {
    const { db } = await setup();
    expect(await readPlanningInput(db, 'nope')).toBeNull();
  });
});
