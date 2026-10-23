import {
  balanceCosts,
  balancesHeading,
  costFingerprint,
  explainBalance,
  netText,
  previewSettlement,
  recordedText,
  remapFingerprint,
  settlementInputSchema,
  settlementRefusal,
  settleUp,
  settleUpText,
  statusText,
  tripBalances,
  waitReason,
  waitText,
  type BalanceInput,
  type CurrencyBalances,
  type Settlement,
  type UnsplitConfirmation,
} from './balances';
import { paymentSummary, tripExpenses } from './bookingCosts';
import type { BookingPayment } from './bookingPayments';
import type { CostShare, Member, TripCover } from './costShares';
import { spendingTotals, tripTotals, type Expense } from './spending';
import type { TripItem } from './tripItem';

const ev: Member = { id: 'ev', name: 'Evelina', classification: 'adult' };
const ana: Member = { id: 'ana', name: 'Ana', classification: 'adult' };
const ben: Member = { id: 'ben', name: 'Ben', classification: 'adult' };
const cara: Member = { id: 'cara', name: 'Cara', classification: 'adult' };
const mia: Member = { id: 'mia', name: 'Mia', classification: 'child' };
const sam: Member = { id: 'sam', name: 'Sam', classification: 'unspecified' };
const names = new Map([ev, ana, ben, cara, mia, sam].map((m) => [m.id, m.name]));
const nameOf = (id: string) => names.get(id) ?? '?';

const now = '2026-10-22T09:00:00.000Z';

type ItemFacts = Partial<Pick<TripItem, 'status' | 'isPaid' | 'details' | 'kind' | 'priceCurrency'>>;
const booking = (id: string, price: number, facts: ItemFacts = {}) =>
  ({
    id,
    kind: 'stay',
    title: id,
    status: 'confirmed',
    priceAmount: price,
    priceCurrency: 'EUR',
    isPaid: false,
    details: null,
    ...facts,
  }) as Pick<TripItem, 'id' | 'kind' | 'title' | 'status' | 'priceAmount' | 'priceCurrency' | 'isPaid' | 'details'>;

const expense = (id: string, amount: number, payerId: string | null, extra: Partial<Expense> = {}): Expense => ({
  id,
  tripId: 't',
  category: 'transport',
  label: id,
  amount,
  currency: 'EUR',
  spentOn: '2026-11-20',
  notes: null,
  tripItemId: null,
  payerId,
  createdAt: now,
  updatedAt: now,
  ...extra,
});

let paymentCount = 0;
const payment = (itemId: string, amount: number, payerId: string | null, currency = 'EUR'): BookingPayment => ({
  id: `bp${++paymentCount}`,
  tripId: 't',
  tripItemId: itemId,
  payerId,
  amount,
  currency,
  paidOn: null,
  note: null,
  createdAt: now,
  updatedAt: now,
});

const split = (
  owner: { item?: string; expense?: string },
  ...people: (string | [string, number | null, string?])[]
): CostShare[] =>
  people.map((person, sortOrder) => {
    const [travellerId, amount, coveredBy] = typeof person === 'string' ? [person, null, undefined] : person;
    return {
      id: `cs-${owner.item ?? owner.expense}-${travellerId}`,
      tripId: 't',
      tripItemId: owner.item ?? null,
      expenseId: owner.expense ?? null,
      travellerId,
      amount,
      coveredBy: coveredBy ?? null,
      sortOrder,
      createdAt: now,
      updatedAt: now,
    };
  });

let settlementCount = 0;
const settled = (fromId: string, toId: string, amount: number, currency = 'EUR'): Settlement => ({
  id: `st${++settlementCount}`,
  tripId: 't',
  fromId,
  toId,
  amount,
  currency,
  settledOn: null,
  note: null,
  createdAt: now,
  updatedAt: now,
});

type Records = {
  members?: Member[];
  cover?: TripCover[];
  items?: ReturnType<typeof booking>[];
  expenses?: Expense[];
  payments?: BookingPayment[];
  shares?: CostShare[];
  settlements?: Settlement[];
  confirmations?: UnsplitConfirmation[];
};
const inputOf = (r: Records): BalanceInput => ({
  members: r.members ?? [ev, ana, ben],
  tripCover: r.cover ?? [],
  costs: balanceCosts({
    items: r.items ?? [],
    expenses: r.expenses ?? [],
    payments: r.payments ?? [],
    shares: r.shares ?? [],
  }),
  settlements: r.settlements ?? [],
  confirmations: r.confirmations ?? [],
});
/** These unsplit costs kept outside, as they read now. */
const keep = (r: Records, ...ids: string[]): Records => ({
  ...r,
  confirmations: inputOf(r)
    .costs.filter((cost) => ids.includes(cost.id))
    .map((cost) => ({ costKind: cost.kind, costId: cost.id, fingerprint: costFingerprint(cost) })),
});
const eur = (r: Records) => tripBalances(inputOf(r)).find((entry) => entry.currency === 'EUR')!;
const nets = (entry: CurrencyBalances) =>
  Object.fromEntries(entry.people.map((row) => [row.travellerId, row.net]));

