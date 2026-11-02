import { readCheckpointInTransaction } from './checkpoints';
import { readCaptureRootState } from './guards';
import { readScenarioProjectDependenciesInTransaction } from './scenario-dependencies';
import { readOutgoingOperation } from './outgoing';
import { readScenarioStorage } from '../scenario/storage';
import { parseScenarioProjectEntry } from '../scenario/read-guards';
import { SCENARIO_CAPTURE_STORES } from './scenario-snapshot';
import type { CausalRootDependency } from './contracts';
import { captureProfileBounds } from './contracts';
import type { IDBPTransaction } from 'idb';
import { initDB, capturePreparedDatabase } from '../infrastructure/indexed-db/core';
import {
  collectNativeEditingResources,
  NATIVE_EDITING_RESOURCE_STORES,
} from '../assets/editing-resources';
import {
  SYNC_CAPTURE_STORE,
  SYNC_OUTBOX_STORE,
  SYNC_CONNECTION_STORE,
  MEDIA_LIBRARY_STORE,
  VIDEO_PROJECTS_STORE,
  STORE_NAME,
  RECORDING_TELEMETRY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  IMAGE_WORKSPACES_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  THUMBNAILS_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import {
  parseSyncConnectionIdentity,
  type SyncConnectionIdentity,
  type SyncConnectionScope,
} from '../remote-connection/model';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { parseVideoProjectEntry } from '../projects/read-guards';
import { readWorkspaceStorage } from '../review-workspaces/storage';
import { parseVideoWorkspace } from '../review-workspaces/parser';
import { captureRootKey, type CaptureRootKind, type SyncCaptureRootState } from './contracts';
import { parseSyncCaptureRecord } from './guards';
import { isImageCaptureSource } from './image-snapshot';
import { readCompatibleImageReplicaPredecessorInTransaction } from './freeze';
import { digestCapturedMediaRows } from './freeze';
import { freezeMediaInTransaction } from './freeze';
import type { ApplyPreparedVideoProjectRevisionInput } from './apply-video-project';

type ReadTransaction = IDBPTransaction<unknown, string[], 'readonly'>;

/** Target-owned counters and immutable sources for one incoming root. */
interface CatalogReplicaAdmission extends SyncConnectionScope {
  authorization: SyncConnectionIdentity;
  expectedBasis: readonly string[];
  expectedLocalGeneration: number;
  expectedWorkspaceRevision: number | null;
  dependencies: ApplyPreparedVideoProjectRevisionInput['dependencies'];
  rootDependencies?: ApplyPreparedVideoProjectRevisionInput['rootDependencies'];
}

function refuse(): never {
  throw new Error('Incoming native admission refused.');
}

async function rootState(
  tx: ReadTransaction,
  spaceId: string,
  rootKind: CaptureRootKind,
  rootId: string
) {
  const rootKey = captureRootKey(spaceId, rootKind, rootId);
  const state = await readCaptureRootState(tx, rootKey, refuse);
  if (!state) return null;
  if (state.spaceId !== spaceId || state.rootKind !== rootKind || state.rootId !== rootId) refuse();
  return state;
}

async function workspaceRevision(
  tx: ReadTransaction,
  rootKind: CaptureRootKind,
  rootId: string,
  state: SyncCaptureRootState | null
) {
  if (rootKind === 'scenario-project') {
    const raw = (await readScenarioStorage(tx, rootId)).logical;
    if (raw === undefined) return null;
    const project = parseScenarioProjectEntry(raw);
    if (!project || project.id !== rootId) refuse();
    return project.workspaceRevision;
  }
  if (rootKind === 'video-review') {
    const stored = await readWorkspaceStorage(tx, rootId);
    if (stored.logical === undefined) return null;
    const workspace = parseVideoWorkspace(stored.logical);
    if (!workspace || workspace.aggregateId !== rootId) refuse();
    return workspace.revision;
  }
  if (rootKind === 'video-project') {
    const raw: unknown = await tx.objectStore(VIDEO_PROJECTS_STORE).get(rootId);
    if (raw === undefined) return null;
    const project = parseVideoProjectEntry(raw);
    if (!project || project.id !== rootId) refuse();
    return project.workspaceRevision ?? 0;
  }
  const raw: unknown = await tx.objectStore(MEDIA_LIBRARY_STORE).get(rootId);
  if (raw === undefined) return null;
  const media = parseMediaLibraryEntry(raw);
  if (!media || media.id !== rootId) refuse();
  if (media.source.kind === 'project-asset' && state?.nativeRevision === undefined) return null;
  return isImageCaptureSource(media) ? (media.workspaceRevision ?? 0) : null;
}

/** Read one consistent native predecessor; publication repeats admission in its write transaction. */
export async function loadCatalogReplicaAdmission(args: {
  scope: SyncConnectionScope;
  authorization: SyncConnectionIdentity;
  rootKind: CaptureRootKind;
  rootId: string;
  dependencyMediaIds: readonly string[];
  dependencyRoots?: readonly CausalRootDependency[];
}): Promise<CatalogReplicaAdmission> {
  const selected = structuredClone(args);
  const authorization = parseSyncConnectionIdentity(selected.authorization);
  if (
    !authorization ||
    !['media', 'video-review', 'video-project', 'scenario-project'].includes(selected.rootKind) ||
    !selected.rootId ||
    selected.rootId.length > 256 ||
    selected.dependencyMediaIds.length > captureProfileBounds(selected.rootKind).rows ||
    new Set(selected.dependencyMediaIds).size !== selected.dependencyMediaIds.length ||
    selected.dependencyMediaIds.some((id) => !id || id.length > 256)
  )
    refuse();
  const db = await initDB();
  const tx = db.transaction(
    [
      ...SCENARIO_CAPTURE_STORES,
      SYNC_CAPTURE_STORE,
      SYNC_CONNECTION_STORE,
      MEDIA_LIBRARY_STORE,
      VIDEO_PROJECTS_STORE,
      STORE_NAME,
      RECORDING_TELEMETRY_STORE,
      PROJECT_ASSETS_STORE,
      PROJECT_EXPORTS_STORE,
      ASSET_REFS_STORE,
      ASSET_OWNERS_STORE,
      IMAGE_WORKSPACES_STORE,
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      THUMBNAILS_STORE,
      AGGREGATE_PRESENTATIONS_STORE,
    ],
    'readonly'
  );
  await checkSyncConnectionAdmission(tx, selected.scope, authorization);
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (!profile || profile.kind !== 'profile' || !profile.enabled) refuse();
  if (await readCheckpointInTransaction(tx, selected.scope, selected)) refuse();
  for (const dependency of selected.dependencyRoots ?? [])
    if (await readCheckpointInTransaction(tx, selected.scope, dependency)) refuse();
  const state = await rootState(tx, selected.scope.spaceId, selected.rootKind, selected.rootId);
  const revision = await workspaceRevision(tx, selected.rootKind, selected.rootId, state);
  const dependencies: ApplyPreparedVideoProjectRevisionInput['dependencies'][number][] = [];
  const rootDependencies = await readScenarioProjectDependenciesInTransaction(
    tx,
    selected.scope.spaceId,
    selected.dependencyRoots ?? []
  );
  if (!rootDependencies) refuse();
  for (const mediaId of selected.dependencyMediaIds) {
    if (
      await readCheckpointInTransaction(tx, selected.scope, { rootKind: 'media', rootId: mediaId })
    )
      refuse();
    const dependencyState = await rootState(tx, selected.scope.spaceId, 'media', mediaId);
    if (!dependencyState || dependencyState.deleted || dependencyState.basis.length !== 1) refuse();
    const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
    if (!media || media.lifecycle?.storageClass !== 'library') refuse();
    const image = isImageCaptureSource(media)
      ? await readCompatibleImageReplicaPredecessorInTransaction(tx, mediaId, dependencyState)
      : null;
    const rows =
      image?.rows ??
      (await freezeMediaInTransaction(tx, mediaId, { allowIndependentReview: true }));
    const ref = 'ref' in rows ? rows.ref : rows.originalRef;
    const digest = image?.digest ?? ('ref' in rows ? digestCapturedMediaRows(rows) : null);
    if (!ref || dependencyState.nativeDigest !== digest) refuse();
    dependencies.push({
      entry: rows.media,
      ref,
      expectedGeneration: dependencyState.generation,
      expectedBasis: dependencyState.basis,
    });
  }
  await tx.done;
  return structuredClone({
    ...selected.scope,
    authorization,
    expectedBasis: state?.basis ?? [],
    expectedLocalGeneration: state?.generation ?? 0,
    expectedWorkspaceRevision: revision,
    dependencies,
    ...(rootDependencies.length ? { rootDependencies } : {}),
  });
}

/** Offer only this exact predecessor's local resources; callers must verify actual bytes before reuse. */
export async function loadCatalogReplicaResidentCandidates(args: {
  scope: SyncConnectionScope;
  authorization: SyncConnectionIdentity;
  rootKind: CaptureRootKind;
  rootId: string;
  expectedLocalGeneration: number;
  expectedBasis: readonly string[];
  expectedWorkspaceRevision: number | null;
}) {
  const db = capturePreparedDatabase();
  if (!db) refuse();
  const selected = structuredClone(args);
  const authorization = parseSyncConnectionIdentity(selected.authorization);
  if (
    !authorization ||
    !['media', 'video-review', 'video-project', 'scenario-project'].includes(selected.rootKind) ||
    !selected.rootId ||
    selected.rootId.length > 256 ||
    !Number.isSafeInteger(selected.expectedLocalGeneration) ||
    selected.expectedLocalGeneration < 1 ||
    selected.expectedBasis.length !== 1 ||
    (selected.expectedWorkspaceRevision !== null &&
      (!Number.isSafeInteger(selected.expectedWorkspaceRevision) ||
        selected.expectedWorkspaceRevision < 0))
  )
    refuse();
  const tx = db.transaction(
    [...new Set([...NATIVE_EDITING_RESOURCE_STORES, SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE])],
    'readonly'
  );
  try {
    await checkSyncConnectionAdmission(tx, selected.scope, authorization);
    const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
    if (!profile || profile.kind !== 'profile' || !profile.enabled) refuse();
    if (await readCheckpointInTransaction(tx, selected.scope, selected)) refuse();
    const state = await rootState(tx, selected.scope.spaceId, selected.rootKind, selected.rootId);
    if (
      !state ||
      state.deleted ||
      state.generation !== selected.expectedLocalGeneration ||
      JSON.stringify(state.basis) !== JSON.stringify(selected.expectedBasis) ||
      (await workspaceRevision(tx, selected.rootKind, selected.rootId, state)) !==
        selected.expectedWorkspaceRevision
    )
      refuse();
    const scenarioEntry =
      selected.rootKind === 'scenario-project'
        ? parseScenarioProjectEntry((await readScenarioStorage(tx, selected.rootId)).logical)
        : null;
    if (selected.rootKind === 'scenario-project' && !scenarioEntry) refuse();
    const resources = await collectNativeEditingResources(
      tx,
      selected,
      selected.rootKind === 'scenario-project' ? 'backup' : 'editing'
    );
    const inlineOriginals: { mediaId: string; blob: Blob; mimeType: string }[] = [];
    for (const mediaId of resources.inlineMediaIds) {
      const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
      if (!media || media.id !== mediaId || media.source.kind !== 'screenshot') refuse();
      if (media.blob) {
        if (
          media.blob.size !== media.size ||
          (media.blob.type && media.blob.type !== media.mimeType)
        )
          refuse();
        inlineOriginals.push({ mediaId, blob: media.blob, mimeType: media.mimeType });
      }
    }
    await tx.done;
    if (capturePreparedDatabase() !== db) refuse();
    return structuredClone({
      refs: resources.refs,
      inlineOriginals,
      ...(scenarioEntry ? { scenarioEntry } : {}),
    });
  } catch (error) {
    await tx.done.catch(() => undefined);
    throw error;
  }
}

/** Observe authoritative completion after a publication or cancellation raced with cleanup. */
export async function hasCatalogReplicaReceipt(args: {
  scope: SyncConnectionScope;
  rootKind: CaptureRootKind;
  rootId: string;
  operationId: string;
  sourceDigest: string;
}): Promise<boolean> {
  const selected = structuredClone(args);
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE], 'readonly');
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  const key = JSON.stringify(['applied-operation', selected.scope.spaceId, selected.operationId]);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(key);
  const receipt = raw === undefined ? null : parseSyncCaptureRecord(raw);
  await tx.done;
  if (
    !profile ||
    profile.kind !== 'profile' ||
    profile.createdAt !== selected.scope.profileCreatedAt ||
    profile.spaceId !== selected.scope.spaceId
  )
    return false;
  if (raw === undefined) return false;
  if (
    !receipt ||
    receipt.kind !== 'applied-operation' ||
    receipt.key !== key ||
    receipt.spaceId !== selected.scope.spaceId ||
    receipt.operationId !== selected.operationId ||
    receipt.rootKey !==
      captureRootKey(selected.scope.spaceId, selected.rootKind, selected.rootId) ||
    receipt.sourceDigest !== selected.sourceDigest
  )
    refuse();
  return true;
}

