import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  initDB,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type {
  PreparedScenarioAssetEntry,
  ScenarioProjectEntry,
  ScenarioStepEditorDocumentEntry,
} from './contracts';
import { createScenarioProjectEntry } from './projects/entry';
import { parseScenarioProjectEntry } from './read-guards';
import { parseScenarioAssetEntry, parseScenarioExportEntry } from './read-guards';
import { parseScenarioStepEditorDocumentEntry } from './editor-documents/index.guards';
import type { LibraryStorageClass } from '../library-lifecycle/contracts';
import { parseScenarioProject } from './projects/guards';
import { createAggregatePresentationKey } from '../aggregate-presentations/contracts';
import { isScenarioProjectV3 } from '../../../features/scenario/project/v3';
import { isRecord } from '../infrastructure/indexed-db/read-primitives';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  createAssetPublicationJournal,
  parseAssetRef,
  publishReadyJournalWithRetry,
  recoverStandaloneAssetPublications,
  releaseAssetReadyProtection,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  type PhysicalDeleteAssetOperation,
} from '../assets';
import {
  discardSupersededScenarioAssetPuts,
  rejectScenarioMutationBeforeHandoff,
  SCENARIO_ASSET_OWNER_KIND,
  SCENARIO_ASSET_PUBLICATION_DOMAIN,
  SCENARIO_ASSET_ROLE,
  type ScenarioAggregateChildMutation,
} from './asset-staging';
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

interface ScenarioAggregatePublicationPayload<
  TProject extends StoredScenarioProject = StoredScenarioProject,
> {
  baseRevision: number | null;
  children: ScenarioAggregateChildMutation;
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

function hasScenarioChildMutations(children: ScenarioAggregateChildMutation | undefined): boolean {
  return (
    (children?.assetDeletes?.length ?? 0) > 0 ||
    (children?.assetPuts?.length ?? 0) > 0 ||
    (children?.editorDocumentDeletes?.length ?? 0) > 0 ||
    (children?.editorDocumentPuts?.length ?? 0) > 0
  );
}

function areScenarioProjectsEqual(
  left: StoredScenarioProject,
  right: StoredScenarioProject
): boolean {
  const canonicalLeft = left.version === 3 ? left : (parseScenarioProject(left) ?? left);
  const canonicalRight = right.version === 3 ? right : (parseScenarioProject(right) ?? right);
  return areJsonValuesEqual(canonicalLeft, canonicalRight);
}

function areJsonValuesEqual(left: unknown, right: unknown): boolean {
  if (Object.is(left, right)) return true;
  if (Array.isArray(left) || Array.isArray(right)) {
    return (
      Array.isArray(left) &&
      Array.isArray(right) &&
      left.length === right.length &&
      left.every((value, index) => areJsonValuesEqual(value, right[index]))
    );
  }
  if (typeof left !== 'object' || left === null || typeof right !== 'object' || right === null) {
    return false;
  }
  const leftRecord = left as Record<string, unknown>;
  const rightRecord = right as Record<string, unknown>;
  const leftKeys = Object.keys(leftRecord);
  const rightKeys = Object.keys(rightRecord);
  return (
    leftKeys.length === rightKeys.length &&
    leftKeys.every(
      (key) =>
        Object.prototype.hasOwnProperty.call(rightRecord, key) &&
        areJsonValuesEqual(leftRecord[key], rightRecord[key])
    )
  );
}

function readOwnedScenarioChildId(value: unknown, projectId: string): string | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  return record['projectId'] === projectId && typeof record['id'] === 'string'
    ? record['id']
    : null;
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
  children: ScenarioAggregateChildMutation | undefined
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

function getMutationStoreNames(children: ScenarioAggregateChildMutation | undefined) {
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
    storeNames.push(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE);
  }
  return storeNames;
}

