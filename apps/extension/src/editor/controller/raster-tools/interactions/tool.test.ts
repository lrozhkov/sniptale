import { expect, it } from 'vitest';
import { isRasterEditorTool } from './tool';

it('narrows only raster editor tools', () => {
  expect(isRasterEditorTool('selection')).toBe(true);
  expect(isRasterEditorTool('brush')).toBe(true);
  expect(isRasterEditorTool('eraser')).toBe(true);
  expect(isRasterEditorTool('fill')).toBe(true);
  expect(isRasterEditorTool('text')).toBe(false);
});
