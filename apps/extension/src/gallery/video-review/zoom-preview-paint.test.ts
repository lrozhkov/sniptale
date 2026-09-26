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
