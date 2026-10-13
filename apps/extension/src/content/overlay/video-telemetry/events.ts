import { describeTelemetryTarget } from './target';
import { createPointerGestureRecorder } from './gestures';
import {
  createKeyboardRecorder,
  endKeyboardObservation,
  flushKeyboardRhythm,
  isProtectedKeyboardTarget,
} from './keyboard';
import { createVideoProjectCursorTrack } from '../../../features/video/project/defaults';
import {
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
} from '../../../features/video/project/types';
import type { TelemetryListeners, TelemetryState } from './types';
import {
  finalizeTelemetrySignals,
  finalizeTypingSignal,
  recordTypingActivity,
  tickCursorIdleTelemetry,
  updatePointerIdleAnchor,
} from './signals';

function getElapsedSeconds(state: TelemetryState, timestampMs: number): number {
  const runningDurationMs = state.isPaused ? 0 : timestampMs - state.segmentStartedAtTimestamp;
  return Math.max(0, (state.accumulatedDurationMs + runningDurationMs) / 1000);
}

function ensureCursorTrack(state: TelemetryState): NonNullable<TelemetryState['cursorTrack']> {
  if (state.cursorTrack) {
    return state.cursorTrack;
  }

  state.cursorTrack = createVideoProjectCursorTrack('embedded-fallback');
  return state.cursorTrack;
}

function shouldSkipCursorSample(
  state: TelemetryState,
  event: Pick<PointerEvent, 'clientX' | 'clientY' | 'timeStamp'>,
  visible: boolean
): boolean {
  const previousSample = state.cursorTrack?.samples.at(-1);
  if (!previousSample) {
    return false;
  }

  return (
    previousSample.x === event.clientX &&
    previousSample.y === event.clientY &&
    previousSample.visible === visible &&
    Math.abs(event.timeStamp - state.lastSampleTimeMs) < 1
  );
}

function recordCursorSample(
  state: TelemetryState,
  event: Pick<PointerEvent, 'clientX' | 'clientY' | 'timeStamp'>,
  options: { force?: boolean; visible?: boolean } = {}
): void {
  state.viewportObserver?.();
  const visible = options.visible ?? true;
  if (options.force !== true && shouldSkipCursorSample(state, event, visible)) {
    return;
  }

  ensureCursorTrack(state).samples.push({
    id: crypto.randomUUID(),
    time: getElapsedSeconds(state, event.timeStamp),
    visible,
    captureSegment: state.captureSegment,
    observation: visible ? 'observed' : 'outside',
    x: event.clientX,
    y: event.clientY,
  });
  state.lastKnownPointerPosition = {
    x: event.clientX,
    y: event.clientY,
  };
  state.lastSampleTimeMs = event.timeStamp;
}

function recordLastKnownPointerBoundary(
  state: TelemetryState,
  timestampMs: number,
  visible = true
): void {
  if (!state.lastKnownPointerPosition) {
    return;
  }

  recordCursorSample(
    state,
    {
      clientX: state.lastKnownPointerPosition.x,
      clientY: state.lastKnownPointerPosition.y,
      timeStamp: timestampMs,
    },
    { force: true, visible }
  );
}

/** An observation boundary records unavailable coverage, never a new observed position. */
function endObservation(
  state: TelemetryState,
  reason: 'outside' | 'hidden' | 'blur' | 'paused',
  boundaryTimestamp?: number
): void {
  const timestamp = boundaryTimestamp ?? performance.now();
  if (state.observationAvailable) {
    if (boundaryTimestamp === undefined) tickCursorIdleTelemetry(state);
    recordLastKnownPointerBoundary(state, timestamp, false);
    const boundary = state.cursorTrack?.samples.at(-1);
    if (boundary) boundary.observation = reason;
  }
  endKeyboardObservation(state);
  finalizeTelemetrySignals(state);
  createPointerGestureRecorder(state).lose('lost', timestamp, reason === 'outside');
  state.observationAvailable = false;
  state.pointerStationaryPosition = null;
  state.pointerStationaryStartedAtMs = null;
}

