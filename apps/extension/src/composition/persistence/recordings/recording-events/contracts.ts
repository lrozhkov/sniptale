import type { IDBPDatabase } from 'idb';
import type {
  RecordingEventRecord,
  RecordingEventsManifestEntry,
} from '../../../../features/video/project/recording-events/types';

export const RECORDING_EVENTS_SNAPSHOT_ROLE = 'recording-events';
export interface RecordingEventsSnapshot {
  ref: import('../../assets/contracts').AssetRef;
  sourceRecordingId: string;
}

export interface RecordingEventsIdentity {
  recordingId: string;
  eventStreamId: string;
}
/** Private writer identity. Wire contracts never contain writerGeneration. */
export interface RecordingEventsWriter extends RecordingEventsIdentity {
  writerGeneration: string;
}
interface RecordingEventsTotals {
  totalBlocks: number;
  totalRecords: number;
  totalBytes: number;
  streamSha256: string;
}
export interface RecordingEventsHead extends RecordingEventsWriter, RecordingEventsTotals {
  kind: 'head';
  entryId: 0;
  sourceRecordingId: string;
  revision: number;
  retired: boolean;
  finalized: boolean;
  state: 'complete' | 'incomplete' | 'unavailable';
  activeSegment: number | null;
  lastSegmentId: number | null;
  hasGap: boolean;
  activeInputs: number;
  stagingJournalId?: string;
  snapshotAssetId?: string;
}
export interface StoredRecordingEventsBlock extends RecordingEventsIdentity {
  kind: 'block';
  entryId: number;
  entry: RecordingEventsManifestEntry;
  bytes: Uint8Array;
}
export type IndexedRecordingEvent = Extract<
  RecordingEventRecord,
  { kind: 'action' | 'signal' | 'keyboard-repeat-block' }
>;
/** Derived query state. Original blocks retain every base fact and completion update. */
export interface StoredRecordingEventFact extends RecordingEventsIdentity {
  kind: 'fact';
  entryId: string;
  record: IndexedRecordingEvent;
  revision: number;
  observedThroughUs: number | null;
  admittedRepeatCount: number;
  fromTimeUs: number;
  toTimeUs: number;
  timeBuckets: [string, string, number, number][];
}
export interface RecordingEventsStoreDependencies {
  database(): Promise<IDBPDatabase>;
  mintGeneration(): string;
}
export class RecordingEventsError extends Error {
  constructor(
    readonly code:
      | 'invalid'
      | 'integrity'
      | 'missing'
      | 'retired'
      | 'stale-writer'
      | 'conflict'
      | 'finalized'
  ) {
    super('Recording events operation failed.');
    this.name = 'RecordingEventsError';
  }
}
