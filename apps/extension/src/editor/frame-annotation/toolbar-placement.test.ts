import { expect, it } from 'vitest';
import { resolveFrameAnnotationToolbarPlacement } from './toolbar-placement';

it('places the toolbar above the complete frame and callout bounds without overlap', () => {
  expect(
    resolveFrameAnnotationToolbarPlacement({
      frameBounds: { bottom: 500, left: 300, right: 600, top: 300 },
      calloutBounds: { bottom: 290, left: 380, right: 560, top: 210 },
      toolbarSize: { height: 44, width: 320 },
      viewport: { height: 900, width: 1200 },
    })
  ).toEqual({ left: 290, top: 154 });
});

it('moves below a selection near the viewport top and clamps its horizontal position', () => {
  expect(
    resolveFrameAnnotationToolbarPlacement({
      frameBounds: { bottom: 100, left: -40, right: 100, top: 20 },
      toolbarSize: { height: 44, width: 320 },
      viewport: { height: 500, width: 600 },
    })
  ).toEqual({ left: 8, top: 112 });
});
