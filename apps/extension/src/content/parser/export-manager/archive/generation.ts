import type JSZip from 'jszip';
import type { ArchiveArtifact } from './artifacts';
import { MAX_EXPORT_ARCHIVE_INPUT_BYTES } from './budget';
import type { ArchiveGenerationControl, ExportArchivePackageEntry } from './types';

export { MAX_EXPORT_ARCHIVE_INPUT_BYTES } from './budget';

function getTextByteLength(value: string): number {
  return new TextEncoder().encode(value).byteLength;
}

function getBase64DecodedByteLength(value: string): number {
  const normalizedLength = value.replace(/[\r\n\s]/gu, '').length;
  const padding = value.endsWith('==') ? 2 : value.endsWith('=') ? 1 : 0;

  return Math.max(0, Math.floor((normalizedLength * 3) / 4) - padding);
}

function getArchiveEntryInputBytes(entry: ExportArchivePackageEntry): number {
  if (typeof entry.textContent === 'string') {
    return getTextByteLength(entry.textContent);
  }

  if (entry.binaryContent instanceof Blob) {
    return entry.binaryContent.size;
  }

  if (typeof entry.binaryBase64 === 'string') {
    return getBase64DecodedByteLength(entry.binaryBase64);
  }

  return 0;
}

function assertArchiveInputBudget(entries: ExportArchivePackageEntry[]): void {
  let totalBytes = 0;

  for (const entry of entries) {
    totalBytes += getArchiveEntryInputBytes(entry);
    if (totalBytes > MAX_EXPORT_ARCHIVE_INPUT_BYTES) {
      throw new Error('Export archive input is too large');
    }
  }
}

function throwIfArchiveCancelled(control: ArchiveGenerationControl | undefined): void {
  if (control?.isCancelled()) {
    throw control.createCancelledError();
  }
}

function createZipGenerationOptions() {
  return {
    type: 'uint8array' as const,
    compression: 'DEFLATE' as const,
    compressionOptions: { level: 6 },
  };
}

function copyChunkToArrayBuffer(chunk: Uint8Array): ArrayBuffer {
  const copy = new Uint8Array(chunk.byteLength);

  copy.set(chunk);
  return copy.buffer;
}

function generateZipBlobWithCancellation(
  zip: JSZip,
  control: ArchiveGenerationControl | undefined
): Promise<Blob> {
  const stream = zip.generateInternalStream(createZipGenerationOptions());

  return new Promise((resolve, reject) => {
    const chunks: ArrayBuffer[] = [];
    let settled = false;

    const rejectOnce = (error: Error): void => {
      if (settled) {
        return;
      }
      settled = true;
      chunks.length = 0;
      stream.pause();
      reject(error);
    };

    stream
      .on('data', (chunk) => {
        if (control?.isCancelled()) {
          rejectOnce(control.createCancelledError());
          return;
        }
        chunks.push(copyChunkToArrayBuffer(chunk));
      })
      .on('error', (error) => {
        rejectOnce(error);
      })
      .on('end', () => {
        if (settled) {
          return;
        }
        try {
          throwIfArchiveCancelled(control);
          settled = true;
          resolve(new Blob(chunks, { type: 'application/zip' }));
        } catch (error) {
          rejectOnce(
            error instanceof Error ? error : new Error('Failed to generate export archive')
          );
        }
      })
      .resume();
  });
}

export async function createExportArchiveBlob(
  pagePackage: ArchiveArtifact,
  control?: ArchiveGenerationControl
): Promise<Blob> {
  throwIfArchiveCancelled(control);
  assertArchiveInputBudget(pagePackage.entries);
  throwIfArchiveCancelled(control);

  const { default: JSZip } = await import('jszip');
  const zip = new JSZip();

  for (const entry of pagePackage.entries) {
    throwIfArchiveCancelled(control);

    if (typeof entry.textContent === 'string') {
      zip.file(entry.path, entry.textContent);
      continue;
    }

    if (entry.binaryContent instanceof Blob) {
      zip.file(entry.path, entry.binaryContent);
      continue;
    }

    if (typeof entry.binaryBase64 === 'string') {
      zip.file(entry.path, entry.binaryBase64, {
        base64: true,
      });
    }
  }

  return generateZipBlobWithCancellation(zip, control);
}
