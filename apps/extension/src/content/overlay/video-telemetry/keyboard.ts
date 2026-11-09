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

import {
  encodeRecordingEventCadence,
  isSafeRecordingKeyLabel,
} from '../../../features/video/project/recording-events/records';
import type { RecordingKeyCompletion } from '../../../features/video/project/recording-events/types';

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
  if (state.eventSource) {
    flushStreamedRhythm(state);
    return;
  }
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

export function endKeyboardObservation(state: TelemetryState): void {
  flushKeyboardRhythm(state);
  if (state.eventSource) {
    for (const held of state.keyboard.streamed.values()) completeStreamedHold(state, held);
    state.keyboard.streamed.clear();
    state.keyboard.target = null;
    return;
  }
  for (const held of state.keyboard.held.values()) {
    if (!held.action) {
      recordAnonymousHold(state, held);
      continue;
    }
    held.action.data['completion'] = 'lost';
    held.action.data['lastObservedTime'] = held.lastObservedTime;
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
  endKeyboardObservation(state);
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
  if (state.eventSource) {
    observeStreamedDown(state, event, time);
    return;
  }
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
    held.action.data['lastObservedTime'] = held.lastObservedTime;
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
  if (state.eventSource) {
    const identity = event.code || event.key;
    let held = state.keyboard.streamed.get(identity);
    const timeUs = Math.round(time * 1000000);
    if (!held) {
      reportUnknownKeyboardContext(state, timeUs);
      const action = streamedKey(event, timeUs, null);
      if (action) state.eventSource.emit(streamMoment(state, timeUs), { kind: 'action', action });
      held = {
        action,
        downTimeUs: null,
        firstObservedTimeUs: timeUs,
        lastObservedTimeUs: timeUs,
        repeatCount: 0,
        repeats: [],
      };
    }
    completeStreamedHold(state, held, timeUs);
    state.keyboard.streamed.delete(identity);
    return;
  }
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

type StreamedHold = TelemetryState['keyboard']['streamed'] extends Map<string, infer T> ? T : never;
function streamMoment(state: TelemetryState, timeUs: number) {
  return {
    sourceClockId: state.observationClock.id,
    observationTimeSeconds: timeUs / 1000000,
    viewport: {
      width: window.innerWidth,
      height: window.innerHeight,
      devicePixelRatio: window.devicePixelRatio,
      visualViewportScale: window.visualViewport?.scale ?? 1,
      visualViewportOffsetX: window.visualViewport?.offsetLeft ?? 0,
      visualViewportOffsetY: window.visualViewport?.offsetTop ?? 0,
    },
  };
}
function flushStreamedRhythm(state: TelemetryState) {
  const { times, repeats } = state.keyboard;
  if (!state.eventSource || (!times.length && !repeats.length)) return;
  const bounds = [...times, ...repeats].map((value) => Math.round(value * 1000000));
  const id = crypto.randomUUID();
  const startTimeUs = Math.min(...bounds);
  const endTimeUs = Math.max(...bounds);
  const moment = streamMoment(state, endTimeUs);
  state.eventSource.emit(moment, {
    kind: 'signal',
    signal: {
      id,
      kind: 'typing',
      startTimeUs,
      endTimeUs,
      point: null,
      data: {
        eventCount: bounds.length,
        activity: 'keyboard',
        privacy: 'normal',
        groupId: null,
        continuationOf: null,
      },
    },
  });
  for (const [phase, values] of [
    ['onset', times],
    ['repeat', repeats],
  ] as const) {
    if (!values.length) continue;
    state.eventSource.emit(moment, {
      kind: 'keyboard-repeat-block',
      ownerKind: 'signal',
      ownerId: id,
      phase,
      cadence: encodeRecordingEventCadence(
        crypto.randomUUID(),
        values.map((value) => Math.round(value * 1000000))
      ),
    });
  }
  state.keyboard.times = [];
  state.keyboard.repeats = [];
}
function flushStreamedRepeats(state: TelemetryState, held: StreamedHold) {
  if (!held.action || !held.repeats.length) return;
  state.eventSource?.emit(streamMoment(state, held.lastObservedTimeUs), {
    kind: 'keyboard-repeat-block',
    ownerKind: 'action',
    ownerId: held.action.id,
    phase: 'repeat',
    cadence: encodeRecordingEventCadence(crypto.randomUUID(), held.repeats),
  });
  held.repeats = [];
}
function completeStreamedHold(state: TelemetryState, held: StreamedHold, upTimeUs?: number) {
  if (
    !held.action &&
    held.repeatCount < 1 &&
    upTimeUs !== undefined &&
    held.downTimeUs !== null &&
    upTimeUs - held.downTimeUs < 500000
  )
    return;
  const lastObservedTimeUs = upTimeUs ?? held.lastObservedTimeUs;
  const data: RecordingKeyCompletion = {
    upTimeUs: upTimeUs ?? null,
    pressDurationUs:
      upTimeUs !== undefined && held.downTimeUs !== null ? upTimeUs - held.downTimeUs : null,
    lastObservedTimeUs,
    repeatCount: held.repeatCount,
    completion: upTimeUs === undefined ? 'lost' : 'released',
  };
  if (held.action) {
    flushStreamedRepeats(state, held);
    state.eventSource?.emit(streamMoment(state, lastObservedTimeUs), {
      kind: 'action-update',
      actionId: held.action.id,
      revision: 1,
      data,
    });
  } else {
    state.eventSource?.emit(streamMoment(state, lastObservedTimeUs), {
      kind: 'signal',
      signal: {
        id: crypto.randomUUID(),
        kind: 'keyboard-hold',
        startTimeUs: held.firstObservedTimeUs,
        endTimeUs: lastObservedTimeUs,
        point: null,
        data: {
          ...data,
          completion: upTimeUs === undefined ? 'lost' : 'released',
          privacy: 'normal',
          downTimeUs: held.downTimeUs,
        },
      },
    });
  }
}
function observeStreamedDown(state: TelemetryState, event: KeyboardEvent, time: number) {
  const source = state.eventSource;
  if (!source) return;
  const timeUs = Math.round(time * 1000000);
  const identity = event.code || event.key;
  let held = state.keyboard.streamed.get(identity);
  if (event.repeat) {
    if (!held) {
      reportUnknownKeyboardContext(state, timeUs);
      const action = streamedKey(event, timeUs, null);
      if (action) source.emit(streamMoment(state, timeUs), { kind: 'action', action });
      held = {
        action,
        downTimeUs: null,
        firstObservedTimeUs: timeUs,
        lastObservedTimeUs: timeUs,
        repeatCount: 0,
        repeats: [],
      };
      state.keyboard.streamed.set(identity, held);
    }
    held.repeatCount++;
    held.lastObservedTimeUs = timeUs;
    if (held.action) {
      held.repeats.push(timeUs);
      if (held.repeats.length >= 512) flushStreamedRepeats(state, held);
    } else {
      if (state.keyboard.repeats.length >= 512) flushStreamedRhythm(state);
      state.keyboard.repeats.push(time);
    }
    return;
  }
  if (held) completeStreamedHold(state, held);
  const target = describeTelemetryTarget(event).element;
  if (target !== state.keyboard.target) {
    flushStreamedRhythm(state);
    state.keyboard.target = target;
  }
  const action = streamedKey(event, timeUs, timeUs);
  if (action) source.emit(streamMoment(state, timeUs), { kind: 'action', action });
  else {
    if (state.keyboard.times.length >= 512) flushStreamedRhythm(state);
    state.keyboard.times.push(time);
  }
  state.keyboard.streamed.set(identity, {
    action,
    downTimeUs: timeUs,
    firstObservedTimeUs: timeUs,
    lastObservedTimeUs: timeUs,
    repeatCount: 0,
    repeats: [],
  });
}

function streamedKey(
  event: KeyboardEvent,
  timeUs: number,
  downTimeUs: number | null
): StreamedHold['action'] {
  let action: StreamedHold['action'] = null;
  const modifier =
    MODIFIERS.includes(event.key) && !event.isComposing && !event.getModifierState?.('AltGraph');
  if (modifier || shouldRecordKeyboardShortcut(event, true)) {
    const modifiers = [
      event.metaKey && 'Meta',
      event.ctrlKey && 'Ctrl',
      event.altKey && 'Alt',
      event.shiftKey && 'Shift',
    ].filter(Boolean);
    const terminal = modifier
      ? ({ Control: 'Ctrl', Alt: 'Alt', Shift: 'Shift', Meta: 'Meta' }[event.key] ?? 'Unknown')
      : event.key === ' '
        ? 'Space'
        : /^[a-z0-9]$/i.test(event.key)
          ? event.key.toUpperCase()
          : event.key;
    let label = modifier ? terminal : [...modifiers, terminal].join('+');
    if (!isSafeRecordingKeyLabel(label)) label = [...modifiers, 'Unknown'].join('+');
    const id = crypto.randomUUID();
    action = {
      id,
      kind: 'KEY',
      timeUs,
      durationUs: 0,
      point: null,
      label,
      preset: 'NONE',
      data: {
        downTimeUs,
        upTimeUs: null,
        pressDurationUs: null,
        lastObservedTimeUs: timeUs,
        repeatCount: 0,
        completion: 'observed',
        keyboardAttackId: downTimeUs === null ? null : id,
        keyboardOnsetTimeUs: downTimeUs,
        groupId: null,
        continuationOf: null,
        ctrlKey: event.ctrlKey,
        altKey: event.altKey,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
      },
    };
  }
  return action;
}

function reportUnknownKeyboardContext(state: TelemetryState, timeUs: number): void {
  if (state.keyboard.unknownContextReported || !state.eventSource) return;
  state.keyboard.unknownContextReported = true;
  state.eventSource.contextGap(streamMoment(state, timeUs), 'keyboard', 'source-unavailable');
}
