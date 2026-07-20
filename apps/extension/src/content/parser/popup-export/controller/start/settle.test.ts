import { expect, it, vi } from 'vitest';

import type { ExportOptions, ExportResult } from '@sniptale/runtime-contracts/export';
import { settlePopupExportStartFlow } from './settle';
import type { PopupExportState } from '../types';

const translateMock = vi.hoisted(() => vi.fn(() => 'fallback export failed'));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),

  translate: translateMock,
}));

function createExportOptions(): ExportOptions {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createExportResult(): ExportResult {
  return {
    errors: [],
    filename: 'popup-export.zip',
    stats: {
      filesCount: 1,
      filesFailed: 0,
      rowsCount: 2,
      sectionsCount: 1,
    },
    success: true,
  };
}

function createState(requestId: string | null): PopupExportState {
  return {
    activeExportRequestId: requestId,
    isExportRunning: requestId !== null,
  };
}

it('settles a successful export result and resets state', async () => {
  const exportResult = createExportResult();
  const exportRunner = {
    export: vi.fn().mockResolvedValue(exportResult),
    onProgress: vi.fn(),
  };
  const persistArchive = vi.fn().mockResolvedValue(['archive write failed']);
  const state = createState('req-1');

  await expect(
    settlePopupExportStartFlow({
      exportRunner,
      options: createExportOptions(),
      persistArchive,
      requestId: 'req-1',
      state,
    })
  ).resolves.toEqual({
    errors: ['archive write failed'],
    filename: 'popup-export.zip',
    stats: exportResult.stats,
    success: false,
  });

  expect(persistArchive).toHaveBeenCalledWith(exportResult);
  expect(state).toEqual({
    activeExportRequestId: null,
    isExportRunning: false,
  });
});

it('returns null for a stale export request and still resets state', async () => {
  const exportRunner = {
    export: vi.fn().mockResolvedValue(createExportResult()),
    onProgress: vi.fn(),
  };
  const persistArchive = vi.fn().mockResolvedValue([]);
  const state = createState('req-2');

  await expect(
    settlePopupExportStartFlow({
      exportRunner,
      options: createExportOptions(),
      persistArchive,
      requestId: 'req-1',
      state,
    })
  ).resolves.toBeNull();

  expect(persistArchive).not.toHaveBeenCalled();
  expect(state).toEqual({
    activeExportRequestId: null,
    isExportRunning: false,
  });
});

it('normalizes a rejected export into a generic failure result', async () => {
  const exportRunner = {
    export: vi.fn(() => Promise.reject('boom')),
    onProgress: vi.fn(),
  };
  const persistArchive = vi.fn();
  const state = createState('req-1');

  await expect(
    settlePopupExportStartFlow({
      exportRunner,
      options: createExportOptions(),
      persistArchive,
      requestId: 'req-1',
      state,
    })
  ).resolves.toEqual({
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

  expect(persistArchive).not.toHaveBeenCalled();
  expect(state).toEqual({
    activeExportRequestId: null,
    isExportRunning: false,
  });
});
