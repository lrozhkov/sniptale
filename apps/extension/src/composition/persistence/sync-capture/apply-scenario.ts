import type { IDBPTransaction } from 'idb';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { getScenarioResourceReferences } from '../../../features/scenario/project/public';
import {
  parseAssetRef,
  listReadyJournals,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
} from '../assets';
import { parseAssetOwner } from '../assets/guards';
import type { DurableAssetLifecyclePermit } from '../infrastructure/mutation-barrier';
import { initDB } from '../infrastructure/indexed-db/core';
import * as stores from '../infrastructure/indexed-db/core.stores';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  parseSyncConnectionIdentity,
  type SyncConnectionIdentity,
} from '../remote-connection/model';
import { checkSyncConnectionAdmission } from '../remote-connection/store';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { assertPreparedLibrarySource } from '../projects/source-admission';
import { putScenarioProjectBackupRestore } from '../scenario/backup-restore';
import { readScenarioStorage, createScenarioProjectStore } from '../scenario/storage';
import { parseScenarioProjectEntry } from '../scenario/read-guards';
import { assertBorrowedScenarioAssetSource } from '../scenario/library-publication';
import { parseSyncCaptureRecord } from './guards';
import {
  captureRootKey,
  captureProfileBounds,
  type SyncCaptureRootState,
  type SyncCaptureAppliedOperation,
} from './contracts';
import {
  SCENARIO_CAPTURE_STORES,
  digestCapturedScenarioRows,
  freezeScenarioInTransaction,
  isBoundedScenarioMetadata,
} from './scenario-snapshot';
import {
  hydratePreparedScenarioReplicaRoot,
  parsePreparedScenarioReplicaRoot,
  type PreparedScenarioReplicaRoot,
} from './prepared-scenario';
import type { ApplyPreparedVideoProjectRevisionInput } from './apply-video-project';

