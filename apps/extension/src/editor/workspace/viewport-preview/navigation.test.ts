// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { navigateEditorViewportFromClientPoint } from './navigation';

function createSurface(scale = 1) {
  const surface = document.createElement('div');
  Object.defineProperties(surface, {
    offsetWidth: { value: 198 },
    offsetHeight: { value: 140 },
    clientWidth: { value: 196 },
    clientHeight: { value: 138 },
    clientLeft: { value: 1 },
    clientTop: { value: 1 },
  });
  surface.getBoundingClientRect = () =>
    ({ left: 50, top: 40, width: 198 * scale, height: 140 * scale }) as DOMRect;
  return surface;
}

it.each([1, 2])('maps the bordered portrait document coordinates at CSS scale %s', (scale) => {
  const navigateViewportTo = vi.fn();
  const args = {
    clientX: 50 + (1 + 75 + 46 * 0.25) * scale,
    clientY: 40 + (1 + 138 * 0.75) * scale,
    controller: { navigateViewportTo },
    previewSurfaceRef: { current: createSurface(scale) },
    previewSize: { width: 196, height: 138 },
    contentRect: { left: 75, top: 0, width: 46, height: 138 },
  };
  navigateEditorViewportFromClientPoint(args);
  expect(navigateViewportTo).toHaveBeenCalledWith(0.25, 0.75);
});

it('clamps clicks in the letterbox to the nearest document edge', () => {
  const navigateViewportTo = vi.fn();
  const args = {
    clientX: 55,
    clientY: 110,
    controller: { navigateViewportTo },
    previewSurfaceRef: { current: createSurface() },
    previewSize: { width: 196, height: 138 },
    contentRect: { left: 75, top: 0, width: 46, height: 138 },
  };
  navigateEditorViewportFromClientPoint(args);
  expect(navigateViewportTo).toHaveBeenCalledWith(0, 0.5);
});
