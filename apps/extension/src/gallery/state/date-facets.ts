import { translate } from '../../platform/i18n';
import type { GalleryItem } from '../library/items';
import type { GalleryDateFacetFilterId } from '../library/types';

export const GALLERY_DATE_BUCKET_IDS = [
  'today',
  'yesterday',
  'days-2-7',
  'days-8-30',
  'this-year',
  'older',
] as const;

type GalleryDateBucketId = (typeof GALLERY_DATE_BUCKET_IDS)[number];

function startOfLocalDay(timestamp: number, daysAgo = 0): number {
  const date = new Date(timestamp);
  date.setHours(0, 0, 0, 0);
  date.setDate(date.getDate() - daysAgo);
  return date.getTime();
}

function getGalleryDateBucket(timestamp: number, now: number): GalleryDateBucketId {
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

export function getGalleryDateFacetValue(
  item: GalleryItem,
  id: GalleryDateFacetFilterId,
  now: number
): GalleryDateBucketId {
  return getGalleryDateBucket(id === 'created' ? item.createdAt : item.updatedAt, now);
}

export function getGalleryDateBucketLabel(value: string): string {
  const labels: Record<GalleryDateBucketId, string> = {
    today: translate('gallery.app.facetDate.today'),
    yesterday: translate('gallery.app.facetDate.yesterday'),
    'days-2-7': translate('gallery.app.facetDate.days-2-7'),
    'days-8-30': translate('gallery.app.facetDate.days-8-30'),
    'this-year': translate('gallery.app.facetDate.this-year'),
    older: translate('gallery.app.facetDate.older'),
  };
  return labels[value as GalleryDateBucketId] ?? value;
}
