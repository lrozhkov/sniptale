import type { ExportProgress, PopupExportResult } from '@sniptale/runtime-contracts/export';
import type { CaptureActionType } from '../../settings';
import type {
  CaptureMessageType,
  MessageType,
} from '@sniptale/runtime-contracts/messaging/message-types';
import type {
  ContentPrivilegedActionAutoStartGrant,
  ContentPrivilegedActionCapability,
} from '@sniptale/runtime-contracts/protocol/content-privileged-action';
import type {
  RegionCaptureControlMessageType,
  VideoMessageType,
} from '@sniptale/runtime-contracts/video/messages';
import type {
  VideoExportCapabilities,
  VideoProjectExportSettings,
  VideoProjectExportStatus,
} from '../../../features/video/project/types';
import type {
  VideoRecordingRuntimeState,
  VideoRecordingSettings,
} from '@sniptale/runtime-contracts/video/types/types';
import type { ProjectExportInputReference } from '../../video/types/project-export-input';

export type {
  RuntimeOffscreenErrorMessage,
  RuntimeOffscreenRecordingPausedMessage,
  RuntimeOffscreenRecordingResumedMessage,
  RuntimeOffscreenRecordingStartedMessage,
  RuntimeOffscreenRecordingStoppedMessage,
  RuntimeRecordingDurationUpdatedMessage,
} from './video-recording-lifecycle.types.ts';

export type MessageTypeWithString =
  | MessageType
  | CaptureMessageType
  | VideoMessageType
  | 'AREA_SELECTED'
  | 'KEEP_ALIVE'
  | 'REGION_CAPTURE_ERROR'
  | 'REGION_CAPTURE_STARTED'
  | 'REGION_CAPTURE_STOPPED'
  | typeof RegionCaptureControlMessageType.CHECK_SUPPORT
  | typeof RegionCaptureControlMessageType.START
  | typeof RegionCaptureControlMessageType.STOP;

export type ShowToastPayload = {
  type?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  message?: string;
};

export type Size2d = {
  width: number;
  height: number;
};

export type ViewportRegion = Size2d & {
  x: number;
  y: number;
};

export type ViewportCoordsPayload = ViewportRegion & {
  outerWidth: number;
  outerHeight: number;
};

export type ExecuteSaveMessage = {
  type: MessageType.EXECUTE_SAVE;
  dataUrl: string;
  filename: string;
  actionType?: CaptureActionType;
  contentIntent?: ContentPrivilegedActionCapability;
  presetId?: string;
};

export type SavePopupExportArchiveMessage = {
  type: MessageType.EXPORT_POPUP_SAVE_ARCHIVE;
  archiveSessionId: string;
  filename: string;
  mimeType: string;
  presetId?: string;
  stagedArchiveId: string;
};

export type StagePopupExportArchiveChunkMessage = {
  type: MessageType.STAGE_POPUP_EXPORT_ARCHIVE_CHUNK;
  archiveSessionId: string;
  base64: string;
  chunkIndex: number;
  stagedArchiveId: string;
  totalBytes: number;
  totalChunks: number;
};

export type ReleasePopupExportArchiveMessage = {
  type: MessageType.RELEASE_POPUP_EXPORT_ARCHIVE;
  archiveSessionId: string;
  stagedArchiveId: string;
};

export type SaveScreenshotToGalleryMessage = {
  type: MessageType.SAVE_SCREENSHOT_TO_GALLERY;
  dataUrl: string;
  filename: string;
  contentIntent?: ContentPrivilegedActionCapability;
};

export type ContentPrivilegedActionGrantPayload = {
  contentIntentGrant?: ContentPrivilegedActionAutoStartGrant;
};

export type UpdateGalleryImageAssetMessage = {
  type: MessageType.UPDATE_GALLERY_IMAGE_ASSET;
  assetId: string;
  dataUrl: string;
  editorSessionId: string;
  updateCapabilityToken: string;
  filename?: string;
};

export type {
  ScenarioCreateProjectMessage,
  ScenarioDeleteStepMessage,
  ScenarioGetRestoreSnapshotMessage,
  ScenarioGetSessionMessage,
  ScenarioListProjectsMessage,
  ScenarioMoveStepMessage,
  ScenarioOpenEditorMessage,
  ScenarioRecordSuggestedEventMessage,
  ScenarioRestoreStepMessage,
  ScenarioRuntimeCapturePayload,
  ScenarioSaveCaptureStepMessage,
  ScenarioSessionPayload,
  ScenarioSetActiveProjectMessage,
  ScenarioSetCaptureModeMessage,
  ScenarioSetEnabledMessage,
  ScenarioSetSidebarVisibleMessage,
  ScenarioUpdateSessionPrefsMessage,
  ScenarioUpdateSurfaceStateMessage,
} from '../scenario/types';

