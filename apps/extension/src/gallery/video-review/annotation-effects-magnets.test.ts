import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { readReviewAnnotationEffectDocument } from '../../features/video/review/annotation-effects/validation';
import type { ReviewAnnotationEffect } from '../../features/video/review/annotation-effects/types';
import {
  invertQuickEditProjection,
  projectQuickEditPoint,
} from '../../features/video/composition/motion/spatial-geometry';
import { createReviewAnnotationGeometry } from './annotation-effects-geometry';
import { reviewAnnotationMagnetTargets, snapReviewAnnotation } from './annotation-effects-magnets';

const document = readReviewAnnotationEffectDocument(
  readFileSync(
    'apps/extension/public/video-effects/animations/corners.sniptale-animation.json',
    'utf8'
  )
)!;
const geometry = createReviewAnnotationGeometry({
  source: { width: 1280, height: 720 },
  output: { width: 1280, height: 720 },
  camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
  background: { enabled: false },
})!;
const instance: ReviewAnnotationEffect = {
  id: 'one',
  snapshotId: 'source',
  start: 0,
  end: 5,
  enabled: true,
  attachment: 'viewport',
  order: 0,
  controls: {},
  transform: { x: 0.395, y: 0.31, width: 0.2, height: 0.16, rotation: 0 },
};
const size = { width: 640, height: 360 };
const targets = reviewAnnotationMagnetTargets(instance, [], geometry);
const input = { instance, document, geometry, size, targets, locks: {} };

it('captures within six CSS pixels, holds up to ten and releases outside that band', () => {
  const first = snapReviewAnnotation(input);
  expect(first.transform.x).toBeCloseTo(0.4, 10);
  expect(first.guides).toHaveLength(1);
  expect(first.guides[0]).toEqual({ start: { x: 640, y: 0 }, end: { x: 640, y: 720 } });
  const next = (x: number) =>
    snapReviewAnnotation({
      ...input,
      instance: { ...instance, transform: { ...instance.transform, x } },
      locks: first.locks,
    });
  expect(next(0.386).transform.x).toBeCloseTo(0.4, 10);
  expect(next(0.38).transform.x).toBe(0.38);
  expect(next(0.38).locks).toEqual({});
  expect(instance.transform.x).toBe(0.395);
});
it('uses actual CSS fitting and Alt bypass rather than output pixels', () => {
  expect(snapReviewAnnotation({ ...input, size: { width: 1280, height: 720 } }).transform.x).toBe(
    0.395
  );
  const first = snapReviewAnnotation(input);
  const bypass = snapReviewAnnotation({ ...input, locks: first.locks, bypass: true });
  expect(bypass.transform).toEqual(instance.transform);
  expect(bypass.locks).toEqual({});
  expect(bypass.guides).toEqual([]);
  expect(snapReviewAnnotation({ ...input, size: { width: 0, height: 0 } }).transform).toEqual(
    instance.transform
  );
});
it('excludes self, disabled and different-plane peers; captures active peer edges', () => {
  const peer = { ...instance, id: 'peer', transform: { ...instance.transform, x: 0.197 } };
  const actual = reviewAnnotationMagnetTargets(
    instance,
    [
      { instance, document },
      { instance: { ...peer, enabled: false }, document },
      { instance: { ...peer, attachment: 'content' }, document },
      { instance: peer, document },
    ],
    geometry
  );
  expect(actual.x).toHaveLength(6);
  expect(actual.x[3]).toBeCloseTo(252.16, 8);
  const result = snapReviewAnnotation({ ...input, targets: actual });
  expect(result.transform.x).toBeCloseTo(0.397, 8);
});
it('projects rotated content alignment and guides through the same 3D homography', () => {
  const matrix = [1, 0.1, 30, 0.03, 0.9, 10, 0.0001, 0.00005, 1] as const;
  const projected = {
    ...geometry,
    contentToViewport: matrix,
    viewportToContent: invertQuickEditProjection(matrix)!,
  };
  const content = {
    ...instance,
    attachment: 'content' as const,
    transform: { ...instance.transform, rotation: 0.25 },
  };
  const result = snapReviewAnnotation({
    ...input,
    instance: content,
    geometry: projected,
    targets: reviewAnnotationMagnetTargets(content, [], projected),
  });
  expect(result.transform.x).toBeCloseTo(0.4, 8);
  expect(result.guides[0]?.start.x).toBeCloseTo(
    projectQuickEditPoint(matrix, { x: 640, y: 0 })!.x,
    8
  );
  expect(result.guides[0]?.end.y).toBeCloseTo(
    projectQuickEditPoint(matrix, { x: 640, y: 720 })!.y,
    8
  );
});
