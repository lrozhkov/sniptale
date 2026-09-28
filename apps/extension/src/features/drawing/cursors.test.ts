import { expect, it } from 'vitest';
import { resolveDrawingToolCursor } from './cursors';

it('keeps the gesture origin clear while showing arrow direction and the blur region', () => {
  for (const [tool, fromTip] of [
    ['arrow', false],
    ['arrow', true],
    ['blur', false],
  ] as const) {
    const cursor = resolveDrawingToolCursor(tool, fromTip);
    const svg = decodeURIComponent(cursor);
    expect(cursor).toContain(') 5 5, crosshair');
    expect(svg).toContain('viewBox="0 0 32 32"');
    expect(svg).toContain('M5 0v3m0 4v3M0 5h3m4 0h3');
  }
  for (const fromTip of [false, true]) {
    expect(decodeURIComponent(resolveDrawingToolCursor('arrow', fromTip))).toContain(
      'M27 27 14 14m0 8v-8h8'
    );
  }
  expect(decodeURIComponent(resolveDrawingToolCursor('arrow'))).not.toContain('stroke="#2563eb"');
  expect(decodeURIComponent(resolveDrawingToolCursor('arrow', true))).toContain('stroke="#2563eb"');
  expect(decodeURIComponent(resolveDrawingToolCursor('blur'))).toContain(
    '<rect x="13" y="14" width="15" height="13"'
  );
  expect(resolveDrawingToolCursor('arrow')).not.toBe(resolveDrawingToolCursor('arrow', true));
  expect(resolveDrawingToolCursor('pencil')).toContain(') 4 20, crosshair');
  expect(resolveDrawingToolCursor('marker')).toContain(') 4 20, crosshair');
  expect(resolveDrawingToolCursor('shape')).toBe('crosshair');
  expect(resolveDrawingToolCursor('text')).toBe('text');
  expect(resolveDrawingToolCursor('select')).toBe('default');
});