export type {
  RuntimeDisposeDesktopMediaMessage,
  RuntimeGetDesktopMediaMessage,
  RuntimeOffscreenGetProjectExportCapabilitiesMessage,
  RuntimeOffscreenSetViewportDrawStateMessage,
  RuntimeOffscreenStartRecordingMessage,
  RuntimeOffscreenUpdateSettingsMessage,
  RuntimeOffscreenUpdateViewportCropMessage,
} from './offscreen-command.types.ts';

export type RuntimePopupExportProgressMessage = {
  type: MessageType.EXPORT_POPUP_PROGRESS;
  requestId: string;
  progress: ExportProgress;
};

export type RuntimePopupExportResultMessage = {
  type: MessageType.EXPORT_POPUP_RESULT;
  requestId: string;
  result: PopupExportResult;
};

export type RuntimeDownloadRecordingMessage = {
  type: VideoMessageType.DOWNLOAD_RECORDING;
  recordingId: string;
  filename: string;
  url?: never;
};

export type RuntimeDownloadRecordingSidecarMessage = {
  type: VideoMessageType.DOWNLOAD_RECORDING_SIDECAR;
  content: string;
  filename: string;
  mimeType: string;
};

export type RuntimeVideoSavedToIdbMessage = {
  type: VideoMessageType.VIDEO_SAVED_TO_IDB;
  recordingId: string;
  filename?: string;
  projectId?: string;
};

export type RuntimeAreaSelectedMessage = {
  type: 'AREA_SELECTED';
  area: ViewportRegion;
};

export type RuntimeRegionCaptureStartedMessage = {
  type: 'REGION_CAPTURE_STARTED';
};

export type RuntimeRegionCaptureErrorMessage = {
  type: 'REGION_CAPTURE_ERROR';
  error: string;
};

export type RuntimeRegionCaptureStoppedMessage = {
  type: 'REGION_CAPTURE_STOPPED';
};

export type RuntimeRecordingStateSyncMessage = {
  type: VideoMessageType.RECORDING_STATE_SYNC;
  state: VideoRecordingRuntimeState;
};

export type RuntimeRecordingStartFailedMessage = {
  type: VideoMessageType.RECORDING_START_FAILED;
  error?: string;
};

export type RuntimeDesktopMediaObtainedMessage = {
  type: VideoMessageType.DESKTOP_MEDIA_OBTAINED;
  desktopMediaRequestGeneration: string;
  desktopMediaRequestId: string;
  label: string;
  sourceIndex?: number;
  sourceCount?: number;
};

export type RuntimeDiagnosticEventMessage = {
  type: VideoMessageType.DIAGNOSTIC_EVENT_FROM_CS;
  recordingId?: string;
  level?: string;
  event?: string;
  payload?: unknown;
};

export type RuntimeStartProjectExportMessage = {
  type: VideoMessageType.START_PROJECT_EXPORT;
  capabilityToken: string;
  input: ProjectExportInputReference;
  jobId: string;
  settings: VideoProjectExportSettings;
};

export type RuntimeGetProjectExportCapabilitiesMessage = {
  type: typeof VideoMessageType.GET_PROJECT_EXPORT_CAPABILITIES;
  jobId?: string;
  settings: VideoProjectExportSettings;
};

export type RuntimeProjectExportProgressMessage = {
  type: VideoMessageType.PROJECT_EXPORT_PROGRESS;
  jobId: string;
  status: VideoProjectExportStatus;
  targetDocumentId?: string;
  targetSenderUrl?: string;
};

export type RuntimeProjectExportCompletedMessage = {
  type: VideoMessageType.PROJECT_EXPORT_COMPLETED;
  jobId: string;
  projectId: string;
  recordingId: string;
  exportId: string;
  filename: string;
  format: string;
  targetDocumentId?: string;
  targetSenderUrl?: string;
};

export type ProjectExportCapabilitiesPayload = {
  capabilityToken?: string;
  cancelCapabilityToken?: string;
  capabilities?: VideoExportCapabilities;
  ownerDocumentId?: string;
};

type RegionCaptureSettingsPayload = VideoRecordingSettings;
export type StartRegionCaptureMessage = {
  type: typeof RegionCaptureControlMessageType.START;
  settings: RegionCaptureSettingsPayload;
};

export type StopRegionCaptureMessage = {
  type: typeof RegionCaptureControlMessageType.STOP;
};

export type CheckRegionCaptureSupportMessage = {
  type: typeof RegionCaptureControlMessageType.CHECK_SUPPORT;
};

export type RegionCaptureSupportResponse = {
  supported: boolean;
  produceCropTarget: boolean;
  cropTo: boolean;
};
