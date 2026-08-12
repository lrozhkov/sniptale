import type { ContentPrivilegedActionCapability } from '../../protocol/content-privileged-action';
import { isContentPrivilegedActionCapability } from '../../protocol/content-privileged-action';
import { VideoMessageType } from '../messages';
import {
  VideoRecordingStatus,
  WebcamPresentationShape,
  VIDEO_AUTO_FADE_DELAYS,
  type VideoAutoFadeDelay,
  type WebcamPresentationSettings,
} from './types';

export const VideoRecordingSurfaceLifecycle = {
  REQUESTED: 'requested',
  BINDING: 'binding',
  READY: 'ready',
  DEGRADED: 'degraded',
} as const;

export type VideoRecordingSurfaceLifecycle =
  (typeof VideoRecordingSurfaceLifecycle)[keyof typeof VideoRecordingSurfaceLifecycle];

export type VideoRecordingSurfaceEntry = 'manual' | 'popup';

export interface VideoRecordingSurfaceSnapshot {
  autoFadeDelay: VideoAutoFadeDelay;
  surfaceSessionId: string;
  documentGeneration: number;
  lifecycle: VideoRecordingSurfaceLifecycle;
  recordingId: string | null;
  entry: VideoRecordingSurfaceEntry;
  toolbarRequested: boolean;
  capabilityEpoch: number;
  cursorSpotlightEnabled: boolean;
  peerGeneration: number;
  status: VideoRecordingStatus;
  duration: number;
  microphoneEnabled: boolean;
  microphoneDeviceId: string | null;
  webcamEnabled: boolean;
  webcamDeviceId: string | null;
  webcamPresentation: WebcamPresentationSettings;
  errorCode: string | null;
}

export interface VideoRecordingSurfaceActivation {
  surfaceSessionId: string;
  surfaceToken: string;
  snapshot: VideoRecordingSurfaceSnapshot;
}

export interface StartSavedTabVideoRecordingMessage {
  type: typeof VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING;
  contentIntent: ContentPrivilegedActionCapability;
}

export interface ActivateVideoRecordingSurfaceMessage {
  type: typeof VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE;
  contentIntent: ContentPrivilegedActionCapability;
}

export interface ReleaseVideoRecordingSurfaceMessage {
  type: typeof VideoMessageType.RELEASE_VIDEO_RECORDING_SURFACE;
  surfaceSessionId: string;
  surfaceToken: string;
}

export interface VideoRecordingSurfaceSnapshotMessage {
  type: typeof VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT;
  snapshot: VideoRecordingSurfaceSnapshot;
  surfaceToken?: string;
}

export type VideoRecordingSurfaceCommand =
  | { kind: 'cancel-start' | 'pause' | 'resume' | 'stop' }
  | { kind: 'set-microphone-enabled' | 'set-webcam-enabled'; enabled: boolean }
  | { kind: 'select-microphone-device' | 'select-webcam-device'; deviceId: string | null }
  | {
      kind: 'update-embedded-camera';
      appearance: Pick<
        WebcamPresentationSettings,
        'shape' | 'center' | 'sizeFraction' | 'cropOffset'
      >;
    };

export interface VideoRecordingSurfaceCommandMessage {
  type: typeof VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND;
  surfaceSessionId: string;
  surfaceToken: string;
  capabilityEpoch: number;
  documentGeneration: number;
  recordingId: string | null;
  command: VideoRecordingSurfaceCommand;
}

interface VideoRecordingCameraPeerIdentity {
  surfaceSessionId: string;
  surfaceToken: string;
  documentGeneration: number;
  peerGeneration: number;
}

export interface VideoRecordingCameraOfferMessage extends VideoRecordingCameraPeerIdentity {
  type: typeof VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER;
  sdp: string;
}

export interface VideoRecordingCameraAnswerMessage extends VideoRecordingCameraPeerIdentity {
  type: typeof VideoMessageType.VIDEO_RECORDING_CAMERA_ANSWER;
  sdp: string;
}

export interface VideoRecordingCameraCloseMessage extends VideoRecordingCameraPeerIdentity {
  type: typeof VideoMessageType.VIDEO_RECORDING_CAMERA_CLOSE;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function hasExactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actualKeys = Object.keys(value);
  return actualKeys.length === keys.length && keys.every((key) => actualKeys.includes(key));
}

function isFiniteNonNegativeNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isWebcamPresentationSettings(value: unknown): value is WebcamPresentationSettings {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['mode', 'shape', 'center', 'sizeFraction', 'cropOffset']) &&
    (value['mode'] === 'embedded' || value['mode'] === 'separate-track') &&
    (value['shape'] === WebcamPresentationShape.CIRCLE ||
      value['shape'] === WebcamPresentationShape.RECTANGLE) &&
    isNormalizedPoint(value['center'], 0, 1) &&
    typeof value['sizeFraction'] === 'number' &&
    Number.isFinite(value['sizeFraction']) &&
    value['sizeFraction'] > 0 &&
    value['sizeFraction'] <= 1 &&
    isNormalizedPoint(value['cropOffset'], -1, 1)
  );
}

