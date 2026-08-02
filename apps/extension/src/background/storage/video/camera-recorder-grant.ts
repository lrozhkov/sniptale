// policyStateId: video-camera-recorder-grant - restart-safe camera document capability.
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import type { PersistenceMutationPermit } from '../../../composition/persistence/infrastructure/mutation-barrier';
import { runSerializedVideoRecordingAuthorityMutation } from './recording-authority-mutation';
import { isNonEmptyString, isRecord } from './guards';

export const CAMERA_RECORDER_GRANT_STORAGE_KEY = 'video-camera-recorder-grant';
export const CAMERA_RECORDER_LAUNCH_TTL_MS = 60_000;
export const CAMERA_RECORDER_DOCUMENT_TTL_MS = 24 * 60 * 60 * 1000;

export type CameraRecorderGrant = {
  documentId: string;
  expiresAt: number;
  previousRegistrationToken: string | null;
  registrationToken: string;
  recordingId: string;
  senderUrl: string;
  stage: 'document' | 'launch';
  tabId: number | null;
};

type PersistedCameraRecorderGrant = CameraRecorderGrant & {
  createdAt: number;
  version: 1;
};

function parseGrantLifetime(
  value: Record<string, unknown>,
  now: number
): { expiresAt: number; stage: CameraRecorderGrant['stage'] } | null {
  const stage = value['stage'];
  if (stage !== 'launch' && stage !== 'document') {
    return null;
  }
  const createdAt = value['createdAt'];
  const expiresAt = value['expiresAt'];
  const expectedTtl =
    stage === 'launch' ? CAMERA_RECORDER_LAUNCH_TTL_MS : CAMERA_RECORDER_DOCUMENT_TTL_MS;
  if (
    typeof createdAt !== 'number' ||
    !Number.isFinite(createdAt) ||
    typeof expiresAt !== 'number' ||
    !Number.isFinite(expiresAt) ||
    createdAt > now ||
    expiresAt <= now ||
    expiresAt !== createdAt + expectedTtl
  ) {
    return null;
  }
  return { expiresAt, stage };
}

function hasValidStageBinding(
  value: Record<string, unknown>,
  stage: CameraRecorderGrant['stage']
): boolean {
  return stage === 'launch'
    ? value['documentId'] === '' &&
        value['senderUrl'] === '' &&
        value['previousRegistrationToken'] === null &&
        value['tabId'] === null
    : isNonEmptyString(value['documentId']) &&
        isNonEmptyString(value['senderUrl']) &&
        isNonEmptyString(value['previousRegistrationToken']) &&
        typeof value['tabId'] === 'number' &&
        Number.isInteger(value['tabId']) &&
        value['tabId'] >= 0;
}

function parseCameraRecorderGrant(value: unknown, now = Date.now()): CameraRecorderGrant | null {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    !isNonEmptyString(value['registrationToken']) ||
    !isNonEmptyString(value['recordingId'])
  ) {
    return null;
  }
  const lifetime = parseGrantLifetime(value, now);
  if (!lifetime || !hasValidStageBinding(value, lifetime.stage)) {
    return null;
  }

  return {
    documentId: value['documentId'] as string,
    expiresAt: lifetime.expiresAt,
    previousRegistrationToken: value['previousRegistrationToken'] as string | null,
    registrationToken: value['registrationToken'],
    recordingId: value['recordingId'],
    senderUrl: value['senderUrl'] as string,
    stage: lifetime.stage,
    tabId: value['tabId'] as number | null,
  };
}

async function readStoredGrant(): Promise<CameraRecorderGrant | null> {
  const stored = await browserStorage.session.get([CAMERA_RECORDER_GRANT_STORAGE_KEY]);
  return parseCameraRecorderGrant(stored[CAMERA_RECORDER_GRANT_STORAGE_KEY]);
}

async function writeGrant(
  grant: CameraRecorderGrant,
  createdAt: number,
  permit?: PersistenceMutationPermit
): Promise<void> {
  const persisted: PersistedCameraRecorderGrant = { ...grant, createdAt, version: 1 };
  await browserStorage.session.set({ [CAMERA_RECORDER_GRANT_STORAGE_KEY]: persisted }, permit);
}

