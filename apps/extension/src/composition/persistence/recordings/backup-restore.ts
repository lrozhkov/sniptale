import { RECORDING_EVENTS_SNAPSHOT_ROLE } from './recording-events/contracts';
import type { AssetOwner, AssetRef } from '../assets';
import { RECORDING_CURSOR_SNAPSHOT_ROLE } from './cursor-trajectory/contracts';
import type { RecordingTelemetryEntry, StoredRecordingEntry } from './contracts';

interface PutStore<T> {
  put(value: T): Promise<unknown>;
}

export async function putRecordingBackupRestore(args: {
  entry: StoredRecordingEntry;
  ownerStore: PutStore<AssetOwner>;
  ref: AssetRef;
  refStore: PutStore<AssetRef>;
  recordingStore: PutStore<StoredRecordingEntry>;
  telemetry?: RecordingTelemetryEntry;
  telemetryStore: PutStore<RecordingTelemetryEntry>;
}): Promise<void> {
  await args.refStore.put(args.ref);
  await args.ownerStore.put({
    assetId: args.ref.assetId,
    ownerId: args.entry.id,
    ownerKind: 'recording',
    role: 'body',
  });
  await args.recordingStore.put(args.entry);
  if (args.telemetry) {
    for (const [snapshot, role] of [
      [args.telemetry.cursorTrajectorySnapshot, RECORDING_CURSOR_SNAPSHOT_ROLE],
      [args.telemetry.recordingEventsSnapshot, RECORDING_EVENTS_SNAPSHOT_ROLE],
    ] as const) {
      if (!snapshot) continue;
      await args.refStore.put(snapshot.ref);
      await args.ownerStore.put({
        assetId: snapshot.ref.assetId,
        ownerId: args.entry.id,
        ownerKind: 'recording',
        role,
      });
    }
    await args.telemetryStore.put(args.telemetry);
  }
}
