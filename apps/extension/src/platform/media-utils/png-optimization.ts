import { Unzlib } from 'fflate';
import {
  assembleOptimizedPng,
  filterPngRow,
  readBrowserPng,
  unfilterPngRow,
  type BrowserPng,
} from './png-codec';

const MAX_SOURCE_BYTES = 32 * 1024 * 1024;
const MAX_FILTERED_BYTES = 512 * 1024 * 1024;
const MAX_OPTIMIZATION_MS = 8_000;
// A small compressed input limits the decoder's allocation before its output callback runs.
const INFLATE_INPUT_BYTES = 1024;
const ADLER_MODULUS = 65521;

type CheckBudget = () => void;
type RowConsumer = (row: Uint8Array) => void;

function createBudget(signal?: AbortSignal): CheckBudget {
  const deadline = performance.now() + MAX_OPTIMIZATION_MS;
  return () => {
    signal?.throwIfAborted();
    if (performance.now() > deadline) throw new Error('PNG optimization budget exceeded.');
  };
}

function readAdlerTrailer(chunks: Uint8Array[]): number {
  const trailer = new Uint8Array(4);
  let length = 0;
  for (const bytes of chunks) {
    length += bytes.length;
    if (bytes.length >= 4) trailer.set(bytes.subarray(-4));
    else {
      trailer.copyWithin(0, bytes.length);
      trailer.set(bytes, 4 - bytes.length);
    }
  }
  if (length < 6) throw new Error('Truncated PNG compressed stream.');
  return new DataView(trailer.buffer).getUint32(0);
}

function createRowDecoder(png: BrowserPng, consumeRow: RowConsumer, checkBudget: CheckBudget) {
  const rowLength = png.width * png.channels + 1;
  const expectedBytes = rowLength * png.height;
  let row = new Uint8Array(rowLength);
  let previous = new Uint8Array(rowLength);
  let filled = 0;
  let decodedBytes = 0;
  let adlerA = 1;
  let adlerB = 0;
  return {
    receive(bytes: Uint8Array) {
      checkBudget();
      if (bytes.length > expectedBytes - decodedBytes)
        throw new Error('PNG decoded size mismatch.');
      decodedBytes += bytes.length;
      for (let start = 0; start < bytes.length; start += 5552) {
        const end = Math.min(bytes.length, start + 5552);
        for (let index = start; index < end; index += 1) {
          adlerA += bytes[index]!;
          adlerB += adlerA;
        }
        adlerA %= ADLER_MODULUS;
        adlerB %= ADLER_MODULUS;
      }
      for (let offset = 0; offset < bytes.length;) {
        const size = Math.min(row.length - filled, bytes.length - offset);
        row.set(bytes.subarray(offset, offset + size), filled);
        filled += size;
        offset += size;
        if (filled === row.length) {
          checkBudget();
          unfilterPngRow(row, previous, png.channels);
          consumeRow(row);
          [row, previous] = [previous, row];
          filled = 0;
        }
      }
    },
    finish() {
      const adler = ((adlerB << 16) | adlerA) >>> 0;
      if (
        decodedBytes !== expectedBytes ||
        filled !== 0 ||
        adler !== readAdlerTrailer(png.imageData)
      ) {
        throw new Error('PNG compressed stream integrity check failed.');
      }
    },
  };
}

async function decodeRows(
  png: BrowserPng,
  consumeRow: RowConsumer,
  checkBudget: CheckBudget,
  flush?: () => Promise<void>
) {
  const rows = createRowDecoder(png, consumeRow, checkBudget);
  const decoder = new Unzlib((bytes) => rows.receive(bytes));
  let lastYield = performance.now();
  for (const bytes of png.imageData) {
    for (let offset = 0; offset < bytes.length; offset += INFLATE_INPUT_BYTES) {
      checkBudget();
      decoder.push(bytes.subarray(offset, offset + INFLATE_INPUT_BYTES), false);
      await flush?.();
      if (performance.now() - lastYield >= 16) {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
        checkBudget();
        lastYield = performance.now();
      }
    }
  }
  decoder.push(new Uint8Array(), true);
  rows.finish();
}

