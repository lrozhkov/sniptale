import {
  normalizeRecordingActions,
  normalizeRecordingSignals,
} from '../../../features/video/project/recording-actions';
import type { RecordingTelemetrySnapshot } from '../../../contracts/messaging/contracts/response-types';
import { clearLegacyControlledCursorArtifacts } from './artifacts';
import { recordTelemetryPauseBoundary } from './events';
import type { TelemetryState } from './types';
import {
  attachListeners,
  attachViewportObserver,
  removeViewportObserver,
  observeViewportGeometry,
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
  removeViewportObserver(state);
  resetTelemetryState(state, recordingId, offsetSeconds);

  if (!state.isEnabled) {
    return;
  }

  attachListeners(state);
  if (!state.viewportObserver) attachViewportObserver(state);
  observeViewportGeometry(state);
}

function pauseTelemetryState(state: TelemetryState): void {
  if (!state.isEnabled || state.isPaused) {
    return;
  }

  clearLegacyControlledCursorArtifacts();
  recordTelemetryPauseBoundary(state);
  state.accumulatedDurationMs += Math.max(0, performance.now() - state.segmentStartedAtTimestamp);
  observeViewportGeometry(state);
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
  if (!state.viewportObserver) attachViewportObserver(state);
  observeViewportGeometry(state);
}

function disableEnabledTelemetryState(state: TelemetryState): RecordingTelemetrySnapshot {
  clearLegacyControlledCursorArtifacts();
  recordTelemetryPauseBoundary(state);
  removeListeners(state);
  observeViewportGeometry(state);
  removeViewportObserver(state);
  state.isEnabled = false;
  state.viewport = buildViewportSnapshot();
  return {
    viewport: state.viewport,
    viewportObservation: state.viewportObservation ?? null,
    cursorTrack: state.cursorTrack,
    actionEvents: normalizeRecordingActions(state.actionEvents),
    signals: normalizeRecordingSignals(state.signals).map((signal) => ({
      ...signal,
      point: signal.point === null ? null : { ...signal.point },
      data: { ...signal.data },
    })),
  };
}

function disableTelemetryState(state: TelemetryState): RecordingTelemetrySnapshot | null {
  clearLegacyControlledCursorArtifacts();
  if (!state.isEnabled) {
    removeViewportObserver(state);
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
