import { buildRecordingMediaEntry } from '../media-library/entry-mapping';
import {
  MEDIA_LIBRARY_STORE,
  STATE_MANAGER_STORE,
  STORE_NAME,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import type { VideoPostRecordResult } from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingEntry } from './contracts';
import { createVideoRecordingCompletionOutboxRecord } from './completion-outbox';

export interface SaveRecordingBatchInput {
  blob: Blob;
  createdAt?: number;
  filename: string;
  id: string;
}

function createRecordingBatchEntries(inputs: readonly SaveRecordingBatchInput[]): RecordingEntry[] {
  const defaultCreatedAt = Date.now();
  const ids = new Set<string>();
  return inputs.map((input) => {
    if (input.id.trim().length === 0) throw new Error('Recording ID must not be empty.');
    if (input.filename.trim().length === 0)
      throw new Error('Recording filename must not be empty.');
    if (ids.has(input.id)) throw new Error(`Duplicate recording ID in batch: ${input.id}.`);
    ids.add(input.id);
    return {
      id: input.id,
      blob: input.blob,
      filename: input.filename,
      createdAt: input.createdAt ?? defaultCreatedAt,
      size: input.blob.size,
    };
  });
}

async function saveRecordingEntries(
  inputs: readonly SaveRecordingBatchInput[],
  completion: VideoPostRecordResult | null
): Promise<RecordingEntry[]> {
  const entries = createRecordingBatchEntries(inputs);
  if (completion && !entries.some((entry) => entry.id === completion.primaryRecordingId)) {
    throw new Error('The primary completed recording is not present in the media batch.');
  }
  if (entries.length === 0) return [];

  return runWithIndexedDbMutation(async (db) => {
    const storeNames = completion
      ? ([STORE_NAME, MEDIA_LIBRARY_STORE, STATE_MANAGER_STORE] as const)
      : ([STORE_NAME, MEDIA_LIBRARY_STORE] as const);
    const tx = db.transaction(storeNames, 'readwrite');
    const recordingsStore = tx.objectStore(STORE_NAME);
    const mediaStore = tx.objectStore(MEDIA_LIBRARY_STORE);
    try {
      for (const entry of entries) {
        await recordingsStore.put(entry);
        await mediaStore.put(buildRecordingMediaEntry(entry));
      }
      if (completion) {
        await tx
          .objectStore(STATE_MANAGER_STORE)
          .add(createVideoRecordingCompletionOutboxRecord(completion));
      }
      await tx.done;
      return entries;
    } catch (error) {
      try {
        tx.abort();
      } catch {
        // The request failure may already have aborted the transaction.
      }
      await tx.done.catch(() => undefined);
      throw error;
    }
  });
}

export function saveRecordingsBatch(
  inputs: readonly SaveRecordingBatchInput[]
): Promise<RecordingEntry[]> {
  return saveRecordingEntries(inputs, null);
}

export function saveRecordingsBatchWithCompletion(
  inputs: readonly SaveRecordingBatchInput[],
  completion: VideoPostRecordResult
): Promise<RecordingEntry[]> {
  return saveRecordingEntries(inputs, completion);
}
