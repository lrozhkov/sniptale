import { expect, it, vi } from 'vitest';
import { VideoOverlayTemplateKind } from '../../project/types/index';
import { drawAnnotationCompositionLayer } from './annotation';
import { drawTextCompositionLayer } from './overlays';

function createContext() {
  return {
    beginPath: vi.fn(),
    clip: vi.fn(),
    closePath: vi.fn(),
    createLinearGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
    ellipse: vi.fn(),
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

function createAnnotationPresentationFixture(
  shimmerProgress: number | null,
  templateKind: VideoOverlayTemplateKind
) {
  return {
    effects: {
      accentProgress: 1,
      accentWidthMultiplier: 1,
      badgeProgress: shimmerProgress === null ? 0 : 1,
      blurPx: shimmerProgress === null ? 2 : 0,
      glossProgress: templateKind === VideoOverlayTemplateKind.SHIMMER_LABEL ? 0.5 : null,
      headlineProgress: 1,
      headlineRevealProgress: 1,
      maskProgress: 1,
      scaleMultiplier: 1.03,
      shadowStrength: 0.9,
      shimmerProgress,
      sublineProgress: 1,
      sublineRevealProgress: 1,
      translateX: 0,
      translateY: 0,
    },
    frame: {
      height: 80,
      opacity: 1,
      rotation: 0,
      width: 240,
      x: 10,
      y: 12,
    },
    style: {
      accentColor: '#ff8800',
      backgroundColor: '#111111',
      badgeTextColor: '#ffffff',
      blurAmount: 0,
      borderRadius: 18,
      depthAmount: 0.2,
      headlineColor: '#ffffff',
      padding: 16,
      shimmerAmount: 0.4,
      sublineColor: '#cccccc',
    },
  };
}

it('aligns text composition layers for centered and right-aligned text', () => {
  const context = createContext();
  const style = {
    backgroundColor: '#000',
    borderColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    color: '#fff',
    fontFamily: 'Segoe UI',
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.2,
    padding: 6,
  };

  drawTextCompositionLayer(
    context,
    { style: { ...style, textAlign: 'center' }, text: 'Center' } as never,
    10,
    20,
    100,
    60
  );
  drawTextCompositionLayer(
    context,
    { style: { ...style, textAlign: 'right' }, text: 'Right' } as never,
    10,
    20,
    100,
    60
  );
  drawTextCompositionLayer(
    context,
    { style: { ...style, textAlign: 'left' }, text: 'Left' } as never,
    10,
    20,
    100,
    60
  );

  expect(context.fillText).toHaveBeenNthCalledWith(1, 'Center', 60, 26, 88);
  expect(context.fillText).toHaveBeenNthCalledWith(2, 'Right', 104, 26, 88);
  expect(context.fillText).toHaveBeenNthCalledWith(3, 'Left', 16, 26, 88);
});

function createAnnotationLayerFixture(
  shimmerProgress: number | null,
  templateKind: VideoOverlayTemplateKind = VideoOverlayTemplateKind.LOWER_THIRD_BASIC,
  subline = 'Subline'
) {
  return {
    content: {
      badge: shimmerProgress === null ? null : 'NEW',
      headline: 'Headline',
      subline,
    },
    templateKind,
    presentation: createAnnotationPresentationFixture(shimmerProgress, templateKind),
  };
}

function verifyAnnotationLayerDrawing(shimmerProgress: number | null) {
  const context = createContext();

  drawAnnotationCompositionLayer(
    context,
    createAnnotationLayerFixture(shimmerProgress) as never,
    10,
    12,
    240,
    80
  );

  expect(context.save).toHaveBeenCalled();
  expect(context.fillText).toHaveBeenCalledWith(
    'Headline',
    expect.any(Number),
    expect.any(Number),
    expect.any(Number)
  );
  expect(context.fillRect).toHaveBeenCalledTimes(shimmerProgress === null ? 0 : 1);
  expect(context.restore).toHaveBeenCalled();
  return context;
}

it('renders annotation overlays with badge and shimmer support', () => {
  const context = verifyAnnotationLayerDrawing(0.5);
  expect(context.fillText).toHaveBeenCalledWith('NEW', expect.any(Number), expect.any(Number));
});

it('renders annotation overlays without badge shimmer when the preset is steady', () => {
  const context = verifyAnnotationLayerDrawing(null);
  expect(context.fillText).not.toHaveBeenCalledWith('NEW', expect.any(Number), expect.any(Number));
});

it('renders title-stack annotations without the lower-third accent rail', () => {
  const context = createContext();

  drawAnnotationCompositionLayer(
    context,
    createAnnotationLayerFixture(null, VideoOverlayTemplateKind.SECTION_DIVIDER) as never,
    10,
    12,
    240,
    80
  );

  expect(context.fill).toHaveBeenCalled();
  expect(context.fillRect).toHaveBeenCalledTimes(1);
});

it('renders pill-label annotations without drawing the subline body', () => {
  const context = createContext();

  drawAnnotationCompositionLayer(
    context,
    createAnnotationLayerFixture(
      0.4,
      VideoOverlayTemplateKind.SHIMMER_LABEL,
      'Hidden subline'
    ) as never,
    10,
    12,
    240,
    80
  );

  expect(context.fillText).not.toHaveBeenCalledWith(
    'Hidden subline',
    expect.any(Number),
    expect.any(Number),
    expect.any(Number)
  );
});

it('scales text overlays with the preview display scale', () => {
  const context = createContext();
  const style = {
    backgroundColor: '#000',
    borderColor: '#fff',
    borderRadius: 8,
    borderWidth: 1,
    color: '#fff',
    fontFamily: 'Segoe UI',
    fontSize: 16,
    fontWeight: 600,
    lineHeight: 1.2,
    padding: 6,
    textAlign: 'left',
  } as const;

  drawTextCompositionLayer(context, { style, text: 'Scaled' } as never, 10, 20, 100, 60, 2);

  expect(context.fillText).toHaveBeenCalledWith('Scaled', 22, 32, 76);
  expect(context.stroke).toHaveBeenCalled();
});
