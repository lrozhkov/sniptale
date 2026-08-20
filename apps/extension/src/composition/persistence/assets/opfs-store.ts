// policyStateIds: video-recording-control-lease, persistent-data-erasure-lease - active
// recording writers hold exclusive object locks, and privacy erasure invalidates their local state.
import type {
  AssetObjectWriter,
  AssetReadyJournal,
  AssetRef,
  PreparedAssetObject,
} from './contracts';
import { parseAssetReadyJournal } from './guards';

export const ASSET_ROOT_DIRECTORY_NAME = 'sniptale-assets';
export const LEGACY_RECORDING_STAGING_DIRECTORY_NAME = 'sniptale-recording-staging';
const OBJECTS_DIRECTORY_NAME = 'objects';
const WRITING_DIRECTORY_NAME = 'writing';
const READY_DIRECTORY_NAME = 'ready';

interface EnumerableDirectoryHandle extends FileSystemDirectoryHandle {
  entries(): AsyncIterableIterator<[string, FileSystemHandle]>;
}

interface AssetOpfsOptions {
  createId?: () => string;
  getOriginRoot?: () => Promise<FileSystemDirectoryHandle>;
  requestExclusiveLock?: RequestExclusiveAssetLock;
}

type RequestExclusiveAssetLock = (
  name: string,
  options: { ifAvailable: boolean },
  callback: (acquired: boolean) => Promise<void>
) => Promise<void>;

const activeWriterLockReleases = new Map<string, () => Promise<void>>();
const readyProtectedAssetIds = new Set<string>();

function defaultCreateId(): string {
  if (typeof crypto.randomUUID !== 'function') throw new Error('Secure asset IDs are unavailable.');
  return crypto.randomUUID();
}

async function defaultGetOriginRoot(): Promise<FileSystemDirectoryHandle> {
  if (typeof navigator.storage?.getDirectory !== 'function') {
    throw new Error('Origin private file system is unavailable.');
  }
  return navigator.storage.getDirectory();
}

async function defaultRequestExclusiveLock(
  name: string,
  options: { ifAvailable: boolean },
  callback: (acquired: boolean) => Promise<void>
): Promise<void> {
  if (typeof navigator.locks?.request !== 'function') {
    throw new Error('Web Locks are unavailable for asset writer coordination.');
  }
  await navigator.locks.request(
    name,
    { ifAvailable: options.ifAvailable, mode: 'exclusive' },
    (lock) => callback(lock !== null)
  );
}

function assetLockName(assetId: string): string {
  return `sniptale-asset:${assetId}`;
}

async function acquireWriterLock(assetId: string, options: AssetOpfsOptions): Promise<void> {
  const requestLock = options.requestExclusiveLock ?? defaultRequestExclusiveLock;
  let release!: () => void;
  let acquiredResolve!: () => void;
  let acquiredReject!: (error: unknown) => void;
  const released = new Promise<void>((resolve) => {
    release = resolve;
  });
  const acquired = new Promise<void>((resolve, reject) => {
    acquiredResolve = resolve;
    acquiredReject = reject;
  });
  const lifetime = requestLock(assetLockName(assetId), { ifAvailable: false }, async (locked) => {
    if (!locked) throw new Error('Exclusive asset writer lock was not acquired.');
    acquiredResolve();
    await released;
  });
  void lifetime.catch(acquiredReject);
  await acquired;
  activeWriterLockReleases.set(assetId, async () => {
    if (!activeWriterLockReleases.delete(assetId)) return;
    release();
    await lifetime;
  });
}

async function releaseWriterLock(assetId: string): Promise<void> {
  await activeWriterLockReleases.get(assetId)?.();
}

function readErrorName(error: unknown): string | null {
  if (typeof error !== 'object' || error === null) return null;
  const name: unknown = Reflect.get(error, 'name');
  return typeof name === 'string' ? name : null;
}

async function removeIfPresent(
  directory: FileSystemDirectoryHandle,
  name: string,
  recursive = false
): Promise<void> {
  try {
    await directory.removeEntry(name, { recursive });
  } catch (error) {
    if (readErrorName(error) !== 'NotFoundError') throw error;
  }
}

async function getAssetRoot(options: AssetOpfsOptions, create: boolean) {
  const origin = await (options.getOriginRoot ?? defaultGetOriginRoot)();
  try {
    return await origin.getDirectoryHandle(ASSET_ROOT_DIRECTORY_NAME, { create });
  } catch (error) {
    if (!create && readErrorName(error) === 'NotFoundError') return null;
    throw error;
  }
}

async function getAssetDirectory(options: AssetOpfsOptions, name: string, create: boolean) {
  const root = await getAssetRoot(options, create);
  if (!root) return null;
  try {
    return await root.getDirectoryHandle(name, { create });
  } catch (error) {
    if (!create && readErrorName(error) === 'NotFoundError') return null;
    throw error;
  }
}

