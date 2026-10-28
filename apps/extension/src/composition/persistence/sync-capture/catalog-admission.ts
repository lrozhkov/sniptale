import { readScenarioProjectDependenciesInTransaction } from './scenario-dependencies';
import { readOutgoingOperation } from './outgoing';
import { readScenarioStorage } from '../scenario/storage';
import { parseScenarioProjectEntry } from '../scenario/read-guards';
import { SCENARIO_CAPTURE_STORES } from './scenario-snapshot';
import type { CausalRootDependency } from './contracts';
import { captureProfileBounds } from './contracts';
import type { IDBPTransaction } from 'idb';
import { initDB } from '../infrastructure/indexed-db/core';
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
import { captureRootKey, type CaptureRootKind } from './contracts';
import { parseSyncCaptureRecord } from './guards';
import { freezeImageInTransaction, digestCapturedImageRows } from './image-snapshot';
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
  const key = JSON.stringify(['root-state', rootKey]);
  const raw: unknown = await tx.objectStore(SYNC_CAPTURE_STORE).get(key);
  if (raw === undefined) return null;
  const state = parseSyncCaptureRecord(raw);
  if (
    !state ||
    state.kind !== 'root-state' ||
    state.key !== key ||
    state.rootKey !== rootKey ||
    state.spaceId !== spaceId ||
    state.rootKind !== rootKind ||
    state.rootId !== rootId
  )
    refuse();
  return state;
}

async function workspaceRevision(tx: ReadTransaction, rootKind: CaptureRootKind, rootId: string) {
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
  return media.source.kind === 'screenshot' ||
    (media.source.kind === 'stored-asset' && media.mimeType.startsWith('image/'))
    ? (media.workspaceRevision ?? 0)
    : null;
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
  const state = await rootState(tx, selected.scope.spaceId, selected.rootKind, selected.rootId);
  const revision = await workspaceRevision(tx, selected.rootKind, selected.rootId);
  const dependencies: ApplyPreparedVideoProjectRevisionInput['dependencies'][number][] = [];
  const rootDependencies = await readScenarioProjectDependenciesInTransaction(
    tx,
    selected.scope.spaceId,
    selected.dependencyRoots ?? []
  );
  if (!rootDependencies) refuse();
  for (const mediaId of selected.dependencyMediaIds) {
    const dependencyState = await rootState(tx, selected.scope.spaceId, 'media', mediaId);
    if (!dependencyState || dependencyState.deleted || dependencyState.basis.length !== 1) refuse();
    const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
    if (!media || media.lifecycle?.storageClass !== 'library') refuse();
    const image = media.source.kind === 'stored-asset' && media.mimeType.startsWith('image/');
    const rows = image
      ? await freezeImageInTransaction(tx, mediaId)
      : await freezeMediaInTransaction(tx, mediaId, { allowIndependentReview: true });
    const ref = 'ref' in rows ? rows.ref : rows.originalRef;
    const digest = 'ref' in rows ? digestCapturedMediaRows(rows) : digestCapturedImageRows(rows);
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
  }[] = [];
  for (const root of selected.roots) {
    const state = await rootState(tx, selected.scope.spaceId, root.rootKind, root.rootId);
    if (state)
      bases.push({
        rootKind: state.rootKind,
        rootId: state.rootId,
        generation: state.generation,
        basis: [...state.basis],
      });
  }
  await tx.done;
  return bases;
}
