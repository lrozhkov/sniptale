import { expect, it, vi } from 'vitest';
import { drawMarkerAnnotation } from './targets';
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
    measureText: vi.fn(() => ({ width: 24 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createEffects() {
  return {
    accentProgress: 1,
    accentWidthMultiplier: 1,
    badgeProgress: 1,
    blurPx: 0,
    connectorProgress: 1,
    glossProgress: null,
    headlineProgress: 1,
    headlineRevealProgress: 1,
    maskProgress: 1,
    markerProgress: 1,
    scaleMultiplier: 1,
    shadowStrength: 1,
    shimmerProgress: null,
    sublineProgress: 1,
    sublineRevealProgress: 1,
    translateX: 0,
    translateY: 0,
  };
}

function createStyle() {
  return {
    accentColor: '#ff8800',
    backgroundColor: '#111111',
    badgeTextColor: '#ffffff',
    blurAmount: 0,
    borderRadius: 16,
    depthAmount: 0.2,
    headlineColor: '#ffffff',
    padding: 16,
    shimmerAmount: 0,
    sublineColor: '#cccccc',
  };
}

function createMarkerClip() {
  return {
    calloutDecor: {
      arrowKind: 'NONE',
      frameKind: 'NONE',
      markerKind: 'DOT',
      pulseKind: 'SOFT',
    },
    content: { badge: null, headline: 'Marker', subline: '' },
    leaderLine: {
      direction: 'LEFT',
      enabled: true,
      length: 140,
      style: 'STRAIGHT',
      thickness: 3,
    },
    presentation: {
      effects: createEffects(),
      frame: { height: 100, opacity: 1, rotation: 0, width: 200, x: 0, y: 0 },
      labelFrame: { height: 64, width: 140, x: 120, y: 54 },
      style: createStyle(),
    },
    target: 'POINT',
    targetPoint: { x: 60, y: 92 },
    targetRect: null,
    templateKind: VideoOverlayTemplateKind.POINTER_LABEL,
  };
}

it('draws scaled marker annotations through target-aware shell helpers', () => {
  const context = createContext();

  drawMarkerAnnotation(context, createMarkerClip() as never, 2);

  expect(context.arc).toHaveBeenCalled();
  expect(context.fillText).toHaveBeenCalledWith('Marker', 272, 152, 216);
});
