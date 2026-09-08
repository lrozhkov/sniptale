import type {
  CaptureMode,
  VideoDisplaySurface,
  ViewportInfo,
} from '@sniptale/runtime-contracts/video/types/types';
import type {
  RecordingTelemetrySignal,
  RecordingActionEvent,
  VideoProjectCursorTrack,
} from '../../../features/video/project/types';
import type { LibraryLifecycle } from '../library-lifecycle/contracts';
import type { RecordingGroupMember } from '../../../features/media-hub/recording-groups';

export interface StoredRecordingEntry {
  assetId: string;
  id: string;
  filename: string;
  createdAt: number;
  mimeType: string;
  size: number;
  lifecycle?: LibraryLifecycle;
  recordingGroup?: RecordingGroupMember;
  mediaMetadata?: {
    duration: number;
    height: number;
    kind: 'video';
    width: number;
  };
}

export interface RecordingEntry extends StoredRecordingEntry {
  file: File;
}

export interface RecordingTelemetryEntry {
  /** Present only when source time semantics were verified at native ingestion. */
  provenance?: {
    source: 'native';
    normalizationVersion: 1;
    timeUnit: 'seconds';
    coordinateSpace: 'desktop';
  };
  recordingId: string;
  createdAt: number;
  updatedAt: number;
  captureMode: CaptureMode | null;
  displaySurface?: VideoDisplaySurface | null;
  viewport: ViewportInfo | null;
  cursorTrack: VideoProjectCursorTrack | null;
  actionEvents: RecordingActionEvent[];
  signals: RecordingTelemetrySignal[];
}
