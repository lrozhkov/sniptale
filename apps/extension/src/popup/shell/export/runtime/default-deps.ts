import { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type { RuntimeResponseByType } from '../../../../contracts/messaging/contracts/runtime-message';
import type { TabResponseByType } from '../../../../contracts/messaging/tab';
import { sendRuntimeMessage } from '../../../../platform/runtime-messaging';
import { loadSettings } from '../../../../composition/persistence/settings';
import { MAX_SAVE_BLOB_BASE64_DECODED_BYTES } from '@sniptale/runtime-contracts/validation/base64';
import { getActiveTabId } from '../../tab-access';
import { requestPopupExportPreview } from './preview-request';
import { sendPopupExportTabMessage } from './tab-message-routing';
import type { PopupExportRuntimeDeps } from './types';
type PopupExportBuildPackageResponse = TabResponseByType[MessageType.EXPORT_POPUP_BUILD_PACKAGE];
type PopupExportSaveWebSnapshotResponse =
  TabResponseByType[typeof MessageType.EXPORT_POPUP_SAVE_WEB_SNAPSHOT];
type PopupExportStageArchiveResponse =
  RuntimeResponseByType[typeof MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK];
type PopupExportStartResponse = TabResponseByType[MessageType.EXPORT_POPUP_START];
type PopupExportCancelResponse = TabResponseByType[MessageType.EXPORT_POPUP_CANCEL];

const POPUP_EXPORT_ARCHIVE_STAGE_CHUNK_BYTES = 512 * 1024;

type PopupExportStagedArchive = {
  archiveSessionId: string;
  stagedArchiveId: string;
};

function readBlobSliceAsBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : '';
      resolve(dataUrl.includes(',') ? dataUrl.slice(dataUrl.indexOf(',') + 1) : '');
    };
    reader.onerror = () =>
      reject(reader.error ?? new Error('Failed to read export archive chunk.'));
    reader.readAsDataURL(blob);
  });
}

function assertPopupExportArchiveBlob(blob: Blob): void {
  if (blob.size <= 0) {
    throw new Error('Export archive is empty.');
  }

  if (blob.size > MAX_SAVE_BLOB_BASE64_DECODED_BYTES) {
    throw new Error('Export archive is too large.');
  }
}

function createPopupExportStagedArchive(): PopupExportStagedArchive {
  return {
    archiveSessionId: crypto.randomUUID(),
    stagedArchiveId: crypto.randomUUID(),
  };
}

async function releasePopupExportArchive(stagedArchive: PopupExportStagedArchive): Promise<void> {
  try {
    await sendRuntimeMessage({
      ...stagedArchive,
      type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE,
    });
  } catch {
    // Best-effort cleanup. The staged archive owner also has TTL and restart fail-closed cleanup.
  }
}

function assertPopupExportArchiveStageResponse(
  response: PopupExportStageArchiveResponse,
  stagedArchive: PopupExportStagedArchive,
  isFinalChunk: boolean
): void {
  if (!response?.success) {
    throw new Error(response?.error || 'Failed to stage export archive.');
  }

  if (
    response.stagedArchiveId !== stagedArchive.stagedArchiveId ||
    (isFinalChunk && response.complete !== true)
  ) {
    throw new Error('Failed to stage complete export archive.');
  }
}

async function sendPopupExportArchiveChunk(args: {
  base64: string;
  blobSize: number;
  chunkIndex: number;
  stagedArchive: PopupExportStagedArchive;
  totalChunks: number;
}) {
  return sendRuntimeMessage({
    ...args.stagedArchive,
    base64: args.base64,
    chunkIndex: args.chunkIndex,
    totalBytes: args.blobSize,
    totalChunks: args.totalChunks,
    type: MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK,
  });
}

async function stagePopupExportArchiveBlob(blob: Blob): Promise<PopupExportStagedArchive> {
  assertPopupExportArchiveBlob(blob);

  const stagedArchive = createPopupExportStagedArchive();
  const totalChunks = Math.max(1, Math.ceil(blob.size / POPUP_EXPORT_ARCHIVE_STAGE_CHUNK_BYTES));
  let stageMessageSent = false;

  try {
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
      const start = chunkIndex * POPUP_EXPORT_ARCHIVE_STAGE_CHUNK_BYTES;
      const end = Math.min(start + POPUP_EXPORT_ARCHIVE_STAGE_CHUNK_BYTES, blob.size);
      const base64 = await readBlobSliceAsBase64(blob.slice(start, end));
      stageMessageSent = true;
      const response = await sendPopupExportArchiveChunk({
        base64,
        blobSize: blob.size,
        chunkIndex,
        stagedArchive,
        totalChunks,
      });
      assertPopupExportArchiveStageResponse(
        response,
        stagedArchive,
        chunkIndex === totalChunks - 1
      );
    }
  } catch (error) {
    if (stageMessageSent) {
      await releasePopupExportArchive(stagedArchive);
    }
    throw error;
  }

  return stagedArchive;
}

async function savePopupExportArchiveBlob(blob: Blob, filename: string): Promise<void> {
  const settings = await loadSettings();
  const stagedArchive = await stagePopupExportArchiveBlob(blob);
  const defaultExportPresetId = settings.defaultExportPresetId;
  try {
    const response = await sendRuntimeMessage(
      typeof defaultExportPresetId !== 'string'
        ? {
            type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
            ...stagedArchive,
            mimeType: blob.type || 'application/zip',
            filename,
          }
        : {
            type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE,
            ...stagedArchive,
            mimeType: blob.type || 'application/zip',
            filename,
            presetId: defaultExportPresetId,
          }
    );

    if (!response?.success) {
      throw new Error(response?.error || 'Failed to save export archive.');
    }
  } catch (error) {
    await releasePopupExportArchive(stagedArchive);
    throw error;
  }
}

export function getDefaultPopupExportRuntimeDeps(): PopupExportRuntimeDeps {
  return {
    clearTimeout: (timeoutId) => window.clearTimeout(timeoutId),
    createRequestId: () => crypto.randomUUID(),
    getActiveTabId: getActiveTabId as PopupExportRuntimeDeps['getActiveTabId'],
    requestPreview: async (tabId, fallbackKey) => requestPopupExportPreview(tabId, fallbackKey),
    saveArchiveBlob: savePopupExportArchiveBlob,
    scheduleTimeout: (callback, delayMs) => window.setTimeout(callback, delayMs),
    sendBuildPackageMessage: (tabId, message) =>
      sendPopupExportTabMessage(tabId, message) as Promise<PopupExportBuildPackageResponse>,
    sendSaveWebSnapshotMessage: (tabId, message) =>
      sendPopupExportTabMessage(tabId, message) as Promise<PopupExportSaveWebSnapshotResponse>,
    sendCancelMessage: (tabId) =>
      sendPopupExportTabMessage(tabId, {
        type: MessageType.EXPORT_POPUP_CANCEL,
      }) as Promise<PopupExportCancelResponse>,
    sendStartMessage: (tabId, message) =>
      sendPopupExportTabMessage(tabId, message) as Promise<PopupExportStartResponse>,
    writeClipboardText: (text: string) => globalThis.navigator.clipboard.writeText(text),
  };
}
