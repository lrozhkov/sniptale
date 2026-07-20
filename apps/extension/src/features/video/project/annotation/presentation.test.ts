import { expect, it } from 'vitest';
import { createAnnotationClip } from './template';
import { resolveAnimationState } from './presentation';
import { createEmptyVideoProject } from '../factories/creation';
import { resolveAnnotationPresentation } from './template';
import {
  VideoOverlayAnimationKind,
  VideoOverlayTemplateKind,
  VideoTemplateDirection,
} from '../types/index';

function createClip() {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const clip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 1);
  clip.duration = 3;
  clip.introDurationMs = 500;
  clip.outroDurationMs = 500;
  return clip;
}

function createTemplateAnimationClip(
  animation: VideoOverlayAnimationKind,
  templateKind: VideoOverlayTemplateKind,
  phase: 'intro' | 'outro'
) {
  const clip = createClip();
  clip.templateKind = templateKind;
  if (phase === 'intro') {
    clip.introAnimation = animation;
  } else {
    clip.outroAnimation = animation;
  }
  return clip;
}

function resolveTestAnimationState(
  clip: ReturnType<typeof createClip>,
  animation: ReturnType<typeof createClip>['introAnimation'],
  currentTime: number,
  phase: 'intro' | 'outro'
) {
  return resolveAnimationState({
    animation,
    clip,
    currentTime,
    phase,
  });
}

function expectStaticIntroState(clip: ReturnType<typeof createClip>) {
  expect(
    resolveAnimationState({
      animation: VideoOverlayAnimationKind.NONE,
      clip,
      currentTime: 1.1,
      phase: 'intro',
    })
  ).toEqual(
    expect.objectContaining({
      accentWidthMultiplier: 1,
      blurPx: 0,
      headlineRevealProgress: 1,
      maskProgress: 1,
      opacityMultiplier: 1,
      scaleMultiplier: 1,
      shimmerProgress: null,
      sublineRevealProgress: 1,
    })
  );
}

function expectTargetAwareIntroStates() {
  const connectorState = resolveAnimationState({
    animation: VideoOverlayAnimationKind.CONNECTOR_DRAW,
    clip: {
      ...createClip(),
      templateKind: VideoOverlayTemplateKind.CALLOUT_CONNECTOR,
    },
    currentTime: 1.18,
    phase: 'intro',
  });
  const anchorState = resolveAnimationState({
    animation: VideoOverlayAnimationKind.ANCHOR_POP,
    clip: {
      ...createClip(),
      templateKind: VideoOverlayTemplateKind.POINTER_LABEL,
    },
    currentTime: 1.18,
    phase: 'intro',
  });

  expect(connectorState.connectorProgress).toBeGreaterThan(0);
  expect(anchorState.markerProgress).toBeGreaterThan(0);
}

it('resolves intro and outro motion branches across supported animation families', () => {
  const blurClip = {
    ...createClip(),
    introAnimation: VideoOverlayAnimationKind.SOFT_BLUR_REVEAL,
  };
  const blurState = resolveAnimationState({
    animation: blurClip.introAnimation,
    clip: blurClip,
    currentTime: 1.25,
    phase: 'intro',
  });
  expect(blurState.blurPx).toBeGreaterThan(0);

  const slideClip = {
    ...createClip(),
    direction: 'RIGHT' as const,
    introAnimation: VideoOverlayAnimationKind.SLIDE_LEFT_FADE,
  };
  const slideState = resolveAnimationState({
    animation: slideClip.introAnimation,
    clip: slideClip,
    currentTime: 1.25,
    phase: 'intro',
  });
  expect(slideState.translateX).toBeGreaterThan(0);

  const outroClip = {
    ...createClip(),
    direction: 'DOWN' as const,
    outroAnimation: VideoOverlayAnimationKind.SLIDE_UP_FADE,
  };
  const outroState = resolveAnimationState({
    animation: outroClip.outroAnimation,
    clip: outroClip,
    currentTime: 3.75,
    phase: 'outro',
  });
  expect(outroState.opacityMultiplier).toBeLessThan(1);
  expect(outroState.translateY).toBeLessThan(0);
});

it('keeps reveal, shimmer, and static states deterministic across template phases', () => {
  const baseClip = createClip();
  expectStaticIntroState(baseClip);

  const revealClip = { ...createClip(), introAnimation: VideoOverlayAnimationKind.REVEAL_MASK };
  const revealState = resolveAnimationState({
    animation: revealClip.introAnimation,
    clip: revealClip,
    currentTime: 1.2,
    phase: 'intro',
  });
  expect(revealState.maskProgress).toBeLessThan(1);
  expect(revealState.headlineProgress).toBeLessThan(1);
  expect(revealState.headlineRevealProgress).toBeLessThan(revealState.headlineProgress);

  const shimmerEntryState = resolveAnimationState({
    animation: VideoOverlayAnimationKind.SHIMMER_ENTRY,
    clip: createClip(),
    currentTime: 1.18,
    phase: 'intro',
  });
  expect(shimmerEntryState.shimmerProgress).not.toBeNull();
  expectTargetAwareIntroStates();
});

