import { expect, it, vi } from 'vitest';
import { hashSyncText } from './wire-record';
import { readVerifiedRemoteObjectBlob, RemoteContentMismatch } from './remote-object-integrity';
import type { SyncRemoteStore } from './remote-store';

function remoteWith(body: string) {
  const read = vi.fn<SyncRemoteStore['read']>(async () => new Blob([body]).stream());
  const remote: SyncRemoteStore = {
    read,
    list: async () => ({ objects: [], prefixes: [], nextCursor: null }),
    stat: async () => ({ size: body.length }),
    write: async () => undefined,
  };
  return { remote, read };
}

it('reads a bounded verified metadata Blob with one GET', async () => {
  const { remote, read } = remoteWith('json');
  const blob = await readVerifiedRemoteObjectBlob(
    remote,
    'metadata',
    {
      size: 4,
      sha256: hashSyncText('json'),
      mimeType: 'application/json',
      maxBytes: 8,
    },
    new AbortController().signal
  );
  expect(await blob.text()).toBe('json');
  expect(blob.type).toBe('application/json');
  expect(read).toHaveBeenCalledTimes(1);
});

it('refuses an oversized declaration before network IO', async () => {
  const { remote, read } = remoteWith('json');
  await expect(
    readVerifiedRemoteObjectBlob(
      remote,
      'metadata',
      {
        size: 9,
        sha256: hashSyncText('json'),
        mimeType: 'application/json',
        maxBytes: 8,
      },
      new AbortController().signal
    )
  ).rejects.toBeInstanceOf(RemoteContentMismatch);
  expect(read).not.toHaveBeenCalled();
});

it.each([
  { body: 'extra', size: 4, digest: hashSyncText('json') },
  { body: 'js', size: 4, digest: hashSyncText('json') },
  { body: 'json', size: 4, digest: hashSyncText('nope') },
])('refuses extra, truncated or changed bytes: $body/$size', async ({ body, size, digest }) => {
  const { remote } = remoteWith(body);
  await expect(
    readVerifiedRemoteObjectBlob(
      remote,
      'metadata',
      {
        size,
        sha256: digest,
        mimeType: 'application/json',
        maxBytes: 8,
      },
      new AbortController().signal
    )
  ).rejects.toBeInstanceOf(RemoteContentMismatch);
});

it('preserves cancellation before network IO', async () => {
  const { remote, read } = remoteWith('json');
  const controller = new AbortController();
  controller.abort();
  await expect(
    readVerifiedRemoteObjectBlob(
      remote,
      'metadata',
      {
        size: 4,
        sha256: hashSyncText('json'),
        mimeType: 'application/json',
        maxBytes: 8,
      },
      controller.signal
    )
  ).rejects.toMatchObject({ name: 'AbortError' });
  expect(read).not.toHaveBeenCalled();
});

it('cancels an unfinished metadata stream without returning partial bytes', async () => {
  const { remote, read } = remoteWith('json');
  const controller = new AbortController();
  const entered = Promise.withResolvers<void>();
  const cancelled = vi.fn();
  read.mockImplementationOnce(
    async () =>
      new ReadableStream<Uint8Array>({
        pull() {
          entered.resolve();
        },
        cancel: cancelled,
      })
  );
  const pending = readVerifiedRemoteObjectBlob(
    remote,
    'metadata',
    {
      size: 4,
      sha256: hashSyncText('json'),
      mimeType: 'application/json',
      maxBytes: 8,
    },
    controller.signal
  );
  await entered.promise;
  controller.abort();
  await expect(pending).rejects.toMatchObject({ name: 'AbortError' });
  expect(cancelled).toHaveBeenCalledOnce();
});
