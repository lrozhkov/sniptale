import { expect, it, vi } from 'vitest';
import {
  ASSET_ROOT_DIRECTORY_NAME,
  createAssetObjectWriter,
  listReadyJournals,
  listAssetObjectIds,
} from './opfs-store';
import { createHarness, MemoryDirectoryHandle, MemoryFileHandle } from './opfs-store.test-support';

it.each(['empty', 'unrelated', 'directory', 'file', 'enumeration-error', 'budget'] as const)(
  'accepts an aborted cold root lookup only after proving absence: %s',
  async (state) => {
    const harness = createHarness();
    const error = new DOMException('lookup aborted', 'AbortError');
    if (state === 'directory')
      harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, new MemoryDirectoryHandle());
    if (state === 'file')
      harness.root.entriesByName.set(ASSET_ROOT_DIRECTORY_NAME, new MemoryFileHandle());
    if (state === 'unrelated') harness.root.entriesByName.set('other', new MemoryDirectoryHandle());
    if (state === 'budget')
      for (let i = 0; i < 64; i++)
        harness.root.entriesByName.set(`other-${i}`, new MemoryFileHandle());
    vi.spyOn(harness.root, 'getDirectoryHandle').mockRejectedValue(error);
    if (state === 'enumeration-error') {
      const entries = harness.root.entries.bind(harness.root);
      vi.spyOn(harness.root, 'entries').mockImplementation(async function* () {
        for await (const entry of entries()) yield entry;
        throw new DOMException('enumeration failed', 'UnknownError');
      });
    }
    const before = [...harness.root.entriesByName];
    if (state === 'empty' || state === 'unrelated') {
      await expect(listReadyJournals(harness.options)).resolves.toEqual([]);
      await expect(listAssetObjectIds(harness.options)).resolves.toEqual([]);
    } else await expect(listReadyJournals(harness.options)).rejects.toBe(error);
    expect([...harness.root.entriesByName]).toEqual(before);
  }
);

it('preserves creation failures without using the absence probe', async () => {
  const harness = createHarness();
  const error = new DOMException('create aborted', 'AbortError');
  vi.spyOn(harness.root, 'getDirectoryHandle').mockRejectedValue(error);
  const enumerate = vi.spyOn(harness.root, 'entries');
  await expect(
    createAssetObjectWriter({ mimeType: 'video/mp4' }, harness.options)
  ).rejects.toMatchObject({ errors: [error, error] });
  expect(enumerate).not.toHaveBeenCalled();
  expect(harness.root.entriesByName.size).toBe(0);
});
