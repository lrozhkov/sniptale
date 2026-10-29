import type { AssetOwner, AssetRef } from '../assets';
import type { AggregatePresentationEntry } from '../aggregate-presentations/contracts';
import type { MediaLibraryEntry, MediaThumbnailEntry } from '../media-library/contracts';
import { buildProjectAssetMediaEntry } from '../media-library/entry-mapping';
import { withVideoProjectUsage } from '../media-library/usage-index-keys';
import { createLibraryLifecycle, promoteLibraryLifecycle } from '../library-lifecycle/contracts';
import { putVideoReviewRestore } from '../review-workspaces/backup-restore';
import type {
  VideoWorkspace,
  VideoWorkspaceDraft,
  VideoWorkspaceSnapshot,
} from '../review-workspaces/contracts';
import type { StoredProjectAssetEntry, VideoProjectEntry } from './contracts';
import { PROJECT_ASSET_OWNER_KIND, PROJECT_MEDIA_ASSET_ROLE } from './asset-publication';

export interface PreparedVideoProjectRevision {
  assets: Array<{
    entry: StoredProjectAssetEntry;
    filename: string;
    publishToLibrary?: boolean;
    reusePublished?: boolean;
    ref: AssetRef;
    videoReview?: VideoWorkspaceSnapshot;
  }>;
  entry: VideoProjectEntry;
  presentation?: AggregatePresentationEntry;
  thumbnail?: MediaThumbnailEntry;
}

interface PublicationStore<T> {
  put(value: T): Promise<unknown>;
}

export interface VideoProjectRevisionPublicationStores {
  assets: PublicationStore<StoredProjectAssetEntry>;
  media: PublicationStore<MediaLibraryEntry>;
  videoWorkspaces: PublicationStore<VideoWorkspace>;
  videoDrafts: PublicationStore<VideoWorkspaceDraft> & { delete(key: string): Promise<unknown> };
  owners: PublicationStore<AssetOwner>;
  presentations: PublicationStore<AggregatePresentationEntry>;
  projects: PublicationStore<VideoProjectEntry>;
  refs: PublicationStore<AssetRef>;
  thumbnails: PublicationStore<MediaThumbnailEntry>;
}

/** Publish accepted native rows inside the caller's transaction. */
export async function publishPreparedVideoProjectRevisionInTransaction(args: {
  root: PreparedVideoProjectRevision;
  stores: VideoProjectRevisionPublicationStores;
  workspaceRevision: number;
}): Promise<void> {
  const lifecycle =
    args.root.entry.lifecycle ?? createLibraryLifecycle('library', args.root.entry.updatedAt);
  await args.stores.projects.put(
    withVideoProjectUsage({
      ...args.root.entry,
      workspaceRevision: args.workspaceRevision,
      lifecycle: promoteLibraryLifecycle(lifecycle, lifecycle.updatedAt),
    })
  );
  for (const asset of args.root.assets) {
    if (asset.reusePublished) continue;
    await args.stores.refs.put(asset.ref);
    await args.stores.owners.put({
      assetId: asset.ref.assetId,
      ownerId: asset.entry.id,
      ownerKind: PROJECT_ASSET_OWNER_KIND,
      role: PROJECT_MEDIA_ASSET_ROLE,
    });
    await args.stores.assets.put(asset.entry);
    if (asset.videoReview)
      await putVideoReviewRestore({
        review: asset.videoReview,
        workspaces: args.stores.videoWorkspaces,
        drafts: args.stores.videoDrafts,
      });
    if (asset.publishToLibrary !== false) {
      await args.stores.media.put({
        ...buildProjectAssetMediaEntry(asset.entry),
        filename: asset.filename,
        originalFilename: asset.filename,
      });
    }
  }
}

/** Publish sidecars after the caller's intervening publication phase. */
export async function publishPreparedVideoProjectSidecarsInTransaction(args: {
  root: PreparedVideoProjectRevision;
  stores: VideoProjectRevisionPublicationStores;
  workspaceRevision: number;
}): Promise<void> {
  if (args.root.thumbnail) await args.stores.thumbnails.put(args.root.thumbnail);
  if (args.root.presentation)
    await args.stores.presentations.put({
      ...args.root.presentation,
      presentationRevision: args.workspaceRevision,
    });
}
