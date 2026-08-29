// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';

const {
  buildExportDataMock,
  captureOptionalArchiveAssetsMock,
  collectAdvancedLogAssetsMock,
  collectCoreLogAssetsMock,
  collectCssDiagnosticAssetsMock,
  collectFilesForExportManagerMock,
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
  collectFilesForExportManagerMock: vi.fn(),
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
  collectFilesForExportManager: collectFilesForExportManagerMock,
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
    includePageDiagnostics: false,
    includeImages: false,
    includeJson: true,
    includeMarkdown: false,
  };
}

function createAnnotationsOnlyOptions() {
  return {
    includeAnnotations: true,
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: false,
    includeFullPageScreenshot: false,
    includePageDiagnostics: false,
    includeImages: false,
    includeJson: false,
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

function readBlobText(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error);
    reader.onload = () => resolve(String(reader.result));
    reader.readAsText(blob);
  });
}

function createTransferResult(previewId: string, fileId: string, filename: string) {
  return {
    collectedFiles: { files: [{ id: previewId }] },
    downloadResult: {
      files: new Map([[fileId, new Blob([fileId])]]),
      errors: [],
      urlUuidToFilename: new Map([[fileId, filename]]),
    },
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
    collectFilesForExportManagerMock.mockResolvedValue(
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

    collectFilesForExportManagerMock
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
    }>();

    service.onProgress(progressSpy);

    collectFilesForExportManagerMock.mockImplementation(async () => {
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

describe('export-manager browser annotations delivery', () => {
  it('downloads annotations-only as one markdown file without page capture or ZIP work', async () => {
    const prepareAnnotationsText = vi.fn().mockResolvedValue('# Browser annotations\n');
    const progressSpy = vi.fn();
    const service = createExportManagerService({ prepareAnnotationsText });
    service.onProgress(progressSpy);

    const result = await service.export(createAnnotationsOnlyOptions());

    expect(result).toMatchObject({
      errors: [],
      filename: 'browser-annotations.md',
      success: true,
    });
    expect(result.blob?.type).toBe('text/markdown;charset=utf-8');
    await expect(readBlobText(result.blob as Blob)).resolves.toBe('# Browser annotations\n');
    expect(prepareAnnotationsText).toHaveBeenCalledOnce();
    expect(prepareDOMTreeSnapshotMock).not.toHaveBeenCalled();
    expect(buildExportPagePackageMock).not.toHaveBeenCalled();
    expect(createExportArchiveBlobMock).not.toHaveBeenCalled();
    expect(captureOptionalArchiveAssetsMock).not.toHaveBeenCalled();
    expect(progressSpy).toHaveBeenCalledWith(
      expect.objectContaining({ activeStepKey: 'annotations', phase: 'done' })
    );
  });

  it('builds an annotations-only page package without page capture', async () => {
    const prepareAnnotationsText = vi.fn().mockResolvedValue('annotation evidence');
    const { snapshotSource } = createSnapshotSource();
    snapshotSource.document.title = 'Annotated page';
    const service = createExportManagerService({ prepareAnnotationsText, snapshotSource });

    const pagePackage = await service.buildPackage(createAnnotationsOnlyOptions());

    expect(pagePackage.archiveBaseName).toMatch(/^Annotated_page_\d{4}-\d{2}-\d{2}_/u);
    expect(pagePackage.entries).toEqual([
      expect.objectContaining({
        mimeType: 'text/markdown;charset=utf-8',
        path: 'browser-annotations.md',
        textContent: 'annotation evidence',
      }),
    ]);
    expect(prepareAnnotationsText).toHaveBeenCalledOnce();
    expect(prepareDOMTreeSnapshotMock).not.toHaveBeenCalled();
    expect(buildExportPagePackageMock).not.toHaveBeenCalled();
  });

  it('keeps annotations-only package bases page-scoped independently of batch order', async () => {
    const firstSource = createSnapshotSource().snapshotSource;
    const secondSource = createSnapshotSource().snapshotSource;
    firstSource.document.title = 'First annotated page';
    secondSource.document.title = 'Second annotated page';

    const firstPackage = await createExportManagerService({
      prepareAnnotationsText: vi.fn().mockResolvedValue('first evidence'),
      snapshotSource: firstSource,
    }).buildPackage(createAnnotationsOnlyOptions());
    const secondPackage = await createExportManagerService({
      prepareAnnotationsText: vi.fn().mockResolvedValue('second evidence'),
      snapshotSource: secondSource,
    }).buildPackage(createAnnotationsOnlyOptions());

    expect(firstPackage.archiveBaseName).toMatch(/^First_annotated_page_/u);
    expect(secondPackage.archiveBaseName).toMatch(/^Second_annotated_page_/u);
    expect(firstPackage.archiveBaseName).not.toBe(secondPackage.archiveBaseName);
    expect(prepareDOMTreeSnapshotMock).not.toHaveBeenCalled();
  });

  it('adds one annotations asset to a mixed package through the same command', async () => {
    const prepareAnnotationsText = vi.fn().mockResolvedValue('mixed annotation evidence');
    const service = createExportManagerService({ prepareAnnotationsText });
    const progressSpy = vi.fn();
    service.onProgress(progressSpy);
    collectFilesForExportManagerMock.mockResolvedValue(
      createTransferResult('preview-a', 'uuid-a', 'file-a.txt')
    );

    await service.buildPackage({ ...createExportOptions(), includeAnnotations: true });

    expect(prepareAnnotationsText).toHaveBeenCalledOnce();
    expect(prepareDOMTreeSnapshotMock).toHaveBeenCalledOnce();
    expect(buildExportPagePackageMock).toHaveBeenCalledWith(
      expect.objectContaining({
        extraAssets: [
          {
            content: 'mixed annotation evidence',
            path: 'browser-annotations.md',
          },
        ],
      })
    );
    const progressEvents = progressSpy.mock.calls.map(([progress]) => progress);
    const annotationsIndex = progressEvents.findIndex(
      (progress) => progress.activeStepKey === 'annotations'
    );
    expect(annotationsIndex).toBeGreaterThanOrEqual(0);
    expect(progressEvents[annotationsIndex + 1]).toMatchObject({
      activeStepKey: 'json',
      message: 'content.runtime.scanPageStructure',
      phase: 'scanning',
    });
  });

  it('continues annotations-only data collection with the selected viewport screenshot step', async () => {
    const service = createExportManagerService({
      prepareAnnotationsText: vi.fn().mockResolvedValue('annotation evidence'),
    });
    const progressSpy = vi.fn();
    service.onProgress(progressSpy);

    await service.buildPackage({
      ...createAnnotationsOnlyOptions(),
      includeViewportScreenshot: true,
    });

    const progressEvents = progressSpy.mock.calls.map(([progress]) => progress);
    const annotationsIndex = progressEvents.findIndex(
      (progress) => progress.activeStepKey === 'annotations'
    );
    expect(progressEvents[annotationsIndex + 1]).toMatchObject({
      activeStepKey: 'viewportScreenshot',
      message: 'content.runtime.scanPageStructure',
      phase: 'scanning',
    });
  });

  it('fails annotations-only export without starting page capture when formatting fails', async () => {
    const prepareAnnotationsText = vi.fn().mockRejectedValue(new Error('format failed'));
    const service = createExportManagerService({ prepareAnnotationsText });

    await expect(service.export(createAnnotationsOnlyOptions())).resolves.toMatchObject({
      errors: ['format failed'],
      success: false,
    });
    expect(prepareDOMTreeSnapshotMock).not.toHaveBeenCalled();
    expect(createExportArchiveBlobMock).not.toHaveBeenCalled();
  });

  it('cancels annotations-only preparation before publishing a file', async () => {
    const deferred = createDeferred<string>();
    const service = createExportManagerService({ prepareAnnotationsText: () => deferred.promise });

    const resultPromise = service.export(createAnnotationsOnlyOptions());
    service.cancel();
    deferred.resolve('stale evidence');

    await expect(resultPromise).resolves.toMatchObject({
      errors: ['content.runtime.exportCancelled'],
      success: false,
    });
    expect(prepareDOMTreeSnapshotMock).not.toHaveBeenCalled();
    expect(createExportArchiveBlobMock).not.toHaveBeenCalled();
  });
});
