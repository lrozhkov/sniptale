import { beforeEach, describe, expect, it, vi } from 'vitest';

const { searchMock } = vi.hoisted(() => ({
  searchMock: vi.fn(),
}));

vi.mock('@sniptale/platform/browser/downloads', () => ({
  BrowserDownloadsAdapter: undefined,
  browserDownloads: {
    search: searchMock,
  },
}));

import { resolveCompletedSaveAsDirectory } from './save-as-directory';

beforeEach(() => {
  searchMock.mockReset();
});

describe('download-router save-as directory resolution', () => {
  it.each([
    { items: [], label: 'missing download', result: null },
    { items: [{}], label: 'missing filename', result: null },
    { items: [{ filename: '/absolute/capture.png' }], label: 'absolute POSIX path', result: null },
    {
      items: [{ filename: 'C:\\absolute\\capture.png' }],
      label: 'absolute Windows path',
      result: null,
    },
    { items: [{ filename: 'capture.png' }], label: 'filename without a directory', result: null },
    {
      items: [{ filename: 'nested\\output\\capture.png' }],
      label: 'relative Windows-style path',
      result: 'nested/output',
    },
  ])('returns $result for $label', async ({ items, result }) => {
    searchMock.mockResolvedValue(items);

    await expect(resolveCompletedSaveAsDirectory(17)).resolves.toBe(result);
    expect(searchMock).toHaveBeenCalledWith({ id: 17 });
  });
});
