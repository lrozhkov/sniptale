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
