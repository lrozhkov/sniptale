import {
  runWithPersistenceMutationTransition,
  type PersistenceMutationTransitionPermit,
} from '../../composition/persistence/infrastructure/mutation-barrier';
import { hasUnloadedNativeEditingRoot, restoreStagedNativeOriginal } from './native-residency';
import { parseScenarioAssetEntry } from '../../composition/persistence/scenario/read-guards';
import { loadScenarioReplicaPredecessorAssets } from '../../composition/persistence/sync-capture/apply-scenario';
import { collectPreparedScenarioReplicaRefs } from '../../composition/persistence/sync-capture/prepared-scenario';
import type { CaptureRootKind } from '../../composition/persistence/sync-capture/contracts';
import {
  applyCatalogDeletionNative,
  type ApplyCatalogDeletionInput,
} from '../../composition/persistence/sync-capture/apply-deletion';
import {
  collectPreparedAssetCleanupFailures,
  discardPreparedAsset,
  MissingAssetObjectError,
  readAssetFile,
  writeBlobToAsset,
  runWithDurableAssetOperation,
  type AssetRef,
} from '../../composition/persistence/assets';
import { createPreparedReplicaJournal } from '../../composition/persistence/sync-capture/replica-publication';
import { loadProjectReplicaExport } from '../../composition/persistence/sync-capture/apply-video-project';
import { loadMediaReplicaPredecessorRef } from '../../composition/persistence/sync-capture/apply-media';
import { runWithAssetResourceRead } from '../../composition/persistence/assets/resource-sessions';
import { stageRootObjects, type StagedArchiveObject } from '../media-hub-backup/v6/staging';
import { digestBackupObject } from '../media-hub-backup/v6/shared-objects';
import {
  syncCatalogRootKey,
  resolveSyncMediaDependency,
  resolveSyncScenarioDependency,
  type CatalogOperation,
} from './catalog-graph';
import type { scanSyncCatalog } from './catalog';
import {
  parsePortableSyncRoot,
  portableSyncEditingObjectIds,
  portableSyncDependencyIds,
  preparePortableReplica,
  type PortableReplicaAdmission,
  type DeferredProjectExport,
} from './prepared-root';
import { portableSyncRootDependencyIds } from './prepared-scenario';
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
async function loadOriginalPredecessorRef(
  parsed: Extract<Awaited<ReturnType<typeof parsePortableSyncRoot>>, { kind: 'media' | 'image' }>,
  operation: Awaited<ReturnType<typeof parseSyncOperationText>>,
  admission: Omit<PortableReplicaAdmission, 'operationId' | 'sourceDigest'>
) {
  return loadMediaReplicaPredecessorRef({
    spaceId: admission.spaceId,
    profileCreatedAt: admission.profileCreatedAt,
    connectionGeneration: admission.connectionGeneration,
    mediaId: parsed.metadata.entry.id,
    expectedLocalGeneration: admission.expectedLocalGeneration,
    expectedBasis: admission.expectedBasis,
    ...(admission.authorization ? { authorization: admission.authorization } : {}),
    ...(parsed.kind === 'media' && parsed.metadata.projectExport
      ? {
          exportSource: {
            projectId: parsed.metadata.projectExport.projectId,
            sha256: operation.objects.find(
              (item) => item.objectId === parsed.metadata.originalObjectId
            )!.sha256,
          },
        }
      : {}),
  });
}
async function checkedPredecessorOriginal(
  parsed: Extract<Awaited<ReturnType<typeof parsePortableSyncRoot>>, { kind: 'media' | 'image' }>,
  operation: Awaited<ReturnType<typeof parseSyncOperationText>>,
  admission: Omit<PortableReplicaAdmission, 'operationId' | 'sourceDigest'>,
  signal: AbortSignal
): Promise<[string, AssetRef] | null> {
  if (
    admission.expectedLocalGeneration === 0 &&
    (parsed.kind !== 'media' || !parsed.metadata.projectExport)
  )
    return null;
  const ref = await loadOriginalPredecessorRef(parsed, operation, admission);
  const object = parsed.envelope.objects.find(
    (item) => item.objectId === parsed.metadata.originalObjectId
  );
  const digest = operation.objects.find(
    (item) => item.objectId === parsed.metadata.originalObjectId
  );
  check(object && digest);
  if (!ref || ref.size !== object.size || ref.mimeType !== object.mimeType) return null;
  let file: File;
  try {
    file = await readAssetFile(ref, object.filename);
  } catch (error) {
    signal.throwIfAborted();
    if (
      error instanceof MissingAssetObjectError ||
      (error instanceof DOMException && error.name === 'NotFoundError')
    )
      return null;
    throw error;
  }
  signal.throwIfAborted();
  return file.size === object.size &&
    file.type === object.mimeType &&
    (await hashFile(file, signal)) === digest.sha256
    ? [object.objectId, ref]
    : null;
}
async function cleanup(staged: StagedArchiveObject[], error: unknown): Promise<never> {
  const failures = await collectPreparedAssetCleanupFailures(
    staged.map((item) => item.ref.assetId)
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
  residentOnly?: true;
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
  const declaredRoots = operation.rootDependencies ?? [];
  const rootIds = portableSyncRootDependencyIds(parsed, declaredRoots);
  check(
    JSON.stringify(rootIds) ===
      JSON.stringify((admission.rootDependencies ?? []).map((item) => item.rootId).sort())
  );
  for (const dependency of declaredRoots) {
    const actual = admission.rootDependencies?.find((item) => item.rootId === dependency.rootId);
    check(
      actual &&
        JSON.stringify([...dependency.childIds].sort()) ===
          JSON.stringify(actual.children.map((child) => child.entry.id).sort()) &&
        resolveSyncScenarioDependency(
          args.catalog.operations,
          dependency.rootId,
          dependency.childIds,
          dependency.basis,
          actual.expectedBasis
        )
    );
    const current = selectedOperation(args.catalog, 'scenario-project', dependency.rootId);
    check(
      resolveSyncScenarioDependency(
        args.catalog.operations,
        dependency.rootId,
        dependency.childIds,
        actual.expectedBasis,
        [current.operation.operationId]
      )
    );
  }
  const retainedExportIds = new Set<string>();
  if (parsed.kind === 'video-project')
    for (const item of parsed.metadata.projectExports) {
      args.signal.throwIfAborted();
      if (
        await loadProjectReplicaExport({
          ...admission,
          projectId: parsed.entry.id,
          exportId: item.entry.id,
        })
      )
        retainedExportIds.add(item.entry.id);
    }
  const selectedIds = portableSyncEditingObjectIds(parsed, retainedExportIds);
  const editing = parsed.envelope.objects.filter((object) => selectedIds.includes(object.objectId));
  return {
    selected,
    admission,
    dependencySources,
    operation,
    parsed,
    selectedIds,
    editing,
    retainedExportIds,
  };
}

type ReplicaPreparation = Awaited<ReturnType<typeof selectReplicaPreparation>>;
type ReplicaPreparationInput = Parameters<typeof selectReplicaPreparation>[0];

async function scenarioPredecessorOriginals(
  args: ReplicaPreparationInput,
  preparation: ReplicaPreparation
) {
  const matches: {
    object: ReplicaPreparation['parsed']['envelope']['objects'][number];
    ref: AssetRef;
    sha256: string;
  }[] = [];
  const { parsed, operation, admission } = preparation;
  if (parsed.kind === 'scenario-project' && admission.expectedLocalGeneration > 0) {
    const previous = await loadScenarioReplicaPredecessorAssets({
      spaceId: admission.spaceId,
      profileCreatedAt: admission.profileCreatedAt,
      connectionGeneration: admission.connectionGeneration,
      rootId: args.rootId,
      expectedLocalGeneration: admission.expectedLocalGeneration,
      expectedBasis: admission.expectedBasis,
    });
    for (const asset of parsed.metadata.assets) {
      const predecessor = previous.find((item) => item.entry.id === asset.entry.id);
      if (!predecessor) continue;
      const normalized = parseScenarioAssetEntry({
        ...asset.entry,
        assetId: predecessor.entry.assetId,
      });
      const object = parsed.envelope.objects.find((item) => item.objectId === asset.objectId);
      const digest = operation.objects.find((item) => item.objectId === asset.objectId);
      const stableChild = (entry: typeof predecessor.entry) => {
        const {
          assetId: _physical,
          galleryAssetId: _gallery,
          borrowedMediaId: _borrowed,
          ...identity
        } = entry;
        return identity;
      };
      if (
        !normalized ||
        JSON.stringify(stableChild(normalized)) !==
          JSON.stringify(stableChild(predecessor.entry)) ||
        !object ||
        !digest ||
        predecessor.ref.size !== object.size ||
        predecessor.ref.mimeType !== object.mimeType
      )
        continue;
      matches.push({ object, ref: predecessor.ref, sha256: digest.sha256 });
    }
  }
  return matches;
}

async function retainScenarioPredecessors(
  args: ReplicaPreparationInput,
  preparation: ReplicaPreparation,
  borrowedRefs: Map<string, AssetRef>
) {
  for (const { object, ref, sha256 } of await scenarioPredecessorOriginals(args, preparation)) {
    let file: File;
    try {
      file = await readAssetFile(ref, object.filename);
    } catch (error) {
      args.signal.throwIfAborted();
      if (
        error instanceof MissingAssetObjectError ||
        (error instanceof DOMException && error.name === 'NotFoundError')
      )
        continue;
      throw error;
    }
    args.signal.throwIfAborted();
    if (
      file.size === object.size &&
      file.type === object.mimeType &&
      (await hashFile(file, args.signal)) === sha256
    )
      borrowedRefs.set(object.objectId, ref);
  }
}

async function checkReplicaDependencies(
  args: ReplicaPreparationInput,
  preparation: ReplicaPreparation
) {
  const { dependencySources, admission, operation } = preparation;
  const checkedDependencies = new Map<string, { ref: AssetRef; sha256: string }>();
  for (const [mediaId, source] of dependencySources) {
    const dependency = admission.dependencies.find((item) => item.entry.id === mediaId);
    const mediaOperation = await parseSyncOperationText(source.operationText);
    const declared = operation.dependencies.find((item) => item.mediaId === mediaId);
    check(dependency && declared && mediaOperation.envelope && mediaOperation.rootId === mediaId);
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
    check(media.kind === 'media' || media.kind === 'image');
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
  return checkedDependencies;
}

function checkedDependencyObject(
  preparation: ReplicaPreparation,
  checkedDependencies: ReadonlyMap<string, { ref: AssetRef; sha256: string }>,
  mediaId: string | undefined,
  objectId: string
) {
  const dependency = mediaId ? checkedDependencies.get(mediaId) : undefined;
  const digest = preparation.operation.objects.find((item) => item.objectId === objectId);
  const object = preparation.parsed.envelope.objects.find((item) => item.objectId === objectId);
  check(
    dependency &&
      digest &&
      object &&
      dependency.ref.size === object.size &&
      dependency.sha256 === digest.sha256
  );
  return { dependency, object };
}

function retainReviewDependencyObjects(
  preparation: ReplicaPreparation,
  checkedDependencies: ReadonlyMap<string, { ref: AssetRef; sha256: string }>,
  borrowedRefs: Map<string, AssetRef>
) {
  const { parsed, operation } = preparation;
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
      const { dependency, object } = checkedDependencyObject(
        preparation,
        checkedDependencies,
        asset.libraryMediaId,
        asset.objectId
      );
      check(dependency.ref.mimeType === object.mimeType);
      borrowedRefs.set(asset.objectId, dependency.ref);
    }
  }
}