type CatalogMaterializationSelection = {
  rootKind: CaptureRootKind;
  rootId: string;
  operationId: string;
  sourceDigest: string;
};

/** Match exact incoming or published local heads for display; byte availability requires separate proof. */
export async function loadMaterializedCatalogSelections(args: {
  scope: SyncConnectionScope;
  selections: readonly CatalogMaterializationSelection[];
}): Promise<readonly CatalogMaterializationSelection[]> {
  const selected = structuredClone(args);
  if (
    selected.selections.length > 10_000 ||
    selected.selections.some(
      (selection) =>
        !['media', 'video-review', 'video-project', 'scenario-project'].includes(
          selection.rootKind
        ) ||
        !selection.rootId ||
        selection.rootId.length > 256 ||
        !selection.operationId ||
        selection.operationId.length > 256 ||
        !/^[a-f0-9]{64}$/u.test(selection.sourceDigest)
    )
  )
    refuse();
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_OUTBOX_STORE], 'readonly');
  const rawProfile: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get('profile');
  const profile = rawProfile === undefined ? null : parseSyncCaptureRecord(rawProfile);
  if (rawProfile !== undefined && (!profile || profile.kind !== 'profile')) refuse();
  if (
    !profile ||
    profile.kind !== 'profile' ||
    !profile.enabled ||
    profile.spaceId !== selected.scope.spaceId ||
    profile.createdAt !== selected.scope.profileCreatedAt ||
    profile.connectionGeneration !== selected.scope.connectionGeneration
  ) {
    await tx.done;
    return [];
  }
  const matches: CatalogMaterializationSelection[] = [];
  for (const selection of selected.selections) {
    const state = await rootState(tx, selected.scope.spaceId, selection.rootKind, selection.rootId);
    if (
      !state ||
      state.deleted ||
      state.basis.length !== 1 ||
      state.basis[0] !== selection.operationId
    )
      continue;
    const key = JSON.stringify([
      'applied-operation',
      selected.scope.spaceId,
      selection.operationId,
    ]);
    const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(key);
    if (raw === undefined) {
      const outgoing = await readOutgoingOperation(
        tx,
        selected.scope.spaceId,
        selection.operationId
      );
      if (
        outgoing?.phase === 'published' &&
        outgoing.rootKey === state.rootKey &&
        outgoing.rootKind === selection.rootKind &&
        outgoing.rootId === selection.rootId &&
        outgoing.generation === state.generation &&
        outgoing.profileCreatedAt === selected.scope.profileCreatedAt &&
        outgoing.connectionGeneration === selected.scope.connectionGeneration &&
        outgoing.publication.preparedSha256 === selection.sourceDigest
      )
        matches.push(selection);
      continue;
    }
    const receipt = parseSyncCaptureRecord(raw);
    if (!receipt || receipt.kind !== 'applied-operation') refuse();
    if (
      receipt.key === key &&
      receipt.spaceId === selected.scope.spaceId &&
      receipt.rootKey === state.rootKey &&
      receipt.operationId === selection.operationId &&
      receipt.sourceDigest === selection.sourceDigest &&
      receipt.generation === state.generation
    )
      matches.push(selection);
  }
  await tx.done;
  return matches;
}

