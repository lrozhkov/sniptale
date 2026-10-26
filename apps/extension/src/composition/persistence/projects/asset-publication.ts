import { captureVideoProjectInTransaction } from '../sync-capture/capture';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import type { IDBPTransaction } from 'idb';
import {
  parseProjectAssetPayload,
  type ProjectAssetPublicationOptions,
  type ProjectAssetPublicationPayload,
  type KnownLibrarySourceClaim,
} from './asset-publication-payload';
import { admitKnownLibraryPublication } from './known-library-source';
import { readWorkspaceStorage } from '../review-workspaces/storage';
import { parseVideoWorkspace } from '../review-workspaces/parser';
export type {
  ProjectAssetPublicationOptions,
  ProjectAssetPublicationPayload,
} from './asset-publication-payload';
import {
  collectReviewAssetReferences,
  reviewWorkspaceHasAudioClip,
  reviewWorkspaceHasSpeechReplacement,
  reviewWorkspaceHasWatermarkImage,
  reviewWorkspaceHasSceneResource,
  reviewWorkspaceHasAnnotationEffectResource,
} from '../review-workspaces/asset-refs';
import type { DurableAssetLifecyclePermit } from '../infrastructure/mutation-barrier';
import { assertStandaloneMediaSourceReplaceable } from './source-admission';
import {
  SYNC_CAPTURE_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  IMAGE_WORKSPACES_STORE,
  THUMBNAILS_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
  VIDEO_PROJECTS_STORE,
  SCENARIO_ASSETS_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  STORE_NAME,
} from '../infrastructure/indexed-db/core';
import { MediaAssetDeletionBlockedError } from '../media-library/deletion-errors';
import {
  ASSET_OPERATIONS_STORE,
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  PROJECT_EXPORTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  assertSourcePublicationVersion,
  SupersededAssetPublicationError,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  parseAssetRef,
  recoverStandaloneAssetPublications,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  type AssetRef,
} from '../assets';
import {
  buildProjectAssetMediaEntry,
  buildProjectExportMediaEntry,
} from '../media-library/entry-mapping';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { readVideoWorkspace } from '../review-workspaces/store';
import type { StoredProjectAssetEntry, StoredProjectExportEntry } from './contracts';
import { parseProjectAssetEntry, parseProjectExportEntry } from './read-guards';
import { tryVoiceoverAttachmentLock } from './voiceover-publication-lock';

export const PROJECT_ASSET_PUBLICATION_DOMAIN = 'project-assets';
export const PROJECT_EXPORT_PUBLICATION_DOMAIN = 'project-exports';
export const PROJECT_ASSET_OWNER_KIND = 'project-asset';
export const PROJECT_EXPORT_OWNER_KIND = 'project-export';
export const PROJECT_MEDIA_ASSET_ROLE = 'body';