function retainProjectDependencyObjects(
  preparation: ReplicaPreparation,
  checkedDependencies: ReadonlyMap<string, { ref: AssetRef; sha256: string }>,
  borrowedRefs: Map<string, AssetRef>
) {
  const { parsed, selectedIds } = preparation;
  if (parsed.kind === 'video-project') {
    const causalMedia = new Set(portableSyncDependencyIds(parsed));
    for (const asset of parsed.metadata.projectAssets.filter(
      (item) =>
        item.libraryMediaId &&
        causalMedia.has(item.libraryMediaId) &&
        selectedIds.includes(item.objectId)
    )) {
      const { dependency } = checkedDependencyObject(
        preparation,
        checkedDependencies,
        asset.libraryMediaId,
        asset.objectId
      );
      borrowedRefs.set(asset.objectId, dependency.ref);
    }
  }
}

async function collectReplicaOriginalRefs(
  args: ReplicaPreparationInput,
  preparation: ReplicaPreparation
) {
  const { parsed, operation, admission } = preparation;
  const borrowedRefs = new Map<string, AssetRef>();
  if (
    parsed.kind === 'media' ||
    (parsed.kind === 'image' && parsed.metadata.entry.source.kind === 'stored-asset')
  ) {
    const original = await checkedPredecessorOriginal(parsed, operation, admission, args.signal);
    if (original) borrowedRefs.set(...original);
  }
  await retainScenarioPredecessors(args, preparation, borrowedRefs);
  const dependencies = await checkReplicaDependencies(args, preparation);
  retainReviewDependencyObjects(preparation, dependencies, borrowedRefs);
  retainProjectDependencyObjects(preparation, dependencies, borrowedRefs);
  return borrowedRefs;
}

