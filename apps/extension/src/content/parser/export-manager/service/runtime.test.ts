import { expect, it, beforeAll, vi } from 'vitest';
import {
  loadContentCatalogFixture,
  prepareContentTranslations,
} from '../../../test-support/translations.test-support';

vi.mock('../../../../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: (locale: Parameters<typeof loadContentCatalogFixture>[0]) =>
    loadContentCatalogFixture(locale),
}));

beforeAll(() => prepareContentTranslations('en'));

import { getExportErrorMessage } from './runtime';

it('formats errors as localized UI copy without exposing raw values', () => {
  const errorMessage = getExportErrorMessage(new Error('boom'), 'content.runtime.exportFailed');
  expect(errorMessage).not.toContain('boom');
  expect(errorMessage).toContain('Sniptale');
  expect(getExportErrorMessage('nope', 'content.runtime.exportFailed')).not.toContain('nope');
});
