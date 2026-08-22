// @vitest-environment jsdom

import { afterEach, expect, it, vi } from 'vitest';
import { createDirectFileSink } from './file-sink';
import { createArchiveWriter } from './writer';

afterEach(() => {
  Reflect.deleteProperty(window, 'showSaveFilePicker');
  vi.restoreAllMocks();
});

it('opens a direct file writer and settles it exactly once', async () => {
  const close = vi.fn(async () => undefined);
  const abort = vi.fn(async () => undefined);
  const writable = createFileWritable(close, abort);
  const createWritable = vi.fn(async () => writable);
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: vi.fn(async () => ({ createWritable })),
  });

  const sink = await createDirectFileSink({
    description: 'Archive',
    extension: '.zip',
    filename: 'backup.zip',
    mimeType: 'application/zip',
  });
  await sink.close();
  await sink.close();

  expect(createWritable).toHaveBeenCalledWith({ keepExistingData: false });
  expect(close).toHaveBeenCalledOnce();
  expect(abort).not.toHaveBeenCalled();
});

it('aborts a direct file writer exactly once', async () => {
  const close = vi.fn(async () => undefined);
  const abort = vi.fn(async () => undefined);
  const createWritable = vi.fn(async () => createFileWritable(close, abort));
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: vi.fn(async () => ({ createWritable })),
  });

  const sink = await createDirectFileSink({
    description: 'Archive',
    extension: '.zip',
    filename: 'backup.zip',
    mimeType: 'application/zip',
  });
  await sink.abort(new Error('disk failure'));
  await sink.abort();

  expect(abort).toHaveBeenCalledOnce();
  expect(close).not.toHaveBeenCalled();
});

it('fails before export work when direct file streaming is unavailable', async () => {
  await expect(
    createDirectFileSink({
      description: 'Archive',
      extension: '.zip',
      filename: 'backup.zip',
      mimeType: 'application/zip',
    })
  ).rejects.toThrow('Direct file streaming is unavailable');
});

it('aborts the direct file transaction when final close fails', async () => {
  const closeError = new Error('device removed');
  const close = vi.fn(async () => Promise.reject(closeError));
  const abort = vi.fn(async () => undefined);
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: vi.fn(async () => ({
      createWritable: vi.fn(async () => createFileWritable(close, abort)),
    })),
  });
  const sink = await createDirectFileSink({
    description: 'Archive',
    extension: '.zip',
    filename: 'backup.zip',
    mimeType: 'application/zip',
  });
  const archive = createArchiveWriter(sink);

  await expect(archive.close()).rejects.toBe(closeError);
  expect(abort).toHaveBeenCalledWith(closeError);
});

it('surfaces both final close and abort failures', async () => {
  const closeError = new Error('device removed');
  const abortError = new Error('abort failed');
  const close = vi.fn(async () => Promise.reject(closeError));
  const abort = vi.fn(async () => Promise.reject(abortError));
  Object.defineProperty(window, 'showSaveFilePicker', {
    configurable: true,
    value: vi.fn(async () => ({
      createWritable: vi.fn(async () => createFileWritable(close, abort)),
    })),
  });
  const sink = await createDirectFileSink({
    description: 'Archive',
    extension: '.zip',
    filename: 'backup.zip',
    mimeType: 'application/zip',
  });
  const archive = createArchiveWriter(sink);

  await expect(archive.close()).rejects.toMatchObject({
    cause: closeError,
    errors: [closeError, abortError],
  });
});

function createFileWritable(
  close: () => Promise<void>,
  abort: (reason?: unknown) => Promise<void>
): WritableStream<Uint8Array> {
  const writable = new WritableStream<Uint8Array>();
  Object.defineProperties(writable, {
    abort: { configurable: true, value: abort },
    close: { configurable: true, value: close },
  });
  return writable;
}
