import { expect, it } from 'vitest';
import { createDefaultRichShapeObject } from '../../../features/editor/document/rich-shape';
import { tryCreateRoughPath, tryCreateRoughPolyline } from './rough-try';

const style = {
  fill: '#ffffff',
  opacity: 1,
  shadow: null,
  stroke: '#f97316',
  strokeDashArray: undefined,
  strokeLineCap: 'round',
  strokeLineJoin: 'round',
  strokeWidth: 4,
} as const;

it('returns null for disabled rough path rendering', () => {
  const shape = createDefaultRichShapeObject();

  shape.rough = { ...shape.rough, enabled: false };

  expect(tryCreateRoughPath(shape, style as never, 'M 0 0 L 10 10', 0)).toBeNull();
});

it('returns null for disabled rough polyline rendering before point conversion', () => {
  const shape = createDefaultRichShapeObject();

  shape.rough = { ...shape.rough, enabled: false };

  expect(
    tryCreateRoughPolyline(
      shape,
      style as never,
      [
        { x: 0, y: 0 },
        { x: 10, y: 10 },
      ],
      false
    )
  ).toBeNull();
});
