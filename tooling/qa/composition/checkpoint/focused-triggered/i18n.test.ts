import { expect, it, vi } from 'vitest';

import { collectFocusedI18nFiles, shouldRunFocusedTypecheck } from './helpers.mjs';
import { isFullI18nScanTrigger } from '../../../guards/product-contracts/verify-i18n.helpers.mjs';

const catalog = 'apps/extension/src/platform/i18n/catalogs/ru.json';
const consumer = 'apps/extension/src/popup/example.tsx';

it.each([
  { files: [catalog] },
  { files: [catalog, consumer] },
  { files: ['packages/platform/src/i18n/config.ts'] },
  { files: ['tooling/qa/guards/product-contracts/verify-i18n.catalogs.mjs'] },
  { files: ['tooling/qa/guards/product-contracts/i18n-catalog-format.mjs'] },
  { files: ['apps/extension/src/platform/i18n/catalog-subsets.ts'] },
])('retains mandatory catalog checking for owner and mixed changes: %j', ({ files }) => {
  const collect = vi.fn(() => [consumer]);
  const selected = collectFocusedI18nFiles(files, { collectAllI18nFiles: collect });
  expect(collect).toHaveBeenCalledTimes(1);
  expect(selected).toContain(consumer);
  expect(selected.some(isFullI18nScanTrigger)).toBe(true);
});

it('preserves source deletion triggers without asserting complete usage evidence', () => {
  const collect = vi.fn(() => []);
  expect(collectFocusedI18nFiles([consumer], { collectAllI18nFiles: collect })).toEqual([consumer]);
  expect(collect).not.toHaveBeenCalled();
});

it('retains a catalog trigger even if every live source is absent', () => {
  expect(collectFocusedI18nFiles([catalog], { collectAllI18nFiles: () => [] })).toEqual([catalog]);
});

it('checks the canonical JSON key contract even without TypeScript changes', () => {
  expect(shouldRunFocusedTypecheck(['apps/extension/src/platform/i18n/catalogs/en.json'])).toBe(
    true
  );
  expect(shouldRunFocusedTypecheck(['apps/extension/src/platform/i18n/catalogs/ru.json'])).toBe(
    false
  );
});