function requireSessionStorage(): void {
  if (!browserStorage.session.isAvailable()) {
    throw new Error('Session storage is unavailable for the camera recorder grant.');
  }
}

export async function readCameraRecorderGrant(): Promise<CameraRecorderGrant | null> {
  if (!browserStorage.session.isAvailable()) {
    return null;
  }
  return readStoredGrant();
}

export function createCameraRecorderLaunchGrant(
  recordingId: string,
  registrationToken: string
): Promise<CameraRecorderGrant> {
  return runSerializedVideoRecordingAuthorityMutation(async (permit) => {
    requireSessionStorage();
    const createdAt = Date.now();
    const grant: CameraRecorderGrant = {
      documentId: '',
      expiresAt: createdAt + CAMERA_RECORDER_LAUNCH_TTL_MS,
      previousRegistrationToken: null,
      registrationToken,
      recordingId,
      senderUrl: '',
      stage: 'launch',
      tabId: null,
    };
    await writeGrant(grant, createdAt, permit);
    return grant;
  });
}

export function bindCameraRecorderDocumentGrant(args: {
  documentId: string;
  nextRegistrationToken: string;
  registrationToken: string;
  recordingId: string;
  senderUrl: string;
  tabId: number;
}): Promise<CameraRecorderGrant | null> {
  return runSerializedVideoRecordingAuthorityMutation(async (permit) => {
    requireSessionStorage();
    const current = await readStoredGrant();
    const isIdempotentRetry =
      current?.stage === 'document' &&
      current.documentId === args.documentId &&
      current.previousRegistrationToken === args.registrationToken &&
      current.recordingId === args.recordingId &&
      current.senderUrl === args.senderUrl &&
      current.tabId === args.tabId;
    if (isIdempotentRetry) {
      return current;
    }
    if (
      !current ||
      current.registrationToken !== args.registrationToken ||
      current.recordingId !== args.recordingId ||
      (current.stage === 'document' && current.senderUrl !== args.senderUrl)
    ) {
      return null;
    }

    const createdAt =
      current.stage === 'launch' ? Date.now() : current.expiresAt - CAMERA_RECORDER_DOCUMENT_TTL_MS;
    const grant: CameraRecorderGrant = {
      ...current,
      documentId: args.documentId,
      expiresAt: createdAt + CAMERA_RECORDER_DOCUMENT_TTL_MS,
      previousRegistrationToken: current.registrationToken,
      registrationToken: args.nextRegistrationToken,
      senderUrl: args.senderUrl,
      stage: 'document',
      tabId: args.tabId,
    };
    await writeGrant(grant, createdAt, permit);
    return grant;
  });
}

export function rebindCameraRecorderDocumentGrant(args: {
  documentId: string;
  senderUrl: string;
  tabId: number;
}): Promise<CameraRecorderGrant | null> {
  return runSerializedVideoRecordingAuthorityMutation(async (permit) => {
    requireSessionStorage();
    const current = await readStoredGrant();
    if (
      !current ||
      current.stage !== 'document' ||
      current.senderUrl !== args.senderUrl ||
      current.tabId !== args.tabId
    ) {
      return null;
    }
    if (current.documentId === args.documentId) {
      return current;
    }
    const rebound: CameraRecorderGrant = { ...current, documentId: args.documentId };
    const createdAt = current.expiresAt - CAMERA_RECORDER_DOCUMENT_TTL_MS;
    await writeGrant(rebound, createdAt, permit);
    return rebound;
  });
}

export function clearCameraRecorderGrant(recordingId?: string): Promise<boolean> {
  return runSerializedVideoRecordingAuthorityMutation(async (permit) => {
    requireSessionStorage();
    if (recordingId !== undefined) {
      const current = await readStoredGrant();
      if (!current || current.recordingId !== recordingId) {
        return false;
      }
    }
    await browserStorage.session.remove(CAMERA_RECORDER_GRANT_STORAGE_KEY, permit);
    return true;
  });
}