async function writeTextFile(
  directory: FileSystemDirectoryHandle,
  name: string,
  text: string
): Promise<void> {
  const handle = await directory.getFileHandle(name, { create: true });
  const writable = await handle.createWritable({ keepExistingData: false });
  try {
    await writable.write(text);
    await writable.close();
  } catch (error) {
    await writable.abort().catch(() => undefined);
    await removeIfPresent(directory, name).catch(() => undefined);
    throw error;
  }
}

export async function createAssetObjectWriter(
  input: { assetId?: string; mimeType: string },
  options: AssetOpfsOptions = {}
): Promise<AssetObjectWriter> {
  if (input.mimeType.trim().length === 0) throw new Error('Asset MIME type must not be empty.');
  const assetId = input.assetId ?? (options.createId ?? defaultCreateId)();
  await acquireWriterLock(assetId, options);
  let objects: FileSystemDirectoryHandle | null;
  let writing: FileSystemDirectoryHandle | null;
  try {
    [objects, writing] = await Promise.all([
      getAssetDirectory(options, OBJECTS_DIRECTORY_NAME, true),
      getAssetDirectory(options, WRITING_DIRECTORY_NAME, true),
    ]);
    if (!objects || !writing) throw new Error('Unable to create asset directories.');
    await writeTextFile(writing, assetId, JSON.stringify({ assetId, createdAt: Date.now() }));
  } catch (error) {
    await releaseWriterLock(assetId).catch(() => undefined);
    throw error;
  }
  const objectHandle = await objects.getFileHandle(assetId, { create: true });
  let writable: FileSystemWritableFileStream;
  try {
    writable = await objectHandle.createWritable({ keepExistingData: false });
  } catch (error) {
    await removeIfPresent(objects, assetId).catch(() => undefined);
    await removeIfPresent(writing, assetId).catch(() => undefined);
    await releaseWriterLock(assetId).catch(() => undefined);
    throw error;
  }
  let phase: 'aborted' | 'finalized' | 'open' = 'open';
  let writtenBytes = 0;
  return {
    assetId,
    async abort() {
      if (phase === 'aborted') return;
      if (phase === 'open') await writable.abort().catch(() => undefined);
      phase = 'aborted';
      const cleanup = await Promise.allSettled([
        removeIfPresent(objects, assetId),
        removeIfPresent(writing, assetId),
      ]);
      await releaseWriterLock(assetId).catch(() => undefined);
      const failures = cleanup.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : []
      );
      if (failures.length > 0) {
        throw new AggregateError(failures, `Failed to discard asset object: ${assetId}.`);
      }
    },
    async append(chunk) {
      if (phase !== 'open') throw new Error(`Asset writer is ${phase}.`);
      await writable.write(chunk);
      writtenBytes += chunk.size;
    },
    async finalize(): Promise<PreparedAssetObject> {
      if (phase !== 'open') throw new Error(`Asset writer is ${phase}.`);
      await writable.close();
      const file = await objectHandle.getFile();
      if (file.size !== writtenBytes) {
        await removeIfPresent(objects, assetId);
        await removeIfPresent(writing, assetId);
        await releaseWriterLock(assetId);
        phase = 'aborted';
        throw new Error('Finalized asset size does not match streamed bytes.');
      }
      phase = 'finalized';
      return {
        ref: {
          assetId,
          createdAt: Date.now(),
          location: { kind: 'opfs', objectKey: `${OBJECTS_DIRECTORY_NAME}/${assetId}` },
          mimeType: input.mimeType,
          sha256: null,
          size: file.size,
        },
      };
    },
  };
}

export async function writeBlobToAsset(
  blob: Blob,
  options: AssetOpfsOptions & { assetId?: string; mimeType?: string } = {}
): Promise<PreparedAssetObject> {
  const writer = await createAssetObjectWriter(
    {
      ...(options.assetId ? { assetId: options.assetId } : {}),
      mimeType: options.mimeType || blob.type || 'application/octet-stream',
    },
    options
  );
  try {
    const reader = blob.stream().getReader();
    while (true) {
      const result = await reader.read();
      if (result.done) break;
      await writer.append(new Blob([result.value]));
    }
    return await writer.finalize();
  } catch (error) {
    await writer.abort().catch(() => undefined);
    throw error;
  }
}

export async function writeReadyJournal(
  journal: AssetReadyJournal,
  options: AssetOpfsOptions = {}
): Promise<void> {
  const ready = await getAssetDirectory(options, READY_DIRECTORY_NAME, true);
  if (!ready) throw new Error('Unable to create asset ready directory.');
  await writeTextFile(ready, journal.journalId, JSON.stringify(journal));
  journal.assetRefs.forEach((ref) => readyProtectedAssetIds.add(ref.assetId));
  const writing = await getAssetDirectory(options, WRITING_DIRECTORY_NAME, false);
  if (writing) {
    await Promise.all(
      journal.assetRefs.map((ref) => removeIfPresent(writing, ref.assetId).catch(() => undefined))
    );
  }
  await Promise.all(
    journal.assetRefs.map((ref) => releaseWriterLock(ref.assetId).catch(() => undefined))
  );
}

