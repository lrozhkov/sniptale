// policyStateIds: video-recording-control-lease, persistent-data-erasure-lease - active
// recording writers hold exclusive object locks, and privacy erasure invalidates their local state.
import type {
  AssetObjectWriter,
  AssetReadyJournal,
  AssetRef,
  PreparedAssetObject,
} from './contracts';
import { parseAssetReadyJournal } from './guards';
import {
  acquirePersistenceMutationTransition,
  isActivePersistenceMutationTransitionPermit,
  type PersistenceMutationTransitionLease,
  type PersistenceMutationTransitionPermit,
} from '../infrastructure/mutation-barrier';

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
  persistenceTransitionPermit?: PersistenceMutationTransitionPermit;
}

type RequestExclusiveAssetLock = (
  name: string,
  options: { ifAvailable: boolean },
  callback: (acquired: boolean) => Promise<void>
) => Promise<void>;

const activeWriterLockReleases = new Map<string, () => Promise<void>>();
const activePublicationTransitionLeases = new Map<string, PersistenceMutationTransitionLease>();
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

async function releasePublicationTransition(assetId: string): Promise<void> {
  const lease = activePublicationTransitionLeases.get(assetId);
  if (!lease || !activePublicationTransitionLeases.delete(assetId)) return;
  await lease.release();
}

export async function releaseAssetPublicationTransitions(
  assetIds: readonly string[]
): Promise<void> {
  await Promise.all(assetIds.map(releasePublicationTransition));
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
  let writable: FileSystemWritableFileStream | null = null;
  try {
    const handle = await directory.getFileHandle(name, { create: true });
    writable = await handle.createWritable({ keepExistingData: false });
    await writable.write(text);
    await writable.close();
  } catch (error) {
    const cleanup = await Promise.allSettled([
      ...(writable ? [writable.abort()] : []),
      removeIfPresent(directory, name),
    ]);
    const cleanupFailures = cleanup.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
    if (cleanupFailures.length > 0) {
      throw new AggregateError(
        [error, ...cleanupFailures],
        `Failed to write and clean up OPFS marker: ${name}.`,
        { cause: error }
      );
    }
    throw error;
  }
}

interface InitializedAssetWriter {
  objectHandle: FileSystemFileHandle;
  objects: FileSystemDirectoryHandle;
  writable: FileSystemWritableFileStream;
  writing: FileSystemDirectoryHandle;
}

async function acquireAssetWriterAdmission(
  assetId: string,
  options: AssetOpfsOptions
): Promise<void> {
  if (
    options.persistenceTransitionPermit &&
    !isActivePersistenceMutationTransitionPermit(options.persistenceTransitionPermit)
  ) {
    throw new Error('Persistence transition permit is not active.');
  }
  const transitionLease = options.persistenceTransitionPermit
    ? null
    : await acquirePersistenceMutationTransition();
  try {
    await acquireWriterLock(assetId, options);
    if (!transitionLease) return;
    if (activePublicationTransitionLeases.has(assetId)) {
      await releaseWriterLock(assetId);
      throw new Error(`Asset publication is already active: ${assetId}.`);
    }
    activePublicationTransitionLeases.set(assetId, transitionLease);
  } catch (error) {
    await transitionLease?.release().catch(() => undefined);
    throw error;
  }
}

async function cleanupFailedAssetWriterSetup(
  assetId: string,
  directories: {
    objects?: FileSystemDirectoryHandle;
    writing?: FileSystemDirectoryHandle;
  } = {}
): Promise<unknown[]> {
  const cleanup = await Promise.allSettled([
    ...(directories.objects ? [removeIfPresent(directories.objects, assetId)] : []),
    ...(directories.writing ? [removeIfPresent(directories.writing, assetId)] : []),
    releaseWriterLock(assetId),
    releasePublicationTransition(assetId),
  ]);
  return cleanup.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
}

function throwAssetWriterSetupFailure(
  assetId: string,
  error: unknown,
  cleanupFailures: readonly unknown[]
): never {
  if (cleanupFailures.length === 0) throw error;
  throw new AggregateError(
    [error, ...cleanupFailures],
    `Failed to initialize and clean up asset object: ${assetId}.`
  );
}

