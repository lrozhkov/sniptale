import { releaseUnpublishedProjectAssets } from '../media-library/delete-cascade.sources';
import {
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  type PhysicalDeleteAssetOperation,
} from '../assets';
import {
  readWorkspaceStorage,
  replaceWorkspaceStorage,
  writeWorkspaceStorage,
  type WorkspaceStorageRead,
} from './storage';
import { usageReferenceKey, USAGE_INDEX_MARKER } from '../media-library/usage-index-keys';
import {
  compactVideoWorkspaceHistory,
  retainedWorkspaceReplacementStart,
} from './history-retention';
import {
  parseVideoWorkspaceTypingChange,
  prepareVideoWorkspaceTyping,
  withoutVideoWorkspaceTyping,
} from './typing';
import {
  collectReviewAssetReferences,
  collectExplicitlyRemovedReviewEffectAssets,
  pruneReviewAnnotationEffectSnapshots,
} from './asset-refs';
import {
  parseReviewAnnotationEffectSnapshots,
  mergeReviewAnnotationEffectSnapshots,
  ReviewAnnotationEffectUnavailableError,
} from '../../../features/video/review/annotation-effects/validation';
import type { ReviewAnnotationEffectSnapshot } from '../../../features/video/review/annotation-effects/types';
import { createNewWorkspacePresentationSettings } from '../../../features/video/review/advanced/presentation';
import { createQuickEditAdvancedState } from '../../../features/video/review/advanced/defaults';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  runWithDurableAssetLifecycleLock,
  type DurableAssetLifecyclePermit,
} from '../infrastructure/mutation-barrier';
import {
  areNewReviewSourcesAvailable,
  readReviewReadySources,
  promoteReviewSourceLifecycles,
  verifyReviewAnnotationEffectSources,
} from './new-reference-admission';
import {
  STORE_NAME,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  VIDEO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  THUMBNAILS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  ASSET_OPERATIONS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseProjectAssetEntry, parseProjectExportEntry } from '../projects/read-guards';
