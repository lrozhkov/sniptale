import { putHistorySnapshotOwner, discardHistorySnapshotCopies } from './history-snapshot-binding';
import {
  publishNativeHistoryInTransaction,
  createNativeHistoryPublicationGrant,
} from './native-history/publication';
import {
  publishNativeHistorySnapshotJournal,
  withNativeHistoryDescriptor,
  type NativeHistoryPublicationPorts,
} from './native-history/snapshot-publication';
import { createNativeRecordingHistoryStore } from './native-history/store';
import { retireNativeRecordingHistoryInTransaction } from './native-history/retirement';
import type { NativeHistoryPublicationGrant } from './native-history/contracts';
import { createRecordingEventsStore } from './recording-events/store';
import { prepareRecordingEventsSnapshot } from './recording-events/snapshot';
import { isRecordingEventsHead, isRecordingEventsIdentity } from './recording-events/guards';
import { linkRecordingEventsSnapshotInTransaction } from './recording-events/publication';
import {
  retireRecordingEventSourcesInTransaction,
  retireRecordingEventsInTransaction,
} from './recording-events/retirement';
import {
  RECORDING_EVENTS_SNAPSHOT_ROLE,
  type RecordingEventsWriter,
} from './recording-events/contracts';
import { createRecordingEventsStreamSink } from '../../../features/video/project/recording-events/stream';
import { sha256 } from '@noble/hashes/sha2.js';
import { isPlainRecord } from '@sniptale/runtime-contracts/validation/primitives';
import { createRecordingCursorTrajectoryStore } from './cursor-trajectory/store';
import { prepareRecordingCursorTrajectorySnapshot } from './cursor-trajectory/snapshot';
import { isCursorTrajectoryHead, isCursorTrajectoryIdentity } from './cursor-trajectory/guards';
import {
  retireRecordingCursorTrajectoriesInTransaction,
  retireCursorTrajectoryInTransaction,
} from './cursor-trajectory/retirement';
import { linkCursorTrajectorySnapshotInTransaction } from './cursor-trajectory/publication';
import {
  RECORDING_CURSOR_SNAPSHOT_ROLE,
  type RecordingCursorTrajectoryWriter,
} from './cursor-trajectory/contracts';
import { createCursorTrajectoryStreamSink } from '../../../features/video/project/cursor-trajectory/stream';
import { createStrictRecordingTransaction } from './recovery/transaction';
import { parseAssetRef, parseAssetOwner } from '../assets/guards';
import {
  createAssetPublicationJournal,
  publishReadyJournalWithRetry,
  readAssetFile,
  deleteReadyJournal,
  cancelAssetPublication,
  SupersededAssetPublicationError,
  buildPhysicalDeleteOperation,
  completePhysicalDeleteOperation,
  releaseAssetReadyProtection,
  type AssetReadyJournal,
  type AssetRef,
  type AssetPublicationAdapter,
  type PhysicalDeleteAssetOperation,
} from '../assets';
import type { IndexedDbWriteTransaction } from '../infrastructure/indexed-db/core';
import {
  runWithPersistenceMutationTransition,
  runWithPersistenceMutationTransitionRecovery,
  runWithDurableAssetLifecycleLock,
  type DurableAssetLifecyclePermit,
  type PersistenceMutationTransitionPermit,
} from '../infrastructure/mutation-barrier';
import { captureMediaInTransaction } from '../sync-capture/capture';
import { createRecordingMediaId } from '../../../features/media-hub/media-id';
import { parseMediaLibraryEntry } from '../media-library/read-guards';
import { abortIndexedDbMutation } from '../infrastructure/indexed-db/transaction';
import {
  SYNC_CAPTURE_STORE,
  ASSET_OPERATIONS_STORE,
  RECORDING_CURSOR_TRAJECTORIES_STORE,
  RECORDING_CURSOR_BLOCKS_STORE,
  RECORDING_EVENTS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
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
const CURSOR_SNAPSHOT_DOMAIN = 'recording-cursor-snapshot';
const descriptorKeys = [
  'trajectoryId',
  'state',
  'finalized',
  'totalBlocks',
  'totalRecords',
  'totalSamples',
  'totalBytes',
  'streamSha256',
] as const;

export async function saveRecordingTelemetry(entry: RecordingTelemetryEntry): Promise<void> {
  const parsedEntry = parseRecordingTelemetryEntry(entry);
  if (!parsedEntry) {
    throw new Error('Invalid recording telemetry entry.');
  }
  const {
    cursorTrajectorySnapshot: _untrustedSnapshot,
    recordingEventsSnapshot: _untrustedEventsSnapshot,
    ...facts
  } = normalizeTelemetry(parsedEntry);
  if (
    (facts.recordingEvents?.totalBlocks ?? 0) > 0 ||
    (facts.cursorTrajectory?.totalBlocks ?? 0) > 0
  ) {
    await saveTelemetryHistory(facts);
    return;
  }
  await mutateRecordingTelemetry(facts.recordingId, facts);
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
  entry: RecordingTelemetryEntry | null,
  condition?: {
    expectedTelemetrySha256: string | null;
    native?: NativeHistoryPublicationGrant;
    writer?: RecordingCursorTrajectoryWriter;
    eventsWriter?: RecordingEventsWriter;
    publicationId?: string;
  },
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<void> {
  const physicalDelete = buildPhysicalDeleteOperation([]);
  await runWithIndexedDbMutation(async (db) => {
    const stores = [
      RECORDING_TELEMETRY_STORE,
      SYNC_CAPTURE_STORE,
      MEDIA_LIBRARY_STORE,
      STORE_NAME,
      ASSET_REFS_STORE,
      ASSET_OWNERS_STORE,
      ASSET_OPERATIONS_STORE,
      RECORDING_CURSOR_TRAJECTORIES_STORE,
      RECORDING_CURSOR_BLOCKS_STORE,
      RECORDING_EVENTS_STORE,
      NATIVE_TRANSFER_SESSIONS_STORE,
      PROJECT_ASSETS_STORE,
      IMAGE_WORKSPACES_STORE,
      VIDEO_WORKSPACES_STORE,
      VIDEO_WORKSPACE_HISTORY_STORE,
      VIDEO_WORKSPACE_DRAFTS_STORE,
      THUMBNAILS_STORE,
      AGGREGATE_PRESENTATIONS_STORE,
    ];
    const tx = condition
      ? createStrictRecordingTransaction(db, stores)
      : db.transaction(stores, 'readwrite');
    try {
      const telemetry = tx.objectStore(RECORDING_TELEMETRY_STORE);
      const raw: unknown = await telemetry.get(recordingId);
      const current = parseRecordingTelemetryEntry(raw);
      if (condition?.native) {
        if (!entry) throw new Error('Native publication requires recording telemetry.');
        const published = await publishNativeHistoryInTransaction(
          tx,
          condition.native,
          entry,
          current
        );
        if (published.alreadyPublished) {
          await tx.done;
          return;
        }
        condition = {
          expectedTelemetrySha256: condition.expectedTelemetrySha256,
          native: condition.native,
          ...(condition.publicationId ? { publicationId: condition.publicationId } : {}),
          ...(published.writer ? { writer: published.writer } : {}),
          ...(published.eventsWriter ? { eventsWriter: published.eventsWriter } : {}),
        };
      }
      if (!entry) await retireNativeRecordingHistoryInTransaction(tx, recordingId);

      if (condition && entry?.cursorTrajectory && entry.cursorTrajectorySnapshot) {
        if (!condition.writer)
          throw new Error('Cursor publication requires its source generation.');
        const source: unknown = await tx
          .objectStore(RECORDING_CURSOR_TRAJECTORIES_STORE)
          .get([recordingId, entry.cursorTrajectory.trajectoryId]);
        if (
          !isCursorTrajectoryHead(source) ||
          source.retired ||
          source.stagingJournalId !== undefined ||
          !source.finalized ||
          source.writerGeneration !== condition.writer.writerGeneration ||
          source.recordingId !== recordingId ||
          !descriptorKeys.every((key) =>
            key === 'trajectoryId'
              ? source.trajectoryId === entry.cursorTrajectory?.trajectoryId
              : source[key] === entry.cursorTrajectory?.[key]
          ) ||
          source.sourceRecordingId !== entry.cursorTrajectorySnapshot.sourceRecordingId ||
          source.width !== entry.cursorTrajectorySnapshot.width ||
          source.height !== entry.cursorTrajectorySnapshot.height
        )
          throw new SupersededAssetPublicationError();
        if (
          current?.cursorTrajectorySnapshot?.ref.assetId ===
            entry.cursorTrajectorySnapshot.ref.assetId &&
          sameDescriptor(current.cursorTrajectory, entry.cursorTrajectory)
        ) {
          await assertSnapshotBinding(tx, recordingId, current.cursorTrajectorySnapshot.ref);
        }
      }
      if (condition && entry?.recordingEvents && entry.recordingEventsSnapshot) {
        if (!condition.eventsWriter)
          throw new Error('Event publication requires its source generation.');
        const source: unknown = await tx
          .objectStore(RECORDING_EVENTS_STORE)
          .get([recordingId, entry.recordingEvents.eventStreamId, 'head', 0]);
        if (
          !isRecordingEventsHead(source) ||
          source.retired ||
          source.stagingJournalId !== undefined ||
          !source.finalized ||
          source.writerGeneration !== condition.eventsWriter.writerGeneration ||
          source.sourceRecordingId !== entry.recordingEventsSnapshot.sourceRecordingId ||
          !sameEventDescriptor(source, entry.recordingEvents)
        )
          throw new SupersededAssetPublicationError();
        if (
          current?.recordingEventsSnapshot?.ref.assetId ===
            entry.recordingEventsSnapshot.ref.assetId &&
          sameEventDescriptor(current.recordingEvents, entry.recordingEvents)
        )
          await assertSnapshotBinding(
            tx,
            recordingId,
            current.recordingEventsSnapshot.ref,
            RECORDING_EVENTS_SNAPSHOT_ROLE
          );
      }
      if (condition) {
        const sameCursor = entry?.cursorTrajectorySnapshot
          ? current?.cursorTrajectorySnapshot?.ref.assetId ===
              entry.cursorTrajectorySnapshot.ref.assetId &&
            sameDescriptor(current.cursorTrajectory, entry.cursorTrajectory)
          : !current?.cursorTrajectorySnapshot;
        const sameEvents = entry?.recordingEventsSnapshot
          ? current?.recordingEventsSnapshot?.ref.assetId ===
              entry.recordingEventsSnapshot.ref.assetId &&
            sameEventDescriptor(current.recordingEvents, entry.recordingEvents)
          : !current?.recordingEventsSnapshot;
        if (!condition.native && condition.publicationId && sameCursor && sameEvents) {
          await tx.done;
          return;
        }
        if (
          (raw !== undefined && !current) ||
          telemetryHash(current ? normalizeTelemetry(current) : null) !==
            condition.expectedTelemetrySha256
        )
          throw new SupersededAssetPublicationError();
      }
      if (
        entry &&
        current?.cursorTrajectory &&
        current.cursorTrajectory.totalBlocks > 0 &&
        (!entry.cursorTrajectory || entry.cursorTrajectory.totalBlocks === 0)
      )
        throw new SupersededAssetPublicationError();
      if (
        entry &&
        current?.recordingEvents &&
        current.recordingEvents.totalBlocks > 0 &&
        (!entry.recordingEvents || entry.recordingEvents.totalBlocks === 0)
      )
        throw new SupersededAssetPublicationError();
      if (!entry)
        await retireRecordingEventSourcesInTransaction(
          tx,
          recordingId,
          current?.recordingEvents?.eventStreamId
        );
      if (
        entry &&
        current?.recordingEventsSnapshot &&
        current.recordingEvents &&
        current.recordingEvents.eventStreamId !== entry.recordingEvents?.eventStreamId
      )
        await retireRecordingEventsInTransaction(
          tx,
          { recordingId, eventStreamId: current.recordingEvents.eventStreamId },
          () => crypto.randomUUID()
        );
      if (
        !entry ||
        current?.recordingEventsSnapshot?.ref.assetId !==
          entry?.recordingEventsSnapshot?.ref.assetId
      )
        await releaseSnapshotOwner(tx, recordingId, physicalDelete, RECORDING_EVENTS_SNAPSHOT_ROLE);
      if (!entry)
        await retireRecordingCursorTrajectoriesInTransaction(
          tx,
          recordingId,
          current?.cursorTrajectory?.trajectoryId
        );
      if (
        entry &&
        current?.cursorTrajectorySnapshot &&
        current.cursorTrajectory &&
        current.cursorTrajectory.trajectoryId !== entry.cursorTrajectory?.trajectoryId
      )
        await retireCursorTrajectoryInTransaction(
          tx,
          { recordingId, trajectoryId: current.cursorTrajectory.trajectoryId },
          () => crypto.randomUUID()
        );
      if (
        !entry ||
        current?.cursorTrajectorySnapshot?.ref.assetId !==
          entry?.cursorTrajectorySnapshot?.ref.assetId
      )
        await releaseSnapshotOwner(tx, recordingId, physicalDelete);
      if (entry?.cursorTrajectorySnapshot) {
        if (!condition)
          throw new Error('Cursor snapshot publication requires its source precondition.');
        const ref = entry.cursorTrajectorySnapshot.ref;
        await putHistorySnapshotOwner(
          tx,
          recordingId,
          RECORDING_CURSOR_SNAPSHOT_ROLE,
          ref,
          sameRef
        );
      }
      if (entry?.recordingEventsSnapshot) {
        if (!condition?.eventsWriter)
          throw new Error('Event publication requires its source generation.');
        const ref = entry.recordingEventsSnapshot.ref;
        await putHistorySnapshotOwner(
          tx,
          recordingId,
          RECORDING_EVENTS_SNAPSHOT_ROLE,
          ref,
          sameRef
        );
        await linkRecordingEventsSnapshotInTransaction(tx, condition.eventsWriter, ref.assetId);
      }
      if (entry?.cursorTrajectorySnapshot && condition?.writer)
        await linkCursorTrajectorySnapshotInTransaction(
          tx,
          condition.writer,
          entry.cursorTrajectorySnapshot.ref.assetId
        );
      if (entry) await telemetry.put(entry);
      else await telemetry.delete(recordingId);
      const mediaId = createRecordingMediaId(recordingId);
      const media = parseMediaLibraryEntry(await tx.objectStore(MEDIA_LIBRARY_STORE).get(mediaId));
      // Telemetry can precede canonical publication; recovery sources are not saved Library roots.
      if (media?.source.kind === 'recording' && media.source.recordingId === recordingId)
        await captureMediaInTransaction(
          tx,
          mediaId,
          condition?.publicationId ? { publicationId: condition.publicationId } : {}
        );
      if (physicalDelete.assetIds.length)
        await tx.objectStore(ASSET_OPERATIONS_STORE).put(physicalDelete);
      await tx.done;
    } catch (error) {
      await abortIndexedDbMutation(tx, error);
    }
  });
  if (physicalDelete.assetIds.length)
    await completePhysicalDeleteOperation(physicalDelete, lifecyclePermit).catch((error: unknown) =>
      logger.warn('Cursor snapshot cleanup is pending', { error })
    );
}

function normalizeTelemetry(entry: RecordingTelemetryEntry): RecordingTelemetryEntry {
  return {
    ...entry,
    actionEvents: normalizeRecordingActions(entry.actionEvents),
    signals: normalizeRecordingSignals(entry.signals),
  };
}

function telemetryHash(entry: RecordingTelemetryEntry | null): string | null {
  if (entry === null) return null;
  return Array.from(sha256(new TextEncoder().encode(JSON.stringify(entry))), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
}
function sameDescriptor(
  left:
    | Pick<
        NonNullable<RecordingTelemetryEntry['cursorTrajectory']>,
        (typeof descriptorKeys)[number]
      >
    | undefined,
  right:
    | Pick<
        NonNullable<RecordingTelemetryEntry['cursorTrajectory']>,
        (typeof descriptorKeys)[number]
      >
    | undefined
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    descriptorKeys.every((key) => left[key] === right[key])
  );
}
function sameRef(left: AssetRef | null, right: AssetRef): boolean {
  return (
    left !== null &&
    left.assetId === right.assetId &&
    left.createdAt === right.createdAt &&
    left.size === right.size &&
    left.mimeType === right.mimeType &&
    left.sha256 === right.sha256 &&
    left.location.objectKey === right.location.objectKey
  );
}
async function assertSnapshotBinding(
  tx: IndexedDbWriteTransaction,
  recordingId: string,
  ref: AssetRef,
  role: string = RECORDING_CURSOR_SNAPSHOT_ROLE
): Promise<void> {
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get(['recording', recordingId, role])
  );
  const registered = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(ref.assetId));
  if (
    !owner ||
    owner.assetId !== ref.assetId ||
    owner.ownerId !== recordingId ||
    owner.ownerKind !== 'recording' ||
    owner.role !== role ||
    !sameRef(registered, ref)
  )
    throw new Error('Cursor snapshot ownership is inconsistent.');
}
async function releaseSnapshotOwner(
  tx: IndexedDbWriteTransaction,
  recordingId: string,
  physicalDelete: PhysicalDeleteAssetOperation,
  role: string = RECORDING_CURSOR_SNAPSHOT_ROLE
): Promise<void> {
  const owners = tx.objectStore(ASSET_OWNERS_STORE);
  const raw: unknown = await owners.get(['recording', recordingId, role]);
  if (raw === undefined) return;
  const owner = parseAssetOwner(raw);
  if (
    !owner ||
    owner.ownerKind !== 'recording' ||
    owner.ownerId !== recordingId ||
    owner.role !== role
  )
    throw new Error('Cursor snapshot ownership is inconsistent.');
  await owners.delete(['recording', recordingId, role]);
  if ((await owners.index('assetId').count(owner.assetId)) === 0) {
    await tx.objectStore(ASSET_REFS_STORE).delete(owner.assetId);
    physicalDelete.assetIds.push(owner.assetId);
  }
}