interface ProjectExportPublicationPayload {
  expectedAssetId?: string | null;
  entry: StoredProjectExportEntry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProjectExportPayload(value: unknown): ProjectExportPublicationPayload | null {
  if (!isRecord(value)) return null;
  const entry = parseProjectExportEntry(value['entry']);
  if (
    value['expectedAssetId'] !== undefined &&
    value['expectedAssetId'] !== null &&
    typeof value['expectedAssetId'] !== 'string'
  )
    return null;
  return entry
    ? {
        entry,
        ...(typeof value['expectedAssetId'] === 'string' || value['expectedAssetId'] === null
          ? { expectedAssetId: value['expectedAssetId'] }
          : {}),
      }
    : null;
}

function ownerKey(ownerKind: string, ownerId: string): [string, string, string] {
  return [ownerKind, ownerId, PROJECT_MEDIA_ASSET_ROLE];
}

async function publishProjectMediaAsset(args: {
  entry: StoredProjectAssetEntry | StoredProjectExportEntry;
  filename?: string;
  expectedAssetId?: string | null;
  publishToLibrary?: boolean;
  requiredReviewAnnotationEffect?: ProjectAssetPublicationOptions['requiredReviewAnnotationEffect'];
  expectedLibrarySource?: ProjectAssetPublicationPayload['expectedLibrarySource'];
  journal: AssetReadyJournal;
  ownerKind: string;
  storeName: typeof PROJECT_ASSETS_STORE | typeof PROJECT_EXPORTS_STORE;
  lifecyclePermit?: DurableAssetLifecyclePermit;
}): Promise<void> {
  const ref = args.journal.assetRefs.length === 1 ? parseAssetRef(args.journal.assetRefs[0]) : null;
  if (!ref || ref.assetId !== args.entry.assetId) {
    throw new Error('Project publication asset does not match its metadata.');
  }
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        SYNC_CAPTURE_STORE,
        VIDEO_WORKSPACE_DRAFTS_STORE,
        IMAGE_WORKSPACES_STORE,
        THUMBNAILS_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
        PROJECT_EXPORTS_STORE,
        args.storeName,
        MEDIA_LIBRARY_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
        PROJECT_ASSETS_STORE,
        VIDEO_PROJECTS_STORE,
        SCENARIO_ASSETS_STORE,
        VIDEO_WORKSPACES_STORE,
        VIDEO_WORKSPACE_HISTORY_STORE,
        ...(args.expectedLibrarySource ? [STORE_NAME, PROJECT_EXPORTS_STORE] : []),
      ],
      'readwrite'
    );
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    if (args.expectedLibrarySource) {
      try {
        const entry = parseProjectAssetEntry(args.entry);
        if (!entry) throw new Error('Invalid private acquisition metadata.');
        await publishKnownLibraryAsset(tx, entry, ref, args.expectedLibrarySource);
        await tx.done;
        return;
      } catch (error) {
        await abortIndexedDbMutation(tx, error);
      }
    }
    if (
      args.publishToLibrary === false &&
      (await mediaStore.get(`project-asset:${args.entry.id}`)) !== undefined
    )
      throw new Error('Private project publication collides with a Library material.');
    if ('originMediaId' in args.entry && args.entry.originMediaId) {
      if (args.publishToLibrary !== false)
        throw new Error('Private acquisition cannot publish an independent Library material.');
      const origin = parseMediaLibraryEntry(await mediaStore.get(args.entry.originMediaId));
      if (!origin || origin.id !== args.entry.originMediaId)
        throw new Error('Private resource Library source is unavailable.');
    }
    try {
      if (args.requiredReviewAnnotationEffect) {
        const claim = args.requiredReviewAnnotationEffect;
        const stored = await readWorkspaceStorage(tx, claim.aggregateId);
        const workspace = parseVideoWorkspace(stored.logical);
        if (
          !workspace ||
          !reviewWorkspaceHasAnnotationEffectResource(workspace, claim, {
            assetId: `project-asset:${args.entry.id}`,
            mimeType: ref.mimeType,
            byteLength: ref.size,
          })
        )
          throw new SupersededAssetPublicationError();
      }
      const domainStore = tx.objectStore(args.storeName);
      const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
      const previousRaw: unknown = await domainStore.get(args.entry.id);
      const previous =
        args.storeName === PROJECT_ASSETS_STORE
          ? parseProjectAssetEntry(previousRaw)
          : parseProjectExportEntry(previousRaw);
      if (previousRaw !== undefined && (!previous || previous.id !== args.entry.id))
        throw new MediaAssetDeletionBlockedError('source-unavailable');
      const replay = assertSourcePublicationVersion(
        previous?.assetId,
        args.entry.assetId,
        args.expectedAssetId
      );
      if (replay) {
        await tx.done;
        return;
      }
      if (previous && previous.assetId !== args.entry.assetId) {
        const target =
          'projectId' in previous
            ? buildProjectExportMediaEntry(previous)
            : buildProjectAssetMediaEntry(previous);
        await assertStandaloneMediaSourceReplaceable(target, tx);
        await ownerStore.delete(ownerKey(args.ownerKind, args.entry.id));
        if ((await ownerStore.index('assetId').count(previous.assetId)) === 0) {
          await tx.objectStore(ASSET_REFS_STORE).delete(previous.assetId);
          physicalDelete.assetIds.push(previous.assetId);
        }
      }
      await tx.objectStore(ASSET_REFS_STORE).put(ref);
      await ownerStore.put({
        assetId: args.entry.assetId,
        ownerId: args.entry.id,
        ownerKind: args.ownerKind,
        role: PROJECT_MEDIA_ASSET_ROLE,
      });
      await domainStore.put(args.entry);
      if (args.publishToLibrary !== false) {
        const mediaEntry =
          args.storeName === PROJECT_ASSETS_STORE
            ? {
                ...buildProjectAssetMediaEntry(args.entry as StoredProjectAssetEntry),
                lifecycle: createLibraryLifecycle('library', args.entry.createdAt),
                filename: args.filename ?? args.entry.id,
                originalFilename: args.filename ?? args.entry.id,
              }
            : buildProjectExportMediaEntry(args.entry as StoredProjectExportEntry);
        const currentMedia = parseMediaLibraryEntry(await mediaStore.get(mediaEntry.id));
        if (currentMedia?.lifecycle) mediaEntry.lifecycle = currentMedia.lifecycle;
        await tx.objectStore(MEDIA_LIBRARY_STORE).put(mediaEntry);
      }
      if (physicalDelete.assetIds.length > 0) {
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
      }
      if (args.storeName === PROJECT_EXPORTS_STORE && 'projectId' in args.entry)
        await captureVideoProjectInTransaction(tx, args.entry.projectId, {
          publicationId: args.journal.journalId,
        });
      await tx.done;
    } catch (error) {
      await abortIndexedDbMutation(tx, error);
    }
  });
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete, args.lifecyclePermit).catch(
      () => undefined
    );
  }
}