import {
  initDB,
  MEDIA_LIBRARY_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import {
  applyReviewOperation,
  createReviewAdvancedContentOperation,
} from '../../../features/video/review/document';
import { parseReviewOperation, parseReviewSource } from '../../../features/video/review/validation';
import { loadQuickEditAdvancedState } from '../../../features/video/review/advanced/validation';
import type {
  ReviewDocument,
  ReviewHistoryDirection,
  ReviewSource,
} from '../../../features/video/review/types';
import type { VideoWorkspace, VideoWorkspaceSnapshot } from './contracts';
import {
  inspectVideoWorkspace,
  type VideoWorkspaceDiagnostic,
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from './parser';

const stores = [
  MEDIA_LIBRARY_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  STORE_NAME,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  VIDEO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  IMAGE_WORKSPACES_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  THUMBNAILS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  ASSET_OPERATIONS_STORE,
];
type Database = Awaited<ReturnType<typeof initDB>>;
type Transaction = ReturnType<Database['transaction']>;
function beginWriteTransaction(db: Database) {
  return db.transaction(stores, 'readwrite', { durability: 'strict' });
}
type WriteTransaction = ReturnType<typeof beginWriteTransaction>;

function indexedWorkspace(workspace: VideoWorkspace) {
  const keys = new Set([USAGE_INDEX_MARKER]);
  for (const ref of collectReviewAssetReferences(workspace)) {
    if (ref.startsWith('project-asset:'))
      keys.add(usageReferenceKey('project-asset', ref.slice('project-asset:'.length)));
  }
  return { ...workspace, usageReferenceKeys: [...keys] };
}

/** Recoverable failure codes; never include user text in the error. */
export class VideoWorkspaceError extends Error {
  constructor(
    public readonly code: 'invalid' | 'conflict' | 'missing-media' | 'changed-source',
    public readonly diagnostic?: VideoWorkspaceDiagnostic
  ) {
    super(`Video workspace ${code}.`);
    this.name = 'VideoWorkspaceError';
  }
}

async function readSourceAssetId(tx: Transaction, aggregateId: string): Promise<string> {
  const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(aggregateId));
  if (!media || !media.mimeType.startsWith('video/'))
    throw new VideoWorkspaceError('missing-media');
  const source = media.source;
  const entry =
    source.kind === 'recording'
      ? parseRecordingEntry(await tx.objectStore(STORE_NAME).get(source.recordingId))
      : source.kind === 'project-asset'
        ? parseProjectAssetEntry(
            await tx.objectStore(PROJECT_ASSETS_STORE).get(source.projectAssetId)
          )
        : source.kind === 'project-export'
          ? parseProjectExportEntry(
              await tx.objectStore(PROJECT_EXPORTS_STORE).get(source.exportId)
            )
          : null;
  if (!entry) throw new VideoWorkspaceError('missing-media');
  return entry.assetId;
}

type AdmittedWorkspaceSnapshot = {
  snapshot: VideoWorkspaceSnapshot;
  document: ReviewDocument;
  storage: WorkspaceStorageRead;
};

async function readSnapshot(
  tx: Transaction,
  aggregateId: string
): Promise<AdmittedWorkspaceSnapshot | null> {
  const storage = await readWorkspaceStorage(tx, aggregateId);
  const raw = storage.logical;
  const rawDraft: unknown = await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).get(aggregateId);
  if (raw === undefined && rawDraft === undefined) return null;
  const { workspace, document, failure } = inspectVideoWorkspace(raw);
  if (!workspace || !document) throw new VideoWorkspaceError('invalid', failure ?? undefined);
  if (workspace.aggregateId !== aggregateId)
    throw new VideoWorkspaceError('invalid', { check: 'workspace-identity', reason: 'invalid' });
  const draft =
    rawDraft === undefined ? null : parseVideoWorkspaceDraft(rawDraft, workspace.source.duration);
  if (rawDraft !== undefined && (!draft || draft.aggregateId !== aggregateId)) {
    throw new VideoWorkspaceError('invalid', { check: 'draft', reason: 'invalid' });
  }
  if (workspace.sourceAssetId !== (await readSourceAssetId(tx, aggregateId)))
    throw new VideoWorkspaceError('changed-source');
  return { snapshot: { workspace, draft }, document, storage };
}

/** Read-only recovery: missing is distinct from invalid and never repairs durable content. */
export async function readVideoWorkspace(
  aggregateId: string
): Promise<VideoWorkspaceSnapshot | null> {
  const db = await initDB();
  const tx = db.transaction(stores, 'readonly');
  const admitted = await readSnapshot(tx, aggregateId);
  await tx.done;
  return admitted?.snapshot ?? null;
}

async function mutate<T>(
  aggregateId: string,
  operation: (
    tx: WriteTransaction,
    prepared: ReviewReadySources,
    physicalDelete: PhysicalDeleteAssetOperation
  ) => Promise<T>,
  admitsSources = false,
  effectSnapshots?: readonly ReviewAnnotationEffectSnapshot[]
): Promise<T> {
  const execute = async (
    prepared: ReviewReadySources,
    lifecyclePermit?: DurableAssetLifecyclePermit
  ) => {
    const physicalDelete = buildPhysicalDeleteOperation([]);
    const committed = await runWithIndexedDbMutation(async (db) => {
      const tx = beginWriteTransaction(db);
      try {
        const media = parseMediaLibraryEntry(
          await tx.objectStore(MEDIA_LIBRARY_STORE).get(aggregateId)
        );
        if (!media || !media.mimeType.startsWith('video/'))
          throw new VideoWorkspaceError('missing-media');
        const result = await operation(tx, prepared, physicalDelete);
        if (physicalDelete.assetIds.length)
          await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
        await tx.done;
        return result;
      } catch (error) {
        try {
          tx.abort();
        } catch {
          /* A failed transaction may already be inactive. */
        }
        await tx.done.catch(() => undefined);
        throw error;
      }
    });
    // Authored content is already committed; a physical failure retains its durable replay intent.
    if (physicalDelete.assetIds.length)
      await completePhysicalDeleteOperation(physicalDelete, lifecyclePermit).catch(() => undefined);
    return committed;
  };
  if (!admitsSources) return execute({ assets: new Map(), libraryAudioClaims: [] });
  await initDB();
  return runWithDurableAssetLifecycleLock(async (lifecyclePermit) => {
    let prepared = await readReviewReadySources(aggregateId);
    if (effectSnapshots?.length) {
      const previous = await readVideoWorkspace(aggregateId);
      if (!previous) throw new VideoWorkspaceError('invalid');
      try {
        prepared = await verifyReviewAnnotationEffectSources(
          previous.workspace,
          effectSnapshots,
          prepared
        );
      } catch (error) {
        if (
          error instanceof ReviewAnnotationEffectUnavailableError &&
          error.code === 'resource-unavailable'
        )
          throw new VideoWorkspaceError('missing-media');
        throw new VideoWorkspaceError('invalid');
      }
    }
    return execute(prepared, lifecyclePermit);
  });
}

