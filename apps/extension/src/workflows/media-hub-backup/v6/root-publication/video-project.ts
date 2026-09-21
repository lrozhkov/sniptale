import {
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core.stores';
import { prepareVideoReviewRestore } from '../../../../composition/persistence/review-workspaces/backup-restore';
import {
  appendCommittedArchiveRootInTransaction,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  readAssetFile,
} from '../../../../composition/persistence/assets';
import { parseMediaThumbnailEntry } from '../../../../composition/persistence/media-library/read-guards';
import {
  AGGREGATE_PRESENTATIONS_STORE,
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
  THUMBNAILS_STORE,
  VIDEO_PROJECTS_STORE,
} from '../../../../composition/persistence/infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../../../../composition/persistence/infrastructure/indexed-db/mutation';
import { putVideoProjectBackupRestore } from '../../../../composition/persistence/projects/backup-restore';
import {
  parseProjectAssetEntry,
  parseProjectExportEntry,
  parseVideoProjectEntry,
} from '../../../../composition/persistence/projects/read-guards';
import {
  decodePortableVideoProjectAssetRefs,
  parsePortableVideoProjectMetadata,
} from '../root-codecs/projects';
import type { ArchiveRootPublisher } from '../restore';
import type { StagedArchiveObject } from '../staging';
import { rebaseTemporaryLifecycle } from '../restore-lifecycle';
import { preparePortableAggregatePresentation } from './presentation';
import { transformPortableVideoProjectReferences } from './video-project-references';

function newId() {
  if (typeof crypto.randomUUID !== 'function')
    throw new Error('Secure restore IDs are unavailable.');
  return crypto.randomUUID();
}

function stagedMap(staged: readonly StagedArchiveObject[]) {
  return new Map(staged.map((object) => [object.objectId, object]));
}

function required(staged: ReadonlyMap<string, StagedArchiveObject>, objectId: string) {
  const object = staged.get(objectId);
  if (!object) throw new Error(`Video project archive object is missing: ${objectId}.`);
  return object;
}

export const videoProjectRootPublisher: ArchiveRootPublisher = {
  profile: 'video-project',
  async checkpointSkipIfExisting({ envelope, session }) {
    const metadata = parsePortableVideoProjectMetadata(envelope.metadata);
    return runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction([VIDEO_PROJECTS_STORE, ASSET_OPERATIONS_STORE], 'readwrite');
      if (!(await tx.objectStore(VIDEO_PROJECTS_STORE).get(metadata.entry.id))) {
        await tx.done;
        return false;
      }
      await appendCommittedArchiveRootInTransaction(
        tx.objectStore(ASSET_OPERATIONS_STORE),
        session.operationId,
        {
          rootKey: `video-project:${envelope.descriptor.rootId}`,
          targetRootId: metadata.entry.id,
          imported: false,
          conflicted: true,
        }
      );
      await tx.done;
      return true;
    });
  },
  async publish({ envelope, session, staged }) {
    const metadata = parsePortableVideoProjectMetadata(envelope.metadata);
    const objects = stagedMap(staged);
    const assetIdMap = new Map(
      metadata.projectAssets.map((asset) => [
        asset.entry.id,
        session.strategy === 'duplicate' ? newId() : asset.entry.id,
      ])
    );
    const exportIdMap = new Map(
      metadata.projectExports.map((item) => [
        item.entry.id,
        session.strategy === 'duplicate' ? newId() : item.entry.id,
      ])
    );
    const snapshots = await Promise.all(
      (metadata.entry.project.effectSnapshots ?? []).map(async (snapshot) => ({
        ...snapshot,
        assets: await Promise.all(
          snapshot.assets.map(async ({ objectId, ...asset }) => ({
            ...asset,
            blob: await readAssetFile(required(objects, objectId).ref, asset.id),
          }))
        ),
      }))
    );
    const portableEntry = parseVideoProjectEntry({
      ...metadata.entry,
      project: decodePortableVideoProjectAssetRefs({
        ...metadata.entry.project,
        effectSnapshots: snapshots,
      }),
    });
    if (!portableEntry) throw new Error('Restored video project metadata is invalid.');
    const transformedProject = transformPortableVideoProjectReferences(
      portableEntry.project,
      assetIdMap,
      session.rootIdMap,
      session.childIdMap
    );
    const sourceExists = await runWithIndexedDbMutation(async (db) =>
      Boolean(await db.get(VIDEO_PROJECTS_STORE, metadata.entry.id))
    );
    const targetProjectId =
      session.strategy === 'duplicate' && sourceExists ? newId() : metadata.entry.id;
    const rootKey = `video-project:${envelope.descriptor.rootId}`;
    const entry = parseVideoProjectEntry({
      ...rebaseTemporaryLifecycle(metadata.entry),
      id: targetProjectId,
      project: { ...transformedProject, id: targetProjectId },
    });
    if (!entry) throw new Error('Restored video project metadata is invalid.');
    const assets = metadata.projectAssets.map((asset) => {
      const object = required(objects, asset.objectId);
      const parsed = parseProjectAssetEntry({
        ...asset.entry,
        assetId: object.ref.assetId,
        id: assetIdMap.get(asset.entry.id),
        mimeType: object.ref.mimeType,
        size: object.ref.size,
      });
      if (!parsed) throw new Error('Restored video project asset metadata is invalid.');
      const videoReview = asset.videoReview
        ? prepareVideoReviewRestore({
            review: asset.videoReview,
            sourceAggregateId: `project-asset:${asset.entry.id}`,
            targetAggregateId: `project-asset:${parsed.id}`,
            sourceAssetId: object.ref.assetId,
            assetIdMap,
          })
        : null;
      if (videoReview && videoReview.workspace.source.size !== object.ref.size)
        throw new Error('Video review source bytes are inconsistent.');
      return {
        entry: parsed,
        filename: asset.filename,
        ref: object.ref,
        ...(videoReview ? { videoReview } : {}),
      };
    });
    const exports = await Promise.all(
      metadata.projectExports.map(async (item) => {
        const object = required(objects, item.objectId);
        const exportId = exportIdMap.get(item.entry.id)!;
        const parsed = parseProjectExportEntry({
          ...item.entry,
          assetId: object.ref.assetId,
          id: exportId,
          projectId: targetProjectId,
          mimeType: object.ref.mimeType,
          size: object.ref.size,
        });
        if (!parsed) throw new Error('Restored video project export metadata is invalid.');
        const thumbnail = item.thumbnail
          ? parseMediaThumbnailEntry({
              ...item.thumbnail,
              assetId: `export:${exportId}`,
              blob: await readAssetFile(
                required(objects, item.thumbnail.objectId).ref,
                `${exportId}-thumbnail`
              ),
            })
          : null;
        if (item.thumbnail && !thumbnail)
          throw new Error('Restored project export thumbnail is invalid.');
        const videoReview = item.videoReview
          ? prepareVideoReviewRestore({
              review: item.videoReview,
              sourceAggregateId: `export:${item.entry.id}`,
              targetAggregateId: `export:${exportId}`,
              sourceAssetId: object.ref.assetId,
              assetIdMap,
            })
          : null;
        if (videoReview && videoReview.workspace.source.size !== object.ref.size)
          throw new Error('Video review source bytes are inconsistent.');
        return {
          entry: parsed,
          ref: object.ref,
          ...(thumbnail ? { thumbnail } : {}),
          ...(videoReview ? { videoReview } : {}),
        };
      })
    );
    const thumbnail = metadata.thumbnail
      ? parseMediaThumbnailEntry({
          ...metadata.thumbnail,
          assetId: `video-project:${targetProjectId}`,
          blob: await readAssetFile(
            required(objects, metadata.thumbnail.objectId).ref,
            `${targetProjectId}-thumbnail`
          ),
        })
      : null;
    if (metadata.thumbnail && !thumbnail)
      throw new Error('Restored video project thumbnail is invalid.');
    const presentation = await preparePortableAggregatePresentation({
      getObjectRef: (objectId) => required(objects, objectId).ref,
      invalidMessage: 'Restored video project presentation is invalid.',
      metadata: metadata.presentation,
      targetId: targetProjectId,
    });
    const operation = buildPhysicalDeleteOperation([]);
    let conflicted = false;
    let imported = false;
    await runWithIndexedDbMutation(async (db) => {
      const tx = db.transaction(
        [
          VIDEO_PROJECTS_STORE,
          PROJECT_ASSETS_STORE,
          PROJECT_EXPORTS_STORE,
          MEDIA_LIBRARY_STORE,
          VIDEO_WORKSPACES_STORE,
          VIDEO_WORKSPACE_DRAFTS_STORE,
          THUMBNAILS_STORE,
          AGGREGATE_PRESENTATIONS_STORE,
          ASSET_REFS_STORE,
          ASSET_OWNERS_STORE,
          ASSET_OPERATIONS_STORE,
        ],
        'readwrite'
      );
      const restored = await putVideoProjectBackupRestore({
        operation,
        root: {
          assets,
          entry,
          exports,
          ...(presentation ? { presentation } : {}),
          ...(thumbnail ? { thumbnail } : {}),
        },
        stores: {
          assets: tx.objectStore(PROJECT_ASSETS_STORE),
          exports: tx.objectStore(PROJECT_EXPORTS_STORE),
          media: tx.objectStore(MEDIA_LIBRARY_STORE),
          videoWorkspaces: tx.objectStore(VIDEO_WORKSPACES_STORE),
          videoDrafts: tx.objectStore(VIDEO_WORKSPACE_DRAFTS_STORE),
          operations: tx.objectStore(ASSET_OPERATIONS_STORE),
          owners: tx.objectStore(ASSET_OWNERS_STORE),
          presentations: tx.objectStore(AGGREGATE_PRESENTATIONS_STORE),
          projects: tx.objectStore(VIDEO_PROJECTS_STORE),
          refs: tx.objectStore(ASSET_REFS_STORE),
          thumbnails: tx.objectStore(THUMBNAILS_STORE),
        },
        strategy: session.strategy,
      });
      if (operation.assetIds.length > 0)
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(operation);
      await appendCommittedArchiveRootInTransaction(
        tx.objectStore(ASSET_OPERATIONS_STORE),
        session.operationId,
        {
          rootKey,
          targetRootId: targetProjectId,
          imported: restored.imported,
          conflicted: restored.conflicted,
        }
      );
      await tx.done;
      imported = restored.imported;
      conflicted = restored.conflicted;
    });
    if (operation.assetIds.length > 0)
      await completePhysicalDeleteOperation(operation).catch(() => undefined);
    return {
      conflicted,
      imported,
      retainedAssetIds: [
        ...(imported ? assets.map((asset) => asset.ref.assetId) : []),
        ...(imported ? exports.map((item) => item.ref.assetId) : []),
      ],
    };
  },
};
