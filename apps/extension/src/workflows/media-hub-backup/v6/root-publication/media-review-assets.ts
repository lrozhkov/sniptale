import type {
  StoredRecordingEntry,
  RecordingTelemetryEntry,
} from '../../../../composition/persistence/recordings/contracts';
import { sameReviewVideoContainer } from '../../../../features/video/review/validation';
import { promoteReviewSourceLifecycles } from '../../../../composition/persistence/review-workspaces/new-reference-admission';
import {
  allocateVideoReviewRevision,
  readEnabledCaptureProfile,
} from '../../../../composition/persistence/sync-capture/capture';
import { parseCapturedMediaRows } from '../../../../composition/persistence/sync-capture/guards';
import { readWorkspaceStorage } from '../../../../composition/persistence/review-workspaces/storage';
import {
  parseVideoWorkspace,
  parseVideoWorkspaceDraft,
} from '../../../../composition/persistence/review-workspaces/parser';
import { materializeVideoWorkspaceProject } from '../../../../composition/persistence/review-workspaces/project-metadata';
import { VIDEO_WORKSPACE_DRAFTS_STORE } from '../../../../composition/persistence/infrastructure/indexed-db/core.stores';
import type { MediaLibraryEntry } from '../../../../composition/persistence/media-library/contracts';
import { verifyReviewAnnotationEffectSnapshot } from '../../../../features/video/review/annotation-effects/validation';
import { readAssetFile } from '../../../../composition/persistence/assets';
import type { VideoWorkspaceSnapshot } from '../../../../composition/persistence/review-workspaces/contracts';
import { assertPreparedProjectAssetSources } from '../../../../composition/persistence/projects/source-admission';
import { readSharedProjectAsset, restoredOriginMediaId } from './shared-project-media';
import {
  PROJECT_ASSET_OWNER_KIND,
  PROJECT_MEDIA_ASSET_ROLE,
} from '../../../../composition/persistence/projects/asset-publication';
import type { ProjectAssetEntry } from '../../../../composition/persistence/projects/contracts';
import { parseProjectAssetEntry } from '../../../../composition/persistence/projects/read-guards';
import {
  prepareVideoReviewRestore,
  putVideoReviewRestore,
} from '../../../../composition/persistence/review-workspaces/backup-restore';
import type { AssetRef } from '../../../../composition/persistence/assets';
import { buildProjectAssetMediaEntry } from '../../../../composition/persistence/media-library/entry-mapping';
import type { PortableMediaMetadata } from '../root-codecs/media';
import type { StagedArchiveObject } from '../staging';

type MutableStore = {
  get(key: IDBValidKey): Promise<unknown>;
  put(value: unknown): Promise<unknown>;
};

interface PreparedMediaReviewAsset {
  entry: ProjectAssetEntry;
  filename: string;
  ref: AssetRef;
  sourceId: string;
  publishToLibrary?: boolean;
  reusePublished?: boolean;
  videoReview?: VideoWorkspaceSnapshot;
}

interface PreparedMediaReviewRoot {
  media: MediaLibraryEntry;
  projectAsset: ProjectAssetEntry | null;
  recording: StoredRecordingEntry | null;
  telemetry?: RecordingTelemetryEntry;
  original: { ref: AssetRef };
  videoReview: VideoWorkspaceSnapshot | null;
}

interface MediaReviewAssetStores {
  media: Pick<MutableStore, 'put'>;
  owners: Pick<MutableStore, 'put'>;
  projectAssets: MutableStore;
  refs: Pick<MutableStore, 'put'>;
  videoWorkspaces: Pick<MutableStore, 'put'>;
  videoDrafts: Pick<MutableStore, 'put'> & { delete(key: string): Promise<unknown> };
}

function requireReviewObject(
  objects: ReadonlyMap<string, StagedArchiveObject>,
  objectId: string
): StagedArchiveObject {
  const object = objects.get(objectId);
  if (!object) throw new Error(`Media archive object is missing: ${objectId}.`);
  return object;
}

