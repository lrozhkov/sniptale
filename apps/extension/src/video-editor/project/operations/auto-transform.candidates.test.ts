import { describe, expect, it } from 'vitest';
import type { RecordingTelemetryEntry } from '../../../composition/persistence/recordings/contracts';
import { DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS } from '@sniptale/runtime-contracts/video/types/defaults';
import { VideoAutoProcessingAction } from '@sniptale/runtime-contracts/video/types/types';
import { RecordingTelemetrySignalKind } from '../../../features/video/project/types/interaction';
import { buildAutoTransformCandidates } from './auto-transform.candidates';

function createTelemetryEntry(
  signals: RecordingTelemetryEntry['signals']
): RecordingTelemetryEntry {
  return {
    actionEvents: [],
    captureMode: 'TAB',
    createdAt: 1,
    cursorTrack: null,
    displaySurface: null,
    recordingId: 'recording-1',
    signals,
    updatedAt: 2,
    viewport: null,
  };
}

const stableSettings = DEFAULT_VIDEO_AUTO_PROCESSING_SETTINGS.stableSegments;

function verifyStableOverlapCandidates() {
  const candidates = buildAutoTransformCandidates(
    createTelemetryEntry([
      {
        data: { dwellMs: 6_000 },
        endTime: 6.2,
        id: 'idle-1',
        kind: RecordingTelemetrySignalKind.CURSOR_IDLE,
        point: { x: 100, y: 200 },
        startTime: 0.4,
      },
      {
        data: { maxDiff: 0.2 },
        endTime: 6.4,
        id: 'static-1',
        kind: RecordingTelemetrySignalKind.STATIC_FRAME,
        point: null,
        startTime: 0.1,
      },
    ]),
    stableSettings
  );

  expect(candidates).toEqual([
    {
      action: VideoAutoProcessingAction.SPEED_UP,
      endTime: 5.8,
      playbackRate: 2.4,
      startTime: 0.8,
    },
  ]);
}

function verifySavedRemovePolicy() {
  const candidates = buildAutoTransformCandidates(
    createTelemetryEntry([
      {
        data: { eventCount: 6, eventType: 'input' },
        endTime: 3.2,
        id: 'typing-1',
        kind: RecordingTelemetrySignalKind.TYPING,
        point: null,
        startTime: 2,
      },
      {
        data: { dwellMs: 2000 },
        endTime: 5,
        id: 'idle-1',
        kind: RecordingTelemetrySignalKind.CURSOR_IDLE,
        point: { x: 100, y: 200 },
        startTime: 1.5,
      },
      {
        data: { maxDiff: 0.2 },
        endTime: 5.2,
        id: 'static-1',
        kind: RecordingTelemetrySignalKind.STATIC_FRAME,
        point: null,
        startTime: 1.2,
      },
    ]),
    {
      ...stableSettings,
      action: VideoAutoProcessingAction.REMOVE,
      speedUpPlaybackRate: 3,
    }
  );

  expect(candidates).toEqual([
    {
      action: VideoAutoProcessingAction.REMOVE,
      endTime: 4.6,
      playbackRate: 3,
      startTime: 1.9,
    },
  ]);
}

describe('auto transform candidate heuristics', () => {
  it('builds stable candidates from overlapping cursor-idle and static-frame ranges', () => {
    verifyStableOverlapCandidates();
  });

  it('uses saved remove policy and ignores typing-only ranges in v1', () => {
    verifySavedRemovePolicy();
  });

  it('returns no candidates when stable segment processing is skipped', () => {
    expect(
      buildAutoTransformCandidates(createTelemetryEntry([]), {
        ...stableSettings,
        action: VideoAutoProcessingAction.SKIP,
      })
    ).toEqual([]);
  });
});
