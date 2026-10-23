/**
 * The itinerary as a printable document (C4): the HTML a PDF is rendered from, built from the same
 * selectors the screens use — so a time, a zone or a total reads in the PDF exactly as it does in
 * the app. Pure: no React, no files. Everything a person typed is escaped.
 *
 * What goes in is chosen (`PdfOptions`); traveller names and booking references are off unless
 * switched on (FB-18). Attachments are named, never linked — a recipient cannot open the sender's
 * files. The document is a snapshot: it says when it was made.
 */

import { refundNotSaid, tripExpenses } from './bookingCosts';
import { convertTripTotal, rateText, type ExchangeRate } from './conversion';
import { dayStops, daysForStop, tripDates } from './dayRail';
import { formatDateRange, formatDayHeading, formatMoney, formatShortMoment } from './format';
import { entryRoleLabel, entryZoneLabel, openTasks } from './itinerary';
import { amountText, listProgress, progressText, type List, type ListItem } from './lists';
import { pricingOf, pricingText } from './pricing';
import type { Resource } from './resource';
import { timeOfDay } from './time';
import { buildTimeline, type TimelineEntry } from './timeline';
import { namesLine, type Traveller } from './traveller';
import type { Trip } from './trip';
import { routeLabel, transportDetails, type TripItem } from './tripItem';
import { conversionCosts } from './tripConversion';
import { routePlace, zoneName } from './zoneHints';

export type PdfOptions = {
  /** The notes written on each plan. */
  notes: boolean;
  /** Booking references — off by default: whoever holds the PDF holds them. */
  references: boolean;
  /** Who is going, by name — off by default. */
  travellers: boolean;
  tasks: boolean;
  lists: boolean;
  costs: boolean;
};

export const DEFAULT_PDF_OPTIONS: PdfOptions = {
  notes: true,
  references: false,
  travellers: false,
  tasks: false,
  lists: false,
  costs: false,
};

export type ItineraryInput = {
  trip: Trip;
  items: readonly TripItem[];
  travellers: readonly Traveller[];
  /** Each item's attachments, named in the PDF and never linked. */
  documents: ReadonlyMap<string, readonly Resource[]>;
  lists: readonly { list: List; items: readonly ListItem[] }[];
  generatedAt: Date;
  /**
   * The trip's rates and the records paying towards its bookings (Phase 4), for one converted line
   * under the bookings table when the trip has a reporting currency. Absent: none.
   */
  conversion?: {
    rates: readonly ExchangeRate[];
    expenses: Parameters<typeof conversionCosts>[1];
    payments: Parameters<typeof conversionCosts>[2];
  };
};

const ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/** Text safe to put inside HTML: nothing typed can become markup. */
export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (char) => ESCAPES[char]);
}

const pad = (value: number) => String(value).padStart(2, '0');

