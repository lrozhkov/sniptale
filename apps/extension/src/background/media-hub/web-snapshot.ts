import { saveWebSnapshotMediaAssetSafely } from '../../workflows/media-hub/store';
import { createMediaHubStorageHeadroomError } from '../../features/media-hub/storage-errors';
import { sanitizeWebSnapshotFilename } from '../../features/web-snapshot/public';
import {
  sanitizeWebSnapshotManifestProvenance,
  sanitizeWebSnapshotPackageProvenance,
} from '../../features/web-snapshot/provenance';
import { ensureMediaHubStorageHeadroom } from '../../features/media-hub/storage-capacity';
import type {
  WebSnapshotManifest,
  WebSnapshotSaveToGalleryPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import { validateWebSnapshotPackage } from './web-snapshot-validation';

interface SaveWebSnapshotToMediaHubInput {
  packageBlob: Blob;
  payload: WebSnapshotSaveToGalleryPayload;
  screenshotBlob: Blob;
}

function createSnapshotFilename(manifest: WebSnapshotManifest): string {
  const sourceTitle = manifest.source.title ?? manifest.source.url ?? 'web-snapshot';
  return `${sanitizeWebSnapshotFilename(sourceTitle, 'web-snapshot')}.sniptale-web-snapshot.zip`;
}

function createWebSnapshotMediaHubStageError(stage: string, error: unknown): Error {
  const message = error instanceof Error ? error.message : String(error);
  return new Error(`${stage}: ${message}`);
}

async function runWebSnapshotMediaHubStage<T>(stage: string, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    throw createWebSnapshotMediaHubStageError(stage, error);
  }
}

async function ensureWebSnapshotStorageHeadroom(requiredBytes: number): Promise<void> {
  try {
    await ensureMediaHubStorageHeadroom(requiredBytes);
  } catch (error) {
    throw createMediaHubStorageHeadroomError(error) ?? error;
  }
}

export async function saveWebSnapshotToMediaHub(
  input: SaveWebSnapshotToMediaHubInput
): Promise<string> {
  const { packageBlob, payload, screenshotBlob } = input;
  await runWebSnapshotMediaHubStage('validate web snapshot package', () =>
    validateWebSnapshotPackage({ packageBlob, payload, screenshotBlob })
  );
  const sanitizedManifest = sanitizeWebSnapshotManifestProvenance(payload.manifest);
  const sanitizedPackage = await runWebSnapshotMediaHubStage(
    'sanitize web snapshot provenance',
    () => sanitizeWebSnapshotPackageProvenance(packageBlob, sanitizedManifest)
  );

  await runWebSnapshotMediaHubStage('ensure web snapshot storage headroom', () =>
    ensureWebSnapshotStorageHeadroom(sanitizedPackage.size + screenshotBlob.size)
  );
  const result = await runWebSnapshotMediaHubStage('save web snapshot media asset', () =>
    saveWebSnapshotMediaAssetSafely({
      filename: createSnapshotFilename(sanitizedPackage.manifest),
      manifest: sanitizedPackage.manifest,
      packageBlob: sanitizedPackage.packageBlob,
      screenshotBlob,
      sourceFavicon: sanitizedPackage.manifest.source.faviconUrl,
      sourceTitle: sanitizedPackage.manifest.source.title,
      sourceUrl: sanitizedPackage.manifest.source.url,
    })
  );

  return result.assetId;
}
