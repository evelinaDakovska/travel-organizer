import { createHash } from 'node:crypto';

import { strToU8 } from 'fflate';

import { emptyExportTables, type ExportTables } from '../../domain/export';

/**
 * A two-trip snapshot for the single-trip archive tests (2B): one shared file, a receipt, a
 * journey, people, lists — and things that must never leave the phone with the trip.
 */
export const now = '2026-10-19T09:00:00.000Z';
export const sha = (bytes: Uint8Array) => createHash('sha256').update(bytes).digest('hex');
export const shaAsync = async (bytes: Uint8Array) => sha(bytes);
export const SCHEMA = 6;

export const FILES: Record<string, Uint8Array> = {
  'media/ticket.pdf': strToU8('%PDF-1.4 boarding pass'),
  'media/receipt.jpg': strToU8('JPEG receipt bytes'),
  'media/other-trip.pdf': strToU8('%PDF somebody else'),
};

function trip(id: string, name: string) {
  return {
    id,
    name,
    destination: 'Finland',
    start_date: '2026-11-20',
    end_date: '2026-11-24',
    default_tz: 'Europe/Helsinki',
    cover_path: null,
    notes: 'Trip notes',
    traveller_count: null,
    travellers: null,
    created_at: now,
    updated_at: now,
    converted_travellers: '[]',
  };
}

function item(id: string, tripId: string, extra: Record<string, unknown> = {}) {
  return {
    id,
    trip_id: tripId,
    kind: 'transport',
    subkind: 'flight',
    status: 'confirmed',
    priority: null,
    title: id,
    start_local: '2026-11-20T09:20',
    start_tz: 'Europe/Sofia',
    start_precision: 'time',
    start_utc: '2026-11-20T07:20:00.000Z',
    end_local: null,
    end_tz: null,
    end_precision: null,
    end_utc: null,
    completed_at: null,
    location_name: null,
    address: null,
    latitude: null,
    longitude: null,
    confirmation_code: 'ABC123',
    notes: null,
    details: null,
    price_amount: 18000,
    price_currency: 'EUR',
    is_paid: 1,
    created_at: now,
    updated_at: now,
    ...extra,
  };
}

const resource = (id: string, extra: Record<string, unknown>) => ({
  id,
  trip_id: null,
  trip_item_id: null,
  kind: 'file',
  subtype: 'generic',
  label: id,
  url: null,
  stored_path: null,
  file_name: null,
  mime_type: 'application/pdf',
  size_bytes: 10,
  sort_order: 0,
  created_at: now,
  expense_id: null,
  ...extra,
});

