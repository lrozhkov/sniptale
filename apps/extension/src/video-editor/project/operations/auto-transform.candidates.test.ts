import { expect, it } from 'vitest';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { buildAutoTransformCandidates } from './auto-transform.candidates';
import { createVideoProjectCursorTrack } from '../../../features/video/project/defaults';
const settings = {
  ...DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS.stableSegments,
  shoulderSeconds: 0.2,
  minDurationSeconds: 1,
  speedUpPlaybackRate: 4,
};
const telemetry: RecordingTelemetryEntry = {
  recordingId: 'r',
  createdAt: 0,
  updatedAt: 0,
  captureMode: 'TAB',
  viewport: null,
  cursorTrack: null,
  actionEvents: [],
  signals: [
    { id: 'idle', kind: 'cursor-idle', startTime: 0, endTime: 10, point: null, data: {} },
    { id: 'typing', kind: 'typing', startTime: 2, endTime: 5, point: null, data: {} },
  ],
};
it('finds typing and stationary pauses in one pass without requiring static frames', () => {
  const rows = buildAutoTransformCandidates(telemetry, settings, {
    typingRate: 2,
    audio: { status: 'absent' },
  });
  expect(rows.map((row) => [row.category, row.startTime, row.endTime])).toEqual([
    ['idle', 0.2, 1.8],
    ['typing', 2, 5],
    ['idle', 5.2, 9.8],
  ]);
});
it('requires decoded silence when audio exists and never treats unknown audio as silence', () => {
  const options = {
    typingRate: 2,
    audio: { status: 'analyzed' as const, ranges: [{ startTime: 6, endTime: 9 }] },
  };
  expect(
    buildAutoTransformCandidates(telemetry, settings, options).filter(
      (row) => row.category === 'idle'
    )
  ).toMatchObject([{ startTime: 6.2, endTime: 8.8 }]);
  expect(
    buildAutoTransformCandidates(telemetry, settings, {
      typingRate: 2,
      audio: { status: 'unavailable' },
    })
  ).toEqual([]);
});
it('does not merge pauses across a click or remove typing when typing acceleration is off', () => {
  const entry: RecordingTelemetryEntry = {
    ...telemetry,
    actionEvents: [
      {
        id: 'click',
        kind: 'CLICK',
        time: 6,
        duration: 0,
        point: null,
        label: 'Click',
        data: {},
        preset: 'NONE',
      },
    ],
  };
  const rows = buildAutoTransformCandidates(
    entry,
    { ...settings, action: 'remove', mergeGapSeconds: 5 },
    { typingRate: 1, audio: { status: 'absent' } }
  );
  expect(rows.every((row) => row.endTime <= 2 || row.startTime >= 5)).toBe(true);
  expect(rows.every((row) => row.endTime < 6 || row.startTime > 6)).toBe(true);
});

it('gives legacy static ranges no influence over candidate admission or boundaries', () => {
  const staticSignal = {
    id: 'legacy-static',
    kind: 'static-frame' as const,
    startTime: 1,
    endTime: 8,
    point: null,
    data: { code: 'old-analysis' },
  };
  expect(
    buildAutoTransformCandidates(
      { ...telemetry, signals: [...telemetry.signals, staticSignal] },
      settings
    )
  ).toEqual(buildAutoTransformCandidates(telemetry, settings));
  expect(buildAutoTransformCandidates({ ...telemetry, signals: [staticSignal] }, settings)).toEqual(
    []
  );
});

it('retains short and protected input as pause exclusions without accelerating either', () => {
  const signals = [
    { id: 'idle', kind: 'cursor-idle' as const, startTime: 0, endTime: 10, point: null, data: {} },
    { id: 'short', kind: 'typing' as const, startTime: 2, endTime: 2.1, point: null, data: {} },
    {
      id: 'private',
      kind: 'typing' as const,
      startTime: 4,
      endTime: 8,
      point: null,
      data: { privacy: 'protected' },
    },
  ];
  const candidates = buildAutoTransformCandidates({ ...telemetry, signals }, settings);
  expect(candidates.map((candidate) => candidate.category)).not.toContain('typing');
  expect(
    candidates.every(
      (candidate) =>
        candidate.endTime < 2 ||
        (candidate.startTime > 2.1 && candidate.endTime < 4) ||
        candidate.startTime > 8
    )
  ).toBe(true);
});

it('protects a held button until the observed release, independently of visual feedback duration', () => {
  const event = {
    id: 'drag',
    kind: 'CLICK' as const,
    time: 2,
    duration: 0.2,
    point: null,
    label: 'Drag',
    data: { downTime: 2, upTime: 6, gestureType: 'drag' },
    preset: 'NONE' as const,
  };
  const candidates = buildAutoTransformCandidates(
    { ...telemetry, signals: [telemetry.signals[0]!], actionEvents: [event] },
    settings
  );
  expect(candidates.map(({ startTime, endTime }) => [startTime, endTime])).toEqual([
    [0.2, 1.8],
    [6.2, 9.8],
  ]);
});

it('excludes outside and capture-segment gaps even when a legacy idle signal spans them', () => {
  const cursorTrack = createVideoProjectCursorTrack('embedded-fallback');
  cursorTrack.samples = [
    {
      id: 'start',
      time: 0,
      x: 10,
      y: 10,
      visible: true,
      observation: 'observed',
      captureSegment: 0,
    },
    {
      id: 'outside',
      time: 2,
      x: 10,
      y: 10,
      visible: false,
      observation: 'outside',
      captureSegment: 0,
    },
    {
      id: 'returned',
      time: 5,
      x: 10,
      y: 10,
      visible: true,
      observation: 'observed',
      captureSegment: 1,
    },
    {
      id: 'end',
      time: 10,
      x: 10,
      y: 10,
      visible: true,
      observation: 'observed',
      captureSegment: 1,
    },
  ];
  const rows = buildAutoTransformCandidates(
    { ...telemetry, signals: [telemetry.signals[0]!], cursorTrack },
    settings
  );
  expect(rows.every((row) => row.endTime <= 2 || row.startTime >= 5)).toBe(true);
});
