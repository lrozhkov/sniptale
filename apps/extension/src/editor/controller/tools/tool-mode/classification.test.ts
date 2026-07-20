import { expect, it } from 'vitest';

import {
  isFreeDrawingTool,
  isRasterInteractionTool,
  isStickyAnnotationTool,
} from './classification';

it('classifies annotation, raster, and free-drawing tool roles', () => {
  expect(isStickyAnnotationTool('shape-library')).toBe(true);
  expect(isStickyAnnotationTool('select')).toBe(false);
  expect(isStickyAnnotationTool('crop')).toBe(false);

  expect(isRasterInteractionTool('selection')).toBe(true);
  expect(isRasterInteractionTool('fill')).toBe(true);
  expect(isRasterInteractionTool('text')).toBe(false);

  expect(isFreeDrawingTool('pencil')).toBe(true);
  expect(isFreeDrawingTool('highlighter')).toBe(true);
  expect(isFreeDrawingTool('brush')).toBe(false);
});
