import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  initDB,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type { PreparedScenarioAssetEntry, ScenarioProjectEntry } from './contracts';
import { createScenarioProjectEntry } from './projects/entry';
import { parseScenarioProjectEntry } from './read-guards';
import { parseScenarioAssetEntry } from './read-guards';
import { parseScenarioStepEditorDocumentEntry } from './editor-documents/index.guards';
import type { LibraryStorageClass } from '../library-lifecycle/contracts';
import { parseScenarioProject } from './projects/guards';
import { areScenarioProjectsEqual } from './aggregate-comparison';
import { isScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { isRecord } from '../infrastructure/indexed-db/read-primitives';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  createAssetPublicationJournal,
  deleteAssetObject,
  parseAssetRef,
  publishReadyJournalWithRetry,
  recoverStandaloneAssetPublications,
  releaseAssetReadyProtection,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  type AssetRef,
  type PhysicalDeleteAssetOperation,
} from '../assets';
import {
  rejectScenarioMutationBeforeHandoff,
  SCENARIO_ASSET_OWNER_KIND,
  SCENARIO_ASSET_PUBLICATION_DOMAIN,
  SCENARIO_ASSET_ROLE,
  type ScenarioAggregateChildMutation,
  type PreparedScenarioAggregateChildMutation,
  type PreparedScenarioStepEditorDocumentEntry,
} from './asset-staging';
import {
  applyScenarioDocumentMutations,
  discardPreparedScenarioEditorDocuments,
  prepareScenarioEditorDocumentMutations,
  SCENARIO_EDITOR_DOCUMENT_OWNER_KIND,
} from './editor-document-staging';
export {
  discardScenarioAggregateAssetPuts,
  SCENARIO_ASSET_OWNER_KIND,
  SCENARIO_ASSET_PUBLICATION_DOMAIN,
  SCENARIO_ASSET_ROLE,
  type ScenarioAggregateChildMutation,
} from './asset-staging';

type StoredScenarioProject = ScenarioProject | ScenarioProjectV3;

class StaleScenarioAggregateRevisionError extends Error {
  constructor(projectId: string) {
    super(`Scenario project ${projectId} was changed before this save completed`);
    this.name = 'StaleScenarioAggregateRevisionError';
  }
}

interface CommitScenarioAggregateMutationOptions {
  children?: ScenarioAggregateChildMutation;
  expectedRevision?: number | null;
  /** Compatibility CAS for callers that have not yet adopted workspaceRevision. */
  expectedUpdatedAt?: number | null;
  storageClass?: LibraryStorageClass;
  publicationUpdatedAt?: number;
}

interface PreparedCommitScenarioAggregateMutationOptions extends Omit<
  CommitScenarioAggregateMutationOptions,
  'children'
> {
  children?: PreparedScenarioAggregateChildMutation;
}

interface ScenarioAggregatePublicationPayload<
  TProject extends StoredScenarioProject = StoredScenarioProject,
> {
  baseRevision: number | null;
  children: PreparedScenarioAggregateChildMutation;
  committedAt: number;
  expectedUpdatedAt?: number | null;
  project: TProject;
  storageClass?: LibraryStorageClass;
  targetEntry: ScenarioProjectEntry;
}

interface ScenarioAggregateMutationResult<TProject extends StoredScenarioProject> {
  project: TProject;
  workspaceRevision: number;
}

type ScenarioAggregateTransaction = ReturnType<Awaited<ReturnType<typeof initDB>>['transaction']>;

function hasScenarioChildMutations(
  children: PreparedScenarioAggregateChildMutation | undefined
): boolean {
  return (
    (children?.assetDeletes?.length ?? 0) > 0 ||
    (children?.assetPuts?.length ?? 0) > 0 ||
    (children?.editorDocumentDeletes?.length ?? 0) > 0 ||
    (children?.editorDocumentPuts?.length ?? 0) > 0
  );
}