async function initializeAssetWriter(
  assetId: string,
  options: AssetOpfsOptions
): Promise<InitializedAssetWriter> {
  await acquireAssetWriterAdmission(assetId, options);
  let objects: FileSystemDirectoryHandle | null = null;
  let writing: FileSystemDirectoryHandle | null = null;
  try {
    const directoryResults = await Promise.allSettled([
      getAssetDirectory(options, OBJECTS_DIRECTORY_NAME, true),
      getAssetDirectory(options, WRITING_DIRECTORY_NAME, true),
    ]);
    objects = directoryResults[0].status === 'fulfilled' ? directoryResults[0].value : null;
    writing = directoryResults[1].status === 'fulfilled' ? directoryResults[1].value : null;
    const directoryFailures = directoryResults.flatMap((result) =>
      result.status === 'rejected' ? [result.reason as unknown] : []
    );
    if (directoryFailures.length > 0) {
      throw new AggregateError(directoryFailures, 'Failed to create asset directories.');
    }
    if (!objects || !writing) throw new Error('Unable to create asset directories.');
    await writeTextFile(writing, assetId, JSON.stringify({ assetId, createdAt: Date.now() }));
  } catch (error) {
    throwAssetWriterSetupFailure(
      assetId,
      error,
      await cleanupFailedAssetWriterSetup(assetId, {
        ...(objects ? { objects } : {}),
        ...(writing ? { writing } : {}),
      })
    );
  }
  try {
    const objectHandle = await objects.getFileHandle(assetId, { create: true });
    const writable = await objectHandle.createWritable({ keepExistingData: false });
    return { objectHandle, objects, writable, writing };
  } catch (error) {
    throwAssetWriterSetupFailure(
      assetId,
      error,
      await cleanupFailedAssetWriterSetup(assetId, { objects, writing })
    );
  }
}

