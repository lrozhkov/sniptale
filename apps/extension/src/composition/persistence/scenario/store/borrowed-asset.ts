import {
  ASSET_REFS_STORE,
  PROJECT_ASSETS_STORE,
  STORE_NAME,
  initDB,
} from '../../infrastructure/indexed-db/core';
import { parseAssetRef, readAssetFile } from '../../assets';
import type { AssetRef } from '../../assets';
import type { MediaLibraryEntry } from '../../media-library/contracts';
import { parseProjectAssetEntry } from '../../projects/read-guards';
import { parseRecordingEntry } from '../../recordings/index.guards';
import type { PreparedScenarioAssetEntry } from '../contracts';
import { createScenarioAssetId } from './project-records/helpers';
import { measureImageBlob } from '@sniptale/platform/browser/media/image-dimensions';

/** Reads only a durable immutable source, never a rendered or edited presentation. */
export async function readBorrowableLibraryImage(
  entry: MediaLibraryEntry
): Promise<{ blob: Blob; ref: AssetRef } | null> {
  if (
    entry.workspaceRevision !== 0 ||
    entry.imageContentState === 'edited' ||
    entry.source.kind === 'screenshot' ||
    entry.source.kind === 'web-snapshot'
  )
    return null;
  const db = await initDB();
  let assetId: string;
  if (entry.source.kind === 'stored-asset') assetId = entry.source.assetId;
  else if (entry.source.kind === 'project-asset') {
    const source = parseProjectAssetEntry(
      await db.get(PROJECT_ASSETS_STORE, entry.source.projectAssetId)
    );
    if (!source) return null;
    assetId = source.assetId;
  } else if (entry.source.kind === 'recording') {
    const source = parseRecordingEntry(await db.get(STORE_NAME, entry.source.recordingId));
    if (!source) return null;
    assetId = source.assetId;
  } else return null;
  const ref = parseAssetRef(await db.get(ASSET_REFS_STORE, assetId));
  if (!ref || ref.mimeType !== entry.mimeType || ref.size !== entry.size) return null;
  return { ref, blob: await readAssetFile(ref, entry.filename) };
}

/** Gives a new scenario child identity to an already owned immutable object. */
export async function createBorrowedScenarioImageAsset(args: {
  blob: Blob;
  mediaId: string;
  projectId: string;
  ref: AssetRef;
}): Promise<PreparedScenarioAssetEntry> {
  const dimensions = await measureImageBlob(args.blob);
  return {
    assetId: args.ref.assetId,
    assetRef: args.ref,
    id: createScenarioAssetId(),
    projectId: args.projectId,
    galleryAssetId: args.mediaId,
    borrowedMediaId: args.mediaId,
    mimeType: args.ref.mimeType,
    width: dimensions.width,
    height: dimensions.height,
    createdAt: Date.now(),
    size: args.ref.size,
  };
}