export async function prepareMediaReviewAssets(args: {
  createId: () => string;
  rootIdMap: Readonly<Record<string, string>>;
  metadata: Pick<PortableMediaMetadata, 'reviewAssets'>;
  objects: ReadonlyMap<string, StagedArchiveObject>;
}): Promise<PreparedMediaReviewAsset[]> {
  const prepared: PreparedMediaReviewAsset[] = await Promise.all(
    (args.metadata.reviewAssets ?? []).map(async (item) => {
      const object = requireReviewObject(args.objects, item.objectId);
      if (item.libraryMediaId) {
        const shared = await readSharedProjectAsset(
          item.libraryMediaId,
          args.rootIdMap,
          object.ref
        );
        return {
          entry: shared.entry,
          filename: item.filename,
          ref: shared.ref,
          sourceId: item.entry.id,
          reusePublished: true,
        };
      }
      const id = args.createId();
      const entry = parseProjectAssetEntry({
        ...item.entry,
        ...restoredOriginMediaId(item.entry.originMediaId, args.rootIdMap),
        id,
        assetId: object.ref.assetId,
        mimeType: object.ref.mimeType,
        size: object.ref.size,
      });
      if (!entry) throw new Error('Restored media review asset is invalid.');
      return {
        entry,
        filename: item.filename,
        ref: object.ref,
        sourceId: item.entry.id,
        ...(item.publishToLibrary === false ? { publishToLibrary: false } : {}),
      };
    })
  );
  const assetIds = new Map(prepared.map((asset) => [asset.sourceId, asset.entry.id]));
  const reviews = prepared.map((asset) => {
    const source = args.metadata.reviewAssets?.find((item) => item.entry.id === asset.sourceId);
    if (!source?.videoReview) return asset;
    if (asset.reusePublished)
      throw new Error('A borrowed review resource cannot replace its independent review.');
    const videoReview = prepareVideoReviewRestore({
      review: source.videoReview,
      sourceAggregateId: `project-asset:${asset.sourceId}`,
      targetAggregateId: `project-asset:${asset.entry.id}`,
      sourceAssetId: asset.ref.assetId,
      assetIdMap: assetIds,
    });
    if (
      videoReview.workspace.source.size !== asset.ref.size ||
      !sameReviewVideoContainer(videoReview.workspace.source.mimeType, asset.ref.mimeType)
    )
      throw new Error('Restored private review source bytes are inconsistent.');
    return { ...asset, videoReview };
  });
  for (const asset of reviews)
    if (asset.videoReview) await verifyPreparedMediaReviewAnnotations(asset.videoReview, reviews);
  return reviews;
}

export function prepareStandaloneMediaVideoReview(args: {
  mediaId: string;
  metadata: Pick<PortableMediaMetadata, 'entry' | 'videoReview'>;
  original: StagedArchiveObject;
  reviewAssets: readonly PreparedMediaReviewAsset[];
}): ReturnType<typeof prepareVideoReviewRestore> | null {
  if (!args.metadata.videoReview) return null;
  if (args.metadata.videoReview.workspace.source.size !== args.original.ref.size) {
    throw new Error('Restored video review bytes are inconsistent.');
  }
  return prepareVideoReviewRestore({
    review: args.metadata.videoReview,
    sourceAggregateId: args.metadata.entry.id,
    targetAggregateId: args.mediaId,
    sourceAssetId: args.original.ref.assetId,
    assetIdMap: new Map(args.reviewAssets.map((asset) => [asset.sourceId, asset.entry.id])),
    ...(args.metadata.entry.source.kind === 'recording' && args.mediaId.startsWith('recording:')
      ? {
          recordingIdMap: new Map([
            [args.metadata.entry.source.recordingId, args.mediaId.slice('recording:'.length)],
          ]),
        }
      : {}),
  });
}

export async function hasMediaReviewAssetConflict(
  stores: {
    projectAssets: Pick<MutableStore, 'get'>;
    media: Pick<MutableStore, 'get'>;
    refs: Pick<MutableStore, 'get'>;
  },
  reviewAssets: readonly PreparedMediaReviewAsset[],
  publishingMediaId?: string
): Promise<boolean> {
  await assertPreparedProjectAssetSources(
    reviewAssets,
    { assets: stores.projectAssets, media: stores.media, refs: stores.refs },
    publishingMediaId
  );
  const existing = await Promise.all(
    reviewAssets
      .filter((asset) => !asset.reusePublished)
      .map((asset) => stores.projectAssets.get(asset.entry.id))
  );
  return existing.some((value) => value !== undefined);
}

export async function publishMediaReviewAssets(
  reviewAssets: readonly PreparedMediaReviewAsset[],
  stores: MediaReviewAssetStores
): Promise<void> {
  for (const asset of reviewAssets) {
    if (asset.reusePublished) continue;
    await stores.refs.put(asset.ref);
    await stores.owners.put({
      assetId: asset.entry.assetId,
      ownerId: asset.entry.id,
      ownerKind: PROJECT_ASSET_OWNER_KIND,
      role: PROJECT_MEDIA_ASSET_ROLE,
    });
    await stores.projectAssets.put(asset.entry);
    if (asset.publishToLibrary !== false) {
      await stores.media.put({
        ...buildProjectAssetMediaEntry(asset.entry),
        filename: asset.filename,
        originalFilename: asset.filename,
      });
    }
  }
  for (const asset of reviewAssets)
    if (!asset.reusePublished && asset.videoReview)
      await putVideoReviewRestore({
        review: asset.videoReview,
        workspaces: stores.videoWorkspaces,
        drafts: stores.videoDrafts,
      });
}

