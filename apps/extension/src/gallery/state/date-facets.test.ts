import { expect, it } from 'vitest';
import { translate } from '../../platform/i18n';
import { getGalleryDateBucketLabel } from './date-facets';

it('labels each saved date bucket and preserves unknown values for display', () => {
  for (const bucket of [
    'today',
    'yesterday',
    'days-2-7',
    'days-8-30',
    'this-year',
    'older',
  ] as const) {
    expect(getGalleryDateBucketLabel(bucket)).toBe(translate(`gallery.app.facetDate.${bucket}`));
  }
  expect(getGalleryDateBucketLabel('custom-date')).toBe('custom-date');
});