async function prepareStagedReplica(
  preparation: ReplicaPreparation,
  borrowedRefs: ReadonlyMap<string, AssetRef>,
  staged: StagedArchiveObject[],
  physicalObjects: readonly { objectId: string; remoteKey: string }[],
  signal: AbortSignal
) {
  const { parsed, operation, admission, selected } = preparation;
  const refs = new Map([
    ...borrowedRefs,
    ...staged.map((item): [string, AssetRef] => [item.objectId, item.ref]),
  ]);
  const deferredExports = new Map<string, DeferredProjectExport>();
  if (parsed.kind === 'video-project')
    for (const item of parsed.metadata.projectExports) {
      const object = parsed.envelope.objects.find((object) => object.objectId === item.objectId);
      const digest = operation.objects.find((object) => object.objectId === item.objectId);
      const physical = physicalObjects.find((object) => object.objectId === item.objectId);
      check(object && digest && physical);
      const retained = await loadProjectReplicaExport({
        ...admission,
        projectId: parsed.entry.id,
        exportId: item.entry.id,
      });
      signal.throwIfAborted();
      // A changed reuse decision needs a fresh closure, never extra or missing staged resources.
      check(Boolean(retained) === preparation.retainedExportIds.has(item.entry.id));
      if (retained) {
        check(retained.ref.size === object.size && retained.ref.mimeType === object.mimeType);
        try {
          const file = await readAssetFile(retained.ref, object.filename);
          check(file.size === object.size && (await hashFile(file, signal)) === digest.sha256);
        } catch (error) {
          signal.throwIfAborted();
          if (
            !(
              error instanceof MissingAssetObjectError ||
              (error instanceof DOMException && error.name === 'NotFoundError')
            )
          )
            throw error;
          check(
            retained.copy &&
              retained.copy.phase !== 'resident' &&
              retained.copy.remote.sha256 === digest.sha256
          );
        }
      }
      const assetId = retained?.ref.assetId ?? crypto.randomUUID();
      const ref = retained?.ref ?? {
        assetId,
        createdAt: Date.now(),
        location: { kind: 'opfs' as const, objectKey: `objects/${assetId}` },
        size: object.size,
        mimeType: object.mimeType,
        sha256: digest.sha256,
      };
      deferredExports.set(item.entry.id, {
        ref,
        remote: { key: physical.remoteKey, sha256: digest.sha256 },
        ...(retained ? { retainedEntry: retained.entry } : {}),
      });
    }
  return preparePortableReplica({
    deferredExports,
    envelope: parsed.envelope,
    verifiedObjects: refs,
    senderDependencies: operation.dependencies.map((dependency) => {
      const actual = admission.dependencies.find((item) => item.entry.id === dependency.mediaId);
      check(actual);
      return { mediaId: dependency.mediaId, basis: [...actual.expectedBasis] };
    }),
    senderRootDependencies: (operation.rootDependencies ?? []).map((dependency) => {
      const actual = admission.rootDependencies?.find((item) => item.rootId === dependency.rootId);
      check(actual);
      return { ...dependency, basis: [...actual.expectedBasis] };
    }),
    ...(operation.reviewSourceMediaId
      ? { reviewSourceMediaId: operation.reviewSourceMediaId }
      : {}),
    stageNativeMetadata: async (blob) => {
      const generated = await writeBlobToAsset(blob);
      staged.push({ ...generated, objectId: `native-metadata-${staged.length}` });
      return generated.ref;
    },
    admission: {
      ...admission,
      operationId: operation.operationId,
      sourceDigest: hashSyncText(selected.operationText),
    },
  });
}

