import { afterEach, expect, it, vi } from 'vitest';
import { createVoiceHistoryAudioStorage } from './opfs';
import { deferred } from './test-support';

const PRIVATE_ROOT = 'sniptale-voice-input';
const missing = () => new DOMException('Synthetic missing object', 'NotFoundError');

class MemoryFile {
  readonly kind = 'file' as const;
  bytes = new Blob();
  open = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  write = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  close = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  abort = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  read = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);

  constructor(readonly name: string) {}

  async createWritable(): Promise<FileSystemWritableFileStream> {
    await this.open();
    let staged = new Blob();
    // Native writable transactions publish staged bytes only after successful close.
    const writer = {
      write: async (value: FileSystemWriteChunkType) => {
        await this.write();
        if (!(value instanceof Blob)) throw new Error('Fixture expects an audio Blob');
        staged = value;
      },
      close: async () => {
        await this.close();
        this.bytes = staged;
      },
      abort: async () => {
        await this.abort();
      },
    };
    // Browser boundary fixture implements the writable methods consumed by the real adapter.
    return writer as FileSystemWritableFileStream;
  }

  async getFile(): Promise<File> {
    await this.read();
    return new File([this.bytes], this.name, { type: this.bytes.type });
  }
}

class MemoryDirectory {
  readonly kind = 'directory' as const;
  entries = new Map<string, MemoryDirectory | MemoryFile>();
  openDirectory = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  remove = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  list = vi.fn<() => Promise<void>>().mockResolvedValue(undefined);
  initializeFile: (file: MemoryFile) => void = () => undefined;

  async getDirectoryHandle(name: string, options?: FileSystemGetDirectoryOptions) {
    await this.openDirectory();
    let entry = this.entries.get(name);
    if (!entry && options?.create) {
      entry = new MemoryDirectory();
      this.entries.set(name, entry);
    }
    if (!(entry instanceof MemoryDirectory)) throw missing();
    // Browser boundary fixture implements only the directory methods consumed by this adapter.
    return entry as unknown as FileSystemDirectoryHandle;
  }

  async getFileHandle(name: string, options?: FileSystemGetFileOptions) {
    let entry = this.entries.get(name);
    if (!entry && options?.create) {
      entry = new MemoryFile(name);
      this.initializeFile(entry);
      this.entries.set(name, entry);
    }
    if (!(entry instanceof MemoryFile)) throw missing();
    // Browser boundary fixture implements only the file methods consumed by this adapter.
    return entry as unknown as FileSystemFileHandle;
  }

  async removeEntry(name: string, options?: FileSystemRemoveOptions) {
    await this.remove();
    const entry = this.entries.get(name);
    if (!entry) throw missing();
    if (entry instanceof MemoryDirectory && entry.entries.size && !options?.recursive) {
      throw new DOMException('Synthetic directory is not empty', 'InvalidModificationError');
    }
    this.entries.delete(name);
  }

  async *keys() {
    await this.list();
    yield* this.entries.keys();
  }
}

function fixture() {
  const origin = new MemoryDirectory();
  // The injected origin handle is the native boundary; production adapter code stays unchanged.
  const getRoot = vi.fn(async () => origin as unknown as FileSystemDirectoryHandle);
  const storage = createVoiceHistoryAudioStorage(getRoot);
  return {
    origin,
    getRoot,
    storage,
    directory() {
      const directory = origin.entries.get(PRIVATE_ROOT);
      if (!(directory instanceof MemoryDirectory)) throw new Error('Private directory missing');
      return directory;
    },
  };
}

const audio = (text: string) => new Blob([text], { type: 'audio/webm' });
afterEach(() => vi.unstubAllGlobals());

it('roundtrips private audio and erases only its own root with sibling bytes retained', async () => {
  const f = fixture();
  const sibling = new MemoryDirectory();
  const siblingFile = new MemoryFile('project-audio');
  siblingFile.bytes = audio('accepted project audio');
  sibling.entries.set(siblingFile.name, siblingFile);
  f.origin.entries.set('sniptale-assets', sibling);
  await f.storage.write('first', audio('original microphone bytes'));
  await f.storage.write('second', audio('another dictation'));
  expect(await (await f.storage.read('first')).text()).toBe('original microphone bytes');
  expect((await f.storage.read('first')).type).toBe('audio/webm');
  expect(await f.storage.list()).toEqual(['first', 'second']);
  await f.storage.remove('first');
  expect(await f.storage.list()).toEqual(['second']);
  await f.storage.erase();
  expect(await f.storage.list()).toEqual([]);
  expect(await (await siblingFile.getFile()).text()).toBe('accepted project audio');
  expect(f.origin.entries.has('sniptale-assets')).toBe(true);
});

it('keeps absent-root reads write-free and treats repeated cleanup as idempotent', async () => {
  const f = fixture();
  expect(await f.storage.list()).toEqual([]);
  await expect(f.storage.read('missing')).rejects.toThrow('storage-failed');
  await f.storage.remove('missing');
  await f.storage.erase();
  await f.storage.erase();
  expect(f.origin.entries.size).toBe(0);
});

