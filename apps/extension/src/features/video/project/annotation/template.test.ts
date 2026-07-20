import { expect, it, vi } from 'vitest';
import { createEmptyVideoProject } from '../factories/creation';
import {
  applyAnnotationTemplatePreset,
  applyAnnotationTemplateStyleSwap,
  createAnnotationClip,
  resolveAnnotationPresentation,
  resolveAnnotationTemplateDefaults,
} from './template';
import { VideoOverlayTemplateKind } from '../types/index';

function createProjectTemplateClip(
  project: ReturnType<typeof createEmptyVideoProject>,
  templateKind: VideoOverlayTemplateKind
) {
  return createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    templateKind
  );
}

it('creates detached lower-third clips with translated defaults', () => {
  vi.spyOn(crypto, 'randomUUID').mockReturnValue('11111111-1111-4111-8111-111111111111');
  const project = createEmptyVideoProject('Templates', 1280, 720);

  expect(createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 2)).toEqual(
    expect.objectContaining({
      content: expect.objectContaining({
        badge: expect.any(String),
        headline: expect.any(String),
        subline: expect.any(String),
      }),
      duration: 4.8,
      id: '11111111-1111-4111-8111-111111111111',
      introAnimation: 'SLIDE_UP_FADE',
      name: expect.any(String),
      outroAnimation: 'REVEAL_MASK',
      templateKind: 'LOWER_THIRD_BASIC',
      type: 'ANNOTATION',
    })
  );
});

it('resolves intro and outro presentation effects from project time', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 1);
  clip.introAnimation = 'SLIDE_LEFT_FADE';
  clip.outroAnimation = 'SHIMMER_ENTRY';
  clip.direction = 'RIGHT';
  clip.duration = 3;
  clip.introDurationMs = 500;
  clip.outroDurationMs = 500;
  project.clips = [clip];

  const intro = resolveAnnotationPresentation(project, clip, 1.15);
  const steady = resolveAnnotationPresentation(project, clip, 2);
  const outro = resolveAnnotationPresentation(project, clip, 3.85);

  expect(intro.effects.translateX).toBeGreaterThan(0);
  expect(intro.frame.opacity).toBeLessThan(1);
  expect(steady.effects.translateX).toBe(0);
  expect(steady.frame.opacity).toBeCloseTo(1);
  expect(outro.effects.shimmerProgress).not.toBeNull();
  expect(outro.frame.opacity).toBeLessThan(1);
  expect(
    resolveAnnotationPresentation({ height: project.height, width: project.width }, clip, 2).frame
      .opacity
  ).toBeCloseTo(1);
});

it('resolves template-specific style variants and reveal masks', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const accentClip = createProjectTemplateClip(
    project,
    VideoOverlayTemplateKind.LOWER_THIRD_ACCENT
  );
  const editorialClip = createProjectTemplateClip(
    project,
    VideoOverlayTemplateKind.LOWER_THIRD_EDITORIAL
  );
  const stackedClip = createProjectTemplateClip(
    project,
    VideoOverlayTemplateKind.LOWER_THIRD_STACKED
  );
  const badgeClip = createProjectTemplateClip(project, VideoOverlayTemplateKind.LOWER_THIRD_BADGE);

  const accentPresentation = resolveAnnotationPresentation(project, accentClip, 0.2);
  const editorialPresentation = resolveAnnotationPresentation(project, editorialClip, 1);
  const stackedPresentation = resolveAnnotationPresentation(project, stackedClip, 1);
  const badgePresentation = resolveAnnotationPresentation(project, badgeClip, 1);

  expect(accentClip.introAnimation).toBe('SLIDE_LEFT_FADE');
  expect(accentPresentation.effects.accentProgress).toBeGreaterThan(
    accentPresentation.effects.headlineProgress
  );
  expect(accentPresentation.style.borderRadius).toBe(24);
  expect(editorialClip.introAnimation).toBe('SCALE_FADE');
  expect(editorialClip.outroAnimation).toBe('SOFT_BLUR_REVEAL');
  expect(editorialPresentation.style.blurAmount).toBeGreaterThanOrEqual(14);
  expect(editorialPresentation.style.borderRadius).toBe(26);
  expect(stackedClip.introAnimation).toBe('SCALE_FADE');
  expect(stackedPresentation.effects.scaleMultiplier).toBeGreaterThanOrEqual(1);
  expect(stackedPresentation.style.depthAmount).toBeGreaterThanOrEqual(0.28);
  expect(badgeClip.outroAnimation).toBe('SHIMMER_SWEEP');
  expect(badgePresentation.style.shimmerAmount).toBeGreaterThanOrEqual(0.44);
});

it('keeps shipped hold-state motion alive after intro for living templates', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const shimmerClip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.SHIMMER_LABEL
  );
  shimmerClip.duration = 4;

  const revealClip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD
  );
  revealClip.duration = 4;

  const shimmerPresentation = resolveAnnotationPresentation(project, shimmerClip, 1.8);
  const revealPresentation = resolveAnnotationPresentation(project, revealClip, 2.1);

  expect(shimmerPresentation.effects.shimmerProgress).not.toBeNull();
  expect(shimmerPresentation.effects.translateY).not.toBe(0);
  expect(revealPresentation.effects.glossProgress).not.toBeNull();
  expect(revealPresentation.effects.shadowStrength).not.toBe(1);
  expect(revealPresentation.effects.translateY).not.toBe(0);
  expect(revealPresentation.effects.scaleMultiplier).not.toBe(1);
});