async function retainRestoredOriginal(
  args: ReplicaPreparationInput,
  preparation: ReplicaPreparation,
  staged: StagedArchiveObject[],
  refs: Map<string, AssetRef>,
  transitionPermit: PersistenceMutationTransitionPermit
): Promise<void> {
  const { parsed, operation, admission } = preparation;
  const originals = await scenarioPredecessorOriginals(args, preparation);
  if (
    (admission.expectedLocalGeneration > 0 ||
      (parsed.kind === 'media' && parsed.metadata.projectExport)) &&
    (parsed.kind === 'media' ||
      (parsed.kind === 'image' && parsed.metadata.entry.source.kind === 'stored-asset'))
  ) {
    const object = parsed.envelope.objects.find(
      (item) => item.objectId === parsed.metadata.originalObjectId
    );
    const digest = operation.objects.find(
      (item) => item.objectId === parsed.metadata.originalObjectId
    );
    if (!object || !digest) throw new Error('Incoming original binding is missing.');
    const ref = await loadOriginalPredecessorRef(parsed, operation, admission);
    if (ref) originals.push({ object, ref, sha256: digest.sha256 });
  }
  for (const { object, ref, sha256 } of originals) {
    const item = staged.find((item) => item.objectId === object.objectId);
    if (
      !item ||
      !(await restoreStagedNativeOriginal({
        ref,
        sourceRef: item.ref,
        sha256,
        scope: admission,
        transitionPermit,
        signal: args.signal,
      }))
    )
      continue;
    // Dispose only the staging identity after exact native restoration succeeds.
    await discardPreparedAsset(item.ref.assetId);
    refs.set(item.objectId, ref);
    staged.splice(staged.indexOf(item), 1);
  }
}