export async function deleteReadyJournal(
  journalId: string,
  options: AssetOpfsOptions = {}
): Promise<void> {
  const ready = await getAssetDirectory(options, READY_DIRECTORY_NAME, false);
  if (ready) await removeIfPresent(ready, journalId);
}

export async function listReadyJournals(
  options: AssetOpfsOptions = {}
): Promise<AssetReadyJournal[]> {
  const ready = await getAssetDirectory(options, READY_DIRECTORY_NAME, false);
  if (!ready) return [];
  if (typeof Reflect.get(ready, 'entries') !== 'function') {
    throw new Error('Asset journal enumeration is unavailable.');
  }
  const journals: AssetReadyJournal[] = [];
  for await (const [, handle] of (ready as EnumerableDirectoryHandle).entries()) {
    if (handle.kind !== 'file') continue;
    const parsed = parseAssetReadyJournal(
      JSON.parse(await (await (handle as FileSystemFileHandle).getFile()).text()) as unknown
    );
    if (parsed) journals.push(parsed);
  }
  return journals.sort((left, right) => left.createdAt - right.createdAt);
}

export async function readAssetFile(
  ref: AssetRef,
  filename: string,
  options: AssetOpfsOptions = {}
): Promise<File> {
  const objects = await getAssetDirectory(options, OBJECTS_DIRECTORY_NAME, false);
  if (!objects) throw new Error(`Asset object is missing: ${ref.assetId}.`);
  const handle = await objects.getFileHandle(ref.assetId);
  const source = await handle.getFile();
  if (source.size !== ref.size) throw new Error(`Asset object size mismatch: ${ref.assetId}.`);
  return new File([source], filename, { lastModified: source.lastModified, type: ref.mimeType });
}

export async function deleteAssetObject(
  assetId: string,
  options: AssetOpfsOptions = {}
): Promise<void> {
  const objects = await getAssetDirectory(options, OBJECTS_DIRECTORY_NAME, false);
  if (objects) await removeIfPresent(objects, assetId);
  readyProtectedAssetIds.delete(assetId);
}

export function isAssetReadyProtected(assetId: string): boolean {
  return readyProtectedAssetIds.has(assetId);
}

export function releaseAssetReadyProtection(assetIds: readonly string[]): void {
  assetIds.forEach((assetId) => readyProtectedAssetIds.delete(assetId));
}

export async function discardPreparedAsset(
  assetId: string,
  options: AssetOpfsOptions = {}
): Promise<void> {
  const [objects, writing] = await Promise.all([
    getAssetDirectory(options, OBJECTS_DIRECTORY_NAME, false),
    getAssetDirectory(options, WRITING_DIRECTORY_NAME, false),
  ]);
  if (objects) await removeIfPresent(objects, assetId);
  if (writing) await removeIfPresent(writing, assetId);
  await releaseWriterLock(assetId);
}

export async function collectQuiescentWritingObjects(
  options: AssetOpfsOptions = {}
): Promise<number> {
  const writing = await getAssetDirectory(options, WRITING_DIRECTORY_NAME, false);
  if (!writing) return 0;
  if (typeof Reflect.get(writing, 'entries') !== 'function') {
    throw new Error('Asset writing-marker enumeration is unavailable.');
  }
  const requestLock = options.requestExclusiveLock ?? defaultRequestExclusiveLock;
  const readyAssetIds = new Set(
    (await listReadyJournals(options)).flatMap((journal) =>
      journal.assetRefs.map((ref) => ref.assetId)
    )
  );
  let removed = 0;
  for await (const [assetId, handle] of (writing as EnumerableDirectoryHandle).entries()) {
    if (handle.kind !== 'file') continue;
    if (readyAssetIds.has(assetId)) {
      await removeIfPresent(writing, assetId);
      continue;
    }
    await requestLock(assetLockName(assetId), { ifAvailable: true }, async (locked) => {
      if (!locked) return;
      await deleteAssetObject(assetId, options);
      await removeIfPresent(writing, assetId);
      removed += 1;
    });
  }
  return removed;
}

export async function eraseAssetStorage(options: AssetOpfsOptions = {}): Promise<number> {
  const origin = await (options.getOriginRoot ?? defaultGetOriginRoot)();
  let removed = 0;
  for (const name of [ASSET_ROOT_DIRECTORY_NAME, LEGACY_RECORDING_STAGING_DIRECTORY_NAME]) {
    try {
      await origin.removeEntry(name, { recursive: true });
      removed += 1;
    } catch (error) {
      if (readErrorName(error) !== 'NotFoundError') throw error;
    }
  }
  readyProtectedAssetIds.clear();
  return removed;
}

export async function countAssetStorageRoots(options: AssetOpfsOptions = {}): Promise<number> {
  const origin = await (options.getOriginRoot ?? defaultGetOriginRoot)();
  let count = 0;
  for (const name of [ASSET_ROOT_DIRECTORY_NAME, LEGACY_RECORDING_STAGING_DIRECTORY_NAME]) {
    try {
      await origin.getDirectoryHandle(name);
      count += 1;
    } catch (error) {
      if (readErrorName(error) !== 'NotFoundError') throw error;
    }
  }
  return count;
}
