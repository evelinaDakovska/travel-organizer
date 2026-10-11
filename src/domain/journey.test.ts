import {
  firstReturnLeg,
  isMultiLeg,
  legDefaultDate,
  journeyItemValues,
  journeyLegs,
  journeyProblems,
  mergeToDirect,
  nextLeg,
  type Journey,
} from './journey';
import { tripItemInputSchema, type TripItemFormValues } from './tripItem';

const SOFIA = 'Europe/Sofia';
const ROME = 'Europe/Rome';

const out1 = {
  from: 'Sofia',
  to: 'Vienna',
  departs: { local: '2026-10-20T06:10', tz: SOFIA },
  arrives: { local: '2026-10-20T06:50' },
  number: 'OS 796',
};
const out2 = {
  from: 'Vienna',
  to: 'Milan',
  departs: { local: '2026-10-20T09:00' },
  arrives: { local: '2026-10-20T10:20' },
  number: 'OS 511',
};
const back = {
  from: 'Milan',
  to: 'Sofia',
  departs: { local: '2026-10-24T18:00' },
  arrives: { local: '2026-10-24T21:15', tz: SOFIA },
};

const base: TripItemFormValues = {
  kind: 'transport',
  subkind: 'flight',
  status: 'confirmed',
  title: 'Flight to Milan',
  confirmationCode: 'XK7Q2P',
  priceAmount: 31000,
  priceCurrency: 'EUR',
  isPaid: true,
  details: { reminder: '3h', refundable: false, from: 'typed before switching' },
};

describe('building a journey', () => {
  it('is the ordinary form until there is a connection or a return', () => {
    expect(isMultiLeg({ outbound: [out1], returning: [] })).toBe(false);
    expect(isMultiLeg({ outbound: [out1, out2], returning: [] })).toBe(true);
    expect(isMultiLeg({ outbound: [out1], returning: [back] })).toBe(true);
  });

  it('starts a connection where the last leg landed, on that day, in that zone', () => {
    const landed = { to: 'Vienna', arrives: { local: '2026-10-20T06:50', tz: 'Europe/Vienna' } };
    expect(nextLeg(landed)).toEqual({
      from: 'Vienna',
      departs: { local: '2026-10-20', tz: 'Europe/Vienna' },
    });
    expect(nextLeg(undefined)).toEqual({});
  });

  it('starts the way back where the way out ended, heading home', () => {
    expect(firstReturnLeg([out1, out2])).toEqual({ from: 'Milan', to: 'Sofia' });
  });

  it('folds connections back into one direct leg without losing the ends', () => {
    expect(mergeToDirect([out1, out2])).toMatchObject({
      from: 'Sofia',
      to: 'Milan',
      departs: out1.departs,
      arrives: out2.arrives,
    });
  });
});

describe('journeyProblems', () => {
  it('passes a journey in order', () => {
    expect(journeyProblems({ outbound: [out1, out2], returning: [back] }, ROME)).toEqual([]);
  });

  it('asks for every departure', () => {
    const journey: Journey = { outbound: [out1, { from: 'Vienna' }], returning: [] };
    expect(journeyProblems(journey, ROME)).toEqual([
      { part: 'outbound', index: 1, message: 'Add when it departs' },
    ]);
  });

  it('refuses a connection that leaves before the previous leg lands, across zones', () => {
    // 06:50 Rome is 04:50Z; 06:30 Sofia is 03:30Z — before it.
    const early = { ...out2, departs: { local: '2026-10-20T06:30', tz: SOFIA } };
    expect(journeyProblems({ outbound: [out1, early], returning: [] }, ROME)).toEqual([
      { part: 'outbound', index: 1, message: 'Leaves before the previous leg lands' },
    ]);
  });

  it('refuses a way back that leaves before the way out arrives', () => {
    const tooSoon = { ...back, departs: { local: '2026-10-19T18:00' } };
    expect(journeyProblems({ outbound: [out1, out2], returning: [tooSoon] }, ROME)).toEqual([
      { part: 'returning', index: 0, message: 'Leaves before the way out arrives' },
    ]);
  });
});

describe('journeyItemValues', () => {
  const values = journeyItemValues(base, { outbound: [out1, out2], returning: [back] }, 'j1');

  it('makes one item per leg, titled and numbered', () => {
    expect(values.map((v) => v.title)).toEqual([
      'Flight to Milan (1/2)',
      'Flight to Milan (2/2)',
      'Return: Flight to Milan',
    ]);
  });

  it('gives each leg its own route, times and zones, and the journey id', () => {
    expect(values[0]).toMatchObject({ start: out1.departs, end: out1.arrives });
    expect(values[2].details).toEqual({
      reminder: '3h',
      refundable: false,
      from: 'Milan',
      to: 'Sofia',
      journeyId: 'j1',
    });
  });

  it('keeps what is shared on every leg, and the price on the first only', () => {
    const shared = values.every((v) => v.confirmationCode === 'XK7Q2P' && v.status === 'confirmed');
    expect(shared).toBe(true);
    expect(values.map((v) => v.priceAmount)).toEqual([31000, undefined, undefined]);
    expect(values.map((v) => v.isPaid)).toEqual([true, false, false]);
  });

  it('produces legs the item schema accepts', () => {
    const schema = tripItemInputSchema(ROME);
    for (const v of values) expect(schema.safeParse(v).success).toBe(true);
  });
});

describe('journeyLegs', () => {
  const at = (local: string, tz = ROME) => ({ local, tz, precision: 'time' as const });
  const legs = [
    { id: 'b', details: { journeyId: 'j1' }, start: at('2026-10-20T09:00') },
    { id: 'a', details: { journeyId: 'j1' }, start: at('2026-10-20T06:10', SOFIA) },
    { id: 'c', details: { journeyId: 'j1' }, start: at('2026-10-24T18:00') },
    { id: 'x', details: { journeyId: 'other' }, start: at('2026-10-20T07:00') },
    { id: 'y', details: null, start: null },
  ];

  it('lists the other legs of the same journey in time order', () => {
    expect(journeyLegs(legs, legs[0]).map((l) => l.id)).toEqual(['a', 'c']);
  });

  it('is empty for an item that is not part of a journey', () => {
    expect(journeyLegs(legs, legs[4])).toEqual([]);
  });
});

describe('legDefaultDate', () => {
  const at = (local: string) => ({ local });

  it('opens the first leg on the fallback', () => {
    expect(legDefaultDate([{}, {}], 0, '2026-10-11')).toBe('2026-10-11');
  });

  it('opens a connection on the day the leg before it lands', () => {
    const legs = [{ departs: at('2026-10-12T10:00'), arrives: at('2026-10-12T11:10') }, {}];
    expect(legDefaultDate(legs, 1, '2026-10-11')).toBe('2026-10-12');
  });

  it('uses the departure when the leg before has no arrival, and looks further back if needed', () => {
    expect(legDefaultDate([{ departs: at('2026-10-13') }, {}], 1, '2026-10-11')).toBe('2026-10-13');
    expect(legDefaultDate([{ departs: at('2026-10-13') }, {}, {}], 2, '2026-10-11')).toBe(
      '2026-10-13',
    );
  });

  it('falls back when no earlier leg has a date yet', () => {
    expect(legDefaultDate([{}, {}], 1, '2026-10-11')).toBe('2026-10-11');
  });
});
