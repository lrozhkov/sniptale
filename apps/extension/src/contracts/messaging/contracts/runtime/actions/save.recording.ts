import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import {
  MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES,
  MAX_RECORDING_DOWNLOAD_STAGE_CHUNKS,
  isRecordingDownloadStageId,
  type RecordingDownloadStagePayload,
} from '@sniptale/runtime-contracts/messaging/recording-download';
import { isContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import {
  MAX_RECORDING_BASE64_DECODED_BYTES,
  isBoundedBase64 as isBoundedBase64Value,
  isSafeDownloadFilename,
  isSafeDownloadMimeType,
} from '@sniptale/runtime-contracts/validation/base64';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isNumber,
  isString,
} from '../../../validators/index';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';

const isRecordingDownloadStageChunkBase64 = (value: unknown): value is string =>
  isBoundedBase64Value(value, MAX_RECORDING_DOWNLOAD_STAGE_CHUNK_BYTES);

function isRecordingStageChunkIndex(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < MAX_RECORDING_DOWNLOAD_STAGE_CHUNKS
  );
}

function isRecordingStageTotalChunks(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_RECORDING_DOWNLOAD_STAGE_CHUNKS
  );
}

function isRecordingStageTotalBytes(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_RECORDING_BASE64_DECODED_BYTES
  );
}

const isStageRecordingDownloadChunkFields = createMessageGuard<
  typeof MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
  { type: typeof MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK } & RecordingDownloadStagePayload
>({
  type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK,
  required: {
    base64: isRecordingDownloadStageChunkBase64,
    chunkIndex: isRecordingStageChunkIndex,
    recordingSessionId: isRecordingDownloadStageId,
    stagedRecordingId: isRecordingDownloadStageId,
    totalBytes: isRecordingStageTotalBytes,
    totalChunks: isRecordingStageTotalChunks,
  },
  optional: { contentIntent: isContentPrivilegedActionCapability },
});

function isStageRecordingDownloadChunkMessage(input: unknown): input is {
  type: typeof MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK;
} & RecordingDownloadStagePayload {
  return isStageRecordingDownloadChunkFields(input) && input.chunkIndex < input.totalChunks;
}

export const runtimeActionRecordingSaveMessageContracts = {
  [MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK]: {
    parseRequest: createGuardParser(
      'runtime STAGE_RECORDING_DOWNLOAD_CHUNK message',
      isStageRecordingDownloadChunkMessage
    ),
    parseResponse: createGuardParser(
      'runtime STAGE_RECORDING_DOWNLOAD_CHUNK response',
      createRuntimeResponseGuard({
        optional: { complete: isBoolean, stagedRecordingId: isRecordingDownloadStageId },
      })
    ),
  },
  [MessageType.SAVE_RECORDING_FOR_DOWNLOAD]: {
    parseRequest: createGuardParser(
      'runtime SAVE_RECORDING_FOR_DOWNLOAD message',
      createMessageGuard({
        type: MessageType.SAVE_RECORDING_FOR_DOWNLOAD,
        required: {
          filename: isSafeDownloadFilename,
          mimeType: isSafeDownloadMimeType,
          recordingSessionId: isRecordingDownloadStageId,
          stagedRecordingId: isRecordingDownloadStageId,
        },
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
    parseResponse: createGuardParser(
      'runtime SAVE_RECORDING_FOR_DOWNLOAD response',
      createRuntimeResponseGuard({
        optional: { downloadId: isNumber, recordingId: isString, result: isString },
      })
    ),
  },
  [MessageType.RELEASE_RECORDING_DOWNLOAD]: {
    parseRequest: createGuardParser(
      'runtime RELEASE_RECORDING_DOWNLOAD message',
      createMessageGuard({
        type: MessageType.RELEASE_RECORDING_DOWNLOAD,
        required: {
          recordingSessionId: isRecordingDownloadStageId,
          stagedRecordingId: isRecordingDownloadStageId,
        },
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
    parseResponse: createGuardParser(
      'runtime RELEASE_RECORDING_DOWNLOAD response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
} satisfies PartialRuntimeRegistry;
