import { parseAssetRef } from '../../composition/persistence/assets/guards';
import { initDB } from '../../composition/persistence/infrastructure/indexed-db/core';
import {
  ASSET_RESIDENCY_STORE,
  MEDIA_LIBRARY_STORE,
  VIDEO_PROJECTS_STORE,
  SCENARIO_PROJECTS_STORE,
  VIDEO_WORKSPACES_STORE,
} from '../../composition/persistence/infrastructure/indexed-db/core.stores';
import { loadSyncConnection } from '../../composition/persistence/remote-connection/store';
import {
  sameConnectionScope,
  type SyncConnectionScope,
} from '../../composition/persistence/remote-connection/model';
import {
  runWithPersistenceMutationTransition,
  type PersistenceMutationTransitionPermit,
} from '../../composition/persistence/infrastructure/mutation-barrier';
import {
  NATIVE_EDITING_RESOURCE_STORES,
  collectNativeEditingResources,
  type NativeEditingRoot,
} from '../../composition/persistence/assets/editing-resources';
import { readAssetResidencyCopyInTransaction } from '../../composition/persistence/assets/residency';
import {
  assetResidencyCopyId,
  type AssetResidencyCopy,
} from '../../composition/persistence/assets/residency-records';
import { parseMediaLibraryEntry } from '../../composition/persistence/media-library/read-guards';
import type { MediaLibraryEntry } from '../../composition/persistence/media-library/contracts';
import type {
  SyncConnectionBinding,
  SyncConnectionIdentity,
} from '../../composition/persistence/remote-connection/model';
import type { AssetRef } from '../../composition/persistence/assets/contracts';
import { runWithAssetResourceRead } from '../../composition/persistence/assets/resource-sessions';
import {
  readAssetFile,
  discardPreparedAsset,
  MissingAssetObjectError,
  AssetObjectSizeMismatchError,
} from '../../composition/persistence/assets';
import { restoreVerifiedAssetObject } from '../../composition/persistence/assets/residency-maintenance';
import { stageRootObjects } from '../media-hub-backup/v6/staging';
import type { SyncRemoteStore } from './remote-store';

type Database = Awaited<ReturnType<typeof initDB>>;
type Resource =
  | { kind: 'opfs'; ref: AssetRef; copy: AssetResidencyCopy | null }
  | { kind: 'inline-image'; media: MediaLibraryEntry; copy: AssetResidencyCopy | null };
const STORES = [...new Set([...NATIVE_EDITING_RESOURCE_STORES, ASSET_RESIDENCY_STORE])];

async function loadResources(
  db: Database,
  root: NativeEditingRoot,
  purpose: 'editing' | 'backup' = 'editing'
): Promise<Resource[]> {
  const tx = db.transaction(STORES, 'readonly');
  const closure = await collectNativeEditingResources(tx, root, purpose);
  const resources: Resource[] = [];
  for (const ref of closure.refs)
    resources.push({
      kind: 'opfs',
      ref,
      copy: await readAssetResidencyCopyInTransaction(
        tx,
        assetResidencyCopyId({ kind: 'opfs', ref })
      ),
    });
  for (const mediaId of closure.inlineMediaIds) {
    const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
    if (!media || media.source.kind !== 'screenshot')
      throw new Error('Native editing source changed.');
    resources.push({
      kind: 'inline-image',
      media,
      copy: await readAssetResidencyCopyInTransaction(
        tx,
        assetResidencyCopyId({ kind: 'inline-image', mediaId })
      ),
    });
  }
  await tx.done;
  return resources;
}

async function localBytes(resource: Resource): Promise<Blob | null> {
  if (resource.kind === 'inline-image') return resource.media.blob ?? null;
  try {
    return await readAssetFile(resource.ref, resource.ref.assetId);
  } catch (error) {
    if (
      error instanceof MissingAssetObjectError ||
      (error instanceof AssetObjectSizeMismatchError && error.actualSize === 0) ||
      (error instanceof DOMException && error.name === 'NotFoundError')
    )
      return null;
    throw error;
  }
}

