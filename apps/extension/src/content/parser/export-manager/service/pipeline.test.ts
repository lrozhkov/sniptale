import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildExportDataMock,
  captureOptionalArchiveAssetsMock,
  collectAdvancedLogAssetsMock,
  collectCoreLogAssetsMock,
  collectCssDiagnosticAssetsMock,
  collectFilesWithHarForExportManagerMock,
  buildExportPagePackageMock,
  createExportArchiveBlobMock,
  createExportStatsMock,
  prepareDOMTreeSnapshotMock,
  startConsoleDiagnosticsCaptureMock,
  stopConsoleDiagnosticsCaptureMock,
} = vi.hoisted(() => ({
  buildExportDataMock: vi.fn(),
  captureOptionalArchiveAssetsMock: vi.fn(),
  collectAdvancedLogAssetsMock: vi.fn(),
  collectCoreLogAssetsMock: vi.fn(),
  collectCssDiagnosticAssetsMock: vi.fn(),
  collectFilesWithHarForExportManagerMock: vi.fn(),
  buildExportPagePackageMock: vi.fn(),
  createExportArchiveBlobMock: vi.fn(),
  createExportStatsMock: vi.fn(),
  prepareDOMTreeSnapshotMock: vi.fn(),
  startConsoleDiagnosticsCaptureMock: vi.fn(),
  stopConsoleDiagnosticsCaptureMock: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal()),
  translate: (key: string) => key,
}));

vi.mock('../../dom-tree-parser/snapshot', async (importOriginal) => ({
  ...(await importOriginal()),
  prepareParsedPageSnapshot: prepareDOMTreeSnapshotMock,
}));

vi.mock('../archive', async (importOriginal) => ({
  ...(await importOriginal()),
  buildExportPagePackage: buildExportPagePackageMock,
  createExportArchiveBlob: createExportArchiveBlobMock,
}));

vi.mock('../formats/data', async (importOriginal) => ({
  ...(await importOriginal()),
  buildExportData: buildExportDataMock,
  createExportStats: createExportStatsMock,
}));

vi.mock('../diagnostics', async (importOriginal) => ({
  ...(await importOriginal()),
  collectAdvancedLogAssets: collectAdvancedLogAssetsMock,
  collectCoreLogAssets: collectCoreLogAssetsMock,
  collectCssDiagnosticAssets: collectCssDiagnosticAssetsMock,
}));

vi.mock('../diagnostics/console', async (importOriginal) => ({
  ...(await importOriginal()),
  startConsoleDiagnosticsCapture: startConsoleDiagnosticsCaptureMock,
  stopConsoleDiagnosticsCapture: stopConsoleDiagnosticsCaptureMock,
}));

vi.mock('./runtime', async (importOriginal) => ({
  ...(await importOriginal()),
  captureOptionalArchiveAssets: captureOptionalArchiveAssetsMock,
}));

vi.mock('../archive/transfer', () => ({
  collectFilesWithHarForExportManager: collectFilesWithHarForExportManagerMock,
}));

import { runExportManagerPipeline } from './pipeline';
import { beginExportManagerRun, createExportManagerState } from './state';

function createExportOptions(overrides: Record<string, boolean> = {}) {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
    ...overrides,
  };
}

function createPipelineStateWithProgressSpy() {
  const state = createExportManagerState();
  const progressSpy = vi.fn();

  state.progressCallback = progressSpy;
  beginExportManagerRun(state);
  state.previewToDownloadMap = new Map([['preview-a', 'download-a']]);
  state.urlUuidToFilename = new Map([['uuid-a', 'file-a.txt']]);

  return { progressSpy, state };
}

function configurePipelineSuccessMocks() {
  captureOptionalArchiveAssetsMock.mockResolvedValue([
    { path: 'optional.txt', content: 'optional' },
  ]);
  collectCoreLogAssetsMock.mockReturnValue([{ path: 'core.json', content: '{}' }]);
  collectAdvancedLogAssetsMock.mockResolvedValue([{ path: 'advanced.json', content: '{}' }]);
  collectCssDiagnosticAssetsMock.mockReturnValue([{ path: 'styles.json', content: '{}' }]);
  collectFilesWithHarForExportManagerMock.mockResolvedValue({
    collectedFiles: { files: [{ id: 'preview-a' }, { id: 'preview-b' }] },
    downloadResult: {
      files: new Map([['uuid-a', new Blob(['file'])]]),
    },
    sessionHar: { entries: [] },
  });
}

function createEmptyTransferResult() {
  return {
    collectedFiles: { files: [] },
    downloadResult: { files: new Map() },
    sessionHar: null,
  };
}

function expectSuccessfulPipelineResult(progressSpy: ReturnType<typeof vi.fn>, result: unknown) {
  expect(result).toMatchObject({
    filename: 'export.zip',
    stats: {
      sectionsCount: 1,
      rowsCount: 2,
      filesCount: 3,
      filesFailed: 0,
    },
  });
  expect(buildExportDataMock).toHaveBeenCalledWith(expect.objectContaining({ structure: [] }));
  expect(buildExportPagePackageMock).toHaveBeenCalledWith(
    expect.objectContaining({
      data: { id: 'export-data' },
      errors: ['warning-a'],
      extraAssets: [
        { path: 'optional.txt', content: 'optional' },
        { path: 'core.json', content: '{}' },
        { path: 'advanced.json', content: '{}' },
        { path: 'styles.json', content: '{}' },
      ],
      capture: expect.objectContaining({ treeData: expect.objectContaining({ structure: [] }) }),
    })
  );
  expect(createExportStatsMock).toHaveBeenCalledWith({ id: 'export-data' }, 1, 1);
  expect(progressSpy).toHaveBeenCalledWith(
    expect.objectContaining({
      phase: 'done',
      message: 'content.runtime.exportCompleted',
      current: 2,
      total: 2,
      errors: ['warning-a'],
    })
  );
}

