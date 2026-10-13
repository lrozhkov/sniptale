import {
  normalizeRecordingActions,
  normalizeRecordingSignals,
} from '../../../features/video/project/recording-actions';
import type { RecordingTelemetrySnapshot } from '../../../contracts/messaging/contracts/response-types';
import { clearLegacyControlledCursorArtifacts } from './artifacts';
import { createRecordingTextCursor } from './text-cursor';
import { recordTelemetryPauseBoundary } from './events';
import type { TelemetryState } from './types';
import {
  isRecordingFrameClockAnchor,
  matchesRecordingFrameClockBinding,
  type RecordingFrameClockAnchor,
} from '../../../contracts/video/recording-frame-clock';
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
  enable: (
    recordingId: string | null,
    offsetSeconds?: number,
    frameClock?: RecordingFrameClockAnchor | null
  ) => void;
  updateClock: (recordingId: string, anchor: RecordingFrameClockAnchor) => void;
  isEnabled: () => boolean;
  pause: (frameClock?: RecordingFrameClockAnchor | null) => void;
  resume: (
    frameClock?: RecordingFrameClockAnchor | null,
    sourcePhase?: RecordingFrameClockAnchor
  ) => void;
}

function enableTelemetryState(
  state: TelemetryState,
  recordingId: string | null,
  offsetSeconds = 0,
  frameClock?: RecordingFrameClockAnchor | null
): void {
  if (
    frameClock &&
    (!isRecordingFrameClockAnchor(frameClock) ||
      frameClock.recordingId !== recordingId ||
      (state.recordingId === recordingId &&
        state.frameClock &&
        (!matchesRecordingFrameClockBinding(state.frameClock, frameClock) ||
          frameClock.revision <= state.frameClock.revision)))
  )
    return;
  if (recordingId !== null && state.recordingId === recordingId && state.isEnabled) {
    if (frameClock) updateTelemetryClock(state, recordingId, frameClock);
    return;
  }
  clearLegacyControlledCursorArtifacts();
  removeListeners(state);
  removeViewportObserver(state);
  resetTelemetryState(state, recordingId, offsetSeconds, frameClock);

  if (!state.isEnabled) {
    return;
  }

  if (!state.isPaused) attachListeners(state);
  if (!state.viewportObserver) attachViewportObserver(state);
  observeViewportGeometry(state);
}

function acceptsClockPhase(
  state: TelemetryState,
  anchor: RecordingFrameClockAnchor,
  phase: 'active' | 'paused'
): boolean {
  return (
    isRecordingFrameClockAnchor(anchor) &&
    anchor.phase === phase &&
    anchor.recordingId === state.recordingId &&
    anchor.revision >= state.clockRevision &&
    (!state.frameClock ||
      (matchesRecordingFrameClockBinding(state.frameClock, anchor) &&
        anchor.revision > state.frameClock.revision))
  );
}

/** Calibration replaces the phase binding only; it never replays or clears input. */
function updateTelemetryClock(
  state: TelemetryState,
  recordingId: string,
  anchor: RecordingFrameClockAnchor
): void {
  if (
    !state.isEnabled ||
    state.recordingId !== recordingId ||
    !acceptsClockPhase(state, anchor, state.isPaused ? 'paused' : 'active')
  )
    return;
  state.clockRevision = anchor.revision;
  state.frameClock = { ...anchor };
  state.observationClock.update(anchor);
}

function pauseTelemetryState(
  state: TelemetryState,
  frameClock?: RecordingFrameClockAnchor | null
): void {
  if (!state.isEnabled || state.isPaused) return;
  if (frameClock && !acceptsClockPhase(state, frameClock, 'paused')) return;
  clearLegacyControlledCursorArtifacts();
  try {
    recordTelemetryPauseBoundary(state);
  } finally {
    state.accumulatedDurationMs += Math.max(0, performance.now() - state.segmentStartedAtTimestamp);
    state.isPaused = true;
    removeListeners(state);
  }
  state.mediaResumeEstimateSeconds =
    frameClock?.mediaTimeSeconds ??
    state.observationClock.estimateAt(state.accumulatedDurationMs / 1000);
  if (frameClock) updateTelemetryClock(state, state.recordingId ?? '', frameClock);
  observeViewportGeometry(state);
  removeListeners(state);
}