type ReviewReadySources = Awaited<ReturnType<typeof readReviewReadySources>>;

/** Opens the single session, retaining its complete history and recovery field on re-entry. */
export async function openVideoWorkspace(
  aggregateId: string,
  sourceValue: ReviewSource,
  expectedSourceAssetId?: string
): Promise<VideoWorkspaceSnapshot> {
  const source = parseReviewSource(sourceValue);
  if (!source) throw new VideoWorkspaceError('invalid');
  return mutate(aggregateId, async (tx) => {
    if (
      expectedSourceAssetId !== undefined &&
      expectedSourceAssetId !== (await readSourceAssetId(tx, aggregateId))
    )
      throw new VideoWorkspaceError('changed-source');
    const existing = await readSnapshot(tx, aggregateId);
    if (existing) {
      if (JSON.stringify(existing.snapshot.workspace.source) !== JSON.stringify(source))
        throw new VideoWorkspaceError('changed-source');
      return existing.snapshot;
    }
    const now = Date.now();
    const workspace = parseVideoWorkspace({
      aggregateId,
      formatVersion: 1,
      source,
      sourceAssetId: await readSourceAssetId(tx, aggregateId),
      revision: 1,
      history: [],
      cursor: 0,
      advanced: {
        ...createQuickEditAdvancedState(),
        background: { enabled: false, zoomBehavior: 'window' },
        presentation: createNewWorkspacePresentationSettings(),
      },
      createdAt: now,
      updatedAt: now,
    });
    if (!workspace) throw new VideoWorkspaceError('invalid');
    await replaceWorkspaceStorage(tx, workspace, indexedWorkspace(workspace).usageReferenceKeys);
    return { workspace, draft: null };
  });
}

async function requireSnapshot(
  tx: Transaction,
  aggregateId: string,
  expectedRevision: number,
  expectedSourceAssetId: string
): Promise<AdmittedWorkspaceSnapshot> {
  const admitted = await readSnapshot(tx, aggregateId);
  if (
    !admitted ||
    admitted.snapshot.workspace.revision !== expectedRevision ||
    admitted.snapshot.workspace.sourceAssetId !== expectedSourceAssetId
  )
    throw new VideoWorkspaceError('conflict');
  return admitted;
}

