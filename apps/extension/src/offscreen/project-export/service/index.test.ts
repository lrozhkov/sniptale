import { describe, expect, it } from 'vitest';

import { createProjectExportService } from './index';

describe('project-export service index', () => {
  it('exposes the project-export service operations', () => {
    expect(createProjectExportService()).toMatchObject({
      cancelProjectExport: expect.any(Function),
      reconcileProjectExportJobs: expect.any(Function),
      startProjectExport: expect.any(Function),
    });
  });
});
