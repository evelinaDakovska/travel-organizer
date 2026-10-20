/**
 * Price per person (C3): rate lines — *2 × Adult at EUR 90 + 1 × Child at EUR 60* — kept in
 * `details.pricing`, and the total they make in `price_amount`, the one number every cost
 * calculation reads (FB-14). This module is the only place that total is worked out.
 *
 * 3C (docs/phase3c-plan.md §2): a line is a **person rate** (optionally *for* Adult, Child or
 * Anyone), a **group price** (`group: true`, always one) or an **extra** (`extra: true`, things,
 * not people). A line with neither flag is exactly a line from before 3C.
 */

import { z } from 'zod';

import { formatMoney } from './format';

const MAX_LABEL = 40;

/** Who a person rate is for. Absent: not set — a line from before 3C, or left open. */
export const AUDIENCES = ['adult', 'child', 'any'] as const;
export type Audience = (typeof AUDIENCES)[number];

export const AUDIENCE_LABEL: Record<Audience, string> = {
  adult: 'Adult',
  child: 'Child',
  any: 'Anyone',
};

export const rateLineSchema = z
  .object({
    /** 'Adult', 'Child', 'Family ticket' — a name for the rate, never an age rule. Optional. */
    label: z.string().trim().max(MAX_LABEL).optional(),
    /** Whole people (things, for an extra), at least one: a zero line is refused, not dropped. */
    quantity: z
      .number({ error: 'Enter how many' })
      .int('Whole people only')
      .min(1, 'At least 1 — remove the rate instead'),
    /** Minor units of the item's currency. 0 is free. */
    unitAmount: z
      .number({ error: 'Enter a price like 12.50' })
      .int()
      .nonnegative('A price cannot be negative'),
    /** Person rates only. Never inferred from the label. */
    for: z.enum(AUDIENCES).optional(),
    /** A fixed price for a group: one of it, and it counts no people. */
    group: z.literal(true).optional(),
    /** Things or services, not people: never counted as people, never re-priced for who's going. */
    extra: z.literal(true).optional(),
  })
  .superRefine((line, context) => {
    if (line.group && line.extra) {
      context.addIssue({ code: 'custom', message: 'A rate is a group price or an extra, not both' });
    }
    if (line.group && line.quantity !== 1) {
      context.addIssue({
        code: 'custom',
        message: 'A group price is one price — add another for a second group',
      });
    }
    if ((line.group || line.extra) && line.for !== undefined) {
      context.addIssue({
        code: 'custom',
        message: 'Only a rate for people is for an adult or a child',
      });
    }
  });

export const pricingSchema = z.object({
  /** 'perPerson' since C3; it names any breakdown into lines, kept so old breakdowns stay valid. */
  mode: z.literal('perPerson'),
  lines: z.array(rateLineSchema).min(1, 'Add a rate'),
});

export type RateLine = z.infer<typeof rateLineSchema>;
export type Pricing = z.infer<typeof pricingSchema>;

/** A rate as it is being typed: its price may not be there yet. */
export type DraftRateLine = Omit<RateLine, 'unitAmount'> & { unitAmount: number | undefined };

/** A breakdown as it is being typed. */
export type DraftPricing = {
  mode: 'perPerson';
  lines: DraftRateLine[];
};

/** What a line is: a rate for people, a group price or an extra. */
export type LineType = 'person' | 'group' | 'extra';

export function lineType(line: Pick<RateLine, 'group' | 'extra'>): LineType {
  return line.group ? 'group' : line.extra ? 'extra' : 'person';
}

/**
 * The breakdown a form writes from its lines: every line keeps its type and who it is for, so
 * editing one line never drops another's. An empty label and an unset audience are left out, and
 * a group price is always one.
 */
export function pricingFromDraft(lines: readonly DraftRateLine[]): DraftPricing {
  return {
    mode: 'perPerson',
    lines: lines.map((line) => {
      const label = line.label?.trim();
      const type = lineType(line);
      return {
        ...(label ? { label } : {}),
        quantity: type === 'group' ? 1 : line.quantity,
        unitAmount: line.unitAmount,
        ...(type === 'person' && line.for ? { for: line.for } : {}),
        ...(type === 'group' ? { group: true as const } : {}),
        ...(type === 'extra' ? { extra: true as const } : {}),
      };
    }),
  };
}

