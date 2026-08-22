import type { AssetOwner, AssetRef } from '../assets';
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
  if (args.telemetry) await args.telemetryStore.put(args.telemetry);
}
