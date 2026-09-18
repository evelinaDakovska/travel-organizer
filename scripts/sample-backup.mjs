/**
 * Writes sample-backup.zip: the two fixture trips from docs/plan.md ("Sample data") at realistic
 * volume — about 50 items and 30 PDFs — in the app's own backup format, so it goes in through
 * Import like a real backup. Used for the S8 performance and offline passes.
 *
 * Everything in it is invented. Never put real bookings here (CLAUDE.md §9).
 *
 *   node scripts/sample-backup.mjs [out.zip]
 */

import { TZDate } from '@date-fns/tz';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { zipSync, strToU8 } from 'fflate';

const out = process.argv[2] ?? 'sample-backup.zip';
const now = new Date().toISOString();

/** Same derivation as src/domain/time.ts toInstant: wall clock in a zone → UTC sort key. */
function instant(local, tz) {
  const [date, time] = local.split('T');
  const [y, m, d] = date.split('-').map(Number);
  const [hh, mm] = time ? time.split(':').map(Number) : [0, 0];
  return new Date(new TZDate(y, m - 1, d, hh, mm, tz).getTime()).toISOString();
}

/** A small valid one-page PDF showing a few lines of text. */
function pdf(lines) {
  const text = lines
    .map((line, i) => `BT /F1 ${i === 0 ? 20 : 12} Tf 50 ${760 - i * 26} Td (${line.replace(/[()\\]/g, '')}) Tj ET`)
    .join('\n');
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ];
  let body = '%PDF-1.4\n';
  const offsets = [];
  objects.forEach((obj, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${obj}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  body += offsets.map((o) => `${String(o).padStart(10, '0')} 00000 n \n`).join('');
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return strToU8(body);
}

const tables = { trips: [], tripItems: [], tripNotes: [], resources: [], settings: [] };
const files = new Map();

function trip(name, destination, start, end, tz, travellers) {
  const row = {
    id: randomUUID(),
    name,
    destination,
    start_date: start,
    end_date: end,
    default_tz: tz,
    cover_path: null,
    notes: null,
    traveller_count: travellers.length,
    travellers: JSON.stringify(travellers),
    created_at: now,
    updated_at: now,
  };
  tables.trips.push(row);
  return row;
}

function moment(local, tz, tripTz) {
  if (!local) return { local: null, tz: null, precision: null, utc: null };
  return {
    local,
    tz: tz && tz !== tripTz ? tz : null,
    precision: local.includes('T') ? 'time' : 'date',
    utc: instant(local, tz ?? tripTz),
  };
}

let sort = 0;
function item(t, fields, docs = []) {
  const start = moment(fields.start, fields.startTz, t.default_tz);
  const end = moment(fields.end, fields.endTz, t.default_tz);
  const row = {
    id: randomUUID(),
    trip_id: t.id,
    kind: fields.kind,
    subkind: fields.subkind ?? null,
    status: fields.status ?? 'confirmed',
    priority: fields.priority ?? null,
    title: fields.title,
    start_local: start.local,
    start_tz: start.tz,
    start_precision: start.precision,
    start_utc: start.utc,
    end_local: end.local,
    end_tz: end.tz,
    end_precision: end.precision,
    end_utc: end.utc,
    completed_at: null,
    location_name: fields.place ?? null,
    address: fields.address ?? null,
    latitude: null,
    longitude: null,
    confirmation_code: fields.code ?? null,
    notes: fields.notes ?? null,
    details: fields.details ? JSON.stringify(fields.details) : null,
    price_amount: fields.price ?? null,
    price_currency: fields.price ? 'EUR' : null,
    is_paid: fields.price ? 1 : 0,
    created_at: now,
    updated_at: now,
  };
  tables.tripItems.push(row);
  for (const doc of docs) attach({ trip_item_id: row.id }, doc, [fields.title, doc, fields.code ? `Ref ${fields.code}` : 'Sample document']);
  if (fields.link) link({ trip_item_id: row.id }, fields.link);
  return row;
}

function attach(owner, label, lines) {
  const id = randomUUID();
  const storedPath = `media/${randomUUID()}.pdf`;
  const bytes = pdf(lines);
  files.set(storedPath, bytes);
  tables.resources.push({
    id,
    trip_id: owner.trip_id ?? null,
    trip_item_id: owner.trip_item_id ?? null,
    kind: 'file',
    subtype: /boarding|ticket/i.test(label) ? 'ticket' : 'generic',
    label,
    url: null,
    stored_path: storedPath,
    file_name: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.pdf`,
    mime_type: 'application/pdf',
    size_bytes: bytes.length,
    sort_order: sort++,
    created_at: now,
  });
}

function link(owner, url) {
  tables.resources.push({
    id: randomUUID(),
    trip_id: owner.trip_id ?? null,
    trip_item_id: owner.trip_item_id ?? null,
    kind: 'link',
    subtype: /maps/.test(url) ? 'maps' : 'website',
    label: new URL(url).hostname.replace(/^www\./, ''),
    url,
    stored_path: null,
    file_name: null,
    mime_type: null,
    size_bytes: null,
    sort_order: sort++,
    created_at: now,
  });
}

function note(t, title, body, pinned = false) {
  tables.tripNotes.push({
    id: randomUUID(),
    trip_id: t.id,
    title,
    body,
    pinned: pinned ? 1 : 0,
    sort_order: tables.tripNotes.length,
    created_at: now,
    updated_at: now,
  });
}

// ── Milan, 19–22 Sep 2026 ─────────────────────────────────────────────────────────────────────
const milan = trip('Milan', 'Italy', '2026-09-19', '2026-09-22', 'Europe/Rome', ['Evelina', 'Sample Friend']);
item(milan, { kind: 'transport', subkind: 'flight', title: 'Flight to Bergamo', start: '2026-09-19T06:10', startTz: 'Europe/Sofia', end: '2026-09-19T07:05', code: 'SMPL01', price: 8900, details: { from: 'Sofia', to: 'Bergamo', number: 'W6 0000', seat: '12A' } }, ['Boarding pass SOF-BGY', 'Booking confirmation']);
item(milan, { kind: 'transport', subkind: 'transfer', title: 'Bus to Milano Centrale', start: '2026-09-19T07:40', end: '2026-09-19T08:40', code: 'BUS123', price: 1000, details: { from: 'Bergamo airport', to: 'Milano Centrale' } }, ['Bus ticket']);
item(milan, { kind: 'stay', subkind: 'hotel', title: 'Hotel Brera (sample)', start: '2026-09-19T15:00', end: '2026-09-22T11:00', code: 'HB-4567', place: 'Brera', address: 'Via Sample 1, Milano', price: 48000 }, ['Hotel confirmation', 'City tax receipt']);
item(milan, { kind: 'activity', subkind: 'museum', title: 'The Last Supper', start: '2026-09-20T10:15', code: 'CEN-889', place: 'Santa Maria delle Grazie', price: 1500 }, ['Last Supper tickets']);
item(milan, { kind: 'activity', subkind: 'attraction', title: 'Duomo rooftops', start: '2026-09-20T15:00', code: 'DUO-221', price: 2000 }, ['Duomo fast track']);
item(milan, { kind: 'food', subkind: 'restaurant', title: 'Dinner at Trattoria Sample', start: '2026-09-20T20:00', code: 'TABLE4', place: 'Navigli' });
item(milan, { kind: 'activity', subkind: 'tour', title: 'Navigli walking tour', start: '2026-09-21T10:00', end: '2026-09-21T12:30', code: 'WALK-9' }, ['Tour voucher']);
item(milan, { kind: 'activity', subkind: 'theatre', title: 'La Scala evening', start: '2026-09-21T20:00', code: 'SCALA-5', price: 9000 }, ['La Scala e-tickets']);
item(milan, { kind: 'task', subkind: 'check-in', title: 'Check in for the flight home', start: '2026-09-21T09:00' });
item(milan, { kind: 'transport', subkind: 'train', title: 'Train to Bergamo', start: '2026-09-22T12:05', end: '2026-09-22T13:00', code: 'TRN-77', details: { from: 'Milano Centrale', to: 'Bergamo' } }, ['Train ticket']);
item(milan, { kind: 'transport', subkind: 'flight', title: 'Flight home', start: '2026-09-22T16:30', end: '2026-09-22T19:20', endTz: 'Europe/Sofia', code: 'SMPL02', details: { from: 'Bergamo', to: 'Sofia', number: 'W6 0001', seat: '14C' } }, ['Boarding pass BGY-SOF']);
for (const [title, kind, subkind, priority] of [
  ['Pasticceria Marchesi', 'food', 'cafe', 'must'],
  ['Luini panzerotti', 'food', 'bakery', 'want'],
  ['Pinacoteca di Brera', 'activity', 'gallery', 'must'],
  ['Bosco Verticale', 'other', 'viewpoint', 'maybe'],
  ['Aperitivo on the Navigli', 'food', 'bar', 'want'],
  ['Sforza Castle', 'activity', 'attraction', 'maybe'],
  ['Mercato Centrale', 'food', 'market', 'maybe'],
]) {
  item(milan, { kind, subkind, title, status: 'idea', priority, link: `https://maps.app.goo.gl/${title.replace(/\W/g, '')}` });
}
attach({ trip_id: milan.id }, 'Travel insurance', ['Travel insurance', 'Policy SAMPLE-0001']);
note(milan, 'Hotel door code', 'Street door 4321, then second floor on the left.', true);
note(milan, 'Packing', 'Adapter, comfortable shoes, light jacket.');

// ── Lapland, 20–24 Nov 2026 ───────────────────────────────────────────────────────────────────
const lapland = trip('Lapland', 'Finland', '2026-11-20', '2026-11-24', 'Europe/Helsinki', ['Evelina', 'Sample Friend']);
item(lapland, { kind: 'transport', subkind: 'flight', title: 'Flight to Helsinki', start: '2026-11-20T09:20', startTz: 'Europe/Sofia', end: '2026-11-20T12:15', code: 'AYSMP1', details: { from: 'Sofia', to: 'Helsinki', number: 'AY 0000', seat: '21F' } }, ['Boarding pass SOF-HEL', 'Flight booking']);
item(lapland, { kind: 'transport', subkind: 'train', title: 'Santa Claus Express (sleeper)', start: '2026-11-20T19:27', end: '2026-11-21T07:40', code: 'VR-SLP-3', price: 24000, details: { from: 'Helsinki', to: 'Rovaniemi', number: 'IC 265', seat: 'Cabin 7' } }, ['Sleeper tickets', 'Cabin details']);
item(lapland, { kind: 'transport', subkind: 'car', title: 'Rental car', start: '2026-11-21T09:00', end: '2026-11-24T08:00', code: 'CAR-5521', place: 'Rovaniemi station', price: 31000 }, ['Rental agreement', 'Insurance certificate']);
item(lapland, { kind: 'stay', subkind: 'guesthouse', title: 'Aurora cabin (sample)', start: '2026-11-21T15:00', end: '2026-11-24T10:00', code: 'CAB-908', place: 'Near Rovaniemi', price: 66000 }, ['Cabin booking', 'Arrival instructions']);
item(lapland, { kind: 'activity', subkind: 'outdoor', title: 'Husky safari', start: '2026-11-21T13:00', end: '2026-11-21T16:00', code: 'HSK-44', price: 29000 }, ['Husky safari voucher']);
item(lapland, { kind: 'activity', subkind: 'attraction', title: 'Santa Claus Village', start: '2026-11-22' });
item(lapland, { kind: 'activity', subkind: 'outdoor', title: 'Northern lights hunt', start: '2026-11-22T21:00', end: '2026-11-23T01:00', code: 'AUR-12', price: 18000 }, ['Aurora tour ticket']);
item(lapland, { kind: 'activity', subkind: 'spa', title: 'Arctic sauna and ice swim', start: '2026-11-23T17:00', code: 'SAU-3' }, ['Sauna booking']);
item(lapland, { kind: 'food', subkind: 'restaurant', title: 'Reindeer dinner (sample)', start: '2026-11-23T19:30', code: 'TBL-2' });
item(lapland, { kind: 'task', subkind: 'document', title: 'Print the car rental voucher', start: '2026-11-18' });
item(lapland, { kind: 'task', subkind: 'packing', title: 'Pack thermal layers', start: '2026-11-19' });
item(lapland, { kind: 'task', subkind: 'check-in', title: 'Check in for the flight home', start: '2026-11-23T10:00' });
item(lapland, { kind: 'transport', subkind: 'flight', title: 'Flight Rovaniemi → Helsinki', start: '2026-11-24T10:45', end: '2026-11-24T12:05', code: 'AYSMP2', details: { from: 'Rovaniemi', to: 'Helsinki', number: 'AY 0001' } }, ['Boarding pass RVN-HEL']);
item(lapland, { kind: 'transport', subkind: 'flight', title: 'Flight home', start: '2026-11-24T14:30', end: '2026-11-24T16:25', endTz: 'Europe/Sofia', code: 'AYSMP3', details: { from: 'Helsinki', to: 'Sofia', number: 'AY 0002' } }, ['Boarding pass HEL-SOF']);
item(lapland, { kind: 'activity', subkind: 'tour', title: 'Snowmobile tour', status: 'cancelled', start: '2026-11-22T10:00', code: 'SNW-1' }, ['Snowmobile voucher (cancelled)']);
for (const [title, kind, subkind, priority] of [
  ['Arktikum museum', 'activity', 'museum', 'must'],
  ['Ranua wildlife park', 'activity', 'attraction', 'want'],
  ['Korvala reindeer farm', 'activity', 'outdoor', 'maybe'],
  ['Café in Rovaniemi centre', 'food', 'cafe', 'want'],
  ['Ounasvaara viewpoint', 'other', 'viewpoint', 'maybe'],
  ['Ice restaurant', 'food', 'restaurant', 'must'],
  ['Christmas market', 'food', 'market', 'maybe'],
  ['Snowshoe hike', 'activity', 'outdoor', 'want'],
]) {
  item(lapland, { kind, subkind, title, status: 'idea', priority, link: `https://maps.app.goo.gl/${title.replace(/\W/g, '')}` });
}
attach({ trip_id: lapland.id }, 'Travel insurance', ['Travel insurance', 'Policy SAMPLE-0002']);
attach({ trip_id: lapland.id }, 'Winter driving guide', ['Winter driving guide', 'Sample document']);
note(lapland, 'Cabin key box', 'Code 2468. Sauna is heated from 16:00.', true);
note(lapland, 'Aurora forecast apps', 'Check the forecast at 18:00 each evening.');

// ── Pack exactly as src/domain/archive.ts does ────────────────────────────────────────────────
const manifest = [...files.keys()].map((storedPath) => ({
  storedPath,
  sizeBytes: files.get(storedPath).length,
  resourceIds: tables.resources.filter((r) => r.stored_path === storedPath).map((r) => r.id),
}));
const document = { formatVersion: 1, app: 'travel-organizer', exportedAt: now, files: manifest, tables };
const entries = { 'backup.json': strToU8(JSON.stringify(document)) };
for (const [path, bytes] of files) entries[path] = bytes;
writeFileSync(out, zipSync(entries));

console.log(
  `${out}: ${tables.trips.length} trips, ${tables.tripItems.length} items, ` +
    `${tables.resources.length} resources (${files.size} PDFs), ${tables.tripNotes.length} notes`,
);
