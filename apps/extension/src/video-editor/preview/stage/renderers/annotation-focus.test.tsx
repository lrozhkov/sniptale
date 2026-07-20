import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import { renderTargetFrameDecorations } from './annotation-focus';

const PRESENTATION = {
  effects: {
    accentProgress: 1,
    accentWidthMultiplier: 1,
    badgeProgress: 1,
    blurPx: 0,
    connectorProgress: 0.9,
    glossProgress: null,
    headlineProgress: 1,
    headlineRevealProgress: 1,
    maskProgress: 1,
    markerProgress: 0.8,
    scaleMultiplier: 1.04,
    shadowStrength: 1.08,
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
} as const;

it('renders rect-target spotlight decorations with pulse and frame layers', () => {
  const markup = renderToStaticMarkup(
    renderTargetFrameDecorations({
      clip: {
        calloutDecor: {
          arrowKind: 'NONE',
          frameKind: 'ROUNDED_RECT',
          markerKind: 'NONE',
          pulseKind: 'RING',
        },
        targetPoint: null,
        targetRect: { height: 100, width: 180, x: 220, y: 170 },
      } as never,
      displayScale: 1,
      presentation: PRESENTATION as never,
    })
  );

  expect(markup).toContain('data-annotation-focus="pulse"');
  expect(markup).toContain('data-annotation-focus="frame"');
});

it('renders point-target pulse for focus markers without a rect frame', () => {
  const markup = renderToStaticMarkup(
    renderTargetFrameDecorations({
      clip: {
        calloutDecor: {
          arrowKind: 'NONE',
          frameKind: 'NONE',
          markerKind: 'DOT',
          pulseKind: 'SOFT',
        },
        targetPoint: { x: 260, y: 180 },
        targetRect: null,
      } as never,
      displayScale: 1,
      presentation: PRESENTATION as never,
    })
  );

  expect(markup).toContain('data-annotation-focus="point"');
  expect(markup).not.toContain('data-annotation-focus="frame"');
});

it('renders bracket focus markup for bracket-style callouts', () => {
  const markup = renderToStaticMarkup(
    renderTargetFrameDecorations({
      clip: {
        calloutDecor: {
          arrowKind: 'CHEVRON',
          frameKind: 'BRACKET',
          markerKind: 'NONE',
          pulseKind: 'NONE',
        },
        targetPoint: null,
        targetRect: { height: 88, width: 160, x: 240, y: 176 },
      } as never,
      displayScale: 1,
      presentation: PRESENTATION as never,
    })
  );

  expect(markup).toContain('data-annotation-focus="bracket"');
  expect(markup).not.toContain('data-annotation-focus="pulse"');
});