async function resolveOutputChannels(png: BrowserPng, checkBudget: CheckBudget): Promise<3 | 4> {
  if (png.channels === 3 || !png.canRemoveAlpha) return png.channels;
  let opaque = true;
  await decodeRows(
    png,
    (row) => {
      for (let index = 4; index < row.length; index += 4) {
        if (row[index] !== 255) opaque = false;
      }
    },
    checkBudget
  );
  return opaque ? 3 : 4;
}

function createNativeCandidate(maxBytes: number) {
  const compressor = new CompressionStream('deflate');
  const writer = compressor.writable.getWriter();
  const reader = compressor.readable.getReader();
  let chunks: Uint8Array[] = [];
  let size = 0;
  let pending: Uint8Array[] = [];
  let pendingBytes = 0;
  let active = true;
  let readError: unknown;
  const drained = (async () => {
    try {
      while (true) {
        const result = await reader.read();
        if (result.done) break;
        size += result.value.length;
        if (size >= maxBytes) {
          active = false;
          chunks = [];
        } else if (active) chunks.push(result.value);
      }
    } catch (error) {
      readError = error;
    }
  })();
  const flush = async () => {
    if (!pendingBytes) return;
    const bytes = new Uint8Array(pendingBytes);
    let offset = 0;
    for (const row of pending) {
      bytes.set(row, offset);
      offset += row.length;
    }
    pending = [];
    pendingBytes = 0;
    await writer.write(bytes);
  };
  return {
    push(row: Uint8Array) {
      if (!active) return;
      pending.push(row.slice());
      pendingBytes += row.length;
    },
    flush,
    async finish(): Promise<Uint8Array[] | null> {
      await flush();
      await writer.close();
      await drained;
      if (readError) throw readError;
      return active ? chunks : null;
    },
    async dispose() {
      await Promise.allSettled([writer.abort(), reader.cancel(), drained]);
    },
  };
}

async function encodeCandidates(
  png: BrowserPng,
  channels: 3 | 4,
  maxBytes: number,
  checkBudget: CheckBudget
): Promise<Blob[]> {
  const none = createNativeCandidate(maxBytes);
  const adaptive = createNativeCandidate(maxBytes);
  const previous = new Uint8Array(png.width * channels + 1);
  const rgb = new Uint8Array(previous.length);
  const candidates = [none, adaptive];
  try {
    await decodeRows(
      png,
      (decoded) => {
        let row = decoded;
        if (channels !== png.channels) {
          for (let source = 1, target = 1; source < decoded.length; source += 4, target += 3) {
            rgb[target] = decoded[source]!;
            rgb[target + 1] = decoded[source + 1]!;
            rgb[target + 2] = decoded[source + 2]!;
          }
          row = rgb;
        }
        none.push(row);
        adaptive.push(filterPngRow(row, previous, channels));
        previous.set(row);
      },
      checkBudget,
      async () => {
        await Promise.all(candidates.map((candidate) => candidate.flush()));
      }
    );
    const results: Blob[] = [];
    for (const candidate of candidates) {
      const compressed = await candidate.finish();
      if (compressed) results.push(assembleOptimizedPng(png, channels, compressed));
    }
    return results;
  } finally {
    await Promise.all(candidates.map((candidate) => candidate.dispose()));
  }
}

/**
 * Recompresses supported PNG bytes without changing pixels or ancillary metadata.
 * Returns the source on unsupported input, resource limits, failure, or no size benefit.
 * Cancellation propagates to the caller. Row streaming avoids a full decoded raster.
 */
export async function optimizePngBlob(blob: Blob, signal?: AbortSignal): Promise<Blob> {
  signal?.throwIfAborted();
  if (
    blob.type !== 'image/png' ||
    blob.size > MAX_SOURCE_BYTES ||
    typeof CompressionStream !== 'function'
  )
    return blob;
  const checkBudget = createBudget(signal);
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    checkBudget();
    const png = readBrowserPng(bytes, MAX_FILTERED_BYTES);
    if (!png) return blob;
    const channels = await resolveOutputChannels(png, checkBudget);
    const candidates = await encodeCandidates(png, channels, blob.size, checkBudget);
    checkBudget();
    return candidates.reduce(
      (smallest, candidate) => (candidate.size < smallest.size ? candidate : smallest),
      blob
    );
  } catch {
    signal?.throwIfAborted();
    return blob;
  }
}