it('applies broader template presets for creation and template switching', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const shimmerClip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.SHIMMER_LABEL
  );
  const updatedClip = applyAnnotationTemplatePreset(
    shimmerClip,
    project.width,
    project.height,
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD
  );

  expect(shimmerClip.introAnimation).toBe('SHIMMER_ENTRY');
  expect(shimmerClip.content.subline).toBe('');
  expect(shimmerClip.transform.y).toBeLessThan(project.height / 4);
  expect(updatedClip.introAnimation).toBe('THREE_D_REVEAL');
  expect(updatedClip.transform.x).toBeGreaterThan(project.width / 2);
  expect(updatedClip.style.depthAmount).toBeGreaterThanOrEqual(0.44);
  expect(updatedClip.content.headline).toBe(shimmerClip.content.headline);
  expect(updatedClip.templateKind).toBe(VideoOverlayTemplateKind.THREE_D_REVEAL_CARD);
  expect(updatedClip.target).toBe('NONE');
});

it('supports style swaps that keep manual placement and timing adjustments intact', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR
  );

  clip.direction = 'DOWN';
  clip.introDurationMs = 180;
  clip.outroDurationMs = 640;
  clip.target = 'POINT';
  clip.targetPoint = { x: 320, y: 220 };
  clip.transform = {
    ...clip.transform,
    x: 512,
    y: 120,
  };

  const swappedClip = applyAnnotationTemplateStyleSwap(
    clip,
    project.width,
    project.height,
    VideoOverlayTemplateKind.POINTER_LABEL
  );

  expect(swappedClip).toEqual(
    expect.objectContaining({
      direction: 'DOWN',
      introDurationMs: 180,
      outroDurationMs: 640,
      target: 'POINT',
      targetPoint: { x: 320, y: 220 },
      templateKind: VideoOverlayTemplateKind.POINTER_LABEL,
      transform: expect.objectContaining({
        x: 512,
        y: 120,
      }),
    })
  );
});

it('assigns target-aware defaults to pointer and bracket-callout templates', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const calloutCardClip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.CALLOUT_CARD
  );
  const pointerClip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.POINTER_LABEL
  );
  const pointerPresentation = resolveAnnotationPresentation(project, pointerClip, 0.15);

  expect(pointerClip.annotationFamily).toBe('POINTER');
  expect(pointerClip.renderFamily).toBe('MARKER');
  expect(pointerClip.motionFamily).toBe('MARKER_POP');
  expect(pointerClip.target).toBe('POINT');
  expect(pointerClip.targetPoint).not.toBeNull();
  expect(pointerPresentation.frame.width).toBeGreaterThan(pointerClip.transform.width);

  expect(calloutCardClip.annotationFamily).toBe('CALLOUT');
  expect(calloutCardClip.renderFamily).toBe('FRAME');
  expect(calloutCardClip.motionFamily).toBe('FRAME_TRACE');
  expect(calloutCardClip.target).toBe('RECT');
  expect(calloutCardClip.targetRect).not.toBeNull();
  expect(calloutCardClip.calloutDecor.frameKind).toBe('BRACKET');
});

it('assigns target-aware defaults to connector and spotlight templates', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const connectorClip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.CALLOUT_CONNECTOR
  );
  const spotlightClip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    0,
    VideoOverlayTemplateKind.FEATURE_SPOTLIGHT_CARD
  );

  expect(connectorClip.annotationFamily).toBe('CALLOUT');
  expect(connectorClip.renderFamily).toBe('LINE');
  expect(connectorClip.motionFamily).toBe('CONNECTOR_DRAW');
  expect(connectorClip.target).toBe('RECT');
  expect(connectorClip.targetRect).not.toBeNull();

  expect(spotlightClip.annotationFamily).toBe('SPOTLIGHT');
  expect(spotlightClip.renderFamily).toBe('SPOTLIGHT');
  expect(spotlightClip.motionFamily).toBe('PULSE_SPOTLIGHT');
  expect(spotlightClip.target).toBe('RECT');
  expect(spotlightClip.targetRect).not.toBeNull();
});

it('resolves defaults across all shipped annotation template families', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);

  for (const templateKind of Object.values(VideoOverlayTemplateKind)) {
    const defaults = resolveAnnotationTemplateDefaults(project.width, project.height, templateKind);
    const clip = createAnnotationClip(
      project.tracks[2]!.id,
      project.width,
      project.height,
      0,
      templateKind
    );

    expect(defaults.transform.width).toBeGreaterThan(0);
    expect(defaults.transform.height).toBeGreaterThan(0);
    expect(clip.templateKind).toBe(templateKind);
    expect(clip.transform).toEqual(defaults.transform);
    expect(clip.style).toEqual(defaults.style);
  }
});