async function publishCursorSnapshotJournal(
  journal: AssetReadyJournal,
  lifecyclePermit?: DurableAssetLifecyclePermit,
  transitionPermit?: PersistenceMutationTransitionPermit
): Promise<void> {
  const payload: unknown = journal.payload;
  if (
    isPlainRecord(payload) &&
    (payload['phase'] === 'native-prepare' || payload['phase'] === 'native-ready')
  ) {
    await publishNativeHistorySnapshotJournal(
      journal,
      nativeHistoryPorts,
      lifecyclePermit,
      transitionPermit
    );
    return;
  }
  if (isPlainRecord(payload) && payload['phase'] === 'prepare') {
    await publishTelemetryPreparation(journal, lifecyclePermit, transitionPermit);
    return;
  }
  if (isPlainRecord(payload) && Object.hasOwn(payload, 'eventsWriter')) {
    await publishTelemetryWithEventsJournal(journal, lifecyclePermit);
    return;
  }
  if (
    journal.domain !== CURSOR_SNAPSHOT_DOMAIN ||
    journal.operationId !== undefined ||
    journal.assetRefs.length !== 1 ||
    !isPlainRecord(payload) ||
    Object.keys(payload).length !== 3
  )
    throw new Error('Invalid cursor snapshot journal.');
  const entry = parseRecordingTelemetryEntry(payload['entry']);
  const writer: unknown = payload['writer'];
  const expectedTelemetrySha256 = payload['expectedTelemetrySha256'];
  const ref = parseAssetRef(journal.assetRefs[0]);
  if (
    !entry?.cursorTrajectorySnapshot ||
    !entry.cursorTrajectory ||
    !isCursorTrajectoryIdentity(writer) ||
    !isPlainRecord(writer) ||
    Object.keys(writer).length !== 3 ||
    typeof writer['writerGeneration'] !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(writer['writerGeneration']) ||
    writer.recordingId !== entry.recordingId ||
    writer.trajectoryId !== entry.cursorTrajectory.trajectoryId ||
    !ref ||
    !sameRef(ref, entry.cursorTrajectorySnapshot.ref) ||
    (expectedTelemetrySha256 !== null &&
      (typeof expectedTelemetrySha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(expectedTelemetrySha256)))
  )
    throw new Error('Invalid cursor snapshot journal.');
  const db = await initDB();
  const source: unknown = await db.get(RECORDING_CURSOR_TRAJECTORIES_STORE, [
    writer.recordingId,
    writer.trajectoryId,
  ]);
  if (
    !isCursorTrajectoryHead(source) ||
    source.retired ||
    source.stagingJournalId !== undefined ||
    source.writerGeneration !== writer['writerGeneration']
  )
    throw new SupersededAssetPublicationError();
  const file = await readAssetFile(ref, 'cursor.bin');
  await file
    .stream()
    .pipeTo(
      createCursorTrajectoryStreamSink(
        { ...entry.cursorTrajectorySnapshot, descriptor: entry.cursorTrajectory },
        async () => {}
      )
    );
  await mutateRecordingTelemetry(
    entry.recordingId,
    normalizeTelemetry(entry),
    {
      expectedTelemetrySha256,
      writer: {
        recordingId: writer.recordingId,
        trajectoryId: writer.trajectoryId,
        writerGeneration: writer['writerGeneration'],
      },
      publicationId: journal.journalId,
    },
    lifecyclePermit
  );
  await releaseAssetReadyProtection([ref.assetId]);
}

