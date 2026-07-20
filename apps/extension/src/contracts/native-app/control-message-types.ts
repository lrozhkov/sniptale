import type { NativeCaptureMode } from '@sniptale/runtime-contracts/native-app/platform-types';
import type { NativeRequestedQualitySettings } from '@sniptale/runtime-contracts/native-app/settings-types';
import type { NativeAppError } from '@sniptale/runtime-contracts/native-app/status-types';
import type { NativeRecordingSource } from './transfer-message-types';

export interface AppTrayActionRequestedMessage {
  type: 'app.tray.actionRequested';
  protocolVersion: number;
  controllerLeaseId: string;
  actionId: string;
  requestedAtEpochMs: number;
  invocationId: string;
}

export interface ExtensionTrayActionResultMessage {
  type: 'extension.tray.actionResult';
  protocolVersion: number;
  controllerLeaseId: string;
  invocationId: string;
  accepted: boolean;
  error?: string;
}

export type NativeSettingsSection =
  | 'native-app'
  | 'native-hotkeys'
  | 'native-screenshots'
  | 'native-video'
  | 'native-telemetry'
  | 'permissions';

export interface AppOpenSettingsRequestedMessage {
  type: 'app.openSettings.requested';
  protocolVersion: number;
  controllerLeaseId: string;
  section: NativeSettingsSection;
  requestedAtEpochMs: number;
  invocationId: string;
}

export interface ExtensionScreenshotCaptureCommandMessage {
  type: 'extension.screenshot.capture';
  protocolVersion: number;
  controllerLeaseId: string;
  commandId: string;
  mode: NativeCaptureMode;
  settingsRevision: string;
  openEditor: boolean;
  requestedAtEpochMs: number;
}

export interface ExtensionRecordingStartCommandMessage {
  type: 'extension.recording.start';
  protocolVersion: number;
  controllerLeaseId: string;
  commandId: string;
  source: NativeRecordingSource;
  settingsRevision: string;
  requestedQuality: NativeRequestedQualitySettings;
  openEditor: boolean;
  requestedAtEpochMs: number;
}

export interface ExtensionRecordingControlCommandMessage {
  type: 'extension.recording.control';
  protocolVersion: number;
  controllerLeaseId: string;
  commandId: string;
  recordingId: string;
  control: 'pause' | 'resume' | 'stop' | 'cancel';
  requestedAtEpochMs: number;
}

export interface AppCommandAcceptedMessage {
  type: 'app.command.accepted';
  protocolVersion: number;
  controllerLeaseId: string;
  commandId: string;
  operation: 'screenshot' | 'recording';
  acceptedAtEpochMs: number;
}

export interface AppOperationFailedMessage {
  type: 'app.operation.failed';
  protocolVersion: number;
  controllerLeaseId?: string;
  operation:
    | 'handshake'
    | 'settings-sync'
    | 'tray-action'
    | 'open-settings'
    | 'command'
    | 'screenshot'
    | 'recording'
    | 'transfer'
    | 'telemetry'
    | 'install-health';
  operationId?: string;
  phase: string;
  error: NativeAppError;
  occurredAtEpochMs: number;
}
