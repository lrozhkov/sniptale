import type { FileResource } from '@sniptale/runtime-contracts/export';
import { getCurrentExportPageUrl } from '../diagnostics/dom-driver';
import {
  extractFilenameFromContentDisposition,
  extractUuidFromUrl,
  getExtensionFromMimeType,
  getFileExtension,
  resolveCredentialedDownloadUrl,
  sanitizeArchiveEntryFilename,
  shouldSkipHtmlDownloadResponse,
} from './utils';

const MAX_EXPORT_DOWNLOAD_BYTES = 100 * 1024 * 1024;

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

function assertResponseWithinBudget(response: Response): void {
  const contentLength = parseContentLength(response.headers.get('Content-Length'));
  if (contentLength !== null && contentLength > MAX_EXPORT_DOWNLOAD_BYTES) {
    throw new Error('Download response is too large');
  }
}

async function readResponseBlobWithLimit(response: Response): Promise<Blob> {
  assertResponseWithinBudget(response);
  if (!response.body) {
    const blob = await response.blob();
    if (blob.size > MAX_EXPORT_DOWNLOAD_BYTES) {
      throw new Error('Download response is too large');
    }
    return blob;
  }

  const reader = response.body.getReader();
  const chunks: BlobPart[] = [];
  let totalBytes = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) {
      break;
    }
    totalBytes += value.byteLength;
    if (totalBytes > MAX_EXPORT_DOWNLOAD_BYTES) {
      await reader.cancel();
      throw new Error('Download response is too large');
    }
    const chunk = new Uint8Array(value.byteLength);
    chunk.set(value);
    chunks.push(chunk);
  }

  return new Blob(chunks, { type: response.headers.get('Content-Type') ?? '' });
}

async function downloadResource(
  resource: FileResource,
  abortSignal: AbortSignal | undefined,
  makeUniqueFilename: (baseName: string, ext: string) => string,
  pageUrl?: string
): Promise<{ blob: Blob; filename: string; urlUuid: string | null }> {
  const resolvedUrl = resolveCredentialedDownloadUrl(
    resource.url,
    getCurrentExportPageUrl(pageUrl)
  );
  if (!resolvedUrl) {
    throw new Error('Blocked disallowed download URL');
  }

  const response = await fetch(resolvedUrl, {
    credentials: 'include',
    ...(abortSignal === undefined ? {} : { signal: abortSignal }),
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }

  const blob = await readResponseBlobWithLimit(response);
  const contentType = response.headers.get('Content-Type');
  let filename =
    extractFilenameFromContentDisposition(response.headers.get('Content-Disposition')) ||
    resource.filename;

  if (shouldSkipHtmlDownloadResponse({ url: resolvedUrl, contentType, filename })) {
    throw new Error(`Skipped intermediary HTML page (${contentType ?? 'unknown content type'})`);
  }

  if (!/\.[a-zA-Z0-9]{2,5}$/.test(filename)) {
    const extension = getExtensionFromMimeType(blob.type) || getFileExtension(resolvedUrl) || 'bin';
    filename = `${filename}.${extension}`;
  }

  const sanitizedFilename = sanitizeArchiveEntryFilename(filename) ?? 'file.bin';
  const lastDot = sanitizedFilename.lastIndexOf('.');
  const baseName = lastDot > 0 ? sanitizedFilename.substring(0, lastDot) : sanitizedFilename;
  const ext = lastDot > 0 ? sanitizedFilename.substring(lastDot + 1) : '';

  return {
    blob,
    filename: makeUniqueFilename(baseName, ext),
    urlUuid: extractUuidFromUrl(resolvedUrl),
  };
}

export async function downloadFileResources(
  resources: FileResource[],
  abortSignal: AbortSignal | undefined,
  isCancelled: () => boolean,
  onProgress: (current: number, total: number) => void,
  pageUrl?: string
): Promise<{ files: Map<string, Blob>; errors: string[]; urlUuidToFilename: Map<string, string> }> {
  const files = new Map<string, Blob>();
  const urlUuidToFilename = new Map<string, string>();
  const errors: string[] = [];
  const queue = [...resources];
  let completed = 0;
  const makeUniqueFilename = createUniqueFilenameFactory();

  const worker = async () => {
    while (queue.length > 0 && !isCancelled()) {
      const resource = queue.shift();
      if (!resource) {
        break;
      }

      try {
        const result = await downloadResource(resource, abortSignal, makeUniqueFilename, pageUrl);
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
      onProgress(completed, resources.length);
    }
  };

  await Promise.all(
    Array(Math.min(3, resources.length))
      .fill(null)
      .map(() => worker())
  );
  return { files, errors, urlUuidToFilename };
}
