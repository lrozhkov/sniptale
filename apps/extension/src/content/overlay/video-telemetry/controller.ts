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
  encodeRecordingKeyboardRhythm,
  iterateRecordingKeyboardRhythm,
} from '../../../features/video/project/keyboard-rhythm';
import type { RecordingKeyboardRhythmBlock } from '../../../features/video/project/types';
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
  isEnabled: () => boolean;
  pause: (frameClock?: RecordingFrameClockAnchor | null) => void;
  resume: (frameClock?: RecordingFrameClockAnchor | null) => void;
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
      (state.frameClock &&
        (!matchesRecordingFrameClockBinding(state.frameClock, frameClock) ||
          frameClock.revision <= state.frameClock.revision)))
  )
    return;
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
    (!state.frameClock ||
      (matchesRecordingFrameClockBinding(state.frameClock, anchor) &&
        anchor.revision > state.frameClock.revision))
  );
}

function rhythmPrefix(
  blocks: RecordingKeyboardRhythmBlock[] | undefined,
  boundary: number
): RecordingKeyboardRhythmBlock[] | undefined {
  if (!blocks) return undefined;
  return blocks.flatMap((block) => {
    const times = [...iterateRecordingKeyboardRhythm(block, 0, boundary)].map(
      (attack) => attack.time
    );
    return times.length ? [encodeRecordingKeyboardRhythm(block.id, times)] : [];
  });
}

/** Preserve observed onsets; discard excluded tail facts without manufacturing a release. */
function retainTelemetryPrefix(state: TelemetryState, boundary: number): void {
  if (state.cursorTrack)
    state.cursorTrack.samples = state.cursorTrack.samples.filter(
      (sample) => sample.time <= boundary
    );
  const sample = state.cursorTrack?.samples.toReversed().find((entry) => entry.visible !== false);
  state.lastKnownPointerPosition = sample ? { x: sample.x, y: sample.y } : null;
  state.actionEvents = state.actionEvents
    .filter((event) => event.time <= boundary)
    .map((event) => {
      const repeats = rhythmPrefix(event.keyboardRepeats, boundary);
      if (repeats) event.keyboardRepeats = repeats;
      const late = ['upTime', 'semanticEndTime', 'lastObservedTime', 'dragStartTime'].some(
        (key) => typeof event.data[key] === 'number' && Number(event.data[key]) > boundary
      );
      if (!late) return event;
      for (const key of [
        'upTime',
        'upX',
        'upY',
        'pressDuration',
        'semanticEndTime',
        'dragStartTime',
        'maxExcursionCssPx',
        'clickCount',
        'dropObserved',
        'pointerCancelled',
      ])
        delete event.data[key];
      event.data['completion'] = 'lost';
      event.data['lastObservedTime'] = event.time;
      if (event.kind === 'CLICK') {
        event.data['gestureType'] = 'click';
        event.preset = 'CLICK_PRESS';
      }
      return event;
    });
  state.signals = state.signals
    .filter((signal) => signal.startTime <= boundary)
    .map((signal) => {
      if (signal.data['privacy'] === 'protected') {
        // Preserve coarse private-activity coverage without adding identifying timing facts.
        signal.endTime = Math.min(signal.endTime, boundary);
        return signal;
      }
      const rhythm = rhythmPrefix(signal.keyboardRhythm, boundary);
      const repeats = rhythmPrefix(signal.keyboardRepeats, boundary);
      if (rhythm) signal.keyboardRhythm = rhythm;
      if (repeats) signal.keyboardRepeats = repeats;
      if (signal.endTime > boundary) {
        const observed = [...(rhythm ?? []), ...(repeats ?? [])].flatMap((block) =>
          [...iterateRecordingKeyboardRhythm(block)].map((attack) => attack.time)
        );
        signal.endTime = observed.length ? Math.max(...observed) : signal.startTime;
        for (const key of ['upTime', 'pressDuration', 'eventCount']) delete signal.data[key];
        signal.data['completion'] = 'lost';
        signal.data['lastObservedTime'] = signal.endTime;
      }
      return signal;
    });
  if (
    state.pointerStationaryStartedAtMs !== null &&
    state.accumulatedDurationMs +
      state.pointerStationaryStartedAtMs -
      state.segmentStartedAtTimestamp >
      boundary * 1000
  ) {
    state.pointerStationaryPosition = null;
    state.pointerStationaryStartedAtMs = null;
    state.cursorIdleSignal = null;
  }
}

/** Optional synchronization failure discards unverified history and releases every observer. */
function invalidateExactTelemetry(state: TelemetryState): void {
  retainTelemetryPrefix(state, state.confirmedMediaTimeSeconds);
  recordTelemetryPauseBoundary(
    state,
    state.segmentStartedAtTimestamp +
      state.confirmedMediaTimeSeconds * 1000 -
      state.accumulatedDurationMs
  );
  retainTelemetryPrefix(state, state.confirmedMediaTimeSeconds);
  removeListeners(state);
  removeViewportObserver(state);
  state.isEnabled = false;
  state.isPaused = true;
  state.clockUnavailable = true;
  state.observationAvailable = false;
}

