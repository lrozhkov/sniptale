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
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  discardPreparedAsset,
  parseAssetRef,
  recoverStandaloneAssetPublications,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
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

interface ProjectAssetPublicationPayload {
  entry: StoredProjectAssetEntry;
  filename: string;
  requiredReview?: { aggregateId: string; clipId: string };
}

interface ProjectExportPublicationPayload {
  entry: StoredProjectExportEntry;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parseProjectAssetPayload(value: unknown): ProjectAssetPublicationPayload | null {
  if (!isRecord(value) || typeof value['filename'] !== 'string') return null;
  const entry = parseProjectAssetEntry(value['entry']);
  if (!entry) return null;
  const required = value['requiredReview'];
  if (
    required !== undefined &&
    (!isRecord(required) ||
      typeof required['aggregateId'] !== 'string' ||
      typeof required['clipId'] !== 'string')
  )
    return null;
  return {
    entry,
    filename: value['filename'],
    ...(required
      ? {
          requiredReview: {
            aggregateId: required['aggregateId'] as string,
            clipId: required['clipId'] as string,
          },
        }
      : {}),
  };
}

function hasSavedVoiceoverClip(
  workspace: { advanced: unknown; history: readonly unknown[] },
  clipId: string,
  assetId: string
): boolean {
  const contains = (content: unknown) => {
    if (
      !isRecord(content) ||
      !isRecord(content['audio']) ||
      !Array.isArray(content['audio']['voiceover'])
    )
      return false;
    return content['audio']['voiceover'].some(
      (clip: unknown) => isRecord(clip) && clip['id'] === clipId && clip['assetId'] === assetId
    );
  };
  if (contains(workspace.advanced)) return true;
  return workspace.history.some(
    (operation) =>
      isRecord(operation) &&
      operation['target'] === 'advancedContent' &&
      (contains(operation['before']) || contains(operation['after']))
  );
}

function parseProjectExportPayload(value: unknown): ProjectExportPublicationPayload | null {
  if (!isRecord(value)) return null;
  const entry = parseProjectExportEntry(value['entry']);
  return entry ? { entry } : null;
}

function ownerKey(ownerKind: string, ownerId: string): [string, string, string] {
  return [ownerKind, ownerId, PROJECT_MEDIA_ASSET_ROLE];
}

async function publishProjectMediaAsset(args: {
  entry: StoredProjectAssetEntry | StoredProjectExportEntry;
  filename?: string;
  journal: AssetReadyJournal;
  ownerKind: string;
  storeName: typeof PROJECT_ASSETS_STORE | typeof PROJECT_EXPORTS_STORE;
}): Promise<void> {
  const ref = args.journal.assetRefs.length === 1 ? parseAssetRef(args.journal.assetRefs[0]) : null;
  if (!ref || ref.assetId !== args.entry.assetId) {
    throw new Error('Project publication asset does not match its metadata.');
  }
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        args.storeName,
        MEDIA_LIBRARY_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        ASSET_OPERATIONS_STORE,
      ],
      'readwrite'
    );
    const domainStore = tx.objectStore(args.storeName);
    const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
    const previousRaw: unknown = await domainStore.get(args.entry.id);
    const previous =
      args.storeName === PROJECT_ASSETS_STORE
        ? parseProjectAssetEntry(previousRaw)
        : parseProjectExportEntry(previousRaw);
    if (previous && previous.assetId !== args.entry.assetId) {
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
    const mediaEntry =
      args.storeName === PROJECT_ASSETS_STORE
        ? {
            ...buildProjectAssetMediaEntry(args.entry as StoredProjectAssetEntry),
            lifecycle: createLibraryLifecycle('library', args.entry.createdAt),
            filename: args.filename ?? args.entry.id,
            originalFilename: args.filename ?? args.entry.id,
          }
        : buildProjectExportMediaEntry(args.entry as StoredProjectExportEntry);
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const currentMedia = parseMediaLibraryEntry(await mediaStore.get(mediaEntry.id));
    if (currentMedia?.lifecycle) mediaEntry.lifecycle = currentMedia.lifecycle;
    await tx.objectStore(MEDIA_LIBRARY_STORE).put(mediaEntry);
    if (physicalDelete.assetIds.length > 0) {
      await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
    }
    await tx.done;
  });
  if (physicalDelete.assetIds.length > 0) {
    await completePhysicalDeleteOperation(physicalDelete).catch(() => undefined);
  }
}

export async function publishProjectAssetJournal(journal: AssetReadyJournal): Promise<void> {
  if (journal.domain !== PROJECT_ASSET_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid standalone project asset publication journal.');
  }
  const payload = parseProjectAssetPayload(journal.payload);
  if (!payload) throw new Error('Invalid project asset publication payload.');
  await publishProjectMediaAsset({
    entry: payload.entry,
    filename: payload.filename,
    journal,
    ownerKind: PROJECT_ASSET_OWNER_KIND,
    storeName: PROJECT_ASSETS_STORE,
  });
}

async function recoverProjectAssetJournal(journal: AssetReadyJournal): Promise<void | 'defer'> {
  const payload = parseProjectAssetPayload(journal.payload);
  if (!payload) throw new Error('Invalid project asset publication payload.');
  if (payload.requiredReview) {
    const assetId = `project-asset:${payload.entry.id}`;
    return tryVoiceoverAttachmentLock(assetId, async () => {
      const review = await readVideoWorkspace(payload.requiredReview!.aggregateId);
      const referenced =
        !!review &&
        hasSavedVoiceoverClip(review.workspace, payload.requiredReview!.clipId, assetId);
      if (!referenced) {
        await discardPreparedAsset(payload.entry.assetId);
        return;
      }
      await publishProjectAssetJournal(journal);
    });
  }
  await publishProjectAssetJournal(journal);
}

export async function publishProjectExportJournal(journal: AssetReadyJournal): Promise<void> {
  if (journal.domain !== PROJECT_EXPORT_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid standalone project export publication journal.');
  }
  const payload = parseProjectExportPayload(journal.payload);
  if (!payload) throw new Error('Invalid project export publication payload.');
  await publishProjectMediaAsset({
    entry: payload.entry,
    journal,
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

export type { ProjectAssetPublicationPayload, ProjectExportPublicationPayload };