function isSurfaceLifecycle(value: unknown): value is VideoRecordingSurfaceLifecycle {
  return (
    value === VideoRecordingSurfaceLifecycle.REQUESTED ||
    value === VideoRecordingSurfaceLifecycle.BINDING ||
    value === VideoRecordingSurfaceLifecycle.READY ||
    value === VideoRecordingSurfaceLifecycle.DEGRADED
  );
}

function isRecordingStatus(value: unknown): value is VideoRecordingStatus {
  return Object.values(VideoRecordingStatus).some((status) => status === value);
}

export function isVideoRecordingSurfaceSnapshot(
  value: unknown
): value is VideoRecordingSurfaceSnapshot {
  if (
    !isRecord(value) ||
    !hasExactKeys(value, [
      'surfaceSessionId',
      'autoFadeDelay',
      'documentGeneration',
      'lifecycle',
      'recordingId',
      'entry',
      'toolbarRequested',
      'capabilityEpoch',
      'cursorSpotlightEnabled',
      'peerGeneration',
      'status',
      'duration',
      'microphoneEnabled',
      'microphoneDeviceId',
      'webcamEnabled',
      'webcamDeviceId',
      'webcamPresentation',
      'errorCode',
    ])
  ) {
    return false;
  }

  return (
    typeof value['surfaceSessionId'] === 'string' &&
    VIDEO_AUTO_FADE_DELAYS.includes(value['autoFadeDelay'] as VideoAutoFadeDelay) &&
    isFiniteNonNegativeNumber(value['documentGeneration']) &&
    isSurfaceLifecycle(value['lifecycle']) &&
    isNullableString(value['recordingId']) &&
    (value['entry'] === 'manual' || value['entry'] === 'popup') &&
    typeof value['toolbarRequested'] === 'boolean' &&
    isFiniteNonNegativeNumber(value['capabilityEpoch']) &&
    typeof value['cursorSpotlightEnabled'] === 'boolean' &&
    isFiniteNonNegativeNumber(value['peerGeneration']) &&
    isRecordingStatus(value['status']) &&
    isFiniteNonNegativeNumber(value['duration']) &&
    typeof value['microphoneEnabled'] === 'boolean' &&
    isNullableString(value['microphoneDeviceId']) &&
    typeof value['webcamEnabled'] === 'boolean' &&
    isNullableString(value['webcamDeviceId']) &&
    isWebcamPresentationSettings(value['webcamPresentation']) &&
    isNullableString(value['errorCode'])
  );
}

export function isVideoRecordingSurfaceActivation(
  value: unknown
): value is VideoRecordingSurfaceActivation {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['surfaceSessionId', 'surfaceToken', 'snapshot']) &&
    typeof value['surfaceSessionId'] === 'string' &&
    typeof value['surfaceToken'] === 'string' &&
    isVideoRecordingSurfaceSnapshot(value['snapshot']) &&
    value['snapshot'].surfaceSessionId === value['surfaceSessionId']
  );
}

export function isStartSavedTabVideoRecordingMessage(
  value: unknown
): value is StartSavedTabVideoRecordingMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['type', 'contentIntent']) &&
    value['type'] === VideoMessageType.START_SAVED_TAB_VIDEO_RECORDING &&
    isContentPrivilegedActionCapability(value['contentIntent'])
  );
}

export function isActivateVideoRecordingSurfaceMessage(
  value: unknown
): value is ActivateVideoRecordingSurfaceMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['type', 'contentIntent']) &&
    value['type'] === VideoMessageType.ACTIVATE_VIDEO_RECORDING_SURFACE &&
    isContentPrivilegedActionCapability(value['contentIntent'])
  );
}

export function isReleaseVideoRecordingSurfaceMessage(
  value: unknown
): value is ReleaseVideoRecordingSurfaceMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['type', 'surfaceSessionId', 'surfaceToken']) &&
    value['type'] === VideoMessageType.RELEASE_VIDEO_RECORDING_SURFACE &&
    typeof value['surfaceSessionId'] === 'string' &&
    typeof value['surfaceToken'] === 'string'
  );
}

export function isVideoRecordingSurfaceSnapshotMessage(
  value: unknown
): value is VideoRecordingSurfaceSnapshotMessage {
  return (
    isRecord(value) &&
    (hasExactKeys(value, ['type', 'snapshot']) ||
      hasExactKeys(value, ['type', 'snapshot', 'surfaceToken'])) &&
    value['type'] === VideoMessageType.VIDEO_RECORDING_SURFACE_SNAPSHOT &&
    isVideoRecordingSurfaceSnapshot(value['snapshot']) &&
    (value['surfaceToken'] === undefined || typeof value['surfaceToken'] === 'string')
  );
}

