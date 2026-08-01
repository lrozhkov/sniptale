import { describe, expect, it, vi } from 'vitest';

import { createOpfsRecordingStagingStorage } from './opfs-adapter';
import { createFileSystemDirectoryHandleTestDouble } from './opfs-adapter.test-support';

function fileSystemError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

function missingEntry() {
  return Promise.reject(fileSystemError('NotFoundError'));
}

function createWritableHarness() {
  const chunks: Blob[] = [];
  const writable = {
    abort: vi.fn().mockResolvedValue(undefined),
    close: vi.fn().mockResolvedValue(undefined),
    write: vi.fn(async (chunk: Blob) => {
      chunks.push(chunk);
    }),
  };
  const fileHandle = {
    createWritable: vi.fn().mockResolvedValue(writable),
    getFile: vi.fn(async () => new File(chunks, 'artifact.part')),
    isSameEntry: vi.fn(),
    kind: 'file',
    name: 'artifact.part',
  };
  return { chunks, fileHandle, writable };
}

function createOpfsHarness() {
  const file = createWritableHarness();
  const sessionDirectory = {
    getDirectoryHandle: vi.fn(missingEntry),
    getFileHandle: vi.fn((_name: string, options?: FileSystemGetFileOptions) =>
      options?.create ? Promise.resolve(file.fileHandle) : missingEntry()
    ),
    isSameEntry: vi.fn(),
    kind: 'directory',
    name: 'session-session-id',
    removeEntry: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn(),
  };
  const stagingDirectory = {
    getDirectoryHandle: vi.fn((_name: string, options?: FileSystemGetDirectoryOptions) =>
      options?.create ? Promise.resolve(sessionDirectory) : missingEntry()
    ),
    getFileHandle: vi.fn(missingEntry),
    isSameEntry: vi.fn(),
    kind: 'directory',
    name: 'sniptale-recording-staging',
    removeEntry: vi.fn().mockResolvedValue(undefined),
    resolve: vi.fn(),
  };
  const originRoot = createFileSystemDirectoryHandleTestDouble({
    getDirectoryHandle: vi.fn().mockResolvedValue(stagingDirectory),
    getFileHandle: vi.fn(),
    isSameEntry: vi.fn(),
    kind: 'directory',
    name: '',
    removeEntry: vi.fn(),
    resolve: vi.fn(),
  });
  const ids = ['session-id', 'artifact-id'];
  return {
    file,
    getOriginRoot: vi.fn().mockResolvedValue(originRoot),
    ids,
    originRoot,
    sessionDirectory,
    stagingDirectory,
  };
}

