import { verifyNativeRecordingBody } from './video-body';
import { isCursorTrajectoryDescriptor } from '../../../../features/video/project/cursor-trajectory/records';
import { isRecordingEventsDescriptor } from '../../../../features/video/project/recording-events/records';
import { parseRecordingTelemetryEntry } from '../telemetry.guards';
import type { IDBPTransaction } from 'idb';
import { initDB } from '../../infrastructure/indexed-db/core';
import {
  STORE_NAME,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
  RECORDING_EVENTS_STORE,
} from '../../infrastructure/indexed-db/core.stores';
import { runWithPersistenceMutationPermit } from '../../infrastructure/mutation-barrier';
import { abortIndexedDbMutation } from '../../infrastructure/indexed-db/transaction';
import { parseAssetRef, parseAssetOwner } from '../../assets/guards';
import { parseRecordingEntry } from '../index.guards';
import {
  recordingEventsRootFenceKey,
  isRecordingEventsRootFence,
} from '../recording-events/guards';
import { cursorTrajectoryStagingIdentity } from '../cursor-trajectory/staging';
import { recordingEventsStagingIdentity } from '../recording-events/staging';
import {
  isNativeRecordingHistoryIntent,
  isNativeRecordingHistoryOffer,
  isNativeRecordingHistoryParent,
  isNativeHistoryPublicationGrant,
} from './guards';
import {
  NativeRecordingHistoryError,
  type NativeRecordingHistoryIntent,
  type NativeRecordingHistoryOffer,
  type NativeRecordingHistoryDependencies,
  type NativeRecordingHistoryParent,
  type NativeHistoryPullUpdate,
  type NativeHistoryPublicationGrant,
} from './contracts';

const intentStores = [
  STORE_NAME,
  ASSET_REFS_STORE,
  ASSET_OWNERS_STORE,
  NATIVE_TRANSFER_SESSIONS_STORE,
  RECORDING_EVENTS_STORE,
];

/** The same source binding governs opening, transport progress and publication admission. */
async function admitRoot(
  tx:
    | IDBPTransaction<unknown, string[], 'readonly'>
    | IDBPTransaction<unknown, string[], 'readwrite'>,
  offer: Pick<
    NativeRecordingHistoryOffer,
    'recordingId' | 'controllerLeaseId' | 'videoSha256' | 'width' | 'height'
  >,
  allowUnverifiedBody = false
) {
  const parent: unknown = await tx
    .objectStore(NATIVE_TRANSFER_SESSIONS_STORE)
    .get(offer.recordingId);
  if (!isNativeRecordingHistoryParent(parent) || parent.id !== offer.recordingId)
    throw new NativeRecordingHistoryError('missing');
  if (
    parent.controllerLeaseId !== offer.controllerLeaseId ||
    parent.sha256 !== offer.videoSha256 ||
    parent.metadata.width !== offer.width ||
    parent.metadata.height !== offer.height
  )
    throw new NativeRecordingHistoryError('conflict');
  const fence: unknown = await tx
    .objectStore(RECORDING_EVENTS_STORE)
    .get(recordingEventsRootFenceKey(offer.recordingId));
  if (fence !== undefined) {
    if (!isRecordingEventsRootFence(fence, offer.recordingId))
      throw new NativeRecordingHistoryError('invalid');
    throw new NativeRecordingHistoryError('retired');
  }
  const recording = parseRecordingEntry(await tx.objectStore(STORE_NAME).get(offer.recordingId));
  if (!recording || recording.id !== offer.recordingId)
    throw new NativeRecordingHistoryError('missing');
  const ref = parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(recording.assetId));
  const owner = parseAssetOwner(
    await tx.objectStore(ASSET_OWNERS_STORE).get(['recording', offer.recordingId, 'body'])
  );
  if (
    !ref ||
    !owner ||
    owner.assetId !== recording.assetId ||
    owner.ownerKind !== 'recording' ||
    owner.ownerId !== offer.recordingId ||
    owner.role !== 'body' ||
    ref.assetId !== recording.assetId ||
    (ref.sha256 !== offer.videoSha256 &&
      !(
        ref.sha256 === null &&
        (allowUnverifiedBody ||
          (isNativeRecordingHistoryIntent(parent.metadata.history) &&
            parent.metadata.history.recordingAssetId === recording.assetId &&
            parent.metadata.history.videoSha256 === offer.videoSha256))
      )) ||
    ref.size !== recording.size ||
    ref.mimeType !== 'video/mp4'
  )
    throw new NativeRecordingHistoryError('stale-root');
  return { parent, recording, ref };
}
function requireCurrentIntent(
  parent: NativeRecordingHistoryParent,
  assetId: string,
  expected: NativeRecordingHistoryIntent
) {
  const current = parent.metadata.history;
  if (
    !isNativeRecordingHistoryIntent(current) ||
    current.recordingId !== expected.recordingId ||
    current.operationId !== expected.operationId ||
    current.revision !== expected.revision
  )
    throw new NativeRecordingHistoryError('conflict');
  if (current.phase === 'cancelled') throw new NativeRecordingHistoryError('retired');
  if (
    current.recordingAssetId !== assetId ||
    assetId !== expected.recordingAssetId ||
    current.videoSha256 !== expected.videoSha256 ||
    current.controllerLeaseId !== expected.controllerLeaseId
  )
    throw new NativeRecordingHistoryError('stale-root');
  return current;
}
const sameDescriptor = (left: object, right: object) =>
  JSON.stringify(Object.entries(left).sort()) === JSON.stringify(Object.entries(right).sort());

