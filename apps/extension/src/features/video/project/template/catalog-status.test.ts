import { expect, it } from 'vitest';
import {
  getVideoTemplateCatalogStatusLabelKey,
  VideoTemplateCatalogStatus,
} from './catalog-status';

it('maps every template catalog status to its public translation key', () => {
  expect(getVideoTemplateCatalogStatusLabelKey(VideoTemplateCatalogStatus.CORE)).toBe(
    'videoEditor.templates.catalogStatusCore'
  );
  expect(getVideoTemplateCatalogStatusLabelKey(VideoTemplateCatalogStatus.OPTIONAL)).toBe(
    'videoEditor.templates.catalogStatusOptional'
  );
  expect(getVideoTemplateCatalogStatusLabelKey(VideoTemplateCatalogStatus.LEGACY)).toBe(
    'videoEditor.templates.catalogStatusLegacy'
  );
});
