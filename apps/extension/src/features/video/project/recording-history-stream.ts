import { sha256 } from '@noble/hashes/sha2.js';

interface FrameBudget {
  totalBlocks: number;
  totalBytes: number;
}

interface FrameConsumer {
  maxBlockBytes: number;
  invalidChunk: string;
  invalidLength: string;
  consume(bytes: Uint8Array, prefix: Uint8Array): Promise<void>;
  finish(complete: boolean): void;
}

/** Holds one bounded frame. Format owners validate records before they stage each payload. */
export function createRecordingHistoryFrameSink(
  budget: FrameBudget,
  consumer: FrameConsumer,
  signal?: AbortSignal
): WritableStream<Uint8Array> {
  const prefix = new Uint8Array(4);
  let prefixUsed = 0;
  let payload: Uint8Array | null = null;
  let payloadUsed = 0;
  let blocks = 0;
  let bytes = 0;
  return new WritableStream<Uint8Array>({
    async write(chunk) {
      signal?.throwIfAborted();
      if (!(chunk instanceof Uint8Array)) throw new Error(consumer.invalidChunk);
      let offset = 0;
      while (offset < chunk.byteLength) {
        signal?.throwIfAborted();
        if (!payload) {
          const count = Math.min(4 - prefixUsed, chunk.byteLength - offset);
          prefix.set(chunk.subarray(offset, offset + count), prefixUsed);
          prefixUsed += count;
          offset += count;
          if (prefixUsed !== 4) continue;
          const length = new DataView(prefix.buffer).getUint32(0, true);
          if (
            length === 0 ||
            length > consumer.maxBlockBytes ||
            blocks >= budget.totalBlocks ||
            length > budget.totalBytes - bytes
          )
            throw new Error(consumer.invalidLength);
          payload = new Uint8Array(length);
        }
        const count = Math.min(payload.byteLength - payloadUsed, chunk.byteLength - offset);
        payload.set(chunk.subarray(offset, offset + count), payloadUsed);
        payloadUsed += count;
        offset += count;
        if (payloadUsed === payload.byteLength) {
          await consumer.consume(payload, prefix);
          blocks += 1;
          bytes += payload.byteLength;
          payload = null;
          payloadUsed = 0;
          prefixUsed = 0;
        }
      }
    },
    close() {
      signal?.throwIfAborted();
      consumer.finish(
        prefixUsed === 0 &&
          payload === null &&
          blocks === budget.totalBlocks &&
          bytes === budget.totalBytes
      );
    },
  });
}

interface FrameSource {
  readBlock(sequence: number): Promise<Uint8Array>;
  beforeClose?(): Promise<void>;
}

/** Copies frozen framing through its format validator and preserves downstream backpressure. */
export function createRecordingHistoryFrameSource(
  budget: FrameBudget,
  source: FrameSource,
  createValidator: (
    consume: (bytes: Uint8Array) => Promise<void>,
    signal?: AbortSignal
  ) => WritableStream<Uint8Array>,
  invalidSize: string
): {
  size: number;
  pipeTo(sink: WritableStream<Uint8Array>, signal?: AbortSignal): Promise<void>;
} {
  const size = budget.totalBytes + budget.totalBlocks * 4;
  if (!Number.isSafeInteger(size)) throw new Error(invalidSize);
  const readBlock = source.readBlock;
  const beforeClose = source.beforeClose;
  return {
    size,
    async pipeTo(sink, signal) {
      signal?.throwIfAborted();
      const target = sink.getWriter();
      const input = createValidator(async (bytes) => {
        const prefix = new Uint8Array(4);
        new DataView(prefix.buffer).setUint32(0, bytes.byteLength, true);
        await target.write(prefix);
        await target.write(bytes);
      }, signal).getWriter();
      try {
        for (let sequence = 0; sequence < budget.totalBlocks; sequence += 1) {
          signal?.throwIfAborted();
          const bytes = await readBlock(sequence);
          signal?.throwIfAborted();
          const prefix = new Uint8Array(4);
          new DataView(prefix.buffer).setUint32(0, bytes.byteLength, true);
          await input.write(prefix);
          await input.write(bytes);
        }
        await input.close();
        await beforeClose?.();
        signal?.throwIfAborted();
        await target.close();
      } catch (error) {
        await input.abort(error).catch(() => undefined);
        await target.abort(error).catch(() => undefined);
        throw error;
      } finally {
        input.releaseLock();
        target.releaseLock();
      }
    },
  };
}

/** Hashes the original frame bytes and checks common manifest budgets before staging. */
export function createRecordingHistoryIntegrity(
  budget: FrameBudget & { totalRecords: number; streamSha256: string },
  invalidBudget: string
) {
  const digest = sha256.create();
  let blocks = 0;
  let records = 0;
  let bytes = 0;
  const hex = (value: Uint8Array): string =>
    Array.from(value, (byte) => byte.toString(16).padStart(2, '0')).join('');
  return {
    append(payload: Uint8Array, prefix: Uint8Array, recordCount: number) {
      blocks += 1;
      records += recordCount;
      bytes += payload.byteLength;
      if (blocks > budget.totalBlocks || records > budget.totalRecords || bytes > budget.totalBytes)
        throw new Error(invalidBudget);
      digest.update(prefix).update(payload);
      return {
        blockSha256: hex(sha256(payload)),
        prefixSha256: hex(digest.clone().digest()),
      };
    },
    complete(): boolean {
      return (
        blocks === budget.totalBlocks &&
        records === budget.totalRecords &&
        bytes === budget.totalBytes &&
        hex(digest.digest()) === budget.streamSha256
      );
    },
  };
}
