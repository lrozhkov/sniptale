import { parseMediaLibraryEntry } from '../../composition/persistence/media-library/read-guards';
import { parsePortableMediaMetadata } from '../media-hub-backup/v6/root-codecs/media';
import { parsePortableScenarioProjectMetadata } from '../media-hub-backup/v6/root-codecs/projects';
import { parseScenarioAssetEntry } from '../../composition/persistence/scenario/read-guards';
import type { parseSyncOperationText } from './wire-record';

type SyncOperation = Awaited<ReturnType<typeof parseSyncOperationText>>;

/** A checked immutable physical attempt and its exact logical bytes. */
export interface CatalogAttempt {
  operationText: string;
  operation: SyncOperation;
  recordKey: string;
  attemptId: string;
  objects: { objectId: string; remoteKey: string }[];
}

/** Physical alternatives belong to one exact logical operation. */
export interface CatalogOperation {
  operation: SyncOperation;
  operationText: string;
  attempts: CatalogAttempt[];
}

/** Blocked roots retain inspectable metadata but cannot authorize native admission. */
interface CatalogRoot {
  rootKind: SyncOperation['rootKind'];
  rootId: string;
  heads: string[];
  deleted: boolean;
  conflict: boolean;
  blocked: boolean;
  unavailableDependencies: string[];
}

/** Ready causal state, plus identities that cannot authorize a current root. */
interface SyncCatalogGraph {
  operations: Map<string, CatalogOperation>;
  roots: Map<string, CatalogRoot>;
  quarantined: string[];
  pending: string[];
  invalidOperations: string[];
}

/** Root identities are tuples so delimiter characters cannot cause collisions. */
export function syncCatalogRootKey(rootKind: SyncOperation['rootKind'], rootId: string): string {
  return JSON.stringify([rootKind, rootId]);
}

function operationRootKey(operation: SyncOperation): string {
  return syncCatalogRootKey(operation.rootKind, operation.rootId);
}

function collectOperations(attempts: readonly CatalogAttempt[]) {
  const groups = new Map<string, CatalogAttempt[]>();
  for (const attempt of attempts) {
    const id = attempt.operation.operationId;
    const group = groups.get(id) ?? [];
    group.push(attempt);
    groups.set(id, group);
  }
  const unique = new Map<string, CatalogOperation>();
  const quarantined: string[] = [];
  for (const id of [...groups.keys()].sort()) {
    const group = groups.get(id)!;
    const first = group[0]!;
    if (group.some((attempt) => attempt.operationText !== first.operationText)) {
      quarantined.push(id);
      continue;
    }
    const physical = new Map(group.map((attempt) => [attempt.recordKey, attempt]));
    unique.set(id, {
      operation: first.operation,
      operationText: first.operationText,
      attempts: [...physical.keys()].sort().map((key) => ({
        ...physical.get(key)!,
        operation: first.operation,
        operationText: first.operationText,
      })),
    });
  }
  return { unique, quarantined };
}

function causalOperations(spaceId: string, unique: Map<string, CatalogOperation>) {
  const invalid = new Set<string>();
  const remainingParents = new Map<string, number>();
  const children = new Map<string, string[]>();
  for (const [id, entry] of unique) {
    const operation = entry.operation;
    if (
      operation.spaceId !== spaceId ||
      operation.parents.some((parentId) => {
        const parent = unique.get(parentId)?.operation;
        return (
          parent &&
          (parent.spaceId !== spaceId || operationRootKey(parent) !== operationRootKey(operation))
        );
      })
    )
      invalid.add(id);
    remainingParents.set(id, operation.parents.length);
    for (const parentId of operation.parents) {
      const list = children.get(parentId) ?? [];
      list.push(id);
      children.set(parentId, list);
    }
  }
  const queue = [...unique.keys()].filter(
    (id) => !invalid.has(id) && remainingParents.get(id) === 0
  );
  const ready = new Map<string, CatalogOperation>();
  for (let index = 0; index < queue.length; index++) {
    const id = queue[index]!;
    ready.set(id, unique.get(id)!);
    for (const child of children.get(id) ?? []) {
      const count = remainingParents.get(child)! - 1;
      remainingParents.set(child, count);
      if (count === 0 && !invalid.has(child)) queue.push(child);
    }
  }
  return {
    operations: new Map(
      [...ready].sort(([left], [right]) => (left < right ? -1 : left === right ? 0 : 1))
    ),
    pending: [...unique.keys()].filter((id) => !ready.has(id) && !invalid.has(id)).sort(),
    invalidOperations: [...invalid].sort(),
  };
}

