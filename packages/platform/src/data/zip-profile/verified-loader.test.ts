import JSZip from 'jszip';
import { expect, it, vi } from 'vitest';

import { loadVerifiedZip } from './verified-loader';
import { createZip } from './central-directory.test-support';

const OPTIONS = {
  maxArchiveBytes: 1024,
  maxCompressionRatio: 100,
  maxEntryBytes: 512,
  maxFileCount: 2,
  maxTotalInflatedBytes: 512,
};

it('rejects an invalid central directory before invoking JSZip', async () => {
  const load = vi.spyOn(JSZip, 'loadAsync');
  await expect(loadVerifiedZip(new Uint8Array([1, 2, 3]), OPTIONS)).rejects.toThrow();
  expect(load).not.toHaveBeenCalled();
  load.mockRestore();
});

it('rejects excess directory entries before invoking JSZip', async () => {
  const archive = createZip([
    { data: [], name: 'one/' },
    { data: [], name: 'two/' },
    { data: [], name: 'three/' },
  ]);
  const load = vi.spyOn(JSZip, 'loadAsync');
  await expect(loadVerifiedZip(archive, OPTIONS)).rejects.toThrow('too many entries');
  expect(load).not.toHaveBeenCalled();
  load.mockRestore();
});

it('passes the exact admitted byte view to JSZip', async () => {
  const archive = await new JSZip()
    .file('manifest.json', '{}')
    .generateAsync({ type: 'uint8array' });
  const load = vi.spyOn(JSZip, 'loadAsync');
  await loadVerifiedZip(archive, OPTIONS);
  expect(load).toHaveBeenCalledWith(
    expect.objectContaining({
      buffer: archive.buffer,
      byteLength: archive.byteLength,
      byteOffset: archive.byteOffset,
    })
  );
  load.mockRestore();
});