/** Startup recovery uses the same source-generation and metadata preconditions as live publication. */
export const recordingCursorTrajectoryPublicationAdapter: AssetPublicationAdapter = {
  domain: CURSOR_SNAPSHOT_DOMAIN,
  publish: publishCursorSnapshotJournal,
};

const eventDescriptorKeys = [
  'eventStreamId',
  'state',
  'finalized',
  'totalBlocks',
  'totalRecords',
  'totalBytes',
  'streamSha256',
] as const;
type EventDescriptorFacts = Pick<
  NonNullable<RecordingTelemetryEntry['recordingEvents']>,
  (typeof eventDescriptorKeys)[number]
>;
function sameEventDescriptor(
  left: EventDescriptorFacts | undefined,
  right: EventDescriptorFacts | undefined
): boolean {
  return (
    left !== undefined &&
    right !== undefined &&
    eventDescriptorKeys.every((key) => left[key] === right[key])
  );
}

async function saveTelemetryHistory(facts: RecordingTelemetryEntry): Promise<void> {
  // Admit the database before reserving the transition gate.
  await initDB();
  await runWithPersistenceMutationTransition(async (transitionPermit) => {
    const current = await getRecordingTelemetry(facts.recordingId);
    const expectedTelemetrySha256 = telemetryHash(current ?? null);
    const cursorStore = createRecordingCursorTrajectoryStore({
      database: initDB,
      mintGeneration: () => crypto.randomUUID(),
    });
    const eventsStore = createRecordingEventsStore({
      database: initDB,
      mintGeneration: () => crypto.randomUUID(),
    });
    const entry = { ...facts };
    let writer: RecordingCursorTrajectoryWriter | null = null;
    let eventsWriter: RecordingEventsWriter | null = null;
    if (facts.cursorTrajectory && facts.cursorTrajectory.totalBlocks > 0) {
      const identity = {
        recordingId: facts.recordingId,
        trajectoryId: facts.cursorTrajectory.trajectoryId,
      };
      const head = await cursorStore.getHead(identity);
      if (
        !head ||
        !head.finalized ||
        head.stagingJournalId !== undefined ||
        !sameDescriptor(head, facts.cursorTrajectory)
      )
        throw new SupersededAssetPublicationError();
      writer = { ...identity, writerGeneration: head.writerGeneration };
      if (
        current?.cursorTrajectorySnapshot &&
        sameDescriptor(current.cursorTrajectory, facts.cursorTrajectory)
      )
        entry.cursorTrajectorySnapshot = current.cursorTrajectorySnapshot;
    }
    if (facts.recordingEvents && facts.recordingEvents.totalBlocks > 0) {
      const identity = {
        recordingId: facts.recordingId,
        eventStreamId: facts.recordingEvents.eventStreamId,
      };
      const head = await eventsStore.getHead(identity);
      if (
        !head ||
        !head.finalized ||
        head.stagingJournalId !== undefined ||
        !sameEventDescriptor(head, facts.recordingEvents)
      )
        throw new SupersededAssetPublicationError();
      eventsWriter = { ...identity, writerGeneration: head.writerGeneration };
      if (
        current?.recordingEventsSnapshot &&
        sameEventDescriptor(current.recordingEvents, facts.recordingEvents)
      )
        entry.recordingEventsSnapshot = current.recordingEventsSnapshot;
    }
    if (
      (!writer || entry.cursorTrajectorySnapshot) &&
      (!eventsWriter || entry.recordingEventsSnapshot)
    ) {
      await mutateRecordingTelemetry(entry.recordingId, entry, {
        expectedTelemetrySha256,
        ...(writer ? { writer } : {}),
        ...(eventsWriter ? { eventsWriter } : {}),
      });
      return;
    }
    const journal = await createAssetPublicationJournal({
      domain: CURSOR_SNAPSHOT_DOMAIN,
      assetRefs: [],
      payload: { phase: 'prepare', entry, writer, eventsWriter, expectedTelemetrySha256 },
    });
    await runWithDurableAssetLifecycleLock(async (lifecyclePermit) => {
      try {
        await publishTelemetryPreparation(journal, lifecyclePermit, transitionPermit);
        // Publication already committed. Startup can cancel a surviving prepare intent by CAS.
        await deleteReadyJournal(journal.journalId).catch(() => undefined);
      } catch (error) {
        if (error instanceof SupersededAssetPublicationError)
          await cancelAssetPublication(journal, lifecyclePermit);
        throw error;
      }
    });
  });
}

