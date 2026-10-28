import { sameReviewVideoContainer } from '../../features/video/review/validation';
import { parseAssetRef, type AssetRef } from '../../composition/persistence/assets';
import {
  parseMediaLibraryEntry,
  parseMediaThumbnailEntry,
} from '../../composition/persistence/media-library/read-guards';
import {
  remapVideoReviewRecordingSource,
  prepareVideoReviewRestore,
} from '../../composition/persistence/review-workspaces/backup-restore';
import type { ApplyPreparedVideoProjectRevisionInput } from '../../composition/persistence/sync-capture/apply-video-project';
import {
  parsePreparedVideoReviewReplicaRoot,
  type PreparedVideoReviewReplicaRoot,
} from '../../composition/persistence/sync-capture/prepared-review';
import { MAX_CAPTURE_ROWS } from '../../composition/persistence/sync-capture/contracts';
import type { PortableMediaMetadata } from '../media-hub-backup/v6/root-codecs/media';
import { preparePortableVideoProjectAsset } from '../media-hub-backup/v6/root-codecs/projects';
import { verifyPreparedMediaReviewAnnotations } from '../media-hub-backup/v6/root-publication/media-review-assets';

/** Admit the existing backup carrier as saved review state, separate from its real Library source. */
export function validatePortableVideoReviewMetadata(
  metadata: PortableMediaMetadata,
  sourceMediaId: string
): void {
  const media = parseMediaLibraryEntry(metadata.entry);
  const review = metadata.videoReview;
  const sourcePrefix =
    media?.source.kind === 'recording'
      ? 'recording:'
      : media?.source.kind === 'project-export'
        ? 'export:'
        : 'project-asset:';
  const child =
    media?.source.kind === 'recording'
      ? metadata.recording?.entry
      : media?.source.kind === 'project-export'
        ? metadata.projectExport
        : metadata.projectAsset;
  if (
    !sourceMediaId.startsWith(sourcePrefix) ||
    sourceMediaId.length <= sourcePrefix.length ||
    sourceMediaId.length > 256 ||
    !media ||
    !['project-asset', 'project-export', 'recording'].includes(media.source.kind) ||
    (media.kind !== 'video' &&
      !(media.kind === 'export' && media.source.kind === 'project-export') &&
      !(media.source.kind === 'recording' && media.kind === 'recording')) ||
    !media.mimeType.startsWith('video/') ||
    media.lifecycle?.storageClass !== 'library' ||
    media.blob !== undefined ||
    (media.source.kind === 'project-asset' &&
      (media.recordingMetadata !== undefined || media.recordingGroup !== undefined)) ||
    !child ||
    child.size !== media.size ||
    !review?.workspace.project ||
    review.workspace.aggregateId !== media.id ||
    !sameReviewVideoContainer(review.workspace.source.mimeType, media.mimeType) ||
    review.workspace.source.size !== media.size ||
    (metadata.reviewAssets?.length ?? 0) > MAX_CAPTURE_ROWS
  )
    throw new Error('Unsupported portable video review root or source binding.');
  if (metadata.thumbnail) {
    const { objectId: _objectId, ...thumbnail } = metadata.thumbnail;
    if (!parseMediaThumbnailEntry({ ...thumbnail, assetId: media.id, blob: new Blob() }))
      throw new Error('Invalid portable video review thumbnail.');
  }
  for (const asset of metadata.reviewAssets ?? [])
    if (!asset.libraryMediaId && asset.publishToLibrary !== false)
      throw new Error('Portable video review resources must remain private.');
  const reviews = [
    review,
    ...(metadata.reviewAssets ?? []).flatMap((asset) =>
      asset.videoReview ? [asset.videoReview] : []
    ),
  ];
  for (const owner of reviews)
    for (const snapshot of owner.workspace.effectSnapshots ?? [])
      for (const resource of snapshot.assets) {
        const asset = metadata.reviewAssets?.find(
          (item) => `project-asset:${item.entry.id}` === resource.assetId
        );
        if (
          !asset ||
          asset.entry.size !== resource.byteLength ||
          asset.entry.mimeType !== resource.mimeType
        )
          throw new Error(
            'Portable review annotation resource metadata differs from its declaration.'
          );
      }
}

