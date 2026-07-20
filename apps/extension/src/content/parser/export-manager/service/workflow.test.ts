import { beforeEach, expect, it, vi } from 'vitest';
import type { ExportOptions, FileResource } from '@sniptale/runtime-contracts/export';
import type { ParsedDOMTree } from '@sniptale/runtime-contracts/dom-tree';

const translateMock = vi.hoisted(() => vi.fn((key: string) => `translated:${key}`));
const fileMocks = vi.hoisted(() => ({
  collectDirectLinks: vi.fn(),
  collectDynamicLinks: vi.fn(),
  collectFroalaImageResources: vi.fn(),
  downloadFileResources: vi.fn(),
}));

vi.mock('../../../../platform/i18n', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../../platform/i18n')>()),
  translate: translateMock,
}));

vi.mock('../files', () => fileMocks);

import { collectExportFiles } from './workflow';

const treeData: ParsedDOMTree = {
  context: 'Portal',
  title: 'Ticket',
  structure: [],
};

function createExportOptions(overrides: Partial<ExportOptions> = {}): ExportOptions {
  return {
    includeBasicLogs: false,
    includeCssDiagnostics: false,
    includeFiles: true,
    includeFullPageScreenshot: false,
    includeHarDomLogs: false,
    includeImages: true,
    includeJson: true,
    includeMarkdown: true,
    ...overrides,
  };
}

function createFile(url: string, filename: string, source: FileResource['source']): FileResource {
  return { url, filename, source };
}

function configureImageCollectionMocks(args: {
  directFiles: FileResource[];
  dynamicFiles: FileResource[];
  froalaFiles: FileResource[];
  previewToDownloadMap: Map<string, string>;
}) {
  fileMocks.collectDirectLinks.mockReturnValue(args.directFiles);
  fileMocks.collectDynamicLinks.mockImplementation(async (onProgress) => {
    onProgress(1, 2, 'dynamic pass');
    return args.dynamicFiles;
  });
  fileMocks.collectFroalaImageResources.mockImplementation(async (onProgress) => {
    onProgress(2, 2, 'froala pass');
    return { resources: args.froalaFiles, previewToDownloadMap: args.previewToDownloadMap };
  });
}

function expectImageCollectionProgress(updateProgress: ReturnType<typeof vi.fn>) {
  expect(updateProgress).toHaveBeenNthCalledWith(2, {
    activeStepKey: 'images',
    phase: 'scanning',
    message: 'translated:content.runtime.scanDynamicContent',
    current: 0,
    total: 0,
  });
  expect(updateProgress).toHaveBeenNthCalledWith(3, {
    activeStepKey: 'images',
    phase: 'scanning',
    message: 'dynamic pass',
    current: 1,
    total: 2,
  });
  expect(updateProgress).toHaveBeenNthCalledWith(4, {
    activeStepKey: 'images',
    phase: 'scanning',
    message: 'translated:content.runtime.scanFroalaImages',
    current: 0,
    total: 0,
  });
  expect(updateProgress).toHaveBeenNthCalledWith(5, {
    activeStepKey: 'images',
    phase: 'scanning',
    message: 'froala pass',
    current: 2,
    total: 2,
  });
}

