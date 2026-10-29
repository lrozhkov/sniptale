import { captureMediaInTransaction } from '../sync-capture/capture';
import { createRecordingMediaId } from '../../../features/media-hub/media-id';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  SYNC_CAPTURE_STORE,
  MEDIA_LIBRARY_STORE,
  STORE_NAME,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  PROJECT_ASSETS_STORE,
  IMAGE_WORKSPACES_STORE,
  VIDEO_WORKSPACES_STORE,
  VIDEO_WORKSPACE_HISTORY_STORE,
  VIDEO_WORKSPACE_DRAFTS_STORE,
  THUMBNAILS_STORE,
  AGGREGATE_PRESENTATIONS_STORE,
} from '../infrastructure/indexed-db/core.stores';
import {
  normalizeRecordingActions,
  normalizeRecordingSignals,
} from '../../../features/video/project/recording-actions';
import { initDB, RECORDING_TELEMETRY_STORE } from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import { createLogger } from '@sniptale/platform/observability/logger';
import { parseRecordingTelemetryEntry } from './telemetry.guards.ts';
import type { RecordingTelemetryEntry } from './contracts';

const logger = createLogger({ namespace: 'SharedRecordingTelemetryDb' });

export async function saveRecordingTelemetry(entry: RecordingTelemetryEntry): Promise<void> {
  const parsedEntry = parseRecordingTelemetryEntry(entry);
  if (!parsedEntry) {
    throw new Error('Invalid recording telemetry entry.');
  }
  await mutateRecordingTelemetry(parsedEntry.recordingId, normalizeTelemetry(parsedEntry));
}

export async function getRecordingTelemetry(
  recordingId: string
): Promise<RecordingTelemetryEntry | undefined> {
  const db = await initDB();
  const rawEntry: unknown = await db.get(RECORDING_TELEMETRY_STORE, recordingId);
  const entry = parseRecordingTelemetryEntry(rawEntry);

  if ((!entry || entry.recordingId !== recordingId) && rawEntry !== undefined) {
    logger.warn('Ignoring invalid recording telemetry entry from IndexedDB', {
      recordingId,
    });
  }

  return entry?.recordingId === recordingId ? normalizeTelemetry(entry) : undefined;
}

export async function deleteRecordingTelemetry(recordingId: string): Promise<void> {
  await mutateRecordingTelemetry(recordingId, null);
}

async function mutateRecordingTelemetry(
  recordingId: string,
  entry: RecordingTelemetryEntry | null
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const tx = db.transaction(
      [
        RECORDING_TELEMETRY_STORE,
        SYNC_CAPTURE_STORE,
        MEDIA_LIBRARY_STORE,
        STORE_NAME,
        ASSET_REFS_STORE,
        ASSET_OWNERS_STORE,
        PROJECT_ASSETS_STORE,
        IMAGE_WORKSPACES_STORE,
        VIDEO_WORKSPACES_STORE,
        VIDEO_WORKSPACE_HISTORY_STORE,
        VIDEO_WORKSPACE_DRAFTS_STORE,
        THUMBNAILS_STORE,
        AGGREGATE_PRESENTATIONS_STORE,
      ],
      'readwrite'
    );
    try {
      const telemetry = tx.objectStore(RECORDING_TELEMETRY_STORE);
      if (entry) await telemetry.put(entry);
      else await telemetry.delete(recordingId);
      const mediaId = createRecordingMediaId(recordingId);
      const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
      // Telemetry can precede canonical publication; recovery sources are not saved Library roots.
      if (media?.source.kind === 'recording' && media.source.recordingId === recordingId)
        await captureMediaInTransaction(tx, mediaId);
      await tx.done;
    } catch (error) {
      await abortIndexedDbMutation(tx, error);
    }
  });
}

function normalizeTelemetry(entry: RecordingTelemetryEntry): RecordingTelemetryEntry {
  return {
    ...entry,
    actionEvents: normalizeRecordingActions(entry.actionEvents),
    signals: normalizeRecordingSignals(entry.signals),
  };
}
