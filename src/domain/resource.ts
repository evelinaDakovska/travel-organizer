/**
 * Tickets, confirmations and links. Files are copied into the sandbox on import and
 * referenced by a path RELATIVE to the documents directory — see docs/technical-reference.md §5.
 */

import { z } from 'zod';

import { formatFileSize } from './format';

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
/** `expense`: a receipt (N5). Its row also carries the trip id, which the table requires. */
export type ResourceOwner = { scope: 'trip' | 'item' | 'expense'; id: string };

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
 * What the viewer app shows in its title bar: the attachment's label, not the stored id. Stripped
 * of characters Android will not put in a file name. The extension is kept from the stored file.
 */
export function viewerFileName(label: string, storedPath: string): string {
  const ext = /\.([A-Za-z0-9]{1,8})$/.exec(storedPath)?.[1] ?? 'bin';
  const base = label
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/^\.+/, '')
    .slice(0, 80)
    .trim();
  return `${base || 'Document'}.${ext}`;
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
  expense_id: string | null;
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
  if (row.expense_id !== null) return { scope: 'expense', id: row.expense_id };
  return row.trip_item_id !== null
    ? { scope: 'item', id: row.trip_item_id }
    : { scope: 'trip', id: row.trip_id ?? '' };
}

/** Route params arrive as strings from anywhere, so the owner is rebuilt, never trusted. */
export function parseOwnerParams(scope: unknown, id: unknown): ResourceOwner | null {
  if (scope !== 'trip' && scope !== 'item' && scope !== 'expense') return null;
  if (typeof id !== 'string' || id.trim() === '') return null;
  return { scope, id };
}

