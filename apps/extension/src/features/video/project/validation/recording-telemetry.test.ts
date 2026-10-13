import { describe, expect, it } from 'vitest';
import type { RecordingActionEvent } from '../types';

import {
  isRecordingTelemetrySignal,
  isRecordingTelemetrySnapshot,
  isRecordingActionEvent,
  isVideoProjectCursorTrack,
  isViewportInfo,
} from './recording-telemetry';

function createCursorTrack() {
  return {
    captureMode: 'separate',
    samples: [{ id: 'sample-1', time: 0.1, visible: true, x: 10, y: 20 }],
    skin: {
      animationPreset: 'NONE',
      color: '#fff',
      hidden: false,
      preset: 'ARROW',
      scale: 1,
      shadow: true,
    },
  } as const;
}

function createActionEvent(): RecordingActionEvent {
  return {
    data: { button: 0 },
    duration: 0.4,
    id: 'action-1',
    kind: 'CLICK',
    label: 'Click',
    point: { x: 10, y: 20 },
    preset: 'CLICK_RIPPLE',
    time: 0.2,
  } as const;
}

function createSignal() {
  return {
    data: { dwellMs: 1200 },
    endTime: 1.2,
    id: 'signal-1',
    kind: 'cursor-idle',
    point: null,
    startTime: 0.2,
  } as const;
}

describe('recording telemetry validation', () => {
  it('validates shared telemetry sidecar shapes', () => {
    expect(
      isViewportInfo({
        devicePixelRatio: 2,
        height: 720,
        scrollX: 0,
        scrollY: 100,
        width: 1280,
      })
    ).toBe(true);
    expect(isVideoProjectCursorTrack(createCursorTrack())).toBe(true);
    expect(isRecordingActionEvent(createActionEvent())).toBe(true);
    expect(isRecordingTelemetrySignal(createSignal())).toBe(true);
  });

  it('validates snapshots for messaging and db consumers', () => {
    expect(
      isRecordingTelemetrySnapshot({
        actionEvents: [createActionEvent()],
        cursorTrack: createCursorTrack(),
        signals: [createSignal()],
        viewport: null,
      })
    ).toBe(true);
  });

  it('rejects malformed nested telemetry payloads', () => {
    expect(
      isRecordingTelemetrySnapshot({
        actionEvents: [{ ...createActionEvent(), point: { x: '10', y: 20 } }],
        cursorTrack: { ...createCursorTrack(), samples: [] },
        signals: [createSignal()],
        viewport: null,
      })
    ).toBe(false);
  });
});

it('requires raw time/duration/preset rather than an authored montage anchor', () => {
  const raw = createActionEvent();
  const { time, duration, preset, ...common } = raw;
  expect(isRecordingActionEvent({ ...common, anchor: { kind: 'project', time } })).toBe(false);
  expect(isRecordingActionEvent({ ...raw, time: undefined })).toBe(false);
  expect(isRecordingActionEvent({ ...raw, duration: undefined })).toBe(false);
  expect(isRecordingActionEvent({ ...raw, preset: undefined })).toBe(false);
  expect(isRecordingActionEvent({ ...common, time, duration, preset })).toBe(true);
});

it('accepts normalized recording points without changing raw client coordinates', () => {
  for (const recordingPoint of [null, { x: 0, y: 1 }, { x: 0.25, y: 0.75 }]) {
    const event = { ...createActionEvent(), recordingPoint };
    expect(isRecordingActionEvent(event)).toBe(true);
    expect(event.point).toEqual({ x: 10, y: 20 });
  }
});

it.each([
  { x: NaN, y: 0.5 },
  { x: 0.5, y: Infinity },
  { x: -0.01, y: 0.5 },
  { x: 0.5, y: 1.01 },
  { x: '0.5', y: 0.5 },
  { x: 0.5 },
])('rejects malformed supplied recordingPoint %j', (recordingPoint) => {
  expect(isRecordingActionEvent({ ...createActionEvent(), recordingPoint })).toBe(false);
});