function recoveryCopy(resource: Resource, binding: SyncConnectionBinding): AssetResidencyCopy {
  const copy = resource.copy;
  if (
    !copy ||
    (copy.phase !== 'unloaded' && (copy.phase !== 'unloading' || copy.target.kind !== 'opfs')) ||
    copy.remote.binding.provider !== binding.provider ||
    copy.remote.binding.rootUrl !== binding.rootUrl ||
    copy.remote.binding.accountId !== binding.accountId ||
    copy.remote.binding.spaceId !== binding.spaceId ||
    copy.remote.binding.connectionGeneration !== binding.connectionGeneration ||
    copy.remote.binding.profileCreatedAt !== binding.profileCreatedAt
  )
    throw new Error('Native editing recovery binding is unavailable.');
  if (
    resource.kind === 'opfs'
      ? copy.target.kind !== 'opfs' ||
        JSON.stringify(copy.target.ref) !== JSON.stringify(parseAssetRef(resource.ref))
      : copy.target.kind !== 'inline-image' ||
        copy.target.mediaId !== resource.media.id ||
        copy.target.createdAt !== resource.media.createdAt ||
        copy.target.workspaceRevision !== (resource.media.workspaceRevision ?? 0) ||
        copy.target.size !== resource.media.size ||
        copy.target.mimeType !== resource.media.mimeType
  )
    throw new Error('Native editing recovery source changed.');
  return copy;
}

/** Metadata-only policy check. This function neither obtains originals nor changes native records. */
export async function hasUnloadedNativeEditingRoot(root: NativeEditingRoot): Promise<boolean> {
  const db = await initDB();
  return (await loadResources(db, root)).some(
    (resource) => resource.copy !== null && resource.copy.phase !== 'resident'
  );
}

/** Existing local creation and missing-document flows retain their own opening behavior. */
export async function needsNativeEditingPreparation(
  root: NativeEditingRoot,
  purpose: 'editing' | 'backup' = 'editing'
): Promise<boolean> {
  const db = await initDB();
  const store =
    root.rootKind === 'media'
      ? MEDIA_LIBRARY_STORE
      : root.rootKind === 'video-project'
        ? VIDEO_PROJECTS_STORE
        : root.rootKind === 'scenario-project'
          ? SCENARIO_PROJECTS_STORE
          : VIDEO_WORKSPACES_STORE;
  const tx = db.transaction([...new Set([store, MEDIA_LIBRARY_STORE])], 'readonly');
  let present = (await tx.objectStore(store).get(root.rootId)) !== undefined;
  if (!present && root.rootKind === 'video-review')
    present = (await tx.objectStore(MEDIA_LIBRARY_STORE).get(root.rootId)) !== undefined;
  await tx.done;
  return present && !(await isNativeEditingRootReady(root, purpose));
}

/** Local availability can admit an already committed editor opening without remote authorization or writes. */
export async function isNativeEditingRootReady(
  root: NativeEditingRoot,
  purpose: 'editing' | 'backup' = 'editing'
): Promise<boolean> {
  const db = await initDB();
  return runWithAssetResourceRead(async () => {
    for (const resource of await loadResources(db, root, purpose))
      if (!(await localBytes(resource))) return false;
    return true;
  });
}

