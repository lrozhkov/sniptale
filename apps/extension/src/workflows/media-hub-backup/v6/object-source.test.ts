import { expect, it, vi } from 'vitest';
import type { ArchiveStreamSource } from '../../../composition/archive-transfer';
import { openArchiveRootObjectSource } from './object-source';
import { digestBackupObject } from './shared-objects';

const ref = {
  objectId: 'stream',
  path: '_sniptale/assets/stream.bin',
  filename: 'stream.bin',
  mimeType: 'application/octet-stream',
  size: 5,
};
const stream = (blob = new Blob(['bytes'])): ArchiveStreamSource => ({
  size: blob.size,
  pipeTo: (sink, signal) => blob.stream().pipeTo(sink, signal ? { signal } : {}),
});

it('streams existing immutable Blob bytes unchanged', async () => {
  const blob = new Blob(['bytes']);
  const source = await openArchiveRootObjectSource({ blob, ref });
  expect(await digestBackupObject(source)).toBe(await digestBackupObject(stream()));
});

it('opens a stream with its caller signal and checks its declared size', async () => {
  const controller = new AbortController();
  const source = stream();
  const open = vi.fn(async () => source);
  expect(await openArchiveRootObjectSource({ open, ref }, controller.signal)).toBe(source);
  expect(open).toHaveBeenCalledExactlyOnceWith(controller.signal);
  await expect(
    openArchiveRootObjectSource({ open: async () => stream(new Blob(['changed'])), ref })
  ).rejects.toThrow('size changed');
});

it('refuses cancellation before opening and after a pending opener resolves', async () => {
  const controller = new AbortController();
  const open = vi.fn(async () => stream());
  controller.abort();
  await expect(openArchiveRootObjectSource({ open, ref }, controller.signal)).rejects.toMatchObject(
    { name: 'AbortError' }
  );
  expect(open).not.toHaveBeenCalled();
  const pending = Promise.withResolvers<ArchiveStreamSource>();
  const during = new AbortController();
  const result = openArchiveRootObjectSource({ open: () => pending.promise, ref }, during.signal);
  const refused = expect(result).rejects.toMatchObject({ name: 'AbortError' });
  during.abort();
  pending.resolve(stream());
  await refused;
});

it('propagates opener refusal without replacing source bytes with an empty stream', async () => {
  await expect(
    openArchiveRootObjectSource({
      ref,
      open: async () => {
        throw new Error('Refused');
      },
    })
  ).rejects.toThrow('Refused');
});
