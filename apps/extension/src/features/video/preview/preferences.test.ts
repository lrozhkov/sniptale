import { expect, it } from 'vitest';
import { resolveVideoEditorPreviewFrameRate } from './preferences';

it('keeps project FPS by default and only lowers it for preview', () => {
  expect(resolveVideoEditorPreviewFrameRate(60)).toBe(60);
  expect(resolveVideoEditorPreviewFrameRate(60, '15')).toBe(15);
  expect(resolveVideoEditorPreviewFrameRate(24, '30')).toBe(24);
  expect(resolveVideoEditorPreviewFrameRate(29.97, 'project')).toBe(29.97);
});
