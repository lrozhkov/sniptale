import { expect, it, vi } from 'vitest';
import { drawFrameAnnotation, drawTargetFrameDecorations } from './focus';
import { VideoOverlayTemplateKind } from '../../../project/types/index';

function createContext() {
  return {
    arc: vi.fn(),
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    fill: vi.fn(),
    fillRect: vi.fn(),
    fillText: vi.fn(),
    globalAlpha: 1,
    lineTo: vi.fn(),
    lineWidth: 1,
    measureText: vi.fn(() => ({ width: 24 })),
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

function createPresentation() {
  return {
    effects: {
      accentProgress: 1,
      accentWidthMultiplier: 1,
      badgeProgress: 1,
      blurPx: 0,
      connectorProgress: 0.85,
      glossProgress: null,
      headlineProgress: 1,
      headlineRevealProgress: 1,
      maskProgress: 1,
      markerProgress: 0.8,
      scaleMultiplier: 1.05,
      shadowStrength: 1.1,
      shimmerProgress: null,
      sublineProgress: 1,
      sublineRevealProgress: 1,
      translateX: 0,
      translateY: 0,
    },
    frame: { height: 220, opacity: 1, rotation: 0, width: 360, x: 200, y: 120 },
    labelFrame: { height: 72, width: 180, x: 420, y: 140 },
    style: {
      accentColor: '#ff8800',
      backgroundColor: 'rgba(10, 12, 16, 0.84)',
      badgeTextColor: '#ffffff',
      blurAmount: 0,
      borderRadius: 24,
      depthAmount: 0.36,
      headlineColor: '#ffffff',
      padding: 18,
      shimmerAmount: 0.4,
      sublineColor: '#cccccc',
    },
  };
}

function createClip() {
  return {
    calloutDecor: {
      arrowKind: 'NONE',
      frameKind: 'ROUNDED_RECT',
      markerKind: 'NONE',
      pulseKind: 'RING',
    },
    content: { badge: null, headline: 'Headline', subline: 'Subline' },
    leaderLine: {
      direction: 'LEFT',
      enabled: true,
      length: 180,
      style: 'ELBOW',
      thickness: 3,
    },
    presentation: createPresentation(),
    target: 'RECT',
    targetPoint: null,
    targetRect: { height: 100, width: 180, x: 220, y: 170 },
    templateKind: VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD,
  };
}

function createBracketClip() {
  return {
    ...createClip(),
    calloutDecor: {
      arrowKind: 'CHEVRON',
      frameKind: 'BRACKET',
      markerKind: 'NONE',
      pulseKind: 'NONE',
    },
    templateKind: VideoOverlayTemplateKind.CALLOUT_CARD,
  };
}

function createPointClip() {
  return {
    ...createClip(),
    calloutDecor: {
      arrowKind: 'NONE',
      frameKind: 'NONE',
      markerKind: 'DOT',
      pulseKind: 'SOFT',
    },
    targetPoint: { x: 260, y: 180 },
    targetRect: null,
    templateKind: VideoOverlayTemplateKind.POINTER_LABEL,
  };
}

function createNoFrameClip() {
  return {
    ...createClip(),
    calloutDecor: {
      arrowKind: 'NONE',
      frameKind: 'NONE',
      markerKind: 'NONE',
      pulseKind: 'NONE',
    },
  };
}

it('draws spotlight frame and pulse decorations around rect targets', () => {
  const context = createContext();

  drawTargetFrameDecorations(context, createClip() as never, 2);

  expect(context.quadraticCurveTo).toHaveBeenCalled();
  expect(context.stroke).toHaveBeenCalled();
  expect(context.lineWidth).toBeGreaterThan(1);
});

it('draws bracket callout frames without rounded-rect corner tracing', () => {
  const context = createContext();

  drawTargetFrameDecorations(context, createBracketClip() as never, 1);

  expect(context.lineTo).toHaveBeenCalled();
  expect(context.quadraticCurveTo).not.toHaveBeenCalled();
  expect(context.stroke).toHaveBeenCalled();
});

it('draws point-focus pulse rings for point-target markers', () => {
  const context = createContext();

  drawTargetFrameDecorations(context, createPointClip() as never, 1);

  expect(context.arc).toHaveBeenCalled();
  expect(context.stroke).toHaveBeenCalled();
});

it('skips frame drawing when the target frame and pulse are both disabled', () => {
  const context = createContext();

  drawTargetFrameDecorations(context, createNoFrameClip() as never, 1);

  expect(context.stroke).not.toHaveBeenCalled();
});

it('draws frame annotations through focus decorations plus leader line', () => {
  const context = createContext();

  drawFrameAnnotation(context, createClip() as never, 2);

  expect(context.lineTo).toHaveBeenCalled();
  expect(context.fillText).toHaveBeenCalled();
  expect(context.stroke).toHaveBeenCalled();
  expect(context.save).toHaveBeenCalled();
});
