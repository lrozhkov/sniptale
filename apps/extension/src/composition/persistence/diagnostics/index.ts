import type {
  DiagnosticsEntry,
  DiagnosticEventChunk,
} from '@sniptale/platform/observability/diagnostics/types';
import {
  DIAGNOSTICS_EVENTS_STORE,
  DIAGNOSTICS_META_STORE,
  initDB,
} from '../infrastructure/indexed-db/core';
import { runWithIndexedDbMutation } from '../infrastructure/indexed-db/mutation';
import {
  DIAGNOSTICS_EVENTS_PER_CHUNK,
  parseDiagnosticsChunk,
  parseDiagnosticsMeta,
} from './index.guards.ts';

function createDiagnosticsCorruptionError(recordingId: string, reason: string): Error {
  return new Error(`Diagnostics data is corrupted for ${recordingId}: ${reason}.`);
}

export async function saveDiagnostics(
  entry: Omit<DiagnosticsEntry, 'chunksCount' | 'totalEvents'>,
  events: DiagnosticEventChunk['events']
): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    if (
      !db.objectStoreNames.contains(DIAGNOSTICS_META_STORE) ||
      !db.objectStoreNames.contains(DIAGNOSTICS_EVENTS_STORE)
    ) {
      throw new Error('Diagnostics stores not found. Need to recreate database.');
    }

    const chunks: DiagnosticEventChunk[] = [];
    for (let index = 0; index < events.length; index += DIAGNOSTICS_EVENTS_PER_CHUNK) {
      chunks.push({
        recordingId: entry.recordingId,
        chunkIndex: Math.floor(index / DIAGNOSTICS_EVENTS_PER_CHUNK),
        events: events.slice(index, index + DIAGNOSTICS_EVENTS_PER_CHUNK),
      });
    }

    const metaEntry: DiagnosticsEntry = {
      ...entry,
      totalEvents: events.length,
      chunksCount: chunks.length,
    };

    const tx = db.transaction([DIAGNOSTICS_META_STORE, DIAGNOSTICS_EVENTS_STORE], 'readwrite');
    await tx.objectStore(DIAGNOSTICS_META_STORE).put(metaEntry);

    const eventsStore = tx.objectStore(DIAGNOSTICS_EVENTS_STORE);
    for (const chunk of chunks) {
      await eventsStore.put(chunk);
    }

    await tx.done;
  });
}

export async function getDiagnosticsMeta(
  recordingId: string
): Promise<DiagnosticsEntry | undefined> {
  const db = await initDB();
  const meta: unknown = await db.get(DIAGNOSTICS_META_STORE, recordingId);
  if (meta === undefined) {
    return undefined;
  }
  const parsed = parseDiagnosticsMeta(meta);
  if (!parsed || parsed.recordingId !== recordingId) {
    throw createDiagnosticsCorruptionError(recordingId, 'invalid metadata');
  }
  return parsed;
}

export async function getDiagnosticsEvents(
  recordingId: string
): Promise<DiagnosticEventChunk['events']> {
  const db = await initDB();
  const meta = await getDiagnosticsMeta(recordingId);

  if (!meta) {
    return [];
  }

  const events: DiagnosticEventChunk['events'] = [];
  for (let index = 0; index < meta.chunksCount; index += 1) {
    const chunk: unknown = await db.get(DIAGNOSTICS_EVENTS_STORE, [recordingId, index]);
    const parsedChunk = parseDiagnosticsChunk(chunk, recordingId, index);
    if (!parsedChunk) {
      throw createDiagnosticsCorruptionError(recordingId, `missing chunk ${index}`);
    }

    events.push(...parsedChunk.events);
  }

  if (events.length !== meta.totalEvents) {
    throw createDiagnosticsCorruptionError(
      recordingId,
      `expected ${meta.totalEvents} events but loaded ${events.length}`
    );
  }

  return events;
}

export async function getDiagnostics(
  recordingId: string
): Promise<{ meta: DiagnosticsEntry; events: DiagnosticEventChunk['events'] } | null> {
  const meta = await getDiagnosticsMeta(recordingId);
  if (!meta) {
    return null;
  }

  const events = await getDiagnosticsEvents(recordingId);
  return { meta, events };
}

export async function deleteDiagnostics(recordingId: string): Promise<void> {
  await runWithIndexedDbMutation(async (db) => {
    const rawMeta: unknown = await db.get(DIAGNOSTICS_META_STORE, recordingId);
    const meta = parseDiagnosticsMeta(rawMeta);
    const tx = db.transaction([DIAGNOSTICS_META_STORE, DIAGNOSTICS_EVENTS_STORE], 'readwrite');

    await tx.objectStore(DIAGNOSTICS_META_STORE).delete(recordingId);

    if (meta) {
      const eventsStore = tx.objectStore(DIAGNOSTICS_EVENTS_STORE);
      for (let index = 0; index < meta.chunksCount; index += 1) {
        await eventsStore.delete([recordingId, index]);
      }
    }

    await tx.done;
  });
}

export async function cleanupOldDiagnostics(maxAgeDays = 7): Promise<number> {
  const db = await initDB();
  const cutoff = new Date(Date.now() - maxAgeDays * 24 * 60 * 60 * 1000).toISOString();
  const allMeta = (await db.getAll(DIAGNOSTICS_META_STORE)).flatMap((value) => {
    const meta = parseDiagnosticsMeta(value);
    return meta ? [meta] : [];
  });

  let deleted = 0;
  for (const meta of allMeta) {
    if (meta.createdAt < cutoff) {
      await deleteDiagnostics(meta.recordingId);
      deleted += 1;
    }
  }

  return deleted;
}
