import type {
  ArchiveEntrySource,
  ArchiveWriter,
  ExportSink,
} from '../../../composition/archive-transfer/contracts';
import { createArchiveWriter } from '../../../composition/archive-transfer/writer';
import type { ComposedPagePackage } from '../composer';
import { PAGE_COLLECTION_README, type PlannedPageCollection } from './manifest';

interface PageCollectionArchiveProgress {
  bytesComplete: number;
  entriesComplete: number;
  entriesTotal: number;
  path: string;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Page Collection archive was cancelled.', 'AbortError');
  }
}

function shouldCompress(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'image/svg+xml'
  );
}

type PageCollectionArchiveSource = ArchiveEntrySource | Blob;

function expectedArchiveOrder(plan: PlannedPageCollection): string[] {
  return [
    'collection-manifest.json',
    'README.md',
    ...plan.pages.flatMap((page) => [
      page.manifestPath,
      ...page.pagePackage.entries.map((entry) => `${page.rootPath}/${entry.path}`),
    ]),
    'reports/summary.json',
    'reports/errors.json',
  ];
}

function assertCanonicalArchiveOrder(plan: PlannedPageCollection): void {
  const expected = expectedArchiveOrder(plan);
  if (
    expected.length !== plan.archiveOrder.length ||
    expected.some((path, index) => path !== plan.archiveOrder[index])
  ) {
    throw new Error('Page Collection archive order diverged from its canonical plan.');
  }
}

async function abortArchive(writer: ArchiveWriter, error: unknown): Promise<never> {
  try {
    await writer.abort(error);
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      'Page Collection archive failed and output cleanup was incomplete.',
      { cause: cleanupError }
    );
  }
  throw error;
}

/** Streams a planned flat Collection Package without nesting Page Package archives. */
export async function writePageCollectionArchive(args: {
  onProgress?: ((progress: PageCollectionArchiveProgress) => void) | undefined;
  plan: PlannedPageCollection;
  resolvePagePackage: (page: PlannedPageCollection['pages'][number]) => Promise<{
    pagePackage: ComposedPagePackage<PageCollectionArchiveSource>;
    release(): Promise<void>;
  }>;
  signal?: AbortSignal | undefined;
  sink: ExportSink;
}): Promise<void> {
  const writer = createArchiveWriter(args.sink);
  let bytesComplete = 0;
  let entriesComplete = 0;

  const reportProgress = (path: string, bytes: number): void => {
    bytesComplete += bytes;
    entriesComplete += 1;
    args.onProgress?.({
      bytesComplete,
      entriesComplete,
      entriesTotal: args.plan.archiveOrder.length,
      path,
    });
  };
  const addText = async (path: string, text: string, size: number): Promise<void> => {
    assertNotAborted(args.signal);
    await writer.addText(path, text, args.signal ? { signal: args.signal } : {});
    reportProgress(path, size);
  };

  try {
    assertCanonicalArchiveOrder(args.plan);
    await addText(
      'collection-manifest.json',
      args.plan.manifestText,
      args.plan.manifestBytes.byteLength
    );
    await addText('README.md', PAGE_COLLECTION_README, args.plan.readmeBytes.byteLength);

    for (const page of args.plan.pages) {
      const resolved = await args.resolvePagePackage(page);
      const pagePackage = resolved.pagePackage;
      if (
        pagePackage.manifestSha256 !== page.pagePackage.manifestSha256 ||
        pagePackage.manifestBytes.byteLength !== page.pagePackage.manifestSize ||
        pagePackage.manifest.id !== page.pagePackage.pageId ||
        pagePackage.manifest.source.title !== page.pagePackage.title ||
        pagePackage.manifestBytes.byteLength + pagePackage.manifest.stats.totalBytes !==
          page.pagePackage.totalBytes ||
        pagePackage.entries.length !== page.pagePackage.entries.length
      ) {
        await resolved.release();
        throw new Error('Resolved Page Collection source diverged from its canonical plan.');
      }
      try {
        await addText(
          page.manifestPath,
          pagePackage.manifestText,
          pagePackage.manifestBytes.byteLength
        );
        for (const [entryIndex, entry] of pagePackage.entries.entries()) {
          const plannedEntry = page.pagePackage.entries[entryIndex];
          if (
            !plannedEntry ||
            entry.path !== plannedEntry.path ||
            entry.size !== plannedEntry.size ||
            entry.sha256 !== plannedEntry.sha256 ||
            entry.mimeType !== plannedEntry.mimeType ||
            entry.component !== plannedEntry.component
          ) {
            throw new Error('Resolved Page Collection entry diverged from its canonical plan.');
          }
          assertNotAborted(args.signal);
          if (entry.source.size !== entry.size) {
            throw new Error(
              `Page Collection source does not match its manifest entry: ${entry.path}.`
            );
          }
          const path = `${page.rootPath}/${entry.path}`;
          const writeOptions = {
            compress: shouldCompress(entry.mimeType),
            ...(args.signal ? { signal: args.signal } : {}),
          };
          if (entry.source instanceof Blob) {
            await writer.addBlob(path, entry.source, writeOptions);
          } else {
            await writer.addSource(path, entry.source, writeOptions);
          }
          reportProgress(path, entry.size);
        }
      } finally {
        await resolved.release();
      }
    }

    await addText('reports/summary.json', args.plan.summaryText, args.plan.summaryBytes.byteLength);
    await addText('reports/errors.json', args.plan.errorsText, args.plan.errorsBytes.byteLength);
    if (entriesComplete !== args.plan.archiveOrder.length) {
      throw new Error('Page Collection emitted an unexpected number of archive entries.');
    }
    await writer.close();
  } catch (error) {
    return abortArchive(writer, error);
  }
}
