import { expect, it, vi } from 'vitest';
import { drawCompositionVisualLayer } from '../index';
import { drawAnnotationCompositionLayer } from './index';
import { VideoOverlayTemplateKind } from '../../../project/types/index';
import {
  createProjectAndClip,
  resolveTestScene,
} from '../../../project/annotation-engine/resolver.test-support.ts';

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
    filter: 'none',
    globalAlpha: 1,
    lineWidth: 1,
    lineTo: vi.fn(),
    measureText: vi.fn(() => ({ width: 24 })),
    moveTo: vi.fn(),
    quadraticCurveTo: vi.fn(),
    rect: vi.fn(),
    restore: vi.fn(),
    rotate: vi.fn(),
    save: vi.fn(),
    scale: vi.fn(),
    stroke: vi.fn(),
    strokeStyle: '#fff',
    translate: vi.fn(),
  } as unknown as CanvasRenderingContext2D;
}

function createAnnotationPresentationFixture() {
  return {
    effects: {
      accentProgress: 1,
      accentWidthMultiplier: 1,
      badgeProgress: 1,
      blurPx: 0,
      connectorProgress: 1,
      glossProgress: 0.6,
      headlineProgress: 1,
      headlineRevealProgress: 1,
      maskProgress: 1,
      markerProgress: 1,
      scaleMultiplier: 1.04,
      shadowStrength: 0.9,
      shimmerProgress: null,
      sublineProgress: 1,
      sublineRevealProgress: 1,
      translateX: 0,
      translateY: 0,
    },
    frame: { height: 50, opacity: 1, rotation: 0, width: 80, x: 10, y: 12 },
    labelFrame: { height: 50, width: 80, x: 10, y: 12 },
    style: {
      accentColor: '#ff8800',
      backgroundColor: '#111111',
      badgeTextColor: '#ffffff',
      blurAmount: 0,
      borderRadius: 16,
      depthAmount: 0.2,
      headlineColor: '#ffffff',
      padding: 16,
      shimmerAmount: 0.4,
      sublineColor: '#cccccc',
    },
  };
}

function createAnnotationLayerFixture() {
  return {
    clip: {
      calloutDecor: {
        arrowKind: 'NONE',
        frameKind: 'NONE',
        markerKind: 'NONE',
        pulseKind: 'NONE',
      },
      content: { badge: 'NEW', headline: 'Headline', subline: 'Subline' },
      id: 'annotation-1',
      leaderLine: {
        direction: 'LEFT',
        enabled: false,
        length: 120,
        style: 'STRAIGHT',
        thickness: 3,
      },
      presentation: createAnnotationPresentationFixture(),
      renderFamily: 'PLATE',
      target: 'NONE',
      targetPoint: null,
      targetRect: null,
      templateKind: 'LOWER_THIRD_BASIC',
      trackId: 'track-1',
    },
    clipId: 'annotation-1',
    height: 50,
    kind: 'annotation',
    opacity: 1,
    rotation: 0,
    width: 80,
    x: 10,
    y: 12,
    zIndex: 0,
  };
}

it('renders annotation layers through the shared composition visual pipeline', () => {
  const context = createContext();

  drawCompositionVisualLayer(context, createAnnotationLayerFixture() as never, 1, 1, {}, new Map());

  expect(context.fill).toHaveBeenCalled();
  expect(context.fillRect).toHaveBeenCalled();
  expect(context.fillText).toHaveBeenCalled();
  expect(context.scale).toHaveBeenCalled();
});

it('routes resolved scenes through the shared annotation scene backend', () => {
  const context = createContext();
  const { clip, project } = createProjectAndClip();
  const scene = resolveTestScene(project, clip, 1.75);
  const layer = createAnnotationLayerFixture();

  drawAnnotationCompositionLayer(
    context,
    {
      ...layer.clip,
      scene,
    } as never,
    scene.frame.x,
    scene.frame.y,
    scene.frame.width,
    scene.frame.height
  );

  expect(context.fillText).toHaveBeenCalledWith(
    'Resolved headline',
    expect.any(Number),
    expect.any(Number),
    expect.any(Number)
  );
  expect(context.lineTo).toHaveBeenCalled();
});

