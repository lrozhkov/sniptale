import { beforeEach, expect, it, vi } from 'vitest';
import { createMediaLibraryEntry } from '../projects/index.test-support';

const mocks = vi.hoisted(() => ({ runMutation: vi.fn() }));
vi.mock('../infrastructure/indexed-db/mutation', () => ({
  runWithIndexedDbMutation: mocks.runMutation,
}));
import { upsertMediaEntry } from './store';

const entry = createMediaLibraryEntry();
const store = { get: vi.fn(), put: vi.fn() };
const tx = { objectStore: () => store, done: Promise.resolve() };
beforeEach(() => {
  vi.clearAllMocks();
  store.get.mockResolvedValue(entry);
  mocks.runMutation.mockImplementation(async (callback) =>
    callback({ transaction: () => tx, put: store.put })
  );
});
it('refuses implicit publication through the legacy metadata writer', async () => {
  store.get.mockResolvedValue(undefined);
  await expect(upsertMediaEntry(entry)).rejects.toThrow();
  expect(store.put).not.toHaveBeenCalled();
});
it('refuses changing the source of an existing material', async () => {
  await expect(
    upsertMediaEntry({ ...entry, source: { kind: 'stored-asset', assetId: 'another' } })
  ).rejects.toThrow();
  expect(store.put).not.toHaveBeenCalled();
});
it('updates metadata while preserving authoritative source and lifecycle', async () => {
  await upsertMediaEntry({ ...entry, filename: 'renamed.png' });
  expect(store.put).toHaveBeenCalledWith(
    expect.objectContaining({ ...entry, filename: 'renamed.png' })
  );
});
