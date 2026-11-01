import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { isNativeHistoryPublicationGrant } from './guards';
import type { NativeHistoryPublicationGrant } from './contracts';
import { createNativeRecordingHistoryStore } from './store';
import { createRecordingCursorTrajectoryStore } from '../cursor-trajectory/store';
import { createRecordingEventsStore } from '../recording-events/store';
import { prepareRecordingCursorTrajectorySnapshot } from '../cursor-trajectory/snapshot';
import { prepareRecordingEventsSnapshot } from '../recording-events/snapshot';
import { createCursorTrajectoryStreamSink } from '../../../../features/video/project/cursor-trajectory/stream';
import { createRecordingEventsStreamSink } from '../../../../features/video/project/recording-events/stream';
import { parseRecordingTelemetryEntry } from '../telemetry.guards';
import type { RecordingTelemetryEntry } from '../contracts';
import { initDB } from '../../infrastructure/indexed-db/core';
import type {
  DurableAssetLifecyclePermit,
  PersistenceMutationTransitionPermit,
} from '../../infrastructure/mutation-barrier';
import {
  createAssetPublicationJournal,
  publishReadyJournalWithRetry,
  cancelAssetPublication,
  releaseAssetReadyProtection,
  discardPreparedAsset,
  readAssetFile,
  SupersededAssetPublicationError,
  type AssetReadyJournal,
  type AssetRef,
} from '../../assets';

interface NativeHistoryCommitCondition {
  native: NativeHistoryPublicationGrant;
  expectedTelemetrySha256: string | null;
  publicationId: string;
}
export interface NativeHistoryPublicationPorts {
  read(recordingId: string): Promise<RecordingTelemetryEntry | undefined>;
  hash(entry: RecordingTelemetryEntry | null): string | null;
  commit(
    entry: RecordingTelemetryEntry,
    condition: NativeHistoryCommitCondition,
    lifecyclePermit?: DurableAssetLifecyclePermit
  ): Promise<void>;
}
interface NativeHistoryJournalPayload {
  phase: 'native-prepare' | 'native-ready';
  grant: NativeHistoryPublicationGrant;
  entry: RecordingTelemetryEntry;
  expectedTelemetrySha256: string | null;
}
const DOMAIN = 'recording-cursor-snapshot';
function parsePayload(journal: AssetReadyJournal): NativeHistoryJournalPayload {
  const raw: unknown = journal.payload;
  if (
    journal.domain !== DOMAIN ||
    journal.operationId !== undefined ||
    !isPlainRecord(raw) ||
    Object.keys(raw).length !== 4 ||
    !['phase', 'grant', 'entry', 'expectedTelemetrySha256'].every((key) =>
      Object.hasOwn(raw, key)
    ) ||
    (raw['phase'] !== 'native-prepare' && raw['phase'] !== 'native-ready') ||
    !isNativeHistoryPublicationGrant(raw['grant'])
  )
    throw new Error('Invalid Native history publication journal.');
  const entry = parseRecordingTelemetryEntry(raw['entry']);
  const expected = raw['expectedTelemetrySha256'];
  if (
    !entry ||
    entry.recordingId !== raw['grant'].recordingId ||
    (expected !== null && (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected)))
  )
    throw new Error('Invalid Native history publication binding.');
  return { phase: raw['phase'], grant: raw['grant'], entry, expectedTelemetrySha256: expected };
}
/** Applies one source descriptor while retaining the other independently owned stream. */
export function withNativeHistoryDescriptor(
  base: RecordingTelemetryEntry,
  grant: NativeHistoryPublicationGrant
): RecordingTelemetryEntry {
  let entry: RecordingTelemetryEntry;
  if (grant.kind === 'cursor') {
    const { cursorTrajectory: _descriptor, cursorTrajectorySnapshot: _snapshot, ...rest } = base;
    entry = { ...rest, cursorTrajectory: grant.descriptor };
  } else {
    const { recordingEvents: _descriptor, recordingEventsSnapshot: _snapshot, ...rest } = base;
    entry = { ...rest, recordingEvents: grant.descriptor };
  }
  if (grant.descriptor.state === 'unavailable') {
    const id = `native-${grant.kind}-history-unavailable`;
    entry = {
      ...entry,
      signals: [
        ...entry.signals.filter((signal) => signal.id !== id),
        {
          id,
          kind: 'static-frame',
          startTime: 0,
          endTime: 0,
          point: null,
          data: {
            source: grant.kind === 'cursor' ? 'cursor-trajectory' : 'recording-events',
            code: 'source-unavailable',
            severity: 'warning',
          },
        },
      ],
    };
  }
  return entry;
}
async function alreadyPublished(grant: NativeHistoryPublicationGrant) {
  const intent = await createNativeRecordingHistoryStore().read(grant.recordingId);
  if (
    !intent ||
    intent.operationId !== grant.operationId ||
    intent.recordingAssetId !== grant.recordingAssetId
  )
    throw new SupersededAssetPublicationError();
  return (grant.kind === 'cursor' ? intent.cursor : intent.events)?.pull?.kind === 'published';
}
const selectedRef = (entry: RecordingTelemetryEntry, grant: NativeHistoryPublicationGrant) =>
  grant.kind === 'cursor'
    ? entry.cursorTrajectorySnapshot?.ref
    : entry.recordingEventsSnapshot?.ref;
