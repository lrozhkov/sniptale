import {
  ASSET_OWNERS_STORE,
  ASSET_REFS_STORE,
  MEDIA_LIBRARY_STORE,
  PROJECT_ASSETS_STORE,
  SCENARIO_ASSETS_STORE,
  STORE_NAME,
} from '../infrastructure/indexed-db/core';
import type { initDB } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { parseAssetRef } from '../assets';
import { scenarioChildUsesMedia } from '../media-library/dependencies';
import { createLibraryLifecycle } from '../library-lifecycle/contracts';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import type { MediaLibraryEntry } from '../media-library/contracts';
import type { ScenarioAssetEntry } from './contracts';
import { parseScenarioAssetEntry } from './read-guards';
import { parseProjectAssetEntry } from '../projects/read-guards';
import { parseRecordingEntry } from '../recordings/index.guards';

const SCENARIO_LIBRARY_OWNER_KIND = 'media-library';
const SCENARIO_LIBRARY_ASSET_ROLE = 'source';

type ScenarioLibraryTransaction = ReturnType<Awaited<ReturnType<typeof initDB>>['transaction']>;

export class UnavailableBorrowedScenarioSourceError extends Error {
  constructor(message = 'Borrowed scenario source is unavailable.') {
    super(message);
    this.name = 'UnavailableBorrowedScenarioSourceError';
  }
}

export function scenarioLibraryMediaId(assetId: string): string {
  return `scenario-asset:${assetId}`;
}

/** Existing borrowed children keep their original bytes when the Library presentation is edited. */
export async function assertBorrowedScenarioAssetSource(
  tx: ScenarioLibraryTransaction,
  asset: ScenarioAssetEntry
): Promise<MediaLibraryEntry> {
  const mediaId = asset.borrowedMediaId;
  if (!mediaId)
    throw new UnavailableBorrowedScenarioSourceError(
      'Scenario child has no borrowed media identity.'
    );
  const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
  if (
    !media ||
    media.id !== mediaId ||
    media.mimeType !== asset.mimeType ||
    media.size !== asset.size
  )
    throw new UnavailableBorrowedScenarioSourceError();
  let sourceAssetId: string | null = null;
  if (media.source.kind === 'stored-asset') sourceAssetId = media.source.assetId;
  else if (media.source.kind === 'project-asset') {
    sourceAssetId =
      parseProjectAssetEntry(
        await tx.objectStore(PROJECT_ASSETS_STORE).get(media.source.projectAssetId)
      )?.assetId ?? null;
  } else if (media.source.kind === 'recording') {
    sourceAssetId =
      parseRecordingEntry(await tx.objectStore(STORE_NAME).get(media.source.recordingId))
        ?.assetId ?? null;
  }
  if (sourceAssetId !== asset.assetId)
    throw new UnavailableBorrowedScenarioSourceError('Borrowed scenario source has changed.');
  const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(asset.assetId));
  if (!ref || ref.size !== asset.size || ref.mimeType !== asset.mimeType)
    throw new UnavailableBorrowedScenarioSourceError('Borrowed scenario object is unavailable.');
  return media;
}

/** Creation still requires a pristine Library presentation. */
export async function assertBorrowedScenarioAsset(
  tx: ScenarioLibraryTransaction,
  asset: ScenarioAssetEntry
): Promise<void> {
  const media = await assertBorrowedScenarioAssetSource(tx, asset);
  if (media.workspaceRevision !== 0 || media.imageContentState === 'edited')
    throw new UnavailableBorrowedScenarioSourceError();
}

function buildScenarioLibraryEntry(asset: ScenarioAssetEntry): MediaLibraryEntry {
  const extension =
    asset.mimeType === 'audio/webm' ? 'webm' : asset.mimeType.split('/')[1] || 'bin';
  const filename = `Scenario ${asset.duration === undefined ? 'image' : 'audio'} ${asset.id}.${extension}`;
  return {
    id: scenarioLibraryMediaId(asset.id),
    kind: asset.duration === undefined ? 'image' : 'audio',
    source: { kind: 'stored-asset', assetId: asset.assetId },
    filename,
    originalFilename: filename,
    createdAt: asset.createdAt,
    updatedAt: asset.createdAt,
    size: asset.size,
    mimeType: asset.mimeType,
    width: asset.duration === undefined ? asset.width : null,
    height: asset.duration === undefined ? asset.height : null,
    duration: asset.duration ?? null,
    sourceUrl: null,
    sourceTitle: null,
    sourceFavicon: null,
    tags: [],
    lifecycle: createLibraryLifecycle('library', asset.createdAt),
    workspaceRevision: 0,
  };
}

