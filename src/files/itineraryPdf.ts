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

/** Where expo-print writes, inside the cache. */
const PRINT_DIR = 'Print';

/** A print that failed part-way leaves an empty file behind (QA D-05); nothing else is touched. */
function deleteEmptyPrints(): void {
  try {
    const directory = new Directory(Paths.cache, PRINT_DIR);
    if (!directory.exists) return;
    for (const entry of directory.list()) {
      if (entry instanceof File && entry.size === 0) entry.delete();
    }
  } catch (error) {
    console.warn('Could not tidy the print folder', error);
  }
}

async function printOnce(html: string): Promise<File> {
  const printed = new File((await Print.printToFileAsync({ html, ...A4 })).uri);
  if (!printed.exists || printed.size === 0) throw new Error('The printer wrote an empty file');
  return printed;
}

/**
 * The system printer fails now and then for no lasting reason (ERR_PDF_WRITE once in six on the
 * phone, fine at the retry — QA D-05), so one failure is retried before the person is told.
 */
async function print(html: string): Promise<File> {
  try {
    return await printOnce(html);
  } catch (error) {
    console.warn('Printing the itinerary failed; trying again', error);
    deleteEmptyPrints();
    try {
      return await printOnce(html);
    } catch (again) {
      deleteEmptyPrints();
      throw again;
    }
  }
}

export async function shareItineraryPdf(html: string, tripName: string, now: Date): Promise<void> {
  const printed = await print(html);

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
