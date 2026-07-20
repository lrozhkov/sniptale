import { describe, expect, it } from 'vitest';

import { parseRecordingTelemetryEntry } from './telemetry.guards.ts';

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

function createViewport() {
  return {
    devicePixelRatio: 2,
    height: 720,
    outerHeight: 860,
    outerWidth: 1300,
    scrollX: 0,
    scrollY: 100,
    viewportOffsetX: 10,
    viewportOffsetY: 30,
    width: 1280,
  } as const;
}

function createTelemetryEntry() {
  return {
    actionEvents: [
      {
        data: { button: 0 },
        duration: 0.4,
        id: 'action-1',
        kind: 'CLICK',
        label: 'Click',
        point: { x: 10, y: 20 },
        preset: 'CLICK_RIPPLE',
        time: 0.2,
      },
    ],
    captureMode: 'TAB',
    createdAt: 1,
    cursorTrack: createCursorTrack(),
    displaySurface: 'browser',
    recordingId: 'recording-1',
    signals: [
      {
        data: { dwellMs: 1200 },
        endTime: 1.2,
        id: 'signal-1',
        kind: 'cursor-idle',
        point: null,
        startTime: 0.2,
      },
    ],
    updatedAt: 2,
    viewport: createViewport(),
  };
}

describe('shared recording telemetry db guards', () => {
  it('parses valid telemetry entries', () => {
    expect(parseRecordingTelemetryEntry(createTelemetryEntry())).toEqual(
      expect.objectContaining({
        actionEvents: expect.any(Array),
        recordingId: 'recording-1',
        signals: expect.any(Array),
      })
    );
  });

  it('rejects malformed telemetry payloads', () => {
    expect(
      parseRecordingTelemetryEntry({
        ...createTelemetryEntry(),
        captureMode: null,
        cursorTrack: {
          ...createCursorTrack(),
          samples: [{ id: 1, time: 0.1, visible: true, x: 10, y: 20 }],
        },
        viewport: null,
      })
    ).toBeNull();
  });

  it('backfills missing segmented telemetry arrays for legacy entries', () => {
    const { signals: _signals, ...legacyEntry } = createTelemetryEntry();

    expect(parseRecordingTelemetryEntry(legacyEntry)).toEqual(
      expect.objectContaining({
        recordingId: 'recording-1',
        signals: [],
      })
    );
  });
});
