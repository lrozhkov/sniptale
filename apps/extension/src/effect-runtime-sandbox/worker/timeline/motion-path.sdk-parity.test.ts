import { describe, expect, it } from 'vitest';

import {
  createMotionPathGeometry,
  evaluateMotionPathGeometry,
  getMotionPathLayerProperty,
  motionPathTemporalKeyframesMatch,
  normalizeMotionPaths,
} from './motion-path.js';
import { normalizeKeyframes } from '../model/render-normalization.js';
import type { NormalizedTimelineTrack } from '../model/types.js';

describe('timeline motion path model', () => {
  it('normalizes editor metadata without owning point positions', () => {
    expect(
      normalizeMotionPaths([
        {
          layerId: 'card',
          points: [
            {
              inTangent: { x: 'bad', y: 12 },
              kind: 'smooth',
              outTangent: { x: 20, y: -5 },
              xKeyframeId: 'x-a',
              yKeyframeId: 'y-a',
            },
          ],
        },
      ])
    ).toEqual([
      {
        layerId: 'card',
        points: [
          {
            inTangent: { x: 0, y: 12 },
            kind: 'smooth',
            outTangent: { x: 20, y: -5 },
            xKeyframeId: 'x-a',
            yKeyframeId: 'y-a',
          },
        ],
      },
    ]);
  });
});

describe('timeline motion path evaluation', () => {
  it('evaluates absolute 2D tangents with shared temporal easing', () => {
    const geometry = createMotionPathGeometry(createCurvedTimeline(), 'card');
    expect(geometry.ok).toBe(true);
    if (!geometry.ok) {
      return;
    }

    expect(evaluateMotionPathGeometry(geometry, 0.5)).toEqual({
      x: 87.5,
      y: 12.5,
    });
  });

  it('ignores tangents for linear points and rejects temporal mismatch', () => {
    const timeline = createCurvedTimeline();
    timeline.motionPaths[0].points[0].kind = 'linear';
    timeline.motionPaths[0].points[1].kind = 'smooth';
    const linear = createMotionPathGeometry(timeline, 'card');
    expect(linear.ok).toBe(true);
    if (linear.ok) {
      expect(evaluateMotionPathGeometry(linear, 0.5)).toEqual({
        x: 50,
        y: 50,
      });
    }

    timeline.tracks[1].keyframes[0].easing = 'out';
    expect(createMotionPathGeometry(timeline, 'card')).toEqual({
      layerId: 'card',
      ok: false,
      reason: 'temporal-mismatch',
    });
  });
});

describe('timeline motion path track matching', () => {
  it('matches bezier temporal metadata and rejects unrelated track properties', () => {
    const [left, right] = normalizeKeyframes(
      [
        {
          easing: 'bezier',
          handles: { x1: 0.1, x2: 0.9, y1: 0.2, y2: 0.8 },
          id: 'a',
          time: 0,
          value: 0,
        },
        {
          easing: 'bezier',
          handles: { x1: 0.1, x2: 0.9, y1: 0.2, y2: 0.8 },
          id: 'b',
          time: 1,
          value: 1,
        },
      ],
      1
    );

    expect(motionPathTemporalKeyframesMatch(left!, right!)).toBe(true);
    right!.handles.x1 = 0.5;
    expect(motionPathTemporalKeyframesMatch(left!, right!)).toBe(false);
    const track = {
      enabled: true,
      id: 'card.opacity',
      keyframes: [],
      label: '',
      layerId: 'card',
      phaseId: null,
      property: 'opacity',
      sceneId: null,
      target: 'card',
    } satisfies NormalizedTimelineTrack;
    expect(getMotionPathLayerProperty(track)).toBeNull();
  });
});

function createCurvedTimeline(): any {
  return {
    motionPaths: [
      {
        layerId: 'card',
        points: [
          {
            inTangent: { x: 0, y: 0 },
            kind: 'corner',
            outTangent: { x: 100, y: 0 },
            xKeyframeId: 'x-a',
            yKeyframeId: 'y-a',
          },
          {
            inTangent: { x: 0, y: -100 },
            kind: 'corner',
            outTangent: { x: 0, y: 0 },
            xKeyframeId: 'x-b',
            yKeyframeId: 'y-b',
          },
        ],
      },
    ],
    tracks: [
      {
        id: 'card.x',
        keyframes: [
          { easing: 'linear', id: 'x-a', time: 0, value: 0 },
          { easing: 'linear', id: 'x-b', time: 1, value: 100 },
        ],
        layerId: 'card',
        property: 'x',
      },
      {
        id: 'card.y',
        keyframes: [
          { easing: 'linear', id: 'y-a', time: 0, value: 0 },
          { easing: 'linear', id: 'y-b', time: 1, value: 100 },
        ],
        layerId: 'card',
        property: 'y',
      },
    ],
  };
}