async function publishTelemetryPreparation(
  journal: AssetReadyJournal,
  lifecyclePermit?: DurableAssetLifecyclePermit,
  transitionPermit?: PersistenceMutationTransitionPermit
): Promise<void> {
  const payload: unknown = journal.payload;
  if (
    journal.domain !== CURSOR_SNAPSHOT_DOMAIN ||
    journal.operationId !== undefined ||
    journal.assetRefs.length !== 0 ||
    !isPlainRecord(payload) ||
    Object.keys(payload).length !== 5 ||
    payload['phase'] !== 'prepare'
  )
    throw new Error('Invalid history preparation journal.');
  const entry = parseRecordingTelemetryEntry(payload['entry']);
  const writer = payload['writer'] === null ? null : readCursorWriter(payload['writer']);
  const eventsWriter =
    payload['eventsWriter'] === null ? null : readEventsWriter(payload['eventsWriter']);
  const expectedTelemetrySha256 = payload['expectedTelemetrySha256'];
  if (
    !entry ||
    (!writer && !eventsWriter) ||
    (payload['writer'] !== null && !writer) ||
    (payload['eventsWriter'] !== null && !eventsWriter) ||
    Boolean(writer) !== Boolean(entry.cursorTrajectory && entry.cursorTrajectory.totalBlocks > 0) ||
    Boolean(eventsWriter) !==
      Boolean(entry.recordingEvents && entry.recordingEvents.totalBlocks > 0) ||
    (writer &&
      (writer.recordingId !== entry.recordingId ||
        writer.trajectoryId !== entry.cursorTrajectory?.trajectoryId)) ||
    (eventsWriter &&
      (eventsWriter.recordingId !== entry.recordingId ||
        eventsWriter.eventStreamId !== entry.recordingEvents?.eventStreamId)) ||
    (expectedTelemetrySha256 !== null &&
      (typeof expectedTelemetrySha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(expectedTelemetrySha256)))
  )
    throw new Error('Invalid history preparation journal.');
  const current = await getRecordingTelemetry(entry.recordingId);
  if (telemetryHash(current ?? null) !== expectedTelemetrySha256)
    throw new SupersededAssetPublicationError();
  const cursorStore = createRecordingCursorTrajectoryStore({
    database: initDB,
    mintGeneration: () => crypto.randomUUID(),
  });
  const eventsStore = createRecordingEventsStore({
    database: initDB,
    mintGeneration: () => crypto.randomUUID(),
  });
  if (writer) {
    const head = await cursorStore.getHead(writer);
    if (
      !head ||
      !head.finalized ||
      head.stagingJournalId !== undefined ||
      head.writerGeneration !== writer.writerGeneration ||
      !sameDescriptor(head, entry.cursorTrajectory)
    )
      throw new SupersededAssetPublicationError();
  }
  if (eventsWriter) {
    const head = await eventsStore.getHead(eventsWriter);
    if (
      !head ||
      !head.finalized ||
      head.stagingJournalId !== undefined ||
      head.writerGeneration !== eventsWriter.writerGeneration ||
      !sameEventDescriptor(head, entry.recordingEvents)
    )
      throw new SupersededAssetPublicationError();
  }
  const preparedRefs: AssetRef[] = [];
  let ready: AssetReadyJournal | null = null;
  const assetOptions = transitionPermit ? { persistenceTransitionPermit: transitionPermit } : {};
  try {
    if (writer && !entry.cursorTrajectorySnapshot) {
      const prepared = await prepareRecordingCursorTrajectorySnapshot(
        { store: cursorStore, identity: writer, descriptor: entry.cursorTrajectory },
        assetOptions
      );
      preparedRefs.push(prepared.ref);
      if (prepared.writer.writerGeneration !== writer.writerGeneration)
        throw new SupersededAssetPublicationError();
      entry.cursorTrajectorySnapshot = {
        ref: prepared.ref,
        sourceRecordingId: prepared.sourceRecordingId,
        width: prepared.width,
        height: prepared.height,
      };
    }
    if (eventsWriter && !entry.recordingEventsSnapshot) {
      const prepared = await prepareRecordingEventsSnapshot(
        { store: eventsStore, identity: eventsWriter, descriptor: entry.recordingEvents },
        assetOptions
      );
      preparedRefs.push(prepared.ref);
      if (prepared.writer.writerGeneration !== eventsWriter.writerGeneration)
        throw new SupersededAssetPublicationError();
      entry.recordingEventsSnapshot = {
        ref: prepared.ref,
        sourceRecordingId: prepared.sourceRecordingId,
      };
    }
    ready = await createAssetPublicationJournal({
      domain: CURSOR_SNAPSHOT_DOMAIN,
      assetRefs: [entry.cursorTrajectorySnapshot?.ref, entry.recordingEventsSnapshot?.ref].filter(
        (ref): ref is AssetRef => ref !== undefined
      ),
      payload: eventsWriter
        ? { entry, writer, eventsWriter, expectedTelemetrySha256 }
        : { entry, writer, expectedTelemetrySha256 },
      ...(lifecyclePermit ? { lifecyclePermit } : {}),
    });
    await publishReadyJournalWithRetry(ready, publishCursorSnapshotJournal, lifecyclePermit);
  } catch (error) {
    if (!ready) {
      await discardHistorySnapshotCopies(
        preparedRefs,
        error,
        'History preparation and cleanup failed.'
      );
    }
    throw error;
  }
}

