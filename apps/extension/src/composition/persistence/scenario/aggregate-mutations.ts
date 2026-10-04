import { promoteReferencedMediaLifecycles } from '../library-lifecycle/promotion';
import { parseGuideProject } from '@sniptale/runtime-contracts/scenario/guide-parser';
import type { DurableAssetLifecyclePermit } from '../infrastructure/mutation-barrier';
import { createLogger } from '@sniptale/platform/observability/logger';
import type { GuideProject } from '@sniptale/runtime-contracts/scenario/types/guide';
import { detachScenarioVideoAssets } from './video-asset-detachment';
import { VIDEO_PROJECTS_STORE } from '../infrastructure/indexed-db/core';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_ASSETS_STORE,
  SCENARIO_PROJECTS_STORE,
  SCENARIO_STEP_EDITOR_DOCUMENTS_STORE,
  STORE_NAME,
  initDB,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type { ScenarioProjectEntry } from './contracts';
import { createScenarioProjectEntry } from './projects/entry';
import { parseScenarioProjectEntry } from './read-guards';
import { parseScenarioAssetEntry } from './read-guards';
import { parseScenarioStepEditorDocumentEntry } from './editor-documents/index.guards';
import { promoteLibraryLifecycle, type LibraryStorageClass } from '../library-lifecycle/contracts';
import { areScenarioProjectsEqual } from './aggregate-comparison';
import { isRecord } from '../infrastructure/indexed-db/read-primitives';
import {
  assertNewScenarioGallerySource,
  promoteScenarioSourceLifecycles,
  assertBorrowedScenarioAsset,
  assertBorrowedScenarioAssetSource,
  publishScenarioAssetToLibrary,
  UnavailableBorrowedScenarioSourceError,
} from './library-publication';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  createAssetPublicationJournal,
  cancelAssetPublication,
  parseAssetRef,
  publishReadyJournalWithRetry,
  recoverStandaloneAssetPublications,
  releaseAssetReadyProtection,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  type PhysicalDeleteAssetOperation,
} from '../assets';
import {
  rejectScenarioMutationBeforeHandoff,
  parseScenarioAggregatePublicationPayload,
  type ScenarioAggregatePublicationPayload,
  SCENARIO_ASSET_OWNER_KIND,
  SCENARIO_ASSET_PUBLICATION_DOMAIN,
  SCENARIO_ASSET_ROLE,
  type ScenarioAggregateChildMutation,
  type PreparedScenarioAggregateChildMutation,
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

const logger = createLogger({ namespace: 'ScenarioAggregatePublication' });

function requireSupportedScenarioEntry(raw: unknown): ScenarioProjectEntry | undefined {
  if (raw === undefined) return undefined;
  const entry = parseScenarioProjectEntry(raw);
  if (!entry) throw new Error('Scenario project content is unavailable.');
  return entry;
}

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

interface ScenarioAggregateMutationResult {
  project: GuideProject;
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
    | typeof MEDIA_LIBRARY_STORE
    | typeof PROJECT_ASSETS_STORE
    | typeof STORE_NAME
    | typeof VIDEO_PROJECTS_STORE
  > = [SCENARIO_PROJECTS_STORE, SCENARIO_ASSETS_STORE, MEDIA_LIBRARY_STORE, STORE_NAME];
  if ((children?.assetPuts?.length ?? 0) > 0 || (children?.assetDeletes?.length ?? 0) > 0) {
    storeNames.push(
      SCENARIO_ASSETS_STORE,
      ASSET_REFS_STORE,
      ASSET_OWNERS_STORE,
      ASSET_OPERATIONS_STORE,
      MEDIA_LIBRARY_STORE,
      VIDEO_PROJECTS_STORE,
      PROJECT_ASSETS_STORE
    );
  }
  if (children?.assetPuts?.some((asset) => asset.borrowedMediaId || asset.galleryAssetId)) {
    storeNames.push(PROJECT_ASSETS_STORE, STORE_NAME);
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

export async function commitScenarioAggregateMutation(
  project: GuideProject,
  options: CommitScenarioAggregateMutationOptions = {}
): Promise<ScenarioAggregateMutationResult> {
  const parsed = parseGuideProject(project);
  if (parsed.status !== 'ok') {
    return rejectScenarioMutationBeforeHandoff(
      options.children,
      new Error('Invalid guide project.')
    );
  }
  project = parsed.project;
  assertChildOwnership(project.id, options.children);
  let preparedChildren: PreparedScenarioAggregateChildMutation | undefined;
  try {
    await recoverScenarioAssetPublications();
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
    ...(preparedChildren?.assetPuts ?? [])
      .filter((asset) => !asset.borrowedMediaId)
      .map((asset) => asset.assetRef),
    ...(preparedChildren?.editorDocumentPuts ?? []).flatMap((entry) => entry.assetRefs),
  ];
  if (assetRefs.length === 0) {
    const committed = await runWithIndexedDbMutation((db) =>
      commitScenarioAggregateInTransaction(db, project, preparedOptions)
    );
    return finishScenarioAggregateCommit(committed);
  }
  let journalCreated = false;
  let readyJournal: AssetReadyJournal | undefined;
  try {
    assertChildOwnership(project.id, preparedChildren);
    const db = await initDB();
    const existing = requireSupportedScenarioEntry(
      await db.get(SCENARIO_PROJECTS_STORE, project.id)
    );
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
    const payload: ScenarioAggregatePublicationPayload = {
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
    readyJournal = journal;
    journalCreated = true;
    let result: ScenarioAggregateMutationResult | undefined;
    await publishReadyJournalWithRetry(journal, async (ready, permit) => {
      result = (await publishScenarioAssetJournal(
        ready,
        false,
        permit
      )) as ScenarioAggregateMutationResult;
    });
    await releaseAssetReadyProtection(assetRefs.map((ref) => ref.assetId));
    if (!result) throw new Error('Scenario asset publication produced no result.');
    return result;
  } catch (error) {
    if (readyJournal && error instanceof UnavailableBorrowedScenarioSourceError) {
      await cancelAssetPublication(readyJournal);
    }
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

async function commitScenarioAggregateInTransaction(
  db: Awaited<ReturnType<typeof initDB>>,
  project: GuideProject,
  options: PreparedCommitScenarioAggregateMutationOptions
): Promise<{
  result: ScenarioAggregateMutationResult;
  physicalDelete: PhysicalDeleteAssetOperation;
}> {
  const physicalDelete = buildPhysicalDeleteOperation([]);
  const tx = db.transaction(getMutationStoreNames(options.children), 'readwrite');
  let entry: ScenarioProjectEntry;
  try {
    const projectStore = tx.objectStore(SCENARIO_PROJECTS_STORE);
    const existing = requireSupportedScenarioEntry(await projectStore.get(project.id));
    if (
      existing &&
      !hasScenarioChildMutations(options.children) &&
      areScenarioProjectsEqual(existing.project, project)
    ) {
      if (existing.lifecycle?.storageClass === 'temporary') {
        await projectStore.put({
          ...existing,
          lifecycle: promoteLibraryLifecycle(existing.lifecycle, Date.now()),
        });
      }
      await promoteScenarioSourceLifecycles(tx, existing, Date.now());
      await tx.done;
      return {
        result: { project: existing.project, workspaceRevision: existing.workspaceRevision ?? 0 },
        physicalDelete,
      };
    }

    assertExpectedScenarioRevision({
      existing,
      expectedRevision: options.expectedRevision,
      expectedUpdatedAt: options.expectedUpdatedAt,
      projectId: project.id,
    });
    entry = createScenarioAggregateEntry({ existing, options, project });
    await applyScenarioAssetMutations(tx, project.id, options.children, physicalDelete);
    await promoteScenarioSourceLifecycles(tx, entry, entry.updatedAt);
    await projectStore.put(entry);
    await applyScenarioDocumentMutations({
      children: options.children,
      physicalDelete,
      projectId: project.id,
      tx,
      updatedAt: entry.updatedAt,
    });
    await tx.done;
  } catch (error) {
    try {
      tx.abort();
    } catch {
      /* The transaction may already have closed. */
    }
    await tx.done.catch(() => undefined);
    throw error;
  }
  return {
    result: { project: entry.project, workspaceRevision: entry.workspaceRevision ?? 0 },
    physicalDelete,
  };
}

async function finishScenarioAggregateCommit(
  committed: Awaited<ReturnType<typeof commitScenarioAggregateInTransaction>>,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<ScenarioAggregateMutationResult> {
  if (committed.physicalDelete.assetIds.length > 0)
    await completePhysicalDeleteOperation(committed.physicalDelete, lifecyclePermit).catch(
      () => undefined
    );
  return committed.result;
}

function createScenarioAggregateEntry(args: {
  existing: ScenarioProjectEntry | undefined;
  options: PreparedCommitScenarioAggregateMutationOptions;
  project: GuideProject;
}): ScenarioProjectEntry {
  return createScenarioProjectEntry({
    existing: args.existing,
    project: args.project,
    ...(args.options.storageClass === undefined ? {} : { storageClass: args.options.storageClass }),
    ...(args.options.publicationUpdatedAt === undefined
      ? {}
      : { updatedAt: args.options.publicationUpdatedAt }),
  });
}

/** Applies validated scenario child mutations inside the caller's aggregate transaction. */
export async function applyScenarioAssetMutations(
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
  const releasedIds = new Set(children?.assetDeletes ?? []);
  for (const asset of children?.assetPuts ?? []) {
    const previous = parseScenarioAssetEntry(await assetStore.get!(asset.id));
    if (previous && previous.assetId !== asset.assetId) releasedIds.add(asset.id);
  }
  await detachScenarioVideoAssets(tx, projectId, releasedIds, false);
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
    await assertNewScenarioGallerySource(tx, asset, existingAsset);
    if (existingAsset && existingAsset.assetId !== asset.assetId) {
      await ownerStore.delete!([SCENARIO_ASSET_OWNER_KIND, asset.id, SCENARIO_ASSET_ROLE]);
      if ((await ownerStore.index!('assetId').count(existingAsset.assetId)) === 0) {
        await refStore.delete!(existingAsset.assetId);
        physicalDelete.assetIds.push(existingAsset.assetId);
      }
    }
    if (asset.borrowedMediaId) {
      if (asset.independentLibraryIdentity) {
        await assertBorrowedScenarioAssetSource(tx, asset);
        const currentRef = parseAssetRef(await refStore.get!(asset.assetId));
        if (!currentRef || JSON.stringify(currentRef.location) !== JSON.stringify(ref.location))
          throw new Error('Shared scenario source changed before publication.');
      } else await assertBorrowedScenarioAsset(tx, asset);
    } else await refStore.put!(ref);
    await ownerStore.put!({
      assetId: asset.assetId,
      ownerId: asset.id,
      ownerKind: SCENARIO_ASSET_OWNER_KIND,
      role: SCENARIO_ASSET_ROLE,
    });
    const {
      assetRef: _assetRef,
      independentLibraryIdentity: _independentLibraryIdentity,
      borrowedMediaId: _borrowedMediaId,
      ...storedFields
    } = asset;
    const storedAsset = asset.independentLibraryIdentity
      ? storedFields
      : {
          ...storedFields,
          ...(asset.borrowedMediaId ? { borrowedMediaId: asset.borrowedMediaId } : {}),
        };
    await assetStore.put!(storedAsset);
    const originMediaId = asset.borrowedMediaId ?? asset.galleryAssetId;
    if (originMediaId) {
      await promoteReferencedMediaLifecycles({
        mediaIds: new Set([originMediaId]),
        mediaStore: tx.objectStore(MEDIA_LIBRARY_STORE),
        recordingStore: tx.objectStore(STORE_NAME),
        now: Date.now(),
      });
    }
    if (!asset.borrowedMediaId || asset.independentLibraryIdentity)
      await publishScenarioAssetToLibrary(tx, storedAsset);
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

export async function commitScenarioAggregateSnapshotMutation(args: {
  baseProject: GuideProject;
  children?: ScenarioAggregateChildMutation;
  nextProject: GuideProject;
}): Promise<ScenarioAggregateMutationResult> {
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

async function publishScenarioAssetJournal(
  journal: AssetReadyJournal,
  allowSuperseded = false,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<ScenarioAggregateMutationResult | null> {
  if (journal.domain !== SCENARIO_ASSET_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid standalone scenario asset publication journal.');
  }
  if (isRecord(journal.payload) && isRecord(journal.payload['project'])) {
    const version = journal.payload['project']['version'];
    if (version === 2 || version === 3) {
      logger.info('Retired scenario publication format', { outcome: 'retired-format', version });
      return null;
    }
  }
  const payload = parseScenarioAggregatePublicationPayload(journal.payload);
  const payloadAssetRefs = payload
    ? [
        ...(payload.children.assetPuts ?? [])
          .filter((asset) => !asset.borrowedMediaId)
          .map((asset) => asset.assetRef),
        ...(payload.children.editorDocumentPuts ?? []).flatMap((entry) => entry.assetRefs),
      ]
    : [];
  if (!payload || payloadAssetRefs.length !== journal.assetRefs.length) {
    throw new Error('Invalid scenario asset publication payload.');
  }
  const journalAssetIds = new Set(journal.assetRefs.map((ref) => ref.assetId));
  if (
    (payload.children.assetPuts ?? []).some(
      (asset) => !asset.borrowedMediaId && !journalAssetIds.has(asset.assetId)
    )
  ) {
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
  const existing = requireSupportedScenarioEntry(
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
      (await discardSupersededScenarioPublication(db, payload.children, journal, lifecyclePermit))
    ) {
      return null;
    }
    throw new StaleScenarioAggregateRevisionError(payload.project.id);
  }
  try {
    const committed = await runWithIndexedDbMutation((mutationDb) =>
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
    return finishScenarioAggregateCommit(committed, lifecyclePermit);
  } catch (error) {
    if (allowSuperseded && error instanceof UnavailableBorrowedScenarioSourceError) {
      await cancelAssetPublication(journal, lifecyclePermit);
      return null;
    }
    throw error;
  }
}

async function discardSupersededScenarioPublication(
  db: Awaited<ReturnType<typeof initDB>>,
  children: PreparedScenarioAggregateChildMutation,
  journal: AssetReadyJournal,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<boolean> {
  for (const prepared of children.assetPuts ?? []) {
    if (prepared.borrowedMediaId) continue;
    const { owner, ref, stored } = await readPreparedScenarioAssetState(db, prepared);
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
  await cancelAssetPublication(journal, lifecyclePermit);
  return true;
}

async function readPreparedScenarioAssetState(
  db: Awaited<ReturnType<typeof initDB>>,
  prepared: NonNullable<PreparedScenarioAggregateChildMutation['assetPuts']>[number]
) {
  return {
    stored: parseScenarioAssetEntry(await db.get(SCENARIO_ASSETS_STORE, prepared.id)),
    ref: parseAssetRef(await db.get(ASSET_REFS_STORE, prepared.assetId)),
    owner: (await db.get(ASSET_OWNERS_STORE, [
      SCENARIO_ASSET_OWNER_KIND,
      prepared.id,
      SCENARIO_ASSET_ROLE,
    ])) as unknown,
  };
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
    const { owner, ref, stored } = await readPreparedScenarioAssetState(db, prepared);
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
  publish: async (journal, permit) => {
    await publishScenarioAssetJournal(journal, true, permit);
  },
};

export function recoverScenarioAssetPublications(): Promise<number> {
  return recoverStandaloneAssetPublications([scenarioAssetPublicationAdapter]);
}
