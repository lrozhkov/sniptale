import { expect, expectTypeOf, it } from 'vitest';

import { isBrowserAnnotationsExportText, MAX_BROWSER_ANNOTATIONS_EXPORT_TEXT_BYTES } from '.';

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
    'idle' | 'scanning' | 'downloading' | 'zipping' | 'done' | 'error'
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