function relatedOperations(start: string, links: Map<string, string[]>): Set<string> {
  const queue = [start];
  const visited = new Set<string>();
  while (queue.length) {
    const current = queue.pop()!;
    if (visited.has(current)) continue;
    visited.add(current);
    queue.push(...(links.get(current) ?? []));
  }
  return visited;
}

function hasUnresolvedDeletion(
  ids: readonly string[],
  operations: Map<string, CatalogOperation>
): boolean {
  const tombstones = ids.filter((id) => operations.get(id)!.operation.kind === 'delete');
  const restores = ids.filter((id) => operations.get(id)!.operation.kind === 'restore');
  const unresolved = new Set(tombstones);
  const parents = new Map<string, string[]>();
  const children = new Map<string, string[]>();
  for (const id of ids) {
    const parentIds = operations.get(id)!.operation.parents;
    parents.set(id, parentIds);
    for (const parent of parentIds) {
      const list = children.get(parent) ?? [];
      list.push(id);
      children.set(parent, list);
    }
  }
  let changed = true;
  while (changed && unresolved.size > 0) {
    changed = false;
    for (const restore of restores) {
      const ancestors = relatedOperations(restore, parents);
      const descendants = relatedOperations(restore, children);
      // Later deletes remain active. Concurrent unresolved deletes prevent restoration.
      if ([...unresolved].some((id) => !ancestors.has(id) && !descendants.has(id))) continue;
      for (const id of unresolved) {
        if (ancestors.has(id)) {
          unresolved.delete(id);
          changed = true;
        }
      }
      if (unresolved.size === 0) break;
    }
  }
  return unresolved.size > 0;
}

function immutableMediaVersion(operation: SyncOperation): string | null {
  if (operation.rootKind !== 'media' || operation.kind === 'delete' || !operation.envelope)
    return null;
  try {
    const metadata = parsePortableMediaMetadata(operation.envelope.metadata);
    const entry = parseMediaLibraryEntry(metadata.entry);
    const recording = metadata.recording?.entry;
    const asset = metadata.projectAsset;
    const sourceMatches =
      entry?.source.kind === 'recording'
        ? recording &&
          entry.source.recordingId === recording.id &&
          entry.id === `recording:${recording.id}`
        : entry?.source.kind === 'project-asset' &&
          asset &&
          !asset.originMediaId &&
          entry.id === `project-asset:${asset.id}` &&
          entry.source.projectAssetId === asset.id;
    const child = recording ?? asset;
    if (
      !entry ||
      entry.blob ||
      !child ||
      !sourceMatches ||
      entry.id !== operation.rootId ||
      entry.workspaceRevision !== 0 ||
      entry.imageContentState === 'edited' ||
      entry.lifecycle?.storageClass !== 'library' ||
      Object.keys(metadata).some(
        (key) => !['entry', 'projectAsset', 'recording', 'originalObjectId'].includes(key)
      )
    )
      return null;
    const object = operation.envelope.objects.find(
      (item) => item.objectId === metadata.originalObjectId
    );
    const digest = operation.objects.find((item) => item.objectId === metadata.originalObjectId);
    if (
      !object ||
      !digest ||
      operation.envelope.objects.length !== 1 ||
      operation.objects.length !== 1 ||
      object.size !== entry.size ||
      object.mimeType !== entry.mimeType ||
      child.size !== entry.size ||
      child.mimeType !== entry.mimeType
    )
      return null;
    const {
      filename: _filename,
      originalFilename: _originalFilename,
      tags: _tags,
      lifecycle: _lifecycle,
      sourceTitle: _sourceTitle,
      sourceUrl: _sourceUrl,
      sourceFavicon: _sourceFavicon,
      updatedAt: _updatedAt,
      recordingMetadata: _recordingMetadata,
      recordingGroup: _recordingGroup,
      ...immutable
    } = entry;
    return JSON.stringify({
      entry: recording
        ? immutable
        : {
            ...immutable,
            source: { kind: 'project-asset', projectAssetId: asset!.id },
            ...(entry.recordingMetadata ? { recordingMetadata: entry.recordingMetadata } : {}),
            ...(entry.recordingGroup ? { recordingGroup: entry.recordingGroup } : {}),
          },
      asset: {
        id: child.id,
        createdAt: child.createdAt,
        mimeType: child.mimeType,
        size: child.size,
        ...(recording?.mediaMetadata ? { mediaMetadata: recording.mediaMetadata } : {}),
      },
      object: { sha256: digest.sha256, size: object.size, mimeType: object.mimeType },
    });
  } catch {
    return null;
  }
}

