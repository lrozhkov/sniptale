import { expect, it, vi } from 'vitest';
import { drawReviewSceneFrame } from './scene-frame';
import { computeQuickEditSceneLayout } from '../../features/video/review/advanced/scene';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';

it.each(['none', 'publish', 'background', 'overlay'] as const)(
  'forwards managed backing to real header/exposure helpers and releases on failure=%s',
  (fail) => {
    const makeContext = () =>
      ({
        save: vi.fn(),
        restore: vi.fn(),
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
      }) as unknown as CanvasRenderingContext2D;
    const leases: {
      role: string;
      canvas: HTMLCanvasElement;
      context: CanvasRenderingContext2D;
      release: ReturnType<typeof vi.fn>;
    }[] = [];
    const canvas = vi.fn((role: string, size: { width: number; height: number }) => {
      const lease = {
        role,
        canvas: { ...size } as HTMLCanvasElement,
        context: makeContext(),
        release: vi.fn(),
      };
      leases.push(lease);
      return lease;
    });
    const camera = { scale: 1, centerX: 0.5, centerY: 0.5 };
    const size = { width: 640, height: 378 };
    const background = { enabled: false as const };
    const layout = computeQuickEditSceneLayout({
      source: { width: 1920, height: 1080 },
      output: size,
      background,
      camera,
      windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser' },
    });
    const target = makeContext();
    if (fail === 'publish')
      vi.mocked(target.drawImage).mockImplementationOnce(() => {
        throw new Error('publish failed');
      });
    const overlays = vi.fn((raster: { image: CanvasImageSource } | null) => {
      expect(raster?.image).toBe(leases[0]!.canvas);
      expect(leases[0]!.release).not.toHaveBeenCalled();
      expect(raster).not.toHaveProperty('release');
      if (fail === 'overlay') throw new Error('overlay failed');
    });
    const draw = () =>
      drawReviewSceneFrame(target, {
        canvas: size,
        layout,
        background,
        image: null,
        headerImage: { width: 1920, height: 53 } as HTMLCanvasElement,
        sample: { draw: vi.fn() },
        resources: { canvas, bytes: vi.fn() },
        backgroundPainter:
          fail === 'background'
            ? {
                draw: () => {
                  throw new Error('background failed');
                },
              }
            : undefined,
        windowRasterBacking: size,
        drawOverlays: overlays,
        motionBlur: [
          { camera, alpha: 0.25 },
          { camera, alpha: 0.75 },
        ],
      });
    if (fail !== 'none') expect(draw).toThrow(`${fail} failed`);
    else draw();
    expect(leases.map((lease) => lease.role)).toEqual([
      'decorated-window',
      'motion-accumulator',
      'motion-sample',
    ]);
    expect(
      canvas.mock.calls.every(([, backing]) => backing.width === 640 && backing.height === 378)
    ).toBe(true);
    expect(leases.map((lease) => lease.release.mock.calls.length)).toEqual([1, 1, 1]);
    expect(overlays).toHaveBeenCalledTimes(fail === 'none' || fail === 'overlay' ? 1 : 0);
    if (fail === 'background') return;
    expect(leases[2]!.context.drawImage).toHaveBeenCalledWith(
      leases[0]!.canvas,
      0,
      0,
      640,
      378,
      expect.any(Number),
      expect.any(Number),
      expect.any(Number),
      expect.any(Number)
    );
  }
);

it.each(['ordinary', 'exposure', 'spatial'] as const)(
  'uses the retained background painter for %s without taking disposal ownership',
  async (mode) => {
    const { quickEditSpatialTargetCamera } =
      await import('../../features/video/review/advanced/spatial');
    const { DEFAULT_CAMERA_PERSPECTIVE: DEFAULT_QUICK_EDIT_PERSPECTIVE } =
      await import('../../features/video/project/motion/spatial');
    const { createQuickEditZoomRegion } = await import('../../features/video/review/advanced/zoom');
    const makeContext = () =>
      ({
        save: vi.fn(),
        restore: vi.fn(),
        setTransform: vi.fn(),
        clearRect: vi.fn(),
        drawImage: vi.fn(),
        fillRect: vi.fn(),
        beginPath: vi.fn(),
        rect: vi.fn(),
        clip: vi.fn(),
        translate: vi.fn(),
        scale: vi.fn(),
      }) as unknown as CanvasRenderingContext2D;
    const output = { width: 320, height: 180 };
    const background = { enabled: false as const };
    const region = {
      ...createQuickEditZoomRegion({ id: 'background', at: 0 }),
      perspective: { ...DEFAULT_QUICK_EDIT_PERSPECTIVE, enabled: mode === 'spatial', rotateY: 30 },
    };
    const camera = quickEditSpatialTargetCamera(region);
    const layout = computeQuickEditSceneLayout({ output, source: output, background, camera });
    const painter = { draw: vi.fn(), dispose: vi.fn() };
    const release = vi.fn();
    drawReviewSceneFrame(makeContext(), {
      canvas: output,
      layout,
      background,
      image: null,
      sample: { draw: vi.fn() },
      backgroundPainter: painter,
      resources: {
        canvas: (_role, size) => ({
          canvas: { ...size } as HTMLCanvasElement,
          context: makeContext(),
          release,
        }),
        bytes: vi.fn(),
      },
      spatialRenderer: {
        validateSizes: vi.fn(),
        surface: () => ({ canvas: { ...output } as HTMLCanvasElement, context: makeContext() }),
        draw: vi.fn(),
        dispose: vi.fn(),
      },
      motionBlur:
        mode === 'exposure'
          ? [
              { camera, alpha: 0.5 },
              { camera, alpha: 0.5 },
            ]
          : undefined,
    });
    expect(painter.draw).toHaveBeenCalledTimes(mode === 'exposure' ? 2 : 1);
    expect(painter.draw).toHaveBeenCalledWith(expect.anything(), {
      background: expect.objectContaining({ enabled: false }),
      image: null,
      width: 320,
      height: 180,
    });
    expect(painter.dispose).not.toHaveBeenCalled();
  }
);

