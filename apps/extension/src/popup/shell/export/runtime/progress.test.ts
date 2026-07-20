import { expect, it, vi } from 'vitest';

import type { PopupExportResult } from '@sniptale/runtime-contracts/export';
import { updatePopupExportProgressFromResult } from './progress';

function createPopupExportResult(overrides: Partial<PopupExportResult> = {}): PopupExportResult {
  return {
    errors: [],
    stats: {
      filesCount: 0,
      filesFailed: 0,
      rowsCount: 0,
      sectionsCount: 0,
    },
    success: true,
    ...overrides,
  };
}

it('keeps warning results with a saved archive in the completed progress phase', () => {
  const setProgress = vi.fn();

  updatePopupExportProgressFromResult(
    setProgress,
    createPopupExportResult({
      errors: ['failed'],
      filename: 'export.zip',
      success: false,
    })
  );

  const nextProgress = setProgress.mock.calls[0]?.[0]({
    errors: [],
    phase: 'scanning',
  });
  expect(nextProgress).toEqual({
    errors: ['failed'],
    phase: 'done',
  });
});

it('applies terminal error phase when the export produced no archive', () => {
  const setProgress = vi.fn();

  updatePopupExportProgressFromResult(
    setProgress,
    createPopupExportResult({
      errors: ['failed'],
      success: false,
    })
  );

  const nextProgress = setProgress.mock.calls[0]?.[0]({
    errors: [],
    phase: 'scanning',
  });
  expect(nextProgress).toEqual({
    errors: ['failed'],
    phase: 'error',
  });
});

it('clears previous errors when a successful result has an empty error list', () => {
  const setProgress = vi.fn();

  updatePopupExportProgressFromResult(setProgress, createPopupExportResult());

  const nextProgress = setProgress.mock.calls[0]?.[0]({
    errors: ['kept'],
    phase: 'scanning',
  });

  expect(nextProgress).toEqual({
    errors: [],
    phase: 'done',
  });
});