describe('balances — the plan’s worked examples (§10.1)', () => {
  it('a taxi paid by Ana, split three ways', () => {
    const entry = eur({
      members: [ev, ana, ben],
      expenses: [expense('taxi', 3000, 'ana')],
      shares: split({ expense: 'taxi' }, 'ev', 'ana', 'ben'),
    });
    expect(entry.state).toBe('final');
    expect(nets(entry)).toEqual({ ev: -1000, ana: 2000, ben: -1000 });
    expect(entry.transfers).toEqual([
      { fromId: 'ev', toId: 'ana', amount: 1000 },
      { fromId: 'ben', toId: 'ana', amount: 1000 },
    ]);
  });

  it('a safari paid by Evelina; Mia covered by Evelina and Ana: a child never bears', () => {
    const entry = eur({
      members: [ev, ana, mia],
      cover: [
        { childId: 'mia', adultId: 'ev', sortOrder: 0 },
        { childId: 'mia', adultId: 'ana', sortOrder: 1 },
      ],
      items: [booking('safari', 9000)],
      payments: [payment('safari', 9000, 'ev')],
      shares: split({ item: 'safari' }, 'ev', 'ana', 'mia'),
    });
    expect(nets(entry)).toEqual({ ev: 4500, ana: -4500 });
    expect(entry.people.find((row) => row.travellerId === 'mia')).toBeUndefined();
    expect(entry.transfers).toEqual([{ fromId: 'ana', toId: 'ev', amount: 4500 }]);
  });

  it('a hotel with a deposit and the rest to pay waits; when paid it enters', () => {
    const base = {
      items: [booking('hotel', 25000)],
      shares: split({ item: 'hotel' }, 'ana', 'ben'),
    };
    const waiting = eur({ ...base, payments: [payment('hotel', 10000, 'ana')] });
    expect(waiting.state).toBe('soFar');
    expect(waiting.waiting.map((w) => w.reason)).toEqual([{ kind: 'toPay', amount: 15000 }]);
    expect(waiting.transfers).toEqual([]);
    const paid = eur({ ...base, payments: [payment('hotel', 10000, 'ana'), payment('hotel', 15000, 'ben')] });
    expect(paid.state).toBe('final');
    expect(nets(paid)).toEqual({ ana: -2500, ben: 2500 });
    expect(paid.transfers).toEqual([{ fromId: 'ana', toId: 'ben', amount: 2500 }]);
  });

  it('a booking marked Paid with no records waits as Paid — not recorded by whom', () => {
    const entry = eur({
      items: [booking('cabin', 12000, { isPaid: true })],
      shares: split({ item: 'cabin' }, 'ana', 'ben'),
    });
    expect(entry.waiting[0].reason).toEqual({ kind: 'paidNotRecorded', amount: 12000 });
    expect(waitText(entry.waiting[0].reason, 'EUR', entry.waiting[0].cost, nameOf)).toBe(
      'Paid — EUR 120.00 not recorded by whom',
    );
  });

  it('a partial settlement, then an over-settlement', () => {
    const base = {
      expenses: [expense('dinner', 16000, 'ana')],
      shares: split({ expense: 'dinner' }, 'ana', 'ben'),
    };
    expect(nets(eur(base))).toEqual({ ana: 8000, ben: -8000 });
    const partial = eur({ ...base, settlements: [settled('ben', 'ana', 5000)] });
    expect(nets(partial)).toEqual({ ana: 3000, ben: -3000 });
    expect(partial.transfers).toEqual([{ fromId: 'ben', toId: 'ana', amount: 3000 }]);
    const over = eur({ ...base, settlements: [settled('ben', 'ana', 10000)] });
    expect(nets(over)).toEqual({ ana: -2000, ben: 2000 });
    expect(over.transfers).toEqual([{ fromId: 'ana', toId: 'ben', amount: 2000 }]);
  });

  it('two currencies are two sections, never added', () => {
    const all = tripBalances(
      inputOf({
        expenses: [expense('taxi', 3000, 'ana'), expense('fika', 30000, 'ben', { currency: 'NOK' })],
        shares: [...split({ expense: 'taxi' }, 'ana', 'ben'), ...split({ expense: 'fika' }, 'ana', 'ben')],
      }),
    );
    expect(all.map((entry) => entry.currency)).toEqual(['EUR', 'NOK']);
    expect(nets(all[0])).toEqual({ ana: 1500, ben: -1500 });
    expect(nets(all[1])).toEqual({ ana: -15000, ben: 15000 });
  });

  it('a family trip that splits nothing: no balances, the costs collapsed as not split', () => {
    const entry = eur({
      items: [booking('hotel', 25000, { isPaid: true }), booking('flight', 60000)],
      expenses: [expense('soup', 2400, null), expense('taxi', 3500, 'ev')],
    });
    expect(entry.state).toBe('nothing');
    expect(entry.notSplit).toHaveLength(4);
    expect(entry.waiting).toEqual([]);
    expect(entry.transfers).toEqual([]);
    expect(statusText(entry)).toBe('Nothing to settle yet in EUR.');
  });
});

describe('what enters the balances (§3) and why a cost waits (§5)', () => {
  const classOf = (id: string) => [ev, ana, ben, mia, sam].find((m) => m.id === id)?.classification;
  const cost = (records: Records) => balanceCosts({
    items: records.items ?? [],
    expenses: records.expenses ?? [],
    payments: records.payments ?? [],
    shares: records.shares ?? [],
  })[0];

  it('checks the reasons in order, the first that applies', () => {
    const notSplit = cost({ expenses: [expense('x', 1000, null)] });
    expect(waitReason(notSplit, classOf, [])).toEqual({ kind: 'notSplit' });
    const mismatch = cost({
      items: [booking('m', 10000)],
      shares: split({ item: 'm' }, ['ana', 4000], ['ben', 5000]),
    });
    expect(waitReason(mismatch, classOf, [])).toEqual({ kind: 'splitMismatch', allocated: 9000 });
    const uncovered = cost({ items: [booking('u', 9000)], shares: split({ item: 'u' }, 'ana', 'mia') });
    expect(waitReason(uncovered, classOf, [])).toEqual({ kind: 'notCovered', childIds: ['mia'] });
    const noPayer = cost({
      items: [booking('p', 9000)],
      payments: [payment('p', 4000, null), payment('p', 5000, 'ana')],
      shares: split({ item: 'p' }, 'ana', 'ben'),
    });
    expect(waitReason(noPayer, classOf, [])).toEqual({ kind: 'payerMissing', amount: 4000 });
    const over = cost({
      items: [booking('o', 9000)],
      payments: [payment('o', 10000, 'ana')],
      shares: split({ item: 'o' }, 'ana', 'ben'),
    });
    expect(waitReason(over, classOf, [])).toEqual({ kind: 'overpaid', amount: 1000 });
    const expenseNoPayer = cost({ expenses: [expense('e', 1000, null)], shares: split({ expense: 'e' }, 'ana') });
    expect(waitReason(expenseNoPayer, classOf, [])).toEqual({ kind: 'payerMissing', amount: 1000 });
  });

  it('a Paid booking whose records reach the price is complete', () => {
    const entry = eur({
      items: [booking('c', 8000, { isPaid: true })],
      payments: [payment('c', 8000, 'ana')],
      shares: split({ item: 'c' }, 'ana', 'ben'),
    });
    expect(entry.state).toBe('final');
    expect(nets(entry)).toEqual({ ana: 4000, ben: -4000 });
  });

  it('a booking and its payments and linked expense count once', () => {
    const entry = eur({
      items: [booking('h', 25000)],
      payments: [payment('h', 10000, 'ana')],
      expenses: [expense('final', 15000, 'ben', { tripItemId: 'h' }), expense('taxi', 2000, 'ana')],
      shares: [...split({ item: 'h' }, 'ana', 'ben'), ...split({ expense: 'taxi' }, 'ana', 'ben')],
    });
    expect(entry.complete.map((c) => c.id)).toEqual(['h', 'taxi']);
    const ana_ = entry.people.find((row) => row.travellerId === 'ana')!;
    expect(ana_.paid).toBe(12000);
    expect(ana_.borne).toBe(13500);
    expect(nets(entry)).toEqual({ ana: -1500, ben: 1500 });
  });

  it('a cancelled booking that is not spent waits only when something was paid on it', () => {
    const records = {
      items: [
        booking('refundable', 5000, { status: 'cancelled', details: { refundable: true } }),
        booking('unknown', 4000, { status: 'cancelled' }),
        booking('quiet', 3000, { status: 'cancelled', details: { refundable: true } }),
        booking('lost', 2000, { status: 'cancelled', details: { refundable: false } }),
      ],
      payments: [payment('refundable', 5000, 'ana'), payment('unknown', 4000, 'ben'), payment('lost', 2000, 'ana')],
      shares: split({ item: 'lost' }, 'ana', 'ben'),
    };
    const entry = eur(records);
    expect(entry.waiting.map((w) => [w.cost.id, w.reason])).toEqual([
      ['refundable', { kind: 'cancelled', refund: 'refundExpected' }],
      ['unknown', { kind: 'cancelled', refund: 'refundNotSet' }],
    ]);
    // Non-refundable is spent: it enters like any booking.
    expect(entry.complete.map((c) => c.id)).toEqual(['lost']);
    expect(entry.state).toBe('soFar');
  });

  it('ideas and to-dos are never costs', () => {
    const entry = tripBalances(
      inputOf({ items: [booking('idea', 5000, { status: 'idea' }), booking('todo', 5000, { kind: 'task' })] }),
    );
    expect(entry).toEqual([]);
  });

  it('a not-specified person’s share is their own; a covered share goes to adults only', () => {
    const entry = eur({
      members: [ev, sam, mia],
      cover: [{ childId: 'mia', adultId: 'ev', sortOrder: 0 }],
      expenses: [expense('t', 900, 'ev')],
      shares: split({ expense: 't' }, 'ev', 'sam', 'mia'),
    });
    expect(nets(entry)).toEqual({ ev: 300, sam: -300 });
  });

  it('a per-cost override wins over the trip’s Covered by', () => {
    const entry = eur({
      members: [ev, ana, mia],
      cover: [{ childId: 'mia', adultId: 'ev', sortOrder: 0 }],
      expenses: [expense('t', 900, 'ev')],
      shares: split({ expense: 't' }, 'ev', 'ana', ['mia', null, 'ana']),
    });
    expect(nets(entry)).toEqual({ ev: 600, ana: -600 });
  });

  it('several covering adults share a child’s share with leftover cents in their order', () => {
    const entry = eur({
      members: [ev, ana, mia],
      cover: [
        { childId: 'mia', adultId: 'ev', sortOrder: 0 },
        { childId: 'mia', adultId: 'ana', sortOrder: 1 },
      ],
      expenses: [expense('t', 101, 'ev')],
      shares: split({ expense: 't' }, 'mia'),
    });
    expect(entry.people.map((row) => [row.travellerId, row.borne])).toEqual([
      ['ev', 51],
      ['ana', 50],
    ]);
  });
});