export function snapshot(): ExportTables {
  const t = emptyExportTables();
  t.trips = [trip('lap', 'Lapland'), trip('rome', 'Rome')];
  t.tripItems = [
    item('leg1', 'lap', { details: '{"from":"SOF","to":"HEL","journeyId":"j-1"}' }),
    item('leg2', 'lap', { details: '{"from":"HEL","to":"RVN","journeyId":"j-1"}' }),
    item('safari', 'lap', { kind: 'activity', subkind: 'tour', details: null }),
    item('cafe', 'lap', { kind: 'food', subkind: 'cafe', status: 'idea', priority: 'must' }),
    item('colosseum', 'rome', { kind: 'activity', subkind: null }),
  ];
  t.tripNotes = [
    { id: 'n1', trip_id: 'lap', title: 'Door code', body: '4417', pinned: 1, sort_order: 0, created_at: now, updated_at: now },
    { id: 'n2', trip_id: 'rome', title: 'Rome secret', body: 'x', pinned: 0, sort_order: 0, created_at: now, updated_at: now },
  ];
  t.expenses = [
    { id: 'e1', trip_id: 'lap', category: 'groceries', label: 'K-Market', amount: 1250, currency: 'EUR', spent_on: '2026-11-21', notes: null, paid_by: 'Evelina', split: null, created_at: now, updated_at: now, trip_item_id: null, payer_id: null },
    // Pays for the safari (3D-1): linked, with its payer.
    { id: 'e2', trip_id: 'lap', category: 'activities', label: 'Safari balance', amount: 6000, currency: 'EUR', spent_on: '2026-11-22', notes: null, paid_by: null, split: null, created_at: now, updated_at: now, trip_item_id: 'safari', payer_id: 'mi' },
  ];
  t.bookingPayments = [
    { id: 'bp1', trip_id: 'lap', trip_item_id: 'leg1', payer_id: 'ev', amount: 20000, currency: 'EUR', paid_on: '2026-10-01', note: 'Deposit', created_at: now, updated_at: now },
    { id: 'bp2', trip_id: 'lap', trip_item_id: 'leg1', payer_id: null, amount: 5000, currency: 'EUR', paid_on: null, note: null, created_at: now, updated_at: now },
    { id: 'bp-rome', trip_id: 'rome', trip_item_id: 'colosseum', payer_id: 'stranger', amount: 3000, currency: 'EUR', paid_on: null, note: null, created_at: now, updated_at: now },
  ];
  // Split (3D-2): the safari equally, Mitko's share covered by Misho; the groceries by amount.
  const share = (id: string, tripId: string, owner: { item?: string; expense?: string }, who: string, extra: { amount?: number; coveredBy?: string; order?: number } = {}) => ({
    id, trip_id: tripId, trip_item_id: owner.item ?? null, expense_id: owner.expense ?? null, traveller_id: who,
    amount: extra.amount ?? null, covered_by: extra.coveredBy ?? null, sort_order: extra.order ?? 0, created_at: now, updated_at: now,
  });
  t.costShares = [
    share('cs1', 'lap', { item: 'safari' }, 'ev'),
    share('cs2', 'lap', { item: 'safari' }, 'kid', { coveredBy: 'mi', order: 1 }),
    share('cs3', 'lap', { expense: 'e1' }, 'mi', { amount: 1250 }),
    share('cs-rome', 'rome', { item: 'colosseum' }, 'stranger'),
  ];
  t.tripCover = [{ trip_id: 'lap', child_id: 'kid', adult_id: 'ev', sort_order: 0 }];
  t.payments = [
    { id: 'p1', trip_id: 'lap', from_name: 'Misho', to_name: 'Evelina', amount: 500, currency: 'EUR', created_at: now },
  ];
  t.resources = [
    // One file attached to two plans (U4): one entry in the archive, both rows pointing at it.
    resource('r-ticket', { trip_item_id: 'leg1', subtype: 'ticket', stored_path: 'media/ticket.pdf' }),
    resource('r-ticket-copy', { trip_item_id: 'leg2', stored_path: 'media/ticket.pdf' }),
    resource('r-receipt', { trip_id: 'lap', expense_id: 'e1', stored_path: 'media/receipt.jpg', mime_type: 'image/jpeg' }),
    resource('r-link', { trip_id: 'lap', kind: 'link', url: 'https://example.com', stored_path: null, mime_type: null }),
    resource('r-rome', { trip_id: 'rome', stored_path: 'media/other-trip.pdf' }),
  ];
  t.travellers = [
    { id: 'ev', name: 'Evelina', sort_order: 0, created_at: now, updated_at: now, classification: 'adult' },
    { id: 'mi', name: 'Misho', sort_order: 1, created_at: now, updated_at: now, classification: 'adult' },
    { id: 'kid', name: 'Mitko', sort_order: 2, created_at: now, updated_at: now, classification: 'child' },
    { id: 'stranger', name: 'Rome only', sort_order: 3, created_at: now, updated_at: now, classification: 'adult' },
  ];
  t.tripTravellers = [
    { trip_id: 'lap', traveller_id: 'ev', sort_order: 0, classification: 'adult' },
    { trip_id: 'lap', traveller_id: 'mi', sort_order: 1, classification: 'adult' },
    { trip_id: 'lap', traveller_id: 'kid', sort_order: 2, classification: 'adult' }, // trip override
    { trip_id: 'rome', traveller_id: 'stranger', sort_order: 0, classification: 'adult' },
  ];
  t.itemParticipants = [
    { item_id: 'safari', traveller_id: 'mi' },
    { item_id: 'safari', traveller_id: 'kid' },
  ];
  const list = (id: string, tripId: string | null, kind: string) => ({
    id, trip_id: tripId, kind, name: id, source_list_id: tripId ? 'master' : null, sort_order: 0, created_at: now, updated_at: now,
  });
  t.lists = [list('shop', 'lap', 'shopping'), list('master', null, 'packing')];
  const li = (id: string, listId: string, travellerId: string | null) => ({
    id, list_id: listId, label: id, quantity: 2, unit: null, category: null, note: null, traveller_id: travellerId,
    done_at: null, sort_order: 0, created_at: now, updated_at: now,
  });
  t.listItems = [li('warmers', 'shop', 'mi'), li('socks', 'master', 'ev')];
  t.listItemRecipients = [
    { list_item_id: 'warmers', traveller_id: 'ev' },
    { list_item_id: 'warmers', traveller_id: 'mi' },
    { list_item_id: 'socks', traveller_id: 'ev' },
  ];
  t.templates = [{ id: 'tpl', name: 'Winter', content: '{}', created_at: now, updated_at: now }];
  t.templateUses = [{ trip_id: 'lap', template_id: 'tpl', applied_at: now }];
  t.settings = [{ key: 'me_traveller_id', value: 'ev' }];
  return t;
}