async function putWorkspace(
  tx: WriteTransaction,
  previous: VideoWorkspace,
  workspace: VideoWorkspace,
  storage: WorkspaceStorageRead,
  mode: 'append' | 'cursor' | 'replace',
  physicalDelete: PhysicalDeleteAssetOperation,
  prepared: ReviewReadySources = { assets: new Map(), libraryAudioClaims: [] }
): Promise<VideoWorkspace> {
  const admitted = parseVideoWorkspace({
    ...(mode === 'cursor'
      ? withoutVideoWorkspaceTyping(workspace)
      : pruneReviewAnnotationEffectSnapshots(
          mode === 'append' ? withoutVideoWorkspaceTyping(workspace) : workspace
        )),
    revision: workspace.revision + 1,
    updatedAt: Math.max(Date.now(), workspace.updatedAt),
  });
  if (!admitted) throw new VideoWorkspaceError('invalid');
  // Re-encode only after full before-state and redo admission; each accepted step keeps its identity.
  const encoded = {
    ...admitted,
    history: admitted.history.map((operation) =>
      operation.target === 'advancedContent'
        ? (createReviewAdvancedContentOperation(operation) ?? operation)
        : operation
    ),
  };
  const compacted = compactVideoWorkspaceHistory(encoded);
  const next = compacted.workspace;
  if (
    !(await areNewReviewSourcesAvailable(
      next,
      previous,
      {
        assets: tx.objectStore(PROJECT_ASSETS_STORE),
        media: tx.objectStore(MEDIA_LIBRARY_STORE),
      },
      prepared
    ))
  )
    throw new VideoWorkspaceError('missing-media');
  await promoteReviewSourceLifecycles(
    next,
    {
      assets: tx.objectStore(PROJECT_ASSETS_STORE),
      media: tx.objectStore(MEDIA_LIBRARY_STORE),
      recordings: tx.objectStore(STORE_NAME),
    },
    prepared
  );
  await writeWorkspaceStorage(tx, {
    previous,
    workspace: next,
    storage,
    mode,
    retentionStart:
      mode === 'replace' ? retainedWorkspaceReplacementStart(previous, next) : compacted.start,
    usageReferenceKeys: indexedWorkspace(next).usageReferenceKeys,
  });
  // A full-baseline buffer may already have expired history before reaching this writer.
  // Automatic expiry cannot revoke bytes still used by a paused or stale editor.
  if (mode !== 'cursor' && !(mode === 'replace' && admitted.formatVersion === 2)) {
    const retained = collectReviewAssetReferences(next);
    const removed = new Set(
      [...collectExplicitlyRemovedReviewEffectAssets(previous, admitted)]
        .filter((assetId) => !retained.has(assetId))
        .map((assetId) => assetId.slice('project-asset:'.length))
    );
    await releaseUnpublishedProjectAssets(tx, removed, physicalDelete);
  }
  return next;
}

/** Commits one operation; a matching recovery draft is consumed atomically with the history. */
export async function commitVideoWorkspace(args: {
  aggregateId: string;
  expectedRevision: number;
  expectedSourceAssetId: string;
  operation: unknown;
  consumeDraftRevision?: number;
  /** Snapshot registry and authored operation are admitted by the same durable transaction. */
  effectSnapshots?: unknown;
}): Promise<VideoWorkspaceSnapshot> {
  const effectSnapshots =
    args.effectSnapshots === undefined
      ? undefined
      : parseReviewAnnotationEffectSnapshots(args.effectSnapshots);
  if (
    effectSnapshots === null ||
    (effectSnapshots &&
      (!isRecord(args.operation) || args.operation['target'] !== 'advancedContent'))
  )
    throw new VideoWorkspaceError('invalid');
  return mutate(
    args.aggregateId,
    async (tx, prepared, physicalDelete) => {
      const {
        snapshot: { workspace, draft },
        document,
        storage,
      } = await requireSnapshot(
        tx,
        args.aggregateId,
        args.expectedRevision,
        args.expectedSourceAssetId
      );
      const parsed = parseReviewOperation(args.operation, workspace.source.duration);
      if (!parsed) throw new VideoWorkspaceError('invalid');
      const operation =
        parsed.target === 'edit'
          ? {
              ...parsed,
              preserveFocusAnchors: true as const,
              preserveUnderCuts: true as const,
              preserveVoiceoverAnchors: true as const,
              normalizeVoiceoverTempo: true as const,
            }
          : parsed;
      if (
        args.consumeDraftRevision !== undefined &&
        (!draft ||
          draft.revision !== args.consumeDraftRevision ||
          operation.target !== 'annotation' ||
          JSON.stringify(operation.after) !== JSON.stringify(draft.annotation) ||
          JSON.stringify(operation.before) !== JSON.stringify(draft.before))
      )
        throw new VideoWorkspaceError('conflict');
      applyReviewOperation(document, operation, workspace.source);
      const merged = effectSnapshots
        ? mergeReviewAnnotationEffectSnapshots(workspace.effectSnapshots ?? [], effectSnapshots)
        : undefined;
      if (merged === null) throw new VideoWorkspaceError('invalid');
      const next = await putWorkspace(
        tx,
        workspace,
        {
          ...workspace,
          ...(merged ? { effectSnapshots: merged } : {}),
          history: [...workspace.history.slice(0, workspace.cursor), operation],
          cursor: workspace.cursor + 1,
        },
        storage,
        'append',
        physicalDelete,
        prepared
      );
      if (args.consumeDraftRevision !== undefined)
        await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).delete(args.aggregateId);
      return { workspace: next, draft: args.consumeDraftRevision === undefined ? draft : null };
    },
    isRecord(args.operation) && args.operation['target'] === 'advancedContent',
    effectSnapshots
  );
}