function assertExpectedScenarioRevision(args: {
  existing: ScenarioProjectEntry | undefined;
  expectedRevision: number | null | undefined;
  expectedUpdatedAt: number | null | undefined;
  projectId: string;
}): void {
  if (args.expectedRevision !== undefined) {
    const actualRevision = args.existing?.workspaceRevision ?? null;
    if (actualRevision !== args.expectedRevision) {
      throw new StaleScenarioAggregateRevisionError(args.projectId);
    }
  }
  if (args.expectedUpdatedAt !== undefined) {
    const actualUpdatedAt = args.existing?.project.updatedAt ?? null;
    if (actualUpdatedAt !== args.expectedUpdatedAt) {
      throw new StaleScenarioAggregateRevisionError(args.projectId);
    }
  }
}

function assertChildOwnership(
  projectId: string,
  children: PreparedScenarioAggregateChildMutation | ScenarioAggregateChildMutation | undefined
): void {
  for (const asset of children?.assetPuts ?? []) {
    if (asset.projectId !== projectId) {
      throw new Error(`Scenario asset ${asset.id} belongs to another project.`);
    }
  }
  for (const document of children?.editorDocumentPuts ?? []) {
    if (document.projectId !== projectId) {
      throw new Error(`Scenario editor document ${document.stepId} belongs to another project.`);
    }
  }
}

function getMutationStoreNames(children: PreparedScenarioAggregateChildMutation | undefined) {
  const storeNames: Array<
    | typeof SCENARIO_PROJECTS_STORE
    | typeof SCENARIO_ASSETS_STORE
    | typeof SCENARIO_STEP_EDITOR_DOCUMENTS_STORE
    | typeof ASSET_REFS_STORE
    | typeof ASSET_OWNERS_STORE
    | typeof ASSET_OPERATIONS_STORE
  > = [SCENARIO_PROJECTS_STORE];
  if ((children?.assetPuts?.length ?? 0) > 0 || (children?.assetDeletes?.length ?? 0) > 0) {
    storeNames.push(
      SCENARIO_ASSETS_STORE,
      ASSET_REFS_STORE,
      ASSET_OWNERS_STORE,
      ASSET_OPERATIONS_STORE
    );
  }
  if (
    (children?.editorDocumentPuts?.length ?? 0) > 0 ||
    (children?.editorDocumentDeletes?.length ?? 0) > 0
  ) {
    storeNames.push(
      SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
      ASSET_REFS_STORE,
      ASSET_OWNERS_STORE,
      ASSET_OPERATIONS_STORE
    );
  }
  return [...new Set(storeNames)];
}

