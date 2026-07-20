import { expect, it, vi } from 'vitest';

import { createPopupExportFailureResult } from './failure';

const translateMock = vi.hoisted(() => vi.fn(() => 'fallback export failed'));

vi.mock('../../../../../platform/i18n', () => ({
  translate: translateMock,
}));

it('uses the error message when the failure is an Error', () => {
  expect(createPopupExportFailureResult(new Error('runner failed'))).toEqual({
    errors: ['runner failed'],
    filename: undefined,
    stats: {
      filesCount: 0,
      filesFailed: 0,
      rowsCount: 0,
      sectionsCount: 0,
    },
    success: false,
  });
  expect(translateMock).not.toHaveBeenCalled();
});

it('uses translated copy when the failure is not an Error', () => {
  expect(createPopupExportFailureResult('boom')).toEqual({
    errors: ['fallback export failed'],
    filename: undefined,
    stats: {
      filesCount: 0,
      filesFailed: 0,
      rowsCount: 0,
      sectionsCount: 0,
    },
    success: false,
  });
  expect(translateMock).toHaveBeenCalledWith('content.runtime.exportFailed');
});

it('uses translated copy for nullish failures too', () => {
  expect(createPopupExportFailureResult(null)).toEqual({
    errors: ['fallback export failed'],
    filename: undefined,
    stats: {
      filesCount: 0,
      filesFailed: 0,
      rowsCount: 0,
      sectionsCount: 0,
    },
    success: false,
  });
});