it('admits bounded anonymous cadence and rejects future blocks and oversized decoded runs', () => {
  const block = {
    version: 1,
    id: 'rhythm',
    startTime: 1,
    quantumMs: 1,
    count: 3,
    encoding: 'rle',
    ticks: [0, 1, 100, 2],
  };
  const signal = {
    id: 'typing',
    kind: 'typing',
    startTime: 1,
    endTime: 1.2,
    point: null,
    data: {},
    keyboardRhythm: [block],
  };
  expect(isRecordingTelemetrySignal(signal)).toBe(true);
  for (const patch of [
    { version: 2 },
    { count: 4097 },
    { ticks: [0, 1, 100, 1000000] },
    { ticks: [0, 1, -1, 2] },
    { key: 'secret' },
  ]) {
    expect(
      isRecordingTelemetrySignal({ ...signal, keyboardRhythm: [{ ...block, ...patch }] })
    ).toBe(false);
  }
  expect(isRecordingActionEvent({ ...createActionEvent(), keyboardRepeats: [block] })).toBe(true);
  expect(
    isRecordingActionEvent({ ...createActionEvent(), keyboardRepeats: [{ ...block, count: 9000 }] })
  ).toBe(false);
});

it('rejects cadence outside its owning activity and malformed observed gesture facts', () => {
  const block = {
    version: 1,
    id: 'rhythm',
    startTime: 1,
    quantumMs: 1,
    count: 2,
    encoding: 'delta',
    ticks: [0, 100],
  };
  const signal = {
    id: 'input',
    kind: 'typing',
    startTime: 1,
    endTime: 1.1,
    point: null,
    data: {},
    keyboardRhythm: [block],
  };
  expect(isRecordingTelemetrySignal(signal)).toBe(true);
  expect(isRecordingTelemetrySignal({ ...signal, endTime: 1.05 })).toBe(false);
  expect(isRecordingTelemetrySignal({ ...signal, startTime: 1.02 })).toBe(false);
  expect(isRecordingTelemetrySignal({ ...signal, data: { privacy: 'protected' } })).toBe(false);
  const event = {
    ...createActionEvent(),
    time: 1,
    data: {
      gestureId: 'gesture',
      gestureType: 'click',
      button: 0,
      downTime: 1,
      upTime: 1.1,
      pressDuration: 0.1,
      completion: 'released',
      downX: 0,
      downY: 0,
      upX: 1,
      upY: 1,
      maxExcursionCssPx: 2,
    },
  };
  expect(isRecordingActionEvent(event)).toBe(true);
  for (const patch of [
    { button: -1 },
    { button: 2.5 },
    { downTime: Infinity },
    { upTime: 0.9 },
    { pressDuration: 10 },
    { completion: 'maybe' },
    { upX: NaN },
    { gestureType: 'region' },
    { maxExcursionCssPx: -1 },
  ])
    expect(isRecordingActionEvent({ ...event, data: { ...event.data, ...patch } })).toBe(false);
});

it('rejects repeated cadence identities within one signal and across its onset/repeat arrays', () => {
  const block = {
    version: 1,
    id: 'same',
    startTime: 1,
    quantumMs: 1,
    count: 1,
    encoding: 'delta',
    ticks: [0],
  };
  const later = { ...block, startTime: 1.01 };
  const signal = {
    id: 'keyboard',
    kind: 'typing',
    startTime: 1,
    endTime: 1.02,
    point: null,
    data: {},
  };
  expect(isRecordingTelemetrySignal({ ...signal, keyboardRhythm: [block, later] })).toBe(false);
  expect(
    isRecordingTelemetrySignal({ ...signal, keyboardRhythm: [block], keyboardRepeats: [later] })
  ).toBe(false);
  expect(
    isRecordingTelemetrySignal({
      ...signal,
      keyboardRhythm: [block],
      keyboardRepeats: [{ ...later, id: 'repeat' }],
    })
  ).toBe(true);
  expect(isRecordingActionEvent({ ...createActionEvent(), keyboardRepeats: [block, later] })).toBe(
    false
  );
  expect(
    isRecordingTelemetrySnapshot({
      viewport: null,
      cursorTrack: null,
      actionEvents: [],
      signals: [
        { ...signal, id: 'first', keyboardRhythm: [block] },
        { ...signal, id: 'second', keyboardRhythm: [later] },
      ],
    })
  ).toBe(true);
});

