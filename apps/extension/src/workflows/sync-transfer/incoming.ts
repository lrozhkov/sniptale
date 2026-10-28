import type { CaptureRootKind } from '../../composition/persistence/sync-capture/contracts';
import {
  applyCatalogDeletionNative,
  type ApplyCatalogDeletionInput,
} from '../../composition/persistence/sync-capture/apply-deletion';
import {
  discardPreparedAsset,
  readAssetFile,
  runWithDurableAssetOperation,
  type AssetRef,
} from '../../composition/persistence/assets';
import { createPreparedReplicaJournal } from '../../composition/persistence/sync-capture/replica-publication';
import { loadMediaReplicaPredecessorRef } from '../../composition/persistence/sync-capture/apply-media';
import { runWithAssetResourceRead } from '../../composition/persistence/assets/resource-sessions';
import { stageRootObjects, type StagedArchiveObject } from '../media-hub-backup/v6/staging';
import { digestBackupObject } from '../media-hub-backup/v6/shared-objects';
import {
  syncCatalogRootKey,
  resolveSyncMediaDependency,
  type CatalogOperation,
} from './catalog-graph';
import type { scanSyncCatalog } from './catalog';
import {
  parsePortableSyncRoot,
  portableSyncEditingObjectIds,
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
  rootKind: CaptureRootKind,
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
async function checkedPredecessorOriginal(
  parsed: Extract<Awaited<ReturnType<typeof parsePortableSyncRoot>>, { kind: 'media' }>,
  operation: Awaited<ReturnType<typeof parseSyncOperationText>>,
  admission: Omit<PortableReplicaAdmission, 'operationId' | 'sourceDigest'>,
  signal: AbortSignal
): Promise<[string, AssetRef] | null> {
  if (admission.expectedLocalGeneration === 0) return null;
  const ref = await loadMediaReplicaPredecessorRef({
    spaceId: admission.spaceId,
    profileCreatedAt: admission.profileCreatedAt,
    connectionGeneration: admission.connectionGeneration,
    mediaId: parsed.metadata.entry.id,
    expectedLocalGeneration: admission.expectedLocalGeneration,
    expectedBasis: admission.expectedBasis,
  });
  const object = parsed.envelope.objects.find(
    (item) => item.objectId === parsed.metadata.originalObjectId
  );
  const digest = operation.objects.find(
    (item) => item.objectId === parsed.metadata.originalObjectId
  );
  check(object && digest);
  if (!ref || ref.size !== object.size || ref.mimeType !== object.mimeType) return null;
  const file = await readAssetFile(ref, object.filename);
  signal.throwIfAborted();
  return file.size === object.size &&
    file.type === object.mimeType &&
    (await hashFile(file, signal)) === digest.sha256
    ? [object.objectId, ref]
    : null;
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

async function selectReplicaPreparation(args: {
  remote: SyncRemoteStore;
  catalog: Catalog;
  rootKind: CaptureRootKind;
  rootId: string;
  admission: Omit<PortableReplicaAdmission, 'operationId' | 'sourceDigest'>;
  signal: AbortSignal;
}) {
  const selected = selectedOperation(args.catalog, args.rootKind, args.rootId);
  const admission = structuredClone(args.admission);
  check(selected.operation.spaceId === admission.spaceId);
  const ancestors = new Set<string>();
  const pending = [...selected.operation.parents];
  while (pending.length) {
    const id = pending.pop()!;
    if (ancestors.has(id)) continue;
    const ancestor = args.catalog.operations.get(id)?.operation;
    check(
      ancestor &&
        ancestor.spaceId === admission.spaceId &&
        ancestor.rootKind === args.rootKind &&
        ancestor.rootId === args.rootId
    );
    ancestors.add(id);
    pending.push(...ancestor.parents);
  }
  check(
    admission.expectedBasis.length === (admission.expectedLocalGeneration === 0 ? 0 : 1) &&
      admission.expectedBasis.every(
        (id) => ancestors.has(id) || id === selected.operation.operationId
      )
  );
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
  const parsed = await parsePortableSyncRoot(operation.envelope, operation.reviewSourceMediaId);
  const selectedIds = portableSyncEditingObjectIds(parsed);
  const editing = parsed.envelope.objects.filter((object) => selectedIds.includes(object.objectId));
  return { selected, admission, dependencySources, operation, parsed, selectedIds, editing };
}

/** Prepare one selected live root. The existing durable journal owns publication and recovery. */
export async function prepareCatalogReplica(args: {
  remote: SyncRemoteStore;
  catalog: Catalog;
  rootKind: CaptureRootKind;
  rootId: string;
  admission: Omit<PortableReplicaAdmission, 'operationId' | 'sourceDigest'>;
  signal: AbortSignal;
}) {
  const { selected, admission, dependencySources, operation, parsed, selectedIds, editing } =
    await selectReplicaPreparation(args);
  // Use the existing backup operation/recovery boundary while staged objects lack journal claims.
  return runWithAssetResourceRead(() =>
    runWithDurableAssetOperation(async () => {
      const borrowedRefs = new Map<string, AssetRef>();
      if (parsed.kind === 'media') {
        const original = await checkedPredecessorOriginal(
          parsed,
          operation,
          admission,
          args.signal
        );
        if (original) borrowedRefs.set(...original);
      }
      const checkedDependencies = new Map<string, { ref: AssetRef; sha256: string }>();
      for (const [mediaId, source] of dependencySources) {
        const dependency = admission.dependencies.find((item) => item.entry.id === mediaId);
        const mediaOperation = await parseSyncOperationText(source.operationText);
        const declared = operation.dependencies.find((item) => item.mediaId === mediaId);
        check(
          dependency && declared && mediaOperation.envelope && mediaOperation.rootId === mediaId
        );
        check(
          resolveSyncMediaDependency(
            args.catalog.operations,
            mediaId,
            declared.basis,
            dependency.expectedBasis
          )
        );
        check(
          resolveSyncMediaDependency(args.catalog.operations, mediaId, dependency.expectedBasis, [
            mediaOperation.operationId,
          ])
        );
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
      if (parsed.kind === 'video-review') {
        const primary = checkedDependencies.get(parsed.sourceMediaId);
        const original = parsed.envelope.objects.find(
          (item) => item.objectId === parsed.metadata.originalObjectId
        );
        const originalDigest = operation.objects.find(
          (item) => item.objectId === parsed.metadata.originalObjectId
        );
        check(
          primary &&
            original &&
            originalDigest &&
            primary.ref.size === original.size &&
            primary.ref.mimeType === original.mimeType &&
            primary.sha256 === originalDigest.sha256
        );
        borrowedRefs.set(parsed.metadata.originalObjectId, primary.ref);
        for (const asset of parsed.metadata.reviewAssets ?? []) {
          if (!asset.libraryMediaId) continue;
          const dependency = checkedDependencies.get(asset.libraryMediaId);
          const digest = operation.objects.find((item) => item.objectId === asset.objectId);
          const object = parsed.envelope.objects.find((item) => item.objectId === asset.objectId);
          check(
            dependency &&
              digest &&
              object &&
              dependency.ref.size === object.size &&
              dependency.ref.mimeType === object.mimeType &&
              dependency.sha256 === digest.sha256
          );
          borrowedRefs.set(asset.objectId, dependency.ref);
        }
      }
      if (parsed.kind === 'video-project') {
        for (const asset of parsed.metadata.projectAssets.filter(
          (item) => item.libraryMediaId && selectedIds.includes(item.objectId)
        )) {
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
      const stagedObjects = editing.filter((object) => !borrowedRefs.has(object.objectId));
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
            objects: stagedObjects,
            expectedSha256: new Map(
              stagedObjects.map((object) => {
                const expected = operation.objects.find(
                  (item) => item.objectId === object.objectId
                );
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
            senderDependencies: operation.dependencies.map((dependency) => {
              const actual = admission.dependencies.find(
                (item) => item.entry.id === dependency.mediaId
              );
              check(actual);
              return { mediaId: dependency.mediaId, basis: [...actual.expectedBasis] };
            }),
            ...(operation.reviewSourceMediaId
              ? { reviewSourceMediaId: operation.reviewSourceMediaId }
              : {}),
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
    })
  );
}

/** Admit a selected checked tombstone without staging objects or creating a publication journal. */
export async function applyCatalogDeletion(args: {
  catalog: Catalog;
  rootKind: CaptureRootKind;
  rootId: string;
  admission: Omit<
    ApplyCatalogDeletionInput,
    'rootKind' | 'rootId' | 'operationId' | 'sourceDigest'
  >;
  signal: AbortSignal;
}) {
  const admission = structuredClone(args.admission);
  const root = args.catalog.roots.get(syncCatalogRootKey(args.rootKind, args.rootId));
  check(
    args.catalog.invalid.length === 0 &&
      root &&
      root.deleted &&
      !root.blocked &&
      !root.conflict &&
      root.heads.length === 1 &&
      root.unavailableDependencies.length === 0
  );
  const selected = structuredClone(args.catalog.operations.get(root.heads[0]!));
  check(
    selected &&
      selected.operation.kind === 'delete' &&
      selected.operation.spaceId === admission.spaceId &&
      selected.operation.rootKind === args.rootKind &&
      selected.operation.rootId === args.rootId &&
      JSON.stringify(selected.operation) === selected.operationText
  );
  const ancestors = new Set<string>();
  const pending = [...selected.operation.parents];
  while (pending.length) {
    const id = pending.pop()!;
    if (ancestors.has(id)) continue;
    const parent = args.catalog.operations.get(id)?.operation;
    check(
      parent &&
        parent.spaceId === admission.spaceId &&
        parent.rootKind === args.rootKind &&
        parent.rootId === args.rootId
    );
    ancestors.add(id);
    pending.push(...parent.parents);
  }
  check(
    admission.expectedBasis.length === (admission.expectedLocalGeneration === 0 ? 0 : 1) &&
      admission.expectedBasis.every(
        (id) => ancestors.has(id) || id === selected.operation.operationId
      )
  );
  args.signal.throwIfAborted();
  const operation = await parseSyncOperationText(selected.operationText);
  check(operation.kind === 'delete');
  args.signal.throwIfAborted();
  return applyCatalogDeletionNative(
    {
      ...admission,
      rootKind: args.rootKind,
      rootId: args.rootId,
      operationId: operation.operationId,
      sourceDigest: hashSyncText(selected.operationText),
    },
    args.signal
  );
}
