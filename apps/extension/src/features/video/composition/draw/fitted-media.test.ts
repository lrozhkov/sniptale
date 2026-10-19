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

it.each([false, true])(
  'round-trips mirrored=%s normalized points through rotation and anisotropic transition scaling',
  async (mirrored) => {
    const { mapSourceNormalizedPointToVisualLayer, mapVisualLayerPointToSourceNormalized } =
      await import('./fitted-media');
    const geometry = {
      mirrored,
      fitMode: 'CONTAIN' as const,
      frame: { x: 20, y: 40, width: 200, height: 100, rotation: 90 },
      sourceWidth: 400,
      sourceHeight: 200,
      renderState: { translateX: 10, translateY: -5, scaleX: 2, scaleY: 0.5 },
    };
    const source = { x: 0.75, y: 0.25 };
    const point = mapSourceNormalizedPointToVisualLayer({ ...geometry, point: source });
    expect(point?.x).toBeCloseTo(180);
    expect(point?.y).toBeCloseTo(mirrored ? 60 : 110);
    expect(point).not.toBeNull();
    if (!point) return;
    const restored = mapVisualLayerPointToSourceNormalized({ ...geometry, point });
    expect(restored?.x).toBeCloseTo(source.x);
    expect(restored?.y).toBeCloseTo(source.y);
  }
);

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

it.each([false, true])(
  'round-trips circle crop, mirrored=%s, rotation and transition scaling',
  async (mirrored) => {
    const { DEFAULT_CAMERA_APPEARANCE } = await import('../../project/camera/appearance');
    const {
      getFittedMediaContentFrame,
      mapSourceNormalizedPointToVisualLayer,
      mapVisualLayerPointToSourceNormalized,
    } = await import('./fitted-media');
    const geometry = {
      mirrored,
      cameraAppearance: {
        ...DEFAULT_CAMERA_APPEARANCE,
        shape: 'circle' as const,
        zoom: 1.5,
        panX: 0.2,
        panY: -0.1,
      },
      fitMode: 'STRETCH' as const,
      frame: { x: 20, y: 40, width: 200, height: 100, rotation: 90 },
      sourceWidth: 400,
      sourceHeight: 200,
      renderState: { translateX: 10, translateY: -5, scaleX: 2, scaleY: 0.5 },
    };
    expect(getFittedMediaContentFrame(geometry)).toEqual({
      x: 40,
      y: 17.5,
      width: 150,
      height: 150,
    });
    const point = mapSourceNormalizedPointToVisualLayer({ ...geometry, point: { x: 0.5, y: 0.5 } });
    expect(point?.x).toBeCloseTo(125, 8);
    expect(point?.y).toBeCloseTo(mirrored ? 87.5 : 82.5, 8);
    if (!point) throw new Error('Missing circle point');
    const restored = mapVisualLayerPointToSourceNormalized({ ...geometry, point });
    expect(restored?.x).toBeCloseTo(0.5, 8);
    expect(restored?.y).toBeCloseTo(0.5, 8);
    expect(
      mapSourceNormalizedPointToVisualLayer({ ...geometry, point: { x: 0, y: 0 } })
    ).toBeNull();
    expect(
      mapVisualLayerPointToSourceNormalized({
        ...geometry,
        frame: { ...geometry.frame, rotation: 0 },
        renderState: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
        point: { x: 70, y: 40 },
      })
    ).toBeNull();
  }
);

it.each(['CONTAIN', 'COVER', 'STRETCH', 'SOURCE_100', 'FIT_LONG_SIDE', 'FIT_SHORT_SIDE'] as const)(
  'projects original-source crop through %s with an independent rectangle oracle',
  async (fitMode) => {
    const {
      getFittedMediaContentFrame,
      mapSourceNormalizedPointToVisualLayer,
      mapVisualLayerPointToSourceNormalized,
    } = await import('./fitted-media');
    const crop = { x: 0.25, y: 0.1, width: 0.5, height: 0.8 };
    const geometry = {
      sourceCrop: crop,
      fitMode,
      frame: { x: 10, y: 20, width: 200, height: 100, rotation: 0 },
      sourceWidth: 400,
      sourceHeight: 200,
      renderState: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
    };
    const content = getFittedMediaContentFrame(geometry);
    const scale = fitMode === 'CONTAIN' ? 0.625 : fitMode === 'COVER' ? 1 : null;
    const visible = {
      width: scale === null ? 200 : 200 * scale,
      height: scale === null ? 100 : 160 * scale,
    };
    expect(content.width).toBeCloseTo(visible.width / crop.width, 9);
    expect(content.height).toBeCloseTo(visible.height / crop.height, 9);
    const center = mapSourceNormalizedPointToVisualLayer({
      ...geometry,
      point: { x: 0.5, y: 0.5 },
    });
    expect(center?.x).toBeCloseTo(110, 9);
    expect(center?.y).toBeCloseTo(70, 9);
    const restored = mapVisualLayerPointToSourceNormalized({ ...geometry, point: center! });
    expect(restored?.x).toBeCloseTo(0.5, 9);
    expect(restored?.y).toBeCloseTo(0.5, 9);
    expect(
      mapSourceNormalizedPointToVisualLayer({ ...geometry, point: { x: 0.1, y: 0.5 } })
    ).toBeNull();
    expect(
      mapVisualLayerPointToSourceNormalized({ ...geometry, point: { x: 0, y: 70 } })
    ).toBeNull();
  }
);
it('passes full source and visible crop bounds to the renderer and restores a failed draw', async () => {
  const { drawFittedMediaLayer } = await import('./fitted-media');
  const calls: unknown[][] = [];
  let saves = 0;
  const context = {
    save() {
      saves++;
    },
    restore() {
      saves--;
    },
    beginPath() {},
    rect() {},
    clip() {},
  } as unknown as CanvasRenderingContext2D;
  const params = {
    context,
    displayScale: 1,
    fitMode: 'STRETCH' as const,
    frame: { x: 10, y: 20, width: 200, height: 100 },
    sourceWidth: 400,
    sourceHeight: 200,
    sourceCrop: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 },
    shadowIntensity: 0,
    shadowMode: undefined,
  };
  drawFittedMediaLayer({
    ...params,
    render: (...args) => {
      calls.push(args);
    },
  });
  expect(calls[0]).toEqual([-90, 7.5, 400, 125, context, params.frame]);
  expect(saves).toBe(0);
  expect(() =>
    drawFittedMediaLayer({
      ...params,
      render: () => {
        throw new Error('Decode failed');
      },
    })
  ).toThrow('Decode failed');
  expect(saves).toBe(0);
});

