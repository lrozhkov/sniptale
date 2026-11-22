// @vitest-environment jsdom

import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi, beforeAll } from 'vitest';
import {
  loadUiCatalogFixture,
  prepareUiTranslations,
} from './test-support/translations.test-support';
import { EffectCatalogControls, EffectImportSummary } from './effect-catalog-controls';
it('escapes untrusted filenames and exposes partial import failures as a status', () => {
  const html = renderToStaticMarkup(
    <EffectImportSummary
      results={[
        { filename: 'good.json', status: 'imported' },
        { filename: '<img src=x>.json', status: 'failed' },
      ]}
    />
  );
  expect(html).toContain('role="status"');
  expect(html).toContain('1 из 2');
  expect(html).toContain('&lt;img');
  expect(html).not.toContain('<img');
  expect(renderToStaticMarkup(<EffectImportSummary results={[]} />)).toBe('');
});
it('keeps filter controls disabled during a catalog operation', () => {
  const html = renderToStaticMarkup(
    <EffectCatalogControls
      disabled
      filter={{ query: '', kind: 'all', theme: 'all' }}
      onChange={vi.fn()}
    />
  );
  expect(html).toContain('disabled=""');
  expect(html).toContain('Найти эффект');
});
it('exposes an explicit selected All category instead of leaving every category unselected', () => {
  const html = renderToStaticMarkup(
    <EffectCatalogControls filter={{ query: '', kind: 'all', theme: 'all' }} onChange={vi.fn()} />
  );
  expect(html).toContain('data-category="all"');
  expect(html.match(/aria-pressed="true"/g)).toHaveLength(1);
});

vi.mock('../platform/i18n/catalog-transport', () => ({
  loadCatalogMessages: (locale: Parameters<typeof loadUiCatalogFixture>[0]) =>
    loadUiCatalogFixture(locale),
}));

beforeAll(() => prepareUiTranslations('video-editor', 'ru'));
