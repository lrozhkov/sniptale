import type {
  RecordingTelemetrySignal,
  VideoProjectActionEvent,
  VideoProjectCursorTrack,
} from '../../features/video/project/types';
import type { ViewportInfo } from '@sniptale/runtime-contracts/video/types/types';

export interface NativeRecordingTimebase {
  id: string;
  startedAtEpochMs: number;
  startedAtMonotonicNs: string;
  units: 'milliseconds';
}

export interface NativeRecordingTelemetrySnapshot {
  viewport: ViewportInfo | null;
  cursorTrack: VideoProjectCursorTrack | null;
  actionEvents: VideoProjectActionEvent[];
  signals: RecordingTelemetrySignal[];
}
