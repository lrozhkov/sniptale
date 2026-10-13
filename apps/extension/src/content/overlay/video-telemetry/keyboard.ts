import {
  encodeRecordingKeyboardRhythm,
  RECORDING_KEYBOARD_BLOCK_MAX_COUNT,
} from '../../../features/video/project/keyboard-rhythm';
import { describeTelemetryTarget } from './target';
import {
  recordKeyboardShortcut,
  shouldRecordKeyboardShortcut,
  recordProtectedActivity,
  isProtectedTelemetryTarget,
  finalizeTypingSignal,
} from './signals';
import type { KeyboardHeldState, TelemetryState } from './types';

const MODIFIERS = ['Control', 'Alt', 'Shift', 'Meta'];
function elapsed(state: TelemetryState, timestamp: number) {
  return Math.max(
    0,
    (state.accumulatedDurationMs + timestamp - state.segmentStartedAtTimestamp) / 1000
  );
}

/** Excludes precise timing and identities in recognized credential, OTP and payment controls. */
export function isProtectedKeyboardTarget(event: Event): boolean {
  const target = describeTelemetryTarget(event).element;
  return isProtectedTelemetryTarget(target, event);
}

/** Finalizes anonymous facts without using input payloads or manufacturing missing key edges. */
export function flushKeyboardRhythm(state: TelemetryState): void {
  const { times, repeats } = state.keyboard;
  if (!times.length && !repeats.length) return;
  const bounds = [...times, ...repeats];
  state.signals.push({
    id: crypto.randomUUID(),
    kind: 'typing',
    startTime: Math.min(...bounds),
    endTime: Math.max(...bounds),
    point: null,
    data: {
      activity: 'keyboard',
      eventType: 'keydown',
      observationClockId: state.observationClock.id,
      captureSegment: state.captureSegment,
    },
    ...(times.length
      ? { keyboardRhythm: [encodeRecordingKeyboardRhythm(crypto.randomUUID(), times)] }
      : {}),
    ...(repeats.length
      ? { keyboardRepeats: [encodeRecordingKeyboardRhythm(crypto.randomUUID(), repeats)] }
      : {}),
  });
  state.keyboard.times = [];
  state.keyboard.repeats = [];
}

export function endKeyboardObservation(
  state: TelemetryState,
  preservePublicBoundary = false
): void {
  flushKeyboardRhythm(state);
  for (const held of state.keyboard.held.values()) {
    if (!held.action) {
      recordAnonymousHold(state, held);
      continue;
    }
    held.action.data['completion'] = 'lost';
    held.action.data['lastObservedTime'] = preservePublicBoundary
      ? held.lastObservedTime
      : elapsed(state, performance.now());
    flushHeldKeyboardRepeats(held);
  }
  state.keyboard.held.clear();
  state.keyboard.modifiers = null;
  state.keyboard.target = null;
}

/** Keeps pairing identities disposable; only safe commands or anonymous ticks are retained. */
export function createKeyboardRecorder(state: TelemetryState) {
  return {
    down: (event: KeyboardEvent) => observeKeyboardDown(state, event),
    up: (event: KeyboardEvent) => observeKeyboardUp(state, event),
  };
}

function acceptPublicKeyboardEvent(state: TelemetryState, event: KeyboardEvent): boolean {
  if (!event.isTrusted) return false;
  if (!isProtectedKeyboardTarget(event)) return true;
  endKeyboardObservation(state, true);
  finalizeTypingSignal(state, event.timeStamp);
  recordProtectedActivity(state, event.timeStamp);
  return false;
}

function appendKeyboardTick(state: TelemetryState, repeat: boolean, time: number): void {
  const times = repeat ? state.keyboard.repeats : state.keyboard.times;
  if (times.length >= RECORDING_KEYBOARD_BLOCK_MAX_COUNT) flushKeyboardRhythm(state);
  (repeat ? state.keyboard.repeats : state.keyboard.times).push(time);
}

function flushHeldKeyboardRepeats(held: KeyboardHeldState): void {
  if (!held.action || !held.repeats.length) return;
  held.action.keyboardRepeats ??= [];
  held.action.keyboardRepeats.push(
    encodeRecordingKeyboardRhythm(crypto.randomUUID(), held.repeats)
  );
  held.repeats = [];
}

function observeModifierDown(state: TelemetryState, event: KeyboardEvent, time: number): void {
  const label = [
    event.metaKey && 'Meta',
    event.ctrlKey && 'Ctrl',
    event.altKey && 'Alt',
    event.shiftKey && 'Shift',
  ]
    .filter(Boolean)
    .join('+');
  if (
    label.split('+').length >= 2 &&
    !state.keyboard.modifiers &&
    !event.isComposing &&
    !event.getModifierState?.('AltGraph')
  )
    state.keyboard.modifiers = { label, downTime: time, consumed: false };
}

