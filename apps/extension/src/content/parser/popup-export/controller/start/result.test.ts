import { expect, it } from 'vitest';

import { createPopupExportResult } from './result';

it('merges export and persistence errors while preserving the result payload', () => {
  expect(
    createPopupExportResult(
      {
        errors: ['export warning'],
        filename: 'popup-export.zip',
        stats: {
          filesCount: 1,
          filesFailed: 0,
          rowsCount: 2,
          sectionsCount: 1,
        },
        success: true,
      },
      ['archive write failed']
    )
  ).toEqual({
    errors: ['export warning', 'archive write failed'],
    filename: 'popup-export.zip',
    stats: {
      filesCount: 1,
      filesFailed: 0,
      rowsCount: 2,
      sectionsCount: 1,
    },
    success: false,
  });
});

it('treats export warnings as a failed popup result so the UI can surface the problem', () => {
  expect(
    createPopupExportResult(
      {
        errors: ['screenshot failed'],
        filename: 'popup-export.zip',
        stats: {
          filesCount: 1,
          filesFailed: 0,
          rowsCount: 2,
          sectionsCount: 1,
        },
        success: true,
      },
      []
    )
  ).toEqual({
    errors: ['screenshot failed'],
    filename: 'popup-export.zip',
    stats: {
      filesCount: 1,
      filesFailed: 0,
      rowsCount: 2,
      sectionsCount: 1,
    },
    success: false,
  });
});

it('keeps successful results successful when there are no export or persistence errors', () => {
  expect(
    createPopupExportResult(
      {
        errors: [],
        stats: {
          filesCount: 1,
          filesFailed: 0,
          rowsCount: 2,
          sectionsCount: 1,
        },
        success: true,
      },
      []
    )
  ).toEqual({
    errors: [],
    stats: {
      filesCount: 1,
      filesFailed: 0,
      rowsCount: 2,
      sectionsCount: 1,
    },
    success: true,
  });
});
