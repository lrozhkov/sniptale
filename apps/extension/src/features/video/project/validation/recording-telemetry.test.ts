import { describe, expect, it } from 'vitest';

import {
  isRecordingTelemetrySignal,
  isRecordingTelemetrySnapshot,
  isVideoProjectActionEvent,
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

function createActionEvent() {
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
    expect(isVideoProjectActionEvent(createActionEvent())).toBe(true);
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
