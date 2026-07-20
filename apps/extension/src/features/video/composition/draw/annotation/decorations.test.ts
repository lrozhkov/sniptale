import { expect, it, vi } from 'vitest';
import { VideoOverlayTemplateKind } from '../../../project/types/index';
import { drawAccentRail, drawAnnotationBorder } from './decorations';
import * as surfaceProfile from '../../../project/annotation/surface-profile';

function createContext(globalAlpha: number | undefined = 1) {
  return {
    beginPath: vi.fn(),
    closePath: vi.fn(),
    fill: vi.fn(),
    fillRect: vi.fn(),
    globalAlpha,
    lineTo: vi.fn(),
    lineWidth: 1,
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '#fff',
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createClip(templateKind: VideoOverlayTemplateKind) {
  return {
    presentation: {
      effects: {
        accentProgress: 1,
        accentWidthMultiplier: 1,
      },
      style: {
        accentColor: '#ff8800',
        borderRadius: 16,
      },
    },
    templateKind,
  };
}

it('skips accent glow for lower thirds without glow while still drawing the rail fill', () => {
  const context = createContext();

  drawAccentRail(
    context,
    createClip(VideoOverlayTemplateKind.LOWER_THIRD_BASIC) as never,
    10,
    12,
    16,
    80
  );

  expect(context.save).toHaveBeenCalledTimes(1);
  expect(context.fill).toHaveBeenCalledTimes(1);
});

it('falls back to default alpha math when border and glow render on unset canvas alpha', () => {
  const borderContext = createContext(undefined);
  drawAnnotationBorder(
    borderContext,
    createClip(VideoOverlayTemplateKind.LOWER_THIRD_ACCENT) as never,
    10,
    12,
    240,
    80
  );

  expect(borderContext.stroke).toHaveBeenCalled();
  expect(borderContext.globalAlpha).toBeCloseTo(0.1);

  const glowContext = createContext(undefined);
  drawAccentRail(
    glowContext,
    createClip(VideoOverlayTemplateKind.LOWER_THIRD_ACCENT) as never,
    10,
    12,
    16,
    80
  );

  expect(glowContext.fill).toHaveBeenCalled();
  expect(glowContext.globalAlpha).toBeGreaterThan(0);
});

it('skips border drawing when the resolved surface profile disables border alpha', () => {
  const context = createContext();
  const profileSpy = vi.spyOn(surfaceProfile, 'resolveAnnotationSurfaceProfile');
  profileSpy.mockReturnValue({
    accentGlowAlpha: 0,
    borderAlpha: 0,
    gradientAxis: null,
    gradientEnd: null,
    gradientStart: null,
    highlightAlpha: 0,
  });

  drawAnnotationBorder(
    context,
    createClip(VideoOverlayTemplateKind.LOWER_THIRD_BASIC) as never,
    10,
    12,
    240,
    80
  );

  expect(context.stroke).not.toHaveBeenCalled();
  profileSpy.mockRestore();
});

it('scales accent rail motion offsets and border width with the display scale', () => {
  const context = createContext();

  drawAnnotationBorder(
    context,
    createClip(VideoOverlayTemplateKind.LOWER_THIRD_ACCENT) as never,
    10,
    12,
    240,
    80,
    2
  );
  drawAccentRail(
    context,
    createClip(VideoOverlayTemplateKind.LOWER_THIRD_ACCENT) as never,
    10,
    12,
    16,
    80,
    2
  );

  expect(context.lineWidth).toBe(3);
  expect(context.translate).toHaveBeenCalledWith(18, 52);
});