function expectScaleAndShimmerMotion() {
  const scaleClip = createTemplateAnimationClip(
    VideoOverlayAnimationKind.SCALE_FADE,
    VideoOverlayTemplateKind.LOWER_THIRD_STACKED,
    'intro'
  );
  const scaleState = resolveTestAnimationState(scaleClip, scaleClip.introAnimation, 1.22, 'intro');
  expect(scaleState.scaleMultiplier).toBeGreaterThan(1);

  const shimmerSweepClip = createTemplateAnimationClip(
    VideoOverlayAnimationKind.SHIMMER_SWEEP,
    VideoOverlayTemplateKind.SHIMMER_LABEL,
    'outro'
  );
  const shimmerSweepState = resolveTestAnimationState(
    shimmerSweepClip,
    shimmerSweepClip.outroAnimation,
    3.85,
    'outro'
  );
  expect(shimmerSweepState.glossProgress).not.toBeNull();
  expect(shimmerSweepState.shimmerProgress).toBeNull();
  return scaleState;
}

function expectAccentAndRevealMotion(scaleState: ReturnType<typeof resolveTestAnimationState>) {
  const accentClip = createTemplateAnimationClip(
    VideoOverlayAnimationKind.SLIDE_LEFT_FADE,
    VideoOverlayTemplateKind.LOWER_THIRD_ACCENT,
    'intro'
  );
  const accentState = resolveTestAnimationState(
    accentClip,
    accentClip.introAnimation,
    1.2,
    'intro'
  );
  expect(accentState.accentProgress).toBeGreaterThan(accentState.headlineProgress);
  expect(accentState.accentWidthMultiplier).toBeLessThan(1);

  const reveal3dClip = createTemplateAnimationClip(
    VideoOverlayAnimationKind.THREE_D_REVEAL,
    VideoOverlayTemplateKind.THREE_D_REVEAL_CARD,
    'intro'
  );
  const reveal3dState = resolveTestAnimationState(
    reveal3dClip,
    reveal3dClip.introAnimation,
    1.2,
    'intro'
  );
  expect(reveal3dState.scaleMultiplier).toBeGreaterThan(scaleState.scaleMultiplier);
  expect(reveal3dState.glossProgress).not.toBeNull();
}

it('separates scale, gloss, and layered stagger across richer motion families', () => {
  expectAccentAndRevealMotion(expectScaleAndShimmerMotion());
});

function createTemplatePresentationClip(
  project: ReturnType<typeof createEmptyVideoProject>,
  templateKind: VideoOverlayTemplateKind
) {
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    1,
    templateKind
  );
  clip.duration = 3;
  clip.introDurationMs = 500;
  return clip;
}

it('applies template-specific reveal profiles to presentation effects', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const accentClip = createTemplatePresentationClip(
    project,
    VideoOverlayTemplateKind.LOWER_THIRD_ACCENT
  );
  const titleClip = createTemplatePresentationClip(project, VideoOverlayTemplateKind.TITLE_REVEAL);

  const accentPresentation = resolveAnnotationPresentation(project, accentClip, 1.18);
  const titlePresentation = resolveAnnotationPresentation(project, titleClip, 1.18);

  expect(accentPresentation.effects.accentWidthMultiplier).toBeLessThan(1);
  expect(titlePresentation.effects.headlineRevealProgress).toBeLessThan(
    accentPresentation.effects.headlineRevealProgress
  );
});

it('aligns side reveal panels to the selected edge and slides from outside it', () => {
  const project = createEmptyVideoProject('Templates', 1200, 600);
  const clip = createAnnotationClip(
    project.tracks[2]!.id,
    project.width,
    project.height,
    1,
    VideoOverlayTemplateKind.SIDE_REVEAL_PANEL
  );

  expect(resolveAnnotationPresentation(project, clip, 1.4).frame).toMatchObject({
    height: 600,
    width: 408,
    x: 0,
    y: 0,
  });

  clip.direction = VideoTemplateDirection.RIGHT;
  expect(resolveAnnotationPresentation(project, clip, 1.4).frame.x).toBe(792);
  expect(resolveAnnotationPresentation(project, clip, 1.05).effects.translateX).toBeGreaterThan(
    300
  );
});

it('keeps steady-state lower-thirds sharp while preserving blur-based intro motion', () => {
  const project = createEmptyVideoProject('Templates', 1280, 720);
  const steadyClip = createAnnotationClip(project.tracks[2]!.id, project.width, project.height, 1);
  steadyClip.duration = 4;
  steadyClip.introAnimation = VideoOverlayAnimationKind.SLIDE_UP_FADE;
  steadyClip.outroAnimation = VideoOverlayAnimationKind.REVEAL_MASK;

  expect(resolveAnnotationPresentation(project, steadyClip, 2).effects.blurPx).toBe(0);

  const blurIntroClip = {
    ...steadyClip,
    introAnimation: VideoOverlayAnimationKind.SOFT_BLUR_REVEAL,
  };
  expect(resolveAnnotationPresentation(project, blurIntroClip, 1.1).effects.blurPx).toBeGreaterThan(
    0
  );
});
