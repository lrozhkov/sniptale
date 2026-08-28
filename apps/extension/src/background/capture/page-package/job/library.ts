import {
  PAGE_PACKAGE_ARCHIVE_PATHS,
  type PagePackageManifest,
} from '@sniptale/runtime-contracts/page-package';
import type { ArchiveEntrySource } from '../../../../composition/archive-transfer';
import { createSecureRandomUuid } from '@sniptale/platform/security/secure-random-id';
import { readAssetFile } from '../../../../composition/persistence/assets';
import { hasActivePageAccess } from '../../../page-access/service';
import { securityE2ECheckpoint } from '../../../../platform/security-e2e-control';
import { saveWebSnapshotToMediaHub } from '../../../media-hub/web-snapshot';
import { deleteMediaLibraryAssetsBatchSafely } from '../../../../workflows/media-hub/store';
import { recoverWebSnapshotPublications } from '../../../../composition/persistence/web-snapshots';
import {
  beginWebSnapshotSave,
  cancelWebSnapshotCaptureRequest,
  commitWebSnapshotSave,
  retainWebSnapshotSaveAfterCompensationFailure,
} from '../../../capture/routing/web-snapshot/session';
import { openStagedPagePackage } from './page-boundary';
import { pagePackageJobStaging } from './stage-route';
import type { CollectedStagedPagePackage } from './page-phase';
import {
  clearPagePackageLibraryCleanupAssets,
  readPagePackageJobRecoveryState,
  recordPagePackageLibraryCleanupAsset,
} from './storage';
import { WEB_SNAPSHOT_PACKAGE_POLICY } from '../../../../features/web-snapshot/package-policy';

async function readScreenshotBlob(
  source: ArchiveEntrySource | null,
  signal: AbortSignal
): Promise<Blob> {
  signal.throwIfAborted();
  if (!source || source.size <= 0 || source.size > WEB_SNAPSHOT_PACKAGE_POLICY.maxScreenshotBytes) {
    throw new Error('Saved Page Package screenshot is invalid or too large.');
  }
  const bytes = new Uint8Array(source.size);
  let offset = 0;
  await source.pipeTo(
    new WritableStream<Uint8Array>({
      write(chunk) {
        if (offset + chunk.byteLength > bytes.byteLength) {
          throw new Error('Saved Page Package screenshot size changed while reading.');
        }
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      },
    }),
    signal
  );
  signal.throwIfAborted();
  if (offset !== bytes.byteLength) {
    throw new Error('Saved Page Package screenshot size changed while reading.');
  }
  return new Blob([bytes], { type: 'image/png' });
}

async function assertLibraryCommitAllowed(tabId: number): Promise<void> {
  if (!(await hasActivePageAccess(tabId))) {
    throw new Error('Page access was revoked before Page Package commit.');
  }
}

async function prepareLibraryPagePackage(
  jobId: string,
  item: CollectedStagedPagePackage,
  signal: AbortSignal
): Promise<{ manifest: PagePackageManifest; packageFile: File; screenshotBlob: Blob }> {
  signal.throwIfAborted();
  const staged = await pagePackageJobStaging.consume({
    jobId,
    ordinal: item.descriptor.ordinal,
    stagedBlobId: item.descriptor.stagedBlobId,
    tabId: item.tab.tabId,
  });
  const packageFile = await readAssetFile(
    staged.prepared.ref,
    `${item.descriptor.stagedBlobId}.page-package`
  );
  const opened = await openStagedPagePackage(packageFile, item.descriptor, signal);
  try {
    if (opened.pagePackage.manifest.intent !== 'save') {
      throw new Error('Library accepts only Save-intent Page Packages.');
    }
    const screenshotBlob = await readScreenshotBlob(
      opened.reader.entry(PAGE_PACKAGE_ARCHIVE_PATHS.screenshot),
      signal
    );
    await opened.reader.close();
    return { manifest: opened.pagePackage.manifest, packageFile, screenshotBlob };
  } catch (error) {
    await opened.reader.close().catch(() => undefined);
    throw error;
  }
}

async function compensateLibraryPublication(args: {
  error: unknown;
  jobId: string;
  savedAssetId: string;
  snapshotSessionId: string;
  tabId: number;
}): Promise<unknown> {
  try {
    await cleanupPagePackageLibraryAssets(args.jobId, [args.savedAssetId]);
    return args.error;
  } catch (cleanupError) {
    let finalError: unknown = new AggregateError(
      [args.error, cleanupError],
      'Page Package Library commit and compensation failed.',
      { cause: cleanupError }
    );
    try {
      retainWebSnapshotSaveAfterCompensationFailure({
        assetId: args.savedAssetId,
        sessionId: args.snapshotSessionId,
        tabId: args.tabId,
      });
    } catch (authorityError) {
      finalError = new AggregateError(
        [finalError, authorityError],
        'Page Package compensation failed and retained authority could not be recorded.',
        { cause: finalError }
      );
    }
    return finalError;
  }
}