/** Target-issued native predecessor and exact resource closure for a selected Scenario revision. */
export interface ApplyPreparedScenarioReplicaInput {
  authorization?: SyncConnectionIdentity;
  spaceId: string;
  profileCreatedAt: number;
  connectionGeneration: number;
  operationId: string;
  sourceDigest: string;
  expectedBasis: readonly string[];
  expectedLocalGeneration: number;
  expectedWorkspaceRevision: number | null;
  root: PreparedScenarioReplicaRoot;
  dependencies: ApplyPreparedVideoProjectRevisionInput['dependencies'];
}
function refuse(): never {
  throw new Error('Incoming Scenario predecessor or resource admission refused.');
}
function ordinal(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}
function identity(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 256;
}
/** Parse journal recovery input through native owners before any mutation or resource hydration. */
export function parseApplyPreparedScenarioReplicaInput(
  value: unknown
): ApplyPreparedScenarioReplicaInput {
  if (
    !isRecord(value) ||
    !isBoundedScenarioMetadata(value, false) ||
    !identity(value['spaceId']) ||
    !identity(value['operationId']) ||
    typeof value['sourceDigest'] !== 'string' ||
    !/^[a-f0-9]{64}$/u.test(value['sourceDigest']) ||
    !ordinal(value['profileCreatedAt']) ||
    !ordinal(value['connectionGeneration']) ||
    !ordinal(value['expectedLocalGeneration']) ||
    (value['expectedWorkspaceRevision'] !== null && !ordinal(value['expectedWorkspaceRevision'])) ||
    !Array.isArray(value['expectedBasis']) ||
    value['expectedBasis'].length !== (value['expectedLocalGeneration'] === 0 ? 0 : 1) ||
    !value['expectedBasis'].every(identity) ||
    !Array.isArray(value['dependencies']) ||
    value['dependencies'].length > captureProfileBounds('scenario-project').rows
  )
    refuse();
  const authorization =
    value['authorization'] === undefined
      ? undefined
      : parseSyncConnectionIdentity(value['authorization']);
  if (authorization === null) refuse();
  const dependencies = value['dependencies'].map((raw: unknown) => {
    if (!isRecord(raw)) refuse();
    const entry = parseMediaLibraryEntry(raw['entry']);
    const ref = parseAssetRef(raw['ref']);
    if (
      !entry ||
      entry.blob ||
      !ref ||
      entry.size !== ref.size ||
      entry.mimeType !== ref.mimeType ||
      !ordinal(raw['expectedGeneration']) ||
      raw['expectedGeneration'] < 1 ||
      !Array.isArray(raw['expectedBasis']) ||
      raw['expectedBasis'].length !== 1 ||
      !raw['expectedBasis'].every(identity)
    )
      refuse();
    return {
      entry,
      ref,
      expectedGeneration: raw['expectedGeneration'],
      expectedBasis: [...raw['expectedBasis']],
    };
  });
  if (new Set(dependencies.map((item) => item.entry.id)).size !== dependencies.length) refuse();
  return {
    ...(authorization ? { authorization } : {}),
    spaceId: value['spaceId'],
    operationId: value['operationId'],
    sourceDigest: value['sourceDigest'],
    profileCreatedAt: value['profileCreatedAt'],
    connectionGeneration: value['connectionGeneration'],
    expectedLocalGeneration: value['expectedLocalGeneration'],
    expectedWorkspaceRevision: value['expectedWorkspaceRevision'],
    expectedBasis: [...value['expectedBasis']],
    dependencies,
    root: parsePreparedScenarioReplicaRoot(value['root']),
  };
}
function keys(input: ApplyPreparedScenarioReplicaInput) {
  const rootKey = captureRootKey(input.spaceId, 'scenario-project', input.root.entry.id);
  return {
    rootKey,
    stateKey: JSON.stringify(['root-state', rootKey]),
    receiptKey: JSON.stringify(['applied-operation', input.spaceId, input.operationId]),
  };
}
async function receipt(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  input: ApplyPreparedScenarioReplicaInput
): Promise<number | null> {
  const key = keys(input);
  const raw: unknown = await tx.objectStore(stores.SYNC_CAPTURE_STORE).get(key.receiptKey);
  if (raw === undefined) return null;
  const row = parseSyncCaptureRecord(raw);
  if (
    !row ||
    row.kind !== 'applied-operation' ||
    row.key !== key.receiptKey ||
    row.spaceId !== input.spaceId ||
    row.rootKey !== key.rootKey ||
    row.operationId !== input.operationId ||
    row.sourceDigest !== input.sourceDigest
  )
    refuse();
  return row.generation;
}
async function checkProfile(
  tx: IDBPTransaction<unknown, string[], 'readonly' | 'readwrite'>,
  input: ApplyPreparedScenarioReplicaInput
) {
  const profile = parseSyncCaptureRecord(
    await tx.objectStore(stores.SYNC_CAPTURE_STORE).get('profile')
  );
  if (
    !profile ||
    profile.kind !== 'profile' ||
    profile.spaceId !== input.spaceId ||
    profile.createdAt !== input.profileCreatedAt ||
    profile.connectionGeneration !== input.connectionGeneration
  )
    refuse();
  return profile;
}

