import { expect, it } from 'vitest';
import { evaluateCursorFocusSegment } from '../project/cursor-focus-path/evaluator';
import type { CursorFocusPath } from '../project/cursor-focus-path/types';
import { evaluateCursorMotion, type CursorMotion } from '../project/cursor-motion';
import { createQuickEditWebcam } from './advanced/webcam';
import type { ReviewTimeSegment } from './time-segment';
import {
  projectReviewCursorMotions,
  projectReviewCursorPath,
  projectReviewWebcam,
  projectReviewVisualRange,
  retimeReviewResultRange,
  retimeReviewResultPoint,
} from './timeline-placement';

function timeMap(duration: number): ReviewTimeSegment[] {
  return [
    { kind: 'keep', sourceStart: 0, sourceEnd: 4, resultStart: 0, resultEnd: 4, rate: 1 },
    {
      kind: 'freeze',
      sourceStart: 4,
      sourceEnd: 4,
      resultStart: 4,
      resultEnd: 4 + duration,
      rate: 0,
      freezeId: 'freeze',
      frameTime: 3.96,
    },
    {
      kind: 'keep',
      sourceStart: 4,
      sourceEnd: 10,
      resultStart: 4 + duration,
      resultEnd: 10 + duration,
      rate: 1,
    },
  ];
}

it('holds recorded focus while authored cursor motion advances through inserted video time', () => {
  const map = timeMap(2);
  const path: CursorFocusPath = {
    version: 1,
    smoothing: 0.5,
    sensitivity: 0.5,
    mode: 'follow',
    gapPolicy: 'hold',
    segments: [
      {
        id: 'source',
        binding: { kind: 'project' },
        start: 0,
        end: 10,
        keys: [
          { id: 'a', time: 0, x: 0, y: 0.5, anchor: 'boundary', interpolation: 'linear' },
          { id: 'b', time: 10, x: 1, y: 0.5, anchor: 'boundary', interpolation: 'linear' },
        ],
      },
    ],
  };
  path.segments[0]!.keys.splice(1, 0, {
    id: 'middle',
    time: 3,
    x: 0.3,
    y: 0.5,
    anchor: 'manual',
    interpolation: 'linear',
  });
  const original = structuredClone(path);
  const projected = projectReviewCursorPath(path, map)!;
  const held = projected.segments[1]!;
  expect(held).toMatchObject({ start: 4, end: 6 });
  expect(evaluateCursorFocusSegment(held, 4.25)?.x).toBeCloseTo(0.396);
  expect(evaluateCursorFocusSegment(held, 5.75)?.x).toBeCloseTo(0.396);
  const motions: CursorMotion[] = [
    {
      id: 'authored',
      start: 4,
      end: 6,
      timeDomain: 'result',
      enabled: true,
      shape: 'arrow',
      size: 48,
      color: '#000000',
      outline: '#ffffff',
      shadow: false,
      easing: 'linear',
      points: [
        { id: 'a', at: 0, x: 0, y: 0.5 },
        { id: 'b', at: 1, x: 1, y: 0.5 },
      ],
    },
  ];
  const result = projectReviewCursorMotions(motions, map);
  expect(evaluateCursorMotion(result, 3.96, 4.25)?.x).toBeCloseTo(0.125);
  expect(evaluateCursorMotion(result, 3.96, 5.75)?.x).toBeCloseTo(0.875);
  expect(projectReviewCursorPath(path, map)).toBe(projected);
  expect(projectReviewCursorMotions(motions, map)).toBe(result);
  const changed = projectReviewCursorPath(path, timeMap(3))!;
  expect(changed.segments.at(-1)?.end).toBe(13);
  expect(path).toEqual(original);
  expect(projectReviewCursorPath(path)).toBe(path);
  expect(
    projectReviewCursorPath({ ...path, segments: [{ ...path.segments[0]!, keys: [] }] }, map)
      ?.segments
  ).toEqual([]);
  const cutMap: ReviewTimeSegment[] = [
    { kind: 'cut', sourceStart: 0, sourceEnd: 10, resultStart: 0, resultEnd: 0, rate: 0 },
  ];
  expect(projectReviewCursorPath(path, cutMap)?.segments).toEqual([]);
  expect(
    projectReviewCursorPath(
      { ...path, segments: [{ ...path.segments[0]!, start: 20, end: 21 }] },
      map
    )?.segments
  ).toEqual([]);
});

