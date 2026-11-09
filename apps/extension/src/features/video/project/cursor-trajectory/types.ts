export const CURSOR_TRAJECTORY_MAX_BLOCK_BYTES = 65_536;
export const CURSOR_TRAJECTORY_MAX_BLOCK_RECORDS = 512;

export type CursorTrajectoryBoundaryReason =
  | 'pause'
  | 'stop'
  | 'visibility'
  | 'observation'
  | 'geometry'
  | 'clock-discontinuity'
  | 'zero-time-discontinuity';
export type CursorTrajectoryAnchor =
  | 'start'
  | 'stop'
  | 'before-button'
  | 'after-button'
  | 'visibility'
  | 'observation'
  | 'pause'
  | 'resume'
  | 'geometry'
  | 'gap'
  | 'discontinuity';

export interface CursorTrajectorySegment {
  kind: 'segment';
  segmentId: number;
  activeTimeUs: number;
  width: number;
  height: number;
  clock: {
    source: 'windows-message-time' | 'dom-event-time';
    timestampQuantumUs: number | null;
    resolutionBoundUs: number | null;
    mappingUncertaintyUs: number | null;
  };
  reason:
    | Exclude<CursorTrajectoryBoundaryReason, 'pause' | 'stop'>
    | 'start'
    | 'resume'
    | 'after-gap';
}

export interface CursorTrajectorySample {
  kind: 'sample';
  segmentId: number;
  observationSeq: number;
  activeTimeUs: number;
  xQ8: number | null;
  yQ8: number | null;
  observed: boolean;
  visible: boolean;
  event: 'move' | 'down' | 'up' | 'click';
  button: 'none' | 'left' | 'middle' | 'right' | 'x1' | 'x2';
  relatedObservationSeq: number | null;
  anchors: CursorTrajectoryAnchor[];
}

interface CursorTrajectoryBoundary {
  kind: 'boundary';
  segmentId: number;
  activeTimeUs: number;
  reason: CursorTrajectoryBoundaryReason;
}

interface CursorTrajectoryGap {
  kind: 'gap';
  segmentId: number;
  fromTimeUs: number;
  toTimeUs: number | null;
  firstLostObservationSeq: number | null;
  lastLostObservationSeq: number | null;
  reason:
    | 'input-overflow'
    | 'writer-backpressure'
    | 'source-unavailable'
    | 'storage-failure'
    | 'clock-discontinuity';
}

export type CursorTrajectoryRecord =
  | CursorTrajectorySegment
  | CursorTrajectorySample
  | CursorTrajectoryBoundary
  | CursorTrajectoryGap;

export interface CursorTrajectoryBlock {
  formatVersion: 1;
  recordingId: string;
  trajectoryId: string;
  sequence: number;
  startTimeUs: number;
  endTimeUs: number;
  records: CursorTrajectoryRecord[];
}

export interface CursorTrajectoryManifestEntry {
  sequence: number;
  startTimeUs: number;
  endTimeUs: number;
  recordCount: number;
  sampleCount: number;
  byteLength: number;
  blockSha256: string;
  prefixSha256: string;
}

/** Compact source metadata. The blocks remain in their recording persistence owner. */
export interface CursorTrajectoryDescriptor {
  format: 'cursor-trajectory-v1';
  formatVersion: 1;
  algorithm: 'sed-window-v1';
  encoding: 'json-ascii-int-v1';
  trajectoryId: string;
  state: 'complete' | 'incomplete' | 'unavailable';
  finalized: boolean;
  totalBlocks: number;
  totalRecords: number;
  totalSamples: number;
  totalBytes: number;
  streamSha256: string;
}
