import { expect, expectTypeOf, it } from 'vitest';

import {
  isBrowserAnnotationsExportText,
  MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES,
  MAX_POPUP_EXPORT_TAB_TITLE_BYTES,
  normalizePopupExportTabTitle,
  truncatePopupExportStatusText,
} from '.';

import type {
  ExportOptions,
  ExportPagePackageEntry,
  ExportProgress,
  ExportProgressStepKey,
  PopupExportResult,
} from '.';

it('keeps export package and progress contracts explicit', () => {
  expectTypeOf<ExportPagePackageEntry>().toMatchTypeOf<{
    path: string;
    textContent?: string;
    binaryBase64?: string;
    mimeType?: string;
  }>();
  expectTypeOf<ExportProgress['phase']>().toEqualTypeOf<
    'idle' | 'scanning' | 'downloading' | 'zipping' | 'done' | 'cancelled' | 'error'
  >();
  expectTypeOf<PopupExportResult['kind']>().toEqualTypeOf<'archive' | 'webSnapshot' | undefined>();
  expectTypeOf<ExportOptions['includeAnnotations']>().toEqualTypeOf<boolean | undefined>();
  expectTypeOf<'annotations'>().toMatchTypeOf<ExportProgressStepKey>();
});

it('accepts empty annotation artifacts while enforcing their UTF-8 byte budget', () => {
  expect(isBrowserAnnotationsExportText('')).toBe(true);
  expect(
    isBrowserAnnotationsExportText('x'.repeat(MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES))
  ).toBe(true);
  expect(
    isBrowserAnnotationsExportText('x'.repeat(MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES + 1))
  ).toBe(false);
  expect(isBrowserAnnotationsExportText(7)).toBe(false);
});

it('normalizes popup export titles and bounds composed lifecycle text on UTF-8 boundaries', () => {
  expect(normalizePopupExportTabTitle('e\u0301')).toBe('\u00e9');
  const title = normalizePopupExportTabTitle('\ud83d\ude00'.repeat(2_000));
  expect(new TextEncoder().encode(title).byteLength).toBeLessThanOrEqual(
    MAX_POPUP_EXPORT_TAB_TITLE_BYTES
  );
  expect(title.endsWith('\ud83d\ude00')).toBe(true);
  expect(
    new TextEncoder().encode(truncatePopupExportStatusText(`${'x'.repeat(20_000)}\ud83d\ude00`))
      .byteLength
  ).toBe(16 * 1024);
});
