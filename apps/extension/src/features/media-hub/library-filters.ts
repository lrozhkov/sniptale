/** Facets shared by library browsing and saved media filters. */
export type LibraryFacetId =
  | 'created'
  | 'updated'
  | 'format'
  | 'size'
  | 'resolution'
  | 'duration'
  | 'source';
export type LibraryFacetFilters = Record<LibraryFacetId, string[]>;
export type LibraryFilterScope = 'all' | 'library' | 'temporary';

/** Structural input: filtering reads metadata only, never the underlying asset. */
export interface LibraryFilterItem {
  filename: string;
  mimeType: string;
  size: number;
  width?: number | null;
  height?: number | null;
  duration?: number | null;
  sourceUrl?: string | null;
  createdAt: number;
  updatedAt: number;
  tags: string[];
  lifecycle?: { storageClass: 'library' | 'temporary' };
}

export const SIZE_BUCKETS = [
  { id: '0:102400', min: 0, max: 100 * 1024 },
  { id: '102400:524288', min: 100 * 1024, max: 512 * 1024 },
  { id: '524288:1048576', min: 512 * 1024, max: 1024 * 1024 },
  { id: '1048576:10485760', min: 1024 * 1024, max: 10 * 1024 * 1024 },
  { id: '10485760:104857600', min: 10 * 1024 * 1024, max: 100 * 1024 * 1024 },
  { id: '104857600:infinity', min: 100 * 1024 * 1024, max: Number.POSITIVE_INFINITY },
] as const;

export const DURATION_BUCKETS = [
  { id: 'under-minute', min: 0, max: 60 },
  { id: '1-5-minutes', min: 60, max: 5 * 60 },
  { id: '5-30-minutes', min: 5 * 60, max: 30 * 60 },
  { id: 'over-30-minutes', min: 30 * 60, max: Number.POSITIVE_INFINITY },
] as const;

export const LIBRARY_DATE_BUCKET_IDS = [
  'today',
  'yesterday',
  'days-2-7',
  'days-8-30',
  'this-year',
  'older',
] as const;

export type LibraryDateBucketId = (typeof LIBRARY_DATE_BUCKET_IDS)[number];

function startOfLocalDay(timestamp: number, daysAgo = 0): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

function getGalleryDateBucket(timestamp: number, now: number): LibraryDateBucketId {
  const today = startOfLocalDay(now);
  if (timestamp >= today) return 'today';

  const yesterday = startOfLocalDay(now, 1);
  if (timestamp >= yesterday) return 'yesterday';
  if (timestamp >= startOfLocalDay(now, 7)) return 'days-2-7';
  if (timestamp >= startOfLocalDay(now, 30)) return 'days-8-30';

  const startOfYear = new Date(now);
  startOfYear.setMonth(0, 1);
  startOfYear.setHours(0, 0, 0, 0);
  return timestamp >= startOfYear.getTime() ? 'this-year' : 'older';
}

function getGalleryDateFacetValue(
  item: LibraryFilterItem,
  id: 'created' | 'updated',
  now: number
): LibraryDateBucketId {
  return getGalleryDateBucket(id === 'created' ? item.createdAt : item.updatedAt, now);
}

function getGalleryFormat(item: LibraryFilterItem): string {
  const extension = item.filename.split('.').pop()?.trim().toLowerCase();
  if (extension && extension !== item.filename.toLowerCase()) return extension;
  return item.mimeType.split('/').pop()?.toLowerCase() ?? item.mimeType.toLowerCase();
}

function getGallerySizeBucket(size: number): string {
  return (
    SIZE_BUCKETS.find((bucket) => size >= bucket.min && size < bucket.max)?.id ?? SIZE_BUCKETS[0].id
  );
}

function getGalleryResolutionBucket(item: LibraryFilterItem): string | null {
  if (!item.width || !item.height) return null;
  const longSide = Math.max(item.width, item.height);
  if (longSide < 1280) return 'compact';
  if (longSide < 1920) return 'hd';
  if (longSide < 2560) return 'full-hd';
  if (longSide < 3840) return 'qhd';
  return 'uhd';
}

function getGalleryDurationBucket(item: LibraryFilterItem): string | null {
  if (item.duration == null) return null;
  return (
    DURATION_BUCKETS.find((bucket) => item.duration! >= bucket.min && item.duration! < bucket.max)
      ?.id ?? null
  );
}

function getGallerySource(item: LibraryFilterItem): string | null {
  if (item.sourceUrl) {
    try {
      return new URL(item.sourceUrl).hostname.replace(/^www\./, '').toLowerCase();
    } catch {
      return null;
    }
  }
  return null;
}

export function getLibraryFacetValue(
  item: LibraryFilterItem,
  id: LibraryFacetId,
  now: number
): string | null {
  if (id === 'created' || id === 'updated') return getGalleryDateFacetValue(item, id, now);
  if (id === 'format') return getGalleryFormat(item);
  if (id === 'size') return getGallerySizeBucket(item.size);
  if (id === 'resolution') return getGalleryResolutionBucket(item);
  if (id === 'duration') return getGalleryDurationBucket(item);
  return getGallerySource(item);
}

/** OR within each facet or tag list, AND across facets and storage scope. */
export function matchesLibraryFilters(
  item: LibraryFilterItem,
  filters: {
    activeTags?: string[];
    facetFilters?: LibraryFacetFilters;
    scope?: LibraryFilterScope;
  },
  now: number
): boolean {
  if (
    filters.scope &&
    filters.scope !== 'all' &&
    (item.lifecycle?.storageClass ?? 'library') !== filters.scope
  )
    return false;
  if (filters.activeTags?.length && !filters.activeTags.some((tag) => item.tags.includes(tag)))
    return false;
  return (
    !filters.facetFilters ||
    (Object.entries(filters.facetFilters) as Array<[LibraryFacetId, string[]]>).every(
      ([id, values]) =>
        values.length === 0 || values.includes(getLibraryFacetValue(item, id, now) ?? '')
    )
  );
}
