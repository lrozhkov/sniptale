import {
  discardPreparedAsset,
  readAssetFile,
  runWithDurableAssetOperation,
  type AssetRef,
} from '../../composition/persistence/assets';
import { createPreparedReplicaJournal } from '../../composition/persistence/sync-capture/replica-publication';
import { stageRootObjects, type StagedArchiveObject } from '../media-hub-backup/v6/staging';
import { digestBackupObject } from '../media-hub-backup/v6/shared-objects';
import { syncCatalogRootKey, type CatalogOperation } from './catalog-graph';
import type { scanSyncCatalog } from './catalog';
import {
  parsePortableSyncRoot,
  preparePortableReplica,
  type PortableReplicaAdmission,
} from './prepared-root';
import { SyncRemoteError, type SyncRemoteStore } from './remote-store';
import { createSyncAttempt, hashSyncText, parseSyncOperationText } from './wire-record';

type Catalog = Awaited<ReturnType<typeof scanSyncCatalog>>;
function check(condition: unknown): asserts condition {
  if (!condition) throw new Error('Sync root is not ready for native preparation.');
}
function selectedOperation(
  catalog: Catalog,
  rootKind: 'media' | 'video-project',
  rootId: string
): CatalogOperation {
  // Unreadable manifests have unknown root ownership, so they cannot authorize an import.
  check(catalog.invalid.length === 0);
  const root = catalog.roots.get(syncCatalogRootKey(rootKind, rootId));
  check(
    root &&
      !root.deleted &&
      !root.blocked &&
      !root.conflict &&
      root.heads.length === 1 &&
      root.unavailableDependencies.length === 0
  );
  const operation = catalog.operations.get(root.heads[0]!);
  check(
    operation && operation.operation.rootKind === rootKind && operation.operation.rootId === rootId
  );
  return structuredClone(operation);
}
async function hashFile(file: Blob, signal: AbortSignal) {
  return digestBackupObject(
    { size: file.size, pipeTo: (sink) => file.stream().pipeTo(sink, { signal }) },
    signal
  );
}
async function cleanup(staged: StagedArchiveObject[], error: unknown): Promise<never> {
  const results = await Promise.allSettled(
    staged.map((item) => discardPreparedAsset(item.ref.assetId))
  );
  const failures = results.flatMap((result) =>
    result.status === 'rejected' ? [result.reason as unknown] : []
  );
  if (failures.length)
    throw new AggregateError([error, ...failures], 'Sync staging cleanup failed.');
  throw error;
}

