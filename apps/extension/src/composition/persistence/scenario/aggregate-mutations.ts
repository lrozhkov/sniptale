import type { ScenarioProjectV3 } from '@sniptale/runtime-contracts/scenario/types/v3';
import type { ScenarioProject } from '../../../features/scenario/contracts/types/project';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_EXPORTS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  initDB,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type {
  ScenarioAssetEntry,
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

type StoredScenarioProject = ScenarioProject | ScenarioProjectV3;

class StaleScenarioAggregateRevisionError extends Error {
  constructor(projectId: string) {
    super(`Scenario project ${projectId} was changed before this save completed`);
    this.name = 'StaleScenarioAggregateRevisionError';
  }
}

export interface ScenarioAggregateChildMutation {
  assetDeletes?: readonly string[];
  assetPuts?: readonly ScenarioAssetEntry[];
  editorDocumentDeletes?: readonly string[];
  editorDocumentPuts?: readonly ScenarioStepEditorDocumentEntry[];
}

interface CommitScenarioAggregateMutationOptions {
  children?: ScenarioAggregateChildMutation;
  expectedRevision?: number | null;
  /** Compatibility CAS for callers that have not yet adopted workspaceRevision. */
  expectedUpdatedAt?: number | null;
  storageClass?: LibraryStorageClass;
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
  > = [SCENARIO_PROJECTS_STORE];
  if ((children?.assetPuts?.length ?? 0) > 0 || (children?.assetDeletes?.length ?? 0) > 0) {
    storeNames.push(SCENARIO_ASSETS_STORE);
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
  assertChildOwnership(project.id, options.children);
  return runWithIndexedDbMutation((db) =>
    commitScenarioAggregateInTransaction(db, project, options)
  );
}

async function commitScenarioAggregateInTransaction<TProject extends StoredScenarioProject>(
  db: Awaited<ReturnType<typeof initDB>>,
  project: TProject,
  options: CommitScenarioAggregateMutationOptions
): Promise<ScenarioAggregateMutationResult<TProject>> {
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
  await applyScenarioAssetMutations(tx, project.id, options.children);
  await projectStore.put(entry);
  await applyScenarioDocumentMutations(tx, project.id, entry.updatedAt, options.children);
  await tx.done;
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
        })
      : createScenarioProjectEntry({
          existing: args.existing,
          project: args.project as ScenarioProject,
          ...(args.options.storageClass === undefined
            ? {}
            : { storageClass: args.options.storageClass }),
        })
  ) as ScenarioProjectEntry & { project: TProject };
}

async function applyScenarioAssetMutations(
  tx: ScenarioAggregateTransaction,
  projectId: string,
  children: ScenarioAggregateChildMutation | undefined
): Promise<void> {
  if ((children?.assetPuts?.length ?? 0) === 0 && (children?.assetDeletes?.length ?? 0) === 0) {
    return;
  }
  const assetStore = tx.objectStore(SCENARIO_ASSETS_STORE);
  for (const asset of children?.assetPuts ?? []) {
    const rawAsset: unknown = await assetStore.get!(asset.id);
    const existingAsset = parseScenarioAssetEntry(rawAsset);
    if (rawAsset !== undefined && (!existingAsset || existingAsset.projectId !== projectId)) {
      throw new Error(`Scenario asset ${asset.id} belongs to another aggregate.`);
    }
    await assetStore.put!(asset);
  }
  for (const assetId of children?.assetDeletes ?? []) {
    const rawAsset: unknown = await assetStore.get!(assetId);
    const asset = parseScenarioAssetEntry(rawAsset);
    if (rawAsset !== undefined && (!asset || asset.projectId !== projectId)) {
      throw new Error(`Scenario asset ${assetId} does not belong to project ${projectId}.`);
    }
    await assetStore.delete!(assetId);
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
    throw new Error('Scenario aggregate mutation cannot change the project ID.');
  }
  const db = await initDB();
  const existing = parseScenarioProjectEntry(
    await db.get(SCENARIO_PROJECTS_STORE, args.baseProject.id)
  );
  if (!existing || !areScenarioProjectsEqual(existing.project, args.baseProject)) {
    throw new StaleScenarioAggregateRevisionError(args.baseProject.id);
  }
  return commitScenarioAggregateMutation(args.nextProject, {
    ...(args.children ? { children: args.children } : {}),
    expectedRevision: existing.workspaceRevision ?? 0,
    expectedUpdatedAt: args.baseProject.updatedAt,
  });
}

export async function deleteOrphanedScenarioAggregateChild(args: {
  id: string;
  kind: 'asset' | 'editor-document';
}): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const childStoreName =
      args.kind === 'asset' ? SCENARIO_ASSETS_STORE : SCENARIO_STEP_EDITOR_DOCUMENTS_STORE;
    const tx = db.transaction([SCENARIO_PROJECTS_STORE, childStoreName], 'readwrite');
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
    await tx.done;
  });
}

export async function deleteScenarioAggregate(projectId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        SCENARIO_PROJECTS_STORE,
        SCENARIO_ASSETS_STORE,
        SCENARIO_EXPORTS_STORE,
        SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
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
    for (const assetId of assetIds) await tx.objectStore(SCENARIO_ASSETS_STORE).delete(assetId);
    for (const exportId of exportIds) await tx.objectStore(SCENARIO_EXPORTS_STORE).delete(exportId);
    for (const stepId of documentIds) {
      await tx.objectStore(SCENARIO_STEP_EDITOR_DOCUMENTS_STORE).delete(stepId);
    }
    await tx
      .objectStore(AGGREGATE_PRESENTATIONS_STORE)
      .delete(createAggregatePresentationKey({ id: projectId, kind: 'scenario' }));
    await tx.done;
  });
}
