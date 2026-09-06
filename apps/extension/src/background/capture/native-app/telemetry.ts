import { CaptureMode, VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { parseRecordingTelemetryEntry } from '../../../composition/persistence/recordings/telemetry.guards';
import type {
  NativeRecordingTelemetrySnapshot,
  NativeRecordingTimebase,
} from '../../../contracts/native-app';

function normalizeTelemetrySnapshot(
  telemetry: NativeRecordingTelemetrySnapshot
): NativeRecordingTelemetrySnapshot {
  // Native media_time_ms already removes pauses and the monotonic origin.
  return {
    ...telemetry,
    actionEvents: telemetry.actionEvents.map((event) => ({
      ...event,
      time: event.time / 1000,
      duration: event.duration / 1000,
    })),
    cursorTrack: telemetry.cursorTrack
      ? {
          ...telemetry.cursorTrack,
          samples: telemetry.cursorTrack.samples.map((sample) => ({
            ...sample,
            time: sample.time / 1000,
          })),
        }
      : null,
    signals: telemetry.signals.map((signal) => ({
      ...signal,
      startTime: signal.startTime / 1000,
      endTime: signal.endTime / 1000,
    })),
  };
}

export function mapNativeRecordingTelemetry(params: {
  createdAt: number;
  recordingId: string;
  telemetry: NativeRecordingTelemetrySnapshot | null;
  updatedAt: number;
  sourceMode: 'screen' | 'active-window' | 'region';
  timebase?: NativeRecordingTimebase;
}): RecordingTelemetryEntry | null {
  if (!params.telemetry) {
    return null;
  }
  const telemetry = normalizeTelemetrySnapshot(params.telemetry);

  return parseRecordingTelemetryEntry({
    actionEvents: telemetry.actionEvents,
    captureMode: CaptureMode.SCREEN,
    createdAt: params.createdAt,
    cursorTrack: telemetry.cursorTrack,
    displaySurface:
      params.sourceMode === 'active-window'
        ? VideoDisplaySurface.WINDOW
        : VideoDisplaySurface.MONITOR,
    recordingId: params.recordingId,
    provenance: {
      source: 'native',
      normalizationVersion: 1,
      timeUnit: 'seconds',
      coordinateSpace: 'desktop',
    },
    signals: telemetry.signals,
    updatedAt: params.updatedAt,
    viewport: telemetry.viewport,
  });
}
