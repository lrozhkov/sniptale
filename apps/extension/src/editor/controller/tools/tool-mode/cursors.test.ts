import { expect, it } from 'vitest';
import { resolveDrawingToolCursor } from '../../../../features/drawing/public';
import { resolveEditorToolCursor } from './cursors';

it('uses the shared drawing cursors in the editor', () => {
  for (const tool of ['pencil', 'marker', 'arrow', 'blur'] as const) {
    expect(resolveEditorToolCursor(tool)).toBe(resolveDrawingToolCursor(tool));
  }
  expect(resolveEditorToolCursor('arrow', true)).toBe(resolveDrawingToolCursor('arrow', true));
  expect(resolveEditorToolCursor('text')).toMatch(/7 8, text$/);
  expect(resolveEditorToolCursor('select')).toBe('default');
  for (const tool of ['crop', 'frame-annotation', 'image', 'step'] as const) {
    expect(resolveEditorToolCursor(tool)).toBe('crosshair');
  }
});

it.each(['text', 'shape', 'simplify'] as const)(
  'provides explicit contrasting artwork for %s on the gray image workspace',
  (tool) => {
    const cursor = resolveEditorToolCursor(tool);
    expect(cursor).toMatch(/^url\("data:image\/svg\+xml,/);
    const svg = decodeURIComponent(cursor);
    expect(svg).toContain('stroke="#fff"');
    expect(svg).toContain('stroke="#171717"');
    expect(svg).not.toContain('opacity=');
  }
);
