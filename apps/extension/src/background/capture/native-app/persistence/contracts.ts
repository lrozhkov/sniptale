import type { CursorTrajectoryDescriptor } from '../../../../features/video/project/cursor-trajectory/types';
import type { RecordingEventsDescriptor } from '../../../../features/video/project/recording-events/types';
import type {
  NativeRecordingTelemetrySnapshot,
  NativeRecordingTimebase,
} from '../../../../contracts/native-app';

export interface NativeTransferSessionEntry {
  id: string;
  kind:
    | 'screenshot'
    | 'screenshot-complete'
    | 'recording'
    | 'recording-start'
    | 'recording-complete';
  controllerLeaseId: string;
  filename: string;
  mimeType: 'image/png' | 'video/mp4';
  totalBytes: number;
  chunkCount: number;
  sha256: string;
  receivedBytes: number;
  receivedChunkIndexes: number[];
  createdAt: number;
  updatedAt: number;
  expiresAt: number;
  metadata: {
    /** Recordings persistence owns and validates this private history intent. */
    history?: unknown;
    cursorTrajectory?: CursorTrajectoryDescriptor;
    recordingEvents?: RecordingEventsDescriptor;
    capturedAtEpochMs?: number;
    durationMs?: number;
    fps?: number;
    height: number;
    openEditor: boolean;
    settingsRevision?: string;
    sourceMode?: 'screen' | 'active-window' | 'region';
    telemetry?: NativeRecordingTelemetrySnapshot | null;
    timebase?: NativeRecordingTimebase;
    width: number;
  };
}

export interface NativeTransferChunkEntry {
  sessionId: string;
  chunkIndex: number;
  chunkByteOffset: number;
  chunkRawBytes: number;
  chunkSha256: string;
  blob: Blob;
  createdAt: number;
}
