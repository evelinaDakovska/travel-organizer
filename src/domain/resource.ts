/**
 * Tickets, confirmations and links. Files are copied into the sandbox on import and
 * referenced by a path RELATIVE to the documents directory — see docs/technical-reference.md §5.
 */

import { z } from 'zod';

export const RESOURCE_KINDS = ['file', 'link'] as const;
export type ResourceKind = (typeof RESOURCE_KINDS)[number];

export const RESOURCE_SUBTYPES = [
  'generic',
  'ticket',
  'confirmation',
  'wallet',
  'maps',
  'website',
] as const;
export type ResourceSubtype = (typeof RESOURCE_SUBTYPES)[number];

/** A resource hangs off exactly one owner, which the schema enforces with a XOR check. */
export type ResourceOwner = { scope: 'trip' | 'item'; id: string };

type ResourceBase = {
  id: string;
  owner: ResourceOwner;
  subtype: ResourceSubtype;
  label: string;
  sortOrder: number;
  createdAt: string;
};

export type FileResource = ResourceBase & {
  kind: 'file';
  storedPath: string;
  fileName: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
};

export type LinkResource = ResourceBase & { kind: 'link'; url: string };

export type Resource = FileResource | LinkResource;

export const MEDIA_DIR = 'media';

/** Anything else is either an attempt to escape the sandbox or a stale absolute path. */
const STORED_PATH = new RegExp(`^${MEDIA_DIR}/[A-Za-z0-9][A-Za-z0-9._-]*$`);

export function isStoredPath(value: string): boolean {
  return STORED_PATH.test(value);
}

const EXTENSION_BY_MIME: Record<string, string> = {
  'application/pdf': 'pdf',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/heic': 'heic',
  'image/webp': 'webp',
  'text/plain': 'txt',
  'application/vnd.apple.pkpass': 'pkpass',
};

/** The name is what the user picked; the mime type is what Android actually reports. */
export function extensionFor(fileName: string | null, mimeType: string | null): string {
  const fromMime = mimeType ? EXTENSION_BY_MIME[mimeType.toLowerCase().split(';')[0].trim()] : null;
  if (fromMime) return fromMime;

  const match = fileName ? /\.([A-Za-z0-9]{1,8})$/.exec(fileName) : null;
  return match ? match[1].toLowerCase() : 'bin';
}

/**
 * Named by id, not by the original filename, so two tickets called ticket.pdf cannot collide.
 * Throws on an id that would escape the media directory — this runs before any file is written.
 */
export function storedPathFor(
  id: string,
  source: { fileName?: string | null; mimeType?: string | null } = {},
): string {
  const path = `${MEDIA_DIR}/${id}.${extensionFor(source.fileName ?? null, source.mimeType ?? null)}`;
  if (!isStoredPath(path)) throw new Error(`Unsafe resource id: ${JSON.stringify(id)}`);
  return path;
}

const trimSlash = (uri: string) => uri.replace(/\/+$/, '');

export function toAbsoluteUri(documentUri: string, storedPath: string): string {
  return `${trimSlash(documentUri)}/${storedPath}`;
}

/** Null when the file sits outside the documents directory — nothing there is ours to touch. */
export function toStoredPath(documentUri: string, absoluteUri: string): string | null {
  const prefix = `${trimSlash(documentUri)}/`;
  if (!absoluteUri.startsWith(prefix)) return null;

  const relative = absoluteUri.slice(prefix.length).replace(/\/+$/, '');
  return isStoredPath(relative) ? relative : null;
}

/**
 * What the sweep may delete: files present on disk that no row points at. Rows pointing at
 * files that no longer exist are the opposite problem and are reported, not deleted.
 */
export function orphanedStoredPaths(
  onDisk: readonly string[],
  referenced: Iterable<string>,
): string[] {
  const kept = new Set(referenced);
  return onDisk.filter((path) => !kept.has(path));
}

/** The opposite of an orphan: referenced but not present. Sorted, so callers can compare. */
export function missingFiles(onDisk: Iterable<string>, referenced: Iterable<string>): string[] {
  const present = new Set(onDisk);
  return [...new Set(referenced)].filter((path) => !present.has(path)).sort();
}

/** Schemes we will hand to Android. Anything else — file:, javascript:, intent: — is refused. */
const SAFE_SCHEMES = ['http:', 'https:', 'geo:', 'mailto:', 'tel:'];

export function isSafeExternalUrl(value: string): boolean {
  const match = /^([a-z][a-z0-9+.-]*:)/i.exec(value.trim());
  return match !== null && SAFE_SCHEMES.includes(match[1].toLowerCase());
}

const label = z.string().trim().min(1, 'Give it a label').max(120);

export const resourceInputSchema = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('link'),
    subtype: z.enum(RESOURCE_SUBTYPES).default('website'),
    label,
    url: z.string().trim().min(1).refine(isSafeExternalUrl, 'That is not a link we can open'),
  }),
  z.object({
    kind: z.literal('file'),
    subtype: z.enum(RESOURCE_SUBTYPES).default('generic'),
    label,
    storedPath: z.string().refine(isStoredPath, 'Files must live under the media directory'),
    fileName: z.string().nullish(),
    mimeType: z.string().nullish(),
    sizeBytes: z.number().int().nonnegative().nullish(),
  }),
]);

export type ResourceInput = z.infer<typeof resourceInputSchema>;

export type ResourceRow = {
  id: string;
  trip_id: string | null;
  trip_item_id: string | null;
  kind: string;
  subtype: string;
  label: string;
  url: string | null;
  stored_path: string | null;
  file_name: string | null;
  mime_type: string | null;
  size_bytes: number | null;
  sort_order: number;
  created_at: string;
};

export function parseResourceRow(row: ResourceRow): Resource {
  const base = {
    id: row.id,
    owner: ownerOf(row),
    subtype: row.subtype as ResourceSubtype,
    label: row.label,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
  };

  return row.kind === 'link'
    ? { ...base, kind: 'link', url: row.url ?? '' }
    : {
        ...base,
        kind: 'file',
        storedPath: row.stored_path ?? '',
        fileName: row.file_name,
        mimeType: row.mime_type,
        sizeBytes: row.size_bytes,
      };
}

function ownerOf(row: ResourceRow): ResourceOwner {
  return row.trip_item_id !== null
    ? { scope: 'item', id: row.trip_item_id }
    : { scope: 'trip', id: row.trip_id ?? '' };
}