/** The completed video parent owns the intent before any asynchronous private writer begins. */
export function createNativeRecordingHistoryStore(
  dependencies: NativeRecordingHistoryDependencies = {
    database: initDB,
    mintGeneration: () => crypto.randomUUID(),
    now: Date.now,
  }
) {
  async function verifiedBodyReceipt(recordingId: string) {
    const db = await dependencies.database();
    const read = async () => {
      const tx = db.transaction(intentStores, 'readonly');
      const raw: unknown = await tx.objectStore(NATIVE_TRANSFER_SESSIONS_STORE).get(recordingId);
      if (!isNativeRecordingHistoryParent(raw)) throw new NativeRecordingHistoryError('missing');
      const root = await admitRoot(
        tx,
        {
          recordingId,
          controllerLeaseId: raw.controllerLeaseId,
          videoSha256: raw.sha256,
          width: raw.metadata.width,
          height: raw.metadata.height,
        },
        true
      );
      const intent = raw.metadata.history;
      if (
        intent !== undefined &&
        (!isNativeRecordingHistoryIntent(intent) ||
          intent.recordingAssetId !== root.recording.assetId ||
          intent.videoSha256 !== raw.sha256)
      )
        throw new NativeRecordingHistoryError('stale-root');
      if (
        raw['totalBytes'] !== undefined &&
        raw['totalBytes'] !== 0 &&
        raw['totalBytes'] !== root.recording.size
      )
        throw new NativeRecordingHistoryError('conflict');
      await tx.done;
      return root;
    };
    const before = await read();
    await verifyNativeRecordingBody(before.ref, before.parent.sha256);
    const after = await read();
    if (
      after.recording.assetId !== before.recording.assetId ||
      JSON.stringify(after.ref) !== JSON.stringify(before.ref) ||
      after.parent.sha256 !== before.parent.sha256
    )
      throw new NativeRecordingHistoryError('stale-root');
    return {
      receipt: {
        durable: true as const,
        sha256: before.parent.sha256,
        totalBytes: before.recording.size,
      },
      ref: before.ref,
    };
  }
  return {
    async videoReceipt(recordingId: string) {
      return (await verifiedBodyReceipt(recordingId)).receipt;
    },
    async read(recordingId: string): Promise<NativeRecordingHistoryIntent | null> {
      const db = await dependencies.database();
      const raw: unknown = await db.get(NATIVE_TRANSFER_SESSIONS_STORE, recordingId);
      if (raw === undefined) return null;
      if (!isNativeRecordingHistoryParent(raw)) throw new NativeRecordingHistoryError('invalid');
      const intent = raw.metadata.history;
      if (intent === undefined) return null;
      if (!isNativeRecordingHistoryIntent(intent) || intent.recordingId !== recordingId)
        throw new NativeRecordingHistoryError('invalid');
      return structuredClone(intent);
    },
    async admit(expected: NativeRecordingHistoryIntent): Promise<NativeRecordingHistoryIntent> {
      if (!isNativeRecordingHistoryIntent(expected))
        throw new NativeRecordingHistoryError('invalid');
      expected = structuredClone(expected);
      const db = await dependencies.database();
      const tx = db.transaction(intentStores, 'readonly');
      const { parent, recording } = await admitRoot(tx, expected);
      const current = requireCurrentIntent(parent, recording.assetId, expected);
      await tx.done;
      return structuredClone(current);
    },
    async savePull(
      expected: NativeRecordingHistoryIntent,
      update: NativeHistoryPullUpdate
    ): Promise<NativeRecordingHistoryIntent> {
      if (!isNativeRecordingHistoryIntent(expected))
        throw new NativeRecordingHistoryError('invalid');
      expected = structuredClone(expected);
      update = structuredClone(update);
      if (update.pull.kind === 'published') throw new NativeRecordingHistoryError('invalid');
      const db = await dependencies.database();
      return runWithPersistenceMutationPermit(async () => {
        const tx = db.transaction(intentStores, 'readwrite');
        try {
          const { parent, recording } = await admitRoot(tx, expected);
          const current = requireCurrentIntent(parent, recording.assetId, expected);
          if (current.phase !== 'pending') throw new NativeRecordingHistoryError('conflict');
          let next: NativeRecordingHistoryIntent;
          if (update.kind === 'cursor') {
            const slot = current.cursor;
            if (
              !slot ||
              slot.descriptor.trajectoryId !== update.descriptor.trajectoryId ||
              (slot.descriptor.finalized && !sameDescriptor(slot.descriptor, update.descriptor))
            )
              throw new NativeRecordingHistoryError('conflict');
            next = {
              ...current,
              cursor: { ...slot, descriptor: update.descriptor, pull: update.pull },
            };
          } else {
            const slot = current.events;
            if (
              !slot ||
              slot.descriptor.eventStreamId !== update.descriptor.eventStreamId ||
              (slot.descriptor.finalized && !sameDescriptor(slot.descriptor, update.descriptor))
            )
              throw new NativeRecordingHistoryError('conflict');
            next = {
              ...current,
              events: { ...slot, descriptor: update.descriptor, pull: update.pull },
            };
          }
          next.revision++;
          next.updatedAt = Math.max(next.updatedAt, dependencies.now());
          if (!isNativeRecordingHistoryIntent(next))
            throw new NativeRecordingHistoryError('invalid');
          await tx.objectStore(NATIVE_TRANSFER_SESSIONS_STORE).put({
            ...parent,
            metadata: { ...parent.metadata, history: next },
            updatedAt: Math.max(parent.updatedAt, next.updatedAt),
          });
          await tx.done;
          return structuredClone(next);
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    },
    async *candidates(controllerLeaseId: string, includePublished = false): AsyncGenerator<string> {
      const db = await dependencies.database();
      let after: IDBValidKey | undefined;
      for (;;) {
        const tx = db.transaction(NATIVE_TRANSFER_SESSIONS_STORE, 'readonly');
        const cursor = await tx.store.openCursor(
          after === undefined ? undefined : IDBKeyRange.lowerBound(after, true)
        );
        const raw: unknown = cursor?.value;
        after = cursor?.key;
        await tx.done;
        if (!cursor) return;
        if (!isNativeRecordingHistoryParent(raw) || raw.controllerLeaseId !== controllerLeaseId)
          continue;
        const intent = raw.metadata.history;
        if (intent === undefined) {
          if (
            !isCursorTrajectoryDescriptor(raw.metadata['cursorTrajectory']) &&
            !isRecordingEventsDescriptor(raw.metadata['recordingEvents'])
          )
            continue;
        } else if (
          !isNativeRecordingHistoryIntent(intent) ||
          intent.recordingId !== raw.id ||
          intent.controllerLeaseId !== controllerLeaseId ||
          intent.phase === 'cancelled' ||
          (!includePublished && intent.phase === 'complete')
        )
          continue;
        yield raw.id;
      }
    },
    async rebind(
      offer: Pick<
        NativeRecordingHistoryOffer,
        'recordingId' | 'controllerLeaseId' | 'videoSha256'
      > & { totalBytes?: number }
    ): Promise<NativeRecordingHistoryIntent> {
      const db = await dependencies.database();
      return runWithPersistenceMutationPermit(async () => {
        const tx = db.transaction(intentStores, 'readwrite');
        try {
          const raw: unknown = await tx
            .objectStore(NATIVE_TRANSFER_SESSIONS_STORE)
            .get(offer.recordingId);
          if (
            !isNativeRecordingHistoryParent(raw) ||
            !isNativeRecordingHistoryIntent(raw.metadata.history)
          )
            throw new NativeRecordingHistoryError('missing');
          const previous = raw.metadata.history;
          if (raw.id !== offer.recordingId || previous.recordingId !== offer.recordingId)
            throw new NativeRecordingHistoryError('invalid');
          if (
            !isNativeRecordingHistoryOffer({
              recordingId: offer.recordingId,
              controllerLeaseId: offer.controllerLeaseId,
              videoSha256: offer.videoSha256,
              width: previous.width,
              height: previous.height,
              ...(previous.cursor ? { cursorTrajectory: previous.cursor.descriptor } : {}),
              ...(previous.events ? { recordingEvents: previous.events.descriptor } : {}),
            }) ||
            offer.videoSha256 !== previous.videoSha256
          )
            throw new NativeRecordingHistoryError('conflict');
          const { parent, recording } = await admitRoot(tx, previous);
          requireCurrentIntent(parent, recording.assetId, previous);
          if (offer.totalBytes !== undefined && offer.totalBytes !== recording.size)
            throw new NativeRecordingHistoryError('conflict');
          if (previous.controllerLeaseId === offer.controllerLeaseId) {
            await tx.done;
            return structuredClone(previous);
          }
          const next = {
            ...previous,
            controllerLeaseId: offer.controllerLeaseId,
            revision: previous.revision + 1,
            updatedAt: Math.max(previous.updatedAt, dependencies.now()),
          };
          if (!isNativeRecordingHistoryIntent(next))
            throw new NativeRecordingHistoryError('invalid');
          await tx.objectStore(NATIVE_TRANSFER_SESSIONS_STORE).put({
            ...parent,
            controllerLeaseId: offer.controllerLeaseId,
            updatedAt: Math.max(parent.updatedAt, next.updatedAt),
            metadata: { ...parent.metadata, history: next },
          });
          await tx.done;
          return structuredClone(next);
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    },
    async plan(
      offer: NativeRecordingHistoryOffer,
      previousControllerLeaseId?: string
    ): Promise<NativeRecordingHistoryIntent> {
      if (!isNativeRecordingHistoryOffer(offer)) throw new NativeRecordingHistoryError('invalid');
      offer = structuredClone(offer);
      const db = await dependencies.database();
      const source = parseRecordingEntry(await db.get(STORE_NAME, offer.recordingId));
      const ref = source ? parseAssetRef(await db.get(ASSET_REFS_STORE, source.assetId)) : null;
      const verified = ref?.sha256 === null ? await verifiedBodyReceipt(offer.recordingId) : null;
      return runWithPersistenceMutationPermit(async () => {
        const tx = db.transaction(
          [
            STORE_NAME,
            ASSET_REFS_STORE,
            ASSET_OWNERS_STORE,
            NATIVE_TRANSFER_SESSIONS_STORE,
            RECORDING_EVENTS_STORE,
          ],
          'readwrite'
        );
        try {
          const { parent, recording } = await admitRoot(
            tx,
            previousControllerLeaseId === undefined
              ? offer
              : { ...offer, controllerLeaseId: previousControllerLeaseId },
            verified !== null
          );
          if (
            verified &&
            (recording.assetId !== verified.ref.assetId ||
              JSON.stringify(
                parseAssetRef(await tx.objectStore(ASSET_REFS_STORE).get(recording.assetId))
              ) !== JSON.stringify(verified.ref))
          )
            throw new NativeRecordingHistoryError('stale-root');
          const previous = parent.metadata.history;
          if (previousControllerLeaseId !== undefined && previous !== undefined)
            throw new NativeRecordingHistoryError('conflict');
          if (
            previous !== undefined &&
            (!isNativeRecordingHistoryIntent(previous) ||
              previous.recordingId !== offer.recordingId)
          )
            throw new NativeRecordingHistoryError('invalid');
          if (previous?.phase === 'cancelled') throw new NativeRecordingHistoryError('retired');
          if (
            previous &&
            (previous.recordingAssetId !== recording.assetId ||
              previous.videoSha256 !== offer.videoSha256 ||
              previous.controllerLeaseId !== offer.controllerLeaseId)
          )
            throw new NativeRecordingHistoryError('stale-root');
          if (
            (previous?.cursor &&
              offer.cursorTrajectory &&
              previous.cursor.descriptor.trajectoryId !== offer.cursorTrajectory.trajectoryId) ||
            (previous?.events &&
              offer.recordingEvents &&
              previous.events.descriptor.eventStreamId !== offer.recordingEvents.eventStreamId)
          )
            throw new NativeRecordingHistoryError('conflict');
          const now = dependencies.now();
          const operationId = previous?.operationId ?? dependencies.mintGeneration();
          const cursor =
            previous?.cursor ??
            (offer.cursorTrajectory
              ? {
                  descriptor: offer.cursorTrajectory,
                  pull: null,
                  writer:
                    offer.cursorTrajectory.finalized && offer.cursorTrajectory.totalBlocks === 0
                      ? null
                      : {
                          ...cursorTrajectoryStagingIdentity(operationId, {
                            recordingId: offer.recordingId,
                            trajectoryId: offer.cursorTrajectory.trajectoryId,
                          }),
                          writerGeneration: dependencies.mintGeneration(),
                        },
                }
              : null);
          const events =
            previous?.events ??
            (offer.recordingEvents
              ? {
                  descriptor: offer.recordingEvents,
                  pull: null,
                  writer:
                    offer.recordingEvents.finalized && offer.recordingEvents.totalBlocks === 0
                      ? null
                      : {
                          ...recordingEventsStagingIdentity(operationId, {
                            recordingId: offer.recordingId,
                            eventStreamId: offer.recordingEvents.eventStreamId,
                          }),
                          writerGeneration: dependencies.mintGeneration(),
                        },
                }
              : null);
          if (previous && cursor === previous.cursor && events === previous.events) {
            await tx.done;
            return structuredClone(previous);
          }
          const baseTelemetry =
            previous?.baseTelemetry ??
            parseRecordingTelemetryEntry(
              offer.baseTelemetry ?? {
                recordingId: offer.recordingId,
                createdAt: parent.createdAt,
                updatedAt: Math.max(parent.createdAt, now),
                captureMode: null,
                viewport: null,
                cursorTrack: null,
                actionEvents: [],
                signals: [],
              }
            );
          if (!baseTelemetry) throw new NativeRecordingHistoryError('invalid');
          const intent: NativeRecordingHistoryIntent = {
            version: 1,
            operationId,
            revision: (previous?.revision ?? 0) + 1,
            recordingId: offer.recordingId,
            recordingAssetId: recording.assetId,
            videoSha256: offer.videoSha256,
            controllerLeaseId: offer.controllerLeaseId,
            width: offer.width,
            height: offer.height,
            createdAt: previous?.createdAt ?? now,
            updatedAt: Math.max(previous?.updatedAt ?? now, now),
            baseTelemetry,
            phase: 'pending',
            cursor,
            events,
          };
          if (!isNativeRecordingHistoryIntent(intent))
            throw new NativeRecordingHistoryError('invalid');
          await tx.objectStore(NATIVE_TRANSFER_SESSIONS_STORE).put({
            ...parent,
            controllerLeaseId: offer.controllerLeaseId,
            metadata: { ...parent.metadata, history: intent },
            updatedAt: Math.max(parent.updatedAt, now),
            expiresAt: Number.MAX_SAFE_INTEGER,
          });
          await tx.done;
          return structuredClone(intent);
        } catch (error) {
          return abortIndexedDbMutation(tx, error);
        }
      });
    },
  };
}

/** The selected stream must still own its original video and private writer at publication. */
export async function admitNativeHistoryPublicationInTransaction(
  tx: IDBPTransaction<unknown, string[], 'readwrite'>,
  grant: NativeHistoryPublicationGrant
) {
  if (!isNativeHistoryPublicationGrant(grant)) throw new NativeRecordingHistoryError('invalid');
  const { parent, recording } = await admitRoot(tx, grant);
  const intent = parent.metadata.history;
  if (
    !isNativeRecordingHistoryIntent(intent) ||
    intent.operationId !== grant.operationId ||
    intent.recordingId !== grant.recordingId ||
    intent.recordingAssetId !== recording.assetId ||
    recording.assetId !== grant.recordingAssetId
  )
    throw new NativeRecordingHistoryError('stale-root');
  if (intent.phase === 'cancelled') throw new NativeRecordingHistoryError('retired');
  const slot = grant.kind === 'cursor' ? intent.cursor : intent.events;
  if (
    !slot ||
    !sameDescriptor(slot.descriptor, grant.descriptor) ||
    (slot.writer === null) !== (grant.writer === null) ||
    (slot.writer !== null && grant.writer !== null && !sameDescriptor(slot.writer, grant.writer)) ||
    (slot.pull?.kind !== 'verified' &&
      slot.pull?.kind !== 'unavailable' &&
      slot.pull?.kind !== 'published')
  )
    throw new NativeRecordingHistoryError('conflict');
  return { parent, intent };
}