function isNormalizedPoint(value: unknown, minimum: number, maximum: number): boolean {
  return (
    isRecord(value) &&
    hasExactKeys(value, ['x', 'y']) &&
    typeof value['x'] === 'number' &&
    Number.isFinite(value['x']) &&
    value['x'] >= minimum &&
    value['x'] <= maximum &&
    typeof value['y'] === 'number' &&
    Number.isFinite(value['y']) &&
    value['y'] >= minimum &&
    value['y'] <= maximum
  );
}

function isVideoRecordingSurfaceCommand(value: unknown): value is VideoRecordingSurfaceCommand {
  if (!isRecord(value) || typeof value['kind'] !== 'string') {
    return false;
  }

  if (['cancel-start', 'pause', 'resume', 'stop'].includes(value['kind'])) {
    return hasExactKeys(value, ['kind']);
  }
  if (value['kind'] === 'set-microphone-enabled' || value['kind'] === 'set-webcam-enabled') {
    return hasExactKeys(value, ['kind', 'enabled']) && typeof value['enabled'] === 'boolean';
  }
  if (value['kind'] === 'select-microphone-device' || value['kind'] === 'select-webcam-device') {
    return hasExactKeys(value, ['kind', 'deviceId']) && isNullableString(value['deviceId']);
  }
  if (
    value['kind'] !== 'update-embedded-camera' ||
    !hasExactKeys(value, ['kind', 'appearance']) ||
    !isRecord(value['appearance']) ||
    !hasExactKeys(value['appearance'], ['shape', 'center', 'sizeFraction', 'cropOffset'])
  ) {
    return false;
  }

  const appearance = value['appearance'];
  return (
    (appearance['shape'] === WebcamPresentationShape.CIRCLE ||
      appearance['shape'] === WebcamPresentationShape.RECTANGLE) &&
    isNormalizedPoint(appearance['center'], 0, 1) &&
    typeof appearance['sizeFraction'] === 'number' &&
    Number.isFinite(appearance['sizeFraction']) &&
    appearance['sizeFraction'] > 0 &&
    appearance['sizeFraction'] <= 1 &&
    isNormalizedPoint(appearance['cropOffset'], -1, 1)
  );
}

export function isVideoRecordingSurfaceCommandMessage(
  value: unknown
): value is VideoRecordingSurfaceCommandMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'type',
      'surfaceSessionId',
      'surfaceToken',
      'capabilityEpoch',
      'documentGeneration',
      'recordingId',
      'command',
    ]) &&
    value['type'] === VideoMessageType.VIDEO_RECORDING_SURFACE_COMMAND &&
    typeof value['surfaceSessionId'] === 'string' &&
    typeof value['surfaceToken'] === 'string' &&
    isFiniteNonNegativeNumber(value['capabilityEpoch']) &&
    isFiniteNonNegativeNumber(value['documentGeneration']) &&
    isNullableString(value['recordingId']) &&
    isVideoRecordingSurfaceCommand(value['command'])
  );
}

function isCameraPeerIdentity(value: Record<string, unknown>): boolean {
  return (
    typeof value['surfaceSessionId'] === 'string' &&
    typeof value['surfaceToken'] === 'string' &&
    isFiniteNonNegativeNumber(value['documentGeneration']) &&
    isFiniteNonNegativeNumber(value['peerGeneration'])
  );
}

export function isVideoRecordingCameraOfferMessage(
  value: unknown
): value is VideoRecordingCameraOfferMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'type',
      'surfaceSessionId',
      'surfaceToken',
      'documentGeneration',
      'peerGeneration',
      'sdp',
    ]) &&
    value['type'] === VideoMessageType.VIDEO_RECORDING_CAMERA_OFFER &&
    isCameraPeerIdentity(value) &&
    typeof value['sdp'] === 'string'
  );
}

export function isVideoRecordingCameraAnswerMessage(
  value: unknown
): value is VideoRecordingCameraAnswerMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'type',
      'surfaceSessionId',
      'surfaceToken',
      'documentGeneration',
      'peerGeneration',
      'sdp',
    ]) &&
    value['type'] === VideoMessageType.VIDEO_RECORDING_CAMERA_ANSWER &&
    isCameraPeerIdentity(value) &&
    typeof value['sdp'] === 'string'
  );
}

export function isVideoRecordingCameraCloseMessage(
  value: unknown
): value is VideoRecordingCameraCloseMessage {
  return (
    isRecord(value) &&
    hasExactKeys(value, [
      'type',
      'surfaceSessionId',
      'surfaceToken',
      'documentGeneration',
      'peerGeneration',
    ]) &&
    value['type'] === VideoMessageType.VIDEO_RECORDING_CAMERA_CLOSE &&
    isCameraPeerIdentity(value)
  );
}