/** Explicit field publication retains its earliest before state under the existing fresh CAS. */
export async function saveVideoWorkspaceTyping(args: {
  aggregateId: string;
  expectedRevision: number;
  expectedSourceAssetId: string;
  change: unknown;
}): Promise<VideoWorkspaceSnapshot> {
  const change = parseVideoWorkspaceTypingChange(args.change);
  if (!change) throw new VideoWorkspaceError('invalid');
  return mutate(
    args.aggregateId,
    async (tx, prepared, physicalDelete) => {
      const { snapshot, document, storage } = await requireSnapshot(
        tx,
        args.aggregateId,
        args.expectedRevision,
        args.expectedSourceAssetId
      );
      let candidate: VideoWorkspace;
      try {
        candidate = prepareVideoWorkspaceTyping(snapshot.workspace, document, change);
      } catch {
        throw new VideoWorkspaceError('conflict');
      }
      return {
        ...snapshot,
        workspace: await putWorkspace(
          tx,
          snapshot.workspace,
          candidate,
          storage,
          'replace',
          physicalDelete,
          prepared
        ),
      };
    },
    true
  );
}

/** Moves the existing cursor atomically; a boundary click does not create a revision. */
export async function moveVideoWorkspaceHistory(args: {
  aggregateId: string;
  expectedRevision: number;
  expectedSourceAssetId: string;
  direction: ReviewHistoryDirection;
}): Promise<VideoWorkspaceSnapshot> {
  return mutate(args.aggregateId, async (tx, _prepared, physicalDelete) => {
    const { snapshot, storage } = await requireSnapshot(
      tx,
      args.aggregateId,
      args.expectedRevision,
      args.expectedSourceAssetId
    );
    const cursor =
      args.direction === 'start'
        ? 0
        : snapshot.workspace.cursor + (args.direction === 'undo' ? -1 : 1);
    if (
      cursor === snapshot.workspace.cursor ||
      cursor < 0 ||
      cursor > snapshot.workspace.history.length
    )
      return snapshot;
    return {
      ...snapshot,
      workspace: await putWorkspace(
        tx,
        snapshot.workspace,
        { ...snapshot.workspace, cursor },
        storage,
        'cursor',
        physicalDelete
      ),
    };
  });
}

/** Replaces the whole advanced state; deletion happens only through explicit replacement. */
export async function saveVideoWorkspaceAdvanced(args: {
  aggregateId: string;
  expectedRevision: number;
  expectedSourceAssetId: string;
  advanced: unknown;
}): Promise<VideoWorkspaceSnapshot> {
  return mutate(
    args.aggregateId,
    async (tx, prepared, physicalDelete) => {
      const { snapshot, storage } = await requireSnapshot(
        tx,
        args.aggregateId,
        args.expectedRevision,
        args.expectedSourceAssetId
      );
      const advanced = loadQuickEditAdvancedState(args.advanced);
      if (!advanced) throw new VideoWorkspaceError('invalid');
      return {
        ...snapshot,
        workspace: await putWorkspace(
          tx,
          snapshot.workspace,
          { ...snapshot.workspace, advanced },
          storage,
          'replace',
          physicalDelete,
          prepared
        ),
      };
    },
    true
  );
}