function condition(
  payload: NativeHistoryJournalPayload,
  journal: AssetReadyJournal
): NativeHistoryCommitCondition {
  return {
    native: payload.grant,
    expectedTelemetrySha256: payload.expectedTelemetrySha256,
    publicationId: journal.journalId,
  };
}
async function publishReady(
  journal: AssetReadyJournal,
  payload: NativeHistoryJournalPayload,
  ports: NativeHistoryPublicationPorts,
  lifecyclePermit?: DurableAssetLifecyclePermit
) {
  const { entry, grant } = payload;
  const descriptor = grant.kind === 'cursor' ? entry.cursorTrajectory : entry.recordingEvents;
  if (
    !descriptor ||
    JSON.stringify(Object.entries(descriptor).sort()) !==
      JSON.stringify(Object.entries(grant.descriptor).sort())
  )
    throw new Error('Native history descriptor does not match its grant.');
  const ref = selectedRef(entry, grant);
  if (grant.descriptor.totalBlocks > 0) {
    if (
      !ref ||
      journal.assetRefs.length !== 1 ||
      JSON.stringify(journal.assetRefs[0]) !== JSON.stringify(ref)
    )
      throw new Error('Invalid Native history snapshot reference.');
  } else if (ref || journal.assetRefs.length)
    throw new Error('An empty history cannot contain a snapshot file.');
  if (await alreadyPublished(grant)) {
    await ports.commit(entry, condition(payload, journal), lifecyclePermit);
    await cancelAssetPublication(journal, lifecyclePermit);
    return;
  }
  if (ref) {
    const file = await readAssetFile(ref, grant.kind === 'cursor' ? 'cursor.bin' : 'events.bin');
    if (grant.kind === 'cursor') {
      const snapshot = entry.cursorTrajectorySnapshot;
      if (!snapshot) throw new Error('Missing Native cursor snapshot.');
      await file
        .stream()
        .pipeTo(
          createCursorTrajectoryStreamSink(
            { ...snapshot, descriptor: grant.descriptor },
            async () => {}
          )
        );
    } else {
      const snapshot = entry.recordingEventsSnapshot;
      if (!snapshot) throw new Error('Missing Native event snapshot.');
      await file
        .stream()
        .pipeTo(
          createRecordingEventsStreamSink(
            { ...snapshot, descriptor: grant.descriptor },
            async () => {}
          )
        );
    }
  }
  await ports.commit(entry, condition(payload, journal), lifecyclePermit);
  const actual = await ports.read(grant.recordingId);
  if (ref && actual && selectedRef(actual, grant)?.assetId !== ref.assetId) {
    await cancelAssetPublication(journal, lifecyclePermit);
    return;
  }
  await releaseAssetReadyProtection(journal.assetRefs.map((asset) => asset.assetId));
}

