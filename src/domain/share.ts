/**
 * What arrives from the Android share sheet, made safe and made useful. The payload comes from
 * another app, so it is untrusted: it is validated here before anything reads it.
 *
 * Three shapes come out: files (a PDF from Gmail, a screenshot), a link (Chrome, Google Maps), or
 * plain text with no link in it (a door code someone messaged).
 */

import { z } from 'zod';

import { defaultFileLabel, defaultLinkLabel, isSafeExternalUrl } from './resource';
import { deviceToday, type Trip } from './trip';

/** Loose on purpose: a field the library adds later must not make a share fail. */
const incomingFileSchema = z.object({
  path: z.string().min(1),
  fileName: z.string().nullish(),
  mimeType: z.string().nullish(),
  size: z.number().nonnegative().nullish(),
});

const incomingSchema = z.object({
  files: z.array(incomingFileSchema).nullish(),
  text: z.string().nullish(),
  webUrl: z.string().nullish(),
  meta: z.object({ title: z.string().nullish() }).passthrough().nullish(),
});

export type SharedFile = {
  uri: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type SharedContent =
  | { kind: 'files'; files: SharedFile[] }
  | { kind: 'link'; url: string; title: string | null }
  | { kind: 'text'; text: string };

/** Enough for a whole trip's tickets in one go, not enough to stall the phone. */
export const MAX_SHARED_FILES = 10;
const MAX_TEXT = 4000;

const URL_IN_TEXT = /https?:\/\/[^\s<>"']+/i;

/** The first web link in a piece of text, without the punctuation a sentence puts after it. */
export function extractUrl(text: string): string | null {
  const match = URL_IN_TEXT.exec(text);
  if (!match) return null;
  const url = match[0].replace(/[.,;:!?)\]]+$/, '');
  return isSafeExternalUrl(url) ? url : null;
}

/**
 * What a share says about itself besides the link. Google Maps sends "Duomo di Milano\n<link>",
 * Chrome often just the link. Null when nothing is left once the link is taken out.
 */
export function titleAround(text: string, url: string): string | null {
  const firstLine = text
    .replace(url, ' ')
    .split('\n')
    .map((line) => line.trim())
    .find((line) => line.length > 0);
  return firstLine ? firstLine.slice(0, 120) : null;
}

/** Null when nothing usable arrived — the screen then says so instead of guessing. */
export function parseSharedContent(payload: unknown): SharedContent | null {
  const parsed = incomingSchema.safeParse(payload);
  if (!parsed.success) return null;
  const { files, text, webUrl, meta } = parsed.data;

  if (files && files.length > 0) {
    return {
      kind: 'files',
      files: files.slice(0, MAX_SHARED_FILES).map((file) => ({
        uri: file.path,
        fileName: file.fileName ?? null,
        mimeType: file.mimeType ?? null,
        sizeBytes: file.size ?? null,
      })),
    };
  }

  const body = (text ?? '').trim().slice(0, MAX_TEXT);
  const url = webUrl && isSafeExternalUrl(webUrl.trim()) ? webUrl.trim() : extractUrl(body);
  if (url) {
    const title = meta?.title?.trim() || (body ? titleAround(body, url) : null);
    return { kind: 'link', url, title: title ? title.slice(0, 120) : null };
  }

  return body ? { kind: 'text', text: body } : null;
}

/**
 * Which trip a share most likely belongs to: the one under way, else the next to start, else the
 * one that ended last. The person can always pick another.
 */
export function suggestTrip<T extends Trip>(trips: readonly T[], now: Date = new Date()): T | null {
  const today = deviceToday(now);
  const current = trips.find((t) => t.startDate <= today && today <= t.endDate);
  if (current) return current;

  const upcoming = trips
    .filter((t) => t.startDate > today)
    .sort((a, b) => a.startDate.localeCompare(b.startDate));
  if (upcoming.length > 0) return upcoming[0];

  const past = [...trips].sort((a, b) => b.endDate.localeCompare(a.endDate));
  return past[0] ?? null;
}

/**
 * Where a share can go, the likeliest first. A link is usually somewhere to go (a Place); a file
 * is usually proof of something already booked, so it goes with an item or the trip's documents.
 */
export type ShareDestination = 'new-item' | 'item' | 'trip-documents' | 'note';

export function destinationsFor(content: SharedContent): ShareDestination[] {
  switch (content.kind) {
    case 'link':
      return ['new-item', 'item', 'trip-documents'];
    case 'files':
      return ['item', 'trip-documents', 'new-item'];
    case 'text':
      return ['note'];
  }
}

export function destinationLabel(destination: ShareDestination, content: SharedContent): string {
  switch (destination) {
    case 'new-item':
      return content.kind === 'link' ? 'New place' : 'New item';
    case 'item':
      return 'An item';
    case 'trip-documents':
      return 'Trip documents';
    case 'note':
      return 'New note';
  }
}

/** What a new item made from a share starts as. Everything stays editable before saving. */
export function newItemFor(content: SharedContent): {
  title: string;
  status: 'idea' | 'confirmed';
} {
  switch (content.kind) {
    case 'link':
      return { title: content.title ?? defaultLinkLabel(content.url), status: 'idea' };
    case 'files':
      return {
        title: defaultFileLabel(content.files[0]?.fileName, 'Shared file'),
        status: 'confirmed',
      };
    case 'text':
      return { title: noteTitleFor(content.text), status: 'idea' };
  }
}

/** A note's title for shared text: its first line, shortened. */
export function noteTitleFor(text: string): string {
  const first =
    text
      .split('\n')
      .find((line) => line.trim().length > 0)
      ?.trim() ?? 'Shared text';
  return first.length > 60 ? `${first.slice(0, 57)}…` : first;
}

/** What a share of files came to: how many were kept, and which could not be copied in. */
export type ShareOutcome = {
  saved: number;
  /** Each failed file's name, or null when the other app gave none. */
  failed: readonly (string | null)[];
  /** Where a second share should go to add the missing ones, by the words on this screen. */
  retryInto: { destination: 'item'; itemTitle: string } | { destination: 'trip-documents' };
};

/**
 * The alert after a share where some files could not be copied in (R5, D27): the files that worked
 * are kept, and this says exactly which did not and how to add them without a second item. Null
 * when every file was saved — nothing to say.
 */
export function shareOutcomeMessage(outcome: ShareOutcome): { title: string; body: string } | null {
  const { saved, failed, retryInto } = outcome;
  if (failed.length === 0) return null;

  const total = saved + failed.length;
  const named = failed.filter((name): name is string => name !== null);
  const unnamed = failed.length - named.length;
  if (unnamed > 0) {
    named.push(unnamed === 1 ? 'one file with no name' : `${unnamed} files with no name`);
  }
  const list = named.join(', ');
  const them = failed.length === 1 ? 'it' : 'them';

  if (saved === 0) {
    return {
      title: total === 1 ? 'The file was not saved' : 'No file was saved',
      body: `Could not copy in: ${list}. Nothing was saved. Share it again from the other app.`,
    };
  }

  const where =
    retryInto.destination === 'item'
      ? `choose Save as “An item” and pick “${retryInto.itemTitle}”`
      : 'choose Save as “Trip documents”';
  return {
    title: `Saved ${saved} of ${total} files`,
    body: `Not saved: ${list}. To add ${them}, share ${them} again from the other app and ${where}.`,
  };
}
