import { translate } from '../../platform/i18n';
import type { LibraryDateBucketId } from '../../features/media-hub/library-filters';

export function getGalleryDateBucketLabel(value: string): string {
  const labels: Record<LibraryDateBucketId, string> = {
    today: translate('gallery.app.facetDate.today'),
    yesterday: translate('gallery.app.facetDate.yesterday'),
    'days-2-7': translate('gallery.app.facetDate.days-2-7'),
    'days-8-30': translate('gallery.app.facetDate.days-8-30'),
    'this-year': translate('gallery.app.facetDate.this-year'),
    older: translate('gallery.app.facetDate.older'),
  };
  return labels[value as LibraryDateBucketId] ?? value;
}