/** Verifies all retained sources, including disabled and redo-only graphs, before archive mutation. */
export async function verifyPreparedMediaReviewAnnotations(
  review: VideoWorkspaceSnapshot,
  assets: readonly Pick<PreparedMediaReviewAsset, 'entry' | 'ref'>[]
): Promise<void> {
  const signal = new AbortController().signal;
  for (const snapshot of review.workspace.effectSnapshots ?? []) {
    await verifyReviewAnnotationEffectSnapshot(
      snapshot,
      async (reference, readSignal) => {
        readSignal.throwIfAborted();
        const asset = assets.find(
          (candidate) => `project-asset:${candidate.entry.id}` === reference
        );
        return asset ? readAssetFile(asset.ref, asset.entry.id) : undefined;
      },
      signal
    );
  }
}

/** Only the admitted Library original family can publish a review sync root. */
export function isCaptureReview(prepared: PreparedMediaReviewRoot): boolean {
  return (
    prepared.videoReview !== null &&
    (prepared.media.kind === 'video' ||
      (prepared.media.kind === 'recording' && prepared.media.source.kind === 'recording')) &&
    (prepared.media.source.kind === 'project-asset' ||
      prepared.media.source.kind === 'recording') &&
    parseCapturedMediaRows({
      media: prepared.media,
      ...(prepared.recording
        ? { recording: prepared.recording, telemetry: prepared.telemetry ?? null }
        : { projectAsset: prepared.projectAsset }),
      ref: prepared.original.ref,
    }) !== null
  );
}

/** Rebase the prepared review inside the existing media publication transaction. */
export async function rebaseRestoredVideoReview(
  tx: Parameters<typeof allocateVideoReviewRevision>[0],
  prepared: PreparedMediaReviewRoot
): Promise<void> {
  if (!isCaptureReview(prepared) || !prepared.videoReview || !(await readEnabledCaptureProfile(tx)))
    return;
  const id = prepared.media.id;
  const stored = await readWorkspaceStorage(tx, id);
  const current = stored.logical === undefined ? null : parseVideoWorkspace(stored.logical);
  const rawDraft: unknown = await tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE).get(id);
  const currentDraft =
    rawDraft === undefined
      ? null
      : parseVideoWorkspaceDraft(rawDraft, current?.source.duration ?? 0);
  if (
    (stored.logical !== undefined && !current) ||
    (rawDraft !== undefined && (!current || !currentDraft || currentDraft.aggregateId !== id))
  )
    throw new Error('Existing video review cannot be replaced safely.');
  const revision = await allocateVideoReviewRevision(
    tx,
    id,
    Math.max(prepared.videoReview.workspace.revision, current?.revision ?? 0) + 1
  );
  const draftRevision =
    Math.max(prepared.videoReview.draft?.revision ?? 0, currentDraft?.revision ?? 0, revision) + 1;
  if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(draftRevision))
    throw new Error('Restored video review revision exhausted.');
  prepared.videoReview = {
    workspace: {
      ...materializeVideoWorkspaceProject(prepared.videoReview.workspace, prepared.media.filename),
      revision,
    },
    draft: prepared.videoReview.draft
      ? { ...prepared.videoReview.draft, revision: draftRevision }
      : null,
  };
}

/** Publish the standalone review after its private resources in the caller transaction. */
export async function publishStandaloneMediaVideoReview(
  review: VideoWorkspaceSnapshot | null,
  stores: Omit<Parameters<typeof promoteReviewSourceLifecycles>[1], 'assets'> & {
    projectAssets: Parameters<typeof promoteReviewSourceLifecycles>[1]['assets'];
    videoWorkspaces: MediaReviewAssetStores['videoWorkspaces'];
    videoDrafts: MediaReviewAssetStores['videoDrafts'];
  }
): Promise<void> {
  if (review) {
    await promoteReviewSourceLifecycles(
      review.workspace,
      {
        assets: stores.projectAssets,
        media: stores.media,
        recordings: stores.recordings,
      },
      { assets: new Map(), libraryAudioClaims: [] }
    );
    await putVideoReviewRestore({
      review: review,
      workspaces: stores.videoWorkspaces,
      drafts: stores.videoDrafts,
    });
  }
}
