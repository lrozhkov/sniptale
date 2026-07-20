import { initDB, RECORDING_TELEMETRY_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseRecordingTelemetryEntry } from './telemetry.guards.ts';
import type { RecordingTelemetryEntry } from './contracts';

const logger = createLogger({ namespace: 'SharedRecordingTelemetryDb' });

export async function saveRecordingTelemetry(entry: RecordingTelemetryEntry): Promise<void> {
  await runWithIndexedDbMutation((db) => db.put(RECORDING_TELEMETRY_STORE, entry));
}

export async function getRecordingTelemetry(
  recordingId: string
): Promise<RecordingTelemetryEntry | undefined> {
  const db = await initDB();
  const rawEntry: unknown = await db.get(RECORDING_TELEMETRY_STORE, recordingId);
  const entry = parseRecordingTelemetryEntry(rawEntry);

  if (!entry && rawEntry !== undefined) {
    logger.warn('Ignoring invalid recording telemetry entry from IndexedDB', {
      recordingId,
    });
  }

  return entry ?? undefined;
}

export async function deleteRecordingTelemetry(recordingId: string): Promise<void> {
  await runWithIndexedDbMutation((db) => db.delete(RECORDING_TELEMETRY_STORE, recordingId));
}
