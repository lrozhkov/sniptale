import { expect, it } from 'vitest';
import { mapFittedMediaFramePointToSource, mapSourcePointToFittedMediaFrame } from './fitted-media';

it('maps source cursor coordinates through contain, cover, stretch, and source-100 frames', () => {
  const frame = { height: 100, width: 100, x: 10, y: 20 };

  expect(
    mapSourcePointToFittedMediaFrame({
      fitMode: 'CONTAIN',
      frame,
      point: { x: 50, y: 25 },
      sourceHeight: 50,
      sourceWidth: 100,
    })
  ).toEqual({ x: 60, y: 70 });
  expect(
    mapSourcePointToFittedMediaFrame({
      fitMode: 'COVER',
      frame,
      point: { x: 50, y: 25 },
      sourceHeight: 50,
      sourceWidth: 100,
    })
  ).toEqual({ x: 60, y: 70 });
  expect(
    mapSourcePointToFittedMediaFrame({
      fitMode: 'STRETCH',
      frame,
      point: { x: 50, y: 25 },
      sourceHeight: 50,
      sourceWidth: 100,
    })
  ).toEqual({ x: 60, y: 70 });
  expect(
    mapFittedMediaFramePointToSource({
      fitMode: 'SOURCE_100',
      frame,
      point: { x: 60, y: 70 },
      sourceHeight: 50,
      sourceWidth: 100,
    })
  ).toEqual({ x: 50, y: 25 });
});

it('round-trips normalized points through rotation and anisotropic transition scaling', async () => {
  const { mapSourceNormalizedPointToVisualLayer, mapVisualLayerPointToSourceNormalized } =
    await import('./fitted-media');
  const geometry = {
    fitMode: 'CONTAIN' as const,
    frame: { x: 20, y: 40, width: 200, height: 100, rotation: 90 },
    sourceWidth: 400,
    sourceHeight: 200,
    renderState: { translateX: 10, translateY: -5, scaleX: 2, scaleY: 0.5 },
  };
  const source = { x: 0.75, y: 0.25 };
  const point = mapSourceNormalizedPointToVisualLayer({ ...geometry, point: source });
  expect(point?.x).toBeCloseTo(180);
  expect(point?.y).toBeCloseTo(110);
  expect(point).not.toBeNull();
  if (!point) return;
  const restored = mapVisualLayerPointToSourceNormalized({ ...geometry, point });
  expect(restored?.x).toBeCloseTo(source.x);
  expect(restored?.y).toBeCloseTo(source.y);
});

it('rejects cropped source points, letterbox clicks and degenerate transforms', async () => {
  const { mapSourceNormalizedPointToVisualLayer, mapVisualLayerPointToSourceNormalized } =
    await import('./fitted-media');
  const geometry = {
    fitMode: 'COVER' as const,
    frame: { x: 10, y: 20, width: 100, height: 100, rotation: 0 },
    sourceWidth: 400,
    sourceHeight: 200,
    renderState: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
  };
  expect(
    mapSourceNormalizedPointToVisualLayer({ ...geometry, point: { x: 0.05, y: 0.5 } })
  ).toBeNull();
  expect(
    mapVisualLayerPointToSourceNormalized({
      ...geometry,
      fitMode: 'CONTAIN',
      point: { x: 50, y: 22 },
    })
  ).toBeNull();
  expect(
    mapVisualLayerPointToSourceNormalized({
      ...geometry,
      renderState: { ...geometry.renderState, scaleX: 0 },
      point: { x: 60, y: 70 },
    })
  ).toBeNull();
});
