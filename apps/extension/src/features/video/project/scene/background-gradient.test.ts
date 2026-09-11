import { expect, it, vi } from 'vitest';
import { getShowcaseGradient } from '../../../highlighter/showcase-resources';
import { parsePaint } from '@sniptale/foundation/paint';
import {
  getProjectSceneBackground,
  resolveSceneBackgroundFrame,
  syncProjectSceneBackground,
} from './background';
import { createSceneGradientBackground } from './background-gradient';
import { drawSceneGradient } from './background-gradient-canvas';
import type { VideoProjectGradientBackground } from '../types';

it('preserves canonical preset geometry, color space, stop identity and animation on normalization', () => {
  for (const id of ['system-ocean', 'system-radial-glow', 'system-conic-spectrum'] as const) {
    const background: VideoProjectGradientBackground = {
      kind: 'gradient',
      gradient: getShowcaseGradient(id),
      animation: { mode: 'breathe', speed: 42, intensity: 24 },
    };
    const project = syncProjectSceneBackground({ backgroundColor: '#000000' }, background);
    expect(getProjectSceneBackground(project)).toEqual(background);
  }
});

it('resolves animation deterministically without mutating authored geometry or colors', () => {
  const background = createSceneGradientBackground();
  background.animation = { mode: 'rotate', speed: 60, intensity: 80 };
  const original = structuredClone(background);
  const frame = resolveSceneBackgroundFrame({ sceneBackground: background, time: 1 });
  expect(frame).not.toEqual(background);
  expect(resolveSceneBackgroundFrame({ sceneBackground: background, time: 1 })).toEqual(frame);
  expect(resolveSceneBackgroundFrame({ sceneBackground: background, time: 2 })).not.toEqual(frame);
  expect(background).toEqual(original);
  expect(
    parsePaint({ kind: 'gradient', gradient: frame.kind === 'gradient' ? frame.gradient : null })
  ).not.toBeNull();
  background.animation.intensity = 0;
  expect(resolveSceneBackgroundFrame({ sceneBackground: background, time: 2 })).toEqual(background);
});

it('uses the CSS projected line length on a rectangular canvas', () => {
  const gradient = getShowcaseGradient('system-ocean');
  if (gradient.type !== 'linear') throw new Error('Expected linear');
  gradient.angle = 90;
  const addColorStop = vi.fn();
  const createLinearGradient = vi.fn(() => ({ addColorStop }));
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    createLinearGradient,
  } as unknown as CanvasRenderingContext2D;
  drawSceneGradient(context, gradient, 200, 100);
  expect(createLinearGradient).toHaveBeenCalledWith(0, expect.closeTo(50), 200, expect.closeTo(50));
  expect(addColorStop).toHaveBeenCalledWith(0, '#06b6d4ff');
  expect(addColorStop).toHaveBeenCalledWith(1, '#312e81ff');
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 200, 100);
});

it('applies time and audio animation to radial and conic paints and rejects malformed canonical paint', async () => {
  const { normalizeGradientSceneBackground, drawGradientSceneBackground } =
    await import('./background-gradient');
  for (const id of ['system-radial-glow', 'system-conic-spectrum'] as const) {
    const background: VideoProjectGradientBackground = {
      kind: 'gradient',
      gradient: getShowcaseGradient(id),
      animation: { mode: 'audioReactive', speed: 50, intensity: 80 },
    };
    const frame = resolveSceneBackgroundFrame({ sceneBackground: background, audioEnvelope: 0.8 });
    expect(frame).not.toEqual(background);
    expect(normalizeGradientSceneBackground(background)).toEqual(background);
  }
  const empty = { kind: 'gradient', gradient: null } as unknown as VideoProjectGradientBackground;
  expect(() => normalizeGradientSceneBackground(empty)).toThrow('Invalid scene gradient');
  const context = {
    save: vi.fn(),
    restore: vi.fn(),
    fillRect: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  } as unknown as CanvasRenderingContext2D;
  drawGradientSceneBackground({
    context,
    sceneBackground: createSceneGradientBackground(),
    width: 100,
    height: 50,
  });
  expect(context.fillRect).toHaveBeenCalledWith(0, 0, 100, 50);
});

it('animates every gradient geometry with reproducible frames and a neutral zero intensity', () => {
  for (const id of ['system-ocean', 'system-radial-glow', 'system-conic-spectrum'] as const) {
    for (const mode of ['rotate', 'breathe', 'drift', 'audioReactive'] as const) {
      const background: VideoProjectGradientBackground = {
        kind: 'gradient',
        gradient: getShowcaseGradient(id),
        animation: { mode, speed: 100, intensity: 100 },
      };
      const original = structuredClone(background);
      const frame = resolveSceneBackgroundFrame({
        sceneBackground: background,
        time: 2,
        audioEnvelope: 1,
      });
      expect(frame).not.toEqual(background);
      expect(
        resolveSceneBackgroundFrame({ sceneBackground: background, time: 2, audioEnvelope: 1 })
      ).toEqual(frame);
      expect(background).toEqual(original);
      background.animation!.intensity = 0;
      expect(
        resolveSceneBackgroundFrame({ sceneBackground: background, time: 2, audioEnvelope: 1 })
      ).toEqual(background);
    }
  }
});