export async function commitScenarioAggregateMutation<TProject extends StoredScenarioProject>(
  project: TProject,
  options: CommitScenarioAggregateMutationOptions = {}
): Promise<ScenarioAggregateMutationResult<TProject>> {
  assertChildOwnership(project.id, options.children);
  await recoverScenarioAssetPublications();
  let preparedChildren: PreparedScenarioAggregateChildMutation | undefined;
  try {
    preparedChildren = await prepareScenarioEditorDocumentMutations(options.children);
  } catch (error) {
    return rejectScenarioMutationBeforeHandoff(options.children, error);
  }
  const { children: _children, ...optionMetadata } = options;
  const preparedOptions: PreparedCommitScenarioAggregateMutationOptions = {
    ...optionMetadata,
    ...(preparedChildren ? { children: preparedChildren } : {}),
  };
  const assetRefs = [
    ...(preparedChildren?.assetPuts ?? []).map((asset) => asset.assetRef),
    ...(preparedChildren?.editorDocumentPuts ?? []).flatMap((entry) => entry.assetRefs),
  ];
  if (assetRefs.length === 0) {
    return runWithIndexedDbMutation((db) =>
      commitScenarioAggregateInTransaction(db, project, preparedOptions)
    );
  }
  let journalCreated = false;
  try {
    assertChildOwnership(project.id, preparedChildren);
    const db = await initDB();
    const existing = parseScenarioProjectEntry(await db.get(SCENARIO_PROJECTS_STORE, project.id));
    assertExpectedScenarioRevision({
      existing: existing ?? undefined,
      expectedRevision: preparedOptions.expectedRevision,
      expectedUpdatedAt: preparedOptions.expectedUpdatedAt,
      projectId: project.id,
    });
    const committedAt = Date.now();
    const targetEntry = createScenarioAggregateEntry({
      existing: existing ?? undefined,
      options: { ...preparedOptions, publicationUpdatedAt: committedAt },
      project,
    });
    const payload: ScenarioAggregatePublicationPayload<TProject> = {
      baseRevision: existing?.workspaceRevision ?? null,
      children: preparedChildren!,
      committedAt,
      ...(preparedOptions.expectedUpdatedAt === undefined
        ? {}
        : { expectedUpdatedAt: preparedOptions.expectedUpdatedAt }),
      project,
      targetEntry,
      ...(preparedOptions.storageClass === undefined
        ? {}
        : { storageClass: preparedOptions.storageClass }),
    };
    const journal = await createAssetPublicationJournal({
      assetRefs,
      domain: SCENARIO_ASSET_PUBLICATION_DOMAIN,
      payload,
    });
    journalCreated = true;
    let result: ScenarioAggregateMutationResult<TProject> | undefined;
    await publishReadyJournalWithRetry(journal, async (ready) => {
      result = (await publishScenarioAssetJournal(
        ready
      )) as ScenarioAggregateMutationResult<TProject>;
    });
    await releaseAssetReadyProtection(assetRefs.map((ref) => ref.assetId));
    if (!result) throw new Error('Scenario asset publication produced no result.');
    return result;
  } catch (error) {
    if (!journalCreated) {
      let documentCleanupError: unknown;
      try {
        await discardPreparedScenarioEditorDocuments(preparedChildren);
      } catch (cleanupError) {
        documentCleanupError = cleanupError;
      }
      if (documentCleanupError !== undefined) {
        throw new AggregateError(
          [error, documentCleanupError],
          'Scenario mutation and editor document cleanup failed.',
          { cause: error }
        );
      }
      return rejectScenarioMutationBeforeHandoff(preparedChildren, error);
    }
    throw error;
  }
}

async function commitScenarioAggregateInTransaction<TProject extends StoredScenarioProject>(
  db: Awaited<ReturnType<typeof initDB>>,
  project: TProject,
  options: PreparedCommitScenarioAggregateMutationOptions
): Promise<ScenarioAggregateMutationResult<TProject>> {
  const physicalDelete = buildPhysicalDeleteOperation([]);
  const tx = db.transaction(getMutationStoreNames(options.children), 'readwrite');
  const projectStore = tx.objectStore(SCENARIO_PROJECTS_STORE);
  const existing = parseScenarioProjectEntry(await projectStore.get(project.id)) ?? undefined;
  if (
    existing &&
    !hasScenarioChildMutations(options.children) &&
    areScenarioProjectsEqual(existing.project, project)
  ) {
    await tx.done;
    return {
      project: existing.project as TProject,
      workspaceRevision: existing.workspaceRevision ?? 0,
    };
  }
  assertExpectedScenarioRevision({
    existing,
    expectedRevision: options.expectedRevision,
    expectedUpdatedAt: options.expectedUpdatedAt,
    projectId: project.id,
  });
  const entry = createScenarioAggregateEntry({ existing, options, project });
  await applyScenarioAssetMutations(tx, project.id, options.children, physicalDelete);
  await projectStore.put(entry);
  await applyScenarioDocumentMutations({
    children: options.children,
    physicalDelete,
    projectId: project.id,
    tx,
    updatedAt: entry.updatedAt,
  });
  await tx.done;
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
  return { project: entry.project, workspaceRevision: entry.workspaceRevision ?? 0 };
}

