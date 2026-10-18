import { DEFAULT_WINDOW_HEADER } from '@sniptale/runtime-contracts/window-header';
import { expect, it, vi } from 'vitest';
import { computeQuickEditSceneLayout } from '../../features/video/review/advanced/scene';

it.each(['fixed', 'follow-video'] as const)(
  'draws one exterior-only shadow around header and video with %s zoom',
  async (zoomBehavior) => {
    const { drawReviewSceneShadow } = await import('./scene-shadow');
    const { computeQuickEditSceneCamera } =
      await import('../../features/video/review/advanced/scene');
    const background = {
      enabled: true,
      type: 'solid',
      color: '#ffffffff',
      zoomBehavior,
      layout: { padding: 40, cornerRadius: 24, shadow: { intensity: 60, color: '#47556980' } },
    } as const;
    const layout = computeQuickEditSceneLayout({
      source: { width: 640, height: 360 },
      output: { width: 640, height: 426 },
      background,
      windowHeader: { ...DEFAULT_WINDOW_HEADER, kind: 'browser' as const, title: '' },
      camera: { scale: 2, centerX: 0.4, centerY: 0.5 },
    });
    const motion = computeQuickEditSceneCamera(layout, background);
    const context = {
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      rect: vi.fn(),
      roundRect: vi.fn(),
      clip: vi.fn(),
      fill: vi.fn(),
      globalAlpha: 1,
    };
    drawReviewSceneShadow(
      context as unknown as CanvasRenderingContext2D,
      background,
      motion.windowClip,
      24 * motion.scale,
      0.5 * motion.scale
    );
    expect(context.clip).toHaveBeenCalledWith('evenodd');
    expect(context.roundRect).toHaveBeenCalledWith(
      motion.windowClip.x,
      motion.windowClip.y,
      motion.windowClip.width,
      motion.windowClip.height,
      Math.min(24 * motion.scale, motion.windowClip.width / 2, motion.windowClip.height / 2)
    );
    expect(context).toMatchObject({
      shadowColor: '#47556980',
      shadowBlur: 22.5 * motion.scale,
      globalAlpha: 0.6,
      shadowOffsetX: 0,
      shadowOffsetY: 0,
    });
    expect(context.restore).toHaveBeenCalledOnce();
  }
);

it('preserves the shadow contract when resolving scaled export layout', async () => {
  const { resolveReviewSceneOutput } = await import('./render-settings');
  const { VideoResolutionPreset } = await import('@sniptale/runtime-contracts/video/types/types');
  const shadow = { intensity: 40, color: '#ffffff00' };
  const background = {
    enabled: true,
    type: 'solid',
    color: '#ffffffff',
    layout: { padding: 40, cornerRadius: 24, shadow },
  } as const;
  const output = resolveReviewSceneOutput(
    { width: 1920, height: 1080 },
    { background },
    VideoResolutionPreset.P720
  );
  expect(output.scale).toBeCloseTo(2 / 3);
  expect(output.background.enabled && output.background.layout.shadow).toEqual(shadow);
});

it('pads the original scene for the full scaled shadow envelope with asymmetric integer bounds', async () => {
  const { reviewSpatialSourceRect } = await import('./scene-shadow');
  const output = { width: 641, height: 401 };
  const window = { x: -3.25, y: 12.5, width: 620.5, height: 360.25 };
  const background = {
    enabled: true,
    type: 'solid',
    color: '#ffffffff',
    layout: { padding: 4, cornerRadius: 12, shadow: { intensity: 80, color: '#000000ff' } },
  } as const;
  expect(reviewSpatialSourceRect({ output, window, background, sceneScale: 0.5 })).toEqual({
    x: -126,
    y: -110,
    width: 866,
    height: 605,
  });
  expect(
    reviewSpatialSourceRect({ output, window, background: { enabled: false }, sceneScale: 8 })
  ).toEqual({ x: 0, y: 0, ...output });
  expect(
    reviewSpatialSourceRect({
      output,
      window,
      background: {
        ...background,
        layout: { ...background.layout, shadow: { ...background.layout.shadow, intensity: 0 } },
      },
    })
  ).toEqual({ x: 0, y: 0, ...output });
});

it('reads no-shadow dimensions from canvas-style inherited accessors', async () => {
  const { reviewSpatialSourceRect } = await import('./scene-shadow');
  class CanvasSize {
    get width() {
      return 641;
    }
    get height() {
      return 401;
    }
  }
  expect(
    reviewSpatialSourceRect({
      output: new CanvasSize(),
      window: { x: 4, y: 4, width: 633, height: 393 },
      background: { enabled: false },
    })
  ).toEqual({ x: 0, y: 0, width: 641, height: 401 });
});
