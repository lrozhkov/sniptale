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
