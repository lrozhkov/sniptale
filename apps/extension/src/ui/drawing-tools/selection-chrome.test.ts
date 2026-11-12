// @vitest-environment jsdom
import { expect, it } from 'vitest';
import {
  CANVAS_SELECTION_METRICS,
  getCanvasHandleSize,
  readCanvasChromeColors,
  renderCanvasSelectionHandle,
  renderCanvasRotationHandle,
} from './selection-chrome';
it('uses one fixed screen geometry for all control adapters', () => {
  expect(getCanvasHandleSize('corner')).toEqual({ width: 9, height: 9 });
  expect(getCanvasHandleSize('vertical')).toEqual({ width: 6, height: 12 });
  expect(getCanvasHandleSize('horizontal')).toEqual({ width: 12, height: 6 });
  expect(getCanvasHandleSize('point')).toEqual({ width: 10, height: 10 });
  expect(CANVAS_SELECTION_METRICS.rotationHit).toBe(28);
});
it('keeps the source background visible behind the rotation icon', () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  const context = canvas.getContext('2d')!;
  renderCanvasRotationHandle(context, 20, 20);
  const data = context.getImageData(0, 0, 40, 40).data;
  expect([...data].some((alpha, index) => index % 4 === 3 && alpha > 0)).toBe(true);
  const half = CANVAS_SELECTION_METRICS.rotation / 2;
  for (const x of [20 - half, 20 + half])
    for (const y of [20 - half, 20 + half])
      expect(context.getImageData(x, y, 1, 1).data[3]).toBe(0);
});
it('changes only handle fill during active capture, preserving its pixel footprint', () => {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 40;
  const context = canvas.getContext('2d')!;
  const paint = (active: boolean) => {
    context.clearRect(0, 0, 40, 40);
    renderCanvasSelectionHandle(context, 20, 20, 'corner', { active });
    return context.getImageData(0, 0, 40, 40).data;
  };
  const normal = paint(false),
    active = paint(true);
  for (let i = 3; i < normal.length; i += 4) expect(active[i]).toBe(normal[i]);
  expect([...normal]).not.toEqual([...active]);
});
it('uses extension theme colors with a canonical fallback for unthemed surfaces', () => {
  const canvas = document.createElement('canvas');
  canvas.style.setProperty('--sniptale-color-canvas-selection', '#5b9aff');
  canvas.style.setProperty('--sniptale-color-canvas-magnet', '#c59af2');
  document.body.append(canvas);
  expect(readCanvasChromeColors(canvas)).toEqual({ selection: '#5b9aff', magnet: '#c59af2' });
  canvas.remove();
  expect(readCanvasChromeColors()).toEqual({ selection: '#2563eb', magnet: '#9854d8' });
});
