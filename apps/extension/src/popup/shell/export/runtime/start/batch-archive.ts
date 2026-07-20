import type { PopupExportResult } from '@sniptale/runtime-contracts/export';
import { getMoscowFilenameTimestamp } from '@sniptale/foundation/utils/export-timestamp';
import type { PopupExportBatchPackage } from '../types';
import type { PopupBatchArchiveLayout } from './batch-layout';
import { parsePopupBatchPagePackageAtBoundary } from './batch-package-boundary';

export type { PopupBatchArchiveLayout } from './batch-layout';

type BatchArchiveEntry = PopupExportBatchPackage['pagePackage']['entries'][number];
type BatchArchiveWriter = {
  file: (path: string, data: string, options?: { base64?: boolean }) => void;
};
type CreateBatchArchiveBlobOptions = {
  isCancelled?: () => boolean;
};

export function createBatchArchiveFilename() {
  return `pages_export_${getMoscowFilenameTimestamp()}.zip`;
}

export function getBatchExportStats(packages: PopupExportBatchPackage[]) {
  return packages.reduce(
    (aggregate, item) => ({
      filesCount: aggregate.filesCount + item.pagePackage.stats.filesCount,
      filesFailed: aggregate.filesFailed + item.pagePackage.stats.filesFailed,
      rowsCount: aggregate.rowsCount + item.pagePackage.stats.rowsCount,
      sectionsCount: aggregate.sectionsCount + item.pagePackage.stats.sectionsCount,
    }),
    {
      filesCount: 0,
      filesFailed: 0,
      rowsCount: 0,
      sectionsCount: 0,
    }
  );
}

export function createBatchExportResult(args: {
  errors: string[];
  filename: string;
  packages: PopupExportBatchPackage[];
}): PopupExportResult {
  return {
    success: args.errors.length === 0,
    filename: args.filename,
    errors: args.errors,
    stats: getBatchExportStats(args.packages),
  };
}

function createUniqueBatchBaseNames(packages: PopupExportBatchPackage[]): string[] {
  const usedBaseNames = new Set<string>();

  return packages.map((item) => {
    let baseName = item.pagePackage.archiveBaseName;
    let suffix = 1;

    while (usedBaseNames.has(baseName)) {
      baseName = `${item.pagePackage.archiveBaseName}_${suffix}`;
      suffix += 1;
    }

    usedBaseNames.add(baseName);
    return baseName;
  });
}

function resolveFlatBatchEntryPath(args: {
  entryPath: string;
  packageBaseName: string;
  uniqueBaseName: string;
}): string {
  if (args.entryPath === `${args.packageBaseName}.json`) {
    return `${args.uniqueBaseName}.json`;
  }

  if (args.entryPath === `${args.packageBaseName}.md`) {
    return `${args.uniqueBaseName}.md`;
  }

  if (args.entryPath === 'page-screenshot.png') {
    return `${args.uniqueBaseName}_screenshot.png`;
  }

  if (args.entryPath === 'logs/errors.log') {
    return `${args.uniqueBaseName}_errors.log`;
  }

  return `${args.uniqueBaseName}/${args.entryPath}`;
}

function resolveBatchEntryPath(args: {
  entryPath: string;
  layout: PopupBatchArchiveLayout;
  packageBaseName: string;
  uniqueBaseName: string;
}): string {
  if (args.layout === 'flat') {
    return resolveFlatBatchEntryPath(args);
  }

  return `${args.uniqueBaseName}/${args.entryPath}`;
}

function appendBatchArchiveEntry(
  zip: BatchArchiveWriter,
  path: string,
  entry: BatchArchiveEntry
): void {
  if (typeof entry.textContent === 'string') {
    zip.file(path, entry.textContent);
    return;
  }

  if (typeof entry.binaryBase64 === 'string') {
    zip.file(path, entry.binaryBase64, {
      base64: true,
    });
  }
}

function throwIfBatchArchiveCancelled(options: CreateBatchArchiveBlobOptions | undefined): void {
  if (options?.isCancelled?.()) {
    throw new Error('Popup batch export cancelled');
  }
}

export async function createBatchArchiveBlob(
  packages: PopupExportBatchPackage[],
  layout: PopupBatchArchiveLayout,
  options?: CreateBatchArchiveBlobOptions
): Promise<Blob> {
  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();
  const validatedPackages = packages.map((item) => ({
    ...item,
    pagePackage: parsePopupBatchPagePackageAtBoundary(item.pagePackage),
  }));

  const uniqueBaseNames = createUniqueBatchBaseNames(validatedPackages);

  for (const [index, item] of validatedPackages.entries()) {
    const uniqueBaseName = uniqueBaseNames[index];
    if (!uniqueBaseName) {
      continue;
    }

    for (const entry of item.pagePackage.entries) {
      throwIfBatchArchiveCancelled(options);
      appendBatchArchiveEntry(
        zip,
        resolveBatchEntryPath({
          entryPath: entry.path,
          layout,
          packageBaseName: item.pagePackage.archiveBaseName,
          uniqueBaseName,
        }),
        entry
      );
    }
  }

  throwIfBatchArchiveCancelled(options);
  return zip.generateAsync(
    {
      type: 'blob',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    },
    () => {
      throwIfBatchArchiveCancelled(options);
    }
  );
}