function createScenarioAggregateEntry<TProject extends StoredScenarioProject>(args: {
  existing: ScenarioProjectEntry | undefined;
  options: PreparedCommitScenarioAggregateMutationOptions;
  project: TProject;
}): ScenarioProjectEntry & { project: TProject } {
  return (
    args.project.version === 3
      ? createScenarioProjectEntry({
          existing: args.existing,
          project: args.project as ScenarioProjectV3,
          ...(args.options.storageClass === undefined
            ? {}
            : { storageClass: args.options.storageClass }),
          ...(args.options.publicationUpdatedAt === undefined
            ? {}
            : { updatedAt: args.options.publicationUpdatedAt }),
        })
      : createScenarioProjectEntry({
          existing: args.existing,
          project: args.project as ScenarioProject,
          ...(args.options.storageClass === undefined
            ? {}
            : { storageClass: args.options.storageClass }),
          ...(args.options.publicationUpdatedAt === undefined
            ? {}
            : { updatedAt: args.options.publicationUpdatedAt }),
        })
  ) as ScenarioProjectEntry & { project: TProject };
}

async function applyScenarioAssetMutations(
  tx: ScenarioAggregateTransaction,
  projectId: string,
  children: PreparedScenarioAggregateChildMutation | undefined,
  physicalDelete: PhysicalDeleteAssetOperation
): Promise<void> {
  if ((children?.assetPuts?.length ?? 0) === 0 && (children?.assetDeletes?.length ?? 0) === 0) {
    return;
  }
  const assetStore = tx.objectStore(SCENARIO_ASSETS_STORE);
  const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
  const refStore = tx.objectStore(ASSET_REFS_STORE);
  for (const asset of children?.assetPuts ?? []) {
    const rawAsset: unknown = await assetStore.get!(asset.id);
    const existingAsset = parseScenarioAssetEntry(rawAsset);
    if (rawAsset !== undefined && (!existingAsset || existingAsset.projectId !== projectId)) {
      throw new Error(`Scenario asset ${asset.id} belongs to another aggregate.`);
    }
    const ref = parseAssetRef(asset.assetRef);
    if (
      !ref ||
      ref.assetId !== asset.assetId ||
      ref.size !== asset.size ||
      ref.mimeType !== asset.mimeType
    ) {
      throw new Error(`Scenario asset ${asset.id} publication metadata does not match its object.`);
    }
    if (existingAsset && existingAsset.assetId !== asset.assetId) {
      await ownerStore.delete!([SCENARIO_ASSET_OWNER_KIND, asset.id, SCENARIO_ASSET_ROLE]);
      if ((await ownerStore.index!('assetId').count(existingAsset.assetId)) === 0) {
        await refStore.delete!(existingAsset.assetId);
        physicalDelete.assetIds.push(existingAsset.assetId);
      }
    }
    await refStore.put!(ref);
    await ownerStore.put!({
      assetId: asset.assetId,
      ownerId: asset.id,
      ownerKind: SCENARIO_ASSET_OWNER_KIND,
      role: SCENARIO_ASSET_ROLE,
    });
    const { assetRef: _assetRef, ...storedAsset } = asset;
    await assetStore.put!(storedAsset);
  }
  for (const assetId of children?.assetDeletes ?? []) {
    const rawAsset: unknown = await assetStore.get!(assetId);
    const asset = parseScenarioAssetEntry(rawAsset);
    if (rawAsset !== undefined && (!asset || asset.projectId !== projectId)) {
      throw new Error(`Scenario asset ${assetId} does not belong to project ${projectId}.`);
    }
    await assetStore.delete!(assetId);
    if (asset) {
      await ownerStore.delete!([SCENARIO_ASSET_OWNER_KIND, assetId, SCENARIO_ASSET_ROLE]);
      if ((await ownerStore.index!('assetId').count(asset.assetId)) === 0) {
        await refStore.delete!(asset.assetId);
        physicalDelete.assetIds.push(asset.assetId);
      }
    }
  }
  if (physicalDelete.assetIds.length > 0) {
    await tx.objectStore(ASSET_OPERATIONS_STORE).put!(physicalDelete);
  }
}