/** Prepare one selected live root. The existing durable journal owns publication and recovery. */
export async function prepareCatalogReplica(args: {
  remote: SyncRemoteStore;
  catalog: Catalog;
  rootKind: 'media' | 'video-project';
  rootId: string;
  admission: Omit<PortableReplicaAdmission, 'operationId' | 'sourceDigest'>;
  signal: AbortSignal;
}) {
  const selected = selectedOperation(args.catalog, args.rootKind, args.rootId);
  const admission = structuredClone(args.admission);
  check(JSON.stringify(selected.operation) === selected.operationText);
  const dependencySources = new Map(
    selected.operation.dependencies.map((dependency) => [
      dependency.mediaId,
      selectedOperation(args.catalog, 'media', dependency.mediaId),
    ])
  );
  check(
    JSON.stringify([...dependencySources.keys()].sort()) ===
      JSON.stringify(admission.dependencies.map((dependency) => dependency.entry.id).sort())
  );
  args.signal.throwIfAborted();
  const operation = await parseSyncOperationText(selected.operationText);
  check(
    operation.operationId === selected.operation.operationId &&
      operation.envelope &&
      operation.kind !== 'delete'
  );
  const parsed = await parsePortableSyncRoot(operation.envelope);
  const selectedIds =
    parsed.kind === 'media'
      ? [parsed.metadata.originalObjectId]
      : parsed.metadata.projectAssets
          .filter((asset) => !asset.libraryMediaId)
          .map((asset) => asset.objectId);
  const editing = parsed.envelope.objects.filter((object) => selectedIds.includes(object.objectId));
  // Use the existing backup operation/recovery boundary while staged objects lack journal claims.
  return runWithDurableAssetOperation(async () => {
    const borrowedRefs = new Map<string, AssetRef>();
    const checkedDependencies = new Map<string, { ref: AssetRef; sha256: string }>();
    for (const [mediaId, source] of dependencySources) {
      const dependency = admission.dependencies.find((item) => item.entry.id === mediaId);
      const mediaOperation = await parseSyncOperationText(source.operationText);
      check(dependency && mediaOperation.envelope && mediaOperation.rootId === mediaId);
      const media = await parsePortableSyncRoot(mediaOperation.envelope);
      check(media.kind === 'media');
      const object = media.envelope.objects.find(
        (item) => item.objectId === media.metadata.originalObjectId
      );
      const digest = mediaOperation.objects.find(
        (item) => item.objectId === media.metadata.originalObjectId
      );
      check(
        object &&
          digest &&
          dependency.ref.size === object.size &&
          dependency.ref.mimeType === object.mimeType
      );
      check(
        (await hashFile(await readAssetFile(dependency.ref, object.filename), args.signal)) ===
          digest.sha256
      );
      checkedDependencies.set(mediaId, { ref: dependency.ref, sha256: digest.sha256 });
    }
    if (parsed.kind === 'video-project') {
      for (const asset of parsed.metadata.projectAssets.filter((item) => item.libraryMediaId)) {
        const dependency = asset.libraryMediaId
          ? checkedDependencies.get(asset.libraryMediaId)
          : undefined;
        const digest = operation.objects.find((item) => item.objectId === asset.objectId);
        const object = parsed.envelope.objects.find((item) => item.objectId === asset.objectId);
        check(
          dependency &&
            digest &&
            object &&
            dependency.ref.size === object.size &&
            dependency.sha256 === digest.sha256
        );
        borrowedRefs.set(asset.objectId, dependency.ref);
      }
    }
    for (const [index, attempt] of selected.attempts.entries()) {
      args.signal.throwIfAborted();
      const physical = await createSyncAttempt(
        selected.operationText,
        attempt.attemptId,
        attempt.objects
      );
      check(
        physical.recordKey === attempt.recordKey &&
          JSON.stringify(physical.objects) === JSON.stringify(attempt.objects)
      );
      let staged: StagedArchiveObject[] = [];
      try {
        staged = await stageRootObjects({
          objects: editing,
          expectedSha256: new Map(
            editing.map((object) => {
              const expected = operation.objects.find((item) => item.objectId === object.objectId);
              check(expected);
              return [object.objectId, expected.sha256];
            })
          ),
          signal: args.signal,
          async readObject(object) {
            const binding = physical.objects.find((item) => item.objectId === object.objectId);
            check(binding);
            const stream = await args.remote.read(binding.remoteKey, args.signal);
            return { pipeTo: (sink, signal) => stream.pipeTo(sink, signal ? { signal } : {}) };
          },
        });
        const refs = new Map([
          ...borrowedRefs,
          ...staged.map((item): [string, AssetRef] => [item.objectId, item.ref]),
        ]);
        const payload = await preparePortableReplica({
          envelope: parsed.envelope,
          verifiedObjects: refs,
          senderDependencies: operation.dependencies,
          admission: {
            ...admission,
            operationId: operation.operationId,
            sourceDigest: hashSyncText(selected.operationText),
          },
        });
        return await createPreparedReplicaJournal(payload);
      } catch (error) {
        if (
          error instanceof SyncRemoteError &&
          error.code === 'missing' &&
          index + 1 < selected.attempts.length
        ) {
          // stageRootObjects already discards a partial attempt before propagating a missing object.
          check(staged.length === 0);
          continue;
        }
        return cleanup(staged, error);
      }
    }
    throw new Error('No physical sync attempt is available.');
  });
}
