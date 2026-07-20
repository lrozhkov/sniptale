import type { RecordingTelemetrySnapshot } from '../../../contracts/messaging/contracts/response-types';
import { clearLegacyControlledCursorArtifacts } from './artifacts';
import { recordTelemetryPauseBoundary } from './events';
import type { TelemetryState } from './types';
import {
  attachListeners,
  buildViewportSnapshot,
  createInitialState,
  removeListeners,
  resetTelemetryState,
} from './state';

interface VideoTelemetryController {
  disable: () => RecordingTelemetrySnapshot | null;
  enable: (recordingId: string | null, offsetSeconds?: number) => void;
  isEnabled: () => boolean;
  pause: () => void;
  resume: () => void;
}

function enableTelemetryState(
  state: TelemetryState,
  recordingId: string | null,
  offsetSeconds = 0
): void {
  clearLegacyControlledCursorArtifacts();
  removeListeners(state);
  resetTelemetryState(state, recordingId, offsetSeconds);

  if (!state.isEnabled) {
    return;
  }

  attachListeners(state);
}

function pauseTelemetryState(state: TelemetryState): void {
  if (!state.isEnabled || state.isPaused) {
    return;
  }

  clearLegacyControlledCursorArtifacts();
  recordTelemetryPauseBoundary(state);
  state.accumulatedDurationMs += Math.max(0, performance.now() - state.segmentStartedAtTimestamp);
  state.isPaused = true;
  removeListeners(state);
}

function resumeTelemetryState(state: TelemetryState): void {
  if (!state.isEnabled || !state.isPaused) {
    return;
  }

  clearLegacyControlledCursorArtifacts();
  state.isPaused = false;
  state.segmentStartedAtTimestamp = performance.now();
  attachListeners(state);
}

function disableEnabledTelemetryState(state: TelemetryState): RecordingTelemetrySnapshot {
  clearLegacyControlledCursorArtifacts();
  recordTelemetryPauseBoundary(state);
  removeListeners(state);
  state.isEnabled = false;
  state.viewport = buildViewportSnapshot();
  return {
    viewport: state.viewport,
    cursorTrack: state.cursorTrack,
    actionEvents: [...state.actionEvents],
    signals: state.signals.map((signal) => ({
      ...signal,
      point: signal.point === null ? null : { ...signal.point },
      data: { ...signal.data },
    })),
  };
}

function disableTelemetryState(state: TelemetryState): RecordingTelemetrySnapshot | null {
  clearLegacyControlledCursorArtifacts();
  if (!state.isEnabled) {
    removeListeners(state);
    return null;
  }

  return disableEnabledTelemetryState(state);
}

export function createVideoTelemetryController(): VideoTelemetryController {
  const state = createInitialState();

  return {
    enable: (recordingId, offsetSeconds) => enableTelemetryState(state, recordingId, offsetSeconds),
    disable: () => disableTelemetryState(state),
    isEnabled: () => state.isEnabled,
    pause: () => pauseTelemetryState(state),
    resume: () => resumeTelemetryState(state),
  };
}