/** Explicit foreground preparation. The native editor retains its own reader during activation and editing. */
export async function prepareNativeEditingRoot(args: {
  root: NativeEditingRoot;
  binding: SyncConnectionBinding;
  authorization: SyncConnectionIdentity;
  remote: SyncRemoteStore;
  signal: AbortSignal;
  purpose?: 'editing' | 'backup';
  onBytesRead?: (bytes: number) => void;
}): Promise<{ downloaded: number }> {
  const root = structuredClone(args.root);
  const binding = structuredClone(args.binding);
  const authorization = structuredClone(args.authorization);
  const db = await initDB();
  return runWithPersistenceMutationTransition((transition) =>
    runWithAssetResourceRead(async () => {
      args.signal.throwIfAborted();
      const resources = await loadResources(db, root, args.purpose);
      let downloaded = 0;
      for (const resource of resources) {
        args.signal.throwIfAborted();
        const existing = await localBytes(resource);
        if (existing && (!resource.copy || resource.copy.phase === 'resident')) continue;
        const copy = recoveryCopy(resource, binding);
        const restore = async (sourceBlob: Blob) => {
          const result = await restoreVerifiedAssetObject(
            { copy, sourceBlob, authorization, signal: args.signal },
            { persistenceTransitionPermit: transition }
          );
          if (result === 'busy') throw new Error('Native editing source is busy.');
        };
        if (existing) {
          await restore(existing);
          continue;
        }
        const target = copy.target;
        const object = {
          objectId: 'residency-original',
          path: copy.remote.key,
          filename: resource.kind === 'opfs' ? resource.ref.assetId : resource.media.filename,
          mimeType: target.kind === 'opfs' ? target.ref.mimeType : target.mimeType,
          size: target.kind === 'opfs' ? target.ref.size : target.size,
        };
        const staged = await stageRootObjects({
          objects: [object],
          expectedSha256: new Map([[object.objectId, copy.remote.sha256]]),
          signal: args.signal,
          transitionPermit: transition,
          ...(args.onBytesRead ? { onBytesRead: (bytes) => args.onBytesRead?.(bytes) } : {}),
          async readObject() {
            const stream = await args.remote.read(copy.remote.key, args.signal);
            return { pipeTo: (sink, signal) => stream.pipeTo(sink, signal ? { signal } : {}) };
          },
        });
        let failed = false;
        let failure: unknown;
        try {
          const source = staged[0];
          if (!source || staged.length !== 1)
            throw new Error('Native editing staging is incomplete.');
          await restore(await readAssetFile(source.ref, object.filename));
          downloaded++;
        } catch (error) {
          failed = true;
          failure = error;
        }
        const cleanup = await Promise.allSettled(
          staged.map((item) => discardPreparedAsset(item.ref.assetId))
        );
        const failures: unknown[] = [];
        for (const result of cleanup)
          if (result.status === 'rejected') failures.push(result.reason);
        if (failures.length)
          throw new AggregateError(
            [...(failed ? [failure] : []), ...failures],
            'Native editing staging cleanup failed.'
          );
        if (failed) throw failure;
      }
      // A current closure with missing dependencies cannot be reported ready after a concurrent native edit.
      for (const resource of await loadResources(db, root, args.purpose)) {
        args.signal.throwIfAborted();
        if (!(await localBytes(resource)))
          throw new Error('Native editing dependencies changed during preparation.');
      }
      args.signal.throwIfAborted();
      return { downloaded };
    })
  );
}

/** Reuse an incoming checked staging body to recover a shared original, without another GET or new native identity. */
export async function restoreStagedNativeOriginal(args: {
  ref: AssetRef;
  sourceRef: AssetRef;
  sha256: string;
  scope: SyncConnectionScope;
  transitionPermit: PersistenceMutationTransitionPermit;
  signal: AbortSignal;
}): Promise<boolean> {
  if (args.ref.assetId === args.sourceRef.assetId)
    throw new Error('Native original recovery requires a separate staging identity.');
  const db = await initDB();
  const tx = db.transaction([ASSET_RESIDENCY_STORE], 'readonly');
  const copy = await readAssetResidencyCopyInTransaction(
    tx,
    assetResidencyCopyId({ kind: 'opfs', ref: args.ref })
  );
  await tx.done;
  if (
    !copy ||
    copy.target.kind !== 'opfs' ||
    (copy.phase !== 'unloaded' && copy.phase !== 'unloading') ||
    copy.remote.sha256 !== args.sha256
  )
    return false;
  const connection = await loadSyncConnection();
  if (
    !connection ||
    connection.phase !== 'active' ||
    !sameConnectionScope(connection.binding, args.scope)
  )
    throw new Error('Native original recovery authorization changed.');
  const checked = recoveryCopy({ kind: 'opfs', ref: args.ref, copy }, connection.binding);
  const sourceBlob = await readAssetFile(args.sourceRef, args.ref.assetId);
  await restoreVerifiedAssetObject(
    { copy: checked, sourceBlob, authorization: connection.identity, signal: args.signal },
    { persistenceTransitionPermit: args.transitionPermit }
  );
  return true;
}
