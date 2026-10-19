import { assertScenarioSpeechScope } from '../scenario/speech-scope';
import { sameReviewSourceIdentity } from '../../../features/video/review/source-identity';
import { readLibrarySceneSource } from '../projects/library-scene-source';
import { readVideoWorkspace } from '../review-workspaces/store';
import {
  replayReviewHistory,
  reviewDocumentBaseline,
} from '../../../features/video/review/document';
import {
  AUDIO_OUTPUT_MAX_BYTES,
  AUDIO_STAGING_TTL_MS,
  isAudioStagingId,
  isAudioSourceJobScope,
  isProjectAudioJobScope,
  isProjectAudioTextJobScope,
  isScenarioSpeechScope,
  parseAudioJobScope,
  sameAudioJobScope,
  type AudioJobScope,
  type AudioStagedHandle,
} from '../../../contracts/ai/audio';
import { matchesReviewTextScope } from '../../../features/video/review/text-document';
import { readVideoProjectAudioTarget } from '../projects/audio-source';
import { readVideoProjectTextAudioTarget } from '../projects/text-audio-scope';
import { runWithPersistenceMutationTransition } from '../infrastructure/mutation-barrier';
import { ASSET_ROOT_DIRECTORY_NAME } from './opfs-store';

const DIRECTORY = 'audio-jobs';

async function directory(create: boolean): Promise<FileSystemDirectoryHandle> {
  const origin = await navigator.storage.getDirectory();
  const assets = await origin.getDirectoryHandle(ASSET_ROOT_DIRECTORY_NAME, { create });
  return assets.getDirectoryHandle(DIRECTORY, { create });
}
function validateId(id: string): void {
  if (!isAudioStagingId(id)) throw new Error('Invalid audio staging identity.');
}
async function remove(directoryHandle: FileSystemDirectoryHandle, id: string): Promise<void> {
  try {
    await directoryHandle.removeEntry(id);
  } catch (error) {
    if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
  }
}