export function createTelemetryListeners(state: TelemetryState): TelemetryListeners {
  const gestures = createPointerGestureRecorder(state);
  const keyboard = createKeyboardRecorder(state);
  const observePointer = (event: MouseEvent, force: boolean) => {
    if (!event.isTrusted) return;
    state.observationAvailable = true;
    updatePointerIdleAnchor(state, event, { reset: force });
    recordCursorSample(state, event, { force });
  };
  const recordScroll = (event: Event, wheel = false) => {
    if (!event.isTrusted) return;
    const point =
      wheel && event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : null;
    state.actionEvents.push({
      id: crypto.randomUUID(),
      kind: VideoProjectActionEventKind.SCROLL,
      time: getElapsedSeconds(state, event.timeStamp),
      duration: 0.45,
      point,
      label: wheel ? 'Wheel' : 'Scroll',
      preset: VideoProjectActionPreset.SCROLL_EMPHASIS,
      data:
        wheel && event instanceof WheelEvent
          ? {
              eventType: 'wheel',
              deltaX: event.deltaX,
              deltaY: event.deltaY,
              deltaZ: event.deltaZ,
              deltaMode: event.deltaMode,
              ctrlKey: event.ctrlKey,
              altKey: event.altKey,
              shiftKey: event.shiftKey,
              metaKey: event.metaKey,
              captureSegment: state.captureSegment,
            }
          : { eventType: 'scroll', captureSegment: state.captureSegment },
    });
  };
  return {
    change: () => undefined,
    click: gestures.click,
    input: (event) => {
      if (!event.isTrusted) return;
      if (isProtectedKeyboardTarget(event)) endKeyboardObservation(state, true);
      else if (describeTelemetryTarget(event).element !== state.keyboard.target)
        flushKeyboardRhythm(state);
      gestures.controlInput(event);
      recordTypingActivity(state, event);
    },
    keyDown: keyboard.down,
    keyUp: keyboard.up,
    pointerDown: (event) => {
      if (!event.isTrusted) return;
      finalizeTypingSignal(state, event.timeStamp);
      flushKeyboardRhythm(state);
      observePointer(event, true);
      gestures.down(event);
    },
    pointerMove: (event) => {
      if (event instanceof MouseEvent) {
        observePointer(event, false);
        gestures.move(event);
      }
    },
    pointerUp: (event) => {
      observePointer(event, true);
      gestures.up(event);
    },
    pointerCancel: gestures.cancel,
    mouseDown: (event) => {
      if (event.isTrusted && !state.gestures.has(event.button)) {
        observePointer(event, true);
        gestures.down(event);
      }
    },
    mouseUp: (event) => {
      if (event.isTrusted && state.gestures.has(event.button)) {
        observePointer(event, true);
        gestures.up(event);
      }
    },
    pointerLeave: (event) => {
      if (event.isTrusted && event.relatedTarget === null) endObservation(state, 'outside');
    },
    dragStart: gestures.dragStart,
    dragEnd: gestures.dragEnd,
    drop: gestures.drop,
    selectionChange: gestures.selectionChange,
    wheel: (event) => recordScroll(event, true),
    scroll: (event) => recordScroll(event),
    blur: (event) => {
      if (!event || event.target === window) endObservation(state, 'blur');
      else {
        endKeyboardObservation(state, isProtectedKeyboardTarget(event));
        finalizeTypingSignal(state, event.timeStamp);
      }
    },
    visibilityChange: () => {
      if (document.visibilityState !== 'visible') endObservation(state, 'hidden');
    },
  };
}

export function recordTelemetryPauseBoundary(
  state: TelemetryState,
  boundaryTimestamp?: number
): void {
  endObservation(state, 'paused', boundaryTimestamp);
}
