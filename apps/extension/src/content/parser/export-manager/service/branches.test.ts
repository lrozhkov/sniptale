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

function createExportOptions(overrides: Record<string, boolean> = {}) {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: false,
    includeJson: false,
    includeMarkdown: false,
    ...overrides,
  };
}

beforeEach(() => {
  vi.clearAllMocks();

  prepareDOMTreeSnapshotMock.mockResolvedValue({
    iframeReadiness: null,
    tree: { context: 'branches', title: 'Branches', structure: [] },
  });
  buildExportDataMock.mockReturnValue({ id: 'export-data' });
  captureOptionalArchiveAssetsMock.mockResolvedValue([]);
  collectCoreLogAssetsMock.mockReturnValue([]);
  collectAdvancedLogAssetsMock.mockResolvedValue([]);
  collectCssDiagnosticAssetsMock.mockReturnValue([]);
  buildExportPagePackageMock.mockResolvedValue({
    archiveBaseName: 'empty-transfer',
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
    sectionsCount: 0,
    rowsCount: 0,
    filesCount: 0,
    filesFailed: 0,
  });
  getExportErrorMessageMock.mockImplementation((error: unknown, fallback: string) =>
    error instanceof Error ? error.message : fallback
  );
});

describe('export-manager service branch coverage', () => {
  it('handles empty transfer results without a progress subscriber and skips json assembly when disabled', async () => {
    const service = createExportManagerService();

    captureOptionalArchiveAssetsMock.mockImplementation(async ({ updateProgress }) => {
      updateProgress({
        phase: 'files',
        message: 'capturing optional assets',
        current: 1,
        total: 2,
      });
      return [];
    });

    collectFilesWithHarForExportManagerMock.mockImplementation(
      async (_tree, _options, _warnings, control) => {
        expect(control.createCancelledError().message).toBe('content.runtime.exportCancelled');
        expect(control.isCancelled()).toBe(false);
        control.updateProgress({
          phase: 'files',
          message: 'collecting files',
          current: 2,
          total: 4,
        });

        return {
          collectedFiles: undefined,
          downloadResult: undefined,
          sessionHar: null,
        };
      }
    );

    const result = await service.export(createExportOptions());
    const archiveArgs = buildExportPagePackageMock.mock.calls[0]?.[0];

    expect(result).toMatchObject({
      success: true,
      filename: 'empty-transfer.zip',
    });
    expect(buildExportDataMock).not.toHaveBeenCalled();
    expect(createExportStatsMock).toHaveBeenCalledWith(null, 0, 0);
    expect(archiveArgs.files).toBeInstanceOf(Map);
    expect(archiveArgs.files.size).toBe(0);
    expect(archiveArgs.extraAssets).toEqual([]);
  });
});