function observeKeyboardRepeat(
  state: TelemetryState,
  held: KeyboardHeldState | undefined,
  time: number
): void {
  if (!held) return;
  held.repeatCount += 1;
  held.lastObservedTime = time;
  if (!held.action) {
    appendKeyboardTick(state, true, time);
    return;
  }
  held.action.data['repeatCount'] = Number(held.action.data['repeatCount'] ?? 0) + 1;
  held.repeats.push(time);
  if (held.repeats.length >= RECORDING_KEYBOARD_BLOCK_MAX_COUNT) flushHeldKeyboardRepeats(held);
}

function observeKeyboardDown(state: TelemetryState, event: KeyboardEvent): void {
  if (!acceptPublicKeyboardEvent(state, event)) return;
  const time = elapsed(state, event.timeStamp);
  if (
    (event.isComposing || event.getModifierState?.('AltGraph') || event.key === 'AltGraph') &&
    state.keyboard.modifiers
  )
    state.keyboard.modifiers.consumed = true;
  const target = describeTelemetryTarget(event).element;
  if (target !== state.keyboard.target) {
    flushKeyboardRhythm(state);
    state.keyboard.target = target;
  }
  if (MODIFIERS.includes(event.key)) {
    observeModifierDown(state, event, time);
    return;
  }
  if (state.keyboard.modifiers) state.keyboard.modifiers.consumed = true;
  const identity = event.code || event.key;
  const held = state.keyboard.held.get(identity);
  if (event.repeat) {
    observeKeyboardRepeat(state, held, time);
    return;
  }
  if (held && !held.action) recordAnonymousHold(state, held);
  if (held?.action) {
    held.action.data['lastObservedTime'] = time;
    flushHeldKeyboardRepeats(held);
  }
  // Every non-repeat delivered down is an observed onset, including a missing previous up.
  const previousCount = state.actionEvents.length;
  if (shouldRecordKeyboardShortcut(event)) recordKeyboardShortcut(state, event);
  const action = state.actionEvents.length > previousCount ? state.actionEvents.at(-1)! : null;
  if (action)
    Object.assign(action.data, {
      keyboardOnsetTime: time,
      keyboardAttackId: action.id,
      downTime: time,
      completion: 'lost',
      repeatCount: 0,
      observationClockId: state.observationClock.id,
      captureSegment: state.captureSegment,
    });
  else appendKeyboardTick(state, false, time);
  state.keyboard.held.set(identity, {
    action,
    onset: time,
    repeats: [],
    repeatCount: 0,
    lastObservedTime: time,
  });
}

function observeModifierUp(state: TelemetryState, time: number): void {
  const chord = state.keyboard.modifiers;
  if (chord && !chord.consumed) {
    const id = crypto.randomUUID();
    state.actionEvents.push({
      id,
      kind: 'KEY',
      time: chord.downTime,
      duration: 0.55,
      point: null,
      label: chord.label,
      data: {
        combo: chord.label,
        modifierOnly: true,
        downTime: chord.downTime,
        upTime: time,
        pressDuration: time - chord.downTime,
        completion: 'released',
        keyboardOnsetTime: chord.downTime,
        keyboardAttackId: id,
        observationClockId: state.observationClock.id,
        captureSegment: state.captureSegment,
      },
      preset: 'SPOTLIGHT',
    });
  }
  state.keyboard.modifiers = null;
}

function observeKeyboardUp(state: TelemetryState, event: KeyboardEvent): void {
  if (!acceptPublicKeyboardEvent(state, event)) return;
  const time = elapsed(state, event.timeStamp);
  if (MODIFIERS.includes(event.key)) {
    observeModifierUp(state, time);
    return;
  }
  const identity = event.code || event.key;
  const held = state.keyboard.held.get(identity);
  if (held?.action) {
    Object.assign(held.action.data, {
      upTime: time,
      pressDuration: Math.max(0, time - held.onset),
      completion: 'released',
    });
    flushHeldKeyboardRepeats(held);
  }
  if (held && !held.action) recordAnonymousHold(state, held, time);
  state.keyboard.held.delete(identity);
}

/** Metadata for an anonymous repeat hold; its audio attacks already live in cadence blocks. */
function recordAnonymousHold(
  state: TelemetryState,
  held: KeyboardHeldState,
  upTime?: number
): void {
  if (held.repeatCount < 1 && (upTime === undefined || upTime - held.onset < 0.5)) return;
  state.signals.push({
    id: crypto.randomUUID(),
    kind: 'typing',
    startTime: held.onset,
    endTime: upTime ?? held.lastObservedTime,
    point: null,
    data: {
      activity: 'keyboard',
      eventType: 'held-key',
      keyboardHold: true,
      downTime: held.onset,
      repeatCount: held.repeatCount,
      completion: upTime === undefined ? 'lost' : 'released',
      observationClockId: state.observationClock.id,
      captureSegment: state.captureSegment,
      ...(upTime === undefined
        ? { lastObservedTime: held.lastObservedTime }
        : { upTime, pressDuration: Math.max(0, upTime - held.onset) }),
    },
  });
}