/** Checked causal media heads can advance only while the original and its native lifetime remain unchanged. */
export function resolveSyncMediaDependency(
  operations: ReadonlyMap<string, CatalogOperation>,
  mediaId: string,
  requiredBasis: readonly string[],
  admittedBasis: readonly string[]
): boolean {
  if (requiredBasis.length !== 1 || admittedBasis.length !== 1) return false;
  const requiredId = requiredBasis[0]!;
  const admittedId = admittedBasis[0]!;
  const required = operations.get(requiredId)?.operation;
  const admitted = operations.get(admittedId)?.operation;
  if (
    !required ||
    !admitted ||
    required.rootKind !== 'media' ||
    admitted.rootKind !== 'media' ||
    required.rootId !== mediaId ||
    admitted.rootId !== mediaId ||
    required.spaceId !== admitted.spaceId ||
    required.kind === 'delete' ||
    admitted.kind === 'delete'
  )
    return false;
  if (requiredId === admittedId) return true;
  const version = immutableMediaVersion(required);
  if (version === null) return false;
  return compatibleDependencyAncestry(
    operations,
    admittedId,
    requiredId,
    (operation) =>
      operation.rootKind === 'media' &&
      operation.rootId === mediaId &&
      operation.spaceId === required.spaceId &&
      immutableMediaVersion(operation) === version,
    false
  );
}

function immutableScenarioChildren(
  operation: SyncOperation,
  rootId: string,
  childIds: readonly string[]
): string | null {
  if (
    operation.rootKind !== 'scenario-project' ||
    operation.rootId !== rootId ||
    operation.kind === 'delete' ||
    !operation.envelope
  )
    return null;
  try {
    const metadata = parsePortableScenarioProjectMetadata(operation.envelope.metadata);
    if (metadata.entry.id !== rootId) return null;
    const children = childIds.map((id) => {
      const child = metadata.assets.find((asset) => asset.entry.id === id);
      const entry = child && parseScenarioAssetEntry({ ...child.entry, assetId: 'portable' });
      const object = operation.envelope?.objects.find((item) => item.objectId === child?.objectId);
      const hash = operation.objects.find((item) => item.objectId === child?.objectId);
      if (
        !child ||
        !entry ||
        entry.projectId !== rootId ||
        !object ||
        !hash ||
        entry.size !== object.size ||
        entry.mimeType !== object.mimeType
      )
        throw new Error('Required Scenario child is unavailable.');
      const {
        assetId: _physicalAssetId,
        galleryAssetId: _galleryAssetId,
        borrowedMediaId: _borrowedMediaId,
        ...identity
      } = entry;
      return {
        entry: identity,
        object: { sha256: hash.sha256, size: object.size, mimeType: object.mimeType },
      };
    });
    return JSON.stringify(children);
  } catch {
    return null;
  }
}

/** A causal Scenario successor is compatible only while every required child's identity and bytes remain unchanged. */
export function resolveSyncScenarioDependency(
  operations: ReadonlyMap<string, CatalogOperation>,
  rootId: string,
  childIds: readonly string[],
  requiredBasis: readonly string[],
  admittedBasis: readonly string[]
): boolean {
  if (
    requiredBasis.length !== 1 ||
    admittedBasis.length !== 1 ||
    new Set(childIds).size !== childIds.length
  )
    return false;
  const requiredId = requiredBasis[0]!;
  const required = operations.get(requiredId)?.operation;
  if (!required) return false;
  const version = immutableScenarioChildren(required, rootId, childIds);
  if (version === null) return false;
  return compatibleDependencyAncestry(
    operations,
    admittedBasis[0]!,
    requiredId,
    (operation) =>
      operation.spaceId === required.spaceId &&
      immutableScenarioChildren(operation, rootId, childIds) === version,
    true
  );
}