export async function commitScenarioAggregateSnapshotMutation<
  TProject extends StoredScenarioProject,
>(args: {
  baseProject: TProject;
  children?: ScenarioAggregateChildMutation;
  nextProject: TProject;
}): Promise<ScenarioAggregateMutationResult<TProject>> {
  if (args.baseProject.id !== args.nextProject.id) {
    return rejectScenarioMutationBeforeHandoff(
      args.children,
      new Error('Scenario aggregate mutation cannot change the project ID.')
    );
  }
  let existing: ScenarioProjectEntry | null;
  try {
    const db = await initDB();
    existing = parseScenarioProjectEntry(
      await db.get(SCENARIO_PROJECTS_STORE, args.baseProject.id)
    );
  } catch (error) {
    return rejectScenarioMutationBeforeHandoff(args.children, error);
  }
  if (!existing || !areScenarioProjectsEqual(existing.project, args.baseProject)) {
    return rejectScenarioMutationBeforeHandoff(
      args.children,
      new StaleScenarioAggregateRevisionError(args.baseProject.id)
    );
  }
  return commitScenarioAggregateMutation(args.nextProject, {
    ...(args.children ? { children: args.children } : {}),
    expectedRevision: existing.workspaceRevision ?? 0,
    expectedUpdatedAt: args.baseProject.updatedAt,
  });
}

function parseScenarioAggregatePublicationPayload(
  value: unknown
): ScenarioAggregatePublicationPayload | null {
  if (!isRecord(value) || !isRecord(value['children'])) return null;
  const project =
    parseScenarioProject(value['project']) ??
    (isScenarioProjectV3(value['project']) ? value['project'] : null);
  const targetEntry = parseScenarioProjectEntry(value['targetEntry']);
  const baseRevision = value['baseRevision'];
  const committedAt = value['committedAt'];
  if (
    !project ||
    !targetEntry ||
    targetEntry.id !== project.id ||
    !(baseRevision === null || (Number.isInteger(baseRevision) && (baseRevision as number) >= 0)) ||
    typeof committedAt !== 'number' ||
    !Number.isFinite(committedAt)
  ) {
    return null;
  }
  const rawChildren = value['children'];
  const rawAssetPuts = rawChildren['assetPuts'] ?? [];
  const rawAssetDeletes = rawChildren['assetDeletes'] ?? [];
  const rawDocumentPuts = rawChildren['editorDocumentPuts'] ?? [];
  const rawDocumentDeletes = rawChildren['editorDocumentDeletes'] ?? [];
  if (
    !Array.isArray(rawAssetPuts) ||
    !Array.isArray(rawAssetDeletes) ||
    !Array.isArray(rawDocumentPuts) ||
    !Array.isArray(rawDocumentDeletes)
  )
    return null;
  const assetPuts: PreparedScenarioAssetEntry[] = [];
  for (const raw of rawAssetPuts) {
    const entry = parseScenarioAssetEntry(raw);
    const ref = isRecord(raw) ? parseAssetRef(raw['assetRef']) : null;
    if (!entry || !ref || ref.assetId !== entry.assetId) return null;
    assetPuts.push({ ...entry, assetRef: ref });
  }
  const editorDocumentPuts: PreparedScenarioStepEditorDocumentEntry[] = [];
  for (const raw of rawDocumentPuts) {
    const entry = parseScenarioStepEditorDocumentEntry(raw);
    if (!entry || !isRecord(raw) || !Array.isArray(raw['assetRefs'])) return null;
    const assetRefs = raw['assetRefs'].map(parseAssetRef);
    if (assetRefs.some((ref) => ref === null)) return null;
    editorDocumentPuts.push({ ...entry, assetRefs: assetRefs as AssetRef[] });
  }
  if (!rawAssetDeletes.every((id) => typeof id === 'string')) return null;
  if (!rawDocumentDeletes.every((id) => typeof id === 'string')) return null;
  const storageClass = value['storageClass'];
  if (storageClass !== undefined && storageClass !== 'library' && storageClass !== 'temporary') {
    return null;
  }
  const expectedUpdatedAt = value['expectedUpdatedAt'];
  if (
    expectedUpdatedAt !== undefined &&
    expectedUpdatedAt !== null &&
    typeof expectedUpdatedAt !== 'number'
  )
    return null;
  return {
    baseRevision: baseRevision as number | null,
    children: {
      assetPuts,
      assetDeletes: rawAssetDeletes as string[],
      editorDocumentPuts,
      editorDocumentDeletes: rawDocumentDeletes as string[],
    },
    committedAt,
    ...(expectedUpdatedAt === undefined ? {} : { expectedUpdatedAt }),
    project,
    ...(storageClass === undefined ? {} : { storageClass }),
    targetEntry,
  };
}