/** Opportunistic crash recovery; no wakeup or persistent job is created. */
async function collectExpired(root: FileSystemDirectoryHandle): Promise<void> {
  let inspected = 0;
  for await (const [name, handle] of root.entries()) {
    if (!name.endsWith('.json') || handle.kind !== 'file' || !isAudioStagingId(name.slice(0, -5)))
      continue;
    if (++inspected > 256) break;
    const id = name.slice(0, -5);
    await navigator.locks.request(
      `sniptale:audio-staging:${id}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) return;
        const file = await (await root.getFileHandle(name)).getFile();
        let expired = file.size === 0 || file.size > 4096;
        if (!expired) {
          try {
            const value: unknown = JSON.parse(await file.text());
            const expiry: unknown =
              typeof value === 'object' && value !== null ? Reflect.get(value, 'expiresAt') : null;
            expired =
              typeof expiry !== 'number' || !Number.isFinite(expiry) || expiry <= Date.now();
          } catch {
            expired = true;
          }
        }
        if (expired) {
          await remove(root, id);
          await remove(root, name);
        }
      }
    );
  }
}

async function assertScopeExists(scope: AudioJobScope): Promise<void> {
  if (isProjectAudioJobScope(scope)) {
    if (isProjectAudioTextJobScope(scope)) await readVideoProjectTextAudioTarget(scope);
    else await readVideoProjectAudioTarget(scope);
    return;
  }
  if (isScenarioSpeechScope(scope)) {
    await assertScenarioSpeechScope(scope);
    return;
  }
  const snapshot = await readVideoWorkspace(scope.workspaceId);
  const workspace = snapshot?.workspace;
  if (!workspace || workspace.revision !== scope.workspaceRevision)
    throw new Error('Stale audio staging scope.');
  const document = replayReviewHistory(
    workspace.history,
    workspace.cursor,
    workspace.source,
    reviewDocumentBaseline(workspace)
  );
  if (!isAudioSourceJobScope(scope)) {
    const fragment = document.advancedContent.text?.fragments.find(
      (entry) => entry.id === scope.target.fragmentId
    );
    if (!matchesReviewTextScope(fragment, scope)) throw new Error('Stale audio staging scope.');
    return;
  }
  const target = scope.target;
  if (target.kind === 'original') {
    if (workspace.aggregateId !== scope.workspaceId || workspace.sourceAssetId !== scope.assetId)
      throw new Error('Missing audio staging scope.');
    const source = await readLibrarySceneSource(workspace.aggregateId, 'video');
    if (!sameReviewSourceIdentity(source.ref, workspace.sourceAssetId, workspace.source))
      throw new Error('Missing audio staging scope.');
    return;
  }
  if (
    !document.advancedContent.audio.voiceover.some(
      (clip) => clip.id === target.clipId && clip.assetId === scope.assetId
    )
  )
    throw new Error('Missing audio staging scope.');
}

/** Disposable bytes only; never an asset reference or a publication candidate. */
export async function writeAudioStaging(args: {
  id: string;
  scope: AudioJobScope;
  blob: Blob;
  signal?: AbortSignal;
}): Promise<AudioStagedHandle> {
  validateId(args.id);
  const mimeType = args.blob.type;
  if (
    (mimeType !== 'audio/wav' && mimeType !== 'audio/mpeg') ||
    args.blob.size <= 0 ||
    args.blob.size > AUDIO_OUTPUT_MAX_BYTES ||
    !parseAudioJobScope(args.scope)
  )
    throw new Error('Invalid staged audio.');
  // Admit the database before taking a lease; a fresh read under the lease prevents post-erasure recreation.
  await assertScopeExists(args.scope);
  return runWithPersistenceMutationTransition(async () => {
    await assertScopeExists(args.scope);
    args.signal?.throwIfAborted();
    const root = await directory(true);
    await collectExpired(root);
    return navigator.locks.request(`sniptale:audio-staging:${args.id}`, async () => {
      args.signal?.throwIfAborted();
      if (isProjectAudioJobScope(args.scope)) await assertScopeExists(args.scope);
      let ownsFiles = false;
      let writable: FileSystemWritableFileStream | undefined;
      try {
        // A ticket is single-use, including after an interrupted write.
        try {
          await root.getFileHandle(`${args.id}.json`);
          throw new Error('Audio staging already exists.');
        } catch (error) {
          if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
        }
        ownsFiles = true;
        const metadata = await root.getFileHandle(`${args.id}.json`, { create: true });
        writable = await metadata.createWritable();
        await writable.write(
          JSON.stringify({
            scope: args.scope,
            mimeType,
            size: args.blob.size,
            expiresAt: Date.now() + AUDIO_STAGING_TTL_MS,
          })
        );
        await writable.close();
        writable = await (await root.getFileHandle(args.id, { create: true })).createWritable();
        const reader = args.blob.stream().getReader();
        try {
          for (;;) {
            args.signal?.throwIfAborted();
            const chunk = await reader.read();
            if (chunk.done) break;
            await writable.write(chunk.value);
          }
        } finally {
          reader.releaseLock();
        }
        args.signal?.throwIfAborted();
        await writable.close();
        if (isProjectAudioJobScope(args.scope)) await assertScopeExists(args.scope);
        return { id: args.id, mimeType, size: args.blob.size };
      } catch (error) {
        await writable?.abort().catch(() => undefined);
        if (ownsFiles) {
          await remove(root, args.id);
          await remove(root, `${args.id}.json`);
        }
        throw error;
      }
    });
  });
}

/** Scope metadata and actual byte size are revalidated on every cross-context read. */
export async function readAudioStaging(
  handle: AudioStagedHandle,
  scope: AudioJobScope
): Promise<File> {
  validateId(handle.id);
  if (isScenarioSpeechScope(scope)) await assertScenarioSpeechScope(scope);
  const root = await directory(false);
  return navigator.locks.request(`sniptale:audio-staging:${handle.id}`, async () => {
    if (isProjectAudioJobScope(scope)) await assertScopeExists(scope);
    const metadataFile = await (await root.getFileHandle(`${handle.id}.json`)).getFile();
    if (metadataFile.size > 4096) throw new Error('Invalid audio staging metadata.');
    const metadata: unknown = JSON.parse(await metadataFile.text());
    if (typeof metadata !== 'object' || metadata === null)
      throw new Error('Invalid audio staging metadata.');
    const storedScope = parseAudioJobScope(Reflect.get(metadata, 'scope'));
    const expiresAt: unknown = Reflect.get(metadata, 'expiresAt');
    const mimeType: unknown = Reflect.get(metadata, 'mimeType');
    const size: unknown = Reflect.get(metadata, 'size');
    if (
      !storedScope ||
      !sameAudioJobScope(storedScope, scope) ||
      typeof expiresAt !== 'number' ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= Date.now() ||
      (mimeType !== 'audio/wav' && mimeType !== 'audio/mpeg') ||
      typeof size !== 'number' ||
      size <= 0 ||
      size > AUDIO_OUTPUT_MAX_BYTES ||
      handle.mimeType !== mimeType ||
      handle.size !== size
    )
      throw new Error('Stale audio staging.');
    const file = await (await root.getFileHandle(handle.id)).getFile();
    if (file.size !== size) throw new Error('Incomplete audio staging.');
    if (isProjectAudioTextJobScope(scope)) await assertScopeExists(scope);
    if (isScenarioSpeechScope(scope)) await assertScenarioSpeechScope(scope);
    return new File([file], mimeType === 'audio/wav' ? 'audio.wav' : 'audio.mp3', {
      type: mimeType,
    });
  });
}

/** Removes only the issued temporary identity; never touches durable assets. */
export async function discardAudioStaging(
  handle: AudioStagedHandle,
  scope: AudioJobScope
): Promise<void> {
  validateId(handle.id);
  if (!parseAudioJobScope(scope)) throw new Error('Invalid audio scope.');
  await runWithPersistenceMutationTransition(async () => {
    let root: FileSystemDirectoryHandle;
    try {
      root = await directory(false);
    } catch (error) {
      if (error instanceof DOMException && error.name === 'NotFoundError') return;
      throw error;
    }
    await navigator.locks.request(`sniptale:audio-staging:${handle.id}`, async () => {
      try {
        const file = await (await root.getFileHandle(`${handle.id}.json`)).getFile();
        if (file.size > 4096) throw new Error('Invalid audio staging metadata.');
        const metadata: unknown = JSON.parse(await file.text());
        const storedScope =
          typeof metadata === 'object' && metadata !== null
            ? parseAudioJobScope(Reflect.get(metadata, 'scope'))
            : null;
        if (!storedScope || !sameAudioJobScope(storedScope, scope))
          throw new Error('Audio staging scope mismatch.');
      } catch (error) {
        if (!(error instanceof DOMException && error.name === 'NotFoundError')) throw error;
      }
      await remove(root, handle.id);
      await remove(root, `${handle.id}.json`);
    });
  });
}