beforeEach(() => {
  vi.clearAllMocks();

  prepareDOMTreeSnapshotMock.mockResolvedValue({
    iframeReadiness: null,
    tree: { context: 'pipeline', title: 'Pipeline', structure: [] },
  });
  buildExportDataMock.mockReturnValue({ id: 'export-data' });
  captureOptionalArchiveAssetsMock.mockResolvedValue([]);
  collectCoreLogAssetsMock.mockReturnValue([]);
  collectAdvancedLogAssetsMock.mockResolvedValue([]);
  collectCssDiagnosticAssetsMock.mockReturnValue([]);
  buildExportPagePackageMock.mockResolvedValue({
    archiveBaseName: 'export',
    entries: [],
    errors: [],
    stats: {
      sectionsCount: 0,
      rowsCount: 0,
      filesCount: 0,
      filesFailed: 0,
    },
  });
  createExportArchiveBlobMock.mockResolvedValue(new Blob(['zip']));
  createExportStatsMock.mockReturnValue({
    sectionsCount: 1,
    rowsCount: 2,
    filesCount: 3,
    filesFailed: 0,
  });
});

describe('export-manager service-pipeline success path', () => {
  it('builds export data, extra assets, archive, and final stats for a populated transfer', async () => {
    const { progressSpy, state } = createPipelineStateWithProgressSpy();
    configurePipelineSuccessMocks();
    const result = await runExportManagerPipeline(state, createExportOptions(), ['warning-a']);
    expectSuccessfulPipelineResult(progressSpy, result);
    expect(createExportArchiveBlobMock).toHaveBeenCalledWith(
      expect.objectContaining({ archiveBaseName: 'export' }),
      expect.objectContaining({
        createCancelledError: expect.any(Function),
        isCancelled: expect.any(Function),
      })
    );
    expect(buildExportPagePackageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        binaryMode: 'blob',
      })
    );
    expect(startConsoleDiagnosticsCaptureMock).not.toHaveBeenCalled();
    expect(stopConsoleDiagnosticsCaptureMock).not.toHaveBeenCalled();
  });

  it('captures console diagnostics only around exports that include logs', async () => {
    const { state } = createPipelineStateWithProgressSpy();
    await runExportManagerPipeline(state, createExportOptions({ includeBasicLogs: true }), []);
    expect(startConsoleDiagnosticsCaptureMock).toHaveBeenCalledOnce();
    expect(stopConsoleDiagnosticsCaptureMock).toHaveBeenCalledOnce();
    expect(startConsoleDiagnosticsCaptureMock.mock.invocationCallOrder[0]).toBeLessThan(
      prepareDOMTreeSnapshotMock.mock.invocationCallOrder[0] ?? 0
    );
    expect(stopConsoleDiagnosticsCaptureMock.mock.invocationCallOrder[0]).toBeGreaterThan(
      createExportArchiveBlobMock.mock.invocationCallOrder[0] ?? 0
    );
  });
});

describe('export-manager service-pipeline branch coverage', () => {
  it('skips json assembly and uses empty fallback files when transfer owners return nothing', async () => {
    const state = createExportManagerState();
    beginExportManagerRun(state);

    collectFilesWithHarForExportManagerMock.mockResolvedValue({
      collectedFiles: undefined,
      downloadResult: undefined,
      sessionHar: null,
    });

    await expect(
      runExportManagerPipeline(state, createExportOptions({ includeJson: false }), [])
    ).resolves.toMatchObject({
      filename: 'export.zip',
    });

    expect(buildExportDataMock).not.toHaveBeenCalled();
    expect(buildExportPagePackageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        data: null,
        files: new Map(),
      })
    );
    expect(createExportStatsMock).toHaveBeenCalledWith(null, 0, 0);
  });

  it('stops before archive assembly when export cancellation lands after transfer', async () => {
    const state = createExportManagerState();
    beginExportManagerRun(state);
    collectFilesWithHarForExportManagerMock.mockImplementation(async () => {
      state.isCancelled = true;
      return createEmptyTransferResult();
    });

    await expect(runExportManagerPipeline(state, createExportOptions(), [])).rejects.toThrow(
      'content.runtime.exportCancelled'
    );

    expect(buildExportPagePackageMock).not.toHaveBeenCalled();
    expect(createExportStatsMock).not.toHaveBeenCalled();
  });
});

describe('export-manager service-pipeline cancellation boundaries', () => {
  it('stops without done progress when cancellation lands during archive generation', async () => {
    const { progressSpy, state } = createPipelineStateWithProgressSpy();

    collectFilesWithHarForExportManagerMock.mockResolvedValue(createEmptyTransferResult());
    createExportArchiveBlobMock.mockImplementation(async (_pagePackage, control) => {
      state.isCancelled = true;
      throw control.createCancelledError();
    });

    await expect(
      runExportManagerPipeline(state, createExportOptions({ includeCssDiagnostics: true }), [])
    ).rejects.toThrow('content.runtime.exportCancelled');

    expect(progressSpy).not.toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'done',
      })
    );
    expect(startConsoleDiagnosticsCaptureMock).toHaveBeenCalledOnce();
    expect(stopConsoleDiagnosticsCaptureMock).toHaveBeenCalledOnce();
  });
});