/** Rebind verified objects to admitted dependencies and persist private identities in one journal root. */
export async function preparePortableVideoReviewRoot(args: {
  metadata: PortableMediaMetadata;
  sourceMediaId: string;
  dependencies: ApplyPreparedVideoProjectRevisionInput['dependencies'];
  expectedLocalGeneration: number;
  refFor: (objectId: string) => AssetRef;
}): Promise<PreparedVideoReviewReplicaRoot> {
  validatePortableVideoReviewMetadata(args.metadata, args.sourceMediaId);
  const source = args.dependencies.find((dependency) => dependency.entry.id === args.sourceMediaId);
  const sourceRef = parseAssetRef(source?.ref);
  const originalRef = parseAssetRef(args.refFor(args.metadata.originalObjectId));
  if (
    !source ||
    !sourceRef ||
    !originalRef ||
    source.entry.source.kind !== args.metadata.entry.source.kind ||
    !(
      (source.entry.source.kind === 'project-asset' &&
        source.entry.id === `project-asset:${source.entry.source.projectAssetId}`) ||
      (source.entry.source.kind === 'recording' &&
        source.entry.id === `recording:${source.entry.source.recordingId}`) ||
      (source.entry.source.kind === 'project-export' &&
        source.entry.id === `export:${source.entry.source.exportId}`)
    ) ||
    (source.entry.kind !== 'video' &&
      !(source.entry.kind === 'export' && source.entry.source.kind === 'project-export') &&
      !(source.entry.source.kind === 'recording' && source.entry.kind === 'recording')) ||
    source.entry.mimeType !== args.metadata.entry.mimeType ||
    source.entry.size !== args.metadata.entry.size ||
    sourceRef.size !== source.entry.size ||
    sourceRef.mimeType !== source.entry.mimeType ||
    JSON.stringify(sourceRef) !== JSON.stringify(originalRef)
  )
    throw new Error('Portable review original differs from its admitted source dependency.');
  const resources = args.metadata.reviewAssets ?? [];
  const assetIds = new Map(
    resources.map((asset): [string, string] => {
      if (asset.libraryMediaId) {
        const dependency = args.dependencies.find((item) => item.entry.id === asset.libraryMediaId);
        if (!dependency || dependency.entry.source.kind !== 'project-asset')
          throw new Error('Portable review resource dependency is missing or unsupported.');
        return [asset.entry.id, dependency.entry.source.projectAssetId];
      }
      return [
        asset.entry.id,
        args.expectedLocalGeneration > 0 ? crypto.randomUUID() : asset.entry.id,
      ];
    })
  );
  const assets = resources.map((asset) => {
    const ref = parseAssetRef(args.refFor(asset.objectId));
    if (!ref || ref.size !== asset.entry.size || ref.mimeType !== asset.entry.mimeType)
      throw new Error('Portable review resource metadata differs from its verified object.');
    const entry = preparePortableVideoProjectAsset({
      entry: asset.entry,
      id: assetIds.get(asset.entry.id),
      originalRef: ref,
    });
    if (asset.libraryMediaId) {
      const dependency = args.dependencies.find((item) => item.entry.id === asset.libraryMediaId);
      if (
        !dependency ||
        dependency.entry.source.kind !== 'project-asset' ||
        dependency.entry.id !== `project-asset:${entry.id}` ||
        dependency.entry.size !== entry.size ||
        dependency.entry.mimeType !== entry.mimeType ||
        JSON.stringify(parseAssetRef(dependency.ref)) !== JSON.stringify(ref)
      )
        throw new Error('Borrowed portable review resource differs from admitted target bytes.');
    }
    return {
      entry,
      ref,
      filename: asset.filename,
      ...(asset.libraryMediaId ? { reusePublished: true } : {}),
      ...(asset.videoReview
        ? {
            videoReview: prepareVideoReviewRestore({
              review: asset.videoReview,
              sourceAggregateId: `project-asset:${asset.entry.id}`,
              targetAggregateId: `project-asset:${entry.id}`,
              sourceAssetId: ref.assetId,
              assetIdMap: assetIds,
            }),
          }
        : {}),
    };
  });
  const aggregateId = args.metadata.entry.id;
  const review = prepareVideoReviewRestore({
    review:
      args.metadata.entry.source.kind === 'recording' && source.entry.source.kind === 'recording'
        ? remapVideoReviewRecordingSource(
            args.metadata.videoReview!,
            args.metadata.entry.source.recordingId,
            source.entry.source.recordingId
          )
        : args.metadata.videoReview!,
    sourceAggregateId: aggregateId,
    targetAggregateId: aggregateId,
    sourceAssetId: sourceRef.assetId,
    assetIdMap: assetIds,
  });
  if (aggregateId !== args.sourceMediaId) review.workspace.sourceMediaId = args.sourceMediaId;
  const thumbnail = args.metadata.thumbnail;
  const root = parsePreparedVideoReviewReplicaRoot({
    review,
    sourceMediaId: args.sourceMediaId,
    assets,
    ...(thumbnail
      ? {
          thumbnail: {
            entry: {
              assetId: aggregateId,
              createdAt: thumbnail.createdAt,
              updatedAt: thumbnail.updatedAt,
              width: thumbnail.width,
              height: thumbnail.height,
              ...('generatorVersion' in thumbnail
                ? { generatorVersion: thumbnail.generatorVersion }
                : {}),
            },
            ref: args.refFor(thumbnail.objectId),
          },
        }
      : {}),
  });
  await verifyPreparedMediaReviewAnnotations(root.review, root.assets);
  for (const asset of root.assets)
    if (asset.videoReview)
      await verifyPreparedMediaReviewAnnotations(asset.videoReview, root.assets);
  return root;
}