it('renders template-specific shimmer and gloss sweep layers through the annotation owner', () => {
  const context = createContext();
  const shimmerClip = {
    ...createAnnotationLayerFixture().clip,
    templateKind: VideoOverlayTemplateKind.SHIMMER_LABEL,
  };
  const revealClip = {
    ...createAnnotationLayerFixture().clip,
    templateKind: VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
  };

  drawAnnotationCompositionLayer(context, shimmerClip as never, 10, 12, 240, 80);
  drawAnnotationCompositionLayer(
    context,
    {
      ...revealClip,
      presentation: {
        ...revealClip.presentation,
        effects: { ...revealClip.presentation.effects, shimmerProgress: null },
      },
    } as never,
    10,
    12,
    240,
    80
  );

  expect(context.createLinearGradient).toHaveBeenCalledTimes(6);
  expect(context.fillRect).toHaveBeenCalled();
});

it('draws lower-third body panels as split right-side surfaces instead of one full rounded fill', () => {
  const context = createContext();
  const clip = {
    ...createAnnotationLayerFixture().clip,
    templateKind: VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
    presentation: {
      ...createAnnotationLayerFixture().clip.presentation,
      effects: {
        ...createAnnotationLayerFixture().clip.presentation.effects,
        glossProgress: null,
        shimmerProgress: null,
      },
    },
  };

  drawAnnotationCompositionLayer(context, clip as never, 10, 12, 240, 80);

  expect(context.moveTo).toHaveBeenCalledWith(19, 12);
  expect(context.stroke).toHaveBeenCalled();
});

it('renders title-stack divider paths without the lower-third accent rail branch', () => {
  const context = createContext();
  const clip = {
    ...createAnnotationLayerFixture().clip,
    templateKind: VideoOverlayTemplateKind.SECTION_DIVIDER,
  };

  drawAnnotationCompositionLayer(
    context,
    {
      ...clip,
      presentation: {
        ...clip.presentation,
        effects: {
          ...clip.presentation.effects,
          glossProgress: null,
          shimmerProgress: null,
        },
      },
    } as never,
    10,
    12,
    240,
    80
  );

  expect(context.fillRect).toHaveBeenCalledTimes(1);
  expect(context.fill).toHaveBeenCalled();
});

it('renders connector lines and target markers for target-aware callout templates', () => {
  const context = createContext();
  const clip = {
    ...createAnnotationLayerFixture().clip,
    calloutDecor: {
      arrowKind: 'CHEVRON',
      frameKind: 'ROUNDED_RECT',
      markerKind: 'RING',
      pulseKind: 'SOFT',
    },
    leaderLine: {
      direction: 'LEFT',
      enabled: true,
      length: 180,
      style: 'ELBOW',
      thickness: 3,
    },
    presentation: {
      ...createAnnotationPresentationFixture(),
      effects: {
        ...createAnnotationPresentationFixture().effects,
        connectorProgress: 0.7,
        markerProgress: 0.8,
      },
      frame: { height: 160, opacity: 1, rotation: 0, width: 240, x: 10, y: 12 },
      labelFrame: { height: 50, width: 120, x: 90, y: 42 },
    },
    renderFamily: 'LINE',
    target: 'POINT',
    targetPoint: { x: 28, y: 102 },
    targetRect: null,
    templateKind: VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
  };

  drawAnnotationCompositionLayer(context, clip as never, 10, 12, 240, 160);

  expect(context.lineTo).toHaveBeenCalled();
  expect(context.arc).toHaveBeenCalled();
  expect(context.stroke).toHaveBeenCalledTimes(5);
});

it('scales lower-third internals with the preview display scale', () => {
  const context = createContext();

  drawAnnotationCompositionLayer(
    context,
    createAnnotationLayerFixture().clip as never,
    10,
    12,
    240,
    80,
    2
  );

  expect(context.fillText).toHaveBeenCalledWith('NEW', 91.64, 62.4);
  expect(context.fillText).toHaveBeenCalledWith(
    'Headline',
    expect.any(Number),
    expect.any(Number),
    expect.any(Number)
  );
});
