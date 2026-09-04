import { expect, it } from 'vitest';
import { resolveVideoProjectCameraTrackOrder } from './track-order';

it('allocates stable camera orders between overlays and ordinary video', () => {
  const orders = [
    resolveVideoProjectCameraTrackOrder(0, 3),
    resolveVideoProjectCameraTrackOrder(1, 3),
    resolveVideoProjectCameraTrackOrder(2, 3),
  ];

  expect(orders).toEqual([0.25, 0.5, 0.75]);
  expect(orders.every((order) => order > 0 && order < 1)).toBe(true);
  expect(resolveVideoProjectCameraTrackOrder(-1, 0)).toBe(0.5);
});
