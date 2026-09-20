import {
  STORE_NAME,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import { parseRecordingEntry } from '../recordings/index.guards';
import { parseProjectAssetEntry, parseProjectExportEntry } from '../projects/read-guards';
import {
  initDB,
  MEDIA_LIBRARY_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import {
  applyReviewOperation,
  replayReviewHistory,
  reviewAdvancedContentBaseline,
} from '../../../features/video/review/document';
import { parseReviewOperation, parseReviewSource } from '../../../features/video/review/validation';
import { loadQuickEditAdvancedState } from '../../../features/video/review/advanced/validation';
import type { ReviewSource } from '../../../features/video/review/types';
import type { VideoWorkspace, VideoWorkspaceSnapshot } from './contracts';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from './parser';

const stores = [
  MEDIA_LIBRARY_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  STORE_NAME,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
];
type Database = Awaited<ReturnType<typeof initDB>>;
type Transaction = ReturnType<Database['transaction']>;
function beginWriteTransaction(db: Database) {
  return db.transaction(stores, 'readwrite', { durability: 'strict' });
}
type WriteTransaction = ReturnType<typeof beginWriteTransaction>;

/** Recoverable failure codes; never include user text in the error. */
class VideoWorkspaceError extends Error {
  constructor(public readonly code: 'invalid' | 'conflict' | 'missing-media' | 'changed-source') {
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

async function readSnapshot(
  tx: Transaction,
  aggregateId: string
): Promise<VideoWorkspaceSnapshot | null> {
  const raw: unknown = await tx.objectStore(VIDEO_WORKSPACES_STORE).get(aggregateId);
  const rawDraft: unknown = await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).get(aggregateId);
  if (raw === undefined && rawDraft === undefined) return null;
  const workspace = parseVideoWorkspace(raw);
  if (!workspace || workspace.aggregateId !== aggregateId) throw new VideoWorkspaceError('invalid');
  const draft =
    rawDraft === undefined ? null : parseVideoWorkspaceDraft(rawDraft, workspace.source.duration);
  if (rawDraft !== undefined && (!draft || draft.aggregateId !== aggregateId)) {
    throw new VideoWorkspaceError('invalid');
  }
  if (workspace.sourceAssetId !== (await readSourceAssetId(tx, aggregateId)))
    throw new VideoWorkspaceError('changed-source');
  return { workspace, draft };
}

/** Read-only recovery: missing is distinct from invalid and never repairs durable content. */
export async function readVideoWorkspace(
  aggregateId: string
): Promise<VideoWorkspaceSnapshot | null> {
  const db = await initDB();
  const tx = db.transaction(stores, 'readonly');
  const snapshot = await readSnapshot(tx, aggregateId);
  await tx.done;
  return snapshot;
}

async function mutate<T>(
  aggregateId: string,
  operation: (tx: WriteTransaction) => Promise<T>
): Promise<T> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = beginWriteTransaction(db);
    try {
      const media = parseMediaLibraryEntry(
        await tx.objectStore(MEDIA_LIBRARY_STORE).get(aggregateId)
      );
      if (!media || !media.mimeType.startsWith('video/'))
        throw new VideoWorkspaceError('missing-media');
      const result = await operation(tx);
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
}

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
      if (JSON.stringify(existing.workspace.source) !== JSON.stringify(source))
        throw new VideoWorkspaceError('changed-source');
      return existing;
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
      createdAt: now,
      updatedAt: now,
    });
    if (!workspace) throw new VideoWorkspaceError('invalid');
    await tx.objectStore(VIDEO_WORKSPACES_STORE).put(workspace);
    return { workspace, draft: null };
  });
}

async function requireSnapshot(
  tx: Transaction,
  aggregateId: string,
  expectedRevision: number,
  expectedSourceAssetId: string
): Promise<VideoWorkspaceSnapshot> {
  const snapshot = await readSnapshot(tx, aggregateId);
  if (
    !snapshot ||
    snapshot.workspace.revision !== expectedRevision ||
    snapshot.workspace.sourceAssetId !== expectedSourceAssetId
  )
    throw new VideoWorkspaceError('conflict');
  return snapshot;
}

