import { expect, it } from 'vitest';

import { startPopupExport as startPopupExportFacade } from './';
import { startPopupExport as startPopupExportImpl } from './execute';

it('keeps the start export facade aligned with the owner implementation', () => {
  expect(startPopupExportFacade).toBe(startPopupExportImpl);
});