async function publishScenarioAssetJournal(
  journal: AssetReadyJournal,
  allowSuperseded = false
): Promise<ScenarioAggregateMutationResult<StoredScenarioProject> | null> {
  if (journal.domain !== SCENARIO_ASSET_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid standalone scenario asset publication journal.');
  }
  const payload = parseScenarioAggregatePublicationPayload(journal.payload);
  const payloadAssetRefs = payload
    ? [
        ...(payload.children.assetPuts ?? []).map((asset) => asset.assetRef),
        ...(payload.children.editorDocumentPuts ?? []).flatMap((entry) => entry.assetRefs),
      ]
    : [];
  if (!payload || payloadAssetRefs.length !== journal.assetRefs.length) {
    throw new Error('Invalid scenario asset publication payload.');
  }
  const journalAssetIds = new Set(journal.assetRefs.map((ref) => ref.assetId));
  if ((payload.children.assetPuts ?? []).some((asset) => !journalAssetIds.has(asset.assetId))) {
    throw new Error('Scenario publication assets do not match its journal.');
  }
  if (
    (payload.children.editorDocumentPuts ?? []).some((entry) =>
      entry.assetRefs.some((ref) => !journalAssetIds.has(ref.assetId))
    )
  ) {
    throw new Error('Scenario editor document assets do not match its journal.');
  }
  const db = await initDB();
  const existing = parseScenarioProjectEntry(
    await db.get(SCENARIO_PROJECTS_STORE, payload.project.id)
  );
  if (existing && (await isScenarioPublicationAlreadyCommitted(db, existing, payload))) {
    return {
      project: existing.project,
      workspaceRevision: existing.workspaceRevision ?? 0,
    };
  }
  if ((existing?.workspaceRevision ?? null) !== payload.baseRevision) {
    if (allowSuperseded && (await discardSupersededScenarioPublication(db, payload.children))) {
      return null;
    }
    throw new StaleScenarioAggregateRevisionError(payload.project.id);
  }
  return runWithIndexedDbMutation((mutationDb) =>
    commitScenarioAggregateInTransaction(mutationDb, payload.project, {
      children: payload.children,
      expectedRevision: payload.baseRevision,
      ...(payload.expectedUpdatedAt === undefined
        ? {}
        : { expectedUpdatedAt: payload.expectedUpdatedAt }),
      ...(payload.storageClass === undefined ? {} : { storageClass: payload.storageClass }),
      publicationUpdatedAt: payload.committedAt,
    })
  );
}