it.each(['CONTAIN', 'COVER', 'STRETCH'] as const)(
  'rejects rounded %s corners in forward and inverse source geometry',
  async (fitMode) => {
    const {
      getFittedMediaContentFrame,
      getFittedMediaWindowFrame,
      mapSourceNormalizedPointToVisualLayer,
      mapVisualLayerPointToSourceNormalized,
    } = await import('./fitted-media');
    const mapping = {
      fitMode,
      windowCornerRadius: 40,
      frame: { x: 20, y: 40, width: 200, height: 200, rotation: 0 },
      sourceWidth: 400,
      sourceHeight: 200,
      renderState: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
    };
    const window = getFittedMediaWindowFrame(mapping);
    expect(window).toEqual(
      fitMode === 'CONTAIN' ? { x: 20, y: 90, width: 200, height: 100 } : mapping.frame
    );
    const content = getFittedMediaContentFrame(mapping);
    const corner = { x: window.x + 1, y: window.y + 1 };
    const native = {
      x: (corner.x - content.x) / content.width,
      y: (corner.y - content.y) / content.height,
    };
    expect(mapSourceNormalizedPointToVisualLayer({ ...mapping, point: native })).toBeNull();
    expect(mapVisualLayerPointToSourceNormalized({ ...mapping, point: corner })).toBeNull();
    const center = mapSourceNormalizedPointToVisualLayer({ ...mapping, point: { x: 0.5, y: 0.5 } });
    expect(center).toEqual({ x: 120, y: 140 });
    expect(mapVisualLayerPointToSourceNormalized({ ...mapping, point: center! })).toEqual({
      x: 0.5,
      y: 0.5,
    });
  }
);

it('round-trips rounded crop points through rotation and anisotropic transitions', async () => {
  const { mapSourceNormalizedPointToVisualLayer, mapVisualLayerPointToSourceNormalized } =
    await import('./fitted-media');
  const mapping = {
    fitMode: 'CONTAIN' as const,
    windowCornerRadius: 4096,
    sourceCrop: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 },
    frame: { x: 20, y: 40, width: 200, height: 160, rotation: 37 },
    sourceWidth: 400,
    sourceHeight: 200,
    renderState: { translateX: 12, translateY: -5, scaleX: 0.7, scaleY: 1.3 },
  };
  const source = { x: 0.6, y: 0.5 };
  const scene = mapSourceNormalizedPointToVisualLayer({ ...mapping, point: source });
  expect(scene).not.toBeNull();
  const restored = mapVisualLayerPointToSourceNormalized({ ...mapping, point: scene! });
  expect(restored?.x).toBeCloseTo(source.x, 9);
  expect(restored?.y).toBeCloseTo(source.y, 9);
  expect(
    mapSourceNormalizedPointToVisualLayer({ ...mapping, point: { x: 0.251, y: 0.101 } })
  ).toBeNull();
});

it('clips normal fitted pixels at the scaled visible window and restores context after draw failure', async () => {
  const { vi } = await import('vitest');
  const { drawFittedMediaLayer } = await import('./fitted-media');
  const roundRect = vi.fn(),
    restore = vi.fn(),
    save = vi.fn();
  const context = { save, restore, beginPath: vi.fn(), roundRect, clip: vi.fn() };
  const render = vi.fn(() => {
    throw new Error('Source draw failed');
  });
  expect(() =>
    drawFittedMediaLayer({
      context: context as unknown as CanvasRenderingContext2D,
      fitMode: 'CONTAIN',
      frame: { x: 10, y: 20, width: 200, height: 200 },
      sourceWidth: 400,
      sourceHeight: 200,
      windowCornerRadius: 24,
      displayScale: 0.5,
      shadowIntensity: 0,
      shadowMode: undefined,
      render,
    })
  ).toThrow('Source draw failed');
  expect(roundRect).toHaveBeenCalledWith(10, 70, 200, 100, 12);
  expect(render).toHaveBeenCalledWith(10, 70, 200, 100);
  expect(save).toHaveBeenCalledTimes(1);
  expect(restore).toHaveBeenCalledTimes(1);
});
