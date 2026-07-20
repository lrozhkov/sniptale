import { translate } from '../../../platform/i18n';
import { createVideoProjectCursorTrack } from '../../../features/video/project/defaults';
import {
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
} from '../../../features/video/project/types';
import type { TelemetryListeners, TelemetryState } from './types';
import {
  finalizeTelemetrySignals,
  recordKeyboardShortcut,
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
  const visible = options.visible ?? true;
  if (options.force !== true && shouldSkipCursorSample(state, event, visible)) {
    return;
  }

  ensureCursorTrack(state).samples.push({
    id: crypto.randomUUID(),
    time: getElapsedSeconds(state, event.timeStamp),
    visible,
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
    } as Pick<PointerEvent, 'clientX' | 'clientY' | 'timeStamp'>,
    { force: true, visible }
  );
}

function resolveActionEvent(
  event: (Pick<MouseEvent, 'button' | 'clientX' | 'clientY'> & { timeStamp: number }) | null
) {
  return {
    timeStamp: event?.timeStamp ?? performance.now(),
    point: event
      ? {
          x: event.clientX,
          y: event.clientY,
        }
      : null,
    data: { button: event?.button ?? 0 },
  };
}

function recordActionEvent(
  state: TelemetryState,
  event: (Pick<MouseEvent, 'button' | 'clientX' | 'clientY'> & { timeStamp: number }) | null
): void {
  const resolvedEvent = resolveActionEvent(event);
  state.actionEvents.push({
    id: crypto.randomUUID(),
    kind: VideoProjectActionEventKind.CLICK,
    time: getElapsedSeconds(state, resolvedEvent.timeStamp),
    duration: 0.45,
    point: resolvedEvent.point,
    label: translate('videoEditor.sidebar.actionPresetClickRipple'),
    data: resolvedEvent.data,
    preset: VideoProjectActionPreset.CLICK_RIPPLE,
  });
}

export function createTelemetryListeners(state: TelemetryState): TelemetryListeners {
  return {
    change: (event) => {
      recordTypingActivity(state, event);
    },
    click: (event) => {
      finalizeTelemetrySignals(state);
      recordCursorSample(state, event as PointerEvent, { force: true });
      recordActionEvent(state, event);
    },
    input: (event) => {
      recordTypingActivity(state, event);
    },
    keyDown: (event) => {
      recordKeyboardShortcut(state, event);
    },
    pointerDown: (event) => {
      updatePointerIdleAnchor(state, event as PointerEvent, { reset: true });
      recordCursorSample(state, event as PointerEvent, { force: true });
    },
    pointerMove: (event) => {
      updatePointerIdleAnchor(state, event as PointerEvent);
      recordCursorSample(state, event as PointerEvent);
    },
    scroll: () => undefined,
    visibilityChange: () => {
      tickCursorIdleTelemetry(state);
      recordLastKnownPointerBoundary(
        state,
        performance.now(),
        document.visibilityState === 'visible'
      );
    },
  };
}

export function recordTelemetryPauseBoundary(state: TelemetryState): void {
  finalizeTelemetrySignals(state);
  recordLastKnownPointerBoundary(state, performance.now());
}
