import { expect, it } from 'vitest';
import { resolveDrawingToolCursor } from './cursors';

it('uses the same contact point for SVG cursor art and its CSS hotspot', () => {
  const expected = [
    ['pencil', false, '4 20', 'M4 20'],
    ['marker', false, '4 20', 'm4 20'],
    ['arrow', false, '12 4', 'M12 4v16'],
    ['arrow', true, '12 20', 'M12 4v16'],
    ['blur', false, '12 20', 'M12 3'],
  ] as const;

  for (const [tool, fromTip, hotspot, art] of expected) {
    const cursor = resolveDrawingToolCursor(tool, fromTip);
    expect(cursor).toContain(`) ${hotspot}, crosshair`);
    expect(decodeURIComponent(cursor)).toContain(art);
  }
  expect(decodeURIComponent(resolveDrawingToolCursor('arrow'))).toContain('cy="4"');
  expect(decodeURIComponent(resolveDrawingToolCursor('arrow', true))).toContain('cy="20"');
  expect(resolveDrawingToolCursor('shape')).toBe('crosshair');
  expect(resolveDrawingToolCursor('text')).toBe('text');
  expect(resolveDrawingToolCursor('select')).toBe('default');
});
