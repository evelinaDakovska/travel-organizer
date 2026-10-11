import { TZDate } from '@date-fns/tz';

/**
 * Hermes has no `Intl.supportedValuesOf('timeZone')` (verified on device, M1 spike), so the
 * picker needs its own list. Each zone carries the places people actually search for: the
 * country first, then cities — nobody looks for "Rome" when they are going to Milan.
 *
 * A place belongs to the zone whose clock it keeps, not to its capital: Bali is not on Jakarta
 * time, and the Canaries are an hour behind Madrid. Weighted towards Europe; extend as needed.
 * Spellings with and without accents are both listed, because Hermes' `normalize` is not
 * something to bet on.
 */
export const TIMEZONE_PLACES = {
  'Europe/Sofia': ['Bulgaria', 'Plovdiv', 'Varna', 'Burgas', 'Bansko'],
  'Europe/London': ['United Kingdom', 'UK', 'England', 'Scotland', 'Wales', 'Britain', 'Manchester', 'Edinburgh', 'Liverpool', 'Glasgow', 'Belfast'],
  'Europe/Dublin': ['Ireland', 'Cork', 'Galway'],
  'Europe/Lisbon': ['Portugal', 'Lisboa', 'Porto', 'Faro', 'Algarve'],
  'Europe/Madrid': ['Spain', 'Barcelona', 'Seville', 'Valencia', 'Malaga', 'Málaga', 'Bilbao', 'Ibiza', 'Mallorca', 'Palma'],
  'Europe/Paris': ['France', 'Nice', 'Lyon', 'Marseille', 'Bordeaux', 'Strasbourg'],
  'Europe/Brussels': ['Belgium', 'Bruges', 'Antwerp', 'Ghent'],
  'Europe/Amsterdam': ['Netherlands', 'Holland', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'],
  'Europe/Luxembourg': ['Luxembourg'],
  'Europe/Berlin': ['Germany', 'Munich', 'München', 'Hamburg', 'Frankfurt', 'Cologne', 'Köln', 'Stuttgart', 'Dusseldorf', 'Düsseldorf', 'Dresden'],
  'Europe/Zurich': ['Switzerland', 'Geneva', 'Basel', 'Bern', 'Lucerne', 'Lausanne', 'Zermatt'],
  'Europe/Monaco': ['Monaco', 'Monte Carlo'],
  'Europe/Rome': ['Italy', 'Milan', 'Milano', 'Venice', 'Florence', 'Naples', 'Turin', 'Bologna', 'Verona', 'Bergamo', 'Pisa', 'Genoa', 'Como', 'Palermo', 'Sicily', 'Sardinia', 'Vatican', 'San Marino'],
  'Europe/Vienna': ['Austria', 'Wien', 'Salzburg', 'Innsbruck', 'Graz', 'Hallstatt'],
  'Europe/Prague': ['Czechia', 'Czech Republic', 'Praha', 'Brno', 'Cesky Krumlov'],
  'Europe/Warsaw': ['Poland', 'Krakow', 'Kraków', 'Gdansk', 'Gdańsk', 'Wroclaw', 'Wrocław'],
  'Europe/Budapest': ['Hungary', 'Debrecen', 'Lake Balaton'],
  'Europe/Bucharest': ['Romania', 'Cluj', 'Brasov', 'Brașov', 'Timisoara', 'Constanta'],
  'Europe/Chisinau': ['Moldova'],
  'Europe/Athens': ['Greece', 'Thessaloniki', 'Crete', 'Santorini', 'Mykonos', 'Rhodes', 'Corfu'],
  'Asia/Nicosia': ['Cyprus', 'Larnaca', 'Limassol', 'Paphos', 'Ayia Napa'],
  'Europe/Istanbul': ['Turkey', 'Türkiye', 'Ankara', 'Antalya', 'Izmir', 'Cappadocia', 'Bodrum'],
  'Europe/Copenhagen': ['Denmark', 'Aarhus'],
  'Europe/Oslo': ['Norway', 'Bergen', 'Tromso', 'Tromsø'],
  'Europe/Stockholm': ['Sweden', 'Gothenburg', 'Malmo', 'Malmö', 'Kiruna'],
  'Europe/Helsinki': ['Finland', 'Lapland', 'Rovaniemi', 'Turku', 'Tampere'],
  'Europe/Tallinn': ['Estonia', 'Tartu'],
  'Europe/Riga': ['Latvia'],
  'Europe/Vilnius': ['Lithuania', 'Kaunas'],
  'Europe/Kyiv': ['Ukraine', 'Kiev', 'Lviv', 'Odesa', 'Odessa'],
  'Europe/Moscow': ['Russia', 'Saint Petersburg', 'St Petersburg'],
  'Europe/Belgrade': ['Serbia', 'Novi Sad'],
  'Europe/Zagreb': ['Croatia', 'Split', 'Dubrovnik', 'Zadar', 'Hvar'],
  'Europe/Sarajevo': ['Bosnia and Herzegovina', 'Bosnia', 'Mostar'],
  'Europe/Podgorica': ['Montenegro', 'Kotor', 'Budva'],
  'Europe/Skopje': ['North Macedonia', 'Macedonia', 'Ohrid'],
  'Europe/Tirane': ['Albania', 'Tirana', 'Durres', 'Saranda'],
  'Europe/Ljubljana': ['Slovenia', 'Bled', 'Piran'],
  'Europe/Bratislava': ['Slovakia', 'Kosice', 'Košice'],
  'Europe/Malta': ['Malta', 'Valletta', 'Gozo'],
  'Atlantic/Reykjavik': ['Iceland'],
  'Atlantic/Canary': ['Canary Islands', 'Tenerife', 'Gran Canaria', 'Lanzarote', 'Fuerteventura', 'Las Palmas'],
  'Atlantic/Madeira': ['Madeira', 'Funchal'],
  'America/New_York': ['United States', 'USA', 'Boston', 'Washington', 'Miami', 'Philadelphia', 'Atlanta', 'Orlando'],
  'America/Chicago': ['United States', 'USA', 'Houston', 'Dallas', 'Austin', 'New Orleans'],
  'America/Denver': ['United States', 'USA', 'Salt Lake City'],
  'America/Los_Angeles': ['United States', 'USA', 'California', 'San Francisco', 'Las Vegas', 'Seattle', 'San Diego'],
  'America/Toronto': ['Canada', 'Montreal', 'Ottawa', 'Quebec'],
  'America/Vancouver': ['Canada'],
  'America/Mexico_City': ['Mexico', 'Guadalajara'],
  'America/Cancun': ['Mexico', 'Tulum', 'Playa del Carmen'],
  'America/Havana': ['Cuba'],
  'America/Bogota': ['Colombia', 'Medellin', 'Medellín', 'Cartagena'],
  'America/Lima': ['Peru', 'Cusco', 'Machu Picchu'],
  'America/Sao_Paulo': ['Brazil', 'Rio de Janeiro'],
  'America/Argentina/Buenos_Aires': ['Argentina'],
  'Africa/Casablanca': ['Morocco', 'Marrakech', 'Marrakesh', 'Fes', 'Tangier'],
  'Africa/Algiers': ['Algeria'],
  'Africa/Tunis': ['Tunisia'],
  'Africa/Cairo': ['Egypt', 'Hurghada', 'Sharm El Sheikh', 'Luxor'],
  'Africa/Lagos': ['Nigeria'],
  'Africa/Nairobi': ['Kenya', 'Mombasa'],
  'Africa/Johannesburg': ['South Africa', 'Cape Town'],
  'Asia/Jerusalem': ['Israel', 'Tel Aviv'],
  'Asia/Tbilisi': ['Georgia'],
  'Asia/Yerevan': ['Armenia'],
  'Asia/Baku': ['Azerbaijan'],
  'Asia/Dubai': ['United Arab Emirates', 'UAE', 'Abu Dhabi'],
  'Asia/Qatar': ['Qatar', 'Doha'],
  'Asia/Riyadh': ['Saudi Arabia', 'Jeddah'],
  'Asia/Tehran': ['Iran'],
  'Asia/Karachi': ['Pakistan', 'Lahore', 'Islamabad'],
  'Asia/Kolkata': ['India', 'Delhi', 'New Delhi', 'Mumbai', 'Goa', 'Bangalore', 'Chennai', 'Jaipur'],
  'Asia/Colombo': ['Sri Lanka'],
  'Indian/Maldives': ['Maldives', 'Malé', 'Male'],
  'Indian/Mauritius': ['Mauritius'],
  'Asia/Kathmandu': ['Nepal'],
  'Asia/Dhaka': ['Bangladesh'],
  'Asia/Bangkok': ['Thailand', 'Phuket', 'Chiang Mai', 'Krabi', 'Koh Samui'],
  'Asia/Ho_Chi_Minh': ['Vietnam', 'Hanoi', 'Saigon', 'Da Nang'],
  'Asia/Jakarta': ['Indonesia', 'Java', 'Yogyakarta'],
  'Asia/Makassar': ['Indonesia', 'Bali', 'Denpasar', 'Lombok'],
  'Asia/Singapore': ['Singapore'],
  'Asia/Kuala_Lumpur': ['Malaysia', 'Penang', 'Langkawi'],
  'Asia/Manila': ['Philippines', 'Cebu', 'Boracay'],
  'Asia/Hong_Kong': ['Hong Kong'],
  'Asia/Shanghai': ['China', 'Beijing', 'Shenzhen', 'Guangzhou'],
  'Asia/Taipei': ['Taiwan'],
  'Asia/Seoul': ['South Korea', 'Korea', 'Busan'],
  'Asia/Tokyo': ['Japan', 'Kyoto', 'Osaka', 'Hiroshima', 'Sapporo'],
  'Australia/Perth': ['Australia'],
  'Australia/Adelaide': ['Australia'],
  'Australia/Brisbane': ['Australia', 'Gold Coast', 'Cairns'],
  'Australia/Sydney': ['Australia', 'Canberra'],
  'Australia/Melbourne': ['Australia'],
  'Pacific/Auckland': ['New Zealand', 'Wellington', 'Queenstown', 'Christchurch'],
  'Pacific/Fiji': ['Fiji'],
  'Pacific/Honolulu': ['Hawaii', 'USA', 'Maui'],
  UTC: [],
} as const satisfies Record<string, readonly string[]>;

export type Timezone = keyof typeof TIMEZONE_PLACES;

export const TIMEZONES = Object.keys(TIMEZONE_PLACES) as readonly Timezone[];

const placesOf = (tz: string): readonly string[] =>
  (TIMEZONE_PLACES as Record<string, readonly string[] | undefined>)[tz] ?? [];

/** In the curated picker list. */
export function isKnownTimezone(tz: string): boolean {
  return (TIMEZONES as readonly string[]).includes(tz);
}

/**
 * Accepted for storage. Broader than the picker list on purpose: the device may report a
 * valid IANA zone we never curated, and rejecting it would be wrong.
 */
export function isResolvableTimezone(tz: string): boolean {
  if (!tz) return false;
  return !Number.isNaN(new TZDate(2026, 6, 1, 12, 0, tz).getTime());
}

/** 'Europe/Sofia' -> 'Sofia'; 'America/Argentina/Buenos_Aires' -> 'Buenos Aires'. */
export function timezoneLabel(tz: string): string {
  return tz.split('/').pop()!.replace(/_/g, ' ');
}

/** 'Italy' for Europe/Rome. Null for UTC and for zones outside the curated list. */
export function timezoneCountry(tz: string): string | null {
  return placesOf(tz)[0] ?? null;
}

/**
 * A formatted time with its zone when it states its own: "Sunday, 20 September · 16:50 · Sofia".
 * Without the zone, an arrival in Sofia on a Vienna trip reads as Vienna time — an hour out.
 */
export function withZone(formatted: string, zoneOverride: string | null): string {
  return zoneOverride ? `${formatted} · ${timezoneLabel(zoneOverride)}` : formatted;
}

/**
 * One end of a journey: always with its zone, whether the item sets it or follows the trip, because
 * the time is local to that end — "13:50 · Helsinki time". A date alone has no clock to qualify.
 */
export function withJourneyZone(formatted: string, moment: { tz: string; precision: string }): string {
  return moment.precision === 'time' ? `${formatted} · ${timezoneLabel(moment.tz)} time` : formatted;
}

const searchable = (text: string) => text.toLowerCase().replace(/_/g, ' ');

/** By zone id, country or city. A query matching only a country lists every zone it spans. */
export function searchTimezones(query: string): readonly string[] {
  const q = searchable(query.trim());
  if (!q) return TIMEZONES;
  return TIMEZONES.filter(
    (tz) => searchable(tz).includes(q) || placesOf(tz).some((place) => searchable(place).includes(q)),
  );
}

/**
 * The place the query found, when it is not the zone's own city: searching "milan" lists Rome
 * time, and the row should say why. Null when the zone matched by its own name.
 */
export function timezoneMatch(tz: string, query: string): string | null {
  const q = searchable(query.trim());
  if (!q || searchable(tz).includes(q)) return null;
  return placesOf(tz).find((place) => searchable(place).includes(q)) ?? null;
}