describe('recorded payments stay visible while a cost waits (A)', () => {
  it('a waiting hotel shows its deposit; the 3D-1 readings are unchanged by 3E', () => {
    const hotel = booking('Hotel Aurora', 25000);
    const records = {
      items: [hotel],
      payments: [payment('Hotel Aurora', 10000, 'ana')],
      shares: split({ item: 'Hotel Aurora' }, 'ana', 'ben'),
      settlements: [settled('ben', 'ana', 5000)],
    };
    const entry = eur(records);
    expect(recordedText(entry.waiting[0].cost, nameOf)).toBe('paid EUR 100.00 (Ana)');
    expect(entry.people.find((row) => row.travellerId === 'ana')!.paidWaiting).toBe(10000);
    expect(entry.people.find((row) => row.travellerId === 'ana')!.paid).toBe(0);
    // The booking's own reading, from 3D-1, is the same whatever 3E records.
    const withRecorded = { ...hotel, recordedPaid: 10000 };
    expect(paymentSummary(withRecorded)).toMatchObject({ paid: 10000, toPay: 15000 });
    expect(tripExpenses([withRecorded])).toEqual([
      { currency: 'EUR', total: 25000, paid: 10000, toPay: 15000, lost: 0, items: 1 },
    ]);
  });

  it('names payer-less and mixed records', () => {
    const entry = eur({
      items: [booking('h', 25000)],
      payments: [payment('h', 6000, null), payment('h', 4000, 'ana'), payment('h', 1000, 'ana')],
      shares: split({ item: 'h' }, 'ana', 'ben'),
    });
    expect(recordedText(entry.waiting[0].cost, nameOf)).toBe(
      'paid EUR 60.00, payer not recorded · paid EUR 50.00 (Ana)',
    );
  });

  it('settlements never change the trip total, spending or a booking’s paid state', () => {
    const items = [{ ...booking('h', 25000), recordedPaid: 25000 }];
    const expenses = [expense('taxi', 3000, 'ana')];
    const before = tripTotals(tripExpenses(items), spendingTotals(expenses));
    eur({ items, expenses, settlements: [settled('ben', 'ana', 9999)] });
    expect(tripTotals(tripExpenses(items), spendingTotals(expenses))).toEqual(before);
    expect(paymentSummary(items[0])).toMatchObject({ paid: 25000, toPay: 0 });
  });
});

describe('§12.1 — no suggestions while a shared cost is incomplete', () => {
  it('regression: the hotel deposit, with Ben settling before the hotel is paid', () => {
    const hotel = booking('hotel', 25000);
    const base = {
      members: [ana, ben],
      items: [hotel, booking('husky', 30000, { priceCurrency: 'NOK' })],
      payments: [payment('hotel', 10000, 'ana'), payment('husky', 30000, 'ben', 'NOK')],
      shares: [...split({ item: 'hotel' }, 'ana', 'ben'), ...split({ item: 'husky' }, 'ana', 'ben')],
      settlements: [settled('ben', 'ana', 5000)],
    };
    const [before, nok] = tripBalances(inputOf(base));
    expect(before.state).toBe('soFar');
    expect(nets(before)).toEqual({ ana: -5000, ben: 5000 });
    expect(before.transfers).toEqual([]);
    expect(before.heldBecause).toBe('waiting');
    // Provisional rows are never worded as a debt.
    const anaRow = before.people.find((row) => row.travellerId === 'ana')!;
    expect(netText(anaRow, 'EUR', before.state, false)).toBe('−EUR 50.00 so far');
    expect(netText(anaRow, 'EUR', before.state, false)).not.toMatch(/owe/);
    expect(balancesHeading(before)).toBe('Balances so far · EUR — 1 cost not included yet');
    expect(statusText(before)).toBe('Suggested transfers appear once this cost is complete.');
    expect(recordedText(before.waiting[0].cost, nameOf)).toBe('paid EUR 100.00 (Ana)');
    // The NOK cost is complete: its suggestion is not held back by EUR.
    expect(nok.state).toBe('final');
    expect(nok.transfers).toEqual([{ fromId: 'ana', toId: 'ben', amount: 15000 }]);

    const [after] = tripBalances(inputOf({ ...base, payments: [...base.payments, payment('hotel', 15000, 'ben')] }));
    expect(after.state).toBe('final');
    expect(nets(after)).toEqual({ ana: -7500, ben: 7500 });
    expect(after.transfers).toEqual([{ fromId: 'ana', toId: 'ben', amount: 7500 }]);
    expect(after.people.reduce((sum, row) => sum + row.net, 0)).toBe(0);
  });

  describe('regression: a complete cost made incomplete by an edit', () => {
    const base = (): Required<Pick<Records, 'members' | 'items' | 'payments' | 'shares' | 'settlements' | 'cover'>> => ({
      members: [ev, ana, mia],
      cover: [{ childId: 'mia', adultId: 'ev', sortOrder: 0 }],
      items: [booking('safari', 9000)],
      payments: [payment('safari', 9000, 'ev')],
      shares: split({ item: 'safari' }, 'ev', 'ana', 'mia'),
      settlements: [settled('ana', 'ev', 1000)],
    });
    const complete = eur(base());

    it('starts complete with a suggestion', () => {
      expect(complete.state).toBe('final');
      expect(complete.transfers).toEqual([{ fromId: 'ana', toId: 'ev', amount: 2000 }]);
    });

    const edits: [string, (r: ReturnType<typeof base>) => void, string][] = [
      ['the price raised past what was paid', (r) => (r.items = [booking('safari', 9900)]), 'toPay'],
      ['the split removed', (r) => (r.shares = []), 'notSplit'],
      ['a payment’s payer cleared', (r) => (r.payments = [{ ...r.payments[0], payerId: null }]), 'payerMissing'],
      [
        'a split by amounts no longer adding up',
        (r) => (r.shares = split({ item: 'safari' }, ['ev', 3000], ['ana', 3000], ['mia', 2000])),
        'splitMismatch',
      ],
      ['a covering adult taken off the child', (r) => (r.cover = []), 'notCovered'],
    ];

    for (const [what, edit, reason] of edits) {
      it(`${what}: so far, listed with its reason, no suggestion, nothing written; undone brings it back`, () => {
        const records = base();
        const frozen = JSON.stringify(records);
        edit(records);
        const settlementsBefore = JSON.stringify(records.settlements);
        const input = inputOf(records);
        const entry = tripBalances(input).find((e) => e.currency === 'EUR')!;
        if (reason === 'notSplit') {
          // An unsplit cost never blocks (§12.1 rule 4): it leaves the balances, and with no other
          // cost to share only the settlement is left — flagged, nothing suggested (B).
          expect(entry.state).toBe('settlementsOnly');
          expect(entry.waiting).toEqual([]);
          expect(entry.notSplit.map((c) => c.id)).toEqual(['safari']);
        } else {
          expect(entry.state).toBe('soFar');
          expect(entry.waiting.map((w) => w.reason.kind)).toEqual([reason]);
        }
        expect(entry.transfers).toEqual([]);
        expect(JSON.stringify(records.settlements)).toBe(settlementsBefore);
        // Reading changes nothing in the records it was given.
        expect(JSON.stringify(input.settlements)).toBe(settlementsBefore);
        const undone = eur(JSON.parse(frozen));
        expect(undone.transfers).toEqual(complete.transfers);
      });
    }
  });
});

