import { expect, it } from 'vitest';
import { resolveFrameAnnotationToolbarPlacement } from './toolbar-placement';

const toolbarSize = { height: 44, width: 420 };

it.each([719, 720, 721])('docks below the measured rail at %i px', (width) => {
  const position = resolveFrameAnnotationToolbarPlacement({
    railBounds: { left: 12, right: width - 12, top: 12, bottom: width === 721 ? 60 : 108 },
    toolbarSize,
    viewport: { width, height: 600 },
  });
  expect(position.top).toBe(width === 721 ? 66 : 114);
  expect(position.left).toBe((width - toolbarSize.width) / 2);
  expect(position.scale).toBe(1);
});

it('fits the toolbar in a narrow viewport', () => {
  const position = resolveFrameAnnotationToolbarPlacement({
    railBounds: { left: 12, right: 308, top: 12, bottom: 116 },
    toolbarSize,
    viewport: { width: 320, height: 568 },
  });
  expect(position).toEqual({ left: 8, top: 122, scale: 304 / 420 });
});

it('avoids title and tool properties when they intersect the docked toolbar', () => {
  expect(
    resolveFrameAnnotationToolbarPlacement({
      railBounds: { left: 200, right: 800, top: 12, bottom: 60 },
      obstacleBounds: [
        { left: 300, right: 600, top: 12, bottom: 74 },
        { left: 380, right: 620, top: 72, bottom: 120 },
      ],
      toolbarSize,
      viewport: { width: 1000, height: 600 },
    })
  ).toEqual({ left: 290, top: 126, scale: 1 });
});