function readEventsWriter(value: unknown): RecordingEventsWriter | null {
  if (
    !isRecordingEventsIdentity(value) ||
    !isPlainRecord(value) ||
    Object.keys(value).length !== 3 ||
    typeof value['writerGeneration'] !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(value['writerGeneration'])
  )
    return null;
  return {
    recordingId: value.recordingId,
    eventStreamId: value.eventStreamId,
    writerGeneration: value['writerGeneration'],
  };
}
function readCursorWriter(value: unknown): RecordingCursorTrajectoryWriter | null {
  if (
    !isCursorTrajectoryIdentity(value) ||
    !isPlainRecord(value) ||
    Object.keys(value).length !== 3 ||
    typeof value['writerGeneration'] !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(value['writerGeneration'])
  )
    return null;
  return {
    recordingId: value.recordingId,
    trajectoryId: value.trajectoryId,
    writerGeneration: value['writerGeneration'],
  };
}

async function publishTelemetryWithEventsJournal(
  journal: AssetReadyJournal,
  lifecyclePermit?: DurableAssetLifecyclePermit
): Promise<void> {
  const payload: unknown = journal.payload;
  if (
    journal.domain !== CURSOR_SNAPSHOT_DOMAIN ||
    journal.operationId !== undefined ||
    !isPlainRecord(payload) ||
    Object.keys(payload).length !== 4 ||
    !Object.hasOwn(payload, 'writer')
  )
    throw new Error('Invalid history snapshot journal.');
  const entry = parseRecordingTelemetryEntry(payload['entry']);
  const eventsWriter = readEventsWriter(payload['eventsWriter']);
  const writer = payload['writer'] === null ? null : readCursorWriter(payload['writer']);
  const expectedTelemetrySha256 = payload['expectedTelemetrySha256'];
  if (
    !entry?.recordingEvents ||
    !entry.recordingEventsSnapshot ||
    !eventsWriter ||
    eventsWriter.recordingId !== entry.recordingId ||
    eventsWriter.eventStreamId !== entry.recordingEvents.eventStreamId ||
    (payload['writer'] !== null && !writer) ||
    Boolean(entry.cursorTrajectorySnapshot) !== Boolean(writer) ||
    (writer &&
      (writer.recordingId !== entry.recordingId ||
        writer.trajectoryId !== entry.cursorTrajectory?.trajectoryId)) ||
    (expectedTelemetrySha256 !== null &&
      (typeof expectedTelemetrySha256 !== 'string' ||
        !/^[a-f0-9]{64}$/.test(expectedTelemetrySha256)))
  )
    throw new Error('Invalid history snapshot journal.');
  const refs = [entry.cursorTrajectorySnapshot?.ref, entry.recordingEventsSnapshot.ref].filter(
    (ref): ref is AssetRef => ref !== undefined
  );
  if (
    journal.assetRefs.length !== refs.length ||
    new Set(refs.map((ref) => ref.assetId)).size !== refs.length ||
    refs.some(
      (ref) => !journal.assetRefs.some((candidate) => sameRef(parseAssetRef(candidate), ref))
    )
  )
    throw new Error('Invalid history snapshot references.');
  const db = await initDB();
  const source: unknown = await db.get(RECORDING_EVENTS_STORE, [
    eventsWriter.recordingId,
    eventsWriter.eventStreamId,
    'head',
    0,
  ]);
  if (
    !isRecordingEventsHead(source) ||
    source.retired ||
    source.stagingJournalId !== undefined ||
    source.writerGeneration !== eventsWriter.writerGeneration
  )
    throw new SupersededAssetPublicationError();
  const eventFile = await readAssetFile(entry.recordingEventsSnapshot.ref, 'events.bin');
  await eventFile
    .stream()
    .pipeTo(
      createRecordingEventsStreamSink(
        { ...entry.recordingEventsSnapshot, descriptor: entry.recordingEvents },
        async () => {}
      )
    );
  if (writer && entry.cursorTrajectorySnapshot && entry.cursorTrajectory) {
    const cursor: unknown = await db.get(RECORDING_CURSOR_TRAJECTORIES_STORE, [
      writer.recordingId,
      writer.trajectoryId,
    ]);
    if (
      !isCursorTrajectoryHead(cursor) ||
      cursor.retired ||
      cursor.stagingJournalId !== undefined ||
      cursor.writerGeneration !== writer.writerGeneration
    )
      throw new SupersededAssetPublicationError();
    const file = await readAssetFile(entry.cursorTrajectorySnapshot.ref, 'cursor.bin');
    await file
      .stream()
      .pipeTo(
        createCursorTrajectoryStreamSink(
          { ...entry.cursorTrajectorySnapshot, descriptor: entry.cursorTrajectory },
          async () => {}
        )
      );
  }
  await mutateRecordingTelemetry(
    entry.recordingId,
    normalizeTelemetry(entry),
    {
      expectedTelemetrySha256,
      ...(writer ? { writer } : {}),
      eventsWriter,
      publicationId: journal.journalId,
    },
    lifecyclePermit
  );
  await releaseAssetReadyProtection(refs.map((ref) => ref.assetId));
}

