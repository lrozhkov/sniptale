import {
  RecordingTelemetrySignalKind,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
} from '../../../features/video/project/types';
import { normalizeHotkeyKey } from '../../../features/keyboard-shortcuts/hotkeys';
import type { CursorIdleTelemetrySignal, TelemetryState, TypingTelemetrySignal } from './types';

const CURSOR_IDLE_DWELL_MS = 1200;
const CURSOR_IDLE_TOLERANCE_PX = 12;
const TYPING_MERGE_GAP_MS = 1200;

function getElapsedSeconds(state: TelemetryState, timestampMs: number): number {
  const runningDurationMs = state.isPaused ? 0 : timestampMs - state.segmentStartedAtTimestamp;
  return Math.max(0, (state.accumulatedDurationMs + runningDurationMs) / 1000);
}

function resolveSignalPoint(state: TelemetryState) {
  return state.lastKnownPointerPosition === null ? null : { ...state.lastKnownPointerPosition };
}

function pushCompletedSignal(
  state: TelemetryState,
  signal: CursorIdleTelemetrySignal | TypingTelemetrySignal,
  timestampMs: number
) {
  const data =
    signal.kind === RecordingTelemetrySignalKind.TYPING
      ? {
          eventCount: signal.data.eventCount,
          eventType: signal.data.eventType,
        }
      : {
          dwellMs: signal.data.dwellMs,
        };

  state.signals.push({
    ...signal,
    point: signal.point === null ? null : { ...signal.point },
    data,
    endTime: Math.max(signal.startTime, getElapsedSeconds(state, timestampMs)),
  });
}

function finalizeTypingSignal(state: TelemetryState, timestampMs: number): void {
  if (state.typingSignal === null) {
    return;
  }

  pushCompletedSignal(state, state.typingSignal, timestampMs);
  state.typingSignal = null;
}

function finalizeCursorIdleSignal(state: TelemetryState, timestampMs: number): void {
  if (state.cursorIdleSignal === null) {
    return;
  }

  pushCompletedSignal(state, state.cursorIdleSignal, timestampMs);
  state.cursorIdleSignal = null;
}

function resolveKeyboardShortcutLabel(event: KeyboardEvent): string {
  const parts: string[] = [];
  if (event.metaKey) {
    parts.push('Meta');
  }
  if (event.ctrlKey) {
    parts.push('Ctrl');
  }
  if (event.altKey) {
    parts.push('Alt');
  }
  if (event.shiftKey) {
    parts.push('Shift');
  }

  const normalizedKey = normalizeHotkeyKey(event.key, event.code);
  const key = normalizedKey.startsWith('Arrow')
    ? normalizedKey.replace(/^Arrow/, '')
    : normalizedKey;
  parts.push(key);
  return parts.join('+');
}

function shouldRecordKeyboardShortcut(event: KeyboardEvent): boolean {
  if (event.repeat) {
    return false;
  }

  return (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    event.key === 'Tab' ||
    event.key === 'Escape' ||
    event.key === 'Enter'
  );
}

export function recordKeyboardShortcut(state: TelemetryState, event: KeyboardEvent): void {
  if (!shouldRecordKeyboardShortcut(event)) {
    return;
  }

  const label = resolveKeyboardShortcutLabel(event);
  state.actionEvents.push({
    id: crypto.randomUUID(),
    kind: VideoProjectActionEventKind.KEY,
    time: getElapsedSeconds(state, event.timeStamp),
    duration: 0.55,
    point: resolveSignalPoint(state),
    label,
    data: {
      combo: label,
      key: event.key,
    },
    preset: VideoProjectActionPreset.SPOTLIGHT,
  });
}

export function recordTypingActivity(state: TelemetryState, event: Event): void {
  const timestampMs = event.timeStamp || performance.now();
  const elapsedSeconds = getElapsedSeconds(state, timestampMs);
  const lastEventTimeMs = state.typingSignal?.data.lastEventTimeMs ?? null;

  if (
    state.typingSignal !== null &&
    lastEventTimeMs !== null &&
    timestampMs - lastEventTimeMs <= TYPING_MERGE_GAP_MS
  ) {
    state.typingSignal = {
      ...state.typingSignal,
      endTime: elapsedSeconds,
      data: {
        ...state.typingSignal.data,
        eventCount: state.typingSignal.data.eventCount + 1,
        lastEventTimeMs: timestampMs,
      },
    };
    return;
  }

  finalizeTypingSignal(state, timestampMs);
  state.typingSignal = {
    id: crypto.randomUUID(),
    kind: RecordingTelemetrySignalKind.TYPING,
    startTime: elapsedSeconds,
    endTime: elapsedSeconds,
    point: resolveSignalPoint(state),
    data: {
      eventCount: 1,
      eventType: event.type,
      lastEventTimeMs: timestampMs,
    },
  };
}

function getPointerDistance(left: { x: number; y: number }, right: { x: number; y: number }) {
  return Math.hypot(left.x - right.x, left.y - right.y);
}

export function updatePointerIdleAnchor(
  state: TelemetryState,
  event: Pick<PointerEvent, 'clientX' | 'clientY' | 'timeStamp'>,
  options: { reset: boolean } = { reset: false }
) {
  const nextPosition = { x: event.clientX, y: event.clientY };
  const stationaryPosition = state.pointerStationaryPosition;
  if (
    options.reset ||
    stationaryPosition === null ||
    getPointerDistance(stationaryPosition, nextPosition) > CURSOR_IDLE_TOLERANCE_PX
  ) {
    finalizeCursorIdleSignal(state, event.timeStamp);
    state.pointerStationaryPosition = nextPosition;
    state.pointerStationaryStartedAtMs = event.timeStamp;
  }
}

function syncCursorIdleSignal(state: TelemetryState, timestampMs: number): void {
  if (
    state.isPaused ||
    state.pointerStationaryPosition === null ||
    state.pointerStationaryStartedAtMs === null
  ) {
    return;
  }

  if (timestampMs - state.pointerStationaryStartedAtMs < CURSOR_IDLE_DWELL_MS) {
    return;
  }

  const endTime = getElapsedSeconds(state, timestampMs);
  if (state.cursorIdleSignal === null) {
    state.cursorIdleSignal = {
      id: crypto.randomUUID(),
      kind: RecordingTelemetrySignalKind.CURSOR_IDLE,
      startTime: getElapsedSeconds(state, state.pointerStationaryStartedAtMs),
      endTime,
      point: { ...state.pointerStationaryPosition },
      data: {
        dwellMs: timestampMs - state.pointerStationaryStartedAtMs,
      },
    };
    return;
  }

  state.cursorIdleSignal = {
    ...state.cursorIdleSignal,
    endTime,
    data: {
      ...state.cursorIdleSignal.data,
      dwellMs: timestampMs - state.pointerStationaryStartedAtMs,
    },
  };
}

export function tickCursorIdleTelemetry(state: TelemetryState): void {
  syncCursorIdleSignal(state, performance.now());
}

export function finalizeTelemetrySignals(state: TelemetryState): void {
  const timestampMs = performance.now();
  finalizeTypingSignal(state, timestampMs);
  finalizeCursorIdleSignal(state, timestampMs);
}
