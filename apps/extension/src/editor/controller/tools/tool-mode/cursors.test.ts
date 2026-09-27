import { expect, it } from 'vitest';
import { resolveEditorToolCursor } from './cursors';

it('anchors compact tool art at the precise gesture origin', () => {
  const expected = [
    ['pencil', false, '4 20', 'M4 20'],
    ['marker', false, '4 20', 'm4 20'],
    ['arrow', false, '12 4', 'M12 4v16'],
    ['arrow', true, '12 20', 'M12 4v16'],
    ['blur', false, '12 20', 'M12 3'],
  ] as const;
  for (const [tool, fromTip, hotspot, art] of expected) {
    const cursor = resolveEditorToolCursor(tool, fromTip);
    expect(cursor).toContain(`) ${hotspot}, crosshair`);
    expect(decodeURIComponent(cursor)).toContain(art);
  }
  expect(resolveEditorToolCursor('text')).toBe('text');
  expect(resolveEditorToolCursor('select')).toBe('default');
  expect(decodeURIComponent(resolveEditorToolCursor('arrow', true))).toContain('cy="20"');
  for (const tool of ['crop', 'frame-annotation', 'image', 'shape', 'step'] as const) {
    expect(resolveEditorToolCursor(tool)).toBe('crosshair');
  }
});
