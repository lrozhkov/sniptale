import { expect, it } from 'vitest';
import { createAnnotationClip } from '../factories/overlay-clip';
import { createEmptyVideoProject } from '../factories/creation';
import { resolveAnnotationPresentation } from './template';
import { resolveAnnotationRenderMetrics } from './render-metrics';
import { VideoOverlayTemplateKind } from '../types/index';

function createPresentationFixture() {
  return {
    effects: {
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
    },
    frame: { height: 120, opacity: 1, rotation: 0, width: 260, x: 0, y: 0 },
    labelFrame: { height: 64, width: 180, x: 0, y: 0 },
    style: {
      accentColor: '#ff8800',
      backgroundColor: '#111111',
      badgeTextColor: '#ffffff',
      blurAmount: 0,
      borderRadius: 18,
      depthAmount: 0.2,
      headlineColor: '#ffffff',
      padding: 14,
      shimmerAmount: 0.4,
      sublineColor: '#cccccc',
    },
  } as const;
}

it('shrinks annotation typography continuously for tiny preview scales', () => {
  const project = createEmptyVideoProject('Render metrics', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.LOWER_THIRD_BASIC
  );
  const presentation = resolveAnnotationPresentation(project, clip, 0.5);

  const mediumMetrics = resolveAnnotationRenderMetrics(presentation, 0.2);
  const tinyMetrics = resolveAnnotationRenderMetrics(presentation, 0.1);

  expect(tinyMetrics.contentScale).toBe(0.1);
  expect(tinyMetrics.interactionScale).toBe(0.2);
  expect(tinyMetrics.textMetrics.headlineFontSize).toBeLessThan(
    mediumMetrics.textMetrics.headlineFontSize
  );
  expect(tinyMetrics.textMetrics.sublineFontSize).toBeLessThan(
    mediumMetrics.textMetrics.sublineFontSize
  );
});

it('resolves frame and pulse metrics from both label and frame fallbacks', () => {
  const presentation = createPresentationFixture();
  const fromLabel = resolveAnnotationRenderMetrics(presentation as never, 1);
  const fromFallback = resolveAnnotationRenderMetrics(
    {
      effects: presentation.effects,
      frame: null as never,
      labelFrame: null as never,
      style: presentation.style,
    },
    1.5
  );

  expect(fromLabel.targetMetrics.frameStrokeWidth).toBeGreaterThan(0);
  expect(fromLabel.targetMetrics.pulseStrokeWidth).toBeGreaterThan(
    fromLabel.targetMetrics.frameStrokeWidth
  );
  expect(fromFallback.textMetrics.headlineFontSize).toBeGreaterThan(
    fromLabel.textMetrics.headlineFontSize
  );
});