// The split removed leaves no cost to share, so the state follows: settlementsOnly — check it.
describe('settlements only (B)', () => {
  it('a currency with settlements and no cost that could be shared is flagged, no suggestion', () => {
    const [eurEntry, nok] = tripBalances(
      inputOf({
        expenses: [expense('taxi', 3000, 'ana')],
        shares: split({ expense: 'taxi' }, 'ana', 'ben'),
        settlements: [settled('ben', 'ana', 50000, 'NOK')],
      }),
    );
    expect(eurEntry.transfers).toEqual([{ fromId: 'ben', toId: 'ana', amount: 1500 }]);
    expect(nok.state).toBe('settlementsOnly');
    expect(nets(nok)).toEqual({ ana: -50000, ben: 50000 });
    expect(nok.transfers).toEqual([]);
    expect(balancesHeading(nok)).toBe('Settlements only · NOK — no costs in the balances');
  });

  it('a removed split with an earlier settlement leaves only settlements, flagged', () => {
    const entry = eur({
      expenses: [expense('taxi', 3000, 'ana')],
      settlements: [settled('ben', 'ana', 1500)],
    });
    expect(entry.state).toBe('settlementsOnly');
    expect(entry.notSplit.map((c) => c.id)).toEqual(['taxi']);
    expect(entry.transfers).toEqual([]);
  });
});

