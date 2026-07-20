import { awaitBestEffort } from '@sniptale/foundation/best-effort';
import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES,
  type RecordingDownloadStagePayload,
} from '@sniptale/runtime-contracts/messaging/recording-download';
import type { Logger } from '@sniptale/platform/observability/logger/types';
import type { ContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import {
  assertRuntimeSuccess,
  requestRecordingDownloadContentIntent,
  type RecordingDownloadIntentMessage,
  type RuntimeSuccessResponse,
} from './intent';
import { createRecordingDownloadRandomId } from './random-id';

type RecordingDownloadTransferIds = {
  recordingSessionId: string;
  stagedRecordingId: string;
};

type RecordingDownloadWorkflowMessage =
  | RecordingDownloadIntentMessage
  | ({
      contentIntent: ContentPrivilegedActionCapability;
      type: typeof MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK;
    } & RecordingDownloadStagePayload)
  | {
      contentIntent: ContentPrivilegedActionCapability;
      filename: string;
      mimeType: string;
      recordingSessionId: string;
      stagedRecordingId: string;
      type: typeof MessageType.SAVE_RECORDING_FOR_DOWNLOAD;
    }
  | {
      contentIntent: ContentPrivilegedActionCapability;
      recordingSessionId: string;
      stagedRecordingId: string;
      type: typeof MessageType.RELEASE_RECORDING_DOWNLOAD;
    }
  | { type: 'REGION_CAPTURE_STOPPED' };

export type RecordingDownloadSendMessage = (
  message: RecordingDownloadWorkflowMessage
) => Promise<RuntimeSuccessResponse>;

function createRecordingDownloadTransferIds(): RecordingDownloadTransferIds {
  const suffix = createRecordingDownloadRandomId();
  return {
    recordingSessionId: `recording-session-${suffix}`,
    stagedRecordingId: `staged-recording-${suffix}`,
  };
}

function blobSliceToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(reader.error ?? new Error('Failed to read recording blob.'));
    reader.onload = () => {
      const result = String(reader.result ?? '');
      resolve(result.slice(result.indexOf(',') + 1));
    };
    reader.readAsDataURL(blob);
  });
}

async function stageRecordingChunk(args: {
  blob: Blob;
  chunkIndex: number;
  ids: RecordingDownloadTransferIds;
  sendMessage: RecordingDownloadSendMessage;
  totalChunks: number;
}): Promise<void> {
  const start = args.chunkIndex * MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES;
  const end = Math.min(start + MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES, args.blob.size);
  const base64 = await blobSliceToBase64(args.blob.slice(start, end));
  const response = await args.sendMessage({
    type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
    base64,
    chunkIndex: args.chunkIndex,
    contentIntent: await requestRecordingDownloadContentIntent({
      actionType: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
      sendMessage: args.sendMessage,
    }),
    recordingSessionId: args.ids.recordingSessionId,
    stagedRecordingId: args.ids.stagedRecordingId,
    totalBytes: args.blob.size,
    totalChunks: args.totalChunks,
  });
  assertRuntimeSuccess(response, 'Recording download stage failed');
}

async function saveStagedRecordingDownload(args: {
  blob: Blob;
  filename: string;
  ids: RecordingDownloadTransferIds;
  sendMessage: RecordingDownloadSendMessage;
}): Promise<void> {
  const saveResponse = await args.sendMessage({
    type: MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
    contentIntent: await requestRecordingDownloadContentIntent({
      actionType: MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
      sendMessage: args.sendMessage,
    }),
    filename: args.filename,
    mimeType: args.blob.type || 'video/webm',
    recordingSessionId: args.ids.recordingSessionId,
    stagedRecordingId: args.ids.stagedRecordingId,
  });
  assertRuntimeSuccess(saveResponse, 'Recording download save failed');
}

async function releaseStagedRecordingDownload(args: {
  ids: RecordingDownloadTransferIds;
  sendMessage: RecordingDownloadSendMessage;
}): Promise<void> {
  const response = await args.sendMessage({
    type: MessageType.RELEASE_RECORDING_DOWNLOAD,
    contentIntent: await requestRecordingDownloadContentIntent({
      actionType: MessageType.RELEASE_RECORDING_DOWNLOAD,
      sendMessage: args.sendMessage,
    }),
    recordingSessionId: args.ids.recordingSessionId,
    stagedRecordingId: args.ids.stagedRecordingId,
  });
  assertRuntimeSuccess(response, 'Recording download release failed');
}

export async function stageRecordingDownload(args: {
  blob: Blob;
  filename: string;
  logger: Logger;
  sendMessage: RecordingDownloadSendMessage;
}): Promise<void> {
  const ids = createRecordingDownloadTransferIds();
  const totalChunks = Math.ceil(args.blob.size / MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES);

  try {
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      await stageRecordingChunk({ ...args, chunkIndex, ids, totalChunks });
    }
    await saveStagedRecordingDownload({ ...args, ids });
  } catch (error) {
    await awaitBestEffort(
      releaseStagedRecordingDownload({ ids, sendMessage: args.sendMessage }),
      args.logger,
      'Failed to release staged recording download'
    );
    throw error;
  }
}