it('keeps authored boundaries inside a resized hold and removes points with deleted video time', () => {
  const before = timeMap(2);
  const longer = timeMap(3);
  const shorter = timeMap(1);
  const removed = timeMap(0).filter((part) => part.kind !== 'freeze');
  expect(retimeReviewResultRange({ start: 4.5, end: 5.5 }, before, longer)).toEqual({
    start: 4.5,
    end: 5.5,
  });
  expect(retimeReviewResultRange({ start: 5.5, end: 8 }, before, shorter)).toEqual({
    start: 5,
    end: 7,
  });
  expect(retimeReviewResultRange({ start: 3, end: 8 }, before, removed)).toEqual({
    start: 3,
    end: 6,
  });
  expect(retimeReviewResultRange({ start: 12, end: 14 }, before, longer)).toEqual({
    start: 13,
    end: 15,
  });
  expect(retimeReviewResultPoint(5.5, before, shorter)).toBeNull();
  expect(retimeReviewResultPoint(4.5, before, longer)).toBe(4.5);
  expect(retimeReviewResultPoint(4.5, before, removed)).toBeNull();
  expect(retimeReviewResultPoint(8, before, longer)).toBe(9);
  const cut: ReviewTimeSegment[] = [
    { kind: 'cut', sourceStart: 0, sourceEnd: 10, resultStart: 0, resultEnd: 0, rate: 0 },
  ];
  expect(retimeReviewResultRange({ start: 2, end: 3 }, before, cut)).toEqual({ start: 0, end: 0 });
  expect(retimeReviewResultRange({ start: 0, end: 12 }, before, [])).toEqual({ start: 0, end: 0 });
  expect(projectReviewVisualRange({ start: 0, end: 2 }, cut)).toBeNull();
});

it('projects legacy camera transitions and cursor intervals without retaining cut-only content', () => {
  const map = timeMap(2);
  const camera = createQuickEditWebcam(
    'camera',
    { width: 160, height: 90 },
    { width: 160, height: 90 }
  );
  camera.positions = [
    {
      id: 'move',
      time: 3,
      placement: camera.placement,
      transition: { type: 'ease-in-out', duration: 2 },
    },
    {
      id: 'instant',
      time: 7,
      placement: camera.placement,
      transition: { type: 'none', duration: 0 },
    },
    {
      id: 'outside',
      time: 20,
      placement: camera.placement,
      transition: { type: 'none', duration: 0 },
    },
  ];
  camera.hiddenRanges = [{ id: 'outside', start: 20, end: 21 }];
  const projected = projectReviewWebcam(camera, map)!;
  expect(projected.positions).toMatchObject([
    { id: 'move', time: 3, transition: { duration: 4 } },
    { id: 'instant', time: 9, transition: { duration: 0 } },
  ]);
  expect(projected.hiddenRanges).toEqual([]);
  expect(projectReviewWebcam(projected, map)).toBe(projected);
  expect(projectReviewWebcam(camera)).toBe(camera);
  expect(projectReviewWebcam(undefined, map)).toBeUndefined();
  expect(projectReviewWebcam(camera, [])).toBe(camera);
  expect(projectReviewCursorPath(undefined, map)).toBeUndefined();
  expect(projectReviewCursorMotions(undefined, map)).toBeUndefined();
  const motion: CursorMotion = {
    id: 'source',
    start: 3,
    end: 7,
    enabled: true,
    shape: 'arrow',
    size: 48,
    color: '#000000',
    outline: '#ffffff',
    shadow: false,
    easing: 'linear',
    points: [
      { id: 'a', at: 0, x: 0, y: 0 },
      { id: 'b', at: 1, x: 1, y: 1 },
    ],
  };
  expect(projectReviewCursorMotions([motion], map)).toMatchObject([
    { start: 3, end: 9, timeDomain: 'result' },
  ]);
  expect(projectReviewCursorMotions([motion])).toEqual([motion]);
  expect(projectReviewCursorMotions([{ ...motion, start: 20, end: 21 }], map)).toEqual([]);
});

it('reprojects camera visibility and positions when an inserted video interval changes', () => {
  const map = timeMap(2);
  const webcam = {
    ...createQuickEditWebcam('camera', { width: 160, height: 90 }, { width: 160, height: 90 }),
    hiddenRanges: [{ id: 'hidden', start: 3, end: 7 }],
  };
  const original = structuredClone(webcam);
  const camera = projectReviewWebcam(webcam, map)!;
  expect(camera.hiddenRanges[0]).toMatchObject({ start: 3, end: 9 });
  expect(projectReviewWebcam(webcam, map)).toBe(camera);
  expect(projectReviewWebcam(webcam, timeMap(3))?.hiddenRanges[0]).toMatchObject({
    start: 3,
    end: 10,
  });
  const edited = { ...webcam, hiddenRanges: [{ id: 'hidden', start: 1, end: 2 }] };
  expect(projectReviewWebcam(edited, map)?.hiddenRanges[0]).toMatchObject({ start: 1, end: 2 });
  expect(webcam).toEqual(original);
});
