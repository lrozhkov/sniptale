import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import { createGuardParser } from '@sniptale/runtime-contracts/messaging/parsers/utils';
import {
  MAX_SAVE_BLOB_BASE64_DECODED_BYTES,
  isBoundedBase64 as isBoundedBase64Value,
  isSafeDownloadFilename,
  isSafeDownloadMimeType,
} from '@sniptale/runtime-contracts/validation/base64';
import {
  createMessageGuard,
  createRuntimeResponseGuard,
  isBoolean,
  isCaptureActionType,
  isImageDataUrl,
  isNumber,
  isString,
} from '../../../validators/index';
import type { PartialRuntimeRegistry } from '../../runtime-message.registry.ts';
import type { StagePopupExportArchiveChunkMessage } from '../../types';
import { runtimeActionRecordingSaveMessageContracts } from './save.recording.ts';
import { runtimeActionWebSnapshotSaveMessageContracts } from './save.web-snapshot.ts';
import { isContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
const isPopupExportArchiveChunkBase64 = (value: unknown): value is string =>
  isBoundedBase64Value(value, POPUP_EXPORT_ARCHIVE_MAX_STAGE_CHUNK_BYTES);
const POPUP_EXPORT_ARCHIVE_MAX_SESSION_ID_LENGTH = 128;
const POPUP_EXPORT_ARCHIVE_MAX_STAGE_CHUNKS = 256;
const POPUP_EXPORT_ARCHIVE_MAX_STAGE_CHUNK_BYTES = 512 * 1024;

const POPUP_EXPORT_ARCHIVE_ID_PATTERN = /^[A-Za-z0-9_-]+$/;

function isPopupExportArchiveId(value: unknown): value is string {
  return (
    isString(value) &&
    value.length > 0 &&
    value.length <= POPUP_EXPORT_ARCHIVE_MAX_SESSION_ID_LENGTH &&
    POPUP_EXPORT_ARCHIVE_ID_PATTERN.test(value)
  );
}

function isStageChunkIndex(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value >= 0 &&
    value < POPUP_EXPORT_ARCHIVE_MAX_STAGE_CHUNKS
  );
}

function isStageTotalChunks(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= POPUP_EXPORT_ARCHIVE_MAX_STAGE_CHUNKS
  );
}

function isPopupExportArchiveTotalBytes(value: unknown): value is number {
  return (
    isNumber(value) &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= MAX_SAVE_BLOB_BASE64_DECODED_BYTES
  );
}

const isStagePopupExportArchiveChunkFields = createMessageGuard<
  typeof MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
  StagePopupExportArchiveChunkMessage
>({
  type: MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
  required: {
    archiveSessionId: isPopupExportArchiveId,
    base64: isPopupExportArchiveChunkBase64,
    chunkIndex: isStageChunkIndex,
    stagedArchiveId: isPopupExportArchiveId,
    totalBytes: isPopupExportArchiveTotalBytes,
    totalChunks: isStageTotalChunks,
  },
});

function isStagePopupExportArchiveChunkMessage(
  input: unknown
): input is StagePopupExportArchiveChunkMessage {
  return isStagePopupExportArchiveChunkFields(input) && input.chunkIndex < input.totalChunks;
}

export const runtimeActionSaveMessageContracts = {
  [MessageType.EXECUTE_SAVE]: {
    parseRequest: createGuardParser(
      'runtime EXECUTE_SAVE message',
      createMessageGuard({
        type: MessageType.EXECUTE_SAVE,
        required: { dataUrl: isImageDataUrl, filename: isString },
        optional: {
          actionType: isCaptureActionType,
          contentIntent: isContentPrivilegedActionCapability,
          presetId: isString,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXECUTE_SAVE response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK]: {
    parseRequest: createGuardParser(
      'runtime STAGE_POPUP_EXPORT_ARCHIVE_CHUNK message',
      isStagePopupExportArchiveChunkMessage
    ),
    parseResponse: createGuardParser(
      'runtime STAGE_POPUP_EXPORT_ARCHIVE_CHUNK response',
      createRuntimeResponseGuard({
        optional: { complete: isBoolean, stagedArchiveId: isPopupExportArchiveId },
      })
    ),
  },
  [MessageType.EXPORT_POPUP_SAVE_ARCHIVE]: {
    parseRequest: createGuardParser(
      'runtime EXPORT_POPUP_SAVE_ARCHIVE message',
      createMessageGuard({
        type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
        required: {
          archiveSessionId: isPopupExportArchiveId,
          filename: isSafeDownloadFilename,
          mimeType: isSafeDownloadMimeType,
          stagedArchiveId: isPopupExportArchiveId,
        },
        optional: { presetId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime EXPORT_POPUP_SAVE_ARCHIVE response',
      createRuntimeResponseGuard({ optional: { assetId: isString, result: isString } })
    ),
  },
  [MessageType.RELEASE_POPUP_EXPORT_ARCHIVE]: {
    parseRequest: createGuardParser(
      'runtime RELEASE_POPUP_EXPORT_ARCHIVE message',
      createMessageGuard({
        type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
        required: {
          archiveSessionId: isPopupExportArchiveId,
          stagedArchiveId: isPopupExportArchiveId,
        },
      })
    ),
    parseResponse: createGuardParser(
      'runtime RELEASE_POPUP_EXPORT_ARCHIVE response',
      createRuntimeResponseGuard({ optional: { result: isString } })
    ),
  },
  [MessageType.SAVE_SCREENSHOT_TO_GALLERY]: {
    parseRequest: createGuardParser(
      'runtime SAVE_SCREENSHOT_TO_GALLERY message',
      createMessageGuard({
        type: MessageType.SAVE_SCREENSHOT_TO_GALLERY,
        required: { dataUrl: isImageDataUrl, filename: isString },
        optional: { contentIntent: isContentPrivilegedActionCapability },
      })
    ),
    parseResponse: createGuardParser(
      'runtime SAVE_SCREENSHOT_TO_GALLERY response',
      createRuntimeResponseGuard({ optional: { assetId: isString } })
    ),
  },
  ...runtimeActionWebSnapshotSaveMessageContracts,
  ...runtimeActionRecordingSaveMessageContracts,
  [MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY]: {
    parseRequest: createGuardParser(
      'runtime REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY message',
      createMessageGuard({
        type: MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY,
        required: { assetId: isString, editorSessionId: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY response',
      createRuntimeResponseGuard({ optional: { updateCapabilityToken: isString } })
    ),
  },
  [MessageType.UPDATE_GALLERY_IMAGE_ASSET]: {
    parseRequest: createGuardParser(
      'runtime UPDATE_GALLERY_IMAGE_ASSET message',
      createMessageGuard({
        type: MessageType.UPDATE_GALLERY_IMAGE_ASSET,
        required: {
          assetId: isString,
          dataUrl: isImageDataUrl,
          editorSessionId: isString,
          updateCapabilityToken: isString,
        },
        optional: { filename: isString },
      })
    ),
    parseResponse: createGuardParser(
      'runtime UPDATE_GALLERY_IMAGE_ASSET response',
      createRuntimeResponseGuard({ optional: { assetId: isString } })
    ),
  },
} satisfies PartialRuntimeRegistry;