/** Read only native causal bases for bounded catalog roots; absent roots stay remote-only. */
export async function loadCatalogNativeBases(args: {
  scope: SyncConnectionScope;
  authorization: SyncConnectionIdentity;
  roots: readonly { rootKind: CaptureRootKind; rootId: string }[];
}) {
  const selected = structuredClone(args);
  const authorization = parseSyncConnectionIdentity(selected.authorization);
  if (
    !authorization ||
    selected.roots.length > 10_000 ||
    selected.roots.some(
      (root) =>
        !['media', 'video-project', 'video-review', 'scenario-project'].includes(root.rootKind) ||
        !root.rootId ||
        root.rootId.length > 256
    ) ||
    new Set(selected.roots.map((root) => JSON.stringify([root.rootKind, root.rootId]))).size !==
      selected.roots.length
  )
    refuse();
  const db = await initDB();
  const tx = db.transaction([SYNC_CAPTURE_STORE, SYNC_CONNECTION_STORE], 'readonly');
  await checkSyncConnectionAdmission(tx, selected.scope, authorization);
  const profile = parseSyncCaptureRecord(await tx.objectStore(SYNC_CAPTURE_STORE).get('profile'));
  if (!profile || profile.kind !== 'profile' || !profile.enabled) refuse();
  const bases: {
    rootKind: CaptureRootKind;
    rootId: string;
    generation: number;
    basis: string[];
    pending?: true;
  }[] = [];
  for (const root of selected.roots) {
    const state = await rootState(tx, selected.scope.spaceId, root.rootKind, root.rootId);
    const pending = await readCheckpointInTransaction(tx, selected.scope, root);
    if (state || pending)
      bases.push({
        ...root,
        generation: state?.generation ?? 0,
        basis: [...(state?.basis ?? [])],
        ...(pending ? { pending: true as const } : {}),
      });
  }
  await tx.done;
  return bases;
}
