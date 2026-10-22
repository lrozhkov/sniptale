import {
  mapWindowNormalizedPointToVisualLayer,
  mapVisualLayerPointToWindowNormalized,
  getFittedMediaWindowFrame,
  type VisualLayerSourcePointMapping,
} from './fitted-media';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { expect, it, vi } from 'vitest';
import * as bufferPool from '../canvas/buffer-pool';
import { createVisualTestContext } from './visual.test-support';
import { drawFittedMediaLayer } from './fitted-media';
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

it('maps decorated windows through crop, fit and affine transitions without source mirroring', () => {
  const params: VisualLayerSourcePointMapping = {
    point: { x: 0.2, y: 0.1 },
    frame: { x: 50, y: 80, width: 320, height: 180, rotation: 37 },
    sourceWidth: 160,
    sourceHeight: 90,
    fitMode: 'CONTAIN',
    sourceCrop: { x: 0.25, y: 0, width: 0.5, height: 1 },
    windowHeader: { ...DEFAULT_WINDOW_HEADER, title: 'Header' },
    renderState: { translateX: 19, translateY: -8, scaleX: 0.7, scaleY: 1.3 },
  };
  const mapped = mapWindowNormalizedPointToVisualLayer(params)!;
  expect(mapped).not.toBeNull();
  const inverse = mapVisualLayerPointToWindowNormalized({ ...params, point: mapped })!;
  expect(inverse.x).toBeCloseTo(params.point.x, 7);
  expect(inverse.y).toBeCloseTo(params.point.y, 7);
  expect(mapWindowNormalizedPointToVisualLayer({ ...params, mirrored: true })).toEqual(mapped);
  const plain = {
    ...params,
    frame: { ...params.frame, rotation: 0 },
    renderState: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
    point: { x: 0, y: 0 },
  };
  const window = getFittedMediaWindowFrame(plain);
  expect(mapWindowNormalizedPointToVisualLayer(plain)).toEqual({ x: window.x, y: window.y });
  const outside = mapVisualLayerPointToWindowNormalized({
    ...plain,
    point: { x: window.x - window.width, y: window.y },
  });
  expect(outside?.x).toBeCloseTo(-1, 7);
  expect(
    mapVisualLayerPointToWindowNormalized({
      ...params,
      renderState: { ...params.renderState, scaleX: 0 },
    })
  ).toBeNull();
});

it.each([1, 2, 100])('keeps header and source coordinates stable at device scale %s', (density) => {
  const destination = createVisualTestContext();
  const plane = createVisualTestContext();
  Object.assign(destination, { getTransform: () => ({ a: density, b: 0, c: 0, d: density }) });
  Object.assign(plane, { setTransform: vi.fn(), clearRect: vi.fn(), reset: vi.fn() });
  const scratch = Object.assign(plane.canvas, { width: 0, height: 0, getContext: () => plane });
  const release = vi.fn();
  const acquire = vi
    .spyOn(bufferPool, 'acquireVideoCompositionBuffer')
    .mockImplementation((width, height) => {
      scratch.width = width;
      scratch.height = height;
      return { canvas: scratch, release };
    });
  const render = vi.fn();
  const header = { naturalHeight: 20 } as HTMLImageElement;
  try {
    drawFittedMediaLayer({
      context: destination,
      frame: { x: 10, y: 20, width: 200, height: 100 },
      fitMode: 'STRETCH',
      sourceWidth: 200,
      sourceHeight: 80,
      displayScale: 1,
      shadowIntensity: 0,
      shadowMode: undefined,
      windowHeaderImage: header,
      render,
    });
    const expectedWidth = Math.min(200 * density, 4096);
    expect(acquire).toHaveBeenCalledWith(
      expectedWidth,
      expectedWidth / 2,
      destination.canvas.ownerDocument
    );
    // The 4096-pixel cap rounds the header join by less than 0.025 composition pixels.
    expect(render).toHaveBeenCalledWith(
      10,
      expect.closeTo(40, 1),
      200,
      expect.closeTo(80, 1),
      plane
    );
    expect(destination.drawImage).toHaveBeenCalledWith(scratch, 10, 20, 200, 100);
    expect(plane.drawImage).toHaveBeenCalledWith(
      header,
      0,
      0,
      expectedWidth,
      Math.round(expectedWidth / 10)
    );
    expect(release).toHaveBeenCalledOnce();
  } finally {
    acquire.mockRestore();
  }
});

