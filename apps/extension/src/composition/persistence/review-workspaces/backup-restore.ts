import type { QuickEditAdvancedContent } from '../../../features/video/review/advanced/types';
import { readWorkspaceStorage, type WorkspaceStorageReadTransaction } from './storage';
import { withReviewWorkspaceUsage } from '../media-library/usage-index-keys';
import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import type { VideoWorkspace, VideoWorkspaceDraft, VideoWorkspaceSnapshot } from './contracts';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from './parser';
import {
  assertPortableReviewAssetRefs,
  decodePortableReviewAssetRefs,
  remapReviewAssetReferences,
} from './asset-refs';

/** Portable review includes all history and field recovery, but no local OPFS identity. */
export interface PortableVideoReview {
  workspace: Omit<VideoWorkspace, 'sourceAssetId' | 'typing' | 'sourceMediaId'>;
  draft: VideoWorkspaceDraft | null;
}

/** Validates portable state and its association before archive publication. */
export function parsePortableVideoReview(value: unknown, aggregateId: string): PortableVideoReview {
  return parsePortableVideoReviewShape(value, aggregateId, false);
}

function parsePortableVideoReviewShape(
  value: unknown,
  aggregateId: string,
  allowLocalAssetIds: boolean
): PortableVideoReview {
  if (
    !isRecord(value) ||
    !isRecord(value['workspace']) ||
    'sourceAssetId' in value['workspace'] ||
    'typing' in value['workspace'] ||
    'sourceMediaId' in value['workspace']
  ) {
    throw new Error('Portable video review is invalid.');
  }
  if (!allowLocalAssetIds) assertPortableReviewAssetRefs(value['workspace']);
  const workspace = parseVideoWorkspace({
    ...(decodePortableReviewAssetRefs(value['workspace']) as Record<string, unknown>),
    sourceAssetId: 'portable',
  });
  const draft =
    value['draft'] === null
      ? null
      : parseVideoWorkspaceDraft(value['draft'], workspace?.source.duration ?? 0);
  if (
    !workspace ||
    workspace.aggregateId !== aggregateId ||
    (value['draft'] !== null && (!draft || draft.aggregateId !== aggregateId))
  ) {
    throw new Error('Portable video review association is invalid.');
  }
  const { sourceAssetId: _localId, ...portable } = workspace;
  return { workspace: portable, draft };
}

/** Snapshot reader supplied by the canonical database owner. */
export interface VideoReviewBackupDatabase {
  transaction(
    stores: string[],
    mode: 'readonly'
  ): WorkspaceStorageReadTransaction & { done: Promise<unknown> };
}

/** Reads both authoritative sidecars, refusing corrupt or stale-source backups. */
export async function readVideoReviewForBackup(args: {
  db: VideoReviewBackupDatabase;
  aggregateId: string;
  sourceAssetId: string;
  expectedSnapshot?: VideoWorkspaceSnapshot | undefined;
}): Promise<PortableVideoReview | undefined> {
  const tx = args.db.transaction(
    [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_HISTORY_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    'readonly'
  );
  const [raw, rawDraft] = await Promise.all([
    readWorkspaceStorage(tx, args.aggregateId).then((stored) => stored.logical),
    tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).get(args.aggregateId),
  ]);
  await tx.done;
  if (raw === undefined && rawDraft === undefined && !args.expectedSnapshot) return undefined;
  const workspace = parseVideoWorkspace(raw);
  if (!workspace || workspace.sourceAssetId !== args.sourceAssetId) {
    throw new Error('Video review source is missing or changed.');
  }
  const {
    sourceAssetId: _localId,
    typing: _typing,
    sourceMediaId: _sourceMediaId,
    ...portable
  } = workspace;
  const result = parsePortableVideoReviewShape(
    { workspace: portable, draft: rawDraft === undefined ? null : rawDraft },
    args.aggregateId,
    true
  );
  if (args.expectedSnapshot) {
    const {
      sourceAssetId,
      typing: _expectedTyping,
      sourceMediaId: _expectedMediaId,
      ...expectedWorkspace
    } = args.expectedSnapshot.workspace;
    const expected = parsePortableVideoReviewShape(
      { workspace: expectedWorkspace, draft: args.expectedSnapshot.draft },
      args.aggregateId,
      true
    );
    if (sourceAssetId !== args.sourceAssetId || JSON.stringify(result) !== JSON.stringify(expected))
      throw new Error('Video review changed before backup. Retry the backup.');
  }
  return result;
}

/** Recording aliases change only source bindings; history identities and authored values remain intact. */
export function remapVideoReviewRecordingSource(
  review: PortableVideoReview,
  sourceRecordingId: string,
  targetRecordingId: string
): PortableVideoReview {
  const content = <T extends QuickEditAdvancedContent>(value: T): T => {
    if (!value.cursorFocusPath) return value;
    return {
      ...value,
      cursorFocusPath: {
        ...value.cursorFocusPath,
        segments: value.cursorFocusPath.segments.map((segment) => ({
          ...segment,
          binding:
            segment.binding.kind === 'recording-source' &&
            segment.binding.recordingId === sourceRecordingId
              ? { ...segment.binding, recordingId: targetRecordingId }
              : segment.binding,
        })),
      },
    };
  };
  const workspace = review.workspace;
  return {
    ...review,
    workspace: {
      ...workspace,
      advanced: content(workspace.advanced),
      ...(workspace.baseline
        ? {
            baseline: {
              ...workspace.baseline,
              advancedContent: content(workspace.baseline.advancedContent),
            },
          }
        : {}),
      history: workspace.history.map((operation) =>
        operation.target === 'advancedContent'
          ? { ...operation, before: content(operation.before), after: content(operation.after) }
          : operation
      ),
    },
  };
}

/** Rebinds a verified portable review to the restored video and its new local byte object. */
export function prepareVideoReviewRestore(args: {
  review: PortableVideoReview;
  sourceAggregateId: string;
  targetAggregateId: string;
  sourceAssetId: string;
  /** Restored project-asset id map for review audio and image references. */
  assetIdMap?: ReadonlyMap<string, string>;
  recordingIdMap?: ReadonlyMap<string, string>;
}): VideoWorkspaceSnapshot {
  let review = parsePortableVideoReviewShape(args.review, args.sourceAggregateId, true);
  for (const [sourceId, targetId] of args.recordingIdMap ?? [])
    review = remapVideoReviewRecordingSource(review, sourceId, targetId);
  const workspace = parseVideoWorkspace({
    ...review.workspace,
    aggregateId: args.targetAggregateId,
    sourceAssetId: args.sourceAssetId,
  });
  if (!workspace) throw new Error('Restored video review is invalid.');
  const snapshot: VideoWorkspaceSnapshot = {
    workspace,
    draft: review.draft ? { ...review.draft, aggregateId: args.targetAggregateId } : null,
  };
  return remapReviewAssetReferences(snapshot, args.assetIdMap ?? new Map());
}

/** Must be called inside the original media publication transaction. */
export async function putVideoReviewRestore(args: {
  review: VideoWorkspaceSnapshot;
  workspaces: { put(value: VideoWorkspace): Promise<unknown> };
  drafts: {
    put(value: VideoWorkspaceDraft): Promise<unknown>;
    delete(key: string): Promise<unknown>;
  };
}): Promise<void> {
  await args.workspaces.put(withReviewWorkspaceUsage(args.review.workspace));
  if (args.review.draft) await args.drafts.put(args.review.draft);
  else await args.drafts.delete(args.review.workspace.aggregateId);
}
