import {
  DEFAULT_EXPORT_RESOURCE_LIMITS,
  parseExportResourceLimits,
  type ExportResourceLimits,
  type FileResource,
} from '@sniptale/runtime-contracts/export';
import { getCurrentExportPageUrl } from '../diagnostics/dom-driver';
import {
  extractFilenameFromContentDisposition,
  extractUuidFromUrl,
  getExtensionFromMimeType,
  getFileExtension,
  resolveCredentialedDownloadUrl,
  sanitizeArchiveEntryFilename,
  shouldSkipHtmlDownloadResponse,
} from './download-utils';

const EXPORT_RESOURCE_TIMEOUT_MS = 15_000;
const EXPORT_FILES_TOTAL_TIMEOUT_MS = 45_000;

interface AggregateByteBudget {
  release(bytes: number): void;
  tryReserve(bytes: number): boolean;
}

function createAggregateByteBudget(maxBytes: number): AggregateByteBudget {
  let reservedBytes = 0;
  return {
    release(bytes) {
      reservedBytes = Math.max(0, reservedBytes - bytes);
    },
    tryReserve(bytes) {
      if (bytes < 0 || reservedBytes + bytes > maxBytes) return false;
      reservedBytes += bytes;
      return true;
    },
  };
}

function createUniqueFilenameFactory() {
  const usedFilenames = new Set<string>();

  return (baseName: string, ext: string): string => {
    let filename = ext ? `${baseName}.${ext}` : baseName;
    let counter = 1;
    while (usedFilenames.has(filename)) {
      filename = ext ? `${baseName}_${counter}.${ext}` : `${baseName}_${counter}`;
      counter++;
    }
    usedFilenames.add(filename);
    return filename;
  };
}

function parseContentLength(value: string | null): number | null {
  if (!value) {
    return null;
  }
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}

function assertResponseWithinBudget(response: Response, maxBytes: number): void {
  const contentLength = parseContentLength(response.headers.get('Content-Length'));
  if (contentLength !== null && contentLength > maxBytes) {
    throw new Error('Download response is too large');
  }
}

async function readResponseBlobWithLimit(
  response: Response,
  maxBytes: number,
  aggregateBudget: AggregateByteBudget
): Promise<Blob> {
  assertResponseWithinBudget(response, maxBytes);
  if (!response.body) {
    throw new Error('Download response cannot be read within the configured limits');
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let totalBytes = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) {
        break;
      }
      if (totalBytes + value.byteLength > maxBytes) {
        await reader.cancel();
        throw new Error('Download response is too large');
      }
      if (!aggregateBudget.tryReserve(value.byteLength)) {
        await reader.cancel();
        throw new Error('Total attachment size limit exceeded');
      }
      totalBytes += value.byteLength;
      const chunk = new Uint8Array(value.byteLength);
      chunk.set(value);
      chunks.push(chunk);
    }
    return new Blob(chunks, { type: response.headers.get('Content-Type') ?? '' });
  } catch (error) {
    aggregateBudget.release(totalBytes);
    throw error;
  }
}

interface DownloadResourceContext {
  abortSignal: AbortSignal | undefined;
  aggregateBudget: AggregateByteBudget;
  makeUniqueFilename: (baseName: string, ext: string) => string;
  maxBytes: number;
  pageUrl?: string;
}

async function fetchResourceBlob(
  resource: FileResource,
  resolvedUrl: string,
  context: DownloadResourceContext
): Promise<{ blob: Blob; response: Response }> {
  const requestController = new AbortController();
  let requestTimedOut = false;
  const relayAbort = () => requestController.abort(context.abortSignal?.reason);
  if (context.abortSignal?.aborted) relayAbort();
  else context.abortSignal?.addEventListener('abort', relayAbort, { once: true });
  const timeoutId = globalThis.setTimeout(() => {
    requestTimedOut = true;
    requestController.abort(new Error('Download timed out'));
  }, EXPORT_RESOURCE_TIMEOUT_MS);
  try {
    const response = await fetch(resolvedUrl, {
      credentials: 'include',
      ...(resource.source === 'page-image' ? { redirect: 'manual' as const } : {}),
      signal: requestController.signal,
    });
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }
    const blob = await readResponseBlobWithLimit(
      response,
      context.maxBytes,
      context.aggregateBudget
    );
    return { blob, response };
  } catch (error) {
    if (requestTimedOut) throw new Error('Download timed out', { cause: error });
    throw error;
  } finally {
    globalThis.clearTimeout(timeoutId);
    context.abortSignal?.removeEventListener('abort', relayAbort);
  }
}

