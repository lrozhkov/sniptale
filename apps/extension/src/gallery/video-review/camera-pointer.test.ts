// @vitest-environment jsdom
import type { PointerEvent } from 'react';
import { expect, it } from 'vitest';
import { captureCameraPointer, resizeCameraPointer } from './camera-pointer';
import {
  computeQuickEditVisibleSourceRect,
  computeQuickEditVideoTransform,
} from '../../features/video/review/advanced/scene';

function capture(corner: string, args: Partial<Parameters<typeof captureCameraPointer>[0]> = {}) {
  const grip = document.createElement('span');
  grip.dataset['resize'] = corner;
  return captureCameraPointer(
    {
      camera: { scale: 2, centerX: 0.5, centerY: 0.5 },
      videoRect: { x: 0, y: 0, width: 480, height: 270 },
      output: { width: 480, height: 270 },
      view: 'area',
      ...args,
    },
    {
      target: grip,
      pointerId: 1,
      clientX: 120,
      clientY: 67.5,
    } as unknown as PointerEvent<HTMLElement>,
    new DOMRect(0, 0, 480, 270)
  );
}

it.each(['nw', 'ne', 'sw', 'se'])(
  'resizes %s proportionally around the opposite corner',
  (corner) => {
    const active = capture(corner);
    const west = corner.endsWith('w'),
      north = corner.startsWith('n');
    const camera = resizeCameraPointer(active, west ? -0.1 : 0.1, north ? -0.1 : 0.1);
    expect(camera.scale).toBeCloseTo(2 / 1.2);
    const half = 0.5 / camera.scale;
    expect(camera.centerX + (west ? half : -half)).toBeCloseTo(west ? 0.75 : 0.25);
    expect(camera.centerY + (north ? half : -half)).toBeCloseTo(north ? 0.75 : 0.25);
  }
);

it('clamps scale and effective source center at both bounds without crossing', () => {
  for (const corner of ['nw', 'ne', 'sw', 'se']) {
    const active = capture(corner);
    const sign = corner.endsWith('w') ? -1 : 1;
    const camera = resizeCameraPointer(active, sign * 20, 0);
    expect(camera).toEqual({ scale: 1, centerX: 0.5, centerY: 0.5 });
    const small = resizeCameraPointer(active, -sign * 20, 0);
    expect(small.scale).toBe(4);
    expect(small.centerX).toBeGreaterThanOrEqual(0.125);
    expect(small.centerX).toBeLessThanOrEqual(0.875);
  }
});

it('uses the unclipped viewport with padding and one clipped axis, including zero delta', () => {
  const videoRect = { x: 60, y: 0, width: 360, height: 270 };
  const viewport = { x: -1 / 6, y: 0, width: 4 / 3, height: 1 };
  const camera = { scale: 2, centerX: 0.25, centerY: 0.5 };
  const background = {
    enabled: true as const,
    type: 'solid' as const,
    color: '#000000ff',
    layout: { padding: 0, cornerRadius: 0 },
    zoomBehavior: 'follow-video' as const,
  };
  const visible = (value: typeof camera) =>
    computeQuickEditVisibleSourceRect(
      { videoRect, videoTransform: computeQuickEditVideoTransform({ videoRect, camera: value }) },
      background,
      { width: 480, height: 270 }
    );
  expect(visible(camera).x).toBe(0);
  expect(visible(camera).width).toBeCloseTo(7 / 12);
  const active = capture('se', { videoRect, viewport, camera, visibleArea: visible(camera) });
  expect(resizeCameraPointer(active, 0, 0)).toEqual(camera);
  const next = resizeCameraPointer(active, -0.1, -0.05);
  expect(next.scale).toBeCloseTo(2 / 0.85);
  expect(visible(next).width).toBeLessThan(visible(camera).width);
  expect(visible(next).x).toBe(0);
  const away = capture('nw', { videoRect, viewport, camera, visibleArea: visible(camera) });
  const shifted = resizeCameraPointer(away, 0.2, 0.1);
  expect(visible(shifted).x).toBeGreaterThan(0);
  expect(visible(shifted).x + visible(shifted).width).toBeCloseTo(7 / 12);
});