type Details = Record<string, unknown> | null | undefined;

/** The per-person breakdown saved on an item, or null for a plain total — or one unreadable. */
export function pricingOf(details: Details): Pricing | null {
  const parsed = pricingSchema.safeParse(details?.pricing);
  return parsed.success ? parsed.data : null;
}

/**
 * Details with the breakdown set, or removed for a plain total; undefined when nothing is left. A
 * form may set one still being typed — the item's schema checks it on save, not this.
 */
export function withPricing(
  details: Details,
  pricing: Pricing | DraftPricing | null,
): Record<string, unknown> | undefined {
  const { pricing: _previous, ...rest } = details ?? {};
  const next = pricing ? { ...rest, pricing } : rest;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The total the lines make, in minor units. Null when it would not be a safe integer. */
export function pricingTotal(lines: readonly Pick<RateLine, 'quantity' | 'unitAmount'>[]): number | null {
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitAmount, 0);
  return Number.isSafeInteger(total) ? total : null;
}

/** How many people the lines are priced for: person rates only — a group or an extra is nobody. */
export function pricedFor(pricing: {
  lines: readonly Pick<RateLine, 'quantity' | 'group' | 'extra'>[];
}): number {
  return pricing.lines.reduce(
    (sum, line) => (lineType(line) === 'person' ? sum + line.quantity : sum),
    0,
  );
}

/**
 * One line of the working: '2 × EUR 90.00 Adult', '1 × free Child', 'Family ticket EUR 120.00',
 * 'Extra: 2 × EUR 20.00 Sled'. The label first; without one, the audience (Anyone adds nothing).
 */
export function lineText(line: RateLine, currency: string): string {
  const price = line.unitAmount === 0 ? 'free' : formatMoney(line.unitAmount, currency);
  const type = lineType(line);
  if (type === 'group') return `${line.label ?? 'Group price'} ${price}`;
  const name =
    line.label ?? (line.for && line.for !== 'any' ? AUDIENCE_LABEL[line.for] : undefined);
  const working = [`${line.quantity} × ${price}`, name].filter(Boolean).join(' ');
  return type === 'extra' ? `Extra: ${working}` : working;
}

/** '2 × EUR 90.00 Adult + 1 × EUR 60.00 Child = EUR 240.00' — the working, shown with the total. */
export function pricingText(pricing: Pricing, currency: string): string {
  const parts = pricing.lines.map((line) => lineText(line, currency));
  const total = pricingTotal(pricing.lines);
  return total === null
    ? parts.join(' + ')
    : `${parts.join(' + ')} = ${formatMoney(total, currency)}`;
}

/**
 * Whether a saved breakdown still adds up to the saved price — what an item's save checks, so the
 * two can never drift apart. A plain total (no breakdown) always does.
 */
export function pricingMatches(details: Details, priceAmount: number | undefined): boolean {
  if (details?.pricing === undefined) return true;
  const pricing = pricingOf(details);
  return pricing !== null && pricingTotal(pricing.lines) === priceAmount;
}

type Going = readonly { classification: 'adult' | 'child' | 'unspecified' }[];

export type PricingSuggestionInput = {
  participants: Going;
  currentTotal?: number;
};

export type SuggestedLine = {
  label: string;
  quantity: number;
  unitAmount: number | undefined;
  for: Audience;
};

function countGoing(going: Going) {
  return {
    adults: going.filter((p) => p.classification === 'adult').length,
    children: going.filter((p) => p.classification === 'child').length,
    unspecified: going.filter((p) => p.classification === 'unspecified').length,
  };
}

