import { expect, it } from 'vitest';
import { resolveDrawingToolCursor } from '../../../../features/drawing/public';
import { resolveEditorToolCursor } from './cursors';

it('uses the shared drawing cursors in the editor', () => {
  for (const tool of ['pencil', 'marker', 'arrow', 'blur'] as const) {
    expect(resolveEditorToolCursor(tool)).toBe(resolveDrawingToolCursor(tool));
  }
  expect(resolveEditorToolCursor('arrow', true)).toBe(resolveDrawingToolCursor('arrow', true));
  expect(resolveEditorToolCursor('text')).toBe('text');
  expect(resolveEditorToolCursor('select')).toBe('default');
  for (const tool of ['crop', 'frame-annotation', 'image', 'shape', 'step'] as const) {
    expect(resolveEditorToolCursor(tool)).toBe('crosshair');
  }
});