it('rejects a signal whose repeat block reuses a physical onset block identity', () => {
  const block = {
    version: 1,
    id: 'same',
    startTime: 1,
    quantumMs: 1,
    count: 1,
    encoding: 'delta',
    ticks: [0],
  };
  expect(
    isRecordingTelemetrySignal({
      id: 'keyboard',
      kind: 'typing',
      startTime: 1,
      endTime: 1.02,
      point: null,
      data: {},
      keyboardRhythm: [block],
      keyboardRepeats: [{ ...block, startTime: 1.01 }],
    })
  ).toBe(false);
});

it.each([
  {
    keyboardHold: true,
    repeatCount: 5,
    downTime: 1.234,
    lastObservedTime: 1.7,
    keyboardOnsetTime: 1.234,
    keyboardAttackId: 'attack',
  },
  { inputCount: 5 },
  { repeatCount: 5 },
  { downTime: 1.234 },
  { keyboardOnsetTime: 1.234, keyboardAttackId: 'attack' },
  { targetName: 'private value' },
])('refuses precise or identifying metadata in explicit protected activity', (metadata) => {
  expect(
    isRecordingTelemetrySignal({
      id: 'protected',
      kind: 'typing',
      startTime: 1,
      endTime: 2,
      point: null,
      data: { privacy: 'protected', activity: 'input', captureSegment: 0, ...metadata },
    })
  ).toBe(false);
});

it('admits coarse protected coverage clipped at a public recording boundary and refuses spatial/rhythm facts', () => {
  const protectedSignal = {
    id: 'protected',
    kind: 'typing',
    startTime: 1,
    endTime: 1.7,
    point: null,
    data: { privacy: 'protected', activity: 'input', captureSegment: 0 },
  };
  expect(isRecordingTelemetrySignal(protectedSignal)).toBe(true);
  expect(isRecordingTelemetrySignal({ ...protectedSignal, endTime: 1 })).toBe(true);
  expect(isRecordingTelemetrySignal({ ...protectedSignal, recordingPoint: null })).toBe(true);
  expect(isRecordingTelemetrySignal({ ...protectedSignal, point: { x: 0.2, y: 0.3 } })).toBe(false);
  expect(
    isRecordingTelemetrySignal({ ...protectedSignal, recordingPoint: { x: 0.2, y: 0.3 } })
  ).toBe(false);
  expect(isRecordingTelemetrySignal({ ...protectedSignal, keyboardRhythm: [] })).toBe(false);
  expect(isRecordingTelemetrySignal({ ...protectedSignal, keyboardRepeats: [] })).toBe(false);
});

it('refuses a precise protected start while preserving a fractional public boundary end', () => {
  const signal = {
    id: 'protected',
    kind: 'typing',
    startTime: 1,
    endTime: 1.534,
    point: null,
    data: { privacy: 'protected', activity: 'input', captureSegment: 0 },
  };
  expect(isRecordingTelemetrySignal(signal)).toBe(true);
  expect(isRecordingTelemetrySignal({ ...signal, startTime: 1.234 })).toBe(false);
});

it('preserves merged protected whole-second coverage and its clipped public boundary', () => {
  const signal = {
    id: 'protected',
    kind: 'typing',
    startTime: 1,
    endTime: 4,
    point: null,
    data: { privacy: 'protected', activity: 'input', captureSegment: 0 },
  };
  expect(isRecordingTelemetrySignal(signal)).toBe(true);
  expect(isRecordingTelemetrySignal({ ...signal, endTime: 3.7 })).toBe(true);
  expect(isRecordingTelemetrySignal({ ...signal, endTime: 1 })).toBe(true);
});
