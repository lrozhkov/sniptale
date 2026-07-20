import { expect, it } from 'vitest';
import type { EditorBrushSettings } from '../../../../features/editor/document/types';
import { EditorFreehandBrush } from './instance';
import { configureLiveFreehandBrush } from './live';

const settings: EditorBrushSettings = {
  color: '#ff0000',
  dynamicWidth: true,
  opacity: 1,
  shapeCorrection: 'off',
  shadow: 0,
  smoothingLevel: 6,
  width: 12,
};

it('owns live freehand brush instance reuse and settings application', () => {
  const canvas = { getZoom: () => 1 } as never;
  const brush = new EditorFreehandBrush(canvas);

  expect(configureLiveFreehandBrush(canvas, settings, brush)).toBe(brush);
  expect(brush.dynamicWidth).toBe(true);
  expect(brush.smoothingLevel).toBe(6);
  expect(brush.width).toBe(12);

  const replacement = configureLiveFreehandBrush(canvas, settings, null);
  expect(replacement).toBeInstanceOf(EditorFreehandBrush);
});
