import { RECORDING_EVENT_LABELS } from '../../../features/video/project/recording-events/types';
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
  createTelemetrySourceMoment as cursorMoment,
  getTelemetryElapsedSeconds as getElapsedSeconds,
} from './observation-clock';
import {
  finalizeTelemetrySignals,
  finalizeTypingSignal,
  recordTypingActivity,
  tickCursorIdleTelemetry,
  updatePointerIdleAnchor,
} from './signals';

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
    observationClockId: state.observationClock.id,
    captureSegment: state.captureSegment,
    observation: visible ? 'observed' : 'outside',
    x: event.clientX,
    y: event.clientY,
  });
  if (state.cursorSource && state.cursorTrack)
    state.cursorTrack.samples.splice(0, state.cursorTrack.samples.length - 1);
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
  boundaryTimestamp?: number,
  sourceBoundary?: 'pause' | 'stop' | 'observation'
): void {
  const timestamp = boundaryTimestamp ?? performance.now();
  if (state.cursorSource)
    state.cursorSource.boundary(
      cursorMoment(state, timestamp),
      sourceBoundary ??
        (reason === 'paused' ? 'pause' : reason === 'hidden' ? 'visibility' : 'observation')
    );
  if (state.observationAvailable) {
    if (boundaryTimestamp === undefined) tickCursorIdleTelemetry(state);
    recordLastKnownPointerBoundary(state, timestamp, false);
    const boundary = state.cursorTrack?.samples.at(-1);
    if (boundary) boundary.observation = reason;
  }
  endKeyboardObservation(state);
  finalizeTelemetrySignals(state);
  createPointerGestureRecorder(state).lose('lost', reason === 'outside');
  state.eventSource?.boundary(
    cursorMoment(state, timestamp),
    sourceBoundary === 'stop'
      ? 'stop'
      : sourceBoundary === 'pause' || (!sourceBoundary && reason === 'paused')
        ? 'pause'
        : 'visibility'
  );
  state.observationAvailable = false;
  state.pointerStationaryPosition = null;
  state.pointerStationaryStartedAtMs = null;
}

