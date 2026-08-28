import { PAGE_PACKAGE_ARCHIVE_MIME_TYPE } from '@sniptale/runtime-contracts/page-package';
import {
  createPreparedAssetArchiveSink,
  discardPreparedAsset,
  readAssetFile,
} from '../../../composition/persistence/assets';
import { ensureMediaHubStorageHeadroom } from '../../../features/media-hub/storage-capacity';
import { createMediaHubStorageHeadroomError } from '../../../features/media-hub/storage-errors';
import { sanitizeWebSnapshotFilename } from '../../../features/web-snapshot/public';
import { WEB_SNAPSHOT_ARCHIVE_RESOURCE_PROFILE } from '../../../features/web-snapshot/package-policy';
import { saveWebSnapshotMediaAssetSafely } from '../../media-hub/store';
import { writePagePackageArchive } from '../archive';
import type { ImportedWebSnapshotResult } from './contracts';
import { inspectWebSnapshotImport } from './inspect';
import { rebuildWebSnapshotImport } from './rebuild';

function createFilename(title: string | null, url: string | null): string {
  const stem = sanitizeWebSnapshotFilename(title ?? url ?? 'web-snapshot', 'web-snapshot');
  return `${stem}.sniptale-page-package.zip`;
}

async function ensureHeadroom(bytes: number): Promise<void> {
  try {
    await ensureMediaHubStorageHeadroom(bytes);
  } catch (error) {
    throw createMediaHubStorageHeadroomError(error) ?? error;
  }
}

export async function importWebSnapshotPackage(
  file: File,
  signal?: AbortSignal
): Promise<ImportedWebSnapshotResult> {
  const { localId, pagePackage, screenshotBlob } = await rebuildWebSnapshotImport(file, signal);
  const output = await createPreparedAssetArchiveSink({
    mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
  });
  await writePagePackageArchive({
    package: pagePackage,
    resourceProfile: WEB_SNAPSHOT_ARCHIVE_RESOURCE_PROFILE,
    ...(signal ? { signal } : {}),
    sink: output.sink,
  });
  const staged = output.preparedAsset();
  let packageFile: File;
  try {
    packageFile = await readAssetFile(
      staged.ref,
      createFilename(pagePackage.manifest.source.title, pagePackage.manifest.source.url)
    );
  } finally {
    await discardPreparedAsset(staged.ref.assetId);
  }
  await inspectWebSnapshotImport(packageFile, signal);
  await ensureHeadroom(packageFile.size + screenshotBlob.size);
  const result = await saveWebSnapshotMediaAssetSafely(
    {
      id: localId,
      createdAt: Date.parse(pagePackage.manifest.capturedAt),
      filename: packageFile.name,
      manifest: pagePackage.manifest,
      packageBlob: packageFile,
      screenshotBlob,
      sourceFavicon: pagePackage.manifest.source.faviconUrl,
      sourceTitle: pagePackage.manifest.source.title,
      sourceUrl: pagePackage.manifest.source.url,
    },
    async () => undefined
  );
  if (result.assetId !== localId) throw new Error('Web Snapshot import returned an unexpected ID.');
  return result;
}