it('releases the header surface after source rendering fails', () => {
  const context = createVisualTestContext();
  const plane = createVisualTestContext();
  Object.assign(plane, { setTransform: vi.fn(), clearRect: vi.fn() });
  const release = vi.fn();
  const acquire = vi.spyOn(bufferPool, 'acquireVideoCompositionBuffer').mockReturnValue({
    canvas: Object.assign(plane.canvas, { getContext: () => plane }),
    release,
  });
  try {
    expect(() =>
      drawFittedMediaLayer({
        context,
        frame: { x: 0, y: 0, width: 200, height: 100 },
        fitMode: 'STRETCH',
        sourceWidth: 200,
        sourceHeight: 80,
        displayScale: 1,
        shadowIntensity: 0,
        shadowMode: undefined,
        windowHeaderImage: { naturalHeight: 20 } as HTMLImageElement,
        hideWindowHeader: true,
        render: () => {
          throw new Error('source failure');
        },
      })
    ).toThrow('source failure');
    expect(plane.drawImage).not.toHaveBeenCalled();
    expect(release).toHaveBeenCalledOnce();
  } finally {
    acquire.mockRestore();
  }
});

it('rejects invalid window mapping and maps circular window coordinates independently of source crop', () => {
  const mapping: VisualLayerSourcePointMapping = {
    fitMode: 'CONTAIN',
    frame: { x: 0, y: 0, width: 200, height: 100, rotation: 0 },
    sourceWidth: 200,
    sourceHeight: 100,
    point: { x: 0, y: 0 },
    renderState: { translateX: 0, translateY: 0, scaleX: 1, scaleY: 1 },
    cameraAppearance: { shape: 'circle', roundness: 50, zoom: 1, panX: 0, panY: 0 },
  };
  expect(mapWindowNormalizedPointToVisualLayer(mapping)).toEqual({ x: 50, y: 0 });
  expect(mapVisualLayerPointToWindowNormalized({ ...mapping, point: { x: 150, y: 100 } })).toEqual({
    x: 1,
    y: 1,
  });
  for (const invalid of [
    { ...mapping, sourceWidth: 0 },
    { ...mapping, renderState: { ...mapping.renderState, scaleX: 0 } },
  ]) {
    expect(mapWindowNormalizedPointToVisualLayer(invalid)).toBeNull();
    expect(mapVisualLayerPointToWindowNormalized(invalid)).toBeNull();
  }
});

it.each(['CONTAIN', 'STRETCH'] as const)(
  'retains Gallery cropped header geometry and draw coordinates through %s',
  async (fitMode) => {
    const { computeQuickEditSceneSize, computeQuickEditSceneLayout } =
      await import('../../review/advanced/scene');
    const { getFittedMediaContentFrame } = await import('./fitted-media');
    const source = { width: 1920, height: 1080 };
    const windowHeader = {
      ...DEFAULT_WINDOW_HEADER,
      kind: 'browser' as const,
      style: 'windows' as const,
    };
    const scene = {
      source,
      canvas: { width: 960, height: 1080, crop: { x: 0.25, y: 0, width: 0.5, height: 1 } },
      windowHeader,
      background: { enabled: false as const },
    };
    const output = computeQuickEditSceneSize(scene);
    const layout = computeQuickEditSceneLayout({
      ...scene,
      output,
      camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
    });
    expect(output).toEqual({ width: 960, height: 1132, headerHeight: 52 });
    const params = {
      sourceWidth: source.width,
      sourceHeight: source.height,
      sourceCrop: scene.canvas.crop,
      windowHeader,
      fitMode,
      frame: layout.windowRect,
    };
    expect(getFittedMediaWindowFrame(params)).toEqual(layout.windowRect);
    expect(getFittedMediaContentFrame(params)).toEqual(layout.videoRect);
    const context = createVisualTestContext(),
      plane = createVisualTestContext();
    Object.assign(plane, { setTransform: vi.fn(), clearRect: vi.fn() });
    const release = vi.fn();
    const acquire = vi.spyOn(bufferPool, 'acquireVideoCompositionBuffer').mockReturnValue({
      canvas: Object.assign(plane.canvas, { getContext: () => plane }),
      release,
    });
    const render = vi.fn();
    try {
      drawFittedMediaLayer({
        ...params,
        context,
        displayScale: 1,
        shadowIntensity: 0,
        shadowMode: undefined,
        windowHeaderImage: { naturalHeight: 103.2 } as HTMLImageElement,
        render,
      });
      expect(render).toHaveBeenCalledWith(-480, 52, 1920, 1080, plane, layout.visibleVideoRect);
      expect(plane.drawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 960, 52);
      expect(release).toHaveBeenCalledOnce();
    } finally {
      acquire.mockRestore();
    }
  }
);

