import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { isStringEnumValue } from '@sniptale/runtime-contracts/validation/string-literals';
import { CaptureMode } from '@sniptale/runtime-contracts/video/types/types';

const ACTIVE_RECORDING_LEASE_KEY = 'video-active-recording-lease';
const RECORDING_LEASE_TTL_MS = 12 * 60 * 60 * 1000;

export type VideoRecordingControlLease = {
  captureMode: CaptureMode;
  controlToken: string;
  expiresAt: number;
  openEditorAfterRecording: boolean;
  ownerSenderUrl: string;
  recordingId: string;
  recordingTabId: number | null;
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

  if (
    value['version'] !== 1 ||
    !isCaptureMode(value['captureMode']) ||
    typeof value['controlToken'] !== 'string' ||
    typeof value['expiresAt'] !== 'number' ||
    !Number.isFinite(value['expiresAt']) ||
    typeof value['openEditorAfterRecording'] !== 'boolean' ||
    typeof value['ownerSenderUrl'] !== 'string' ||
    typeof value['recordingId'] !== 'string' ||
    !isValidRecordingTabId(value['recordingTabId']) ||
    value['expiresAt'] <= now
  ) {
    return null;
  }

  return {
    captureMode: value['captureMode'],
    controlToken: value['controlToken'],
    expiresAt: value['expiresAt'],
    openEditorAfterRecording: value['openEditorAfterRecording'],
    ownerSenderUrl: value['ownerSenderUrl'],
    recordingId: value['recordingId'],
    recordingTabId: value['recordingTabId'],
  };
}

function isValidRecordingTabId(value: unknown): value is number | null {
  return value === null || (typeof value === 'number' && Number.isInteger(value));
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
  openEditorAfterRecording: boolean;
  recordingId: string;
  recordingTabId: number | null;
}): VideoRecordingControlLease {
  return {
    captureMode: args.captureMode,
    controlToken: crypto.randomUUID(),
    expiresAt: Date.now() + RECORDING_LEASE_TTL_MS,
    openEditorAfterRecording: args.openEditorAfterRecording,
    ownerSenderUrl: args.ownerSenderUrl,
    recordingId: args.recordingId,
    recordingTabId: args.recordingTabId,
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
