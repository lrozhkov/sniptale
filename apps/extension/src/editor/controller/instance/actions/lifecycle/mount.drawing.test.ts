// @vitest-environment jsdom

import { expect, it } from 'vitest';
import { createMountedCanvas } from './mount';

it('configures canonical drawing selection and transform modifiers', () => {
  const canvas = createMountedCanvas(document.createElement('canvas'));

  expect(canvas.selectionKey).toBe('ctrlKey');
  expect(canvas.uniformScaling).toBe(false);
  expect(canvas.uniScaleKey).toBe('shiftKey');
  expect(canvas.centeredKey).toBe('ctrlKey');
  expect(canvas.enablePointerEvents).toBe(true);
  expect(canvas.upperCanvasEl.draggable).toBe(false);

  canvas.dispose();
});