async function discardSupersededScenarioPublication(
  db: Awaited<ReturnType<typeof initDB>>,
  children: PreparedScenarioAggregateChildMutation
): Promise<boolean> {
  for (const prepared of children.assetPuts ?? []) {
    const stored = parseScenarioAssetEntry(await db.get(SCENARIO_ASSETS_STORE, prepared.id));
    const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, prepared.assetId));
    const owner: unknown = await db.get(ASSET_OWNERS_STORE, [
      SCENARIO_ASSET_OWNER_KIND,
      prepared.id,
      SCENARIO_ASSET_ROLE,
    ]);
    if (
      stored?.assetId === prepared.assetId ||
      ref?.assetId === prepared.assetId ||
      (isRecord(owner) && owner['assetId'] === prepared.assetId)
    ) {
      return false;
    }
  }
  for (const prepared of children.editorDocumentPuts ?? []) {
    const stored = parseScenarioStepEditorDocumentEntry(
      await db.get(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, prepared.stepId)
    );
    if (stored && JSON.stringify(stored.document) === JSON.stringify(prepared.document)) {
      return false;
    }
    for (const asset of prepared.document.assets) {
      if (
        (await db.get(ASSET_REFS_STORE, asset.assetId)) !== undefined ||
        (await db.get(ASSET_OWNERS_STORE, [
          SCENARIO_EDITOR_DOCUMENT_OWNER_KIND,
          prepared.stepId,
          asset.role,
        ])) !== undefined
      ) {
        return false;
      }
    }
  }
  await Promise.all(
    [
      ...(children.assetPuts ?? []).map((prepared) => prepared.assetId),
      ...(children.editorDocumentPuts ?? []).flatMap((prepared) =>
        prepared.document.assets.map((asset) => asset.assetId)
      ),
    ].map((assetId) => deleteAssetObject(assetId))
  );
  return true;
}

async function isScenarioPublicationAlreadyCommitted(
  db: Awaited<ReturnType<typeof initDB>>,
  existing: ScenarioProjectEntry,
  payload: ScenarioAggregatePublicationPayload
): Promise<boolean> {
  const targetRevision = payload.targetEntry.workspaceRevision ?? 0;
  const currentRevision = existing.workspaceRevision ?? 0;
  if (currentRevision < targetRevision) return false;
  if (
    currentRevision === targetRevision &&
    !areScenarioProjectsEqual(existing.project, payload.targetEntry.project)
  )
    return false;
  for (const prepared of payload.children.assetPuts ?? []) {
    const stored = parseScenarioAssetEntry(await db.get(SCENARIO_ASSETS_STORE, prepared.id));
    const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, prepared.assetId));
    const owner: unknown = await db.get(ASSET_OWNERS_STORE, [
      SCENARIO_ASSET_OWNER_KIND,
      prepared.id,
      SCENARIO_ASSET_ROLE,
    ]);
    if (
      stored?.assetId !== prepared.assetId ||
      ref?.assetId !== prepared.assetId ||
      !isRecord(owner) ||
      owner['assetId'] !== prepared.assetId
    )
      return false;
  }
  for (const prepared of payload.children.editorDocumentPuts ?? []) {
    const stored = parseScenarioStepEditorDocumentEntry(
      await db.get(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE, prepared.stepId)
    );
    if (!stored || JSON.stringify(stored.document) !== JSON.stringify(prepared.document)) {
      return false;
    }
    for (const asset of prepared.document.assets) {
      const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, asset.assetId));
      const owner: unknown = await db.get(ASSET_OWNERS_STORE, [
        SCENARIO_EDITOR_DOCUMENT_OWNER_KIND,
        prepared.stepId,
        asset.role,
      ]);
      if (!ref || !isRecord(owner) || owner['assetId'] !== asset.assetId) return false;
    }
  }
  return true;
}

export const scenarioAssetPublicationAdapter: AssetPublicationAdapter = {
  domain: SCENARIO_ASSET_PUBLICATION_DOMAIN,
  publish: async (journal) => {
    await publishScenarioAssetJournal(journal, true);
  },
};

export function recoverScenarioAssetPublications(): Promise<number> {
  return recoverStandaloneAssetPublications([scenarioAssetPublicationAdapter]);
}
