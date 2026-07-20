import { expect, it, vi, type Mock } from 'vitest';
import { drawSweepOverlay, runWithMotionState, withRevealClip } from './motion';
import { resolveAnnotationSweepProfile } from '../../../project/annotation/sweep-profile';
import { VideoOverlayTemplateKind } from '../../../project/types/index';

function createContext() {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fillRect: vi.fn(),
    globalAlpha: 1,
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

it('skips motion transforms when the progress is not visible', () => {
  const context = createContext();
  const render = vi.fn();

  runWithMotionState(context, 0, 10, 12, {}, render);

  expect(render).not.toHaveBeenCalled();
  expect(context.save).not.toHaveBeenCalled();
});

it('applies alpha and transform before rendering visible motion parts', () => {
  const context = createContext();
  const render = vi.fn();

  runWithMotionState(context, 0.5, 10, 12, { scaleFrom: 0.9, translateY: 8 }, render);

  expect(context.save).toHaveBeenCalledTimes(1);
  expect(context.translate).toHaveBeenCalled();
  expect(context.scale).toHaveBeenCalledTimes(1);
  expect(context.globalAlpha).toBe(0.5);
  expect(render).toHaveBeenCalledTimes(1);
  expect(context.restore).toHaveBeenCalledTimes(1);
});

it('draws sweep overlays with a gradient-backed highlight band', () => {
  const context = createContext();

  drawSweepOverlay(
    context,
    240,
    80,
    10,
    12,
    0.6,
    0.3,
    resolveAnnotationSweepProfile(VideoOverlayTemplateKind.SHIMMER_LABEL, 'shimmer')
  );

  expect(context.createLinearGradient).toHaveBeenCalledTimes(1);
  expect(context.fillRect).toHaveBeenCalledWith(10, 12, 240, 80);
});

it('uses template sweep profiles to vary gradient width and angle', () => {
  const context = createContext();

  drawSweepOverlay(
    context,
    240,
    80,
    10,
    12,
    0.5,
    1,
    resolveAnnotationSweepProfile(VideoOverlayTemplateKind.THREE_D_REVEAL_CARD, 'gloss')
  );

  const gradientArgs = (context.createLinearGradient as unknown as Mock).mock.calls[0];
  expect(gradientArgs).toBeDefined();
  expect(gradientArgs?.[0]).not.toBe(gradientArgs?.[2]);
  expect(gradientArgs?.[1]).not.toBe(gradientArgs?.[3]);
});

it('clips reveal content to the visible height window', () => {
  const context = createContext();
  const render = vi.fn();

  withRevealClip(context, 0.5, 10, 12, 120, 40, render);

  expect(context.save).toHaveBeenCalledTimes(1);
  expect(context.beginPath).toHaveBeenCalledTimes(1);
  expect(context.rect).toHaveBeenCalledWith(10, 32, 120, 20);
  expect(context.clip).toHaveBeenCalledTimes(1);
  expect(render).toHaveBeenCalledTimes(1);
  expect(context.restore).toHaveBeenCalledTimes(1);
});

it('skips reveal rendering when the progress is zero', () => {
  const context = createContext();
  const render = vi.fn();

  withRevealClip(context, 0, 10, 12, 120, 40, render);

  expect(context.save).not.toHaveBeenCalled();
  expect(render).not.toHaveBeenCalled();
});