it('zooms the joined header and video inside a fixed frame with one raster lease', () => {
  const makeContext = () =>
    ({
      save: vi.fn(),
      restore: vi.fn(),
      setTransform: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
    }) as unknown as CanvasRenderingContext2D;
  const output = { width: 320, height: 200 };
  const background = { enabled: false as const, zoomBehavior: 'content' as const };
  const camera = { scale: 2, centerX: 0.5, centerY: 0.5 };
  const layout = computeQuickEditSceneLayout({
    output,
    source: { width: 320, height: 180 },
    background,
    camera,
    windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser' },
  });
  const leases = new Map<
    string,
    { context: CanvasRenderingContext2D; release: ReturnType<typeof vi.fn> }
  >();
  const sample = {
    draw: vi.fn<
      (
        context: CanvasRenderingContext2D,
        x: number,
        y: number,
        width: number,
        height: number
      ) => void
    >(),
  };
  const headerImage = { width: 320, height: 20 } as HTMLCanvasElement;
  drawReviewSceneFrame(makeContext(), {
    canvas: output,
    layout,
    background,
    image: null,
    headerImage,
    sample,
    resources: {
      bytes: vi.fn(),
      canvas: (role, size) => {
        const lease = {
          canvas: { ...size } as HTMLCanvasElement,
          context: makeContext(),
          release: vi.fn(),
        };
        leases.set(role, lease);
        return lease;
      },
    },
    motionBlur: [
      { camera: { ...camera, scale: 1.5 }, alpha: 0.5 },
      { camera, alpha: 0.5 },
    ],
  });
  const plane = leases.get('decorated-window')!;
  expect(sample.draw).toHaveBeenCalledTimes(1);
  expect(plane.context.drawImage).toHaveBeenCalledTimes(1);
  const exposure = leases.get('motion-sample')!;
  const draws = vi.mocked(exposure.context.drawImage).mock.calls;
  expect(draws).toHaveLength(2);
  expect(draws[0]![7]).toBeLessThan(draws[1]![7] as number);
  expect(plane.context.clip).not.toHaveBeenCalled();
  expect([...leases.values()].map((lease) => lease.release.mock.calls.length)).toEqual([1, 1, 1]);
});

it.each(['success', 'sample-failure', 'projection-failure'] as const)(
  'keeps padded plane coordinates and balanced exposure state on %s',
  (failure) => {
    const output = { width: 641, height: 401 };
    const background = {
      enabled: true,
      type: 'solid',
      color: '#ffffffff',
      zoomBehavior: 'fixed',
      layout: { padding: 4, cornerRadius: 12, shadow: { intensity: 80, color: '#000000ff' } },
    } as const;
    const spatial = {
      rotation: [0, 0, 0, 1] as const,
      perspective: 1,
      windowMotion: 1,
      lockBackground: true,
      focus: [],
    };
    const camera = { scale: 2, centerX: 0.4, centerY: 0.5, spatial };
    const layout = computeQuickEditSceneLayout({ source: output, output, background, camera });
    const makeContext = () => ({
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      scale: vi.fn(),
      clearRect: vi.fn(),
      drawImage: vi.fn(),
      fillRect: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      globalAlpha: 1,
    });
    const contexts = new Map<string, ReturnType<typeof makeContext>>();
    const surface = vi.fn((kind: string, width: number, height: number) => {
      const context = makeContext();
      contexts.set(kind, context);
      return {
        canvas: { width, height } as HTMLCanvasElement,
        context: context as unknown as CanvasRenderingContext2D,
      };
    });
    const target = makeContext();
    const draw = vi.fn(() => {
      if (failure === 'projection-failure') throw new Error('projection');
    });
    const sample = vi.fn(() => {
      if (failure === 'sample-failure') throw new Error('sample');
    });
    const paint = () =>
      drawReviewSceneFrame(target as unknown as CanvasRenderingContext2D, {
        canvas: output,
        layout,
        background,
        image: null,
        sceneScale: 0.5,
        sample: { draw: sample },
        spatialRenderer: { validateSizes: vi.fn(), surface, draw, dispose: vi.fn() },
        motionBlur: [
          { camera, alpha: 0.5 },
          { camera, alpha: 0.5 },
        ],
      });
    if (failure === 'success') paint();
    else expect(paint).toThrow();
    const plane = surface.mock.calls.find(([kind]) => kind === 'plane')!;
    // Base padding + 120px shadow envelope, with the two-pixel filter margin; camera scale is excluded.
    expect(plane.slice(1)).toEqual([873, 637]);
    expect(contexts.get('plane')!.translate).toHaveBeenCalledWith(116, 118);
    for (const context of contexts.values())
      expect(context.restore.mock.calls.length).toBe(context.save.mock.calls.length);
    if (failure === 'sample-failure') expect(draw).not.toHaveBeenCalled();
    if (failure !== 'success') expect(target.drawImage).not.toHaveBeenCalled();
    if (failure === 'success') expect(draw).toHaveBeenCalledTimes(2);
  }
);