async function stageReplicaAttempts(
  args: ReplicaPreparationInput,
  preparation: ReplicaPreparation,
  borrowedRefs: ReadonlyMap<string, AssetRef>,
  transitionPermit: PersistenceMutationTransitionPermit
) {
  const { editing, selected, operation } = preparation;
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
        transitionPermit,
        expectedSha256: new Map(
          stagedObjects.map((object) => {
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
      const retainedRefs = new Map(borrowedRefs);
      await retainRestoredOriginal(args, preparation, staged, retainedRefs, transitionPermit);
      const payload = await prepareStagedReplica(
        preparation,
        retainedRefs,
        staged,
        physical.objects,
        args.signal
      );
      if (payload.kind === 'scenario-project') {
        const retained = new Set(
          collectPreparedScenarioReplicaRefs(payload.input.root).map((ref) => ref.assetId)
        );
        for (const item of [...staged]) {
          if (retained.has(item.ref.assetId)) continue;
          await discardPreparedAsset(item.ref.assetId);
          staged = staged.filter((candidate) => candidate.ref.assetId !== item.ref.assetId);
        }
      }
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
}

/** Prepare one selected live root. The existing durable journal owns publication and recovery. */
export async function prepareCatalogReplica(args: ReplicaPreparationInput) {
  const preparation = await selectReplicaPreparation(args);
  // Keep the reader and recovery leases until every staged object belongs to its journal.
  return runWithPersistenceMutationTransition((transition) =>
    runWithAssetResourceRead(() =>
      runWithDurableAssetOperation(async () => {
        if (
          args.residentOnly &&
          (await hasUnloadedNativeEditingRoot({ rootKind: args.rootKind, rootId: args.rootId }))
        )
          throw new Error('Background incoming requires resident editing resources.');
        const refs = await collectReplicaOriginalRefs(args, preparation);
        return stageReplicaAttempts(args, preparation, refs, transition);
      })
    )
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
