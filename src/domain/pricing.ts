/**
 * Price per person (C3): rate lines — *2 × Adult at EUR 90 + 1 × Child at EUR 60* — kept in
 * `details.pricing`, and the total they make in `price_amount`, the one number every cost
 * calculation reads (FB-14). This module is the only place that total is worked out.
 */

import { z } from 'zod';

import { formatMoney } from './format';

const MAX_LABEL = 40;

export const rateLineSchema = z.object({
  /** 'Adult', 'Child' — a name for the rate, never an age rule. Optional. */
  label: z.string().trim().max(MAX_LABEL).optional(),
  /** Whole people, at least one: a zero line is refused rather than quietly dropped. */
  quantity: z
    .number({ error: 'Enter how many' })
    .int('Whole people only')
    .min(1, 'At least 1 — remove the rate instead'),
  /** Minor units of the item's currency. */
  unitAmount: z
    .number({ error: 'Enter a price like 12.50' })
    .int()
    .nonnegative('A price cannot be negative'),
});

export const pricingSchema = z.object({
  mode: z.literal('perPerson'),
  lines: z.array(rateLineSchema).min(1, 'Add a rate'),
});

export type RateLine = z.infer<typeof rateLineSchema>;
export type Pricing = z.infer<typeof pricingSchema>;

/** A breakdown as it is being typed: a rate's price may not be there yet. */
export type DraftPricing = {
  mode: 'perPerson';
  lines: { label?: string; quantity: number; unitAmount: number | undefined }[];
};

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
export function pricingTotal(lines: readonly RateLine[]): number | null {
  const total = lines.reduce((sum, line) => sum + line.quantity * line.unitAmount, 0);
  return Number.isSafeInteger(total) ? total : null;
}

/** How many people the lines are priced for: the sum of their quantities. */
export function pricedFor(pricing: Pricing): number {
  return pricing.lines.reduce((sum, line) => sum + line.quantity, 0);
}

/** '2 × EUR 90.00 Adult + 1 × EUR 60.00 Child = EUR 240.00' — the working, shown with the total. */
export function pricingText(pricing: Pricing, currency: string): string {
  const parts = pricing.lines.map((line) =>
    [`${line.quantity} × ${formatMoney(line.unitAmount, currency)}`, line.label]
      .filter(Boolean)
      .join(' '),
  );
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
