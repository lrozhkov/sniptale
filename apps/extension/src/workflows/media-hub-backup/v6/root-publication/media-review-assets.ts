import { assertPreparedProjectAssetSources } from '../../../../composition/persistence/projects/source-admission';
import { readSharedProjectAsset, restoredOriginMediaId } from './shared-project-media';
import {
  PROJECT_ASSET_OWNER_KIND,
  PROJECT_MEDIA_ASSET_ROLE,
} from '../../../../composition/persistence/projects/asset-publication';
import type { ProjectAssetEntry } from '../../../../composition/persistence/projects/contracts';
import { parseProjectAssetEntry } from '../../../../composition/persistence/projects/read-guards';
import { prepareVideoReviewRestore } from '../../../../composition/persistence/review-workspaces/backup-restore';
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
}

interface MediaReviewAssetStores {
  media: Pick<MutableStore, 'put'>;
  owners: Pick<MutableStore, 'put'>;
  projectAssets: MutableStore;
  refs: Pick<MutableStore, 'put'>;
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
  return Promise.all(
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
}