export async function commitScenarioAggregateMutation<TProject extends StoredScenarioProject>(
  project: TProject,
  options: CommitScenarioAggregateMutationOptions = {}
): Promise<ScenarioAggregateMutationResult<TProject>> {
  const assetPuts = options.children?.assetPuts ?? [];
  if (assetPuts.length === 0) {
    assertChildOwnership(project.id, options.children);
    if ((options.children?.assetDeletes?.length ?? 0) > 0) {
      await recoverScenarioAssetPublications();
    }
    return runWithIndexedDbMutation((db) =>
      commitScenarioAggregateInTransaction(db, project, options)
    );
  }
  let journalCreated = false;
  try {
    assertChildOwnership(project.id, options.children);
    await recoverScenarioAssetPublications();
    const db = await initDB();
    const existing = parseScenarioProjectEntry(await db.get(SCENARIO_PROJECTS_STORE, project.id));
    assertExpectedScenarioRevision({
      existing: existing ?? undefined,
      expectedRevision: options.expectedRevision,
      expectedUpdatedAt: options.expectedUpdatedAt,
      projectId: project.id,
    });
    const committedAt = Date.now();
    const targetEntry = createScenarioAggregateEntry({
      existing: existing ?? undefined,
      options: { ...options, publicationUpdatedAt: committedAt },
      project,
    });
    const payload: ScenarioAggregatePublicationPayload<TProject> = {
      baseRevision: existing?.workspaceRevision ?? null,
      children: options.children!,
      committedAt,
      ...(options.expectedUpdatedAt === undefined
        ? {}
        : { expectedUpdatedAt: options.expectedUpdatedAt }),
      project,
      targetEntry,
      ...(options.storageClass === undefined ? {} : { storageClass: options.storageClass }),
    };
    const journal = await createAssetPublicationJournal({
      assetRefs: assetPuts.map((asset) => asset.assetRef),
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
    await releaseAssetReadyProtection(assetPuts.map((asset) => asset.assetId));
    if (!result) throw new Error('Scenario asset publication produced no result.');
    return result;
  } catch (error) {
    if (!journalCreated) {
      return rejectScenarioMutationBeforeHandoff(options.children, error);
    }
    throw error;
  }
}

async function commitScenarioAggregateInTransaction<TProject extends StoredScenarioProject>(
  db: Awaited<ReturnType<typeof initDB>>,
  project: TProject,
  options: CommitScenarioAggregateMutationOptions
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
  await applyScenarioDocumentMutations(tx, project.id, entry.updatedAt, options.children);
  await tx.done;
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
  return { project: entry.project, workspaceRevision: entry.workspaceRevision ?? 0 };
}

function createScenarioAggregateEntry<TProject extends StoredScenarioProject>(args: {
  existing: ScenarioProjectEntry | undefined;
  options: CommitScenarioAggregateMutationOptions;
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
  children: ScenarioAggregateChildMutation | undefined,
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

async function applyScenarioDocumentMutations(
  tx: ScenarioAggregateTransaction,
  projectId: string,
  updatedAt: number,
  children: ScenarioAggregateChildMutation | undefined
): Promise<void> {
  if (
    (children?.editorDocumentPuts?.length ?? 0) === 0 &&
    (children?.editorDocumentDeletes?.length ?? 0) === 0
  ) {
    return;
  }
  const documentStore = tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE);
  for (const document of children?.editorDocumentPuts ?? []) {
    const rawDocument: unknown = await documentStore.get!(document.stepId);
    const existingDocument = parseScenarioStepEditorDocumentEntry(rawDocument);
    if (
      rawDocument !== undefined &&
      (!existingDocument || existingDocument.projectId !== projectId)
    ) {
      throw new Error(
        `Scenario editor document ${document.stepId} does not belong to project ${projectId}.`
      );
    }
    await documentStore.put!({
      ...document,
      createdAt: existingDocument?.createdAt ?? (document.createdAt || updatedAt),
      updatedAt,
    });
  }
  for (const stepId of children?.editorDocumentDeletes ?? []) {
    const rawDocument: unknown = await documentStore.get!(stepId);
    const document = parseScenarioStepEditorDocumentEntry(rawDocument);
    if (rawDocument !== undefined && (!document || document.projectId !== projectId)) {
      throw new Error(
        `Scenario editor document ${stepId} does not belong to project ${projectId}.`
      );
    }
    await documentStore.delete!(stepId);
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
  const editorDocumentPuts = rawDocumentPuts.map(parseScenarioStepEditorDocumentEntry);
  if (editorDocumentPuts.some((entry) => entry === null)) return null;
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
      editorDocumentPuts: editorDocumentPuts as ScenarioStepEditorDocumentEntry[],
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
  if (!payload || payload.children.assetPuts?.length !== journal.assetRefs.length) {
    throw new Error('Invalid scenario asset publication payload.');
  }
  const journalAssetIds = new Set(journal.assetRefs.map((ref) => ref.assetId));
  if (payload.children.assetPuts.some((asset) => !journalAssetIds.has(asset.assetId))) {
    throw new Error('Scenario publication assets do not match its journal.');
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
    if (
      allowSuperseded &&
      (await discardSupersededScenarioAssetPuts(db, payload.children.assetPuts ?? []))
    ) {
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

export async function deleteOrphanedScenarioAggregateChild(args: {
  id: string;
  kind: 'asset' | 'editor-document';
}): Promise<void> {
  await recoverScenarioAssetPublications();
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const childStoreName =
      args.kind === 'asset' ? SCENARIO_ASSETS_STORE : SCENARIO_STEP_EDITOR_DOCUMENTS_STORE;
    const tx = db.transaction(
      args.kind === 'asset'
        ? [
            SCENARIO_PROJECTS_STORE,
            childStoreName,
            ASSET_REFS_STORE,
            ASSET_OWNERS_STORE,
            ASSET_OPERATIONS_STORE,
          ]
        : [SCENARIO_PROJECTS_STORE, childStoreName],
      'readwrite'
    );
    const childStore = tx.objectStore(childStoreName);
    const rawChild: unknown = await childStore.get(args.id);
    const child =
      args.kind === 'asset'
        ? parseScenarioAssetEntry(rawChild)
        : parseScenarioStepEditorDocumentEntry(rawChild);
    if (!child) {
      if (rawChild !== undefined) {
        throw new Error(`Invalid scenario ${args.kind} cannot be safely removed.`);
      }
      await tx.done;
      return;
    }
    const projectId = child.projectId;
    if (await tx.objectStore(SCENARIO_PROJECTS_STORE).get(projectId)) {
      throw new Error(`Scenario ${args.kind} ${args.id} still belongs to aggregate ${projectId}.`);
    }
    await childStore.delete(args.id);
    if (args.kind === 'asset' && 'assetId' in child) {
      const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
      await ownerStore.delete([SCENARIO_ASSET_OWNER_KIND, args.id, SCENARIO_ASSET_ROLE]);
      if ((await ownerStore.index('assetId').count(child.assetId)) === 0) {
        await tx.objectStore(ASSET_REFS_STORE).delete(child.assetId);
        physicalDelete.assetIds.push(child.assetId);
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
      }
    }
    await tx.done;
  });
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
}

export async function deleteScenarioAggregate(projectId: string): Promise<void> {
  await recoverScenarioAssetPublications();
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        SCENARIO_PROJECTS_STORE,
        SCENARIO_ASSETS_STORE,
        SCENARIO_EXPORTS_STORE,
        SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const [rawAssets, rawExports, rawDocuments] = await Promise.all([
      tx.objectStore(SCENARIO_ASSETS_STORE).index!('projectId').getAll(projectId),
      tx.objectStore(SCENARIO_EXPORTS_STORE).index!('projectId').getAll(projectId),
      tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).index!('projectId').getAll(projectId),
    ]);
    const assetIds = rawAssets.flatMap((value) => {
      const parsed = parseScenarioAssetEntry(value);
      const id = parsed?.id ?? readOwnedScenarioChildId(value, projectId);
      return id ? [id] : [];
    });
    const exportIds = rawExports.flatMap((value) => {
      const parsed = parseScenarioExportEntry(value);
      const id = parsed?.id ?? readOwnedScenarioChildId(value, projectId);
      return id ? [id] : [];
    });
    const documentIds = rawDocuments.flatMap((value) => {
      const parsed = parseScenarioStepEditorDocumentEntry(value);
      const stepId =
        parsed?.stepId ??
        (typeof value === 'object' &&
        value !== null &&
        !Array.isArray(value) &&
        (value as Record<string, unknown>)['projectId'] === projectId &&
        typeof (value as Record<string, unknown>)['stepId'] === 'string'
          ? ((value as Record<string, unknown>)['stepId'] as string)
          : null);
      return stepId ? [stepId] : [];
    });
    await tx.objectStore(SCENARIO_PROJECTS_STORE).delete(projectId);
    const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
    for (const assetId of assetIds) {
      const asset = parseScenarioAssetEntry(
        await tx.objectStore(SCENARIO_ASSETS_STORE).get(assetId)
      );
      await tx.objectStore(SCENARIO_ASSETS_STORE).delete(assetId);
      if (asset) {
        await ownerStore.delete([SCENARIO_ASSET_OWNER_KIND, assetId, SCENARIO_ASSET_ROLE]);
        if ((await ownerStore.index('assetId').count(asset.assetId)) === 0) {
          await tx.objectStore(ASSET_REFS_STORE).delete(asset.assetId);
          physicalDelete.assetIds.push(asset.assetId);
        }
      }
    }
    for (const exportId of exportIds) await tx.objectStore(SCENARIO_EXPORTS_STORE).delete(exportId);
    for (const stepId of documentIds) {
      await tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).delete(stepId);
    }
    await tx
      .objectStore(AGGREGATE_PRESENTATIONS_STORE)
      .delete(createAggregatePresentationKey({ id: projectId, kind: 'scenario' }));
    if (physicalDelete.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
    }
    await tx.done;
  });
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
}