describe('unsplit costs to review (§14.2, review P1)', () => {
  // Ben owes Ana half of two costs she paid: a taxi (EUR 30) and a museum (EUR 20). He pays her
  // back his EUR 15 for the taxi; then the taxi's split is removed.
  const museumOnly = split({ expense: 'museum' }, 'ana', 'ben');
  const base = (): Records => ({
    members: [ana, ben],
    expenses: [expense('taxi', 3000, 'ana'), expense('museum', 2000, 'ana')],
    shares: [...split({ expense: 'taxi' }, 'ana', 'ben'), ...museumOnly],
    settlements: [settled('ben', 'ana', 1500)],
  });
  const unsplit = (): Records => ({ ...base(), shares: museumOnly });

  it('before: Ben still owes his EUR 10 for the museum', () => {
    const entry = eur(base());
    expect(entry.state).toBe('final');
    expect(nets(entry)).toEqual({ ana: 1000, ben: -1000 });
    expect(entry.transfers).toEqual([{ fromId: 'ben', toId: 'ana', amount: 1000 }]);
  });

  it('1–3: the split removed after a settlement, the museum still complete: held for review, never a debt', () => {
    const entry = eur(unsplit());
    expect(entry.state).toBe('review');
    expect(entry.heldBecause).toBe('review');
    expect(entry.transfers).toEqual([]);
    expect(entry.toReview.map((c) => c.id)).toEqual(['taxi']);
    expect(entry.keptOutside).toEqual([]);
    // The nets are shown, as figures so far: never "owes", never settled up.
    expect(nets(entry)).toEqual({ ana: -500, ben: 500 });
    for (const row of entry.people) {
      expect(netText(row, 'EUR', entry.state, false)).toMatch(/so far$/);
      expect(netText(row, 'EUR', entry.state, false)).not.toMatch(/owe|settled/);
    }
    expect(balancesHeading(entry)).toBe('Balances so far · EUR — 1 unsplit cost to review');
    expect(statusText(entry)).toBe(
      'Suggested transfers are paused: 1 cost is not split and EUR has settlements. Split it, or keep it outside on purpose.',
    );
    expect(settleUpText('Lapland', [entry], nameOf)).toBe(
      'Lapland — settle up (suggested)\n\nEUR: not final — 1 unsplit cost to review',
    );
  });

  it('4: kept outside on purpose, the suggestion resumes; 5: reviewed again, held again', () => {
    const records = keep(unsplit(), 'taxi');
    const kept = eur(records);
    expect(kept.state).toBe('final');
    expect(kept.toReview).toEqual([]);
    expect(kept.keptOutside.map((c) => c.id)).toEqual(['taxi']);
    expect(kept.transfers).toEqual([{ fromId: 'ana', toId: 'ben', amount: 500 }]);

    const revoked = eur({ ...records, confirmations: [] });
    expect(revoked.state).toBe('review');
    expect(revoked.transfers).toEqual([]);
  });

  it('6: a new unsplit cost needs its own confirmation', () => {
    const records = keep(unsplit(), 'taxi');
    const entry = eur({ ...records, expenses: [...records.expenses!, expense('soup', 1200, 'ben')] });
    expect(entry.state).toBe('review');
    expect(entry.toReview.map((c) => c.id)).toEqual(['soup']);
    expect(entry.keptOutside.map((c) => c.id)).toEqual(['taxi']);
    expect(entry.transfers).toEqual([]);
  });

  describe('7–10: a financial edit makes the confirmation stale; anything else keeps it', () => {
    const hotel = (facts: ItemFacts = {}) => booking('hotel', 20000, facts);
    // An unsplit hotel Ana paid, kept outside; the museum shared and settled.
    const bookingCase = (): Records =>
      keep(
        {
          ...base(),
          items: [hotel()],
          payments: [payment('hotel', 20000, 'ana')],
          expenses: [expense('museum', 2000, 'ana')],
          shares: museumOnly,
          settlements: [settled('ben', 'ana', 500)],
        },
        'hotel',
      );
    const expenseCase = (): Records => keep(unsplit(), 'taxi');

    it('both start kept outside, with a suggestion', () => {
      expect(eur(bookingCase()).state).toBe('final');
      expect(eur(bookingCase()).transfers).toEqual([{ fromId: 'ben', toId: 'ana', amount: 500 }]);
      expect(eur(expenseCase()).state).toBe('final');
    });

    const bookingEdits: [string, (r: Records) => Records][] = [
      ['the price', (r) => ({ ...r, items: [booking('hotel', 21000)] })],
      ['the status (cancelled, not refundable)', (r) => ({ ...r, items: [hotel({ status: 'cancelled', details: { refundable: false } })] })],
      ['the Paid switch', (r) => ({ ...r, items: [hotel({ isPaid: true })] })],
      ['a payment added', (r) => ({ ...r, payments: [...r.payments!, payment('hotel', 100, 'ben')] })],
      ['a payment removed', (r) => ({ ...r, payments: [] })],
      ['a payment’s amount', (r) => ({ ...r, payments: [payment('hotel', 19000, 'ana')] })],
      ['a payment’s payer', (r) => ({ ...r, payments: [payment('hotel', 20000, 'ben')] })],
      ['the payer cleared', (r) => ({ ...r, payments: [payment('hotel', 20000, null)] })],
      [
        'a linked expense added',
        (r) => ({ ...r, expenses: [...r.expenses!, expense('deposit', 100, 'ana', { tripItemId: 'hotel' })] }),
      ],
      [
        'a payment turned into a linked expense',
        (r) => ({ ...r, payments: [], expenses: [...r.expenses!, expense('paid', 20000, 'ana', { tripItemId: 'hotel' })] }),
      ],
    ];
    for (const [what, change] of bookingEdits) {
      it(`booking — ${what}: stale, not kept outside any more`, () => {
        const entry = eur(change(bookingCase()));
        expect(entry.keptOutside.map((c) => c.id)).not.toContain('hotel');
        if (entry.notSplit.some((c) => c.id === 'hotel')) {
          expect(entry.toReview.map((c) => c.id)).toContain('hotel');
          expect(entry.transfers).toEqual([]);
        }
      });
    }

    it('booking — a linked expense’s amount or payer changed: stale', () => {
      const linked = (amount: number, payerId: string) => {
        const r = bookingCase();
        return { ...r, payments: [], expenses: [...r.expenses!, expense('paid', amount, payerId, { tripItemId: 'hotel' })] };
      };
      const confirmed = keep(linked(20000, 'ana'), 'hotel');
      expect(eur(confirmed).keptOutside.map((c) => c.id)).toEqual(['hotel']);
      for (const edited of [linked(19000, 'ana'), linked(20000, 'ben')]) {
        const entry = eur({ ...edited, confirmations: confirmed.confirmations });
        expect(entry.toReview.map((c) => c.id)).toEqual(['hotel']);
      }
    });

    const expenseEdits: [string, Partial<Expense>][] = [
      ['the amount', { amount: 3100 }],
      ['the payer', { payerId: 'ben' }],
      ['the payer cleared', { payerId: null }],
    ];
    for (const [what, change] of expenseEdits) {
      it(`expense — ${what}: stale, held for review again`, () => {
        const r = expenseCase();
        const entry = eur({ ...r, expenses: [expense('taxi', 3000, 'ana', change), expense('museum', 2000, 'ana')] });
        expect(entry.toReview.map((c) => c.id)).toEqual(['taxi']);
        expect(entry.transfers).toEqual([]);
      });
    }

    it('expense — the currency: stale; it leaves EUR, and NOK has no settlements to hold it', () => {
      const r = expenseCase();
      const sections = tripBalances(
        inputOf({ ...r, expenses: [expense('taxi', 3000, 'ana', { currency: 'NOK' }), expense('museum', 2000, 'ana')] }),
      );
      const nok = sections.find((e) => e.currency === 'NOK')!;
      expect(nok.keptOutside).toEqual([]);
      expect(nok.toReview).toEqual([]);
    });

    it('a split made and removed again: the fingerprint matches, but the database ends it (migration 010 trigger)', () => {
      // The domain only compares fingerprints; the trigger is tested with the repositories.
      expect(eur(expenseCase()).keptOutside.map((c) => c.id)).toEqual(['taxi']);
    });

    it('8: not financial — title, label, notes, date, category, refundable on a live booking: still kept outside', () => {
      const b = bookingCase();
      const renamed = eur({ ...b, items: [{ ...hotel({ details: { refundable: true } }), title: 'Hotel Aurora (renamed)' }] });
      expect(renamed.keptOutside.map((c) => c.id)).toEqual(['hotel']);
      expect(renamed.transfers).toEqual([{ fromId: 'ben', toId: 'ana', amount: 500 }]);
      const e = expenseCase();
      const relabelled = eur({
        ...e,
        expenses: [
          expense('taxi', 3000, 'ana', { label: 'Airport taxi', notes: 'card', spentOn: '2026-11-23', category: 'food' }),
          expense('museum', 2000, 'ana'),
        ],
      });
      expect(relabelled.keptOutside.map((c) => c.id)).toEqual(['taxi']);
      expect(relabelled.state).toBe('final');
    });
  });

  it('11: currencies stand alone — a settlement in NOK holds nothing in EUR, and EUR’s review holds no NOK', () => {
    const sections = tripBalances(
      inputOf({
        members: [ana, ben],
        expenses: [
          expense('taxi', 3000, 'ana'),
          expense('museum', 2000, 'ana'),
          expense('husky', 40000, 'ben', { currency: 'NOK' }),
          expense('kiosk', 5000, 'ana', { currency: 'NOK' }),
        ],
        shares: [...museumOnly, ...split({ expense: 'husky' }, 'ana', 'ben')],
        settlements: [settled('ana', 'ben', 10000, 'NOK')],
      }),
    );
    const of = (currency: string) => sections.find((e) => e.currency === currency)!;
    // EUR has an unsplit taxi but no settlement: not held.
    expect(of('EUR').state).toBe('final');
    expect(of('EUR').transfers).toEqual([{ fromId: 'ben', toId: 'ana', amount: 1000 }]);
    // NOK has the settlement and an unsplit kiosk: held, on its own.
    expect(of('NOK').state).toBe('review');
    expect(of('NOK').toReview.map((c) => c.id)).toEqual(['kiosk']);
  });

  it('12: no settlements — unsplit costs never block, as before', () => {
    const entry = eur({ ...unsplit(), settlements: [] });
    expect(entry.state).toBe('final');
    expect(entry.toReview).toEqual([]);
    expect(entry.transfers).toEqual([{ fromId: 'ben', toId: 'ana', amount: 1000 }]);
  });

  it('13: no complete shared cost — confirming the unsplit ones never makes a suggestion', () => {
    const records = keep({ members: [ana, ben], expenses: [expense('taxi', 3000, 'ana')], settlements: [settled('ben', 'ana', 1500)] }, 'taxi');
    const entry = eur(records);
    expect(entry.state).toBe('settlementsOnly');
    expect(entry.keptOutside.map((c) => c.id)).toEqual(['taxi']);
    expect(entry.transfers).toEqual([]);
  });

  it('14: an incomplete shared cost still blocks, whatever is confirmed', () => {
    const records = keep(
      { ...unsplit(), items: [booking('hotel', 20000)], payments: [payment('hotel', 5000, 'ana')], shares: [...museumOnly, ...split({ item: 'hotel' }, 'ana', 'ben')] },
      'taxi',
    );
    const entry = eur(records);
    expect(entry.state).toBe('soFar');
    expect(entry.heldBecause).toBe('waiting');
    expect(entry.transfers).toEqual([]);
  });

  it('14: and reviews listed alongside an incomplete cost still count', () => {
    const entry = eur({ ...unsplit(), items: [booking('hotel', 20000)], shares: [...museumOnly, ...split({ item: 'hotel' }, 'ana', 'ben')] });
    expect(entry.state).toBe('soFar');
    expect(entry.toReview.map((c) => c.id)).toEqual(['taxi']);
  });

  it('15: a child is never shown owing, and a child below zero still holds suggestions once reviewed', () => {
    // Mia (covered by Ana) was paid back 600 for an ice cream later deleted; an unsplit soup kept outside.
    const records = keep(
      {
        members: [ev, ana, mia],
        cover: [{ childId: 'mia', adultId: 'ana', sortOrder: 0 }],
        expenses: [expense('safari', 9000, 'ev'), expense('soup', 1000, 'ev')],
        shares: split({ expense: 'safari' }, 'ev', 'ana', 'mia'),
        settlements: [settled('ev', 'mia', 600)],
      },
      'soup',
    );
    const entry = eur(records);
    expect(entry.childrenBelowZero).toEqual(['mia']);
    expect(entry.heldBecause).toBe('child');
    expect(entry.transfers).toEqual([]);
    const miaRow = entry.people.find((row) => row.travellerId === 'mia')!;
    expect(netText(miaRow, 'EUR', entry.state, true)).toBe('received EUR 6.00 more than paid · check the settlements');
    // Unreviewed, it reads for review — and still never as a child owing.
    const unreviewed = eur({ ...records, confirmations: [] });
    expect(unreviewed.state).toBe('review');
    expect(netText(miaRow, 'EUR', unreviewed.state, true)).not.toMatch(/owes/);
    // The settlement rules see confirmations and stay the same: a child is never left owing.
    expect(settlementRefusal(inputOf(records), { fromId: 'ana', toId: 'mia', amount: 100, currency: 'EUR' })).toBe(
      'Mia would owe money. A child never owes — record it with the adult who covers Mia.',
    );
  });

  it('confirming changes no settlement, share, payment, cover or cost — only what is suggested', () => {
    const records = unsplit();
    const kept = keep(records, 'taxi');
    const [before, after] = [inputOf(records), inputOf(kept)];
    expect(after.costs).toEqual(before.costs);
    expect(after.settlements).toEqual(before.settlements);
    expect(after.tripCover).toEqual(before.tripCover);
    const [unreviewed, reviewed] = [eur(records), eur(kept)];
    expect(nets(reviewed)).toEqual(nets(unreviewed));
    expect(reviewed.settlements).toEqual(unreviewed.settlements);
    expect(reviewed.complete).toEqual(unreviewed.complete);
  });

  describe('known limitations, outside the owner’s rule (raised in the report)', () => {
    it('a settled cost deleted, or moved to another currency: no unsplit cost is left to review', () => {
      const deleted = eur({ ...base(), expenses: [expense('museum', 2000, 'ana')], shares: museumOnly });
      expect(deleted.state).toBe('final');
      expect(deleted.transfers).toEqual([{ fromId: 'ana', toId: 'ben', amount: 500 }]);
      const sections = tripBalances(
        inputOf({ ...base(), expenses: [expense('taxi', 3000, 'ana', { currency: 'NOK' }), expense('museum', 2000, 'ana')] }),
      );
      expect(sections.find((e) => e.currency === 'EUR')!.transfers).toEqual([{ fromId: 'ana', toId: 'ben', amount: 500 }]);
      expect(sections.find((e) => e.currency === 'NOK')!.transfers).toEqual([{ fromId: 'ben', toId: 'ana', amount: 1500 }]);
    });

    it('re-split to Ana alone, or Covered by moved: explicit choices, read as the new truth', () => {
      const anaAlone = eur({ ...base(), shares: [...split({ expense: 'taxi' }, 'ana'), ...museumOnly] });
      expect(anaAlone.transfers).toEqual([{ fromId: 'ana', toId: 'ben', amount: 500 }]);
      const cover = {
        members: [ev, ana, mia],
        cover: [{ childId: 'mia', adultId: 'ev', sortOrder: 0 }],
        expenses: [expense('safari', 9000, 'ev')],
        shares: split({ expense: 'safari' }, 'ev', 'ana', 'mia'),
        settlements: [settled('ana', 'ev', 6000)],
      };
      expect(eur(cover).transfers).toEqual([{ fromId: 'ev', toId: 'ana', amount: 3000 }]);
    });

    it('a cancelled booking that was settled: waits while a refund is open; refunded and its payment removed, it leaves', () => {
      const hotel = (facts: ItemFacts, payments = [payment('hotel', 10000, 'ana')]) => ({
        members: [ana, ben],
        items: [booking('hotel', 10000, facts)],
        payments,
        expenses: [expense('museum', 2000, 'ana')],
        shares: [...split({ item: 'hotel' }, 'ana', 'ben'), ...museumOnly],
        settlements: [settled('ben', 'ana', 5000)],
      });
      expect(eur(hotel({ status: 'cancelled', details: { refundable: true } })).state).toBe('soFar');
      const refunded = eur(hotel({ status: 'cancelled', details: { refundable: true } }, []));
      // Ana got the hotel's 100 back and holds Ben's 50: she returns it, less his 10 for the museum.
      expect(refunded.transfers).toEqual([{ fromId: 'ana', toId: 'ben', amount: 4000 }]);
    });
  });
});