/** Specialized accepted-receipt transition shares its caller's commit/abort authority. */
async function publishKnownLibraryAsset(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  entry: StoredProjectAssetEntry,
  ref: AssetRef,
  claim: KnownLibrarySourceClaim
) {
  if ((await tx.objectStore(MEDIA_LIBRARY_STORE).get(`project-asset:${entry.id}`)) !== undefined)
    throw new SupersededAssetPublicationError();
  const admission = await admitKnownLibraryPublication({
    claim,
    entry,
    ref,
    read: (store, key) => tx.objectStore(store).get(key),
  });
  if (admission === 'replay') return;
  await tx.objectStore(ASSET_OWNERS_STORE).put({
    assetId: ref.assetId,
    ownerId: entry.id,
    ownerKind: PROJECT_ASSET_OWNER_KIND,
    role: PROJECT_MEDIA_ASSET_ROLE,
  });
  await tx.objectStore(PROJECT_ASSETS_STORE).put(entry);
}

export async function publishProjectAssetJournal(
  journal: AssetReadyJournal,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<void> {
  if (journal.domain !== PROJECT_ASSET_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid standalone project asset publication journal.');
  }
  const payload = parseProjectAssetPayload(journal.payload);
  if (!payload) throw new Error('Invalid project asset publication payload.');
  await publishProjectMediaAsset({
    entry: payload.entry,
    ...(payload.expectedAssetId === undefined ? {} : { expectedAssetId: payload.expectedAssetId }),
    filename: payload.filename,
    ...(payload.publishToLibrary === undefined
      ? {}
      : { publishToLibrary: payload.publishToLibrary }),
    journal,
    ...(payload.expectedLibrarySource
      ? { expectedLibrarySource: payload.expectedLibrarySource }
      : {}),
    ...(payload.requiredReviewAnnotationEffect
      ? { requiredReviewAnnotationEffect: payload.requiredReviewAnnotationEffect }
      : {}),
    ...(lifecyclePermit ? { lifecyclePermit } : {}),
    ownerKind: PROJECT_ASSET_OWNER_KIND,
    storeName: PROJECT_ASSETS_STORE,
  });
}

async function recoverProjectAssetJournal(
  journal: AssetReadyJournal,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<void | 'defer'> {
  const payload = parseProjectAssetPayload(journal.payload);
  if (!payload) throw new Error('Invalid project asset publication payload.');
  if (payload.expectedLibrarySource) return publishProjectAssetJournal(journal, lifecyclePermit);
  if (payload.publishToLibrary === false && payload.entry.originMediaId) {
    const rawOrigin: unknown = await runWithIndexedDbMutation((db) =>
      db.get(MEDIA_LIBRARY_STORE, payload.entry.originMediaId!)
    );
    if (rawOrigin === undefined) {
      throw new SupersededAssetPublicationError();
    }
    const origin = parseMediaLibraryEntry(rawOrigin);
    if (!origin || origin.id !== payload.entry.originMediaId)
      throw new Error('Private resource Library source is invalid.');
  }
  const aggregateId =
    payload.requiredReview?.aggregateId ??
    payload.requiredReviewResource?.aggregateId ??
    payload.requiredReviewAnnotationEffect?.aggregateId ??
    payload.requiredReviewSpeech?.aggregateId;
  if (aggregateId) {
    const assetId = `project-asset:${payload.entry.id}`;
    return tryVoiceoverAttachmentLock(assetId, async () => {
      const review = await readVideoWorkspace(aggregateId);
      const referenced =
        !!review &&
        (payload.requiredReviewAnnotationEffect
          ? reviewWorkspaceHasAnnotationEffectResource(
              review.workspace,
              payload.requiredReviewAnnotationEffect,
              { assetId, mimeType: payload.entry.mimeType, byteLength: payload.entry.size }
            )
          : payload.requiredReviewSpeech
            ? reviewWorkspaceHasSpeechReplacement(
                review.workspace,
                payload.requiredReviewSpeech.target,
                payload.requiredReviewSpeech.replacementId,
                assetId
              )
            : payload.requiredReviewResource
              ? payload.requiredReviewResource.slot === 'watermark'
                ? reviewWorkspaceHasWatermarkImage(review.workspace, assetId)
                : reviewWorkspaceHasSceneResource(
                    review.workspace,
                    payload.requiredReviewResource.slot,
                    payload.requiredReviewResource.kind,
                    assetId
                  )
              : payload.librarySourceId
                ? reviewWorkspaceHasAudioClip(
                    review.workspace,
                    payload.requiredReview!.clipId,
                    assetId
                  )
                : collectReviewAssetReferences(review.workspace).has(assetId));
      if (!referenced) {
        throw new SupersededAssetPublicationError();
      }
      await publishProjectAssetJournal(journal, lifecyclePermit);
    });
  }
  await publishProjectAssetJournal(journal, lifecyclePermit);
}

export async function publishProjectExportJournal(
  journal: AssetReadyJournal,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<void> {
  if (journal.domain !== PROJECT_EXPORT_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid standalone project export publication journal.');
  }
  const payload = parseProjectExportPayload(journal.payload);
  if (!payload) throw new Error('Invalid project export publication payload.');
  await publishProjectMediaAsset({
    entry: payload.entry,
    ...(payload.expectedAssetId === undefined ? {} : { expectedAssetId: payload.expectedAssetId }),
    journal,
    ...(lifecyclePermit ? { lifecyclePermit } : {}),
    ownerKind: PROJECT_EXPORT_OWNER_KIND,
    storeName: PROJECT_EXPORTS_STORE,
  });
}

export const projectAssetPublicationAdapter: AssetPublicationAdapter = {
  domain: PROJECT_ASSET_PUBLICATION_DOMAIN,
  publish: recoverProjectAssetJournal,
};

export const projectExportPublicationAdapter: AssetPublicationAdapter = {
  domain: PROJECT_EXPORT_PUBLICATION_DOMAIN,
  publish: publishProjectExportJournal,
};

export function recoverProjectMediaPublications(): Promise<number> {
  return recoverStandaloneAssetPublications([
    projectAssetPublicationAdapter,
    projectExportPublicationAdapter,
  ]);
}

export type { ProjectExportPublicationPayload };
