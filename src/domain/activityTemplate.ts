/**
 * What the person gives an AI assistant (2C): short rules and one complete example. Kept beside
 * the format so the two cannot drift — a test imports the example and expects no warnings — and
 * written without a word about the app's internals: an assistant needs the file, not the database.
 * The same text is in docs/ai-activities-format.md.
 */

import { ACTIVITY_FORMAT, ACTIVITY_FORMAT_VERSION } from './activityFormat';

export const EXAMPLE_ACTIVITY_FILE = {
  format: ACTIVITY_FORMAT,
  version: ACTIVITY_FORMAT_VERSION,
  activities: [
    {
      title: 'Husky safari',
      kind: 'activity',
      type: 'tour',
      status: 'planned',
      date: '2026-11-21',
      startTime: '13:00',
      endTime: '16:00',
      location: { name: 'Bearhill Husky', address: 'Sierijärventie 55, Rovaniemi' },
      price: { amount: '290.00', currency: 'EUR' },
      links: [{ label: 'Website', url: 'https://example.com/husky-safari' }],
      notes: 'Warm clothes are provided.',
    },
    {
      title: 'Arktikum science museum',
      kind: 'activity',
      type: 'museum',
      status: 'idea',
      priority: 'must',
      location: { name: 'Arktikum', latitude: 66.5115, longitude: 25.7311 },
    },
    {
      title: 'Lunch at Nili',
      kind: 'food',
      type: 'restaurant',
      status: 'idea',
      priority: 'want',
      description: 'Lappish food: reindeer, salmon, berries.',
    },
  ],
};

export const AI_INSTRUCTIONS = `Generate a Travel Organizer activities file in JSON, using the format below.

Rules:
- Output only the JSON: no comments, no explanation.
- "format" is always "${ACTIVITY_FORMAT}" and "version" is always ${ACTIVITY_FORMAT_VERSION}.
- Each activity needs a "title". Every other field is optional — leave it out when you do not know it.
- Include only information you know or can verify. Do not invent dates, times, prices, addresses, coordinates, links or booking details.
- Use "status": "idea" for a suggestion. Use "planned" only for something the traveller has said they will do. Never write "booked" or "confirmed".
- "kind" is one of: activity, food, stay, transport, other.
- "type" is optional and must belong to the kind:
  activity: museum, gallery, tour, attraction, event, theatre, outdoor, spa
  food: restaurant, cafe, bar, bakery, market
  stay: hotel, apartment, hostel, guesthouse, camping
  transport: flight, train, bus, ferry, car, taxi, transfer, walk
  other: luggage, insurance, parking, shopping, viewpoint
- "priority" (ideas only): must, want or maybe.
- Dates are YYYY-MM-DD. Times are 24-hour HH:mm, local to the place. A time needs a date.
- "timeZone" (optional) is an IANA name such as Europe/Helsinki; leave it out to use the trip's zone.
- "location" may have "name", "address", and "latitude" with "longitude" (both or neither).
- "description" and "notes" are plain text, up to 4000 characters each.
- "price" is the expected total: {"amount": "12.50", "currency": "EUR"} — at most two decimals, a three-letter currency code. Leave it out when unknown. It is never a payment.
- "links": up to 10, each {"label": "...", "url": "https://..."}; only https or http.
- "transport" (only for kind transport) may have "from", "to", "carrier", "number".
- At most 300 activities.

Example:
${JSON.stringify(EXAMPLE_ACTIVITY_FILE, null, 2)}
`;