describe('the fingerprint', () => {
  const cost = () =>
    balanceCosts({
      items: [booking('hotel', 20000)],
      expenses: [expense('dep', 5000, 'ana', { tripItemId: 'hotel' })],
      payments: [payment('hotel', 10000, 'ana'), payment('hotel', 5000, 'ben')],
      shares: [],
    })[0];

  it('is the same whatever order the records come in, and carries no record ids', () => {
    const a = cost();
    const b = { ...a, records: [...a.records].reverse().map((r) => ({ ...r, paymentId: r.paymentId && `${r.paymentId}-other`, expenseId: r.expenseId && 'other' })) };
    expect(costFingerprint(b)).toBe(costFingerprint(a));
    expect(costFingerprint(a)).not.toMatch(/bp\d|dep/);
  });

  it('is renamed with the travellers, and a fingerprint remapped matches the cost imported under the new ids', () => {
    const map = new Map([['ana', 'ana2'], ['ben', 'ben2']]);
    const renamed = { ...cost(), records: cost().records.map((r) => ({ ...r, payerId: r.payerId && map.get(r.payerId)! })) };
    expect(remapFingerprint(costFingerprint(cost()), (id) => map.get(id)!)).toBe(costFingerprint(renamed));
  });

  it('leaves anything that is not a fingerprint as it was: it confirms nothing', () => {
    expect(remapFingerprint('not json', (id) => id)).toBe('not json');
    expect(remapFingerprint('{"v":2}', (id) => id)).toBe('{"v":2}');
  });
});

