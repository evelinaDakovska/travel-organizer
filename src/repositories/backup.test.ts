import Database from 'better-sqlite3';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { MIGRATIONS } from '../db/migrations';
import { asyncDatabase } from '../db/testing/asyncDatabase';
import { readAllTables } from './backup';

const now = '2026-10-13T09:00:00.000Z';

const insertTrip = (db: Database.Database, id: string) =>
  db
    .prepare(
      `INSERT INTO trips (id, name, start_date, end_date, default_tz, created_at, updated_at)
       VALUES (?, ?, '2026-11-20', '2026-11-24', 'Europe/Helsinki', ?, ?)`,
    )
    .run(id, id, now, now);

const insertItem = (db: Database.Database, id: string, tripId: string) =>
  db
    .prepare(
      `INSERT INTO trip_items (id, trip_id, kind, title, created_at, updated_at)
       VALUES (?, ?, 'task', ?, ?, ?)`,
    )
    .run(id, tripId, id, now, now);

describe('readAllTables', () => {
  let dir: string;
  let file: string;
  let main: Database.Database;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'backup-test-'));
    file = join(dir, 'test.db');
    main = new Database(file);
    main.pragma('journal_mode = WAL');
    main.pragma('foreign_keys = ON');
    for (const migration of MIGRATIONS) main.exec(migration.sql);
    insertTrip(main, 'lapland');
  });

  afterEach(() => {
    main.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('reads every table from one snapshot, whatever is written meanwhile (A4)', async () => {
    // A connection whose first read is followed at once by a write on the main connection: a
    // new trip and its item, landing between the export's reads of trips and of items.
    const openConnection = () => {
      const connection = new Database(file);
      const prepare = connection.prepare.bind(connection);
      let written = false;
      connection.prepare = ((sql: string) => {
        const statement = prepare(sql);
        const all = statement.all.bind(statement);
        statement.all = ((...params: unknown[]) => {
          const rows = all(...params);
          if (!written) {
            written = true;
            insertTrip(main, 'milan');
            insertItem(main, 'pack', 'milan');
          }
          return rows;
        }) as typeof statement.all;
        return statement;
      }) as typeof connection.prepare;
      return connection;
    };

    const tables = await readAllTables(asyncDatabase(main, { openConnection }));

    expect(tables.trips.map((trip) => trip.id)).toEqual(['lapland']);
    expect(tables.tripItems).toEqual([]);
    // The write itself went through.
    expect(main.prepare('SELECT COUNT(*) AS n FROM trip_items').get()).toEqual({ n: 1 });
  });

  it('reads everything that is there', async () => {
    insertItem(main, 'pack', 'lapland');
    const tables = await readAllTables(
      asyncDatabase(main, { openConnection: () => new Database(file) }),
    );
    expect(tables.trips).toHaveLength(1);
    expect(tables.tripItems.map((item) => item.id)).toEqual(['pack']);
    expect(tables.settings).toEqual([]);
  });
});
