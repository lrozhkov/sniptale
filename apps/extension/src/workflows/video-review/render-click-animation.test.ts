import { expect, it, vi } from 'vitest';
import { drawReviewClicks } from './render-click-animation';
import {
  computeQuickEditSceneLayout,
  computeQuickEditSceneCamera,
} from '../../features/video/review/advanced/scene';
import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';

it('paints the observed path and authored area in the fitted video while the held halo stays filled', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    clip: vi.fn(),
    moveTo: vi.fn(),
    lineTo: vi.fn(),
    strokeRect: vi.fn(),
    stroke: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
  };
  const video = { x: 20, y: 60, width: 320, height: 180 };
  drawReviewClicks(
    context as unknown as CanvasRenderingContext2D,
    [
      {
        effect: 'press',
        point: { x: 0.5, y: 0.5 },
        color: '#ffffffff',
        radius: 32,
        stroke: 2,
        opacity: 0.5,
        path: [
          { x: 0.1, y: 0.2 },
          { x: 0.5, y: 0.5 },
        ],
        area: { x: 0.25, y: 0.25, width: 0.5, height: 0.5 },
      },
    ],
    video,
    640,
    { rect: video, radius: 0 }
  );
  expect(context.moveTo).toHaveBeenCalledWith(52, 96);
  expect(context.lineTo).toHaveBeenCalledWith(180, 150);
  expect(context.strokeRect).toHaveBeenCalledWith(100, 105, 160, 90);
  expect(context.arc).toHaveBeenCalledWith(180, 150, 16, 0, Math.PI * 2);
  expect(context.stroke).toHaveBeenCalledOnce();
  expect(context.fill).toHaveBeenCalledOnce();
});

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

it.each(['circle', 'rounded'] as const)(
  'samples original video opaquely inside a %s lens and restores drawing state',
  (shape) => {
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      roundRect: vi.fn(),
      rect: vi.fn(),
      clip: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      globalAlpha: 0.3,
    };
    const draw = vi.fn(() => expect(context.globalAlpha).toBe(1));
    const video = { x: 20, y: 60, width: 640, height: 360 };
    const frame = {
      effect: 'magnify' as const,
      point: { x: 0.5, y: 0.5 },
      radius: 160,
      stroke: 2,
      color: '#fff',
      opacity: 0.8,
      lens: { scale: 2, shape, shadow: 20 },
    };
    drawReviewClicks(
      context as unknown as CanvasRenderingContext2D,
      [frame],
      video,
      640,
      { rect: video, radius: 12 },
      { rect: video, draw }
    );
    expect(draw).toHaveBeenCalledWith(context, -300, -120, 1280, 720);
    expect(context.rect).toHaveBeenCalledWith(20, 60, 640, 360);
    expect(context.save.mock.calls.length).toBe(context.restore.mock.calls.length);
    draw.mockClear();
    drawReviewClicks(
      context as unknown as CanvasRenderingContext2D,
      [{ ...frame, lens: { ...frame.lens, scale: 1 } }],
      video,
      640,
      { rect: video, radius: 0 },
      { rect: video, draw }
    );
    expect(draw).not.toHaveBeenCalled();
    draw.mockImplementationOnce(() => {
      throw new Error('source unavailable');
    });
    expect(() =>
      drawReviewClicks(
        context as unknown as CanvasRenderingContext2D,
        [frame],
        video,
        640,
        { rect: video, radius: 0 },
        { rect: video, draw }
      )
    ).toThrow('source unavailable');
    expect(context.save.mock.calls.length).toBe(context.restore.mock.calls.length);
  }
);

it('keeps the event center in video coordinates while sampling the whole decorated window', () => {
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    beginPath: vi.fn(),
    roundRect: vi.fn(),
    rect: vi.fn(),
    clip: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    stroke: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
  const draw = vi.fn();
  const video = { x: 20, y: 60, width: 640, height: 360 };
  const window = { x: 20, y: 0, width: 640, height: 420 };
  drawReviewClicks(
    context,
    [
      {
        effect: 'magnify',
        point: { x: 0.5, y: 0 },
        radius: 100,
        stroke: 0,
        color: '#00000000',
        opacity: 1,
        lens: { scale: 2, shape: 'circle', shadow: 0 },
      },
    ],
    video,
    640,
    { rect: window, radius: 12 },
    { rect: window, draw }
  );
  expect(context.arc).toHaveBeenCalledWith(340, 60, 100, 0, Math.PI * 2);
  expect(context.rect).toHaveBeenCalledWith(20, 0, 640, 420);
  expect(draw).toHaveBeenCalledWith(context, -300, -60, 1280, 840);
});
