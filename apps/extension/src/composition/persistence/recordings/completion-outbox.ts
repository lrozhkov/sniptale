import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import { initDB, STATE_MANAGER_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';

const VIDEO_RECORDING_COMPLETION_OUTBOX_DOMAIN = 'video-recording-completion-outbox';
const VIDEO_RECORDING_COMPLETION_OUTBOX_KEY = 'pending';

const VIDEO_RECORDING_COMPLETION_OUTBOX_VERSION = 1;

interface VideoRecordingCompletionOutboxRecord {
  domain: typeof VIDEO_RECORDING_COMPLETION_OUTBOX_DOMAIN;
  key: typeof VIDEO_RECORDING_COMPLETION_OUTBOX_KEY;
  updatedAtEpochMs: number;
  value: VideoPostRecordResult & {
    version: typeof VIDEO_RECORDING_COMPLETION_OUTBOX_VERSION;
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0;
}

function parseVideoPostRecordResult(value: unknown): VideoPostRecordResult | null {
  if (
    !isRecord(value) ||
    value['version'] !== VIDEO_RECORDING_COMPLETION_OUTBOX_VERSION ||
    !isNonEmptyString(value['recordingId']) ||
    !isNonEmptyString(value['primaryRecordingId']) ||
    !(value['projectId'] === null || isNonEmptyString(value['projectId']))
  ) {
    return null;
  }

  return {
    primaryRecordingId: value['primaryRecordingId'],
    projectId: value['projectId'],
    recordingId: value['recordingId'],
  };
}

export function parseVideoRecordingCompletionOutboxRecord(
  value: unknown
): VideoPostRecordResult | null {
  if (
    !isRecord(value) ||
    value['domain'] !== VIDEO_RECORDING_COMPLETION_OUTBOX_DOMAIN ||
    value['key'] !== VIDEO_RECORDING_COMPLETION_OUTBOX_KEY ||
    typeof value['updatedAtEpochMs'] !== 'number' ||
    !Number.isFinite(value['updatedAtEpochMs'])
  ) {
    return null;
  }

  return parseVideoPostRecordResult(value['value']);
}

export function createVideoRecordingCompletionOutboxRecord(
  result: VideoPostRecordResult,
  updatedAtEpochMs = Date.now()
): VideoRecordingCompletionOutboxRecord {
  const parsed = parseVideoPostRecordResult({
    ...result,
    version: VIDEO_RECORDING_COMPLETION_OUTBOX_VERSION,
  });
  if (!parsed || !Number.isFinite(updatedAtEpochMs)) {
    throw new Error('Invalid video recording completion outbox result.');
  }

  return {
    domain: VIDEO_RECORDING_COMPLETION_OUTBOX_DOMAIN,
    key: VIDEO_RECORDING_COMPLETION_OUTBOX_KEY,
    updatedAtEpochMs,
    value: {
      ...parsed,
      version: VIDEO_RECORDING_COMPLETION_OUTBOX_VERSION,
    },
  };
}

function isSameResult(left: VideoPostRecordResult, right: VideoPostRecordResult): boolean {
  return (
    left.primaryRecordingId === right.primaryRecordingId &&
    left.projectId === right.projectId &&
    left.recordingId === right.recordingId
  );
}

export async function readVideoRecordingCompletionOutbox(): Promise<VideoPostRecordResult | null> {
  const db = await initDB();
  const value: unknown = await db.get(STATE_MANAGER_STORE, [
    VIDEO_RECORDING_COMPLETION_OUTBOX_DOMAIN,
    VIDEO_RECORDING_COMPLETION_OUTBOX_KEY,
  ]);
  return parseVideoRecordingCompletionOutboxRecord(value);
}

export async function updateVideoRecordingCompletionOutbox(
  result: VideoPostRecordResult
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(STATE_MANAGER_STORE, 'readwrite');
    const store = tx.objectStore(STATE_MANAGER_STORE);
    const current = parseVideoRecordingCompletionOutboxRecord(
      await store.get([
        VIDEO_RECORDING_COMPLETION_OUTBOX_DOMAIN,
        VIDEO_RECORDING_COMPLETION_OUTBOX_KEY,
      ])
    );
    if (
      !current ||
      current.recordingId !== result.recordingId ||
      current.primaryRecordingId !== result.primaryRecordingId
    ) {
      throw new Error('The exact video recording completion outbox result is unavailable.');
    }
    await store.put(createVideoRecordingCompletionOutboxRecord(result));
    await tx.done;
  });
}

export async function removeVideoRecordingCompletionOutbox(
  result: VideoPostRecordResult
): Promise<boolean> {
  return runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(STATE_MANAGER_STORE, 'readwrite');
    const store = tx.objectStore(STATE_MANAGER_STORE);
    const key: [string, string] = [
      VIDEO_RECORDING_COMPLETION_OUTBOX_DOMAIN,
      VIDEO_RECORDING_COMPLETION_OUTBOX_KEY,
    ];
    const current = parseVideoRecordingCompletionOutboxRecord(await store.get(key));
    if (!current || !isSameResult(current, result)) {
      await tx.done;
      return false;
    }
    await store.delete(key);
    await tx.done;
    return true;
  });
}
