import { isRecord } from '@sniptale/runtime-contracts/validation/primitives';
import {
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import type { VideoWorkspace, VideoWorkspaceDraft, VideoWorkspaceSnapshot } from './contracts';
import { parseVideoWorkspace, parseVideoWorkspaceDraft } from './parser';
import { remapReviewAssetReferences } from './asset-refs';

/** Portable review includes all history and field recovery, but no local OPFS identity. */
export interface PortableVideoReview {
  workspace: Omit<VideoWorkspace, 'sourceAssetId'>;
  draft: VideoWorkspaceDraft | null;
}

/** Validates portable state and its association before archive publication. */
export function parsePortableVideoReview(value: unknown, aggregateId: string): PortableVideoReview {
  if (!isRecord(value) || !isRecord(value['workspace']) || 'sourceAssetId' in value['workspace']) {
    throw new Error('Portable video review is invalid.');
  }
  const workspace = parseVideoWorkspace({ ...value['workspace'], sourceAssetId: 'portable' });
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
  ): {
    objectStore(name: string): { get(key: string): Promise<unknown> };
    done: Promise<unknown>;
  };
}

/** Reads both authoritative sidecars, refusing corrupt or stale-source backups. */
export async function readVideoReviewForBackup(args: {
  db: VideoReviewBackupDatabase;
  aggregateId: string;
  sourceAssetId: string;
}): Promise<PortableVideoReview | undefined> {
  const tx = args.db.transaction(
    [VIDEO_WORKSPACES_STORE, VIDEO_WORKSPACE_DRAFTS_STORE],
    'readonly'
  );
  const [raw, rawDraft] = await Promise.all([
    tx.objectStore(VIDEO_WORKSPACES_STORE).get(args.aggregateId),
    tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).get(args.aggregateId),
  ]);
  await tx.done;
  if (raw === undefined && rawDraft === undefined) return undefined;
  const workspace = parseVideoWorkspace(raw);
  if (!workspace || workspace.sourceAssetId !== args.sourceAssetId) {
    throw new Error('Video review source is missing or changed.');
  }
  const { sourceAssetId: _localId, ...portable } = workspace;
  return parsePortableVideoReview(
    { workspace: portable, draft: rawDraft === undefined ? null : rawDraft },
    args.aggregateId
  );
}

/** Rebinds a verified portable review to the restored video and its new local byte object. */
export function prepareVideoReviewRestore(args: {
  review: PortableVideoReview;
  sourceAggregateId: string;
  targetAggregateId: string;
  sourceAssetId: string;
  /** Restored project-asset id map for review audio and image references. */
  assetIdMap?: ReadonlyMap<string, string>;
}): VideoWorkspaceSnapshot {
  const review = parsePortableVideoReview(args.review, args.sourceAggregateId);
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
  const { assetIdMap } = args;
  return assetIdMap && assetIdMap.size
    ? remapReviewAssetReferences(snapshot, assetIdMap)
    : snapshot;
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
  await args.workspaces.put(args.review.workspace);
  if (args.review.draft) await args.drafts.put(args.review.draft);
  else await args.drafts.delete(args.review.workspace.aggregateId);
}
