import type {
  RecordingStagingStorageAdapter,
  RecordingStagingStorageArtifact,
  RecordingStagingStorageSession,
} from './contracts';

const STAGING_DIRECTORY_NAME = 'sniptale-recording-staging';
const ENTRY_NAME_ATTEMPTS = 10;

interface EnumerableDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

export interface CreateOpfsRecordingStagingStorageOptions {
  createId?: () => string;
  getOriginRoot?: () => Promise<FileSystemDirectoryHandle>;
}

function readErrorName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const name: unknown = Reflect.get(error, 'name');
  return typeof name === 'string' ? name : null;
}

function isNotFoundError(error: unknown): boolean {
  return readErrorName(error) === 'NotFoundError';
}

function isTypeMismatchError(error: unknown): boolean {
  return readErrorName(error) === 'TypeMismatchError';
}

function isEnumerableDirectoryHandle(
  handle: FileSystemDirectoryHandle
): handle is EnumerableDirectoryHandle {
  return typeof Reflect.get(handle, 'entries') === 'function';
}

function defaultCreateId(): string {
  if (typeof crypto.randomUUID !== 'function') {
    throw new Error('Secure recording staging identifiers are unavailable.');
  }
  return crypto.randomUUID();
}

async function defaultGetOriginRoot(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator.storage?.getDirectory !== 'function') {
    throw new Error('Origin private file system is unavailable for recording staging.');
  }
  return navigator.storage.getDirectory();
}

async function findStagingDirectory(
  getOriginRoot: () => Promise<FileSystemDirectoryHandle>,
  create: boolean
): Promise<FileSystemDirectoryHandle | null> {
  const root = await getOriginRoot();
  try {
    return await root.getDirectoryHandle(STAGING_DIRECTORY_NAME, { create });
  } catch (error) {
    if (!create && isNotFoundError(error)) return null;
    throw error;
  }
}

async function directoryEntryExists(
  parent: FileSystemDirectoryHandle,
  name: string
): Promise<boolean> {
  try {
    await parent.getDirectoryHandle(name);
    return true;
  } catch (error) {
    if (!isNotFoundError(error) && !isTypeMismatchError(error)) throw error;
  }
  try {
    await parent.getFileHandle(name);
    return true;
  } catch (error) {
    if (isNotFoundError(error) || isTypeMismatchError(error)) return false;
    throw error;
  }
}

async function createUniqueName(
  parent: FileSystemDirectoryHandle,
  prefix: string,
  createId: () => string
): Promise<string> {
  for (let attempt = 0; attempt < ENTRY_NAME_ATTEMPTS; attempt += 1) {
    const candidate = `${prefix}-${createId()}`;
    if (!(await directoryEntryExists(parent, candidate))) return candidate;
  }
  throw new Error(`Unable to allocate a unique recording staging ${prefix} name.`);
}

async function removeEntryIfPresent(
  parent: FileSystemDirectoryHandle,
  name: string,
  recursive = false
): Promise<void> {
  try {
    await parent.removeEntry(name, { recursive });
  } catch (error) {
    if (!isNotFoundError(error)) throw error;
  }
}

function createStorageArtifact(
  directory: FileSystemDirectoryHandle,
  entryName: string,
  fileHandle: FileSystemFileHandle,
  writable: FileSystemWritableFileStream
): RecordingStagingStorageArtifact {
  let phase: 'open' | 'closed' | 'removed' = 'open';
  return {
    async append(chunk) {
      if (phase !== 'open') throw new Error(`Recording staging file is ${phase}.`);
      await writable.write(chunk);
    },
    async close() {
      if (phase === 'closed') return;
      if (phase !== 'open') throw new Error(`Recording staging file is ${phase}.`);
      await writable.close();
      phase = 'closed';
    },
    async getFile() {
      if (phase !== 'closed') {
        throw new Error('Recording staging file must be closed before it is read.');
      }
      return fileHandle.getFile();
    },
    async abort() {
      if (phase === 'removed') return;
      const errors: unknown[] = [];
      if (phase === 'open') {
        try {
          await writable.abort();
        } catch (error) {
          errors.push(error);
        }
      }
      try {
        await removeEntryIfPresent(directory, entryName);
      } catch (error) {
        errors.push(error);
      }
      phase = 'removed';
      if (errors.length > 0) {
        throw new AggregateError(errors, 'Failed to abort recording staging file.');
      }
    },
    async remove() {
      if (phase === 'removed') return;
      if (phase === 'open') {
        throw new Error('Recording staging file must be closed or aborted before removal.');
      }
      await removeEntryIfPresent(directory, entryName);
      phase = 'removed';
    },
  };
}

function createStorageSession(
  root: FileSystemDirectoryHandle,
  sessionName: string,
  directory: FileSystemDirectoryHandle,
  createId: () => string
): RecordingStagingStorageSession {
  return {
    async createArtifact() {
      const entryName = await createUniqueName(directory, 'artifact', createId);
      const fileHandle = await directory.getFileHandle(entryName, { create: true });
      try {
        const writable = await fileHandle.createWritable({ keepExistingData: false });
        return createStorageArtifact(directory, entryName, fileHandle, writable);
      } catch (error) {
        await removeEntryIfPresent(directory, entryName);
        throw error;
      }
    },
    remove: () => removeEntryIfPresent(root, sessionName, true),
  };
}

export function createOpfsRecordingStagingStorage(
  options: CreateOpfsRecordingStagingStorageOptions = {}
): RecordingStagingStorageAdapter {
  const createId = options.createId ?? defaultCreateId;
  const getOriginRoot = options.getOriginRoot ?? defaultGetOriginRoot;
  return {
    async countSessions() {
      const root = await findStagingDirectory(getOriginRoot, false);
      if (!root) return 0;
      if (!isEnumerableDirectoryHandle(root)) {
        throw new Error('Recording staging directory enumeration is unavailable.');
      }
      let count = 0;
      for await (const _entry of root.entries()) count += 1;
      return count;
    },
    async createSession() {
      const root = await findStagingDirectory(getOriginRoot, true);
      if (!root) throw new Error('Unable to create recording staging directory.');
      const sessionName = await createUniqueName(root, 'session', createId);
      const directory = await root.getDirectoryHandle(sessionName, { create: true });
      return createStorageSession(root, sessionName, directory, createId);
    },
    async removeAllSessions() {
      const root = await findStagingDirectory(getOriginRoot, false);
      if (!root) return 0;
      if (!isEnumerableDirectoryHandle(root)) {
        throw new Error('Recording staging directory enumeration is unavailable.');
      }
      let removedCount = 0;
      for await (const [name] of root.entries()) {
        await removeEntryIfPresent(root, name, true);
        removedCount += 1;
      }
      return removedCount;
    },
  };
}
