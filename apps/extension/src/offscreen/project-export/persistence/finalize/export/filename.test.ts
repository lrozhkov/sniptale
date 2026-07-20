import { expect, it } from 'vitest';

import { buildExportFilename } from './filename';

it('builds a sanitized export filename from the project name and extension', () => {
  expect(
    buildExportFilename({
      extension: 'mp4',
      projectName: 'Demo / Project',
      timestamp: '2026-03-22T10-11-12',
    })
  ).toBe('Demo_Project-2026-03-22T10-11-12.mp4');
});

it('falls back to the project export base name when the project name is an empty string', () => {
  expect(
    buildExportFilename({
      extension: 'webm',
      projectName: '',
      timestamp: '2026-03-22T10-11-12',
    })
  ).toBe('project-export-2026-03-22T10-11-12.webm');
});
