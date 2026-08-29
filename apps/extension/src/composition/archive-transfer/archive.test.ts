import { BlobWriter, TextReader, Uint8ArrayWriter, ZipWriter } from '@zip.js/zip.js';
import { describe, expect, it } from 'vitest';
import { createBoundedArchiveBlobReader, openArchiveReader } from './reader';
import { createArchiveMemorySink } from './test-support';
import { createArchiveWriter } from './writer';

describe('archive transfer', () => {
  it('writes ZIP64 entries and reads them with strict CRC validation', async () => {
    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    await writer.addText('manifest.json', '{"version":6}');
    await writer.addBlob('objects/object-1/video.webm', new Blob(['media']));
    await writer.close();

    const reader = await openArchiveReader(output.blob());
    expect(reader.entries().map((entry) => entry.path)).toEqual([
      'manifest.json',
      'objects/object-1/video.webm',
    ]);
    expect(reader.entry('manifest.json')?.crc32).toEqual(expect.any(Number));
    await expect(reader.entry('manifest.json')?.text()).resolves.toBe('{"version":6}');
    const chunks: Uint8Array[] = [];
    await reader.entry('objects/object-1/video.webm')?.pipeTo(
      new WritableStream({
        write(chunk: Uint8Array) {
          chunks.push(new Uint8Array(chunk));
        },
      }),
      new AbortController().signal
    );
    expect(new TextDecoder().decode(chunks[0])).toBe('media');
    await reader.close();
  });

  it('streams a validated archive entry source into a new archive', async () => {
    const sourceOutput = createArchiveMemorySink();
    const sourceWriter = createArchiveWriter(sourceOutput.sink);
    await sourceWriter.addBlob('source.bin', new Blob(['streamed-source']));
    await sourceWriter.close();
    const sourceReader = await openArchiveReader(sourceOutput.blob());
    const source = sourceReader.entry('source.bin');
    expect(source).not.toBeNull();

    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    await writer.addSource('copy/source.bin', source!);
    await writer.close();

    const reader = await openArchiveReader(output.blob());
    await expect(reader.entry('copy/source.bin')?.text()).resolves.toBe('streamed-source');
    await reader.close();
    await sourceReader.close();
  });

  it('rejects a streamed source that does not emit its declared size', async () => {
    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    const source = {
      compressedSize: 2,
      crc32: 0,
      directory: false,
      path: 'source.bin',
      size: 3,
      pipeTo: (writable: WritableStream<Uint8Array>, signal?: AbortSignal) =>
        new Blob(['ab']).stream().pipeTo(writable, signal ? { signal } : {}),
      text: async () => 'ab',
    };

    await expect(writer.addSource('copy.bin', source)).rejects.toThrow('declared size');
    await writer.abort();
    expect(output.aborted).toBe(true);
  });

  it('cancels an in-flight streamed source through the caller signal', async () => {
    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    const controller = new AbortController();
    let markStarted: (() => void) | undefined;
    const started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    const source = {
      compressedSize: 0,
      crc32: 0,
      directory: false,
      path: 'pending.bin',
      size: 1,
      pipeTo: (writable: WritableStream<Uint8Array>, signal?: AbortSignal) => {
        markStarted?.();
        return new ReadableStream<Uint8Array>().pipeTo(writable, signal ? { signal } : {});
      },
      text: async () => '',
    };
    const write = writer.addSource('pending.bin', source, { signal: controller.signal });
    await started;
    controller.abort(new DOMException('Stopped', 'AbortError'));

    await expect(write).rejects.toMatchObject({ name: 'AbortError' });
    await writer.abort();
    expect(output.aborted).toBe(true);
  });

  it('rejects duplicate writer paths', async () => {
    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    await writer.addText('manifest.json', '{}');
    await expect(writer.addText('manifest.json', '{}')).rejects.toThrow('Duplicate');
    await writer.abort();
    expect(output.aborted).toBe(true);
  });

  it('rejects case-ambiguous writer paths', async () => {
    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    await writer.addText('Catalog/media.ndjson', '{}');
    await expect(writer.addText('catalog/MEDIA.ndjson', '{}')).rejects.toThrow('Duplicate');
    await writer.abort();
  });

  it('keeps the in-memory fallback bounded', async () => {
    const output = createArchiveMemorySink(1);
    const writer = createArchiveWriter(output.sink);

    await expect(writer.addText('manifest.json', '{}')).rejects.toThrow('memory sink');
    await writer.abort();
    expect(output.aborted).toBe(true);
  });

  it('rejects cancelled writes and writes after settlement', async () => {
    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    const controller = new AbortController();
    controller.abort();
    await expect(
      writer.addBlob('objects/object/video.webm', new Blob(['media']), {
        signal: controller.signal,
      })
    ).rejects.toMatchObject({ name: 'AbortError' });
    await writer.abort();
    await writer.abort();
    await expect(writer.addText('manifest.json', '{}')).rejects.toThrow('already settled');
  });

  it('aborts the sink when final close fails', async () => {
    const output = createArchiveMemorySink();
    const closeError = new Error('external disk failed');
    output.sink.close = async () => Promise.reject(closeError);
    const writer = createArchiveWriter(output.sink);
    await writer.addText('manifest.json', '{}');

    await expect(writer.close()).rejects.toBe(closeError);
    expect(output.aborted).toBe(true);
  });

  it('enforces text read limits and reports missing entries', async () => {
    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    await writer.addText('manifest.json', 'content');
    await writer.close();

    const reader = await openArchiveReader(output.blob());
    expect(reader.entry('missing.json')).toBeNull();
    await expect(reader.entry('manifest.json')?.text(2)).rejects.toThrow('text entry');
    await reader.close();
  });

  it('rejects ambiguous duplicate paths while reading', async () => {
    const blobWriter = new BlobWriter('application/zip');
    const zip = new ZipWriter(blobWriter, { zip64: true });
    await zip.add('one.json', new TextReader('first'));
    await zip.add('two.json', new TextReader('second'));
    const bytes = new Uint8Array(await (await zip.close()).arrayBuffer());
    replaceAscii(bytes, 'two.json', 'one.json');

    await expect(openArchiveReader(new Blob([bytes]))).rejects.toThrow(
      'Duplicate media archive path'
    );
  });

  it('rejects corrupted entry bytes through CRC validation', async () => {
    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    await writer.addBlob('media.bin', new Blob(['media']));
    await writer.close();
    const bytes = output.bytes();
    const localHeaderOffset = findSignatureFromEnd(bytes, [0x50, 0x4b, 0x03, 0x04]);
    const view = new DataView(bytes.buffer);
    const dataOffset =
      localHeaderOffset +
      30 +
      view.getUint16(localHeaderOffset + 26, true) +
      view.getUint16(localHeaderOffset + 28, true);
    bytes[dataOffset] = (bytes[dataOffset] ?? 0) ^ 0xff;

    const reader = await openArchiveReader(new Blob([bytes]));
    await expect(reader.entry('media.bin')?.pipeTo(new WritableStream())).rejects.toThrow();
    await reader.close();
  });

  it('rejects entry data declared beyond the archive boundary', async () => {
    const zip = new ZipWriter(new Uint8ArrayWriter(), { dataDescriptor: false });
    await zip.add('media.bin', new TextReader('media'), { compressionMethod: 0 });
    const bytes = await zip.close();
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const localHeaderOffset = findSignatureFromEnd(bytes, [0x50, 0x4b, 0x03, 0x04]);
    const centralHeaderOffset = findSignatureFromEnd(bytes, [0x50, 0x4b, 0x01, 0x02]);
    const declaredSize = bytes.byteLength + 1;
    view.setUint32(localHeaderOffset + 18, declaredSize, true);
    view.setUint32(centralHeaderOffset + 20, declaredSize, true);

    const reader = await openArchiveReader(new Blob([bytes]));
    await expect(reader.entry('media.bin')?.text()).rejects.toThrow('Entry data out of bounds');
    await reader.close();
  });

  it('rejects directory entries outside the canonical file path contract', async () => {
    const blobWriter = new BlobWriter('application/zip');
    const zip = new ZipWriter(blobWriter, { zip64: true });
    await zip.add('objects/', undefined, { directory: true });
    const archive = await zip.close();

    await expect(openArchiveReader(archive)).rejects.toThrow('directory entries are not supported');
  });

  it('closes the ZIP reader when an unsafe entry path is rejected', async () => {
    const blobWriter = new BlobWriter('application/zip');
    const zip = new ZipWriter(blobWriter, { zip64: true });
    await zip.add('../escape.json', new TextReader('{}'));
    const archive = await zip.close();

    await expect(openArchiveReader(archive)).rejects.toThrow('Unsafe filename');
  });

  it('rejects an oversized declared central directory before allocating it', async () => {
    const output = createArchiveMemorySink();
    const writer = createArchiveWriter(output.sink);
    await writer.addText('manifest.json', '{}');
    await writer.close();
    const bytes = output.bytes();
    const endOffset = findSignatureFromEnd(bytes, [0x50, 0x4b, 0x05, 0x06]);
    new DataView(bytes.buffer).setUint32(endOffset + 12, 64 * 1024 * 1024 + 1, true);

    await expect(openArchiveReader(new Blob([bytes]))).rejects.toThrow('Ambiguous archive');
  });

  it('rejects an oversized random-access read before allocating it', async () => {
    const reader = createBoundedArchiveBlobReader(new Blob(['archive']));
    await expect(reader.readUint8Array(0, 64 * 1024 * 1024 + 1)).rejects.toThrow(
      'central directory exceeds its byte budget'
    );
  });
});

function findSignatureFromEnd(bytes: Uint8Array, signature: readonly number[]): number {
  for (let offset = bytes.length - signature.length; offset >= 0; offset -= 1) {
    if (signature.every((value, index) => bytes[offset + index] === value)) return offset;
  }
  throw new Error('Expected ZIP signature was not found.');
}

function replaceAscii(bytes: Uint8Array, source: string, replacement: string): void {
  const sourceBytes = new TextEncoder().encode(source);
  const replacementBytes = new TextEncoder().encode(replacement);
  if (sourceBytes.length !== replacementBytes.length)
    throw new Error('Expected equal path lengths.');
  let replacements = 0;
  for (let offset = 0; offset <= bytes.length - sourceBytes.length; offset += 1) {
    if (sourceBytes.every((value, index) => bytes[offset + index] === value)) {
      bytes.set(replacementBytes, offset);
      replacements += 1;
    }
  }
  if (replacements !== 2) throw new Error('Expected local and central ZIP path records.');
}
