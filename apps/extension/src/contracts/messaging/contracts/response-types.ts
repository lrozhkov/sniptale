import type { RuntimeMessageResponse } from '@sniptale/runtime-contracts/messaging/contracts/response';
import type { CaptureActionType } from '../../settings';
import type { ProjectExportCapabilitiesPayload } from './types';
import type {
  RecordingTelemetrySignal,
  VideoProjectActionEvent,
  VideoProjectCursorTrack,
} from '../../../features/video/project/types';
import type {
  VideoPostRecordResult,
  VideoRecordingRuntimeState,
  ViewportInfo,
} from '@sniptale/runtime-contracts/video/types/types';
import type { ScenarioSessionPayload, ViewportCoordsPayload } from './types';
import type { AppliedViewportPresetPayload } from '@sniptale/runtime-contracts/messaging/message-types';

export const recordingStateHealthValues = ['healthy', 'degraded', 'failed'] as const;

export type RecordingStateHealth = (typeof recordingStateHealthValues)[number];

export type RecordingStateResponse = RuntimeMessageResponse<{
  controlToken?: string;
  postRecordResult?: VideoPostRecordResult;
  recordingHealth: RecordingStateHealth;
  recordingId?: string;
  state?: VideoRecordingRuntimeState;
}>;

export type RecordingTabResponse = RuntimeMessageResponse<{
  isCurrentTab?: boolean;
  tabId?: number;
}>;

export type ModeStatusResponse = RuntimeMessageResponse<{
  enabled?: boolean;
}>;

export type ScreenshotModeStatusResponse = RuntimeMessageResponse<{
  documentId?: string;
  enabled?: boolean;
  pageZoom?: number;
  supported?: boolean;
  surfaceLeaseGeneration?: number;
  surfaceOperationGeneration?: number;
  surfaceCapabilityToken?: string;
  tabId?: number;
  unsupportedReason?: string | null;
  viewport?: AppliedViewportPresetPayload | null;
}>;

export type CaptureResponse = RuntimeMessageResponse<{
  dataUrl?: string;
  action?: CaptureActionType;
  downscaled?: boolean;
  frozenExtentWarning?: boolean;
}>;

export type SaveAssetResponse = RuntimeMessageResponse<{
  assetId?: string;
}>;

export type ScenarioSessionResponse = RuntimeMessageResponse<
  ScenarioSessionPayload & {
    projectId?: string;
    stepId?: string;
  }
>;

export type HarCaptureResponse = RuntimeMessageResponse<{
  har?: Record<string, unknown>;
  rawDiagnosticsEnabled?: boolean;
}>;

export type HarStartResponse = RuntimeMessageResponse<{
  capabilityToken?: string;
  expiresAtEpochMs?: number;
  result?: string;
}>;

export type PopupTabRouteCapabilityResponse = RuntimeMessageResponse<{
  capabilityToken?: string;
}>;

export type DownloadRecordingResponse = RuntimeMessageResponse<{
  downloadId?: number;
}>;

export type StartProjectExportResponse = RuntimeMessageResponse<{
  capabilityToken?: string;
  jobId?: string;
  ownerDocumentId?: string;
  result?: string;
}>;

export type ProjectExportCapabilitiesResponse =
  RuntimeMessageResponse<ProjectExportCapabilitiesPayload>;

export type ToolbarStatusResponse = RuntimeMessageResponse<{
  screenshotMode?: boolean;
  visible?: boolean;
}>;

export type ViewportCoordsResponse = RuntimeMessageResponse<{
  coords?: ViewportCoordsPayload;
  viewport?: ViewportInfo;
}>;

export type RecordingTelemetrySnapshot = {
  viewport: ViewportInfo | null;
  cursorTrack: VideoProjectCursorTrack | null;
  actionEvents: VideoProjectActionEvent[];
  signals: RecordingTelemetrySignal[];
};

export type RecordingTelemetryResponse = RuntimeMessageResponse<{
  telemetry?: RecordingTelemetrySnapshot;
}>;

export type PopupExportStartResponse = RuntimeMessageResponse<Record<string, never>>;