describe('status wording (D)', () => {
  it('reads each state without a bare All settled up', () => {
    const settledFinal = eur({
      expenses: [expense('taxi', 3000, 'ana')],
      shares: split({ expense: 'taxi' }, 'ana', 'ben'),
      settlements: [settled('ben', 'ana', 1500)],
    });
    expect(statusText(settledFinal)).toBe('All settled up in EUR.');
    const withUnsplit = eur(
      keep(
        {
          expenses: [expense('taxi', 3000, 'ana'), expense('soup', 1000, 'ana')],
          shares: split({ expense: 'taxi' }, 'ana', 'ben'),
          settlements: [settled('ben', 'ana', 1500)],
        },
        'soup',
      ),
    );
    expect(statusText(withUnsplit)).toBe('Settled up for the shared costs · 1 cost not split, not part of this.');
    const zeroSoFar = eur({
      items: [booking('h', 1000)],
      shares: split({ item: 'h' }, 'ana', 'ben'),
    });
    expect(statusText(zeroSoFar)).toBe('Balances so far: all at zero · 1 cost not included yet.');
    const owing = eur({ expenses: [expense('taxi', 3000, 'ana')], shares: split({ expense: 'taxi' }, 'ana', 'ben') });
    expect(statusText(owing)).toBeNull();
    expect(netText(owing.people[0], 'EUR', 'final', false)).toBe('is owed EUR 15.00');
    expect(netText(owing.people[1], 'EUR', 'final', false)).toBe('owes EUR 15.00');
  });
});

describe('a child below zero after later edits (E)', () => {
  const records = (): Records => ({
    members: [ev, ana, mia],
    cover: [{ childId: 'mia', adultId: 'ev', sortOrder: 0 }],
    expenses: [expense('ice cream', 1000, 'mia')],
    shares: split({ expense: 'ice cream' }, 'ev', 'ana'),
    settlements: [settled('ev', 'mia', 1000)],
  });

  it('starts fine: Mia paid, was paid back', () => {
    const entry = eur(records());
    expect(entry.childrenBelowZero).toEqual([]);
  });

  const causes: [string, (r: Records) => void][] = [
    ['her payment deleted', (r) => (r.expenses = [expense('ice cream', 1000, 'ev')])],
    ['her payment lowered', (r) => (r.expenses = [expense('ice cream', 400, 'mia')])],
    ['the cost she paid no longer complete', (r) => (r.shares = [])],
  ];
  for (const [what, edit] of causes) {
    it(`${what}: flagged, never owing, no suggestion, the settlement untouched`, () => {
      const r = records();
      edit(r);
      const before = JSON.stringify(r.settlements);
      const entry = eur(r);
      expect(entry.childrenBelowZero).toEqual(['mia']);
      expect(entry.transfers).toEqual([]);
      const row = entry.people.find((p) => p.travellerId === 'mia')!;
      const text = netText(row, 'EUR', entry.state, true);
      expect(text).toMatch(/^received EUR .* more than paid · check the settlements$/);
      expect(text).not.toMatch(/owe/);
      expect(JSON.stringify(r.settlements)).toBe(before);
    });
  }

  it('someone reclassified as a child after settling: flagged the same way', () => {
    const r: Records = {
      members: [ev, ana],
      expenses: [expense('taxi', 2000, 'ev')],
      shares: split({ expense: 'taxi' }, 'ev', 'ana'),
      settlements: [settled('ev', 'ana', 500)],
    };
    const asChild = { ...ana, classification: 'child' as const };
    const entry = eur({ ...r, members: [ev, asChild], cover: [{ childId: 'ana', adultId: 'ev', sortOrder: 0 }] });
    expect(entry.childrenBelowZero).toEqual(['ana']);
    expect(entry.transfers).toEqual([]);
  });
});

describe('settleUp', () => {
  it('leaves every net at zero in at most n − 1 transfers, deterministically', () => {
    let seed = 7;
    const random = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    for (let round = 0; round < 300; round++) {
      const n = 2 + random(11);
      const people = Array.from({ length: n }, (_, i) => ({ travellerId: `p${i}`, net: random(20000) - 10000 }));
      const sum = people.reduce((s, p) => s + p.net, 0);
      people[0].net -= sum;
      const transfers = settleUp(people);
      const left = new Map(people.map((p) => [p.travellerId, p.net]));
      for (const t of transfers) {
        expect(t.amount).toBeGreaterThan(0);
        left.set(t.fromId, left.get(t.fromId)! + t.amount);
        left.set(t.toId, left.get(t.toId)! - t.amount);
      }
      expect([...left.values()].every((v) => v === 0)).toBe(true);
      expect(transfers.length).toBeLessThanOrEqual(Math.max(0, people.filter((p) => p.net !== 0).length - 1));
      expect(settleUp(people)).toEqual(transfers);
    }
  });

  it('breaks ties by the order given (the trip’s members)', () => {
    expect(
      settleUp([
        { travellerId: 'a', net: -500 },
        { travellerId: 'b', net: -500 },
        { travellerId: 'c', net: 1000 },
      ]),
    ).toEqual([
      { fromId: 'a', toId: 'c', amount: 500 },
      { fromId: 'b', toId: 'c', amount: 500 },
    ]);
  });
});

describe('invariants over random trips', () => {
  it('Σ net = 0 per currency; nobody without a record has a net (no false debtor)', () => {
    let seed = 29;
    const random = (n: number) => {
      seed = (seed * 48271) % 2147483647;
      return seed % n;
    };
    const pool = [ev, ana, ben, cara, mia, sam];
    for (let round = 0; round < 200; round++) {
      const members = pool.slice(0, 2 + random(5));
      const adults = members.filter((m) => m.classification === 'adult');
      const cover: TripCover[] = members
        .filter((m) => m.classification === 'child' && random(3) > 0)
        .flatMap((child) => adults.slice(0, 1 + random(adults.length)).map((a, i) => ({ childId: child.id, adultId: a.id, sortOrder: i })));
      const items = [];
      const payments = [];
      const expenses = [];
      const shares = [];
      const settlements = [];
      for (let c = 0; c < 1 + random(6); c++) {
        const price = 1 + random(50000);
        const currency = random(4) === 0 ? 'NOK' : 'EUR';
        const people = members.filter(() => random(3) > 0);
        if (random(2) === 0) {
          const id = `b${c}`;
          items.push(booking(id, price, { priceCurrency: currency, isPaid: random(5) === 0 }));
          const first = random(price + 1);
          if (first > 0) payments.push(payment(id, first, members[random(members.length)].id, currency));
          if (price - first > 0 && random(3) > 0) payments.push(payment(id, price - first, members[random(members.length)].id, currency));
          if (random(4) > 0) shares.push(...split({ item: id }, ...people.map((p) => p.id)));
        } else {
          const id = `e${c}`;
          expenses.push(expense(id, price, random(5) === 0 ? null : members[random(members.length)].id, { currency }));
          if (random(4) > 0) shares.push(...split({ expense: id }, ...people.map((p) => p.id)));
        }
      }
      for (let s = 0; s < random(3); s++) {
        const from = members[random(members.length)];
        const to = members[random(members.length)];
        if (from.id !== to.id) settlements.push(settled(from.id, to.id, 1 + random(5000), random(4) === 0 ? 'NOK' : 'EUR'));
      }
      const input = inputOf({ members, cover, items, payments, expenses, shares, settlements });
      for (const entry of tripBalances(input)) {
        expect(entry.people.reduce((sum, row) => sum + row.net, 0)).toBe(0);
        for (const row of entry.people) {
          if (row.net !== 0) {
            expect(row.paid + row.borne + row.sent + row.received).toBeGreaterThan(0);
          }
          if (members.find((m) => m.id === row.travellerId)?.classification === 'child') {
            expect(row.borne).toBe(0);
          }
        }
        if (entry.transfers.length > 0) {
          expect(entry.state).toBe('final');
          expect(entry.childrenBelowZero).toEqual([]);
        }
      }
    }
  });
});

