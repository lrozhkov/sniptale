import { Line } from 'fabric';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  createDefaultRichShapeObject,
  type EditorBuiltInShapePolylineGeometry,
} from '../../../../features/editor/document/rich-shape';
import { resolveRichShapeRenderableStyle } from '../style/renderable';
import { createRoughPolylineBaseObjects } from './rough-base';

const mocks = vi.hoisted(() => ({
  tryCreateRoughPolyline: vi.fn(),
}));

vi.mock('../rough-rendering', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../rough-rendering')>()),
  tryCreateRoughPolyline: mocks.tryCreateRoughPolyline,
}));

function createPolylineGeometry(closed: boolean): EditorBuiltInShapePolylineGeometry {
  return {
    closed,
    points: [
      [0, 0],
      [30, 20],
    ] as const,
    type: 'polyline' as const,
    viewBox: { height: 20, minX: 0, minY: 0, width: 30 },
  };
}

function createRoughShape(closed: boolean) {
  const shape = createDefaultRichShapeObject({
    frame: { height: 20, left: 0, top: 0, width: 30 },
    rough: {
      ...createDefaultRichShapeObject().rough,
      enabled: true,
    },
    style: {
      ...createDefaultRichShapeObject().style,
      fill: {
        angle: 0,
        gradientType: 'linear',
        stops: [
          { color: '#fff', offset: 0, transparency: 0 },
          { color: '#000', offset: 1, transparency: 0 },
        ],
        type: 'gradient',
      },
    },
  });
  return {
    geometry: createPolylineGeometry(closed),
    shape,
    style: resolveRichShapeRenderableStyle(shape),
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.tryCreateRoughPolyline.mockReturnValue([new Line([0, 0, 30, 20])]);
});

it('owns rough polyline fallback without gradient backfill for open geometry', () => {
  const { geometry, shape, style } = createRoughShape(false);

  expect(
    createRoughPolylineBaseObjects({
      geometry,
      height: 20,
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 20 },
      ],
      shape,
      style,
      width: 30,
    })
  ).toHaveLength(1);
});

it('owns rough polyline gradient backfill for closed geometry', () => {
  const { geometry, shape, style } = createRoughShape(true);

  expect(
    createRoughPolylineBaseObjects({
      geometry,
      height: 20,
      points: [
        { x: 0, y: 0 },
        { x: 30, y: 20 },
      ],
      shape,
      style,
      width: 30,
    })
  ).toHaveLength(2);
});