export async function createAssetObjectWriter(
  input: { assetId?: string; mimeType: string },
  options: AssetOpfsOptions = {}
): Promise<AssetObjectWriter> {
  if (input.mimeType.trim().length === 0) throw new Error('Asset MIME type must not be empty.');
  const assetId = input.assetId ?? (options.createId ?? defaultCreateId)();
  const { objectHandle, objects, writable, writing } = await initializeAssetWriter(
    assetId,
    options
  );
  let phase: 'aborted' | 'finalized' | 'open' = 'open';
  let writtenBytes = 0;
  return {
    assetId,
    async abort() {
      if (phase === 'aborted') return;
      const wasOpen = phase === 'open';
      phase = 'aborted';
      const failures: unknown[] = [];
      if (wasOpen) {
        try {
          await writable.abort();
        } catch (error) {
          failures.push(error);
        }
      }
      const cleanup = await Promise.allSettled([
        removeIfPresent(objects, assetId),
        removeIfPresent(writing, assetId),
        releaseWriterLock(assetId),
        releasePublicationTransition(assetId),
      ]);
      for (const result of cleanup) {
        if (result.status === 'rejected') failures.push(result.reason as unknown);
      }
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
        phase = 'aborted';
        const mismatch = new Error('Finalized asset size does not match streamed bytes.');
        const cleanup = await Promise.allSettled([
          removeIfPresent(objects, assetId),
          removeIfPresent(writing, assetId),
          releaseWriterLock(assetId),
          releasePublicationTransition(assetId),
        ]);
        const failures = cleanup.flatMap((result) =>
          result.status === 'rejected' ? [result.reason as unknown] : []
        );
        if (failures.length > 0) {
          throw new AggregateError(
            [mismatch, ...failures],
            'Finalized asset validation and cleanup failed.',
            { cause: mismatch }
          );
        }
        throw mismatch;
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
    let abortError: unknown;
    try {
      await writer.abort();
    } catch (cleanupError) {
      abortError = cleanupError;
    }
    if (abortError !== undefined) {
      throw new AggregateError(
        [error, abortError],
        'Asset Blob write failed and partial OPFS cleanup was incomplete.',
        { cause: error }
      );
    }
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

export async function runWithAssetObjectLockIfAvailable<T>(
  assetId: string,
  operation: () => Promise<T>,
  options: AssetOpfsOptions = {}
): Promise<T | undefined> {
  let result: T | undefined;
  const requestLock = options.requestExclusiveLock ?? defaultRequestExclusiveLock;
  await requestLock(assetLockName(assetId), { ifAvailable: true }, async (locked) => {
    if (locked) result = await operation();
  });
  return result;
}

export async function listAssetObjectIds(options: AssetOpfsOptions = {}): Promise<string[]> {
  const objects = await getAssetDirectory(options, OBJECTS_DIRECTORY_NAME, false);
  if (!objects) return [];
  if (typeof Reflect.get(objects, 'entries') !== 'function') {
    throw new Error('Asset object enumeration is unavailable.');
  }
  const assetIds: string[] = [];
  for await (const [assetId, handle] of (objects as EnumerableDirectoryHandle).entries()) {
    if (handle.kind === 'file') assetIds.push(assetId);
  }
  return assetIds.sort();
}

export async function listWritingAssetIds(options: AssetOpfsOptions = {}): Promise<string[]> {
  const writing = await getAssetDirectory(options, WRITING_DIRECTORY_NAME, false);
  if (!writing) return [];
  if (typeof Reflect.get(writing, 'entries') !== 'function') {
    throw new Error('Asset writing-marker enumeration is unavailable.');
  }
  const assetIds: string[] = [];
  for await (const [assetId, handle] of (writing as EnumerableDirectoryHandle).entries()) {
    if (handle.kind === 'file') assetIds.push(assetId);
  }
  return assetIds.sort();
}

export function isAssetReadyProtected(assetId: string): boolean {
  return readyProtectedAssetIds.has(assetId);
}

export async function releaseAssetReadyProtection(assetIds: readonly string[]): Promise<void> {
  assetIds.forEach((assetId) => readyProtectedAssetIds.delete(assetId));
  const results = await Promise.allSettled(
    assetIds.flatMap((assetId) => [
      releaseWriterLock(assetId),
      releasePublicationTransition(assetId),
    ])
  );
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (failures.length > 0) {
    throw new AggregateError(failures, 'Failed to release asset ready protection.');
  }
}

export async function discardPreparedAsset(
  assetId: string,
  options: AssetOpfsOptions = {}
): Promise<void> {
  const failures: unknown[] = [];
  let objects: FileSystemDirectoryHandle | null = null;
  let writing: FileSystemDirectoryHandle | null = null;
  const [objectsResult, writingResult] = await Promise.allSettled([
    getAssetDirectory(options, OBJECTS_DIRECTORY_NAME, false),
    getAssetDirectory(options, WRITING_DIRECTORY_NAME, false),
  ]);
  if (objectsResult.status === 'fulfilled') objects = objectsResult.value;
  else failures.push(objectsResult.reason as unknown);
  if (writingResult.status === 'fulfilled') writing = writingResult.value;
  else failures.push(writingResult.reason as unknown);
  const cleanupResults = await Promise.allSettled([
    ...(objects ? [removeIfPresent(objects, assetId)] : []),
    ...(writing ? [removeIfPresent(writing, assetId)] : []),
    releaseWriterLock(assetId),
    releasePublicationTransition(assetId),
  ]);
  for (const result of cleanupResults) {
    if (result.status === 'rejected') failures.push(result.reason as unknown);
  }
  if (failures.length > 0) {
    throw new AggregateError(failures, `Unable to discard prepared asset: ${assetId}.`);
  }
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
  let removed = 0;
  for await (const [assetId, handle] of (writing as EnumerableDirectoryHandle).entries()) {
    if (handle.kind !== 'file') continue;
    await requestLock(assetLockName(assetId), { ifAvailable: true }, async (locked) => {
      if (!locked) return;
      const readyAssetIds = new Set(
        (await listReadyJournals(options)).flatMap((journal) =>
          journal.assetRefs.map((ref) => ref.assetId)
        )
      );
      if (readyAssetIds.has(assetId)) {
        await removeIfPresent(writing, assetId);
        return;
      }
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
