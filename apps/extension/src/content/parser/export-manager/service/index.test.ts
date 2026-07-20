// @vitest-environment jsdom

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
  getExportErrorMessageMock,
  prepareDOMTreeSnapshotMock,
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
  getExportErrorMessageMock: vi.fn(),
  prepareDOMTreeSnapshotMock: vi.fn(),
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

vi.mock('./runtime', async (importOriginal) => ({
  ...(await importOriginal()),
  captureOptionalArchiveAssets: captureOptionalArchiveAssetsMock,
  getExportErrorMessage: getExportErrorMessageMock,
}));

vi.mock('../archive/transfer', () => ({
  collectFilesWithHarForExportManager: collectFilesWithHarForExportManagerMock,
}));

import { createExportManagerService } from '.';
import type { PageSnapshotSource } from '../../page-snapshot/source';

type DeferredValue<T> = {
  promise: Promise<T>;
  reject: (reason?: unknown) => void;
  resolve: (value: T) => void;
};

function createExportOptions() {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createDeferred<T>(): DeferredValue<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { promise, reject, resolve };
}

function createTransferResult(previewId: string, fileId: string, filename: string) {
  return {
    collectedFiles: { files: [{ id: previewId }] },
    downloadResult: {
      files: new Map([[fileId, new Blob([fileId])]]),
      errors: [],
      urlUuidToFilename: new Map([[fileId, filename]]),
    },
    sessionHar: null,
  };
}

function createPackageResult(archiveBaseName: string) {
  return {
    archiveBaseName,
    entries: [],
    errors: [],
    stats: {
      sectionsCount: 0,
      rowsCount: 0,
      filesCount: 0,
      filesFailed: 0,
    },
  };
}

function createSnapshotSource() {
  const snapshotDocument = document.implementation.createHTMLDocument('Snapshot');

  return {
    snapshotDocument,
    snapshotSource: {
      document: snapshotDocument,
      pageUrl: 'https://snapshot.example/page',
    } as PageSnapshotSource,
  };
}

function mockTransferCollection(previewId: string, fileId: string, filename: string) {
  return async (
    _tree: unknown,
    _options: unknown,
    _warnings: unknown,
    control: {
      setPreviewToDownloadMap: (value: Map<string, string>) => void;
      setUrlUuidToFilename: (value: Map<string, string>) => void;
    }
  ) => {
    control.setPreviewToDownloadMap(new Map([[previewId, `download-${previewId}`]]));
    control.setUrlUuidToFilename(new Map([[fileId, filename]]));
    return createTransferResult(previewId, fileId, filename);
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  prepareDOMTreeSnapshotMock.mockResolvedValue({
    iframeReadiness: null,
    tree: { context: 'service', title: 'Service', structure: [] },
  });
  buildExportDataMock.mockReturnValue({ id: 'export-data' });
  createExportStatsMock.mockReturnValue({
    sectionsCount: 1,
    rowsCount: 2,
    filesCount: 3,
    filesFailed: 0,
  });
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
  getExportErrorMessageMock.mockImplementation((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback
  );
});

describe('export-manager service source ownership', () => {
  it('uses the owned snapshot source for package builds', async () => {
    const { snapshotDocument, snapshotSource } = createSnapshotSource();
    const service = createExportManagerService({ snapshotSource });
    collectFilesWithHarForExportManagerMock.mockResolvedValue(
      createTransferResult('preview-a', 'uuid-a', 'file-a.txt')
    );

    await service.buildPackage(createExportOptions());

    expect(prepareDOMTreeSnapshotMock).toHaveBeenCalledWith('export-manager', snapshotSource);
    expect(collectCoreLogAssetsMock).toHaveBeenCalledWith(
      expect.objectContaining({
        diagnosticsSource: expect.objectContaining({
          document: snapshotDocument,
          pageUrl: 'https://snapshot.example/page',
        }),
      })
    );
  });
});

describe('export-manager service ownership isolation', () => {
  it('keeps archive state isolated between service instances', async () => {
    const firstService = createExportManagerService();
    const secondService = createExportManagerService();
    const firstProgress = vi.fn();
    const secondProgress = vi.fn();

    firstService.onProgress(firstProgress);
    secondService.onProgress(secondProgress);

    collectFilesWithHarForExportManagerMock
      .mockImplementationOnce(mockTransferCollection('preview-a', 'uuid-a', 'file-a.txt'))
      .mockImplementationOnce(mockTransferCollection('preview-b', 'uuid-b', 'file-b.txt'));

    buildExportPagePackageMock
      .mockResolvedValueOnce(createPackageResult('preview-a'))
      .mockResolvedValueOnce(createPackageResult('preview-b'));

    const firstResult = await firstService.export(createExportOptions());
    const secondResult = await secondService.export(createExportOptions());

    expect(firstResult).toMatchObject({
      success: true,
      filename: 'preview-a.zip',
    });
    expect(secondResult).toMatchObject({
      success: true,
      filename: 'preview-b.zip',
    });
    expect(firstProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'done' }));
    expect(secondProgress).toHaveBeenCalledWith(expect.objectContaining({ phase: 'done' }));
  });
});

describe('export-manager service ownership cancellation', () => {
  it('aborts only the active service instance and reports the cancellation path', async () => {
    const service = createExportManagerService();
    const progressSpy = vi.fn();
    const transferDeferred = createDeferred<{
      collectedFiles: { files: unknown[] };
      downloadResult: {
        errors: string[];
        files: Map<string, Blob>;
        urlUuidToFilename: Map<string, string>;
      };
      sessionHar: null;
    }>();

    service.onProgress(progressSpy);

    collectFilesWithHarForExportManagerMock.mockImplementation(async () => {
      return transferDeferred.promise;
    });

    const exportPromise = service.export(createExportOptions());
    await Promise.resolve();
    await Promise.resolve();
    service.cancel();
    transferDeferred.resolve({
      collectedFiles: { files: [] },
      downloadResult: {
        errors: [],
        files: new Map(),
        urlUuidToFilename: new Map(),
      },
      sessionHar: null,
    });

    await expect(exportPromise).resolves.toMatchObject({
      success: false,
      errors: ['content.runtime.exportCancelled'],
    });
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: 'error',
        message: 'content.runtime.exportCancelled',
      })
    );
  });
});
