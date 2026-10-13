/**
 * The itinerary PDF on the phone (C4): HTML from `domain/itineraryHtml` printed to a PDF by the
 * system's own renderer (`expo-print`, offline), given a name a person can recognise, and handed to
 * the share sheet. This file only moves bytes; what is in the document is decided in the domain.
 */

import { Directory, File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

import { itineraryFileName } from '../domain/itineraryHtml';

/** A4 in points, the unit the printer takes. */
const A4 = { width: 595, height: 842 };

export async function shareItineraryPdf(html: string, tripName: string, now: Date): Promise<void> {
  const printed = new File((await Print.printToFileAsync({ html, ...A4 })).uri);

  // The cache, which the system may clear: it is shared at once, and a fresh one can always be made.
  const directory = new Directory(Paths.cache, 'itinerary');
  if (!directory.exists) directory.create({ intermediates: true });
  const named = new File(directory, itineraryFileName(tripName, now));
  if (named.exists) named.delete();
  await printed.copy(named);
  printed.delete();

  await Sharing.shareAsync(named.uri, {
    mimeType: 'application/pdf',
    dialogTitle: 'Share the itinerary',
  });
}
