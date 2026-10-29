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
const MAX_RECONSTRUCTED_BYTES = 32 * 1024 * 1024;
// Small input chunks bound native decompression bursts before row-size admission.
const INFLATE_INPUT_BYTES = 4 * 1024;
const DEFLATE_BATCH_BYTES = 256 * 1024;

type CheckBudget = () => void;
type RowConsumer = (row: Uint8Array) => void;

function createBudget(signal?: AbortSignal): CheckBudget {
  const deadline = performance.now() + MAX_OPTIMIZATION_MS;
  return () => {
    signal?.throwIfAborted();
    if (performance.now() > deadline) throw new Error('PNG optimization budget exceeded.');
  };
}

function createRowDecoder(png: BrowserPng, consumeRow: RowConsumer, checkBudget: CheckBudget) {
  const rowLength = png.width * png.channels + 1;
  const expectedBytes = rowLength * png.height;
  let row = new Uint8Array(rowLength);
  let previous = new Uint8Array(rowLength);
  let filled = 0;
  let decodedBytes = 0;
  return {
    receive(bytes: Uint8Array) {
      checkBudget();
      if (bytes.length > expectedBytes - decodedBytes)
        throw new Error('PNG decoded size mismatch.');
      decodedBytes += bytes.length;
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
      if (decodedBytes !== expectedBytes || filled !== 0) {
        throw new Error('PNG compressed stream integrity check failed.');
      }
    },
  };
}

async function decodePngData(
  png: BrowserPng,
  receiveBytes: (bytes: Uint8Array) => void,
  checkBudget: CheckBudget,
  flush?: () => Promise<void>
) {
  let chunk = 0;
  let offset = 0;
  const compressed = new ReadableStream<BufferSource>({
    pull(controller) {
      checkBudget();
      while (chunk < png.imageData.length) {
        const bytes = png.imageData[chunk]!;
        if (offset < bytes.length) {
          const end = Math.min(bytes.length, offset + INFLATE_INPUT_BYTES);
          controller.enqueue(bytes.slice(offset, end));
          offset = end;
          return;
        }
        chunk += 1;
        offset = 0;
      }
      controller.close();
    },
  });
  const reader = compressed.pipeThrough(new DecompressionStream('deflate')).getReader();
  let lastYield = performance.now();
  try {
    while (true) {
      checkBudget();
      const result = await reader.read();
      if (result.done) break;
      receiveBytes(result.value);
      await flush?.();
      if (performance.now() - lastYield >= 16) {
        await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 0));
        checkBudget();
        lastYield = performance.now();
      }
    }
    // Reading to completion validates Adler-32, truncation and trailing bytes natively.
  } finally {
    await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}

async function decodeRows(
  png: BrowserPng,
  consumeRow: RowConsumer,
  checkBudget: CheckBudget,
  flush?: () => Promise<void>
) {
  const rows = createRowDecoder(png, consumeRow, checkBudget);
  await decodePngData(png, rows.receive, checkBudget, flush);
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
  const flush = async (force = false) => {
    if (!pendingBytes || (!force && pendingBytes < DEFLATE_BATCH_BYTES)) return;
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
      pending.push(row);
      pendingBytes += row.length;
    },
    flush,
    async finish(): Promise<Uint8Array[] | null> {
      await flush(true);
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

async function recompressFilteredPng(
  png: BrowserPng,
  maxBytes: number,
  checkBudget: CheckBudget
): Promise<Blob[]> {
  const candidate = createNativeCandidate(maxBytes);
  const rowLength = png.width * png.channels + 1;
  const expectedBytes = rowLength * png.height;
  let decodedBytes = 0;
  try {
    await decodePngData(
      png,
      (bytes) => {
        if (bytes.length > expectedBytes - decodedBytes)
          throw new Error('PNG decoded size mismatch.');
        const firstFilter = (rowLength - (decodedBytes % rowLength)) % rowLength;
        for (let index = firstFilter; index < bytes.length; index += rowLength) {
          if (bytes[index]! > 4) throw new Error('Invalid PNG row filter.');
        }
        decodedBytes += bytes.length;
        candidate.push(bytes);
      },
      checkBudget,
      () => candidate.flush()
    );
    if (decodedBytes !== expectedBytes) throw new Error('PNG decoded size mismatch.');
    const compressed = await candidate.finish();
    return compressed ? [assembleOptimizedPng(png, png.channels, compressed)] : [];
  } finally {
    await candidate.dispose();
  }
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
        none.push(row.slice());
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
    typeof CompressionStream !== 'function' ||
    typeof DecompressionStream !== 'function'
  )
    return blob;
  const checkBudget = createBudget(signal);
  try {
    const bytes = new Uint8Array(await blob.arrayBuffer());
    checkBudget();
    const png = readBrowserPng(bytes, MAX_FILTERED_BYTES);
    if (!png) return blob;
    const filteredBytes = (png.width * png.channels + 1) * png.height;
    // Large rasters retain their filters and channels to avoid extra pixel traversals.
    const candidates =
      filteredBytes > MAX_RECONSTRUCTED_BYTES
        ? await recompressFilteredPng(png, blob.size, checkBudget)
        : await encodeCandidates(
            png,
            await resolveOutputChannels(png, checkBudget),
            blob.size,
            checkBudget
          );
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
