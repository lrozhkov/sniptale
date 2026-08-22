import {
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  THUMBNAILS_STORE,
  WEB_SNAPSHOTS_STORE,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { MediaLibraryEntry } from '../media-library/contracts';
import {
  parseAssetOwner,
  parseAssetRef,
  readAssetFile,
  recoverStandaloneAssetPublications,
  type AssetOwner,
  type AssetPublicationAdapter,
  type AssetReadyJournal,
  type AssetRef,
} from '../assets';
import { createWebSnapshotThumbnailEntry } from './media-entry';
import { parseStoredWebSnapshotRecord } from './guards';
import type { StoredWebSnapshotRecord } from './contracts';

export const WEB_SNAPSHOT_PUBLICATION_DOMAIN = 'web-snapshot-assets';
export const WEB_SNAPSHOT_OWNER_KIND = 'web-snapshot';
export const WEB_SNAPSHOT_PACKAGE_ROLE = 'package';
export const WEB_SNAPSHOT_SCREENSHOT_ROLE = 'screenshot';

export interface WebSnapshotPublicationPayload {
  mediaEntry: MediaLibraryEntry;
  snapshot: StoredWebSnapshotRecord;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePayload(value: unknown): WebSnapshotPublicationPayload | null {
  if (!isRecord(value)) return null;
  const snapshot = parseStoredWebSnapshotRecord(value['snapshot']);
  const mediaEntry = parseMediaLibraryEntry(value['mediaEntry']);
  if (
    !snapshot ||
    !mediaEntry ||
    mediaEntry.id !== snapshot.id ||
    mediaEntry.source.kind !== 'web-snapshot' ||
    mediaEntry.source.snapshotId !== snapshot.id
  ) {
    return null;
  }
  return { mediaEntry, snapshot };
}

function ownerKey(snapshotId: string, role: string): [string, string, string] {
  return [WEB_SNAPSHOT_OWNER_KIND, snapshotId, role];
}

function expectedOwner(assetId: string, snapshotId: string, role: string): AssetOwner {
  return { assetId, ownerId: snapshotId, ownerKind: WEB_SNAPSHOT_OWNER_KIND, role };
}

function sameValue(left: unknown, right: unknown): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

function readPublicationRefs(
  journal: AssetReadyJournal,
  snapshot: StoredWebSnapshotRecord
): { packageRef: AssetRef; screenshotRef: AssetRef } | null {
  if (journal.assetRefs.length !== 2) return null;
  const refs = journal.assetRefs.map(parseAssetRef);
  if (refs.some((ref) => ref === null)) return null;
  const packageRef = (refs as AssetRef[]).find((ref) => ref.assetId === snapshot.packageAssetId);
  const screenshotRef = (refs as AssetRef[]).find(
    (ref) => ref.assetId === snapshot.screenshotAssetId
  );
  if (
    !packageRef ||
    packageRef.size !== snapshot.size ||
    !screenshotRef ||
    screenshotRef.size !== snapshot.screenshotSize ||
    screenshotRef.mimeType !== snapshot.screenshotMimeType
  ) {
    return null;
  }
  return { packageRef, screenshotRef };
}

function assertCompatibleExisting(value: unknown, expected: unknown, label: string): void {
  if (value !== undefined && !sameValue(value, expected)) {
    throw new Error(`Web snapshot ${label} collides with an existing record.`);
  }
}

export async function publishWebSnapshotJournal(journal: AssetReadyJournal): Promise<void> {
  if (journal.domain !== WEB_SNAPSHOT_PUBLICATION_DOMAIN || journal.operationId) {
    throw new Error('Invalid standalone web snapshot publication journal.');
  }
  const payload = parsePayload(journal.payload);
  if (!payload) throw new Error('Invalid web snapshot publication payload.');
  const refs = readPublicationRefs(journal, payload.snapshot);
  if (!refs) throw new Error('Web snapshot publication assets do not match metadata.');
  const screenshotFile = await readAssetFile(
    refs.screenshotRef,
    `${payload.snapshot.id}-screenshot`
  );
  const thumbnail = await createWebSnapshotThumbnailEntry({
    assetId: payload.snapshot.id,
    createdAt: payload.snapshot.createdAt,
    screenshotBlob: screenshotFile,
    updatedAt: payload.snapshot.updatedAt,
  });

  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        WEB_SNAPSHOTS_STORE,
        MEDIA_LIBRARY_STORE,
        THUMBNAILS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
      ],
      'readwrite'
    );
    const snapshotStore = tx.objectStore(WEB_SNAPSHOTS_STORE);
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    const refStore = tx.objectStore(ASSET_REFS_STORE);
    const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
    const existingSnapshotRaw: unknown = await snapshotStore.get(payload.snapshot.id);
    const existingSnapshot = parseStoredWebSnapshotRecord(existingSnapshotRaw);
    if (existingSnapshotRaw !== undefined && !existingSnapshot) {
      throw new Error('Web snapshot metadata collides with an invalid record.');
    }
    assertCompatibleExisting(existingSnapshot ?? undefined, payload.snapshot, 'metadata');
    const existingMediaRaw: unknown = await mediaStore.get(payload.mediaEntry.id);
    const existingMedia = parseMediaLibraryEntry(existingMediaRaw);
    if (existingMediaRaw !== undefined && !existingMedia) {
      throw new Error('Web snapshot media collides with an invalid record.');
    }
    assertCompatibleExisting(existingMedia ?? undefined, payload.mediaEntry, 'media');
    for (const [ref, role] of [
      [refs.packageRef, WEB_SNAPSHOT_PACKAGE_ROLE],
      [refs.screenshotRef, WEB_SNAPSHOT_SCREENSHOT_ROLE],
    ] as const) {
      const existingRefRaw: unknown = await refStore.get(ref.assetId);
      const existingRef = parseAssetRef(existingRefRaw);
      if (existingRefRaw !== undefined && !existingRef) {
        throw new Error('Web snapshot asset ref collides with an invalid record.');
      }
      assertCompatibleExisting(existingRef ?? undefined, ref, 'asset ref');
      const owner = expectedOwner(ref.assetId, payload.snapshot.id, role);
      const existingOwnerRaw: unknown = await ownerStore.get(ownerKey(payload.snapshot.id, role));
      const existingOwner = parseAssetOwner(existingOwnerRaw);
      if (existingOwnerRaw !== undefined && !existingOwner) {
        throw new Error('Web snapshot asset owner collides with an invalid record.');
      }
      assertCompatibleExisting(existingOwner ?? undefined, owner, 'asset owner');
      await refStore.put(ref);
      await ownerStore.put(owner);
    }
    await snapshotStore.put(payload.snapshot);
    await mediaStore.put(payload.mediaEntry);
    await tx.objectStore(THUMBNAILS_STORE).put(thumbnail);
    await tx.done;
  });
}

export const webSnapshotPublicationAdapter: AssetPublicationAdapter = {
  domain: WEB_SNAPSHOT_PUBLICATION_DOMAIN,
  publish: publishWebSnapshotJournal,
};

export function recoverWebSnapshotPublications(): Promise<number> {
  return recoverStandaloneAssetPublications([webSnapshotPublicationAdapter]);
}