export function createTelemetryListeners(state: TelemetryState): TelemetryListeners {
  const gestures = createPointerGestureRecorder(state);
  const keyboard = createKeyboardRecorder(state);
  const released = new Map<number, { pointerId: number; sequence: number }>();
  const rawPointer = (event: MouseEvent, kind: 'move' | 'down' | 'up' | 'click') => {
    if (!state.cursorSource) return;
    if (!state.observationAvailable) released.clear();
    const pointerId =
      typeof PointerEvent !== 'undefined' && event instanceof PointerEvent ? event.pointerId : null;
    const previous = released.get(event.button);
    if (kind === 'down') released.delete(event.button);
    const sequence = state.cursorSource.sample(cursorMoment(state, event.timeStamp), {
      x: event.clientX,
      y: event.clientY,
      observed: true,
      visible: true,
      event: kind,
      button:
        kind === 'move'
          ? 'none'
          : event.button === 0
            ? 'left'
            : event.button === 1
              ? 'middle'
              : event.button === 2
                ? 'right'
                : event.button === 3
                  ? 'x1'
                  : event.button === 4
                    ? 'x2'
                    : 'none',
      relatedLocalSequence:
        kind === 'click' && pointerId !== null && previous?.pointerId === pointerId
          ? previous.sequence
          : null,
    });
    if (kind === 'up' && pointerId !== null && event.button >= 0 && event.button <= 4)
      released.set(event.button, { pointerId, sequence });
    if (kind === 'click') released.delete(event.button);
  };
  const observePointer = (
    event: MouseEvent,
    force: boolean,
    kind: 'move' | 'down' | 'up' = 'move',
    trustedParent = false
  ) => {
    if (!event.isTrusted && !trustedParent) return;
    if (!state.observationAvailable) released.clear();
    rawPointer(event, kind);
    state.observationAvailable = true;
    updatePointerIdleAnchor(state, event, { reset: force });
    recordCursorSample(state, event, { force });
  };
  const recordScroll = (event: Event, wheel = false) => {
    if (!event.isTrusted) return;
    const point =
      wheel && event instanceof MouseEvent ? { x: event.clientX, y: event.clientY } : null;
    if (state.eventSource) {
      const observedWheel = wheel && event instanceof WheelEvent ? event : null;
      const normalized =
        point &&
        point.x >= 0 &&
        point.x <= window.innerWidth &&
        point.y >= 0 &&
        point.y <= window.innerHeight
          ? { x: point.x / window.innerWidth, y: point.y / window.innerHeight }
          : null;
      state.eventSource.emit(cursorMoment(state, event.timeStamp), {
        kind: 'action',
        action: {
          id: crypto.randomUUID(),
          kind: 'SCROLL',
          timeUs: Math.round(getElapsedSeconds(state, event.timeStamp) * 1000000),
          durationUs: 0,
          point: normalized,
          label: RECORDING_EVENT_LABELS.SCROLL,
          preset: 'NONE',
          data: {
            eventType: observedWheel ? 'wheel' : 'scroll',
            deltaX: observedWheel?.deltaX ?? null,
            deltaY: observedWheel?.deltaY ?? null,
            deltaZ: observedWheel?.deltaZ ?? null,
            deltaMode: observedWheel?.deltaMode ?? null,
            scrollX: observedWheel ? null : window.scrollX,
            scrollY: observedWheel ? null : window.scrollY,
            ctrlKey: observedWheel?.ctrlKey ?? null,
            altKey: observedWheel?.altKey ?? null,
            shiftKey: observedWheel?.shiftKey ?? null,
            metaKey: observedWheel?.metaKey ?? null,
          },
        },
      });
      return;
    }
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
              observationClockId: state.observationClock.id,
              captureSegment: state.captureSegment,
            }
          : {
              eventType: 'scroll',
              observationClockId: state.observationClock.id,
              captureSegment: state.captureSegment,
            },
    });
  };
  return {
    change: () => undefined,
    click: (event) => {
      if (!event.isTrusted) return;
      rawPointer(event, 'click');
      gestures.click(event);
    },
    input: (event) => {
      if (!event.isTrusted) return;
      if (isProtectedKeyboardTarget(event)) endKeyboardObservation(state);
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
      observePointer(event, true, 'down');
      gestures.down(event);
    },
    pointerMove: (event) => {
      if (event instanceof MouseEvent && event.isTrusted) {
        const coalesced =
          state.cursorSource &&
          typeof PointerEvent !== 'undefined' &&
          event instanceof PointerEvent &&
          typeof event.getCoalescedEvents === 'function'
            ? event.getCoalescedEvents()
            : [];
        if (coalesced.length) {
          for (const sample of coalesced) observePointer(sample, false, 'move', true);
        } else observePointer(event, false);
        gestures.move(event);
      }
    },
    pointerUp: (event) => {
      observePointer(event, true, 'up');
      gestures.up(event);
    },
    pointerCancel: (event) => {
      if (event.isTrusted) released.clear();
      gestures.cancel(event);
    },
    mouseDown: (event) => {
      if (event.isTrusted && !state.gestures.has(event.button)) {
        observePointer(event, true, 'down');
        gestures.down(event);
      }
    },
    mouseUp: (event) => {
      if (event.isTrusted && state.gestures.has(event.button)) {
        observePointer(event, true, 'up');
        gestures.up(event);
      }
    },
    pointerLeave: (event) => {
      if (event.isTrusted && event.relatedTarget === null)
        endObservation(state, 'outside', event.timeStamp);
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
        endKeyboardObservation(state);
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
  boundaryTimestamp?: number,
  sourceBoundary: 'pause' | 'stop' | 'observation' = 'pause'
): void {
  endObservation(state, 'paused', boundaryTimestamp, sourceBoundary);
}