/** Saves or explicitly discards field recovery, independently of the document history. */
export async function saveVideoWorkspaceDraft(args: {
  aggregateId: string;
  expectedRevision: number;
  expectedSourceAssetId: string;
  expectedDraftRevision: number | null;
  annotation: unknown;
  before: unknown;
}): Promise<VideoWorkspaceSnapshot> {
  return mutate(args.aggregateId, async (tx, _prepared, physicalDelete) => {
    const { snapshot, storage } = await requireSnapshot(
      tx,
      args.aggregateId,
      args.expectedRevision,
      args.expectedSourceAssetId
    );
    if ((snapshot.draft?.revision ?? null) !== args.expectedDraftRevision)
      throw new VideoWorkspaceError('conflict');
    if (args.annotation === null) {
      await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).delete(args.aggregateId);
      // Advancing the workspace revision prevents an old writer matching a recreated draft.
      return {
        workspace: snapshot.draft
          ? await putWorkspace(
              tx,
              snapshot.workspace,
              snapshot.workspace,
              storage,
              'cursor',
              physicalDelete
            )
          : snapshot.workspace,
        draft: null,
      };
    }
    const draft = parseVideoWorkspaceDraft(
      {
        aggregateId: args.aggregateId,
        revision: (snapshot.draft?.revision ?? 0) + 1,
        annotation: args.annotation,
        before: args.before,
        updatedAt: Date.now(),
      },
      snapshot.workspace.source.duration
    );
    if (!draft) throw new VideoWorkspaceError('invalid');
    await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).put(draft);
    return { ...snapshot, draft };
  });
}

/** Atomically saves a paused editor buffer, rejecting both document and draft-only competitors. */
export async function saveVideoWorkspaceSnapshot(args: {
  aggregateId: string;
  expectedRevision: number;
  expectedDraftRevision: number | null;
  expectedSourceAssetId: string;
  workspace: unknown;
  draft: unknown;
}): Promise<VideoWorkspaceSnapshot> {
  const captured = parseVideoWorkspace(args.workspace);
  if (!captured) throw new VideoWorkspaceError('invalid');
  return mutate(
    args.aggregateId,
    async (tx, prepared, physicalDelete) => {
      const { snapshot: current, storage } = await requireSnapshot(
        tx,
        args.aggregateId,
        args.expectedRevision,
        args.expectedSourceAssetId
      );
      if ((current.draft?.revision ?? null) !== args.expectedDraftRevision)
        throw new VideoWorkspaceError('conflict');
      const workspace = captured;
      if (
        !workspace ||
        workspace.aggregateId !== args.aggregateId ||
        workspace.sourceAssetId !== current.workspace.sourceAssetId ||
        JSON.stringify(workspace.source) !== JSON.stringify(current.workspace.source)
      )
        throw new VideoWorkspaceError('invalid');
      const parsedDraft =
        args.draft === null
          ? null
          : parseVideoWorkspaceDraft(args.draft, workspace.source.duration);
      if (args.draft !== null && (!parsedDraft || parsedDraft.aggregateId !== args.aggregateId))
        throw new VideoWorkspaceError('invalid');
      const next = await putWorkspace(
        tx,
        current.workspace,
        {
          ...workspace,
          revision: current.workspace.revision,
          createdAt: current.workspace.createdAt,
        },
        storage,
        'replace',
        physicalDelete,
        prepared
      );
      const draft = parsedDraft
        ? { ...parsedDraft, revision: (current.draft?.revision ?? 0) + 1, updatedAt: Date.now() }
        : null;
      if (draft) await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).put(draft);
      else await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).delete(args.aggregateId);
      return { workspace: next, draft };
    },
    true,
    captured.effectSnapshots
  );
}
