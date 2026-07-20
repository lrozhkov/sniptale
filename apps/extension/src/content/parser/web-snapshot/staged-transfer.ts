import { getContentRuntimeServices } from '../../platform/runtime-services/services';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { WebSnapshotStagedBlobKind } from '@sniptale/runtime-contracts/web-snapshot';

const STAGE_CHUNK_BYTES = 512 * 1024;

function readBlobSliceAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Failed to read snapshot blob chunk.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

export async function stageWebSnapshotBlobForGallery(args: {
  blob: Blob;
  blobKind: WebSnapshotStagedBlobKind;
  snapshotSessionId: string;
}): Promise<string> {
  const stagedBlobId = crypto.randomUUID();
  const totalChunks = Math.max(1, Math.ceil(args.blob.size / STAGE_CHUNK_BYTES));

  for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
    const start = chunkIndex * STAGE_CHUNK_BYTES;
    const end = Math.min(start + STAGE_CHUNK_BYTES, args.blob.size);
    const response = await getContentRuntimeServices().messaging.sendRuntimeMessage({
      base64: await readBlobSliceAsBase64(args.blob.slice(start, end)),
      blobKind: args.blobKind,
      chunkIndex,
      snapshotSessionId: args.snapshotSessionId,
      stagedBlobId,
      totalBytes: args.blob.size,
      totalChunks,
      type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK,
    });

    if (!response.success) {
      throw new Error(response.error || 'Failed to stage web snapshot payload.');
    }
  }

  return stagedBlobId;
}
