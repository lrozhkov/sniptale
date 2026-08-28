import {
  PAGE_PACKAGE_ARCHIVE_PATHS,
  normalizePagePackageWarnings,
  type PagePackageComponentId,
  type PagePackageComponentStatus,
} from '@sniptale/runtime-contracts/page-package';
import { createImageThumbnailBlob } from '../../../platform/media-utils/image-thumbnail';
import {
  hashWebSnapshotAssetBlob,
  hashWebSnapshotAssetBytes,
} from '../../../features/web-snapshot/asset-manifest';
import { sanitizeWebSnapshotManifestProvenance } from '../../../features/web-snapshot/provenance';
import { resolveWebSnapshotEntryByteLimit } from '../../../features/web-snapshot/package-policy';
import { composePagePackage, type ComposedPagePackage } from '../composer';
import { createBlobContribution } from '../contributions/blob';
import { addPagePackageReadme } from '../readme';
import { readArchiveEntryBlob } from './entry-source';
import { openValidatedWebSnapshotImport } from './inspect';
import { sanitizeImportedPagePackageEntry } from './sanitize-content';

const IMPORT_WARNING = 'Imported Web Snapshot content was re-sanitized by Sniptale.';

interface RebuiltWebSnapshotImport {
  localId: string;
  pagePackage: ComposedPagePackage<Blob>;
  screenshotBlob: Blob;
}

export async function rebuildWebSnapshotImport(
  file: File,
  signal?: AbortSignal
): Promise<RebuiltWebSnapshotImport> {
  const opened = await openValidatedWebSnapshotImport(file, signal);
  const importedManifest = opened.inspection.manifest;
  const localId = crypto.randomUUID();
  try {
    const sanitizedManifest = sanitizeWebSnapshotManifestProvenance(importedManifest);
    const assetPaths = new Set(
      importedManifest.entries
        .filter((entry) => entry.component === 'webCopy' && entry.path.startsWith('assets/'))
        .map((entry) => entry.path)
    );
    const screenshotEntry = importedManifest.entries.find(
      (entry) => entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.screenshot
    );
    const screenshotSource = opened.reader.entry(PAGE_PACKAGE_ARCHIVE_PATHS.screenshot);
    if (!screenshotEntry || !screenshotSource)
      throw new Error('Page Package screenshot is missing.');
    const screenshotBlob = await readArchiveEntryBlob(
      screenshotSource,
      'image/png',
      resolveWebSnapshotEntryByteLimit(screenshotEntry.path, screenshotEntry.mimeType),
      signal
    );
    const thumbnailBlob = await createImageThumbnailBlob(screenshotBlob, 320, 180, {
      verticalAnchor: 'top',
    });
    const contributions = [];
    for (const entry of importedManifest.entries) {
      signal?.throwIfAborted();
      if (
        entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail ||
        entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.readme
      ) {
        continue;
      }
      const source = opened.reader.entry(entry.path);
      if (!source) throw new Error(`Page Package entry is missing: ${entry.path}.`);
      const original =
        entry.path === PAGE_PACKAGE_ARCHIVE_PATHS.screenshot
          ? screenshotBlob
          : await readArchiveEntryBlob(
              source,
              entry.mimeType,
              resolveWebSnapshotEntryByteLimit(entry.path, entry.mimeType),
              signal
            );
      const blob = await sanitizeImportedPagePackageEntry({
        assetPaths,
        blob: original,
        entry,
        sourceUrl: sanitizedManifest.source.url,
      });
      contributions.push(
        await createBlobContribution({
          blob,
          component: entry.component,
          digest: hashWebSnapshotAssetBlob,
          mimeType: entry.mimeType,
          path: entry.path,
        })
      );
    }
    contributions.push(
      await createBlobContribution({
        blob: thumbnailBlob,
        component: 'webCopy',
        digest: hashWebSnapshotAssetBlob,
        mimeType: 'image/webp',
        path: PAGE_PACKAGE_ARCHIVE_PATHS.thumbnail,
      })
    );
    const withReadme = await addPagePackageReadme({
      contributions,
      diagnosticsLevel: 'standard',
      intent: 'save',
      source: sanitizedManifest.source,
    });
    const componentStatuses = Object.fromEntries(
      importedManifest.components.map((component) => [component.id, component.status])
    ) as Partial<Record<PagePackageComponentId, PagePackageComponentStatus>>;
    const pagePackage = await composePagePackage(
      {
        capturedAt: importedManifest.capturedAt,
        componentStatuses,
        contributions: withReadme,
        diagnosticsLevel: 'standard',
        failedResourceCount: importedManifest.stats.failedResourceCount,
        id: localId,
        intent: 'save',
        source: sanitizedManifest.source,
        viewport: importedManifest.viewport,
        warnings: normalizePagePackageWarnings([...importedManifest.warnings, IMPORT_WARNING]),
      },
      hashWebSnapshotAssetBytes
    );
    return { localId, pagePackage, screenshotBlob };
  } finally {
    await opened.reader.close();
  }
}