function resumeTelemetryState(
  state: TelemetryState,
  frameClock?: RecordingFrameClockAnchor | null,
  sourcePhase?: RecordingFrameClockAnchor
): void {
  if (!state.isEnabled) return;
  if (frameClock && !acceptsClockPhase(state, frameClock, 'active')) return;
  if (sourcePhase) {
    if (
      !acceptsClockPhase(state, sourcePhase, 'active') ||
      sourcePhase.revision <= state.clockRevision
    )
      return;
    state.clockRevision = sourcePhase.revision;
    // A newly admitted document has no preceding local phase to close.
    if (
      !state.isPaused &&
      !state.frameClock &&
      !state.cursorTrack &&
      !state.actionEvents.length &&
      !state.signals.length &&
      !state.keyboard.times.length
    )
      return;
  }
  const phase = frameClock ?? sourcePhase;
  if (!state.isPaused) {
    if (!phase) return;
    if (phase.previousMediaTimeSeconds === undefined) {
      if (frameClock) updateTelemetryClock(state, state.recordingId ?? '', frameClock);
      return;
    }
    recordTelemetryPauseBoundary(state);
    state.accumulatedDurationMs += Math.max(0, performance.now() - state.segmentStartedAtTimestamp);
    state.mediaResumeEstimateSeconds = phase.previousMediaTimeSeconds;
    removeListeners(state);
  }
  if (phase?.previousMediaTimeSeconds !== undefined)
    state.observationClock.end(phase.previousMediaTimeSeconds);
  clearLegacyControlledCursorArtifacts();
  state.isPaused = false;
  state.observationAvailable = false;
  state.segmentStartedAtTimestamp = performance.now();
  state.observationClock.start(
    state.segmentStartedAtTimestamp,
    state.accumulatedDurationMs / 1000,
    phase?.mediaTimeSeconds ?? state.mediaResumeEstimateSeconds
  );
  if (frameClock) updateTelemetryClock(state, state.recordingId ?? '', frameClock);
  state.pointerStationaryStartedAtMs = state.pointerStationaryPosition
    ? state.segmentStartedAtTimestamp
    : null;
  attachListeners(state);
  if (!state.viewportObserver) attachViewportObserver(state);
  observeViewportGeometry(state);
}

function disableEnabledTelemetryState(state: TelemetryState): RecordingTelemetrySnapshot {
  clearLegacyControlledCursorArtifacts();
  try {
    if (!state.isPaused) recordTelemetryPauseBoundary(state);
  } finally {
    removeListeners(state);
    removeViewportObserver(state);
    state.isEnabled = false;
  }
  observeViewportGeometry(state);
  state.viewport = buildViewportSnapshot();
  return {
    observationClock: state.observationClock.snapshot(),
    provenance: {
      source: 'browser',
      normalizationVersion: 1,
      timeUnit: 'seconds',
      coordinateSpace: 'client-css',
    },
    capabilities: {
      version: 1,
      pointer: window.top === window ? 'available' : 'unknown',
      keyboard: window.top === window ? 'available' : 'unknown',
      wheel: window.top === window ? 'available' : 'unknown',
      coverage: 'document',
      timing: state.observationClock.timing(),
    },
    viewport: state.viewport,
    viewportObservation: state.viewportObservation ?? null,
    cursorTrack: structuredClone(state.cursorTrack),
    actionEvents: structuredClone(normalizeRecordingActions(state.actionEvents)),
    signals: structuredClone(normalizeRecordingSignals(state.signals)).map((signal) => ({
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

export function createVideoTelemetryController(
  deps: {
    publish?: (recordingId: string, snapshot: RecordingTelemetrySnapshot) => void;
  } = {}
): VideoTelemetryController {
  const state = createInitialState();
  const textCursor = createRecordingTextCursor();
  const disable = () => {
    window.removeEventListener('pagehide', disable);
    textCursor.stop();
    const snapshot = disableTelemetryState(state);
    if (snapshot && state.recordingId) deps.publish?.(state.recordingId, snapshot);
    return snapshot;
  };

  return {
    enable: (recordingId, offsetSeconds, frameClock) => {
      textCursor.stop();
      enableTelemetryState(state, recordingId, offsetSeconds, frameClock);
      if (state.isEnabled) window.addEventListener('pagehide', disable);
      if (state.isEnabled && !state.isPaused) textCursor.start();
    },
    disable,
    updateClock: (recordingId, anchor) => updateTelemetryClock(state, recordingId, anchor),
    isEnabled: () => state.isEnabled,
    pause: (frameClock) => {
      textCursor.stop();
      pauseTelemetryState(state, frameClock);
    },
    resume: (frameClock, sourcePhase) => {
      textCursor.stop();
      resumeTelemetryState(state, frameClock, sourcePhase);
      if (state.isEnabled && !state.isPaused) textCursor.start();
    },
  };
}