describe('one person’s working', () => {
  it('adds up to the net and keeps payments on waiting costs apart', () => {
    const input = inputOf({
      members: [ev, ana, mia],
      cover: [{ childId: 'mia', adultId: 'ana', sortOrder: 0 }],
      items: [booking('safari', 9000), booking('hotel', 20000)],
      payments: [payment('safari', 9000, 'ev'), payment('hotel', 5000, 'ana')],
      shares: [...split({ item: 'safari' }, 'ev', 'ana', 'mia'), ...split({ item: 'hotel' }, 'ev', 'ana')],
      settlements: [settled('ana', 'ev', 1000)],
    });
    const working = explainBalance(input, 'ana', 'EUR', nameOf)!;
    expect(working.paid).toEqual([]);
    expect(working.shares.map((l) => [l.id, l.amount, l.forChildId])).toEqual([
      ['safari', 3000, null],
      ['safari', 3000, 'mia'],
    ]);
    expect(working.sent.map((l) => [l.title, l.amount])).toEqual([['Evelina', 1000]]);
    expect(working.paidWaiting.map((l) => [l.id, l.amount])).toEqual([['hotel', 5000]]);
    const sum =
      working.paid.reduce((s, l) => s + l.amount, 0) -
      working.shares.reduce((s, l) => s + l.amount, 0) +
      working.sent.reduce((s, l) => s + l.amount, 0) -
      working.received.reduce((s, l) => s + l.amount, 0);
    expect(sum).toBe(working.balance.net);
  });
});

describe('settlement rules (§7)', () => {
  const base = inputOf({
    members: [ev, ana, mia],
    cover: [{ childId: 'mia', adultId: 'ev', sortOrder: 0 }],
    expenses: [expense('dinner', 6000, 'ev'), expense('ice cream', 500, 'mia')],
    shares: [...split({ expense: 'dinner' }, 'ev', 'ana'), ...split({ expense: 'ice cream' }, 'ev')],
  });
  const draft = (fromId: string, toId: string, amount: number, currency = 'EUR') => ({ fromId, toId, amount, currency });

  it('refuses the same person, someone off the trip, zero', () => {
    expect(settlementRefusal(base, draft('ana', 'ana', 100))).toBe('Pick two different people.');
    expect(settlementRefusal(base, draft('ana', 'ben', 100))).toBe('Both people must be on this trip.');
    expect(settlementRefusal(base, draft('ana', 'ev', 0))).toBe('Enter an amount above zero.');
    expect(settlementRefusal(base, draft('ana', 'ev', 3000))).toBeNull();
  });

  it('refuses a settlement that leaves the child receiving it owing; a child may send', () => {
    expect(settlementRefusal(base, draft('ev', 'mia', 500))).toBeNull();
    expect(settlementRefusal(base, draft('ev', 'mia', 501))).toBe(
      'Mia would owe money. A child never owes — record it with the adult who covers Mia.',
    );
    expect(settlementRefusal(base, draft('mia', 'ana', 300))).toBeNull();
  });

  it('judges an edit without the settlement’s own old amount', () => {
    const withOne = { ...base, settlements: [settled('ev', 'mia', 500)] };
    const id = withOne.settlements[0].id;
    expect(settlementRefusal(withOne, draft('ev', 'mia', 500), id)).toBeNull();
    expect(settlementRefusal(withOne, draft('ev', 'mia', 1))).toBe(
      'Mia would owe money. A child never owes — record it with the adult who covers Mia.',
    );
  });

  it('previews the result: over-settlement, a suggestion matched, a currency with no costs', () => {
    // Ev paid the dinner and bears Mia's ice cream; Mia is owed what she paid: Ana pays Ev 25, Mia 5.
    const exact = previewSettlement(base, draft('ana', 'ev', 2500));
    expect(exact).toMatchObject({ overBy: 0, noCosts: false, matchesSuggestion: true });
    const over = previewSettlement(base, draft('ana', 'ev', 5000));
    expect(over.overBy).toBe(2500);
    expect(nets(over.after)).toMatchObject({ ev: -2500, ana: 2000, mia: 500 });
    const nok = previewSettlement(base, draft('ana', 'ev', 5000, 'NOK'));
    expect(nok.noCosts).toBe(true);
    expect(nok.after.state).toBe('settlementsOnly');
  });

  it('validates the form', () => {
    expect(
      settlementInputSchema.safeParse({ fromId: 'a', toId: 'b', amount: 100, currency: 'EUR', settledOn: '2026-10-22' })
        .success,
    ).toBe(true);
    expect(
      settlementInputSchema.safeParse({ fromId: 'a', toId: 'b', amount: 0, currency: 'EUR', settledOn: null }).success,
    ).toBe(false);
    expect(
      settlementInputSchema.safeParse({ fromId: 'a', toId: 'b', amount: 1.5, currency: 'EUR', settledOn: null }).success,
    ).toBe(false);
  });
});

describe('share text (§9)', () => {
  it('says there is nothing to settle rather than leaving a gap', () => {
    const balances = tripBalances(inputOf({ expenses: [expense('soup', 1000, 'ana')] }));
    expect(settleUpText('Rome', balances, nameOf)).toBe(
      'Rome — settle up (suggested)\n\nNothing to settle yet.\n\nNot included: 1 cost in EUR not split.',
    );
  });

  it('gives suggestions, a not-final line without numbers, and what is not included', () => {
    const balances = tripBalances(
      inputOf({
        members: [ana, ben, cara],
        items: [booking('hotel', 25000, { priceCurrency: 'NOK' })],
        payments: [payment('hotel', 10000, 'ana', 'NOK')],
        expenses: [expense('dinner', 9000, 'ana'), expense('soup', 1000, 'ben')],
        shares: [...split({ expense: 'dinner' }, 'ana', 'ben', 'cara'), ...split({ item: 'hotel' }, 'ana', 'ben')],
      }),
    );
    expect(settleUpText('Lapland', balances, nameOf)).toBe(
      [
        'Lapland — settle up (suggested)',
        '',
        'NOK: not final — 1 cost not complete',
        '',
        'EUR\nBen pays Ana 30.00\nCara pays Ana 30.00',
        '',
        'Not included: 1 cost in EUR not split.',
      ].join('\n'),
    );
  });
});
