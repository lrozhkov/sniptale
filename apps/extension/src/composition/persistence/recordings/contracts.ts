import type {
  CaptureMode,
  VideoDisplaySurface,
  ViewportInfo,
} from '@sniptale/runtime-contracts/video/types/types';
import type {
  RecordingTelemetrySignal,
  VideoProjectActionEvent,
  VideoProjectCursorTrack,
} from '../../../features/video/project/types';

export interface RecordingEntry {
  id: string;
  blob: Blob;
  filename: string;
  createdAt: number;
  size: number;
}

export interface RecordingTelemetryEntry {
  recordingId: string;
  createdAt: number;
  updatedAt: number;
  captureMode: CaptureMode | null;
  displaySurface?: VideoDisplaySurface | null;
  viewport: ViewportInfo | null;
  cursorTrack: VideoProjectCursorTrack | null;
  actionEvents: VideoProjectActionEvent[];
  signals: RecordingTelemetrySignal[];
}
