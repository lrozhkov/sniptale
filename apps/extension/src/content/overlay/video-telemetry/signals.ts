import {
  normalizeRecordingSignals,
  RECORDING_TYPING_GAP_SECONDS,
} from '../../../features/video/project/recording-actions';
import { describeTelemetryTarget, hasOpaqueTelemetryTarget } from './target';
import {
  RecordingTelemetrySignalKind,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
} from '../../../features/video/project/types';
import { normalizeHotkeyKey } from '../../../features/keyboard-shortcuts/hotkeys';
import type { CursorIdleTelemetrySignal, TelemetryState, TypingTelemetrySignal } from './types';

const CURSOR_IDLE_DWELL_MS = 1200;
const CURSOR_IDLE_TOLERANCE_PX = 12;
const TYPING_MERGE_GAP_MS = RECORDING_TYPING_GAP_SECONDS * 1000;

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
          captureSegment: signal.data.captureSegment,
          eventCount: signal.data.eventCount,
          eventType: signal.data.eventType,
          ...signal.data.targetDescription,
        }
      : {
          dwellMs: signal.data.dwellMs,
        };

  state.signals.push({
    ...signal,
    point: signal.point === null ? null : { ...signal.point },
    data,
    endTime:
      signal.kind === 'typing'
        ? signal.endTime
        : Math.max(signal.startTime, getElapsedSeconds(state, timestampMs)),
  });
}

/** Ends one raw input burst before cross-field grouping. */
export function finalizeTypingSignal(state: TelemetryState, timestampMs: number): void {
  state.typingTarget = null;
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

export function shouldRecordKeyboardShortcut(event: KeyboardEvent): boolean {
  if (
    event.repeat ||
    event.isComposing ||
    event.getModifierState?.('AltGraph') ||
    ['Control', 'Meta', 'Alt', 'AltGraph', 'Shift', 'Dead', 'Process', 'Unidentified', ''].includes(
      event.key
    )
  )
    return false;
  const target = describeTelemetryTarget(event).element;
  if (isProtectedTelemetryTarget(target, event)) return false;
  const editable = target?.closest(
    'input,textarea,[contenteditable]:not([contenteditable="false"]),[role="textbox"],[role="combobox"]'
  );
  return (
    event.metaKey ||
    event.ctrlKey ||
    event.altKey ||
    [
      'Tab',
      'Escape',
      'Enter',
      'ArrowUp',
      'ArrowDown',
      'ArrowLeft',
      'ArrowRight',
      'Home',
      'End',
      'PageUp',
      'PageDown',
      'Insert',
      'Delete',
      'Backspace',
    ].includes(event.key) ||
    /^F(?:[1-9]|1[0-9]|2[0-4])$/.test(event.key) ||
    (event.key === ' ' && !editable)
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
  // A blur-time change commits an existing value; it is not a new input sample.
  if (event.type !== 'input') return;
  const timestampMs = event.timeStamp || performance.now();
  const elapsedSeconds = getElapsedSeconds(state, timestampMs);
  const lastEventTimeMs = state.typingSignal?.data.lastEventTimeMs ?? null;
  const target = describeTelemetryTarget(event);
  const element = target.element;
  if (isProtectedTelemetryTarget(element, event)) {
    finalizeTypingSignal(state, timestampMs);
    recordProtectedActivity(state, timestampMs);
    return;
  }
  const inputTarget =
    element?.closest('input,textarea,[contenteditable]:not([contenteditable="false"])') ?? element;
  if (element) {
    const textInput =
      element instanceof HTMLInputElement &&
      ['text', 'search', 'email', 'url', 'tel', 'password', 'number'].includes(element.type);
    if (
      !textInput &&
      !(element instanceof HTMLTextAreaElement) &&
      !element.closest('[contenteditable]:not([contenteditable="false"])')
    )
      return;
  }

  if (
    state.typingSignal !== null &&
    state.typingTarget === inputTarget &&
    lastEventTimeMs !== null &&
    timestampMs - lastEventTimeMs < TYPING_MERGE_GAP_MS
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
  state.typingTarget = inputTarget;
  state.typingSignal = {
    id: crypto.randomUUID(),
    kind: RecordingTelemetrySignalKind.TYPING,
    startTime: elapsedSeconds,
    endTime: elapsedSeconds,
    point: resolveSignalPoint(state),
    data: {
      captureSegment: state.captureSegment,
      eventCount: 1,
      eventType: event.type,
      targetDescription: target.data,
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
    !state.observationAvailable ||
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
  state.signals = normalizeRecordingSignals(state.signals);
  state.captureSegment += 1;
}

/** Conservative whole-second activity coverage excludes private controls from idle automation. */
export function recordProtectedActivity(state: TelemetryState, timestampMs: number): void {
  const startTime = Math.floor(getElapsedSeconds(state, timestampMs));
  const previous = state.signals.at(-1);
  if (
    previous?.data['privacy'] === 'protected' &&
    previous.data['captureSegment'] === state.captureSegment &&
    startTime <= previous.endTime
  ) {
    previous.endTime = Math.max(previous.endTime, startTime + 1);
    return;
  }
  state.signals.push({
    id: crypto.randomUUID(),
    kind: 'typing',
    startTime,
    endTime: startTime + 1,
    point: null,
    data: { privacy: 'protected', activity: 'input', captureSegment: state.captureSegment },
  });
}

/** One field-privacy predicate for key identities, cadence and input activity. */
export function isProtectedTelemetryTarget(element: Element | null, event?: Event): boolean {
  const path =
    event && typeof event.composedPath === 'function'
      ? event.composedPath().filter((node): node is Element => node instanceof Element)
      : [];
  if (element) path.push(element);
  for (const node of path) {
    // Explicit privacy applies through ancestry and visible composed hosts, independently
    // of which native input is nearest to the delivered event.
    if (node.closest('[data-sniptale-private]')) return true;
    const field = node.closest('input,textarea,[autocomplete]');
    if (!field) continue;
    if (field instanceof HTMLInputElement && field.type === 'password') return true;
    if (
      (field.getAttribute('autocomplete') ?? '')
        .toLowerCase()
        .split(/\s+/)
        .some(
          (token) =>
            ['one-time-code', 'current-password', 'new-password'].includes(token) ||
            token.startsWith('cc-')
        )
    )
      return true;
  }
  return hasOpaqueTelemetryTarget(event, element);
}