/** 'YYYY-MM-DD' of an instant in the phone's time. */
const localDate = (at: Date) => `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
const localTime = (at: Date) => `${pad(at.getHours())}:${pad(at.getMinutes())}`;

/** '13 Oct 2026, 09:42' in the phone's time. */
function generatedText(at: Date): string {
  return `${formatDateRange(localDate(at), localDate(at))}, ${localTime(at)}`;
}

/** 'Lapland-itinerary-2026-10-13-0942.pdf': the trip, and the minute it was made. */
export function itineraryFileName(tripName: string, at: Date): string {
  const name =
    tripName
      // Composed, and marks kept: 'й' stays one letter rather than losing its breve.
      .normalize('NFC')
      .replace(/[^\p{L}\p{M}\p{N}]+/gu, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 40) || 'trip';
  return `${name}-itinerary-${localDate(at)}-${localTime(at).replace(':', '')}.pdf`;
}

/** One entry of a day: its time, what it is, where, and its zone when it keeps its own. */
function entryHtml(
  entry: TimelineEntry<TripItem>,
  input: ItineraryInput,
  options: PdfOptions,
): string {
  const { item } = entry;
  const role = entryRoleLabel(entry);
  const title = role ? `${role} · ${item.title}` : item.title;
  const where = routeLabel(transportDetails(item)) ?? item.locationName;
  const zone = entryZoneLabel(entry);
  const lines: string[] = [];

  if (where) lines.push(escapeHtml(where));
  if (item.address && item.address !== where) lines.push(escapeHtml(item.address));
  // A journey says where and when it arrives, on the departure itself.
  if (item.kind === 'transport' && entry.role === 'full' && item.end && timeOfDay(item.end)) {
    const arrives = zoneName(item.end.tz, routePlace(item, 'end'));
    const verb = entryRoleLabel({ role: 'end', item }) ?? 'Arrives';
    lines.push(`${verb} ${escapeHtml(timeOfDay(item.end)!)} · ${escapeHtml(arrives)} time`);
  }
  if (options.references && item.confirmationCode) {
    lines.push(`Reference: <strong>${escapeHtml(item.confirmationCode)}</strong>`);
  }
  if (options.notes && item.notes) lines.push(`<em>${escapeHtml(item.notes)}</em>`);
  const documents = input.documents.get(item.id) ?? [];
  if (documents.length > 0) {
    lines.push(`Documents: ${documents.map((doc) => escapeHtml(doc.label)).join(', ')}`);
  }

  const tags = [
    item.status === 'idea' ? '<span class="tag">Optional</span>' : '',
    zone ? `<span class="zone">${escapeHtml(zone)} time</span>` : '',
  ].join('');

  return `<div class="entry">
  <div class="time">${escapeHtml(entry.time ?? 'All day')}</div>
  <div class="what">
    <div class="title">${escapeHtml(title)} ${tags}</div>
    ${lines.map((line) => `<div class="line">${line}</div>`).join('\n    ')}
  </div>