/** Offer predecessor child refs for streamed hash comparison; native publication repeats all fences. */
export async function loadScenarioReplicaPredecessorAssets(input: {
  spaceId: string;
  profileCreatedAt: number;
  connectionGeneration: number;
  rootId: string;
  expectedLocalGeneration: number;
  expectedBasis: readonly string[];
}) {
  const selected = structuredClone(input);
  if (
    !identity(selected.rootId) ||
    !identity(selected.spaceId) ||
    !ordinal(selected.expectedLocalGeneration) ||
    selected.expectedLocalGeneration < 1 ||
    selected.expectedBasis.length !== 1 ||
    !selected.expectedBasis.every(identity)
  )
    refuse();
  const db = await initDB();
  const tx = db.transaction([...SCENARIO_CAPTURE_STORES], 'readonly');
  const profile = parseSyncCaptureRecord(
    await tx.objectStore(stores.SYNC_CAPTURE_STORE).get('profile')
  );
  if (
    !profile ||
    profile.kind !== 'profile' ||
    !profile.enabled ||
    profile.spaceId !== selected.spaceId ||
    profile.createdAt !== selected.profileCreatedAt ||
    profile.connectionGeneration !== selected.connectionGeneration
  )
    refuse();
  const rootKey = captureRootKey(selected.spaceId, 'scenario-project', selected.rootId);
  const state = parseSyncCaptureRecord(
    await tx.objectStore(stores.SYNC_CAPTURE_STORE).get(JSON.stringify(['root-state', rootKey]))
  );
  if (
    !state ||
    state.kind !== 'root-state' ||
    state.rootKey !== rootKey ||
    state.spaceId !== selected.spaceId ||
    state.rootKind !== 'scenario-project' ||
    state.rootId !== selected.rootId ||
    state.deleted ||
    state.generation !== selected.expectedLocalGeneration ||
    JSON.stringify(state.basis) !== JSON.stringify(selected.expectedBasis)
  )
    refuse();
  const rows = await freezeScenarioInTransaction(tx, selected.rootId);
  if (state.nativeDigest !== digestCapturedScenarioRows(rows)) refuse();
  const result = [];
  for (const entry of rows.assets) {
    const ref = rows.refs.find((item) => item.assetId === entry.assetId);
    const owner = parseAssetOwner(
      await tx.objectStore(stores.ASSET_OWNERS_STORE).get(['scenario-asset', entry.id, 'body'])
    );
    if (
      !ref ||
      !owner ||
      owner.ownerKind !== 'scenario-asset' ||
      owner.ownerId !== entry.id ||
      owner.role !== 'body' ||
      owner.assetId !== entry.assetId
    )
      refuse();
    result.push({ entry, ref });
  }
  await tx.done;
  return structuredClone(result);
}
type ScenarioWriteTransaction = IDBPTransaction<unknown, string[], 'readwrite'>;
type NativeScenarioRoot = Awaited<ReturnType<typeof hydratePreparedScenarioReplicaRoot>>;
type ScenarioDeleteOperation = ReturnType<typeof buildPhysicalDeleteOperation>;

async function assertScenarioPublicationAvailable(rootId: string): Promise<void> {
  for (const journal of await listReadyJournals()) {
    if (
      journal.domain === 'scenario-html-exports' &&
      (!isRecord(journal.payload) || journal.payload['projectId'] === rootId)
    )
      refuse();
    if (
      journal.domain === 'scenario-assets' &&
      (!isRecord(journal.payload) ||
        !isRecord(journal.payload['project']) ||
        journal.payload['project']['id'] === rootId)
    )
      refuse();
  }
}

function assertScenarioResourceClosure(root: NativeScenarioRoot): void {
  const resources = new Set(root.assets.map((item) => item.entry.id));
  const documents = new Set(root.stepDocuments.map((item) => item.entry.stepId));
  for (const project of [
    root.entry.project,
    ...(root.entry.history ?? []).map((version) => version.project),
  ]) {
    const refs = getScenarioResourceReferences(project);
    if (
      [...refs.assets].some((id) => !resources.has(id)) ||
      [...refs.documents].some((id) => !documents.has(id))
    )
      refuse();
  }
}

async function admitScenarioPredecessor(
  tx: ScenarioWriteTransaction,
  input: ApplyPreparedScenarioReplicaInput,
  root: NativeScenarioRoot
) {
  const key = keys(input);
  const rawState: unknown = await tx.objectStore(stores.SYNC_CAPTURE_STORE).get(key.stateKey);
  const state = rawState === undefined ? null : parseSyncCaptureRecord(rawState);
  if (
    rawState !== undefined &&
    (!state || state.kind !== 'root-state' || state.rootKey !== key.rootKey)
  )
    refuse();
  if (state && state.kind !== 'root-state') refuse();
  const currentRaw = (await readScenarioStorage(tx, root.entry.id)).logical;
  const current = currentRaw === undefined ? null : parseScenarioProjectEntry(currentRaw);
  if (currentRaw !== undefined && !current) refuse();
  if (current && (!state || !state.nativeDigest)) refuse();
  if (!current)
    for (const name of [
      stores.SCENARIO_ASSETS_STORE,
      stores.SCENARIO_EXPORTS_STORE,
      stores.SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
    ])
      if ((await tx.objectStore(name).index('projectId').getAll(root.entry.id)).length) refuse();
  for (const rawCapture of await tx
    .objectStore(stores.SYNC_CAPTURE_STORE)
    .index('rootKey')
    .getAll(key.rootKey)) {
    const capture = parseSyncCaptureRecord(rawCapture);
    if (!capture || (capture.kind === 'sync-operation' && capture.phase !== 'published')) refuse();
  }
  if (
    (state?.generation ?? 0) !== input.expectedLocalGeneration ||
    JSON.stringify(state?.basis ?? []) !== JSON.stringify(input.expectedBasis) ||
    (current?.workspaceRevision ?? null) !== input.expectedWorkspaceRevision ||
    (state && (current ? state.deleted === true : state.deleted !== true))
  )
    refuse();
  if (
    current &&
    state?.nativeDigest &&
    digestCapturedScenarioRows(await freezeScenarioInTransaction(tx, root.entry.id)) !==
      state.nativeDigest
  )
    refuse();
  return { key, state, current };
}