async function putWorkspace(
  tx: WriteTransaction,
  workspace: VideoWorkspace
): Promise<VideoWorkspace> {
  const next = parseVideoWorkspace({
    ...workspace,
    revision: workspace.revision + 1,
    updatedAt: Math.max(Date.now(), workspace.updatedAt),
  });
  if (!next) throw new VideoWorkspaceError('invalid');
  await tx.objectStore(VIDEO_WORKSPACES_STORE).put(next);
  return next;
}

/** Commits one operation; a matching recovery draft is consumed atomically with the history. */
export async function commitVideoWorkspace(args: {
  aggregateId: string;
  expectedRevision: number;
  expectedSourceAssetId: string;
  operation: unknown;
  consumeDraftRevision?: number;
}): Promise<VideoWorkspaceSnapshot> {
  return mutate(args.aggregateId, async (tx) => {
    const { workspace, draft } = await requireSnapshot(
      tx,
      args.aggregateId,
      args.expectedRevision,
      args.expectedSourceAssetId
    );
    const parsed = parseReviewOperation(args.operation, workspace.source.duration);
    if (!parsed) throw new VideoWorkspaceError('invalid');
    const operation =
      parsed.target === 'edit' ? { ...parsed, preserveFocusAnchors: true as const } : parsed;
    if (
      args.consumeDraftRevision !== undefined &&
      (!draft ||
        draft.revision !== args.consumeDraftRevision ||
        operation.target !== 'annotation' ||
        JSON.stringify(operation.after) !== JSON.stringify(draft.annotation) ||
        JSON.stringify(operation.before) !== JSON.stringify(draft.before))
    )
      throw new VideoWorkspaceError('conflict');
    const document = replayReviewHistory(
      workspace.history,
      workspace.cursor,
      workspace.source,
      reviewAdvancedContentBaseline(workspace.advanced)
    );
    applyReviewOperation(document, operation, workspace.source);
    const next = await putWorkspace(tx, {
      ...workspace,
      history: [...workspace.history.slice(0, workspace.cursor), operation],
      cursor: workspace.cursor + 1,
    });
    if (args.consumeDraftRevision !== undefined)
      await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).delete(args.aggregateId);
    return { workspace: next, draft: args.consumeDraftRevision === undefined ? draft : null };
  });
}

/** Moves one strict undo/redo step; a boundary click does not create a revision. */
export async function moveVideoWorkspaceHistory(args: {
  aggregateId: string;
  expectedRevision: number;
  expectedSourceAssetId: string;
  direction: 'undo' | 'redo';
}): Promise<VideoWorkspaceSnapshot> {
  return mutate(args.aggregateId, async (tx) => {
    const snapshot = await requireSnapshot(
      tx,
      args.aggregateId,
      args.expectedRevision,
      args.expectedSourceAssetId
    );
    const cursor = snapshot.workspace.cursor + (args.direction === 'undo' ? -1 : 1);
    if (cursor < 0 || cursor > snapshot.workspace.history.length) return snapshot;
    return { ...snapshot, workspace: await putWorkspace(tx, { ...snapshot.workspace, cursor }) };
  });
}

/** Replaces the whole advanced state; deletion happens only through explicit replacement. */
export async function saveVideoWorkspaceAdvanced(args: {
  aggregateId: string;
  expectedRevision: number;
  expectedSourceAssetId: string;
  advanced: unknown;
}): Promise<VideoWorkspaceSnapshot> {
  return mutate(args.aggregateId, async (tx) => {
    const snapshot = await requireSnapshot(
      tx,
      args.aggregateId,
      args.expectedRevision,
      args.expectedSourceAssetId
    );
    const advanced = loadQuickEditAdvancedState(args.advanced);
    if (!advanced) throw new VideoWorkspaceError('invalid');
    return {
      ...snapshot,
      workspace: await putWorkspace(tx, { ...snapshot.workspace, advanced }),
    };
  });
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
  return mutate(args.aggregateId, async (tx) => {
    const snapshot = await requireSnapshot(
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
        workspace: snapshot.draft ? await putWorkspace(tx, snapshot.workspace) : snapshot.workspace,
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
