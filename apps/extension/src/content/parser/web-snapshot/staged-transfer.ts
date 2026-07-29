import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { WebSnapshotStagedBlobKind } from '@sniptale/runtime-contracts/web-snapshot';

const STAGE_CHUNK_BYTES = 512 * 1024;

function throwIfStagingAborted(signal?: AbortSignal | undefined): void {
  if (!signal?.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new Error('Web snapshot save was cancelled');
}

function readBlobSliceAsBase64(blob: Blob, abortSignal?: AbortSignal | undefined): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    const abort = () => {
      reader.abort();
      reject(
        abortSignal?.reason instanceof Error
          ? abortSignal.reason
          : new Error('Web snapshot save was cancelled')
      );
    };
    if (abortSignal?.aborted) {
      abort();
      return;
    }
    abortSignal?.addEventListener('abort', abort, { once: true });
    reader.onerror = () => reject(new Error('Failed to read snapshot blob chunk.'));
    reader.onload = () => {
      abortSignal?.removeEventListener('abort', abort);
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function stageWebSnapshotBlobForGallery(args: {
  abortSignal?: AbortSignal | undefined;
  blob: Blob;
  blobKind: WebSnapshotStagedBlobKind;
  snapshotSessionId: string;
}): Promise<string> {
  const stagedBlobId = crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(args.blob.size / STAGE_CHUNK_BYTES));

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    throwIfStagingAborted(args.abortSignal);
    const start = chunkIndex * STAGE_CHUNK_BYTES;
    const end = Math.min(start + STAGE_CHUNK_BYTES, args.blob.size);
    const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
      base64: await readBlobSliceAsBase64(args.blob.slice(start, end), args.abortSignal),
      blobKind: args.blobKind,
      chunkIndex,
      snapshotSessionId: args.snapshotSessionId,
      stagedBlobId,
      totalBytes: args.blob.size,
      totalChunks,
      type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
    });
    throwIfStagingAborted(args.abortSignal);

    if (!response.success) {
      throw new Error(response.error || 'Failed to stage web snapshot payload.');
    }
  }

  return stagedBlobId;
}
