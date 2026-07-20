import type {
  NativeCaptureMode,
  NativeRecordingMode,
} from '@sniptale/runtime-contracts/native-app/platform-types';
import type {
  NativeEffectiveQualitySettings,
  NativeRequestedQualitySettings,
} from '@sniptale/runtime-contracts/native-app/settings-types';
import type { NativeRejectReason } from '@sniptale/runtime-contracts/native-app/status-types';
import type { NativeRecordingTelemetrySnapshot, NativeRecordingTimebase } from './telemetry-types';

export interface NativeRecordingSource {
  mode: NativeRecordingMode;
  displayId?: string;
  windowId?: string;
  region?: { x: number; y: number; width: number; height: number };
  microphoneDeviceId?: string | null;
}

export interface AppScreenshotStartMessage {
  type: 'app.screenshot.start';
  protocolVersion: number;
  controllerLeaseId: string;
  captureId: string;
  mode: NativeCaptureMode;
  filename: string;
  mimeType: 'image/png';
  totalBytes: number;
  width: number;
  height: number;
  chunkCount: number;
  sha256: string;
  openEditor: boolean;
  capturedAtEpochMs: number;
}

export interface AppScreenshotChunkMessage {
  type: 'app.screenshot.chunk';
  protocolVersion: number;
  controllerLeaseId: string;
  captureId: string;
  chunkIndex: number;
  chunkByteOffset: number;
  chunkRawBytes: number;
  chunkSha256: string;
  base64: string;
}

export interface AppScreenshotCommitMessage {
  type: 'app.screenshot.commit';
  protocolVersion: number;
  controllerLeaseId: string;
  captureId: string;
}

export interface ExtensionScreenshotAckMessage {
  type: 'extension.screenshot.ack';
  protocolVersion: number;
  controllerLeaseId: string;
  captureId: string;
  assetId: string;
}

export interface ExtensionScreenshotChunkRequestMessage {
  type: 'extension.screenshot.chunkRequest';
  protocolVersion: number;
  controllerLeaseId: string;
  captureId: string;
  chunkIndex: number;
}

export interface ExtensionScreenshotRejectMessage {
  type: 'extension.screenshot.reject';
  protocolVersion: number;
  controllerLeaseId: string;
  captureId: string;
  reason: NativeRejectReason;
  diagnosticRetentionRequested?: boolean;
}

export interface AppRecordingStartedMessage {
  type: 'app.recording.started';
  protocolVersion: number;
  controllerLeaseId: string;
  recordingId: string;
  source: NativeRecordingSource;
  timebase: NativeRecordingTimebase;
  requestedSettingsRevision: string;
  requestedQuality: NativeRequestedQualitySettings;
  effectiveQuality: NativeEffectiveQualitySettings;
  startedAtEpochMs: number;
}

export interface AppRecordingProgressMessage {
  type: 'app.recording.progress';
  protocolVersion: number;
  controllerLeaseId: string;
  recordingId: string;
  durationMs: number;
  bytesWritten: number;
  status: 'recording' | 'paused' | 'stopping' | 'finalizing';
}

export interface AppRecordingStoppedMessage {
  type: 'app.recording.stopped';
  protocolVersion: number;
  controllerLeaseId: string;
  recordingId: string;
  durationMs: number;
  filename: string;
  mimeType: 'video/mp4';
  totalBytes: number;
  width: number;
  height: number;
  fps: number;
  chunkCount: number;
  sha256: string;
  telemetry: NativeRecordingTelemetrySnapshot | null;
  openEditor: boolean;
}

export interface ExtensionRecordingChunkRequestMessage {
  type: 'extension.recording.chunkRequest';
  protocolVersion: number;
  controllerLeaseId: string;
  recordingId: string;
  chunkIndex: number;
}

export interface AppRecordingChunkMessage {
  type: 'app.recording.chunk';
  protocolVersion: number;
  controllerLeaseId: string;
  recordingId: string;
  chunkIndex: number;
  chunkByteOffset: number;
  chunkRawBytes: number;
  chunkSha256: string;
  base64: string;
}

export interface ExtensionRecordingAckMessage {
  type: 'extension.recording.ack';
  protocolVersion: number;
  controllerLeaseId: string;
  recordingId: string;
}

export interface ExtensionRecordingRejectMessage {
  type: 'extension.recording.reject';
  protocolVersion: number;
  controllerLeaseId: string;
  recordingId: string;
  reason: NativeRejectReason;
  diagnosticRetentionRequested?: boolean;
}