function pauseTelemetryState(
  state: TelemetryState,
  frameClock?: RecordingFrameClockAnchor | null
): void {
  if (!state.isEnabled || state.isPaused) {
    return;
  }

  clearLegacyControlledCursorArtifacts();
  if (frameClock === null) {
    invalidateExactTelemetry(state);
    return;
  }
  if (frameClock && !acceptsClockPhase(state, frameClock, 'paused')) return;
  if (state.frameClock !== undefined && !frameClock) return;
  if (frameClock) retainTelemetryPrefix(state, frameClock.mediaTimeSeconds);
  recordTelemetryPauseBoundary(
    state,
    frameClock ? frameClock.captureEpochMs - performance.timeOrigin : undefined
  );
  if (frameClock) {
    retainTelemetryPrefix(state, frameClock.mediaTimeSeconds);
    state.frameClock = { ...frameClock };
    state.accumulatedDurationMs = frameClock.mediaTimeSeconds * 1000;
    state.confirmedMediaTimeSeconds = frameClock.mediaTimeSeconds;
  } else
    state.accumulatedDurationMs += Math.max(0, performance.now() - state.segmentStartedAtTimestamp);
  observeViewportGeometry(state);
  state.isPaused = true;
  removeListeners(state);
}

function resumeTelemetryState(
  state: TelemetryState,
  frameClock?: RecordingFrameClockAnchor | null
): void {
  if (!state.isEnabled && !state.clockUnavailable) return;
  if (frameClock !== null && !state.isPaused && !frameClock) return;

  clearLegacyControlledCursorArtifacts();
  if (frameClock === null) {
    invalidateExactTelemetry(state);
    return;
  }
  if (frameClock && !acceptsClockPhase(state, frameClock, 'active')) return;
  if (frameClock && !state.isPaused) {
    if (frameClock.previousMediaTimeSeconds === undefined) {
      invalidateExactTelemetry(state);
      return;
    }
    const boundary = frameClock.previousMediaTimeSeconds;
    retainTelemetryPrefix(state, boundary);
    recordTelemetryPauseBoundary(
      state,
      state.segmentStartedAtTimestamp + boundary * 1000 - state.accumulatedDurationMs
    );
    retainTelemetryPrefix(state, boundary);
    state.confirmedMediaTimeSeconds = boundary;
    removeListeners(state);
  }
  if (state.frameClock !== undefined && !frameClock) return;
  state.isPaused = false;
  state.isEnabled = true;
  state.clockUnavailable = false;
  state.observationAvailable = false;
  if (frameClock) {
    state.frameClock = { ...frameClock };
    state.accumulatedDurationMs = frameClock.mediaTimeSeconds * 1000;
  }
  state.segmentStartedAtTimestamp = frameClock
    ? frameClock.captureEpochMs - performance.timeOrigin
    : performance.now();
  // Pause time is not cursor inactivity in the recorded result.
  state.pointerStationaryStartedAtMs = state.pointerStationaryPosition
    ? state.segmentStartedAtTimestamp
    : null;
  attachListeners(state);
  if (!state.viewportObserver) attachViewportObserver(state);
  observeViewportGeometry(state);
}

function disableEnabledTelemetryState(state: TelemetryState): RecordingTelemetrySnapshot {
  clearLegacyControlledCursorArtifacts();
  if (!state.clockUnavailable) recordTelemetryPauseBoundary(state);
  removeListeners(state);
  observeViewportGeometry(state);
  removeViewportObserver(state);
  state.isEnabled = false;
  state.viewport = buildViewportSnapshot();
  return {
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
    if (
      !state.clockUnavailable ||
      (!state.actionEvents.length && !state.signals.length && !state.cursorTrack?.samples.length)
    )
      return null;
  }

  return disableEnabledTelemetryState(state);
}

export function createVideoTelemetryController(): VideoTelemetryController {
  const state = createInitialState();
  const textCursor = createRecordingTextCursor();

  return {
    enable: (recordingId, offsetSeconds, frameClock) => {
      textCursor.stop();
      enableTelemetryState(state, recordingId, offsetSeconds, frameClock);
      if (state.isEnabled && !state.isPaused) textCursor.start();
    },
    disable: () => {
      textCursor.stop();
      return disableTelemetryState(state);
    },
    isEnabled: () => state.isEnabled,
    pause: (frameClock) => {
      textCursor.stop();
      pauseTelemetryState(state, frameClock);
    },
    resume: (frameClock) => {
      textCursor.stop();
      resumeTelemetryState(state, frameClock);
      if (state.isEnabled && !state.isPaused) textCursor.start();
    },
  };
}
