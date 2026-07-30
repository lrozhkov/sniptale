import { expectTypeOf, it } from 'vitest';

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
