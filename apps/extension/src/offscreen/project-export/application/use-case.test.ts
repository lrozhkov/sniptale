import { expect, it } from 'vitest';

import { createProjectExportUseCaseService } from './use-case';

it('exposes offscreen project export use-case operations', () => {
  expect(createProjectExportUseCaseService()).toMatchObject({
    cancelProjectExport: expect.any(Function),
    reconcileProjectExportJobs: expect.any(Function),
    startProjectExport: expect.any(Function),
  });
});
