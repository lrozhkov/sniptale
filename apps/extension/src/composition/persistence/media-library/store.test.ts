import { describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  initDBMock: vi.fn(),
  putMock: vi.fn(),
}));

vi.mock('../infrastructure/indexed-db/core', () => ({
  initDB: mocks.initDBMock,
  MEDIA_LIBRARY_STORE: 'media-store',
}));

import { upsertMediaEntry } from './store';

describe('upsertMediaEntry', () => {
  it('writes the entry into the media library store', async () => {
    mocks.initDBMock.mockResolvedValue({ put: mocks.putMock });
    const entry = { id: 'asset-1' } as never;

    await upsertMediaEntry(entry);

    expect(mocks.putMock).toHaveBeenCalledWith('media-store', entry);
  });
});
