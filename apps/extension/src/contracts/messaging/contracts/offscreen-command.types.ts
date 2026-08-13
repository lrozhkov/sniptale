import type {
  CaptureMode,
  VideoRecordingSettings,
  ViewportInfo,
} from '@sniptale/runtime-contracts/video/types/types';
import type { VideoProjectExportSettings } from '../../../features/video/project/types';
import type { VideoMessageType } from '@sniptale/runtime-contracts/video/messages';

type RuntimeOffscreenCommandCapability = {
  capabilityToken: string;
};

type Size2dPayload = {
  width: number;
  height: number;
};

type ViewportRegionPayload = Size2dPayload & {
  x: number;
  y: number;
};

export type RuntimeOffscreenStartRecordingMessage = RuntimeOffscreenCommandCapability & {
  type: VideoMessageType.OFFSCREEN_START_RECORDING;
  streamId: string;
  settings: VideoRecordingSettings;
  tabId?: number;
  viewport?: ViewportInfo;
  recordingId: string;
  captureMode?: CaptureMode;
  cropRegion?: ViewportRegionPayload;
  generation: number;
  streamInstanceId: string;
  surface?: {
    presetId: string;
    target: 'window';
    width: number;
    height: number;
  };
};

export type RuntimeOffscreenStopRecordingMessage = RuntimeOffscreenCommandCapability & {
  type: VideoMessageType.OFFSCREEN_STOP_RECORDING;
  discard?: boolean;
  recordingId: string;
  generation: number;
  streamInstanceId: string;
};

export type RuntimeOffscreenBeginRecordingMessage = RuntimeOffscreenCommandCapability & {
  type: VideoMessageType.OFFSCREEN_BEGIN_RECORDING;
  recordingId: string;
  generation: number;
  streamInstanceId: string;
};

export type RuntimeOffscreenUpdateSettingsMessage = RuntimeOffscreenCommandCapability & {
  type: VideoMessageType.OFFSCREEN_UPDATE_SETTINGS;
  recordingId: string;
  generation: number;
  streamInstanceId: string;
  settings: Partial<VideoRecordingSettings>;
};

export type RuntimeGetDesktopMediaMessage = RuntimeOffscreenCommandCapability & {
  type: VideoMessageType.GET_DESKTOP_MEDIA;
  captureMode: CaptureMode;
  desktopMediaRequestGeneration: string;
  desktopMediaRequestId: string;
  controlledCursorCaptureEnabled?: boolean;
  desktopLabel?: string;
  desktopStreamId?: string;
  sourceIndex?: number;
  sourceCount?: number;
};

export type RuntimeDisposeDesktopMediaMessage = RuntimeOffscreenCommandCapability & {
  type: VideoMessageType.DISPOSE_DESKTOP_MEDIA;
};

export type RuntimeOffscreenGetProjectExportCapabilitiesMessage =
  RuntimeOffscreenCommandCapability & {
    type: typeof VideoMessageType.OFFSCREEN_GET_PROJECT_EXPORT_CAPABILITIES;
    settings: VideoProjectExportSettings;
  };