describe('OPFS recording staging adapter', () => {
  it('creates private randomized entries, appends bytes, closes, reads, and removes them', async () => {
    const harness = createOpfsHarness();
    const storage = createOpfsRecordingStagingStorage({
      createId: () => harness.ids.shift() ?? 'unexpected',
      getOriginRoot: harness.getOriginRoot,
    });

    const session = await storage.createSession();
    const artifact = await session.createArtifact();
    await artifact.append(new Blob(['first']));
    await artifact.append(new Blob(['second']));
    await artifact.close();
    const result = await artifact.getFile();
    await artifact.remove();
    await session.remove();

    expect(await result.text()).toBe('firstsecond');
    expect(harness.originRoot.getDirectoryHandle).toHaveBeenCalledWith(
      'sniptale-recording-staging',
      { create: true }
    );
    expect(harness.stagingDirectory.getDirectoryHandle).toHaveBeenLastCalledWith(
      'session-session-id',
      { create: true }
    );
    expect(harness.sessionDirectory.getFileHandle).toHaveBeenLastCalledWith(
      'artifact-artifact-id',
      { create: true }
    );
    expect(harness.file.fileHandle.createWritable).toHaveBeenCalledWith({
      keepExistingData: false,
    });
    expect(harness.file.writable.close).toHaveBeenCalledOnce();
    expect(harness.sessionDirectory.removeEntry).toHaveBeenCalledWith('artifact-artifact-id', {
      recursive: false,
    });
    expect(harness.stagingDirectory.removeEntry).toHaveBeenCalledWith('session-session-id', {
      recursive: true,
    });
  });

  it('aborts an open writable before deleting its temporary file', async () => {
    const harness = createOpfsHarness();
    const storage = createOpfsRecordingStagingStorage({
      createId: () => harness.ids.shift() ?? 'unexpected',
      getOriginRoot: harness.getOriginRoot,
    });

    const session = await storage.createSession();
    const artifact = await session.createArtifact();
    await artifact.abort();
    await artifact.abort();

    expect(harness.file.writable.abort).toHaveBeenCalledOnce();
    expect(harness.sessionDirectory.removeEntry).toHaveBeenCalledOnce();
  });

  it('removes every orphan entry beneath the dedicated staging root', async () => {
    const removeEntry = vi.fn().mockResolvedValue(undefined);
    const stagingDirectory = {
      async *entries() {
        yield ['session-a', { kind: 'directory' }];
        yield ['session-b', { kind: 'directory' }];
      },
      getDirectoryHandle: vi.fn(),
      getFileHandle: vi.fn(),
      isSameEntry: vi.fn(),
      kind: 'directory',
      name: 'sniptale-recording-staging',
      removeEntry,
      resolve: vi.fn(),
    };
    const originRoot = createFileSystemDirectoryHandleTestDouble({
      getDirectoryHandle: vi.fn().mockResolvedValue(stagingDirectory),
    });
    const storage = createOpfsRecordingStagingStorage({
      getOriginRoot: vi.fn().mockResolvedValue(originRoot),
    });

    await expect(storage.countSessions()).resolves.toBe(2);
    await expect(storage.removeAllSessions()).resolves.toBe(2);
    expect(removeEntry).toHaveBeenNthCalledWith(1, 'session-a', { recursive: true });
    expect(removeEntry).toHaveBeenNthCalledWith(2, 'session-b', { recursive: true });
  });

  it('reports no orphans when the staging directory does not exist', async () => {
    const originRoot = createFileSystemDirectoryHandleTestDouble({
      getDirectoryHandle: vi.fn().mockRejectedValue(fileSystemError('NotFoundError')),
    });
    const storage = createOpfsRecordingStagingStorage({
      getOriginRoot: vi.fn().mockResolvedValue(originRoot),
    });

    await expect(storage.countSessions()).resolves.toBe(0);
    await expect(storage.removeAllSessions()).resolves.toBe(0);
  });

  it('fails closed when directory enumeration is unavailable', async () => {
    const originRoot = createFileSystemDirectoryHandleTestDouble({
      getDirectoryHandle: vi.fn().mockResolvedValue({}),
    });
    const storage = createOpfsRecordingStagingStorage({
      getOriginRoot: vi.fn().mockResolvedValue(originRoot),
    });

    await expect(storage.countSessions()).rejects.toThrow('enumeration is unavailable');
    await expect(storage.removeAllSessions()).rejects.toThrow('enumeration is unavailable');
  });

  it('enforces artifact lifecycle transitions without leaking an open writable', async () => {
    const harness = createOpfsHarness();
    const storage = createOpfsRecordingStagingStorage({
      createId: () => harness.ids.shift() ?? 'unexpected',
      getOriginRoot: harness.getOriginRoot,
    });
    const session = await storage.createSession();
    const artifact = await session.createArtifact();

    await expect(artifact.getFile()).rejects.toThrow('must be closed before it is read');
    await expect(artifact.remove()).rejects.toThrow('must be closed or aborted before removal');
    await artifact.append(new Blob(['bytes']));
    await artifact.close();
    await artifact.close();
    await expect(artifact.append(new Blob(['late']))).rejects.toThrow('file is closed');
    await artifact.abort();
    await artifact.abort();

    expect(harness.file.writable.close).toHaveBeenCalledOnce();
    expect(harness.file.writable.abort).not.toHaveBeenCalled();
    expect(harness.sessionDirectory.removeEntry).toHaveBeenCalledOnce();
  });

  it('removes the allocated entry when writable creation fails', async () => {
    const harness = createOpfsHarness();
    const writeError = new Error('writable unavailable');
    harness.file.fileHandle.createWritable.mockRejectedValueOnce(writeError);
    const storage = createOpfsRecordingStagingStorage({
      createId: () => harness.ids.shift() ?? 'unexpected',
      getOriginRoot: harness.getOriginRoot,
    });
    const session = await storage.createSession();

    await expect(session.createArtifact()).rejects.toBe(writeError);
    expect(harness.sessionDirectory.removeEntry).toHaveBeenCalledWith('artifact-artifact-id', {
      recursive: false,
    });
  });

  it('retries a colliding randomized session name before creating the directory', async () => {
    const harness = createOpfsHarness();
    harness.ids.splice(0, harness.ids.length, 'taken', 'available', 'artifact-id');
    harness.stagingDirectory.getDirectoryHandle.mockImplementation(
      (name: string, options?: FileSystemGetDirectoryOptions) => {
        if (options?.create) return Promise.resolve(harness.sessionDirectory);
        return name === 'session-taken'
          ? Promise.resolve(harness.sessionDirectory)
          : missingEntry();
      }
    );
    const storage = createOpfsRecordingStagingStorage({
      createId: () => harness.ids.shift() ?? 'unexpected',
      getOriginRoot: harness.getOriginRoot,
    });

    await storage.createSession();

    expect(harness.stagingDirectory.getDirectoryHandle).toHaveBeenCalledWith('session-available', {
      create: true,
    });
  });

  it('treats type-mismatched candidate entries as available for the requested kind', async () => {
    const harness = createOpfsHarness();
    harness.stagingDirectory.getDirectoryHandle.mockImplementation(
      (_name: string, options?: FileSystemGetDirectoryOptions) =>
        options?.create
          ? Promise.resolve(harness.sessionDirectory)
          : Promise.reject(fileSystemError('TypeMismatchError'))
    );
    const storage = createOpfsRecordingStagingStorage({
      createId: () => harness.ids.shift() ?? 'unexpected',
      getOriginRoot: harness.getOriginRoot,
    });

    await expect(storage.createSession()).resolves.toBeDefined();
  });

  it('reports every cleanup failure while terminally aborting the artifact', async () => {
    const harness = createOpfsHarness();
    harness.file.writable.abort.mockRejectedValueOnce(new Error('abort failed'));
    harness.sessionDirectory.removeEntry.mockRejectedValueOnce(new Error('remove failed'));
    const storage = createOpfsRecordingStagingStorage({
      createId: () => harness.ids.shift() ?? 'unexpected',
      getOriginRoot: harness.getOriginRoot,
    });
    const session = await storage.createSession();
    const artifact = await session.createArtifact();

    await expect(artifact.abort()).rejects.toThrow('Failed to abort recording staging file');
    await expect(artifact.abort()).resolves.toBeUndefined();
  });
});
