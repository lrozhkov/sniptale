import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { isStringEnumValue } from '@sniptale/runtime-contracts/validation/string-literals';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const ACTIVE_RECORDING_LEASE_KEY = 'video-active-recording-lease';
const RECORDING_LEASE_TTL_MS = 12 * 60 * 60 * 1000;

export type RecordingTerminalProgress = {
  discard: boolean;
  outcome: 'unknown' | 'stopped' | 'failed';
  cleanupStep: 'surface' | 'camera-grant' | 'lease';
};

type RecordingLeaseIdentity = {
  captureMode: CaptureMode;
  controlToken: string;
  cropRegion: { x: number; y: number; width: number; height: number } | null;
  expiresAt: number;
  ownerSenderUrl: string;
  recordingId: string;
  recordingTabId: number | null;
  surfaceBinding: { generation: number; streamInstanceId: string } | null;
  viewportPresetId: string | null;
};

export type VideoRecordingControlLease = RecordingLeaseIdentity &
  (
    | { phase: 'prepared' | 'active'; terminal?: never }
    | { phase: 'terminal'; terminal: RecordingTerminalProgress }
  );

type PersistedLeaseRecord = VideoRecordingControlLease & {
  version: 1 | 2;
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
  const phase = parseLeasePhase(value);

  if (
    !phase ||
    !isCaptureMode(value['captureMode']) ||
    typeof value['controlToken'] !== 'string' ||
    !isCropRegion(cropRegion) ||
    typeof value['expiresAt'] !== 'number' ||
    !Number.isFinite(value['expiresAt']) ||
    typeof value['ownerSenderUrl'] !== 'string' ||
    typeof value['recordingId'] !== 'string' ||
    !isValidRecordingTabId(value['recordingTabId']) ||
    !isSurfaceBinding(value['surfaceBinding']) ||
    !(value['viewportPresetId'] === undefined || isNullableString(value['viewportPresetId'])) ||
    (phase.phase !== 'terminal' && value['expiresAt'] <= now)
  ) {
    return null;
  }

  return {
    captureMode: value['captureMode'],
    controlToken: value['controlToken'],
    cropRegion,
    expiresAt: value['expiresAt'],
    ownerSenderUrl: value['ownerSenderUrl'],
    ...phase,
    recordingId: value['recordingId'],
    recordingTabId: value['recordingTabId'],
    surfaceBinding: value['surfaceBinding'],
    viewportPresetId: value['viewportPresetId'] ?? null,
  };
}

function parseLeasePhase(
  value: Record<string, unknown>
):
  | { phase: 'prepared' | 'active'; terminal?: never }
  | { phase: 'terminal'; terminal: RecordingTerminalProgress }
  | null {
  const phase = value['phase'];
  if (value['version'] === 1 && (phase === 'prepared' || phase === 'active')) {
    return value['terminal'] === undefined ? { phase } : null;
  }
  const terminal = value['terminal'];
  if (value['version'] !== 2 || phase !== 'terminal' || !isRecord(terminal)) return null;
  const discard = terminal['discard'];
  const outcome = terminal['outcome'];
  const cleanupStep = terminal['cleanupStep'];
  if (
    typeof discard !== 'boolean' ||
    (outcome !== 'unknown' && outcome !== 'stopped' && outcome !== 'failed') ||
    (cleanupStep !== 'surface' && cleanupStep !== 'camera-grant' && cleanupStep !== 'lease') ||
    (outcome !== 'stopped' && cleanupStep !== 'surface') ||
    value['surfaceBinding'] === null ||
    !isSurfaceBinding(value['surfaceBinding'])
  )
    return null;
  return { phase, terminal: { discard, outcome, cleanupStep } };
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
  return { ...lease, version: lease.phase === 'terminal' ? 2 : 1 };
}

export function canPersistVideoRecordingLease(): boolean {
  return browserStorage.session.isAvailable();
}

export function createLeaseSnapshot(args: {
  captureMode: CaptureMode;
  ownerSenderUrl: string;
  cropRegion?: { x: number; y: number; width: number; height: number } | null;
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

export async function removePersistedLease(permit?: PersistenceMutationPermit): Promise<void> {
  if (canPersistVideoRecordingLease()) {
    if (permit) await browserStorage.session.remove(ACTIVE_RECORDING_LEASE_KEY, permit);
    else await browserStorage.session.remove(ACTIVE_RECORDING_LEASE_KEY);
  }
}

export async function persistLease(
  lease: VideoRecordingControlLease,
  permit?: PersistenceMutationPermit
): Promise<void> {
  if (!canPersistVideoRecordingLease()) {
    return;
  }

  const values = {
    [ACTIVE_RECORDING_LEASE_KEY]: createPersistedLease(lease),
  };
  if (permit) await browserStorage.session.set(values, permit);
  else await browserStorage.session.set(values);
}
