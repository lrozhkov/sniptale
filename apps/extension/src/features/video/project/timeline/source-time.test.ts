import { describe, expect, it } from 'vitest';
import {
  isScrollActionEvent,
  mapProjectTimeToSourcePoint,
  mapSourceRangeToProjectSpans,
  mapSourceTimeToProjectPoint,
} from './source-time';
import { VideoProjectActionEventKind, VideoProjectActionPreset } from '../types/interaction';
import { createVideoClip } from './project-meta.test.helpers.ts';

function verifySourceRangeMapping() {
  expect(
    mapSourceRangeToProjectSpans(
      [
        createVideoClip({
          duration: 3,
          id: 'clip-a',
          playbackRate: 2,
          sourceDuration: 6,
          sourceStart: 0,
          startTime: 1,
        }),
        createVideoClip({
          duration: 2,
          id: 'clip-b',
          playbackRate: 3,
          sourceDuration: 6,
          sourceStart: 6,
          startTime: 4,
        }),
      ],
      2,
      9
    )
  ).toEqual([
    {
      clipId: 'clip-a',
      endTime: 4,
      sourceEnd: 6,
      sourceStart: 2,
      startTime: 2,
    },
    {
      clipId: 'clip-b',
      endTime: 5,
      sourceEnd: 9,
      sourceStart: 6,
      startTime: 4,
    },
  ]);
}

function verifyNormalizedSourceRanges() {
  expect(
    mapSourceRangeToProjectSpans(
      [
        createVideoClip({
          duration: 2,
          id: 'clip-a',
          playbackRate: 2,
          sourceDuration: 4,
          sourceStart: 0,
          startTime: 0,
        }),
      ],
      3,
      1
    )
  ).toEqual([
    {
      clipId: 'clip-a',
      endTime: 1.5,
      sourceEnd: 3,
      sourceStart: 1,
      startTime: 0.5,
    },
  ]);
  expect(
    mapSourceRangeToProjectSpans(
      [
        createVideoClip({
          duration: 2,
          id: 'clip-b',
          playbackRate: 2,
          sourceDuration: 4,
          sourceStart: 0,
          startTime: 0,
        }),
      ],
      5,
      7
    )
  ).toEqual([]);
}

function verifyScrollAdmission() {
  expect(
    isScrollActionEvent({
      kind: VideoProjectActionEventKind.SCROLL,
      presentation: { preset: VideoProjectActionPreset.SCROLL_EMPHASIS },
    })
  ).toBe(true);
  expect(
    isScrollActionEvent({
      kind: VideoProjectActionEventKind.CLICK,
      presentation: { preset: VideoProjectActionPreset.CLICK_RIPPLE },
    })
  ).toBe(false);
}

describe('timeline source-time helpers', () => {
  it('maps one source range across split and retimed project clips', verifySourceRangeMapping);
  it(
    'normalizes reversed inputs and drops source ranges outside the current clip timeline',
    verifyNormalizedSourceRanges
  );
  it('treats scroll actions as legacy-only compatibility data', verifyScrollAdmission);
  it('maps source and project points bidirectionally with a stable preferred clip', () => {
    const clips = [
      createVideoClip({
        duration: 4,
        id: 'original',
        playbackRate: 2,
        sourceDuration: 8,
        sourceStart: 0,
        startTime: 3,
      }),
      createVideoClip({
        duration: 4,
        id: 'duplicate',
        playbackRate: 2,
        sourceDuration: 8,
        sourceStart: 0,
        startTime: 10,
      }),
    ];

    expect(mapProjectTimeToSourcePoint(clips, 5)).toEqual({
      clipId: 'original',
      sourceTime: 4,
      time: 5,
    });
    expect(mapSourceTimeToProjectPoint(clips, 4, 'duplicate')).toEqual({
      clipId: 'duplicate',
      sourceTime: 4,
      time: 12,
    });
  });
});

it('maps only the visible source slice of a split playback window and retains its held caption', () => {
  const clip = createVideoClip({
    id: 'held',
    startTime: 5,
    duration: 1,
    sourceStart: 1,
    sourceDuration: 2,
    playbackRate: 1,
    playbackWindow: { offset: 1.2, holdAt: 1.5 },
  });
  expect(mapSourceRangeToProjectSpans([clip], 1, 2)).toEqual([]);
  expect(mapSourceRangeToProjectSpans([clip], 2.3, 2.8)).toEqual([
    { clipId: 'held', sourceStart: 2.3, sourceEnd: 2.5, startTime: 5.1, endTime: 6 },
  ]);
  expect(mapSourceTimeToProjectPoint([clip], 1.4)).toBeNull();
  expect(mapSourceTimeToProjectPoint([clip], 2.4)?.time).toBeCloseTo(5.2, 12);
  expect(mapProjectTimeToSourcePoint([clip], 5.9)?.sourceTime).toBeCloseTo(2.5, 12);
});

it('keeps a windowed visual point inside its retained source interval at the physical tail', () => {
  const clip = createVideoClip({
    id: 'bounded',
    startTime: 2,
    duration: 1.2,
    sourceStart: 3,
    sourceDuration: 2,
    playbackRate: 2,
    playbackWindow: { offset: 0.5 },
  });
  expect(mapProjectTimeToSourcePoint([clip], 2.25)?.sourceTime).toBe(4.5);
  expect(mapProjectTimeToSourcePoint([clip], 3.1)?.sourceTime).toBe(5);
  expect(mapProjectTimeToSourcePoint([clip], 3.21)).toBeNull();
});
