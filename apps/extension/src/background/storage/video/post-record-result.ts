// policyStateId: video-post-record-results - one pending user decision survives service-worker restarts.
import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import { browserStorage } from '../../../composition/persistence/infrastructure/browser-storage';
import { runSerializedVideoRecordingAuthorityMutation } from './recording-authority-mutation';

export const VIDEO_POST_RECORD_RESULT_STORAGE_KEY = 'video-post-record-result';
export const VIDEO_POST_RECORD_RESULT_TTL_MS = 12 * 60 * 60 * 1000;

type PersistedVideoPostRecordResult = VideoPostRecordResult & {
  acknowledgedBy: VideoPostRecordCameraAcknowledgement | null;
  createdAt: number;
  expiresAt: number | null;
  status: VideoPostRecordResultStatus;
  version: 1;
};

export type VideoPostRecordResultStatus = 'acknowledged' | 'ready' | 'staged';

type VideoPostRecordCameraAcknowledgement = {
  documentId: string;
  senderUrl: string;
  tabId: number;
};

export type StoredVideoPostRecordResult = {
  acknowledgedBy: VideoPostRecordCameraAcknowledgement | null;
  createdAt: number;
  expiresAt: number | null;
  result: VideoPostRecordResult;
  status: VideoPostRecordResultStatus;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseStatus(value: unknown): VideoPostRecordResultStatus | null {
  return value === 'acknowledged' || value === 'ready' || value === 'staged' ? value : null;
}

function parseAcknowledgedBy(
  value: unknown
): VideoPostRecordCameraAcknowledgement | null | undefined {
  if (value === null) {
    return null;
  }
  if (
    !isRecord(value) ||
    !isNonEmptyString(value['documentId']) ||
    !isNonEmptyString(value['senderUrl']) ||
    typeof value['tabId'] !== 'number' ||
    !Number.isInteger(value['tabId']) ||
    value['tabId'] < 0
  ) {
    return undefined;
  }
  return {
    documentId: value['documentId'],
    senderUrl: value['senderUrl'],
    tabId: value['tabId'],
  };
}

function parseLifetime(
  value: Record<string, unknown>,
  status: VideoPostRecordResultStatus,
  now: number
): { createdAt: number; expiresAt: number | null } | null {
  const createdAt = value['createdAt'];
  const expiresAt = value['expiresAt'];
  if (typeof createdAt !== 'number' || !Number.isFinite(createdAt) || createdAt > now) {
    return null;
  }
  if (status === 'acknowledged') {
    if (
      typeof expiresAt !== 'number' ||
      !Number.isFinite(expiresAt) ||
      expiresAt <= now ||
      expiresAt > now + VIDEO_POST_RECORD_RESULT_TTL_MS
    ) {
      return null;
    }
  } else if (expiresAt !== null) {
    return null;
  }
  return { createdAt, expiresAt: status === 'acknowledged' ? expiresAt : null };
}

function parsePersistedVideoPostRecordResult(
  value: unknown,
  now = Date.now()
): StoredVideoPostRecordResult | null {
  if (
    !isRecord(value) ||
    value['version'] !== 1 ||
    !isNonEmptyString(value['recordingId']) ||
    !isNonEmptyString(value['primaryRecordingId']) ||
    !(value['projectId'] === null || isNonEmptyString(value['projectId']))
  ) {
    return null;
  }
  const status = parseStatus(value['status']);
  if (!status) {
    return null;
  }
  const lifetime = parseLifetime(value, status, now);
  const acknowledgedBy = parseAcknowledgedBy(value['acknowledgedBy']);
  if (
    !lifetime ||
    acknowledgedBy === undefined ||
    (status !== 'acknowledged' && acknowledgedBy !== null)
  ) {
    return null;
  }

  return {
    ...lifetime,
    acknowledgedBy,
    result: {
      primaryRecordingId: value['primaryRecordingId'],
      projectId: value['projectId'],
      recordingId: value['recordingId'],
    },
    status,
  };
}

function isSameResult(left: VideoPostRecordResult, right: VideoPostRecordResult): boolean {
  return (
    left.primaryRecordingId === right.primaryRecordingId &&
    left.projectId === right.projectId &&
    left.recordingId === right.recordingId
  );
}

function toPersistedVideoPostRecordResult(
  state: StoredVideoPostRecordResult
): PersistedVideoPostRecordResult {
  return {
    ...state.result,
    acknowledgedBy: state.acknowledgedBy,
    createdAt: state.createdAt,
    expiresAt: state.expiresAt,
    status: state.status,
    version: 1,
  };
}

export function createAcknowledgedVideoPostRecordResult(
  state: StoredVideoPostRecordResult,
  acknowledgedBy: VideoPostRecordCameraAcknowledgement | null
): PersistedVideoPostRecordResult {
  return toPersistedVideoPostRecordResult({
    ...state,
    acknowledgedBy,
    expiresAt: Date.now() + VIDEO_POST_RECORD_RESULT_TTL_MS,
    status: 'acknowledged',
  });
}

export async function readStoredVideoPostRecordResult(): Promise<StoredVideoPostRecordResult | null> {
  if (!browserStorage.session.isAvailable()) {
    throw new Error('Session storage is unavailable for the post-record result.');
  }

  const stored = await browserStorage.session.get([VIDEO_POST_RECORD_RESULT_STORAGE_KEY]);
  return parsePersistedVideoPostRecordResult(stored[VIDEO_POST_RECORD_RESULT_STORAGE_KEY]);
}

export async function readPendingVideoPostRecordResult(): Promise<VideoPostRecordResult | null> {
  const stored = await readStoredVideoPostRecordResult();
  return stored?.status === 'ready' ? stored.result : null;
}

export async function isAcknowledgedVideoPostRecordResultForCamera(args: {
  documentId?: string | undefined;
  recordingId: string;
  senderUrl: string | null;
  tabId?: number | undefined;
}): Promise<boolean> {
  if (!args.documentId || !args.senderUrl || args.tabId === undefined) {
    return false;
  }
  const stored = await readStoredVideoPostRecordResult();
  return (
    stored?.status === 'acknowledged' &&
    stored.result.recordingId === args.recordingId &&
    stored.acknowledgedBy?.documentId === args.documentId &&
    stored.acknowledgedBy.senderUrl === args.senderUrl &&
    stored.acknowledgedBy.tabId === args.tabId
  );
}

export function persistPendingVideoPostRecordResult(
  result: VideoPostRecordResult
): Promise<VideoPostRecordResultStatus> {
  return runSerializedVideoRecordingAuthorityMutation(async (permit) => {
    if (!browserStorage.session.isAvailable()) {
      throw new Error('Session storage is unavailable for the post-record result.');
    }

    const current = await readStoredVideoPostRecordResult();
    if (current && isSameResult(current.result, result)) {
      return current.status;
    }
    if (current && (current.status === 'staged' || current.status === 'ready')) {
      throw new Error('The previous post-record result is still pending.');
    }

    const createdAt = Date.now();
    const persisted = toPersistedVideoPostRecordResult({
      acknowledgedBy: null,
      createdAt,
      expiresAt: null,
      result,
      status: 'staged',
    });
    await browserStorage.session.set({ [VIDEO_POST_RECORD_RESULT_STORAGE_KEY]: persisted }, permit);
    return 'staged';
  });
}

export function commitPendingVideoPostRecordResult(
  recordingId: string
): Promise<VideoPostRecordResultStatus | null> {
  return runSerializedVideoRecordingAuthorityMutation(async (permit) => {
    if (!browserStorage.session.isAvailable()) {
      throw new Error('Session storage is unavailable for the post-record result.');
    }

    const current = await readStoredVideoPostRecordResult();
    if (!current || current.result.recordingId !== recordingId) {
      return null;
    }
    if (current.status !== 'staged') {
      return current.status;
    }

    const ready = toPersistedVideoPostRecordResult({ ...current, status: 'ready' });
    await browserStorage.session.set({ [VIDEO_POST_RECORD_RESULT_STORAGE_KEY]: ready }, permit);
    return 'ready';
  });
}

export function clearPendingVideoPostRecordResult(recordingId?: string): Promise<boolean> {
  return runSerializedVideoRecordingAuthorityMutation(async (permit) => {
    if (!browserStorage.session.isAvailable()) {
      throw new Error('Session storage is unavailable for the post-record result.');
    }

    if (recordingId !== undefined) {
      const current = await readStoredVideoPostRecordResult();
      if (!current || current.result.recordingId !== recordingId) {
        return false;
      }
    }

    await browserStorage.session.remove(VIDEO_POST_RECORD_RESULT_STORAGE_KEY, permit);
    return true;
  });
}