function expectImagesOnlyCollectionProgress(updateProgress: ReturnType<typeof vi.fn>) {
  expect(updateProgress).toHaveBeenNthCalledWith(1, {
    activeStepKey: 'images',
    phase: 'scanning',
    message: 'translated:content.runtime.scanDynamicContent',
    current: 0,
    total: 0,
  });
  expect(updateProgress).toHaveBeenNthCalledWith(2, {
    activeStepKey: 'images',
    phase: 'scanning',
    message: 'dynamic pass',
    current: 1,
    total: 2,
  });
  expect(updateProgress).toHaveBeenNthCalledWith(3, {
    activeStepKey: 'images',
    phase: 'scanning',
    message: 'translated:content.runtime.scanFroalaImages',
    current: 0,
    total: 0,
  });
  expect(updateProgress).toHaveBeenNthCalledWith(4, {
    activeStepKey: 'images',
    phase: 'scanning',
    message: 'froala pass',
    current: 2,
    total: 2,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  fileMocks.collectDirectLinks.mockReturnValue([]);
  fileMocks.collectDynamicLinks.mockResolvedValue([]);
  fileMocks.collectFroalaImageResources.mockResolvedValue({
    resources: [],
    previewToDownloadMap: new Map<string, string>(),
  });
  fileMocks.downloadFileResources.mockResolvedValue({
    files: new Map<string, Blob>(),
    errors: [],
    urlUuidToFilename: new Map<string, string>(),
  });
});

it('skips collection entirely when file export is disabled', async () => {
  const updateProgress = vi.fn();

  await expect(
    collectExportFiles(
      treeData,
      createExportOptions({ includeFiles: false, includeImages: false }),
      updateProgress,
      () => false
    )
  ).resolves.toEqual({
    files: [],
    previewToDownloadMap: new Map(),
  });

  expect(updateProgress).not.toHaveBeenCalled();
  expect(fileMocks.collectDirectLinks).not.toHaveBeenCalled();
});

it('collects only direct links when image export is disabled', async () => {
  const directFiles = [createFile('https://example.test/direct.pdf', 'direct.pdf', 'direct')];
  fileMocks.collectDirectLinks.mockReturnValue(directFiles);
  const updateProgress = vi.fn();

  const result = await collectExportFiles(
    treeData,
    createExportOptions({ includeImages: false }),
    updateProgress,
    () => false
  );

  expect(result).toEqual({
    files: directFiles,
    previewToDownloadMap: new Map(),
  });
  expect(updateProgress).toHaveBeenCalledWith({
    activeStepKey: 'files',
    phase: 'scanning',
    message: 'translated:content.runtime.scanDirectLinks',
    current: 0,
    total: 0,
  });
  expect(fileMocks.collectDynamicLinks).not.toHaveBeenCalled();
  expect(fileMocks.collectFroalaImageResources).not.toHaveBeenCalled();
});

it('collects only image resources when file export is disabled', async () => {
  const dynamicFiles = [createFile('https://example.test/preview.png', 'preview.png', 'dynamic')];
  const froalaFiles = [createFile('https://example.test/froala.png', 'froala.png', 'dynamic')];
  const previewToDownloadMap = new Map([['preview-1', 'download-1']]);
  const updateProgress = vi.fn();

  configureImageCollectionMocks({
    directFiles: [],
    dynamicFiles,
    froalaFiles,
    previewToDownloadMap,
  });

  const result = await collectExportFiles(
    treeData,
    createExportOptions({ includeFiles: false, includeImages: true }),
    updateProgress,
    () => false
  );

  expect(result).toEqual({
    files: [...dynamicFiles, ...froalaFiles],
    previewToDownloadMap,
  });
  expect(fileMocks.collectDirectLinks).not.toHaveBeenCalled();
  expectImagesOnlyCollectionProgress(updateProgress);
});

it('collects direct, dynamic, and Froala resources when image export is enabled', async () => {
  const directFiles = [createFile('https://example.test/direct.pdf', 'direct.pdf', 'direct')];
  const dynamicFiles = [createFile('https://example.test/preview.png', 'preview.png', 'dynamic')];
  const froalaFiles = [createFile('https://example.test/froala.png', 'froala.png', 'dynamic')];
  const previewToDownloadMap = new Map([['preview-1', 'download-1']]);
  const updateProgress = vi.fn();

  configureImageCollectionMocks({
    directFiles,
    dynamicFiles,
    froalaFiles,
    previewToDownloadMap,
  });

  const result = await collectExportFiles(
    treeData,
    createExportOptions(),
    updateProgress,
    () => false
  );

  expect(result).toEqual({
    files: [...directFiles, ...dynamicFiles, ...froalaFiles],
    previewToDownloadMap,
  });
  expectImageCollectionProgress(updateProgress);
});

it('preserves direct-link results when image scans produce no downloadable resources', async () => {
  const directFiles = [createFile('https://example.test/direct.pdf', 'direct.pdf', 'direct')];
  const updateProgress = vi.fn();

  configureImageCollectionMocks({
    directFiles,
    dynamicFiles: [],
    froalaFiles: [],
    previewToDownloadMap: new Map(),
  });

  const result = await collectExportFiles(
    treeData,
    createExportOptions(),
    updateProgress,
    () => false
  );

  expect(result).toEqual({
    files: directFiles,
    previewToDownloadMap: new Map(),
  });
  expect(fileMocks.collectDirectLinks).toHaveBeenCalledWith(treeData, undefined);
  expectImageCollectionProgress(updateProgress);
});
