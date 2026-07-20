import { describe, expect, it } from 'vitest';
import { isLegacyScrollActionEvent, mapSourceRangeToProjectSpans } from './source-time';
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

function verifyLegacyScrollCompatibility() {
  expect(
    isLegacyScrollActionEvent({
      kind: VideoProjectActionEventKind.SCROLL,
      preset: VideoProjectActionPreset.SCROLL_EMPHASIS,
    })
  ).toBe(true);
  expect(
    isLegacyScrollActionEvent({
      kind: VideoProjectActionEventKind.CLICK,
      preset: VideoProjectActionPreset.CLICK_RIPPLE,
    })
  ).toBe(false);
}

describe('timeline source-time helpers', () => {
  it('maps one source range across split and retimed project clips', verifySourceRangeMapping);
  it(
    'normalizes reversed inputs and drops source ranges outside the current clip timeline',
    verifyNormalizedSourceRanges
  );
  it('treats scroll actions as legacy-only compatibility data', verifyLegacyScrollCompatibility);
});
