import { expect, it, vi } from 'vitest';
import { computeQuickEditSceneLayout } from '../../features/video/review/advanced/scene';
import { createQuickEditAdvancedState } from '../../features/video/review/advanced/defaults';
import { paintZoomPreview } from './zoom-preview-paint';

it('projects the visible crop back through the actual off-center camera transform', () => {
  const background = createQuickEditAdvancedState().background;
  const camera = { scale: 2, centerX: 0.25, centerY: 0.75 };
  const layout = computeQuickEditSceneLayout({
    output: { width: 480, height: 270 },
    source: { width: 480, height: 270 },
    background,
    camera,
  });
  const context = {
    clearRect: vi.fn(),
    fillRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    rect: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    strokeRect: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  };
  paintZoomPreview(context as unknown as CanvasRenderingContext2D, {
    accent: '#ffffff',
    camera,
    frame: null,
    height: 270,
    width: 480,
    layout,
    view: 'area',
  });
  expect(context.strokeRect).toHaveBeenCalledWith(0, 135, 240, 135);
});

it.each(['fixed', 'follow-video'] as const)(
  'uses the %s video clip in the zoom result thumbnail',
  (zoomBehavior) => {
    const background = {
      enabled: true as const,
      type: 'solid' as const,
      color: '#000000ff',
      zoomBehavior,
      layout: { padding: 0, cornerRadius: 10 },
    };
    const camera = { scale: 2, centerX: 0.5, centerY: 0.5 };
    const layout = computeQuickEditSceneLayout({
      output: { width: 480, height: 270 },
      source: { width: 480, height: 270 },
      camera,
      background,
    });
    const context = {
      clearRect: vi.fn(),
      save: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      fillRect: vi.fn(),
      restore: vi.fn(),
      strokeRect: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    };
    paintZoomPreview(context as unknown as CanvasRenderingContext2D, {
      accent: '#ffffff',
      camera,
      frame: null,
      height: 270,
      width: 480,
      layout,
      view: 'result',
      background,
      cornerRadius: 10,
    });
    expect(context.roundRect).toHaveBeenCalledWith(
      ...(zoomBehavior === 'fixed' ? [0, 0, 480, 270, 10] : [-240, -135, 960, 540, 20])
    );
  }
);

it('omits editor chrome without changing source painting when a DOM frame owns it', () => {
  const camera = { scale: 2, centerX: 0.5, centerY: 0.5 };
  const layout = computeQuickEditSceneLayout({
    output: { width: 480, height: 270 },
    source: { width: 480, height: 270 },
    background: createQuickEditAdvancedState().background,
    camera,
  });
  const context = {
    clearRect: vi.fn(),
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    drawImage: vi.fn(),
    strokeRect: vi.fn(),
    arc: vi.fn(),
  };
  const image = {} as CanvasImageSource;
  paintZoomPreview(context as unknown as CanvasRenderingContext2D, {
    accent: '#ffffff',
    camera,
    layout,
    width: 480,
    height: 270,
    view: 'area',
    showControls: false,
    frame: { image, width: 480, height: 270 },
  });
  expect(context.drawImage).toHaveBeenCalledWith(image, 0, 0, 480, 270);
  expect(context.strokeRect).not.toHaveBeenCalled();
  expect(context.arc).not.toHaveBeenCalled();
});

it.each(['fixed', 'follow-video'] as const)(
  'aligns %s Area, center and Result with the clamped camera at padded scene edges',
  (zoomBehavior) => {
    const background = {
      enabled: true as const,
      type: 'solid' as const,
      color: '#123456ff',
      zoomBehavior,
      layout: { padding: 60, cornerRadius: 0 },
    };
    const camera = { scale: 1.25, centerX: 0.1, centerY: 0.9 };
    const layout = computeQuickEditSceneLayout({
      output: { width: 480, height: 480 },
      source: { width: 480, height: 480 },
      camera,
      background,
    });
    const context = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      strokeRect: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    };
    const image = {} as CanvasImageSource;
    const args = {
      accent: '#ffffff',
      camera,
      frame: { image, width: 480, height: 480 },
      width: 480,
      height: 480,
      layout,
      background,
    };
    paintZoomPreview(context as unknown as CanvasRenderingContext2D, { ...args, view: 'area' });
    const follows = zoomBehavior === 'follow-video';
    expect(context.strokeRect).toHaveBeenCalledWith(
      ...(follows ? [12, 84, 384, 384] : [60, 132, 288, 288])
    );
    expect(context.arc).toHaveBeenCalledWith(204, 276, 3, 0, Math.PI * 2);
    paintZoomPreview(context as unknown as CanvasRenderingContext2D, { ...args, view: 'result' });
    expect(context.drawImage).toHaveBeenLastCalledWith(image, 60, -30, 450, 450);
    expect(context.roundRect).toHaveBeenLastCalledWith(
      ...(follows ? [60, -30, 450, 450, 0] : [60, 60, 360, 360, 0])
    );
  }
);

it.each([false, true])(
  'keeps the inspector padded plane independent of output and cleans a failed frame=%s',
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
    const planeContext = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      translate: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      globalAlpha: 1,
      drawImage: vi.fn(() => {
        if (failure) throw new Error('frame failed');
      }),
    };
    const target = { clearRect: vi.fn() };
    const canvas = { width: 873, height: 637 } as HTMLCanvasElement;
    const surface = vi.fn(() => ({
      canvas,
      context: planeContext as unknown as CanvasRenderingContext2D,
    }));
    const draw = vi.fn();
    const paint = () =>
      paintZoomPreview(target as unknown as CanvasRenderingContext2D, {
        ...output,
        background,
        camera,
        layout,
        view: 'result',
        previewScale: 0.5,
        accent: '#fff',
        cornerRadius: 12,
        frame: { image: {} as CanvasImageSource, ...output },
        spatialRenderer: { surface, draw, dispose: vi.fn() },
      });
    if (failure) expect(paint).toThrow('frame failed');
    else paint();
    expect(surface).toHaveBeenCalledWith('plane', 873, 637);
    expect(planeContext.translate).toHaveBeenCalledWith(116, 118);
    expect(planeContext.restore.mock.calls.length).toBe(planeContext.save.mock.calls.length);
    if (failure) expect(draw).not.toHaveBeenCalled();
    else
      expect(draw).toHaveBeenCalledWith(
        target,
        expect.objectContaining({
          source: canvas,
          sourceRect: { x: -116, y: -118, width: 873, height: 637 },
          output,
          base: layout.windowRect,
          frame: spatial,
        })
      );
  }
);
