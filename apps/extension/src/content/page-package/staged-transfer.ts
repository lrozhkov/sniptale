import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { ExportSink } from '../../composition/archive-transfer/contracts';
import { getContentRuntimeServices } from '../platform/runtime-services/services';

const STAGE_CHUNK_BYTES = 512 * 1024;

function abortError(signal?: AbortSignal): Error {
  return signal?.reason instanceof Error
    ? signal.reason
    : new DOMException('Page Package staging was cancelled.', 'AbortError');
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) throw abortError(signal);
}

async function bytesToBase64(bytes: Uint8Array, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);
  const copy = new Uint8Array(new ArrayBuffer(bytes.byteLength));
  copy.set(bytes);
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => {
      reader.abort();
      reject(abortError(signal));
    };
    signal?.addEventListener('abort', abort, { once: true });
    reader.onerror = () => reject(reader.error ?? new Error('Page Package chunk read failed.'));
    reader.onload = () => resolve(String(reader.result));
    reader.onloadend = () => signal?.removeEventListener('abort', abort);
    reader.readAsDataURL(new Blob([copy]));
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

/** Streams one archive through bounded messages into the active background job. */
export function createPagePackageJobStagedSink(args: {
  jobId: string;
  ordinal: number;
  signal?: AbortSignal | undefined;
}): { sink: ExportSink; stagedBlobId: string } {
  const stagedBlobId = crypto.randomUUID();
  let buffer = new Uint8Array(STAGE_CHUNK_BYTES);
  let bufferedBytes = 0;
  let pendingFullChunk: Uint8Array | null = null;
  let sequence = 0;
  let state: 'aborted' | 'closed' | 'closing' | 'open' = 'open';

  const send = async (bytes: Uint8Array, final: boolean): Promise<void> => {
    throwIfAborted(args.signal);
    const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
      base64: await bytesToBase64(bytes, args.signal),
      final,
      jobId: args.jobId,
      ordinal: args.ordinal,
      sequence,
      stagedBlobId,
      type: MessageType.STAGE_PAGE_PACKAGE_JOB_CHUNK,
    });
    throwIfAborted(args.signal);
    if (
      response.success !== true ||
      response.complete !== final ||
      response.stagedBlobId !== stagedBlobId
    ) {
      throw new Error(response.error || 'Background rejected the Page Package stage chunk.');
    }
    sequence += 1;
  };

  const write = async (chunk: Uint8Array): Promise<void> => {
    if (state !== 'open') throw new Error(`Page Package staged sink is ${state}.`);
    throwIfAborted(args.signal);
    let offset = 0;
    while (offset < chunk.byteLength) {
      const count = Math.min(STAGE_CHUNK_BYTES - bufferedBytes, chunk.byteLength - offset);
      buffer.set(chunk.subarray(offset, offset + count), bufferedBytes);
      bufferedBytes += count;
      offset += count;
      if (bufferedBytes === STAGE_CHUNK_BYTES) {
        if (pendingFullChunk) await send(pendingFullChunk, false);
        pendingFullChunk = buffer;
        buffer = new Uint8Array(STAGE_CHUNK_BYTES);
        bufferedBytes = 0;
      }
    }
  };

  const close = async (): Promise<void> => {
    if (state === 'closed') return;
    if (state !== 'open') throw new Error(`Page Package staged sink is ${state}.`);
    if (!pendingFullChunk && bufferedBytes === 0) {
      throw new Error('Page Package staged archive must not be empty.');
    }
    state = 'closing';
    if (bufferedBytes > 0) {
      if (pendingFullChunk) await send(pendingFullChunk, false);
      await send(buffer.slice(0, bufferedBytes), true);
    } else if (pendingFullChunk) {
      await send(pendingFullChunk, true);
    }
    state = 'closed';
  };

  const abort = async (): Promise<void> => {
    if (state === 'closed' || state === 'aborted') return;
    state = 'aborted';
  };

  return {
    stagedBlobId,
    sink: {
      writable: new WritableStream<Uint8Array>({ abort, close, write }),
      abort,
      close,
    },
  };
}
