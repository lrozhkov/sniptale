import { expect, it } from 'vitest';

import {
  DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR,
  DEFAULT_VIDEO_ANNOTATION_DIRECTION,
  DEFAULT_VIDEO_ANNOTATION_FAMILY,
  DEFAULT_VIDEO_ANNOTATION_INTENSITY,
  DEFAULT_VIDEO_ANNOTATION_INTRO,
  DEFAULT_VIDEO_ANNOTATION_OUTRO,
  DEFAULT_VIDEO_ANNOTATION_LEADER_LINE,
  DEFAULT_VIDEO_ANNOTATION_MOTION_FAMILY,
  DEFAULT_VIDEO_ANNOTATION_RENDER_FAMILY,
  DEFAULT_VIDEO_ANNOTATION_TEMPLATE,
  DEFAULT_VIDEO_ANNOTATION_TARGET,
  DEFAULT_VIDEO_TRANSITION_DIRECTION,
  DEFAULT_VIDEO_TRANSITION_HIGHLIGHT_COLOR,
  DEFAULT_VIDEO_TRANSITION_INTENSITY,
  DEFAULT_VIDEO_TRANSITION_RENDER_KIND,
  DEFAULT_VIDEO_TRANSITION_TEMPLATE,
  createVideoProjectCursorTrack,
  createVideoProjectSource,
} from './defaults';

it('creates hidden cursor tracks for embedded fallback recordings', () => {
  expect(createVideoProjectCursorTrack('embedded-fallback')).toEqual(
    expect.objectContaining({
      captureMode: 'embedded-fallback',
      skin: expect.objectContaining({
        animationPreset: 'NONE',
        hidden: true,
        preset: 'ARROW',
      }),
    })
  );
});

it('creates visible cursor tracks for separate cursor recordings', () => {
  expect(createVideoProjectCursorTrack('separate')).toEqual(
    expect.objectContaining({
      captureMode: 'separate',
      skin: expect.objectContaining({
        animationPreset: 'NONE',
        hidden: false,
        preset: 'ARROW',
      }),
    })
  );
});

it('creates recording and manual project sources from the base recording id', () => {
  expect(createVideoProjectSource('recording-1')).toEqual({
    kind: 'recording',
    recordingId: 'recording-1',
  });
  expect(createVideoProjectSource(null)).toEqual({
    kind: 'manual',
  });
});

it('keeps annotation and transition template defaults on the shared contract seam', () => {
  expect(DEFAULT_VIDEO_ANNOTATION_TEMPLATE).toBe('LOWER_THIRD_BASIC');
  expect(DEFAULT_VIDEO_ANNOTATION_INTRO).toBe('SLIDE_UP_FADE');
  expect(DEFAULT_VIDEO_ANNOTATION_OUTRO).toBe('REVEAL_MASK');
  expect(DEFAULT_VIDEO_ANNOTATION_DIRECTION).toBe('LEFT');
  expect(DEFAULT_VIDEO_ANNOTATION_INTENSITY).toBe('BALANCED');
  expect(DEFAULT_VIDEO_ANNOTATION_FAMILY).toBe('LOWER_THIRD');
  expect(DEFAULT_VIDEO_ANNOTATION_RENDER_FAMILY).toBe('PLATE');
  expect(DEFAULT_VIDEO_ANNOTATION_MOTION_FAMILY).toBe('SLIDE_CARD');
  expect(DEFAULT_VIDEO_ANNOTATION_TARGET).toBe('NONE');
  expect(DEFAULT_VIDEO_ANNOTATION_LEADER_LINE).toEqual({
    direction: 'LEFT',
    enabled: false,
    length: 120,
    style: 'STRAIGHT',
    thickness: 3,
  });
  expect(DEFAULT_VIDEO_ANNOTATION_CALLOUT_DECOR).toEqual({
    arrowKind: 'NONE',
    frameKind: 'NONE',
    markerKind: 'NONE',
    pulseKind: 'NONE',
  });
  expect(DEFAULT_VIDEO_TRANSITION_TEMPLATE).toBe('CROSSFADE');
  expect(DEFAULT_VIDEO_TRANSITION_RENDER_KIND).toBe('COMPOSITE');
  expect(DEFAULT_VIDEO_TRANSITION_DIRECTION).toBe('LEFT');
  expect(DEFAULT_VIDEO_TRANSITION_INTENSITY).toBe('BALANCED');
  expect(DEFAULT_VIDEO_TRANSITION_HIGHLIGHT_COLOR).toBe('#f97316');
});