async function assertScenarioBorrowedDependencies(
  tx: ScenarioWriteTransaction,
  input: ApplyPreparedScenarioReplicaInput,
  root: NativeScenarioRoot
): Promise<void> {
  for (const dependency of input.dependencies) {
    const dependencyKey = captureRootKey(input.spaceId, 'media', dependency.entry.id);
    const dependencyState = parseSyncCaptureRecord(
      await tx
        .objectStore(stores.SYNC_CAPTURE_STORE)
        .get(JSON.stringify(['root-state', dependencyKey]))
    );
    if (
      !dependencyState ||
      dependencyState.kind !== 'root-state' ||
      dependencyState.deleted ||
      dependencyState.generation !== dependency.expectedGeneration ||
      JSON.stringify(dependencyState.basis) !== JSON.stringify(dependency.expectedBasis)
    )
      refuse();
    await assertPreparedLibrarySource(
      dependency,
      {
        recordings: tx.objectStore(stores.STORE_NAME),
        media: tx.objectStore(stores.MEDIA_LIBRARY_STORE),
        assets: tx.objectStore(stores.PROJECT_ASSETS_STORE),
        exports: tx.objectStore(stores.PROJECT_EXPORTS_STORE),
        refs: tx.objectStore(stores.ASSET_REFS_STORE),
      },
      { allowRetainedTrash: true }
    );
  }
  const needed = new Set(
    root.assets.flatMap((asset) =>
      asset.entry.borrowedMediaId ? [asset.entry.borrowedMediaId] : []
    )
  );
  if ([...needed].some((id) => !input.dependencies.some((item) => item.entry.id === id))) refuse();
  for (const asset of root.assets)
    if (asset.entry.borrowedMediaId) await assertBorrowedScenarioAssetSource(tx, asset.entry);
}