async function publishPreparedPagePackage(args: {
  assetId: string;
  item: CollectedStagedPagePackage;
  jobId: string;
  manifest: PagePackageManifest;
  packageFile: File;
  screenshotBlob: Blob;
  snapshotSessionId: string;
}): Promise<string> {
  const tabId = args.item.tab.tabId;
  try {
    if (typeof __SNIPTALE_SECURITY_E2E__ !== 'undefined' && __SNIPTALE_SECURITY_E2E__) {
      await securityE2ECheckpoint('persistence-before-commit');
    }
    await assertLibraryCommitAllowed(tabId);
    beginWebSnapshotSave({ sessionId: args.snapshotSessionId, tabId });
    await recordPagePackageLibraryCleanupAsset(args.jobId, args.assetId);
    const savedAssetId = await saveWebSnapshotToMediaHub({
      assetId: args.assetId,
      assertPersistenceAllowed: () => assertLibraryCommitAllowed(tabId),
      packageBlob: args.packageFile,
      payload: {
        manifest: args.manifest,
        packageStagedBlobId: args.item.descriptor.stagedBlobId,
        screenshotMimeType: 'image/png',
        screenshotStagedBlobId: args.item.descriptor.stagedBlobId,
        snapshotSessionId: args.snapshotSessionId,
      },
      screenshotBlob: args.screenshotBlob,
    });
    if (savedAssetId !== args.assetId) {
      throw new Error('Page Package Library publisher returned an unexpected asset ID.');
    }
    commitWebSnapshotSave({
      assetId: savedAssetId,
      sessionId: args.snapshotSessionId,
      tabId,
    });
    return savedAssetId;
  } catch (error) {
    throw await compensateLibraryPublication({
      error,
      jobId: args.jobId,
      savedAssetId: args.assetId,
      snapshotSessionId: args.snapshotSessionId,
      tabId,
    });
  }
}

async function cleanupFailedPagePackageSave(
  error: unknown,
  jobId: string,
  tabId: number,
  reservedAssetId: string | null
): Promise<never> {
  try {
    const cancellation = cancelWebSnapshotCaptureRequest(tabId, jobId);
    const exactAssetIds = [
      ...new Set([
        ...cancellation.committedAssetIds,
        ...(reservedAssetId ? [reservedAssetId] : []),
      ]),
    ];
    await cleanupPagePackageLibraryAssets(jobId, exactAssetIds);
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      'Page Package save failed and capture cleanup was incomplete.',
      { cause: cleanupError }
    );
  }
  throw error;
}

async function saveCollectedPagePackage(
  jobId: string,
  item: CollectedStagedPagePackage,
  signal: AbortSignal
): Promise<string> {
  let reservedAssetId: string | null = null;
  try {
    const snapshotSessionId = item.descriptor.snapshotSessionId;
    if (!snapshotSessionId) throw new Error('Saved Page Package capture session is missing.');
    const prepared = await prepareLibraryPagePackage(jobId, item, signal);
    signal.throwIfAborted();
    reservedAssetId = createSecureRandomUuid(
      'Secure random values are unavailable for Page Package Library assets'
    );
    return await publishPreparedPagePackage({
      ...prepared,
      assetId: reservedAssetId,
      item,
      jobId,
      snapshotSessionId,
    });
  } catch (error) {
    return cleanupFailedPagePackageSave(error, jobId, item.tab.tabId, reservedAssetId);
  }
}

async function cleanupPagePackageLibraryAssets(
  jobId: string,
  assetIds: readonly string[]
): Promise<void> {
  if (assetIds.length === 0) return;
  await recoverWebSnapshotPublications();
  await deleteMediaLibraryAssetsBatchSafely([...assetIds]);
  await clearPagePackageLibraryCleanupAssets(jobId, assetIds);
}

export async function cleanupRecordedPagePackageLibraryAssets(jobId: string): Promise<void> {
  const recovery = await readPagePackageJobRecoveryState();
  if (!recovery || recovery.jobId !== jobId || recovery.libraryCleanupAssetIds.length === 0) return;
  await cleanupPagePackageLibraryAssets(jobId, recovery.libraryCleanupAssetIds);
}

export async function saveCollectedPagePackages(args: {
  jobId: string;
  packages: readonly CollectedStagedPagePackage[];
  signal: AbortSignal;
}): Promise<{
  failures: Array<{ error: string; ordinal: number; tabId: number }>;
  snapshotIds: string[];
}> {
  const failures: Array<{ error: string; ordinal: number; tabId: number }> = [];
  const snapshotIds: string[] = [];
  for (const item of args.packages) {
    try {
      args.signal.throwIfAborted();
      snapshotIds.push(await saveCollectedPagePackage(args.jobId, item, args.signal));
    } catch (error) {
      failures.push({
        error: error instanceof Error ? error.message : String(error),
        ordinal: item.descriptor.ordinal,
        tabId: item.tab.tabId,
      });
    }
  }
  return { failures, snapshotIds };
}
