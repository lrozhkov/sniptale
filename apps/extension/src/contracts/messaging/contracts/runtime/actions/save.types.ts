import type { MessageType } from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  RecordingDownloadStagedRef,
  RecordingDownloadStagePayload,
} from '@sniptale/runtime-contracts/messaging/recording-download';
import type {
  WebSnapshotSaveToGalleryPayload,
  WebSnapshotStageBlobChunkPayload,
} from '@sniptale/runtime-contracts/web-snapshot';
import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { ContentPrivilegedActionCapability } from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type {
  ExecuteSaveMessage,
  ReleasePopupExportArchiveMessage,
  SavePopupExportArchiveMessage,
  SaveScreenshotToGalleryMessage,
  StagePopupExportArchiveChunkMessage,
  UpdateGalleryImageAssetMessage,
} from '../../types';
import type { SaveAssetResponse } from '../../response-types';

type SaveRecordingForDownloadMessage = {
  type: MessageType.SAVE_RECORDING_FOR_DOWNLOAD;
  contentIntent?: ContentPrivilegedActionCapability;
  filename: string;
  mimeType: string;
} & RecordingDownloadStagedRef;

type StageRecordingDownloadChunkMessage = {
  type: MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK;
  contentIntent?: ContentPrivilegedActionCapability;
} & RecordingDownloadStagePayload;

type ReleaseRecordingDownloadMessage = {
  type: MessageType.RELEASE_RECORDING_DOWNLOAD;
  contentIntent?: ContentPrivilegedActionCapability;
} & RecordingDownloadStagedRef;

type SaveWebSnapshotToGalleryMessage = {
  type: MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY;
} & WebSnapshotSaveToGalleryPayload;

type RegisterWebSnapshotAssetsMessage = {
  type: MessageType.REGISTER_WEB_SNAPSHOT_ASSETS;
  assetUrls: string[];
  requestId: string;
};

type FetchWebSnapshotAssetMessage = {
  type: MessageType.FETCH_WEB_SNAPSHOT_ASSET;
  snapshotSessionId: string;
  url: string;
};

type StageWebSnapshotBlobChunkMessage = {
  type: MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK;
} & WebSnapshotStageBlobChunkPayload;

type StageWebSnapshotBlobChunkResponse = RuntimeMessageResponse<{
  complete?: boolean;
  stagedBlobId?: string;
}>;

type RequestGalleryImageUpdateCapabilityMessage = {
  type: MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY;
  assetId: string;
  editorSessionId: string;
};

type RequestGalleryImageUpdateCapabilityResponse = RuntimeMessageResponse<{
  updateCapabilityToken?: string;
}>;

type RegisterWebSnapshotAssetsResponse = RuntimeMessageResponse<{
  snapshotSessionId?: string;
}>;

type FetchWebSnapshotAssetResponse = RuntimeMessageResponse<{
  base64?: string;
  mimeType?: string;
}>;

type SaveRecordingForDownloadResponse = RuntimeMessageResponse<{
  downloadId?: number;
  recordingId?: string;
}>;

type StageRecordingDownloadChunkResponse = RuntimeMessageResponse<{
  complete?: boolean;
  stagedRecordingId?: string;
}>;

type StagePopupExportArchiveChunkResponse = RuntimeMessageResponse<{
  complete?: boolean;
  stagedArchiveId?: string;
}>;

type SavePopupExportArchiveResponse = RuntimeMessageResponse<{
  assetId?: string;
  result?: string;
}>;

export type RuntimeActionSaveRequestByType = {
  [MessageType.EXECUTE_SAVE]: ExecuteSaveMessage;
  [MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK]: StagePopupExportArchiveChunkMessage;
  [MessageType.EXPORT_POPUP_SAVE_ARCHIVE]: SavePopupExportArchiveMessage;
  [MessageType.RELEASE_POPUP_EXPORT_ARCHIVE]: ReleasePopupExportArchiveMessage;
  [MessageType.SAVE_SCREENSHOT_TO_GALLERY]: SaveScreenshotToGalleryMessage;
  [MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY]: SaveWebSnapshotToGalleryMessage;
  [MessageType.REGISTER_WEB_SNAPSHOT_ASSETS]: RegisterWebSnapshotAssetsMessage;
  [MessageType.FETCH_WEB_SNAPSHOT_ASSET]: FetchWebSnapshotAssetMessage;
  [MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK]: StageWebSnapshotBlobChunkMessage;
  [MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY]: RequestGalleryImageUpdateCapabilityMessage;
  [MessageType.UPDATE_GALLERY_IMAGE_ASSET]: UpdateGalleryImageAssetMessage;
  [MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK]: StageRecordingDownloadChunkMessage;
  [MessageType.SAVE_RECORDING_FOR_DOWNLOAD]: SaveRecordingForDownloadMessage;
  [MessageType.RELEASE_RECORDING_DOWNLOAD]: ReleaseRecordingDownloadMessage;
};

export type RuntimeActionSaveResponseByType = {
  [MessageType.EXECUTE_SAVE]: RuntimeMessageResponse<Record<string, never>>;
  [MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK]: StagePopupExportArchiveChunkResponse;
  [MessageType.EXPORT_POPUP_SAVE_ARCHIVE]: SavePopupExportArchiveResponse;
  [MessageType.RELEASE_POPUP_EXPORT_ARCHIVE]: RuntimeMessageResponse<{ result?: string }>;
  [MessageType.SAVE_SCREENSHOT_TO_GALLERY]: SaveAssetResponse;
  [MessageType.SAVE_WEB_SNAPSHOT_TO_GALLERY]: SaveAssetResponse;
  [MessageType.REGISTER_WEB_SNAPSHOT_ASSETS]: RegisterWebSnapshotAssetsResponse;
  [MessageType.FETCH_WEB_SNAPSHOT_ASSET]: FetchWebSnapshotAssetResponse;
  [MessageType.STAGE_WEB_SNAPSHOT_BLOB_CHUNK]: StageWebSnapshotBlobChunkResponse;
  [MessageType.REQUEST_GALLERY_IMAGE_UPDATE_CAPABILITY]: RequestGalleryImageUpdateCapabilityResponse;
  [MessageType.UPDATE_GALLERY_IMAGE_ASSET]: SaveAssetResponse;
  [MessageType.STAGE_RECORDING_DOWNLOAD_CHUNK]: StageRecordingDownloadChunkResponse;
  [MessageType.SAVE_RECORDING_FOR_DOWNLOAD]: SaveRecordingForDownloadResponse;
  [MessageType.RELEASE_RECORDING_DOWNLOAD]: RuntimeMessageResponse<{ result?: string }>;
};
