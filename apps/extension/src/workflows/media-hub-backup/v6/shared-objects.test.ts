import { expect, it, vi } from 'vitest';
import type { ArchiveReader } from '../../../composition/archive-transfer';
import {
  digestBackupObject,
  parseBackupSharedObjects,
  verifyBackupSharedObjects,
} from './shared-objects';

const row = {
  id: 'shared-one',
  path: 'Screenshots/one.png',
  mimeType: 'image/png',
  size: 3,
  sha256: 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
};

it.each([
  null,
  {},
  [null],
  [{ ...row, extra: true }],
  [{ ...row, id: '' }],
  [{ ...row, id: 'x'.repeat(161) }],
  [{ ...row, path: '../one.png' }],
  [{ ...row, sha256: 'bad' }],
  [{ ...row, mimeType: 'IMAGE/PNG' }],
  [{ ...row, size: -1 }],
  [{ ...row, size: 1.5 }],
  [{ ...row, size: '3' }],
  [row, { ...row }],
  [row, { ...row, id: 'other', path: 'screenshots/ONE.png' }],
])('refuses malformed bounded shared tables %#', (value) => {
  expect(() => parseBackupSharedObjects(value)).toThrow();
});

it('admits empty and exact shared table records without caller-owned field reuse', () => {
  expect(parseBackupSharedObjects([])).toEqual([]);
  const parsed = parseBackupSharedObjects([row]);
  expect(parsed).toEqual([row]);
  expect(parsed[0]).not.toBe(row);
});

function source(chunks: string[], size = chunks.join('').length) {
  return {
    size,
    async pipeTo(writable: WritableStream<Uint8Array>, signal?: AbortSignal) {
      signal?.throwIfAborted();
      const writer = writable.getWriter();
      try {
        for (const chunk of chunks) await writer.write(new TextEncoder().encode(chunk));
        await writer.close();
      } finally {
        writer.releaseLock();
      }
    },
  };
}

it('hashes actual bounded chunks, including an empty object', async () => {
  expect(await digestBackupObject(source(['a', 'bc']))).toBe(row.sha256);
  expect(await digestBackupObject(source([]))).toBe(
    'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855'
  );
});

it.each([2, 4])('refuses streamed size drift from declared %i bytes', async (size) => {
  await expect(digestBackupObject(source(['abc'], size))).rejects.toThrow('size');
});

it('preserves streaming cancellation', async () => {
  const abort = new AbortController();
  abort.abort();
  await expect(digestBackupObject(source(['abc']), abort.signal)).rejects.toMatchObject({
    name: 'AbortError',
  });
});

it.each(['missing', 'size', 'digest', 'valid'] as const)(
  'verifies physical shared entry %s',
  async (kind) => {
    const pipe = vi.fn(source(['abc']).pipeTo);
    const reader: ArchiveReader = {
      close: vi.fn(),
      entries: () => [],
      entry: () =>
        kind === 'missing'
          ? null
          : {
              path: row.path,
              compressedSize: 3,
              crc32: 0,
              directory: false,
              size: kind === 'size' ? 4 : 3,
              pipeTo: pipe,
              text: vi.fn(),
            },
    };
    const table = [{ ...row, sha256: kind === 'digest' ? '0'.repeat(64) : row.sha256 }];
    if (kind === 'valid') {
      await verifyBackupSharedObjects(reader, table);
      expect(pipe).toHaveBeenCalledOnce();
    } else await expect(verifyBackupSharedObjects(reader, table)).rejects.toThrow('digest or size');
  }
);
