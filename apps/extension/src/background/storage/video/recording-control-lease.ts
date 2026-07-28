import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { isStringEnumValue } from '@sniptale/runtime-contracts/validation/string-literals';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const ACTIVE_RECORDING_LEASE_KEY = 'video-active-recording-lease';
const RECORDING_LEASE_TTL_MS = 12 * 60 * 60 * 1000;

export type VideoRecordingControlLease = {
  captureMode: CaptureMode;
  controlToken: string;
  cropRegion: { x: number; y: number; width: number; height: number } | null;
  expiresAt: number;
  openEditorAfterRecording: boolean;
  ownerSenderUrl: string;
  phase: 'prepared' | 'active';
  recordingId: string;
  recordingTabId: number | null;
  surfaceBinding: { generation: number; streamInstanceId: string } | null;
  viewportPresetId: string | null;
};

type PersistedLeaseRecord = VideoRecordingControlLease & {
  version: 1;
};

export type PersistedLeaseInspection =
  | { status: 'absent' }
  | { status: 'invalid' }
  | { status: 'unavailable' }
  | { lease: VideoRecordingControlLease; status: 'entry' };

function isCaptureMode(value: unknown): value is CaptureMode {
  return isStringEnumValue(value, CaptureMode);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function parsePersistedLease(value: unknown, now = Date.now()): VideoRecordingControlLease | null {
  if (!isRecord(value)) {
    return null;
  }
  const cropRegion = value['cropRegion'] ?? null;

  if (
    value['version'] !== 1 ||
    !isCaptureMode(value['captureMode']) ||
    typeof value['controlToken'] !== 'string' ||
    !isCropRegion(cropRegion) ||
    typeof value['expiresAt'] !== 'number' ||
    !Number.isFinite(value['expiresAt']) ||
    typeof value['openEditorAfterRecording'] !== 'boolean' ||
    typeof value['ownerSenderUrl'] !== 'string' ||
    (value['phase'] !== 'prepared' && value['phase'] !== 'active') ||
    typeof value['recordingId'] !== 'string' ||
    !isValidRecordingTabId(value['recordingTabId']) ||
    !isSurfaceBinding(value['surfaceBinding']) ||
    !(value['viewportPresetId'] === undefined || isNullableString(value['viewportPresetId'])) ||
    value['expiresAt'] <= now
  ) {
    return null;
  }

  return {
    captureMode: value['captureMode'],
    controlToken: value['controlToken'],
    cropRegion,
    expiresAt: value['expiresAt'],
    openEditorAfterRecording: value['openEditorAfterRecording'],
    ownerSenderUrl: value['ownerSenderUrl'],
    phase: value['phase'],
    recordingId: value['recordingId'],
    recordingTabId: value['recordingTabId'],
    surfaceBinding: value['surfaceBinding'],
    viewportPresetId: value['viewportPresetId'] ?? null,
  };
}

function isValidRecordingTabId(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value));
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string';
}

function isCropRegion(
  value: unknown
): value is { x: number; y: number; width: number; height: number } | null {
  if (value === null) return true;
  if (!isRecord(value)) return false;
  const x = value['x'];
  const y = value['y'];
  const width = value['width'];
  const height = value['height'];
  return (
    typeof x === 'number' &&
    Number.isFinite(x) &&
    x >= 0 &&
    typeof y === 'number' &&
    Number.isFinite(y) &&
    y >= 0 &&
    typeof width === 'number' &&
    Number.isFinite(width) &&
    width > 0 &&
    typeof height === 'number' &&
    Number.isFinite(height) &&
    height > 0
  );
}

function isSurfaceBinding(
  value: unknown
): value is { generation: number; streamInstanceId: string } | null {
  return (
    value === null ||
    (isRecord(value) &&
      typeof value['generation'] === 'number' &&
      Number.isInteger(value['generation']) &&
      value['generation'] > 0 &&
      typeof value['streamInstanceId'] === 'string' &&
      value['streamInstanceId'].length > 0)
  );
}

function createPersistedLease(lease: VideoRecordingControlLease): PersistedLeaseRecord {
  return { ...lease, version: 1 };
}

export function canPersistVideoRecordingLease(): boolean {
  return browserStorage.session.isAvailable();
}

export function createLeaseSnapshot(args: {
  captureMode: CaptureMode;
  ownerSenderUrl: string;
  cropRegion?: { x: number; y: number; width: number; height: number } | null;
  openEditorAfterRecording: boolean;
  recordingId: string;
  recordingTabId: number | null;
  surfaceBinding?: { generation: number; streamInstanceId: string } | null;
  viewportPresetId?: string | null;
}): VideoRecordingControlLease {
  return {
    captureMode: args.captureMode,
    controlToken: crypto.randomUUID(),
    cropRegion: args.cropRegion ?? null,
    expiresAt: Date.now() + RECORDING_LEASE_TTL_MS,
    openEditorAfterRecording: args.openEditorAfterRecording,
    ownerSenderUrl: args.ownerSenderUrl,
    phase: 'prepared',
    recordingId: args.recordingId,
    recordingTabId: args.recordingTabId,
    surfaceBinding: args.surfaceBinding ?? null,
    viewportPresetId: args.viewportPresetId ?? null,
  };
}

export async function inspectPersistedLease(): Promise<PersistedLeaseInspection> {
  if (!canPersistVideoRecordingLease()) {
    return { status: 'unavailable' };
  }

  const payload = await browserStorage.session.get([ACTIVE_RECORDING_LEASE_KEY]);
  const rawLease = payload[ACTIVE_RECORDING_LEASE_KEY];
  if (rawLease === undefined) return { status: 'absent' };
  const lease = parsePersistedLease(rawLease);
  return lease ? { lease, status: 'entry' } : { status: 'invalid' };
}

export async function readPersistedLease(): Promise<VideoRecordingControlLease | null> {
  const inspection = await inspectPersistedLease();
  return inspection.status === 'entry' ? inspection.lease : null;
}

export async function removePersistedLease(): Promise<void> {
  if (canPersistVideoRecordingLease()) {
    await browserStorage.session.remove(ACTIVE_RECORDING_LEASE_KEY);
  }
}

export async function persistLease(lease: VideoRecordingControlLease): Promise<void> {
  if (!canPersistVideoRecordingLease()) {
    return;
  }

  await browserStorage.session.set({
    [ACTIVE_RECORDING_LEASE_KEY]: createPersistedLease(lease),
  });
}
