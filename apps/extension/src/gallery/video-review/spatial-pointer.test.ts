// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { captureReviewSpatialPointer } from './spatial-pointer';

it('freezes stage bounds at pointer-down and maps client pixels into the original plane', () => {
  const stage = document.createElement('div');
  stage.dataset['ui'] = 'gallery.videoReview.stage';
  const child = document.createElement('div');
  stage.append(child);
  const bounds = vi
    .spyOn(stage, 'getBoundingClientRect')
    .mockReturnValue({ left: 100, top: 50, width: 400, height: 200 } as DOMRect);
  const pointer = captureReviewSpatialPointer(child, [1, 0, 20, 0, 1, 10, 0, 0, 1], {
    width: 800,
    height: 400,
  });
  bounds.mockReturnValue({ left: 0, top: 0, width: 800, height: 400 } as DOMRect);
  expect(pointer({ clientX: 160, clientY: 90 })).toEqual({ x: 100, y: 70 });
});
it('keeps ordinary client coordinates and tolerates unavailable projections', () => {
  const node = document.createElement('div');
  const output = { width: 800, height: 400 };
  const event = { clientX: 10, clientY: 20 };
  expect(captureReviewSpatialPointer(node, undefined, output)(event)).toEqual({ x: 10, y: 20 });
  expect(captureReviewSpatialPointer(node, [0, 0, 0, 0, 0, 0, 0, 0, 0], output)(event)).toEqual({
    x: 10,
    y: 20,
  });
});
