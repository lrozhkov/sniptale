import { expect, it } from 'vitest';

import { persistPopupExportArchive } from './archive';
import { persistPopupExportArchive as persistPopupExportArchiveImpl } from './archive/persist';

it('keeps the archive helper facade thin', () => {
  expect(persistPopupExportArchive).toBe(persistPopupExportArchiveImpl);
});
