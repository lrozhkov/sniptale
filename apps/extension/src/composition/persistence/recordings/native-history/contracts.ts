import type { RecordingTelemetryEntry } from '../contracts';
import type {
  CursorTrajectoryDescriptor,
  CursorTrajectoryManifestEntry,
} from '../../../../features/video/project/cursor-trajectory/types';
import type {
  RecordingEventsDescriptor,
  RecordingEventsManifestEntry,
} from '../../../../features/video/project/recording-events/types';
import type { RecordingCursorTrajectoryWriter } from '../cursor-trajectory/contracts';
import type { RecordingEventsWriter } from '../recording-events/contracts';
import type { IDBPDatabase } from 'idb';

/** Recordings persistence owns this private field in the completed Native transfer parent. */
export interface NativeRecordingHistoryIntent {
  version: 1;
  operationId: string;
  revision: number;
  recordingId: string;
  recordingAssetId: string;
  videoSha256: string;
  controllerLeaseId: string;
  width: number;
  height: number;
  createdAt: number;
  updatedAt: number;
  baseTelemetry: RecordingTelemetryEntry;
  phase: 'pending' | 'cancelled' | 'complete';
  cursor: {
    descriptor: CursorTrajectoryDescriptor;
    writer: RecordingCursorTrajectoryWriter | null;
    pull: NativeHistoryPullState<CursorTrajectoryManifestEntry> | null;
  } | null;
  events: {
    descriptor: RecordingEventsDescriptor;
    writer: RecordingEventsWriter | null;
    pull: NativeHistoryPullState<RecordingEventsManifestEntry> | null;
  } | null;
}
export interface NativeRecordingHistoryOffer {
  recordingId: string;
  controllerLeaseId: string;
  videoSha256: string;
  width: number;
  height: number;
  baseTelemetry?: RecordingTelemetryEntry;
  cursorTrajectory?: CursorTrajectoryDescriptor;
  recordingEvents?: RecordingEventsDescriptor;
}
export interface NativeRecordingHistoryDependencies {
  database(): Promise<IDBPDatabase>;
  mintGeneration(): string;
  now(): number;
}
export interface NativeRecordingHistoryParent extends Record<string, unknown> {
  id: string;
  kind: 'recording-complete';
  controllerLeaseId: string;
  sha256: string;
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  metadata: Record<string, unknown> & {
    width: number;
    height: number;
    openEditor: boolean;
    history?: unknown;
  };
}
export class NativeRecordingHistoryError extends Error {
  constructor(readonly code: 'invalid' | 'missing' | 'retired' | 'conflict' | 'stale-root') {
    super('Native recording history operation failed.');
    this.name = 'NativeRecordingHistoryError';
  }
}

/** The durable outbox holds one page and one partial block, never a lifetime manifest. */
export type NativeHistoryPullState<Entry> =
  | { kind: 'manifest'; requestId: string; nextSequence: number; prefixSha256: string }
  | {
      kind: 'chunks';
      requestId: string;
      entries: Entry[];
      chunkIndex: 0 | 1;
      firstChunk: Uint8Array | null;
    }
  | { kind: 'verified' | 'unavailable' | 'published' };
export type NativeHistoryPullUpdate =
  | {
      kind: 'cursor';
      descriptor: CursorTrajectoryDescriptor;
      pull: NativeHistoryPullState<CursorTrajectoryManifestEntry>;
    }
  | {
      kind: 'events';
      descriptor: RecordingEventsDescriptor;
      pull: NativeHistoryPullState<RecordingEventsManifestEntry>;
    };

type NativePublicationBinding = Pick<
  NativeRecordingHistoryIntent,
  | 'operationId'
  | 'recordingId'
  | 'recordingAssetId'
  | 'videoSha256'
  | 'controllerLeaseId'
  | 'width'
  | 'height'
> & { version: 1 };
/** This grant pins one verified source. It is private publication state, not a wire DTO. */
export type NativeHistoryPublicationGrant = NativePublicationBinding &
  (
    | {
        kind: 'cursor';
        descriptor: CursorTrajectoryDescriptor;
        writer: RecordingCursorTrajectoryWriter | null;
      }
    | {
        kind: 'events';
        descriptor: RecordingEventsDescriptor;
        writer: RecordingEventsWriter | null;
      }
  );
