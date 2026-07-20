import { expect, it } from 'vitest';

import { finalizeExport as finalizeExportFacade } from './index';
import { finalizeExport as finalizeExportImpl } from './export/index';

it('keeps the root finalize facade aligned with the owner implementation', () => {
  expect(finalizeExportFacade).toBe(finalizeExportImpl);
});
