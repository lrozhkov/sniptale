import type { NativeCapabilityUnavailableReason, NativeInstallState } from './platform-types';

export type NativeRejectReason =
  | 'malformed-message'
  | 'unsupported-version'
  | 'incompatible-settings'
  | 'stale-controller-lease'
  | 'duplicate-command'
  | 'unsupported-capability'
  | 'quota-exceeded'
  | 'hash-mismatch'
  | 'duplicate-or-replay'
  | 'oversized-payload'
  | 'storage-failed'
  | 'invalid-selection'
  | 'user-cancelled'
  | 'unknown';

export interface NativeRecordingStatus {
  recordingId: string;
  status: 'recording' | 'paused' | 'stopping' | 'finalizing';
  durationMs: number;
}

export interface NativeAppError {
  code:
    | NativeRejectReason
    | NativeCapabilityUnavailableReason
    | 'app-upgrade-required'
    | 'extension-upgrade-required'
    | 'incompatible-protocol'
    | 'repair-required'
    | 'disk-pressure'
    | 'native-message-too-large'
    | 'capture-source-lost'
    | 'audio-source-lost'
    | 'encoder-failed'
    | 'native-finalization-failed';
  message?: string;
  recoverable: boolean;
}

export interface NativeAppStatus {
  connectedBrowser: boolean;
  recording: NativeRecordingStatus | null;
  lastError: NativeAppError | null;
  settingsRevision: string | null;
  install: NativeInstallState;
}
