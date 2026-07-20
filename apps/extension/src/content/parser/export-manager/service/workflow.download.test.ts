import { beforeEach, expect, it, vi } from 'vitest';
import type { FileResource } from '@sniptale/runtime-contracts/export';

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

import { downloadExportFiles } from './workflow';

function createFile(url: string, filename: string, source: FileResource['source']): FileResource {
  return { url, filename, source };
}

beforeEach(() => {
  vi.clearAllMocks();
});

it('downloads files with translated progress updates', async () => {
  const files = [createFile('https://example.test/direct.pdf', 'direct.pdf', 'direct')];
  const updateProgress = vi.fn();
  const downloadResult = {
    files: new Map([['direct.pdf', new Blob(['file'])]]),
    errors: ['warning'],
    urlUuidToFilename: new Map([['file_1', 'direct.pdf']]),
  };

  fileMocks.downloadFileResources.mockImplementation(
    async (_files, _signal, _isCancelled, onProgress) => {
      onProgress(1, 1);
      return downloadResult;
    }
  );

  await expect(downloadExportFiles(files, undefined, () => false, updateProgress)).resolves.toEqual(
    downloadResult
  );

  expect(updateProgress).toHaveBeenCalledWith({
    activeStepKey: 'files',
    phase: 'downloading',
    message: 'translated:content.runtime.downloadFilesPrefix (0/1)...',
    current: 0,
    total: 1,
  });
  expect(updateProgress).toHaveBeenCalledWith({
    activeStepKey: 'files',
    phase: 'downloading',
    message: 'translated:content.runtime.downloadFilesPrefix (1/1)...',
    current: 1,
    total: 1,
  });
});