/** Check every causal branch against one immutable dependency identity. */
function compatibleDependencyAncestry(
  operations: ReadonlyMap<string, CatalogOperation>,
  admittedId: string,
  requiredId: string,
  compatible: (operation: SyncOperation) => boolean,
  refuseUnrelatedRoot: boolean
): boolean {
  const pending = [admittedId];
  const visited = new Set<string>();
  let reachesRequired = false;
  while (pending.length) {
    const id = pending.pop()!;
    if (visited.has(id)) continue;
    visited.add(id);
    const operation = operations.get(id)?.operation;
    if (!operation || !compatible(operation)) return false;
    if (id === requiredId) reachesRequired = true;
    else {
      if (refuseUnrelatedRoot && operation.parents.length === 0) return false;
      pending.push(...operation.parents);
    }
  }
  return reachesRequired;
}

function fillRootState(roots: Map<string, CatalogRoot>, operations: Map<string, CatalogOperation>) {
  const rootOperations = new Map<string, string[]>();
  const superseded = new Set<string>();
  for (const [id, entry] of operations) {
    const key = operationRootKey(entry.operation);
    const ids = rootOperations.get(key) ?? [];
    ids.push(id);
    rootOperations.set(key, ids);
    for (const parent of entry.operation.parents) superseded.add(parent);
  }
  for (const [key, ids] of rootOperations) {
    const root = roots.get(key)!;
    root.heads = ids.filter((id) => !superseded.has(id)).sort();
    root.conflict = root.heads.length > 1;
    root.deleted = hasUnresolvedDeletion(ids, operations);
  }
  for (const root of roots.values()) {
    const unavailable = new Set<string>();
    for (const head of root.heads) {
      for (const dependency of operations.get(head)!.operation.dependencies) {
        const media = roots.get(syncCatalogRootKey('media', dependency.mediaId));
        if (
          !media ||
          media.blocked ||
          media.deleted ||
          media.conflict ||
          !resolveSyncMediaDependency(operations, dependency.mediaId, dependency.basis, media.heads)
        )
          unavailable.add(dependency.mediaId);
      }
      for (const dependency of operations.get(head)!.operation.rootDependencies ?? []) {
        const scenario = roots.get(syncCatalogRootKey(dependency.rootKind, dependency.rootId));
        if (
          !scenario ||
          scenario.blocked ||
          scenario.deleted ||
          scenario.conflict ||
          scenario.unavailableDependencies.length > 0 ||
          !resolveSyncScenarioDependency(
            operations,
            dependency.rootId,
            dependency.childIds,
            dependency.basis,
            scenario.heads
          )
        )
          unavailable.add(`scenario-project:${dependency.rootId}`);
      }
    }
    root.unavailableDependencies = [...unavailable].sort();
  }
}

/** Project checked records without I/O. Incomplete history blocks only its known roots. */
export function projectSyncCatalog(
  spaceId: string,
  attempts: readonly CatalogAttempt[]
): SyncCatalogGraph {
  const { unique, quarantined } = collectOperations(attempts);
  const causal = causalOperations(spaceId, unique);
  const unavailable = new Set([...quarantined, ...causal.pending, ...causal.invalidOperations]);
  const roots = new Map<string, CatalogRoot>();
  for (const attempt of attempts) {
    const operation = attempt.operation;
    if (operation.spaceId !== spaceId) continue;
    const key = operationRootKey(operation);
    const root = roots.get(key) ?? {
      rootKind: operation.rootKind,
      rootId: operation.rootId,
      heads: [],
      deleted: false,
      conflict: false,
      blocked: false,
      unavailableDependencies: [],
    };
    root.blocked ||= unavailable.has(operation.operationId);
    roots.set(key, root);
  }
  const sortedRoots = new Map(
    [...roots].sort(([left], [right]) => (left < right ? -1 : left === right ? 0 : 1))
  );
  fillRootState(sortedRoots, causal.operations);
  return { ...causal, roots: sortedRoots, quarantined };
}
