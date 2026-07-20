// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VideoProjectActionEventKind } from '../../../features/video/project/types';
import {
  finalizeTelemetrySignals,
  recordKeyboardShortcut,
  recordTypingActivity,
  tickCursorIdleTelemetry,
  updatePointerIdleAnchor,
} from './signals';
import { createInitialState } from './state';

function createSignalState() {
  const state = createInitialState();
  state.isEnabled = true;
  state.segmentStartedAtTimestamp = 0;
  return state;
}

function createTypingEvent(type: 'change' | 'input', timeStamp: number): Event {
  return { timeStamp, type } as Event;
}

function createShortcutEvent(
  key: string,
  timeStamp: number,
  modifiers: Partial<KeyboardEvent> = {}
): KeyboardEvent {
  return {
    altKey: false,
    ctrlKey: false,
    key,
    metaKey: false,
    repeat: false,
    shiftKey: false,
    timeStamp,
    ...modifiers,
  } as KeyboardEvent;
}

function createPointerEvent(clientX: number, clientY: number, timeStamp: number): PointerEvent {
  return { clientX, clientY, timeStamp } as PointerEvent;
}

beforeEach(() => {
  let counter = 0;
  vi.stubGlobal('crypto', { randomUUID: vi.fn(() => `id-${++counter}`) });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function registerTypingSignalTests() {
  it('merges typing bursts across short gaps and starts a new signal after a longer gap', () => {
    const state = createSignalState();
    state.lastKnownPointerPosition = { x: 320, y: 180 };

    recordTypingActivity(state, createTypingEvent('input', 1_000));
    recordTypingActivity(state, createTypingEvent('change', 1_600));
    recordTypingActivity(state, createTypingEvent('input', 2_801));

    expect(state.signals).toEqual([
      expect.objectContaining({
        data: { eventCount: 2, eventType: 'input' },
        endTime: 2.801,
        kind: 'typing',
        point: { x: 320, y: 180 },
        startTime: 1,
      }),
    ]);
    expect(state.typingSignal).toEqual(
      expect.objectContaining({
        data: expect.objectContaining({ eventCount: 1, eventType: 'input' }),
        kind: 'typing',
        point: { x: 320, y: 180 },
        startTime: 2.801,
      })
    );
  });

  it('flushes the active typing signal on finalization', () => {
    const state = createSignalState();

    recordTypingActivity(state, createTypingEvent('input', 900));
    vi.spyOn(performance, 'now').mockReturnValue(1_400);
    finalizeTelemetrySignals(state);

    expect(state.typingSignal).toBeNull();
    expect(state.signals).toEqual([
      expect.objectContaining({
        data: { eventCount: 1, eventType: 'input' },
        endTime: 1.4,
        kind: 'typing',
        startTime: 0.9,
      }),
    ]);
  });
}

function registerCursorIdleSignalTests() {
  it('creates and finalizes cursor-idle signals only after the dwell threshold', () => {
    const state = createSignalState();

    updatePointerIdleAnchor(state, createPointerEvent(100, 100, 100), { reset: true });
    updatePointerIdleAnchor(state, createPointerEvent(108, 105, 500));

    vi.spyOn(performance, 'now').mockReturnValue(1_100);
    tickCursorIdleTelemetry(state);
    expect(state.cursorIdleSignal).toBeNull();

    vi.spyOn(performance, 'now').mockReturnValue(1_350);
    tickCursorIdleTelemetry(state);
    expect(state.cursorIdleSignal).toEqual(
      expect.objectContaining({
        data: { dwellMs: 1_250 },
        kind: 'cursor-idle',
        point: { x: 100, y: 100 },
        startTime: 0.1,
      })
    );

    updatePointerIdleAnchor(state, createPointerEvent(140, 140, 1_410));

    expect(state.cursorIdleSignal).toBeNull();
    expect(state.signals).toEqual([
      expect.objectContaining({
        data: { dwellMs: 1_250 },
        endTime: 1.41,
        kind: 'cursor-idle',
        point: { x: 100, y: 100 },
        startTime: 0.1,
      }),
    ]);
    expect(state.pointerStationaryPosition).toEqual({ x: 140, y: 140 });
    expect(state.pointerStationaryStartedAtMs).toBe(1_410);
  });
}

function registerKeyboardSignalTests() {
  it('records only shortcut-style keyboard actions into the actions lane', () => {
    const state = createSignalState();
    state.lastKnownPointerPosition = { x: 64, y: 48 };

    recordKeyboardShortcut(state, createShortcutEvent('k', 250, { ctrlKey: true }));
    recordKeyboardShortcut(state, createShortcutEvent('a', 400));
    recordKeyboardShortcut(state, createShortcutEvent('Tab', 550));

    expect(state.actionEvents).toEqual([
      expect.objectContaining({
        data: { combo: 'Ctrl+K', key: 'k' },
        kind: VideoProjectActionEventKind.KEY,
        label: 'Ctrl+K',
        point: { x: 64, y: 48 },
        time: 0.25,
      }),
      expect.objectContaining({
        data: { combo: 'Tab', key: 'Tab' },
        kind: VideoProjectActionEventKind.KEY,
        label: 'Tab',
        point: { x: 64, y: 48 },
        time: 0.55,
      }),
    ]);
  });
}

function registerSignalTests() {
  registerTypingSignalTests();
  registerCursorIdleSignalTests();
  registerKeyboardSignalTests();
}

describe('content video telemetry signals', () => {
  registerSignalTests();
});
