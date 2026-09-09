import { expect, it } from 'vitest';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { buildAutoTransformCandidates } from './auto-transform.candidates';
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
    { id: 'typing', kind: 'typing', startTime: 2, endTime: 4, point: null, data: {} },
  ],
};
it('finds typing and stationary pauses in one pass without requiring static frames', () => {
  const rows = buildAutoTransformCandidates(telemetry, settings, {
    typingRate: 2,
    audio: { status: 'absent' },
  });
  expect(rows.map((row) => [row.category, row.startTime, row.endTime])).toEqual([
    ['idle', 0.2, 1.8],
    ['typing', 2, 4],
    ['idle', 4.2, 9.8],
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
  expect(rows.every((row) => row.endTime <= 2 || row.startTime >= 4)).toBe(true);
  expect(rows.every((row) => row.endTime < 6 || row.startTime > 6)).toBe(true);
});