/**
 * Suggests default lines when creating a new per-person pricing breakdown.
 * Non-destructive rules:
 * - If participants have adult/child classifications, generates corresponding tagged lines.
 * - 'unspecified' participants are treated distinctly: never assumed to be Adult, never given an
 *   'Adult' label; their line is for Anyone.
 * - When all participants are unspecified or no participants are provided, returns a single
 *   unlabelled line for Anyone.
 * - Unit price is never invented.
 */
export function suggestPricingLines({ participants }: PricingSuggestionInput): SuggestedLine[] {
  const { adults, children, unspecified } = countGoing(participants);

  const lines: SuggestedLine[] = [];
  if (adults > 0) {
    lines.push({ label: 'Adult', quantity: adults, unitAmount: undefined, for: 'adult' });
  }
  if (children > 0) {
    lines.push({ label: 'Child', quantity: children, unitAmount: undefined, for: 'child' });
  }
  if (unspecified > 0) {
    lines.push({ label: '', quantity: unspecified, unitAmount: undefined, for: 'any' });
  }

  if (lines.length === 0) {
    return [
      { label: '', quantity: Math.max(1, participants.length), unitAmount: undefined, for: 'any' },
    ];
  }

  return lines;
}

export type GoingSuggestion =
  | { kind: 'nobody' }
  | { kind: 'noPersonRates' }
  | { kind: 'untagged' }
  | { kind: 'ambiguous'; audience: Audience }
  | { kind: 'unpriced'; adults: number; children: number; unspecified: number }
  | { kind: 'overflow' }
  | { kind: 'same' }
  | { kind: 'proposal'; lines: RateLine[]; total: number; removed: RateLine[] };

/**
 * *Price for who's going* (3C, docs/phase3c-plan.md §4): what the person rates would be for the
 * people ticked, as a **suggestion** — the form changes only when the person confirms it, and
 * never on a booking marked paid. Adults go on the Adult rate, else Anyone; children on the Child
 * rate, else Anyone; people not specified on Anyone only, never assumed adult. Group prices and
 * extras are kept exactly. A rate nobody is left on is removed, and said so.
 */
export function priceForWhosGoing(lines: readonly RateLine[], going: Going): GoingSuggestion {
  if (going.length === 0) return { kind: 'nobody' };
  const people = lines.filter((line) => lineType(line) === 'person');
  if (people.length === 0) return { kind: 'noPersonRates' };

  // One rate with no audience, on its own, is for anyone — as *Price for N* always was.
  const lineFor = new Map<Audience, RateLine>();
  for (const line of people) {
    const audience = line.for ?? (people.length === 1 ? 'any' : undefined);
    if (audience === undefined) return { kind: 'untagged' };
    if (lineFor.has(audience)) return { kind: 'ambiguous', audience };
    lineFor.set(audience, line);
  }

  const { adults, children, unspecified } = countGoing(going);
  const count = new Map<RateLine, number>();
  /** Puts n people on a line; false when there are people and no line for them. */
  const place = (line: RateLine | undefined, n: number) => {
    if (n === 0) return true;
    if (!line) return false;
    count.set(line, (count.get(line) ?? 0) + n);
    return true;
  };
  const any = lineFor.get('any');
  const missing = {
    adults: place(lineFor.get('adult') ?? any, adults) ? 0 : adults,
    children: place(lineFor.get('child') ?? any, children) ? 0 : children,
    unspecified: place(any, unspecified) ? 0 : unspecified,
  };
  if (missing.adults + missing.children + missing.unspecified > 0) {
    return { kind: 'unpriced', ...missing };
  }

  const next: RateLine[] = [];
  const removed: RateLine[] = [];
  for (const line of lines) {
    if (lineType(line) !== 'person') {
      next.push(line);
      continue;
    }
    const quantity = count.get(line) ?? 0;
    if (quantity === 0) removed.push(line);
    else next.push({ ...line, quantity });
  }
  if (removed.length === 0 && next.every((line, i) => line.quantity === lines[i]?.quantity)) {
    return { kind: 'same' };
  }
  const total = pricingTotal(next);
  if (total === null) return { kind: 'overflow' };
  return { kind: 'proposal', lines: next, total, removed };
}
