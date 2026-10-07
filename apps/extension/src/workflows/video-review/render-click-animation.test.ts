import { expect, it, vi } from 'vitest';
import { drawReviewClicks } from './render-click-animation';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneCamera,
} from '../../features/video/review/advanced/scene';
import { DEFAULT_WINDOW_HEADER } from '../../features/browser-frame/header';

it.each(['fixed', 'follow-video'] as const)(
  'maps click to video rather than added header, with %s zoom',
  (zoomBehavior) => {
    const background = {
      enabled: true,
      type: 'solid',
      color: '#ffffffff',
      zoomBehavior,
      layout: { padding: 20, cornerRadius: 12 },
    } as const;
    const layout = computeQuickEditSceneLayout({
      source: { width: 640, height: 360 },
      output: { width: 640, height: 426 },
      windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser', title: '' },
      background,
      camera: { scale: 2, centerX: 0.5, centerY: 0.4 },
    });
    const motion = computeQuickEditSceneCamera(layout, background);
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      arc: vi.fn(),
      stroke: vi.fn(),
      globalAlpha: 1,
    };
    const clip = { rect: motion.windowClip, radius: 12 * motion.scale };
    drawReviewClicks(
      context as unknown as CanvasRenderingContext2D,
      [
        {
          effect: 'ripple',
          point: { x: 0.25, y: 0.5 },
          color: '#ffffffff',
          radius: 32,
          stroke: 2,
          opacity: 0.8,
        },
      ],
      layout.videoTransform,
      640,
      clip
    );
    expect(context.arc).toHaveBeenCalledWith(
      layout.videoTransform.x + layout.videoTransform.width * 0.25,
      layout.videoTransform.y + layout.videoTransform.height * 0.5,
      (32 * layout.videoTransform.width) / 640,
      0,
      2 * Math.PI
    );
    expect(context.roundRect).toHaveBeenCalledWith(
      clip.rect.x,
      clip.rect.y,
      clip.rect.width,
      clip.rect.height,
      clip.radius
    );
    expect(context.stroke).toHaveBeenCalledOnce();
    expect(context.restore).toHaveBeenCalledOnce();
  }
);

it('renders press and glow fills, and skips an empty frame without touching the canvas', () => {
  const gradient = { addColorStop: vi.fn() };
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    createRadialGradient: vi.fn(() => gradient),
  };
  const rect = { x: 0, y: 0, width: 100, height: 100 };
  const canvas = context as unknown as CanvasRenderingContext2D;
  drawReviewClicks(canvas, [], rect, 100, { rect, radius: 0 });
  expect(context.save).not.toHaveBeenCalled();
  drawReviewClicks(
    canvas,
    (['press', 'glow'] as const).map((effect) => ({
      effect,
      point: { x: 0.5, y: 0.5 },
      color: '#ff0000ff',
      radius: 20,
      stroke: 2,
      opacity: 0.5,
    })),
    rect,
    100,
    { rect, radius: 0 }
  );
  expect(context.fill).toHaveBeenCalledTimes(2);
  expect(context.createRadialGradient).toHaveBeenCalledOnce();
  expect(gradient.addColorStop).toHaveBeenCalledWith(1, 'transparent');
});