</div>`;
}

function daysHtml(input: ItineraryInput, options: PdfOptions): string {
  // Tasks are a list of their own (the To do appendix), not part of the days.
  const days = buildTimeline(input.items.filter((item) => item.kind !== 'task'));
  const stops = dayStops(
    input.trip,
    days.map((day) => day.day),
    false,
  );
  const dayNumbers = new Map(
    stops.flatMap((stop) => (stop.kind === 'day' ? [[stop.date, stop.number] as const] : [])),
  );
  // Every trip day, empty ones included, plus anything dated before or after the trip.
  const before = daysForStop({ kind: 'before' }, days, input.trip);
  const after = daysForStop({ kind: 'after' }, days, input.trip);
  const trip = tripDates(input.trip).map(
    (date) => days.find((day) => day.day === date) ?? { day: date, entries: [] },
  );

  return [...before, ...trip, ...after]
    .map((day) => {
      const number = dayNumbers.get(day.day);
      const dayNumber = number ? ` <span class="daynum">Day ${number}</span>` : '';
      const heading = `${formatDayHeading(day.day)}${dayNumber}`;
      const body =
        day.entries.length > 0
          ? day.entries.map((entry) => entryHtml(entry, input, options)).join('\n')
          : '<p class="empty">Nothing planned.</p>';
      return `<section class="day"><h2>${heading}</h2>\n${body}</section>`;
    })
    .join('\n');
}

/** Where you sleep and how you travel, at a glance, before the days. */
function summaryHtml(input: ItineraryInput): string {
  const confirmed = input.items.filter((item) => item.status === 'confirmed' && item.start);
  const row = (item: TripItem) => {
    const range = [
      formatShortMoment(item.start!.local, item.start!.precision),
      item.end ? formatShortMoment(item.end.local, item.end.precision) : null,
    ]
      .filter(Boolean)
      .join(' – ');
    const where = routeLabel(transportDetails(item)) ?? item.locationName ?? '';
    const cells = [item.title, where, range].map((cell) => `<td>${escapeHtml(cell)}</td>`);
    return `<tr>${cells.join('')}</tr>`;
  };
  const stays = confirmed.filter((item) => item.kind === 'stay');
  const travel = confirmed.filter((item) => item.kind === 'transport');
  const table = (title: string, rows: readonly TripItem[]) =>
    rows.length > 0 ? `<h3>${title}</h3><table>${rows.map(row).join('')}</table>` : '';
  const tables = table('Stays', stays) + table('Travel', travel);
  return tables ? `<section class="summary">${tables}</section>` : '';
}

function tasksHtml(input: ItineraryInput): string {
  const tasks = openTasks(input.items);
  if (tasks.length === 0) return '';
  const line = (task: TripItem) => {
    const when = task.start ? formatShortMoment(task.start.local, task.start.precision) : null;
    const date = when ? ` <span class="muted">· ${escapeHtml(when)}</span>` : '';
    return `<li>☐ ${escapeHtml(task.title)}${date}</li>`;
  };
  return `<section class="appendix"><h2>To do</h2><ul class="checks">${tasks
    .map(line)
    .join('')}</ul></section>`;
}

function listsHtml(input: ItineraryInput): string {
  if (input.lists.length === 0) return '';
  return input.lists
    .map(({ list, items }) => {
      const progress = progressText(list.kind, listProgress(items));
      const heading = `${escapeHtml(list.name)} <span class="daynum">${escapeHtml(progress)}</span>`;
      const lines = items.map((item) => {
        const extra = [amountText(item), item.note].filter(Boolean).join(' · ');
        const detail = extra ? ` <span class="muted">· ${escapeHtml(extra)}</span>` : '';
        return `<li>${item.doneAt ? '☑' : '☐'} ${escapeHtml(item.label)}${detail}</li>`;
      });
      return `<section class="appendix"><h2>${heading}</h2><ul class="checks">${lines.join('')}</ul></section>`;
    })
    .join('\n');
}

/**
 * The bookings in the reporting currency, as the Expenses tab works it out: ≈ when any part is
 * an estimate, and what has no rate named. Empty when the trip is not converted.
 */
function convertedHtml(input: ItineraryInput): string {
  const base = input.trip.reportCurrency;
  if (!base || !input.conversion) return '';
  const { bookings } = conversionCosts(input.items, input.conversion.expenses, input.conversion.payments);
  if (bookings.length === 0) return '';
  const converted = convertTripTotal({ base, rates: input.conversion.rates, bookings, spending: [] });
  const missing = converted.notIncluded
    .map(({ amount, currency }) => escapeHtml(formatMoney(amount, currency)))
    .join(', ');
  return `<p><strong>${converted.estimated ? '≈ ' : ''}${escapeHtml(formatMoney(converted.bookings, base))}</strong> in ${escapeHtml(base)}${
    converted.estimated
      ? ` (estimated at ${converted.ratesUsed.map((rate) => escapeHtml(rateText(rate))).join(', ')})`
      : ''
  }${missing ? `; not included: ${missing}, with no rate` : ''}.</p>`;
}

/** Bookings per currency, as recorded: expected, paid, still to pay; and converted, if set. */
function costsHtml(input: ItineraryInput): string {
  const totals = tripExpenses(input.items);
  const unknown = refundNotSaid(input.items).byCurrency;
  if (totals.length === 0 && unknown.length === 0) return '';
  const money = (amount: number, currency: string) => escapeHtml(formatMoney(amount, currency));
  const rows = totals
    .map(
      ({ total, paid, toPay, currency }) =>
        `<tr><td>${money(total, currency)}</td><td>Paid ${money(paid, currency)}</td>` +
        `<td>To pay ${money(toPay, currency)}</td></tr>`,
    )
    .join('');
  // A per-person price shows its working, as on the item (C3).
  const perPerson = input.items
    .flatMap((item) => {
      const pricing = pricingOf(item.details);
      return item.status === 'confirmed' && item.priceCurrency && pricing
        ? [`<li>${escapeHtml(item.title)}: ${escapeHtml(pricingText(pricing, item.priceCurrency))}</li>`]
        : [];
    })
    .join('');
  const note = unknown.length
    ? `<p class="muted">Not counted: ${unknown
        .map(({ amount, currency }) => escapeHtml(formatMoney(amount, currency)))
        .join(', ')} cancelled with the refund not specified.</p>`
    : '';
  return `<section class="appendix"><h2>Booking costs</h2><table>${rows}</table>${convertedHtml(input)}${
    perPerson ? `<ul>${perPerson}</ul>` : ''
  }${note}</section>`;
}

const STYLE = `
@page {
  size: A4;
  margin: 16mm 14mm 18mm;
  @bottom-right { content: counter(page) " / " counter(pages); font-size: 9pt; color: #536477; }
}
* { box-sizing: border-box; }
body { font-family: Roboto, "Noto Sans", Arial, sans-serif; color: #172331; font-size: 10.5pt; line-height: 1.45; }
header { border-bottom: 2px solid #13616b; padding-bottom: 8pt; margin-bottom: 12pt; }
h1 { font-size: 22pt; margin: 0 0 2pt; }
h2 { font-size: 13pt; margin: 14pt 0 4pt; break-after: avoid; }
h3 { font-size: 11pt; margin: 8pt 0 2pt; break-after: avoid; }
.meta, .muted, .empty { color: #536477; }
.daynum { color: #536477; font-weight: normal; font-size: 10pt; }
.day { break-inside: auto; }
.entry { display: flex; gap: 10pt; padding: 4pt 0; border-bottom: 0.5pt solid #dce3eb; break-inside: avoid; }
.time { width: 52pt; flex-shrink: 0; font-weight: bold; font-variant-numeric: tabular-nums; }
.what { flex: 1; }
.title { font-weight: bold; }
.line { color: #36475a; }
.tag { font-size: 8.5pt; border: 0.5pt solid #13616b; color: #13616b; border-radius: 3pt; padding: 0 3pt; font-weight: normal; }
.zone { font-size: 8.5pt; color: #8b431e; font-weight: normal; margin-left: 4pt; }
table { width: 100%; border-collapse: collapse; }
td { padding: 3pt 4pt; border-bottom: 0.5pt solid #dce3eb; vertical-align: top; }
.checks { list-style: none; padding: 0; margin: 0; }
.checks li { padding: 2pt 0; break-inside: avoid; }
.summary, .appendix { break-inside: avoid-page; }
footer { margin-top: 18pt; font-size: 8.5pt; color: #536477; }
`;

/** The whole document. */
export function itineraryHtml(input: ItineraryInput, options: PdfOptions): string {
  const { trip } = input;
  const people = options.travellers ? namesLine(input.travellers) : '';
  const meta = [
    trip.destination,
    formatDateRange(trip.startDate, trip.endDate),
    `Times are local to where each thing happens`,
  ]
    .filter(Boolean)
    .map((part) => escapeHtml(part!))
    .join(' · ');

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(trip.name)} itinerary</title>
<style>${STYLE}</style></head>
<body>
<header>
  <h1>${escapeHtml(trip.name)}</h1>
  <div class="meta">${meta}</div>
  ${people ? `<div class="meta">${escapeHtml(people)}</div>` : ''}
</header>
${summaryHtml(input)}
${daysHtml(input, options)}
${options.tasks ? tasksHtml(input) : ''}
${options.lists ? listsHtml(input) : ''}
${options.costs ? costsHtml(input) : ''}
<footer>Made ${escapeHtml(generatedText(input.generatedAt))} with Travel Organizer. A snapshot: later changes in the app are not in it. Tickets and documents are named here, not attached.</footer>
</body></html>`;
}