/** Adds only missing library identity, preserving user edits on an existing entry. */
export async function publishScenarioAssetToLibrary(
  tx: ScenarioLibraryTransaction,
  asset: ScenarioAssetEntry
): Promise<boolean> {
  // Rendered Library imports are project-private snapshots, not new publications.
  if (asset.galleryAssetId && !asset.borrowedMediaId) return false;
  const mediaId = scenarioLibraryMediaId(asset.id);
  const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
  const ownerStore = tx.objectStore(ASSET_OWNERS_STORE);
  const rawMedia: unknown = await mediaStore.get(mediaId);
  const existing = parseMediaLibraryEntry(rawMedia);
  if (
    rawMedia !== undefined &&
    (!existing || existing.id !== mediaId || existing.source.kind !== 'stored-asset')
  ) {
    throw new Error(`Scenario library identity ${mediaId} is occupied.`);
  }
  const publishedAssetId =
    existing?.source.kind === 'stored-asset' ? existing.source.assetId : asset.assetId;
  const ownerKey = [SCENARIO_LIBRARY_OWNER_KIND, mediaId, SCENARIO_LIBRARY_ASSET_ROLE];
  const rawOwner: unknown = await ownerStore.get(ownerKey);
  if (rawOwner !== undefined) {
    if (
      typeof rawOwner !== 'object' ||
      rawOwner === null ||
      !('assetId' in rawOwner) ||
      rawOwner.assetId !== publishedAssetId
    ) {
      throw new Error(`Scenario library owner ${mediaId} is occupied.`);
    }
  } else {
    await ownerStore.put!({
      assetId: publishedAssetId,
      ownerId: mediaId,
      ownerKind: SCENARIO_LIBRARY_OWNER_KIND,
      role: SCENARIO_LIBRARY_ASSET_ROLE,
    });
  }
  if (!existing) await mediaStore.put!(buildScenarioLibraryEntry(asset));
  return !existing;
}

/** Explicit, idempotent maintenance for scenario children saved before library publication. */
export async function backfillScenarioLibraryAssets(): Promise<number> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        SCENARIO_ASSETS_STORE,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        MEDIA_LIBRARY_STORE,
        PROJECT_ASSETS_STORE,
        STORE_NAME,
      ],
      'readwrite'
    );
    try {
      const rawAssets: unknown[] = await tx.objectStore(SCENARIO_ASSETS_STORE).getAll();
      let published = 0;
      for (const raw of rawAssets) {
        const asset = parseScenarioAssetEntry(raw);
        if (!asset) continue;
        if (asset.borrowedMediaId) {
          await assertBorrowedScenarioAssetSource(tx, asset);
          continue;
        }
        const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(asset.assetId));
        if (!ref || ref.assetId !== asset.assetId || ref.size !== asset.size) continue;
        if (await publishScenarioAssetToLibrary(tx, asset)) published += 1;
      }
      await tx.done;
      return published;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        /* Transaction may already be closed. */
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}

/** A replaced Library version must not retarget frozen scenario resource bytes. */
export async function freezeScenarioMediaRepresentations(
  tx: ScenarioLibraryTransaction,
  media: MediaLibraryEntry
): Promise<void> {
  const store = tx.objectStore(SCENARIO_ASSETS_STORE);
  for (const raw of await store.getAll()) {
    const asset = parseScenarioAssetEntry(raw);
    if (!asset) throw new Error('Scenario resource authority is invalid.');
    if (!scenarioChildUsesMedia(asset, media)) continue;
    const { borrowedMediaId: _borrowedMediaId, ...frozen } = asset;
    await store.put!({ ...frozen, galleryAssetId: media.id });
  }
}
