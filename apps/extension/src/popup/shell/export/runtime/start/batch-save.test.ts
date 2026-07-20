import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createArchiveFailureArgs,
  createDeps,
  createPagePackage,
  createState,
  type PopupExportRuntimeDeps,
} from './batch-save.test-support';

const archiveMocks = vi.hoisted(() => ({
  createBatchArchiveBlob: vi.fn(),
  createBatchArchiveFilename: vi.fn(),
}));

const stateMocks = vi.hoisted(() => ({
  applyBatchExportResult: vi.fn(),
  isCurrentBatchRequest: vi.fn(),
  setBatchExportProgress: vi.fn(),
  setBatchSaveFailureProgress: vi.fn(),
}));

const loggingMocks = vi.hoisted(() => ({
  logPopupExportBatchArchiveSaveFailure: vi.fn(),
  logPopupExportBatchArchiveSaveStart: vi.fn(),
  logPopupExportBatchArchiveSaveSuccess: vi.fn(),
  logPopupExportBatchStale: vi.fn(),
}));

vi.mock('../../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../../platform/i18n')>()),
  translate: (key: string) => key,
}));

vi.mock('./batch-archive', () => archiveMocks);
vi.mock('./batch-state', () => stateMocks);
vi.mock('../logging', () => loggingMocks);

import { finishBatchExport } from './batch-save';

beforeEach(() => {
  vi.clearAllMocks();
  archiveMocks.createBatchArchiveBlob.mockResolvedValue(new Blob(['archive']));
  archiveMocks.createBatchArchiveFilename.mockReturnValue('pages_export_test.zip');
});

it('returns early and logs a stale finish before archive save starts', async () => {
  stateMocks.isCurrentBatchRequest.mockReturnValue(false);
  const state = createState();

  await finishBatchExport({
    deps: createDeps(),
    errors: [],
    layout: 'grouped',
    pagePackages: [createPagePackage()],
    requestId: 'req-1',
    state,
  });

  expect(loggingMocks.logPopupExportBatchStale).toHaveBeenCalledWith({
    phase: 'finish',
    requestId: 'req-1',
  });
  expect(archiveMocks.createBatchArchiveBlob).not.toHaveBeenCalled();
  expect(stateMocks.setBatchExportProgress).not.toHaveBeenCalled();
});

it('logs a stale finish after save when a newer request wins', async () => {
  stateMocks.isCurrentBatchRequest
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false);
  await finishBatchExport({
    deps: createDeps(),
    errors: [],
    layout: 'grouped',
    pagePackages: [createPagePackage()],
    requestId: 'req-1',
    state: createState(),
  });

  expect(loggingMocks.logPopupExportBatchStale).toHaveBeenCalledWith({
    phase: 'finish',
    requestId: 'req-1',
  });
  expect(loggingMocks.logPopupExportBatchArchiveSaveSuccess).not.toHaveBeenCalled();
  expect(stateMocks.applyBatchExportResult).not.toHaveBeenCalled();
});

it('stops when cancellation is observed during archive creation', async () => {
  stateMocks.isCurrentBatchRequest
    .mockReturnValueOnce(true)
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(false);
  archiveMocks.createBatchArchiveBlob.mockImplementationOnce(
    async (_packages, _layout, options) => {
      expect(options.isCancelled()).toBe(true);
      throw new Error('Popup batch export cancelled');
    }
  );

  await finishBatchExport({
    deps: createDeps(),
    errors: [],
    layout: 'grouped',
    pagePackages: [createPagePackage()],
    requestId: 'req-1',
    state: createState(),
  });

  expect(stateMocks.setBatchExportProgress).not.toHaveBeenCalled();
  expect(loggingMocks.logPopupExportBatchArchiveSaveStart).not.toHaveBeenCalled();
});

describe('finishBatchExport archive save failure', () => {
  it('logs archive save failures and delegates failure progress updates', async () => {
    stateMocks.isCurrentBatchRequest.mockReturnValue(true);
    const saveError = new Error('save failed');
    const saveArchiveBlob: PopupExportRuntimeDeps['saveArchiveBlob'] = vi
      .fn()
      .mockRejectedValue(saveError);

    await finishBatchExport(createArchiveFailureArgs(saveArchiveBlob));

    expect(loggingMocks.logPopupExportBatchArchiveSaveStart).toHaveBeenCalledWith({
      pageCount: 1,
      requestId: 'req-1',
    });
    expect(loggingMocks.logPopupExportBatchArchiveSaveFailure).toHaveBeenCalledWith({
      error: 'save failed',
      pageCount: 1,
      requestId: 'req-1',
    });
    expect(stateMocks.setBatchSaveFailureProgress).toHaveBeenCalledWith({
      error: saveError,
      errors: ['tab error'],
      pagePackages: [createPagePackage()],
      state: expect.any(Object),
    });
  });

  it('logs archive save failures without an error field for non-Error rejections', async () => {
    stateMocks.isCurrentBatchRequest.mockReturnValue(true);

    const saveArchiveBlob: PopupExportRuntimeDeps['saveArchiveBlob'] = vi
      .fn()
      .mockRejectedValue('save failed');

    await finishBatchExport(createArchiveFailureArgs(saveArchiveBlob));

    expect(loggingMocks.logPopupExportBatchArchiveSaveFailure).toHaveBeenCalledWith({
      pageCount: 1,
      requestId: 'req-1',
    });
    expect(stateMocks.setBatchSaveFailureProgress).toHaveBeenCalledWith({
      error: 'save failed',
      errors: ['tab error'],
      pagePackages: [createPagePackage()],
      state: expect.any(Object),
    });
  });
});

describe('finishBatchExport archive save success', () => {
  it('saves the archive, updates progress, and applies the final result on success', async () => {
    stateMocks.isCurrentBatchRequest.mockReturnValue(true);
    const deps = createDeps();
    const state = createState();
    const pagePackages = [createPagePackage()];

    await finishBatchExport({
      deps,
      errors: [],
      layout: 'grouped',
      pagePackages,
      requestId: 'req-1',
      state,
    });

    expect(stateMocks.setBatchExportProgress).toHaveBeenCalledWith(
      state,
      1,
      1,
      'popup.export.batchArchiveMessage',
      'zipping'
    );
    expect(deps.saveArchiveBlob).toHaveBeenCalledWith(expect.any(Blob), 'pages_export_test.zip');
    expect(loggingMocks.logPopupExportBatchArchiveSaveSuccess).toHaveBeenCalledWith({
      pageCount: 1,
      requestId: 'req-1',
    });
    expect(stateMocks.applyBatchExportResult).toHaveBeenCalledWith({
      errors: [],
      filename: 'pages_export_test.zip',
      pagePackages,
      state,
    });
  });
});
