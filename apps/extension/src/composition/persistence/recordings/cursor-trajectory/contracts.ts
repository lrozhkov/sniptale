import type { IDBPDatabase } from 'idb';
import type {
  CursorTrajectoryManifestEntry,
  CursorTrajectorySegment,
} from '../../../../features/video/project/cursor-trajectory/types';

export interface RecordingCursorTrajectoryIdentity {
  recordingId: string;
  trajectoryId: string;
}

/** This token fences writes after retirement or restore. It never enters a wire DTO. */
export interface RecordingCursorTrajectoryWriter extends RecordingCursorTrajectoryIdentity {
  writerGeneration: string;
}

export interface RecordingCursorTrajectoryTotals {
  totalBlocks: number;
  totalRecords: number;
  totalSamples: number;
  totalBytes: number;
  streamSha256: string;
}

export interface RecordingCursorTrajectoryHead
  extends RecordingCursorTrajectoryWriter, RecordingCursorTrajectoryTotals {
  sourceRecordingId: string;
  /** Private blocks belong to this existing ready journal until root publication. */
  stagingJournalId?: string;
  /** Compact native resource link. History blocks do not enter asset maintenance scans. */
  snapshotAssetId?: string;
  revision: number;
  width: number;
  height: number;
  retired: boolean;
  finalized: boolean;
  state: 'complete' | 'incomplete' | 'unavailable';
  activeSegment: CursorTrajectorySegment | null;
  lastObservationSeq: number | null;
  lastSegmentId: number | null;
  lastTimeUs: number;
}

export interface StoredRecordingCursorBlock extends RecordingCursorTrajectoryIdentity {
  sequence: number;
  startTimeUs: number;
  entry: CursorTrajectoryManifestEntry;
  initialSegment: CursorTrajectorySegment | null;
  bytes: Uint8Array;
}

/** Runtime composition supplies database admission and its existing mutation barrier. */
export interface RecordingCursorTrajectoryStoreDependencies {
  database(): Promise<IDBPDatabase>;
  mintGeneration(): string;
}

export class RecordingCursorTrajectoryError extends Error {
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
    super('Cursor trajectory operation failed.');
    this.name = 'RecordingCursorTrajectoryError';
  }
}

/** Native file ownership is separate from the recording's video body. */
export const RECORDING_CURSOR_SNAPSHOT_ROLE = 'cursor-trajectory';