it('uses the default navigator storage boundary without creating a root during listing', async () => {
  const f = fixture();
  vi.stubGlobal('navigator', { storage: { getDirectory: f.getRoot } });
  expect(await createVoiceHistoryAudioStorage().list()).toEqual([]);
  expect(f.getRoot).toHaveBeenCalledOnce();
  expect(f.origin.entries.size).toBe(0);
});

it('does not acknowledge a file until the native writable close commits', async () => {
  const f = fixture();
  await f.storage.write('accepted', audio('saved'));
  const entered = deferred();
  const release = deferred();
  f.directory().initializeFile = (file) => {
    file.close.mockImplementationOnce(async () => {
      entered.resolve();
      await release.promise;
    });
  };
  const publishing = f.storage.write('pending', audio('new audio'));
  await entered.promise;
  expect((await f.storage.read('pending')).size).toBe(0);
  expect(await (await f.storage.read('accepted')).text()).toBe('saved');
  release.resolve();
  await publishing;
  expect(await (await f.storage.read('pending')).text()).toBe('new audio');
});

it.each(['write', 'close'] as const)(
  'preserves prior audio and aborts partial bytes on native %s failure',
  async (phase) => {
    const f = fixture();
    await f.storage.write('accepted', audio('saved source'));
    const failure = new DOMException('Synthetic disk full', 'QuotaExceededError');
    let pending: MemoryFile | null = null;
    f.directory().initializeFile = (file) => {
      pending = file;
      file[phase].mockRejectedValueOnce(failure);
    };
    await expect(f.storage.write('pending', audio('uncommitted'))).rejects.toBe(failure);
    expect(pending).not.toBeNull();
    const entry = f.directory().entries.get('pending');
    if (!(entry instanceof MemoryFile)) throw new Error('Pending native file missing');
    expect(entry.abort).toHaveBeenCalledOnce();
    expect((await entry.getFile()).size).toBe(0);
    expect(await (await f.storage.read('accepted')).text()).toBe('saved source');
    await f.storage.remove('pending');
    expect(await f.storage.list()).toEqual(['accepted']);
  }
);

it('preserves the original write failure if native abort also fails', async () => {
  const f = fixture();
  await f.storage.write('accepted', audio('saved'));
  const original = new Error('Synthetic write failure');
  f.directory().initializeFile = (file) => {
    file.write.mockRejectedValueOnce(original);
    file.abort.mockRejectedValueOnce(new Error('Synthetic abort failure'));
  };
  await expect(f.storage.write('pending', audio('partial'))).rejects.toBe(original);
  expect(await (await f.storage.read('accepted')).text()).toBe('saved');
});

it('propagates denied directory access without converting it to an empty history', async () => {
  const f = fixture();
  await f.storage.write('accepted', audio('saved'));
  const denied = new DOMException('Synthetic storage denial', 'SecurityError');
  f.origin.openDirectory.mockRejectedValueOnce(denied);
  await expect(f.storage.list()).rejects.toBe(denied);
  expect(await (await f.storage.read('accepted')).text()).toBe('saved');
});

it('propagates native file open read and enumeration errors while retaining accepted bytes', async () => {
  const f = fixture();
  await f.storage.write('accepted', audio('saved'));
  const file = f.directory().entries.get('accepted');
  if (!(file instanceof MemoryFile)) throw new Error('Accepted native file missing');
  const unavailable = new DOMException('Synthetic unavailable storage', 'NotReadableError');
  file.open.mockRejectedValueOnce(unavailable);
  await expect(f.storage.write('accepted', audio('replacement'))).rejects.toBe(unavailable);
  file.read.mockRejectedValueOnce(unavailable);
  await expect(f.storage.read('accepted')).rejects.toBe(unavailable);
  f.directory().list.mockRejectedValueOnce(unavailable);
  await expect(f.storage.list()).rejects.toBe(unavailable);
  expect(await (await f.storage.read('accepted')).text()).toBe('saved');
});

it('retries denied removal and erasure without claiming accepted audio is gone', async () => {
  const f = fixture();
  await f.storage.write('accepted', audio('saved'));
  await f.storage.remove('already-missing');
  const denied = new DOMException('Synthetic removal denial', 'NoModificationAllowedError');
  f.directory().remove.mockRejectedValueOnce(denied);
  await expect(f.storage.remove('accepted')).rejects.toBe(denied);
  expect(await (await f.storage.read('accepted')).text()).toBe('saved');
  f.origin.remove.mockRejectedValueOnce(denied);
  await expect(f.storage.erase()).rejects.toBe(denied);
  expect(await f.storage.list()).toEqual(['accepted']);
  await f.storage.erase();
  expect(await f.storage.list()).toEqual([]);
});