const nativeHistoryPorts: NativeHistoryPublicationPorts = {
  read: getRecordingTelemetry,
  hash: telemetryHash,
  commit: (entry, condition, lifecyclePermit) =>
    mutateRecordingTelemetry(entry.recordingId, entry, condition, lifecyclePermit),
};

/** Publishes one verified Native stream. Video delivery and the other stream remain independent. */
export async function saveNativeRecordingHistory(
  recordingId: string,
  kind: 'cursor' | 'events',
  recoveryPermit?: PersistenceMutationTransitionPermit
): Promise<void> {
  await initDB();
  const publish = async (transitionPermit: PersistenceMutationTransitionPermit) => {
    const intent = await createNativeRecordingHistoryStore().read(recordingId);
    if (!intent) throw new SupersededAssetPublicationError();
    const grant = createNativeHistoryPublicationGrant(intent, kind);
    const current = await getRecordingTelemetry(recordingId);
    const entry = withNativeHistoryDescriptor(current ?? intent.baseTelemetry, grant);
    const expectedTelemetrySha256 = telemetryHash(current ?? null);
    const journal = await createAssetPublicationJournal({
      domain: CURSOR_SNAPSHOT_DOMAIN,
      assetRefs: [],
      payload: { phase: 'native-prepare', grant, entry, expectedTelemetrySha256 },
    });
    await runWithDurableAssetLifecycleLock(async (lifecyclePermit) => {
      try {
        await publishNativeHistorySnapshotJournal(
          journal,
          nativeHistoryPorts,
          lifecyclePermit,
          transitionPermit
        );
        await deleteReadyJournal(journal.journalId).catch(() => undefined);
      } catch (error) {
        if (error instanceof SupersededAssetPublicationError)
          await cancelAssetPublication(journal, lifecyclePermit);
        throw error;
      }
    });
  };
  if (recoveryPermit) await runWithPersistenceMutationTransitionRecovery(recoveryPermit, publish);
  else await runWithPersistenceMutationTransition(publish);
}