it.each([
  [1000, 1080, 0, 1],
  [601, 811, 12.25, 0.53],
  [640, 360, 24, 0.25],
  [1920, 1080, 64, 1],
])(
  'matches Gallery fractional canvas %sx%s padding%s at display scale%s',
  async (width, height, padding, displayScale) => {
    const { computeQuickEditSceneSize, computeQuickEditSceneLayout } =
      await import('../../review/advanced/scene');
    const { getFittedMediaContentFrame } = await import('./fitted-media');
    const scene = {
      source: { width: 1920, height: 1080 },
      canvas: { width, height, crop: { x: 0.25, y: 0.1, width: 0.5, height: 0.8 } },
      windowHeader: DEFAULT_WINDOW_HEADER,
      background: {
        enabled: true as const,
        type: 'solid' as const,
        color: '#123456',
        layout: { padding, cornerRadius: 12 },
      },
    };
    const size = computeQuickEditSceneSize(scene);
    const layout = computeQuickEditSceneLayout({
      ...scene,
      output: { width: size.width * displayScale, height: size.height * displayScale },
      camera: { scale: 1, centerX: 0.5, centerY: 0.5 },
    });
    const params = {
      sourceWidth: 1920,
      sourceHeight: 1080,
      displayScale,
      windowHeader: scene.windowHeader,
      ...(layout.sourceCrop ? { sourceCrop: layout.sourceCrop } : {}),
      frame: layout.windowRect,
      fitMode: 'CONTAIN' as const,
    };
    const window = getFittedMediaWindowFrame(params),
      content = getFittedMediaContentFrame(params);
    for (const axis of ['x', 'y', 'width', 'height'] as const) {
      expect(window[axis]).toBeCloseTo(layout.windowRect[axis], 7);
      expect(content[axis]).toBeCloseTo(layout.videoRect[axis], 7);
    }
  }
);

it.each([0, 90, -35])(
  'inverts original decorated window coordinates after crop and rotation %s',
  (rotation) => {
    const mapping: VisualLayerSourcePointMapping = {
      coordinateSpace: 'source-window',
      point: { x: 0.2, y: 0.3 },
      frame: { x: 40, y: 30, width: 200, height: 120, rotation },
      renderState: { scaleX: 0.8, scaleY: 1.2, translateX: 7, translateY: -9 },
      fitMode: 'STRETCH',
      sourceWidth: 640,
      sourceHeight: 360,
      sourceCrop: { x: 0.1, y: 0.2, width: 0.7, height: 0.6 },
      windowHeader: DEFAULT_WINDOW_HEADER,
    };
    const displayed = mapWindowNormalizedPointToVisualLayer(mapping)!;
    const restored = mapVisualLayerPointToWindowNormalized({ ...mapping, point: displayed })!;
    expect(restored.x).toBeCloseTo(mapping.point.x, 9);
    expect(restored.y).toBeCloseTo(mapping.point.y, 9);
    const { coordinateSpace: _coordinateSpace, ...visible } = mapping;
    expect(mapWindowNormalizedPointToVisualLayer(visible)).not.toEqual(displayed);
  }
);