/** Replays the same Native prepare and commit path used by the live receiver. */
export async function publishNativeHistorySnapshotJournal(
  journal: AssetReadyJournal,
  ports: NativeHistoryPublicationPorts,
  lifecyclePermit?: DurableAssetLifecyclePermit,
  transitionPermit?: PersistenceMutationTransitionPermit
): Promise<void> {
  const payload = parsePayload(journal);
  if (payload.phase === 'native-ready')
    return publishReady(journal, payload, ports, lifecyclePermit);
  if (journal.assetRefs.length !== 0)
    throw new Error('Native preparation cannot claim snapshot files.');
  if (await alreadyPublished(payload.grant)) {
    await ports.commit(payload.entry, condition(payload, journal), lifecyclePermit);
    return;
  }
  if (
    ports.hash((await ports.read(payload.grant.recordingId)) ?? null) !==
    payload.expectedTelemetrySha256
  )
    throw new SupersededAssetPublicationError();
  const entry = structuredClone(payload.entry);
  const refs: AssetRef[] = [];
  let ready: AssetReadyJournal | null = null;
  const options = transitionPermit ? { persistenceTransitionPermit: transitionPermit } : {};
  try {
    const grant = payload.grant;
    if (grant.kind === 'cursor' && grant.writer) {
      const store = createRecordingCursorTrajectoryStore({
        database: initDB,
        mintGeneration: () => crypto.randomUUID(),
      });
      const snapshot = await prepareRecordingCursorTrajectorySnapshot(
        { store, identity: grant.writer, descriptor: grant.descriptor },
        options
      );
      refs.push(snapshot.ref);
      if (snapshot.writer.writerGeneration !== grant.writer.writerGeneration)
        throw new SupersededAssetPublicationError();
      entry.cursorTrajectorySnapshot = {
        ref: snapshot.ref,
        sourceRecordingId: snapshot.sourceRecordingId,
        width: snapshot.width,
        height: snapshot.height,
      };
    }
    if (grant.kind === 'events' && grant.writer) {
      const store = createRecordingEventsStore({
        database: initDB,
        mintGeneration: () => crypto.randomUUID(),
      });
      const snapshot = await prepareRecordingEventsSnapshot(
        { store, identity: grant.writer, descriptor: grant.descriptor },
        options
      );
      refs.push(snapshot.ref);
      if (snapshot.writer.writerGeneration !== grant.writer.writerGeneration)
        throw new SupersededAssetPublicationError();
      entry.recordingEventsSnapshot = {
        ref: snapshot.ref,
        sourceRecordingId: snapshot.sourceRecordingId,
      };
    }
    ready = await createAssetPublicationJournal({
      domain: DOMAIN,
      assetRefs: refs,
      payload: { ...payload, phase: 'native-ready', entry },
      ...(lifecyclePermit ? { lifecyclePermit } : {}),
    });
    await publishReadyJournalWithRetry(
      ready,
      (candidate, permit) =>
        publishNativeHistorySnapshotJournal(candidate, ports, permit, transitionPermit),
      lifecyclePermit
    );
  } catch (error) {
    if (!ready) {
      const cleanup = await Promise.allSettled(
        refs.map((ref) => discardPreparedAsset(ref.assetId))
      );
      const failures = cleanup.flatMap((result) =>
        result.status === 'rejected' ? [result.reason as unknown] : []
      );
      if (failures.length)
        throw new AggregateError(
          [error, ...failures],
          'Native history preparation cleanup failed.',
          { cause: error }
        );
    }
    throw error;
  }
}