function finalizeDownloadedResource(args: {
  blob: Blob;
  makeUniqueFilename: DownloadResourceContext['makeUniqueFilename'];
  resource: FileResource;
  resolvedUrl: string;
  response: Response;
}): { blob: Blob; filename: string; urlUuid: string | null } {
  const contentType = args.response.headers.get('Content-Type');
  let filename =
    extractFilenameFromContentDisposition(args.response.headers.get('Content-Disposition')) ||
    args.resource.filename;
  if (shouldSkipHtmlDownloadResponse({ url: args.resolvedUrl, contentType, filename })) {
    throw new Error(`Skipped intermediary HTML page (${contentType ?? 'unknown content type'})`);
  }
  const admittedMimeExtension =
    getExtensionFromMimeType(args.blob.type) ||
    (contentType?.toLowerCase().startsWith('text/html') ? 'html' : null);
  if (admittedMimeExtension) {
    const existingExtension = getFileExtension(filename);
    const baseName = existingExtension
      ? filename.slice(0, -(existingExtension.length + 1))
      : filename;
    filename = `${baseName}.${admittedMimeExtension}`;
  } else if (!/\.[a-zA-Z0-9]{2,5}$/.test(filename)) {
    filename = `${filename}.${getFileExtension(args.resolvedUrl) || 'bin'}`;
  }
  const sanitizedFilename = sanitizeArchiveEntryFilename(filename) ?? 'file.bin';
  const lastDot = sanitizedFilename.lastIndexOf('.');
  const baseName = lastDot > 0 ? sanitizedFilename.substring(0, lastDot) : sanitizedFilename;
  const ext = lastDot > 0 ? sanitizedFilename.substring(lastDot + 1) : '';
  return {
    blob: args.blob,
    filename: args.makeUniqueFilename(baseName, ext),
    urlUuid: extractUuidFromUrl(args.resolvedUrl),
  };
}

async function downloadResource(
  resource: FileResource,
  context: DownloadResourceContext
): Promise<{ blob: Blob; filename: string; urlUuid: string | null }> {
  const resolvedUrl = resolveCredentialedDownloadUrl(
    resource.url,
    getCurrentExportPageUrl(context.pageUrl)
  );
  if (!resolvedUrl) throw new Error('Blocked disallowed download URL');
  const downloaded = await fetchResourceBlob(resource, resolvedUrl, context);
  try {
    return finalizeDownloadedResource({
      ...downloaded,
      makeUniqueFilename: context.makeUniqueFilename,
      resource,
      resolvedUrl,
    });
  } catch (error) {
    context.aggregateBudget.release(downloaded.blob.size);
    throw error;
  }
}

export async function downloadFileResources(
  resources: FileResource[],
  abortSignal: AbortSignal | undefined,
  isCancelled: () => boolean,
  onProgress: (current: number, total: number) => void,
  pageUrl?: string,
  requestedLimits: ExportResourceLimits = DEFAULT_EXPORT_RESOURCE_LIMITS
): Promise<{ files: Map<string, Blob>; errors: string[]; urlUuidToFilename: Map<string, string> }> {
  const limits = parseExportResourceLimits(requestedLimits) ?? DEFAULT_EXPORT_RESOURCE_LIMITS;
  const files = new Map<string, Blob>();
  const urlUuidToFilename = new Map<string, string>();
  const errors: string[] = [];
  const admittedResources = resources.slice(0, limits.maxFileCount);
  const queue = [...admittedResources];
  if (resources.length > admittedResources.length) {
    errors.push(
      `Skipped ${resources.length - admittedResources.length} files: attachment count limit exceeded`
    );
  }
  const maxFileBytes = limits.maxFileSizeMiB * 1024 * 1024;
  const maxTotalBytes = limits.maxTotalSizeMiB * 1024 * 1024;
  const aggregateBudget = createAggregateByteBudget(maxTotalBytes);
  let completed = 0;
  const makeUniqueFilename = createUniqueFilenameFactory();
  const collectionController = new AbortController();
  let collectionTimedOut = false;
  const relayAbort = () => collectionController.abort(abortSignal?.reason);
  if (abortSignal?.aborted) relayAbort();
  else abortSignal?.addEventListener('abort', relayAbort, { once: true });
  const collectionTimeoutId = globalThis.setTimeout(() => {
    collectionTimedOut = true;
    collectionController.abort(new Error('File collection timed out'));
  }, EXPORT_FILES_TOTAL_TIMEOUT_MS);

  const worker = async () => {
    while (queue.length > 0 && !isCancelled() && !collectionController.signal.aborted) {
      const resource = queue.shift();
      if (!resource) {
        break;
      }

      try {
        const result = await downloadResource(resource, {
          abortSignal: collectionController.signal,
          aggregateBudget,
          makeUniqueFilename,
          maxBytes: maxFileBytes,
          ...(pageUrl === undefined ? {} : { pageUrl }),
        });
        files.set(result.filename, result.blob);
        if (result.urlUuid) {
          urlUuidToFilename.set(result.urlUuid, result.filename);
        }
      } catch (error) {
        errors.push(
          `Failed to download ${resource.filename}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }

      completed++;
      onProgress(completed, admittedResources.length);
    }
  };

  try {
    await Promise.all(
      Array(Math.min(3, admittedResources.length))
        .fill(null)
        .map(() => worker())
    );
  } finally {
    globalThis.clearTimeout(collectionTimeoutId);
    abortSignal?.removeEventListener('abort', relayAbort);
  }
  if (collectionTimedOut && queue.length > 0) {
    const skippedCount = queue.length;
    queue.length = 0;
    completed += skippedCount;
    errors.push(`Skipped ${skippedCount} file downloads: export file time budget exceeded`);
    onProgress(completed, admittedResources.length);
  }
  return { files, errors, urlUuidToFilename };
}