/** What a picked file is called until someone renames it. */
export function defaultFileLabel(fileName: string | null | undefined, fallback: string): string {
  const base = (fileName ?? '')
    .replace(/\.[A-Za-z0-9]{1,8}$/, '')
    .replace(/_+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  // The photo picker reports media-store ids ('37.png') and the camera a generated UUID, neither
  // of which means anything to a person.
  return (/^\d*$/.test(base) || UUID.test(base) ? fallback : base).slice(0, 120);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const HAS_SCHEME = /^[a-z][a-z0-9+.-]*:/i;

/** People paste 'booking.com/abc'; Android needs a scheme before it will open anything. */
export function normaliseUrl(value: string): string {
  const trimmed = value.trim();
  if (HAS_SCHEME.test(trimmed) || /\s/.test(trimmed)) return trimmed;
  return /^[^/.]+(\.[^/.]+)+/.test(trimmed) ? `https://${trimmed}` : trimmed;
}

/** 'booking.com' for 'https://www.booking.com/x'; null for anything that is not http(s). */
export function linkHost(url: string): string | null {
  const match = /^https?:\/\/(?:[^@/?#]*@)?([^/:?#]+)/i.exec(url.trim());
  return match ? match[1].toLowerCase().replace(/^www\./, '') : null;
}

export function defaultLinkLabel(url: string): string {
  const normalised = normaliseUrl(url);
  const scheme = normalised.slice(0, normalised.indexOf(':') + 1).toLowerCase();

  if (scheme === 'geo:') return 'Location';
  if (scheme === 'mailto:') return normalised.slice(7).split('?')[0].slice(0, 120) || 'Email';
  if (scheme === 'tel:') return normalised.slice(4) || 'Phone';
  return linkHost(normalised) ?? 'Link';
}

/** Maps and Wallet links get their own badge; everything else is a website. */
export function guessLinkSubtype(url: string): ResourceSubtype {
  const normalised = normaliseUrl(url);
  if (/^geo:/i.test(normalised)) return 'maps';

  const host = linkHost(normalised);
  if (host === null) return 'website';
  if (host === 'pay.google.com' || host === 'wallet.google.com') return 'wallet';
  if (host === 'maps.app.goo.gl' || host.startsWith('maps.google.')) return 'maps';
  if (/^google\.[a-z.]+$/.test(host) && /^https?:\/\/[^/]+\/maps([/?#]|$)/i.test(normalised)) {
    return 'maps';
  }
  return 'website';
}

export const linkFormSchema = z.object({
  url: z
    .string()
    .trim()
    .min(1, 'Paste a link')
    .transform(normaliseUrl)
    .refine(isSafeExternalUrl, 'That is not a link we can open'),
  label: z.string().trim().max(120).optional(),
});

export type LinkFormInput = z.input<typeof linkFormSchema>;
export type LinkFormOutput = z.output<typeof linkFormSchema>;

export function linkResourceInput(values: LinkFormOutput): ResourceInput {
  return {
    kind: 'link',
    url: values.url,
    label: values.label || defaultLinkLabel(values.url),
    subtype: guessLinkSubtype(values.url),
  };
}

export const resourceEditSchema = z.object({ label, subtype: z.enum(RESOURCE_SUBTYPES) });
export type ResourceEdit = z.infer<typeof resourceEditSchema>;

const SUBTYPE_LABELS: Record<ResourceSubtype, string> = {
  generic: 'Document',
  ticket: 'Ticket',
  confirmation: 'Confirmation',
  wallet: 'Wallet pass',
  maps: 'Map',
  website: 'Website',
};

export function subtypeLabel(subtype: ResourceSubtype): string {
  return SUBTYPE_LABELS[subtype] ?? 'Document';
}

/** A file is never a map or a website, so the edit screen does not offer it. */
export function subtypesFor(kind: ResourceKind): readonly ResourceSubtype[] {
  return kind === 'file'
    ? ['generic', 'ticket', 'confirmation']
    : ['website', 'maps', 'wallet', 'ticket', 'confirmation'];
}

export type ResourceBadge = 'PDF' | 'IMG' | 'FILE' | 'LINK' | 'MAP' | 'PASS';

export function resourceBadge(resource: Resource): ResourceBadge {
  if (resource.kind === 'link') {
    if (resource.subtype === 'maps') return 'MAP';
    if (resource.subtype === 'wallet') return 'PASS';
    return 'LINK';
  }

  const mime = (resource.mimeType ?? '').toLowerCase();
  if (mime === 'application/pdf' || resource.storedPath.endsWith('.pdf')) return 'PDF';
  if (mime.startsWith('image/') || /\.(jpe?g|png|webp|heic)$/.test(resource.storedPath)) return 'IMG';
  return 'FILE';
}

const FILE_NOUNS: Partial<Record<ResourceBadge, string>> = { PDF: 'PDF', IMG: 'Image', FILE: 'File' };

/** 'PDF · 664 B' · 'Ticket · 2.4 MB' · 'Website · booking.com' */
export function resourceMeta(resource: Resource): string {
  if (resource.kind === 'link') {
    return [subtypeLabel(resource.subtype), linkHost(resource.url)].filter(Boolean).join(' · ');
  }

  const noun =
    resource.subtype === 'generic'
      ? (FILE_NOUNS[resourceBadge(resource)] ?? 'File')
      : subtypeLabel(resource.subtype);
  return resource.sizeBytes === null ? noun : `${noun} · ${formatFileSize(resource.sizeBytes)}`;
}

const OPEN_LABEL_MAX = 28;

/** 'Open Boarding pass' for one attachment, 'Open attachments (3)' for several. */
export function openLabel(resources: readonly Resource[]): string {
  if (resources.length !== 1) return `Open attachments (${resources.length})`;

  const { label: name } = resources[0];
  return name.length > OPEN_LABEL_MAX
    ? `Open ${name.slice(0, OPEN_LABEL_MAX - 1).trimEnd()}…`
    : `Open ${name}`;
}

/** Item attachments keyed by the item they hang off. Trip documents are left out. */
export function groupResourcesByItem(resources: readonly Resource[]): Map<string, Resource[]> {
  const byItem = new Map<string, Resource[]>();
  for (const resource of resources) {
    if (resource.owner.scope !== 'item') continue;
    const list = byItem.get(resource.owner.id);
    if (list) list.push(resource);
    else byItem.set(resource.owner.id, [resource]);
  }
  return byItem;
}
