import { CaptureMode, VideoDisplaySurface } from '@sniptale/runtime-contracts/video/types/types';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import type {
  NativeRecordingTelemetrySnapshot,
  NativeRecordingTimebase,
} from '../../../contracts/native-app';

function normalizeNativeTime(value: number, timebase: NativeRecordingTimebase | undefined): number {
  if (!timebase) {
    return value;
  }
  const startedAt = Number(timebase.startedAtMonotonicNs);
  if (!Number.isFinite(startedAt)) {
    return value;
  }
  return Math.max(0, value - startedAt);
}

function normalizeTelemetrySnapshot(
  telemetry: NativeRecordingTelemetrySnapshot,
  timebase: NativeRecordingTimebase | undefined
): NativeRecordingTelemetrySnapshot {
  return {
    ...telemetry,
    actionEvents: telemetry.actionEvents.map((event) => ({
      ...event,
      time: normalizeNativeTime(event.time, timebase),
    })),
    cursorTrack: telemetry.cursorTrack
      ? {
          ...telemetry.cursorTrack,
          samples: telemetry.cursorTrack.samples.map((sample) => ({
            ...sample,
            time: normalizeNativeTime(sample.time, timebase),
          })),
        }
      : null,
    signals: telemetry.signals.map((signal) => ({
      ...signal,
      endTime: normalizeNativeTime(signal.endTime, timebase),
      startTime: normalizeNativeTime(signal.startTime, timebase),
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
  const telemetry = normalizeTelemetrySnapshot(params.telemetry, params.timebase);

  return {
    actionEvents: telemetry.actionEvents,
    captureMode: CaptureMode.SCREEN,
    createdAt: params.createdAt,
    cursorTrack: telemetry.cursorTrack,
    displaySurface:
      params.sourceMode === 'active-window'
        ? VideoDisplaySurface.WINDOW
        : VideoDisplaySurface.MONITOR,
    recordingId: params.recordingId,
    signals: telemetry.signals,
    updatedAt: params.updatedAt,
    viewport: telemetry.viewport,
  };
}
