import { getMoscowFilenameTimestamp } from '@sniptale/foundation/utils/export-timestamp';
import {
  PAGE_COLLECTION_ARCHIVE_MIME_TYPE,
  PAGE_PACKAGE_ARCHIVE_MIME_TYPE,
} from '@sniptale/runtime-contracts/page-package';
import type { ArchiveEntrySource } from '../../../../composition/archive-transfer';
import {
  createPreparedAssetArchiveSink,
  createAssetObjectWriter,
  readAssetFile,
  type AssetRef,
} from '../../../../composition/persistence/assets';
import type { ComposedPagePackage } from '../../../../workflows/page-package/composer';
import { writePageCollectionArchive } from '../../../../workflows/page-package/collection/archive';
import {
  planPageCollection,
  type PageCollectionPagePackagePlan,
} from '../../../../workflows/page-package/collection/manifest';
import { downloadPagePackageReference } from './download-effect';
import { openStagedPagePackage } from './page-boundary';
import { pagePackageJobStaging } from './stage-route';
import type { CollectedStagedPagePackage } from './page-phase';

interface PreparedPage extends CollectedStagedPagePackage {
  pagePackage: PageCollectionPagePackagePlan;
  reference: AssetRef;
}

async function duplicateSinglePageOutput(file: File): Promise<AssetRef> {
  const writer = await createAssetObjectWriter({ mimeType: PAGE_PACKAGE_ARCHIVE_MIME_TYPE });
  try {
    await writer.append(file);
    return (await writer.finalize()).ref;
  } catch (error) {
    await writer.abort().catch(() => undefined);
    throw error;
  }
}

function createPagePackagePlan(
  pagePackage: ComposedPagePackage<ArchiveEntrySource>
): PageCollectionPagePackagePlan {
  return {
    entries: pagePackage.manifest.entries.map((entry) => ({ ...entry })),
    manifestSha256: pagePackage.manifestSha256,
    manifestSize: pagePackage.manifestBytes.byteLength,
    pageId: pagePackage.manifest.id,
    title: pagePackage.manifest.source.title,
    totalBytes: pagePackage.manifestBytes.byteLength + pagePackage.manifest.stats.totalBytes,
  };
}

async function preparePages(
  jobId: string,
  packages: readonly CollectedStagedPagePackage[],
  signal: AbortSignal
): Promise<PreparedPage[]> {
  const prepared: PreparedPage[] = [];
  for (const item of packages) {
    signal.throwIfAborted();
    const binding = {
      jobId,
      ordinal: item.descriptor.ordinal,
      stagedBlobId: item.descriptor.stagedBlobId,
      tabId: item.tab.tabId,
    };
    const staged = await pagePackageJobStaging.consume(binding);
    const opened = await openStagedPagePackage(staged.file, item.descriptor, signal);
    try {
      prepared.push({
        ...item,
        pagePackage: createPagePackagePlan(opened.pagePackage),
        reference: staged.prepared.ref,
      });
    } finally {
      await opened.reader.close();
    }
  }
  return prepared;
}

export async function downloadCollectedPagePackages(args: {
  errors: readonly string[];
  failedPages: readonly { message: string; ordinal: number; title: string | null }[];
  jobId: string;
  packages: readonly CollectedStagedPagePackage[];
  requestedPageCount: number;
  signal: AbortSignal;
  warnings: readonly string[];
}): Promise<{ filename: string; pageCount: number }> {
  const prepared = await preparePages(args.jobId, args.packages, args.signal);
  if (prepared.length === 0) throw new Error('No valid Page Packages were staged.');
  if (prepared.length === 1 && args.requestedPageCount === 1) {
    const filename = `page-package_${getMoscowFilenameTimestamp()}.zip`;
    const page = prepared[0]!;
    const file = await readAssetFile(
      page.reference,
      `${page.descriptor.stagedBlobId}.page-package`
    );
    const outputReference = await duplicateSinglePageOutput(file);
    await downloadPagePackageReference({
      filename,
      jobId: args.jobId,
      reference: outputReference,
      signal: args.signal,
    });
    return { filename, pageCount: 1 };
  }

  const successfulOrdinals = new Set(prepared.map((page) => page.descriptor.ordinal + 1));
  const failuresByOrdinal = new Map(args.failedPages.map((failure) => [failure.ordinal, failure]));
  const failedPages = Array.from({ length: args.requestedPageCount }, (_, index) => index + 1)
    .filter((ordinal) => !successfulOrdinals.has(ordinal))
    .map((ordinal) => {
      const failure = failuresByOrdinal.get(ordinal);
      return {
        code: 'page-capture-failed' as const,
        message: failure?.message ?? 'Page capture failed.',
        ordinal,
        title: failure?.title ?? null,
        url: null,
      };
    });
  const plan = planPageCollection({
    createdAt: new Date().toISOString(),
    failedPages,
    id: crypto.randomUUID(),
    successfulPages: prepared.map((page) => ({
      ordinal: page.descriptor.ordinal + 1,
      pagePackage: page.pagePackage,
      title: page.descriptor.title,
    })),
    warnings: [...args.warnings],
  });
  const output = await createPreparedAssetArchiveSink({
    mimeType: PAGE_COLLECTION_ARCHIVE_MIME_TYPE,
  });
  await writePageCollectionArchive({
    plan,
    signal: args.signal,
    sink: output.sink,
    resolvePagePackage: async (planned) => {
      const page = prepared.find(
        (candidate) => candidate.descriptor.ordinal + 1 === planned.ordinal
      );
      if (!page) throw new Error('Planned Page Package source is unavailable.');
      const file = await readAssetFile(
        page.reference,
        `${page.descriptor.stagedBlobId}.page-package`
      );
      const opened = await openStagedPagePackage(file, page.descriptor, args.signal);
      return { pagePackage: opened.pagePackage, release: () => opened.reader.close() };
    },
  });
  const collection = output.preparedAsset();
  const filename = `page-collection_${getMoscowFilenameTimestamp()}.zip`;
  await downloadPagePackageReference({
    filename,
    jobId: args.jobId,
    reference: collection.ref,
    signal: args.signal,
  });
  return { filename, pageCount: prepared.length };
}

export async function releaseCollectedPagePackages(jobId: string): Promise<void> {
  await pagePackageJobStaging.releaseJob(jobId);
}

export async function releaseCollectedPagePackage(
  jobId: string,
  item: CollectedStagedPagePackage
): Promise<void> {
  await pagePackageJobStaging.release({
    jobId,
    ordinal: item.descriptor.ordinal,
    stagedBlobId: item.descriptor.stagedBlobId,
    tabId: item.tab.tabId,
  });
}
