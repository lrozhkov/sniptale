import type { ArchiveWriter, ExportSink } from '../../composition/archive-transfer/contracts';
import { createArchiveWriter } from '../../composition/archive-transfer/writer';
import type { ComposedPagePackage } from './composer';

export const PAGE_PACKAGE_MANIFEST_PATH = 'manifest.json';

interface PagePackageArchiveProgress {
  bytesComplete: number;
  entriesComplete: number;
  entriesTotal: number;
  path: string;
}

function assertNotAborted(signal: AbortSignal | undefined): void {
  if (signal?.aborted) {
    throw signal.reason instanceof Error
      ? signal.reason
      : new DOMException('Page Package archive was cancelled.', 'AbortError');
  }
}

function shouldCompress(mimeType: string): boolean {
  return (
    mimeType.startsWith('text/') || mimeType === 'application/json' || mimeType === 'image/svg+xml'
  );
}

async function abortArchive(writer: ArchiveWriter, error: unknown): Promise<never> {
  try {
    await writer.abort(error);
  } catch (cleanupError) {
    throw new AggregateError(
      [error, cleanupError],
      'Page Package archive failed and output cleanup was incomplete.',
      { cause: cleanupError }
    );
  }
  throw error;
}

/** Streams one already composed Page Package into the canonical archive writer. */
export async function writePagePackageArchive(args: {
  onProgress?: ((progress: PagePackageArchiveProgress) => void) | undefined;
  package: ComposedPagePackage<Blob>;
  signal?: AbortSignal | undefined;
  sink: ExportSink;
}): Promise<void> {
  const writer = createArchiveWriter(args.sink);
  const entriesTotal = args.package.entries.length + 1;
  let bytesComplete = 0;
  let entriesComplete = 0;

  try {
    for (const entry of args.package.entries) {
      assertNotAborted(args.signal);
      if (!(entry.source instanceof Blob) || entry.source.size !== entry.size) {
        throw new Error(`Page Package source does not match its manifest entry: ${entry.path}.`);
      }
      await writer.addBlob(entry.path, entry.source, {
        compress: shouldCompress(entry.mimeType),
        ...(args.signal ? { signal: args.signal } : {}),
      });
      bytesComplete += entry.size;
      entriesComplete += 1;
      args.onProgress?.({ bytesComplete, entriesComplete, entriesTotal, path: entry.path });
    }

    assertNotAborted(args.signal);
    await writer.addText(PAGE_PACKAGE_MANIFEST_PATH, args.package.manifestText, {
      ...(args.signal ? { signal: args.signal } : {}),
    });
    bytesComplete += args.package.manifestBytes.byteLength;
    entriesComplete += 1;
    args.onProgress?.({
      bytesComplete,
      entriesComplete,
      entriesTotal,
      path: PAGE_PACKAGE_MANIFEST_PATH,
    });
    await writer.close();
  } catch (error) {
    return abortArchive(writer, error);
  }
}
