import { sanitizeStructuredDiagnosticExportData } from '@sniptale/platform/observability/diagnostics/sanitizer';
import { parseRuntimeLogEntry } from './model';
import { parseMaintenanceLogEntry } from '../library-lifecycle/maintenance-log-model';

export const EVENT_SEGMENT_BYTES = 1024 * 1024;
const options = { useWebWorkers: false, bufferedWrite: false };
/** Closed row codecs run again at compression/export, never accepting arbitrary diagnostic objects. */
export function sanitizeEventLines(text: string, cutoff = 0): string {
  if (new TextEncoder().encode(text).byteLength > EVENT_SEGMENT_BYTES)
    throw new Error('Event segment exceeds limit');
  const lines: string[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const raw: unknown = JSON.parse(line);
    const entry = parseRuntimeLogEntry(raw) ?? parseMaintenanceLogEntry(raw);
    if (!entry) throw new Error('Invalid event row');
    if (Date.parse(entry.time) > cutoff)
      lines.push(JSON.stringify(sanitizeStructuredDiagnosticExportData(entry)));
  }
  return lines.length ? lines.join('\n') + '\n' : '';
}
export async function compressEventSegment(text: string): Promise<Blob> {
  const { BlobWriter, TextReader, ZipWriter } = await import('@zip.js/zip.js');
  const zip = new ZipWriter(new BlobWriter('application/zip'), options);
  await zip.add('events.jsonl', new TextReader(sanitizeEventLines(text)));
  return zip.close();
}
/** Inflation is bounded by actual streamed bytes as well as directory metadata. */
export async function readEventSegment(blob: Blob): Promise<string> {
  if (blob.size > EVENT_SEGMENT_BYTES + 4096) throw new Error('Invalid event archive size');
  const { BlobReader, ZipReader } = await import('@zip.js/zip.js');
  const zip = new ZipReader(new BlobReader(blob), { useWebWorkers: false });
  try {
    const entries = await zip.getEntries();
    const entry = entries[0];
    if (
      entries.length !== 1 ||
      !entry ||
      entry.directory ||
      entry.filename !== 'events.jsonl' ||
      entry.uncompressedSize > EVENT_SEGMENT_BYTES
    )
      throw new Error('Invalid event archive');
    const chunks: Uint8Array<ArrayBuffer>[] = [];
    let size = 0;
    await entry.getData(
      new WritableStream<Uint8Array>({
        write(chunk) {
          size += chunk.byteLength;
          if (size > EVENT_SEGMENT_BYTES) throw new Error('Event inflation exceeds limit');
          chunks.push(new Uint8Array(chunk));
        },
      }),
      { checkSignature: true, useWebWorkers: false }
    );
    return sanitizeEventLines(await new Blob(chunks).text());
  } finally {
    await zip.close();
  }
}
/** Only one uncompressed segment exists at a time; the result contains ordinary JSONL members. */
export async function exportEventSegments(
  segments: AsyncIterable<string>,
  cutoff: number
): Promise<Blob> {
  const { BlobWriter, TextReader, ZipWriter } = await import('@zip.js/zip.js');
  const zip = new ZipWriter(new BlobWriter('application/zip'), options);
  let index = 0;
  for await (const segment of segments) {
    const text = sanitizeEventLines(segment, cutoff);
    if (text)
      await zip.add(`events-${String(++index).padStart(5, '0')}.jsonl`, new TextReader(text));
  }
  return zip.close();
}