async function publishScenarioReplica(
  tx: ScenarioWriteTransaction,
  input: ApplyPreparedScenarioReplicaInput,
  root: NativeScenarioRoot,
  operation: ScenarioDeleteOperation,
  admission: Awaited<ReturnType<typeof admitScenarioPredecessor>>
) {
  const { key, state, current } = admission;
  const revision =
    Math.max(
      root.entry.workspaceRevision,
      current?.workspaceRevision ?? 0,
      state?.nativeRevision ?? 0
    ) + 1;
  if (!Number.isSafeInteger(revision)) refuse();
  const acceptedRoot = { ...root, entry: { ...root.entry, workspaceRevision: revision } };
  const published = await putScenarioProjectBackupRestore({
    root: acceptedRoot,
    operation,
    strategy: 'replace',
    preserveVideoProjectSources: true,
    tx,
    stores: {
      assets: tx.objectStore(stores.SCENARIO_ASSETS_STORE),
      exports: tx.objectStore(stores.SCENARIO_EXPORTS_STORE),
      operations: tx.objectStore(stores.ASSET_OPERATIONS_STORE),
      owners: tx.objectStore(stores.ASSET_OWNERS_STORE),
      presentations: tx.objectStore(stores.AGGREGATE_PRESENTATIONS_STORE),
      projects: createScenarioProjectStore(tx),
      refs: tx.objectStore(stores.ASSET_REFS_STORE),
      stepDocuments: tx.objectStore(stores.SCENARIO_STEP_EDITOR_DOCUMENTS_STORE),
      thumbnails: tx.objectStore(stores.THUMBNAILS_STORE),
    },
  });
  if (!published.imported) refuse();
  if (root.entry.lifecycle?.storageClass === 'temporary') {
    const accepted = parseScenarioProjectEntry(
      (await readScenarioStorage(tx, root.entry.id)).logical
    );
    if (!accepted) refuse();
    await createScenarioProjectStore(tx).put({ ...accepted, lifecycle: root.entry.lifecycle });
  }
  const generation = (state?.generation ?? 0) + 1;
  const native = await freezeScenarioInTransaction(tx, root.entry.id);
  const next: SyncCaptureRootState = {
    version: 1,
    kind: 'root-state',
    key: key.stateKey,
    createdAt: Date.now(),
    spaceId: input.spaceId,
    rootKind: 'scenario-project',
    rootId: root.entry.id,
    rootKey: key.rootKey,
    generation,
    basis: [input.operationId],
    nativeRevision: revision,
    nativeDigest: digestCapturedScenarioRows(native),
  };
  const applied: SyncCaptureAppliedOperation = {
    version: 1,
    kind: 'applied-operation',
    key: key.receiptKey,
    createdAt: Date.now(),
    spaceId: input.spaceId,
    rootKey: key.rootKey,
    operationId: input.operationId,
    sourceDigest: input.sourceDigest,
    generation,
  };
  await tx.objectStore(stores.SYNC_CAPTURE_STORE).put(next);
  await tx.objectStore(stores.SYNC_CAPTURE_STORE).put(applied);
  if (operation.assetIds.length) await tx.objectStore(stores.ASSET_OPERATIONS_STORE).put(operation);
  return { status: 'applied' as const, generation };
}

/** Publish through the canonical Scenario owner with causal, source and monotone revision fences. */
export async function applyPreparedScenarioReplica(
  raw: ApplyPreparedScenarioReplicaInput,
  lifecyclePermit?: DurableAssetLifecyclePermit
) {
  const input = structuredClone(parseApplyPreparedScenarioReplicaInput(raw));
  const db = await initDB();
  const read = db.transaction(
    [stores.SYNC_CAPTURE_STORE, stores.SYNC_CONNECTION_STORE],
    'readonly'
  );
  await checkProfile(read, input);
  const duplicate = await receipt(read, input);
  await read.done;
  if (duplicate !== null) return { status: 'duplicate' as const, generation: duplicate };
  await assertScenarioPublicationAvailable(input.root.entry.id);
  const root = await hydratePreparedScenarioReplicaRoot(input.root);
  assertScenarioResourceClosure(root);
  const operation = buildPhysicalDeleteOperation([]);
  const result = await runWithIndexedDbMutation(async (database) => {
    const tx = database.transaction(
      [
        ...new Set([
          ...SCENARIO_CAPTURE_STORES,
          stores.SYNC_CONNECTION_STORE,
          stores.ASSET_OPERATIONS_STORE,
          stores.VIDEO_PROJECTS_STORE,
        ]),
      ],
      'readwrite'
    );
    try {
      const profile = await checkProfile(tx, input);
      const replay = await receipt(tx, input);
      if (replay !== null) {
        await tx.done;
        return { status: 'duplicate' as const, generation: replay };
      }
      if (input.authorization) await checkSyncConnectionAdmission(tx, input, input.authorization);
      if (!profile.enabled) refuse();
      const admission = await admitScenarioPredecessor(tx, input, root);
      await assertScenarioBorrowedDependencies(tx, input, root);
      const published = await publishScenarioReplica(tx, input, root, operation, admission);
      await tx.done;
      return published;
    } catch (error) {
      return abortIndexedDbMutation(tx, error);
    }
  });
  if (operation.assetIds.length)
    await completePhysicalDeleteOperation(operation, lifecyclePermit).catch(() => undefined);
  return result;
}
