import { expect, it } from 'vitest';
import {
  resolveClipTransitionAudioMultiplier,
  resolveClipTransitionVisualState,
  resolveTransitionOverlays,
} from './presentation';
import { IDENTITY_TRANSITION_VISUAL_STATE } from './presentation.types.ts';
import { getClipCompositeAudioGain, getClipCompositeVisualOpacity } from '../timeline/presentation';
import { createEmptyVideoProject } from '../factories/creation';
import type { VideoProject, VideoProjectTransition, VideoProjectVideoClip } from '../types/index';

function createBaseProject(): VideoProject {
  const project = createEmptyVideoProject('Transitions', 1280, 720);
  const primaryTrackId = project.tracks[0]?.id ?? '';

  return {
    ...project,
    clips: [
      createBaseClip(primaryTrackId, 'clip-a', 0),
      createBaseClip(primaryTrackId, 'clip-b', 3),
    ],
  };
}

function createBaseClip(trackId: string, id: string, startTime: number): VideoProjectVideoClip {
  return {
    assetId: id === 'clip-a' ? 'asset-a' : 'asset-b',
    duration: 4,
    fadeInMs: 0,
    fadeOutMs: 0,
    fitMode: 'CONTAIN',
    groupId: null,
    id,
    linkMode: 'DETACHED',
    muted: false,
    name: id === 'clip-a' ? 'Clip A' : 'Clip B',
    sourceDuration: 4,
    sourceStart: 0,
    startTime,
    trackId,
    transform: { height: 720, opacity: 1, rotation: 0, width: 1280, x: 0, y: 0 },
    transitionIn: id === 'clip-a' ? 'NONE' : 'CROSSFADE',
    transitionOut: id === 'clip-a' ? 'CROSSFADE' : 'NONE',
    type: 'VIDEO',
    volume: 1,
  };
}

it('resolves directional push motion for overlapping clips', () => {
  const project = {
    ...createBaseProject(),
    transitions: [
      {
        direction: 'LEFT',
        duration: 1,
        easing: 'LINEAR',
        id: 'transition-1',
        intensity: 'BALANCED',
        kind: 'PUSH',
        leadingClipId: 'clip-a',
        renderKind: 'COMPOSITE',
        templateKind: 'PUSH',
        trailingClipId: 'clip-b',
      },
    ],
  };
  const leadingClip = project.clips[0]!;
  const trailingClip = project.clips[1]!;

  const leadingState = resolveClipTransitionVisualState(
    project as never,
    leadingClip as never,
    3.5
  );
  const trailingState = resolveClipTransitionVisualState(
    project as never,
    trailingClip as never,
    3.5
  );

  expect(leadingState.translateX).toBeLessThan(0);
  expect(trailingState.translateX).toBeGreaterThan(0);
  expect(
    resolveClipTransitionAudioMultiplier(project as never, leadingClip as never, 3.5)
  ).toBeCloseTo(0.5);
});

it('resolves screen-space overlays for dip and light sweep families', () => {
  const project = {
    ...createBaseProject(),
    transitions: [
      {
        duration: 1,
        easing: 'LINEAR',
        highlightColor: '#f8fafc',
        id: 'transition-light-fade',
        kind: 'FADE_THROUGH_LIGHT',
        leadingClipId: 'clip-a',
        renderKind: 'COMPOSITE',
        templateKind: 'FADE_THROUGH_LIGHT',
        trailingClipId: 'clip-b',
      },
      {
        duration: 1,
        easing: 'LINEAR',
        highlightColor: '#0ea5e9',
        id: 'transition-fill',
        kind: 'DIP_TO_COLOR',
        leadingClipId: 'clip-a',
        renderKind: 'COMPOSITE',
        templateKind: 'DIP_TO_COLOR',
        trailingClipId: 'clip-b',
      },
      {
        direction: 'RIGHT',
        duration: 1,
        easing: 'LINEAR',
        highlightColor: '#f97316',
        id: 'transition-sweep',
        kind: 'LIGHT_SWEEP',
        leadingClipId: 'clip-a',
        renderKind: 'CSS_LIKE',
        templateKind: 'LIGHT_SWEEP',
        trailingClipId: 'clip-b',
      },
    ],
  };

  expect(resolveTransitionOverlays(project as never, 3.5)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ color: '#f8fafc', kind: 'fill' }),
      expect.objectContaining({ color: '#0ea5e9', kind: 'fill' }),
      expect.objectContaining({ color: '#f97316', kind: 'sweep' }),
    ])
  );
});

it(
  'covers remaining visual-state families and ignores overlays for non-overlay transitions',
  verifyAdditionalTransitionFamilies
);
it('covers directional, staged, and identity transition-state branches', verifyStateBranchCoverage);

function verifyAdditionalTransitionFamilies() {
  const crossfadeTransition = createTransitionFixture('transition-fixture-crossfade', 'CROSSFADE');
  const lightFadeTransition = createTransitionFixture(
    'transition-light-fade',
    'FADE_THROUGH_LIGHT',
    {
      highlightColor: '#f8fafc',
    }
  );
  const cardFlipTransition = createTransitionFixture('transition-flip', 'CARD_FLIP_REVEAL', {
    direction: 'UP',
    intensity: 'BOLD',
    renderKind: 'CSS_LIKE',
  });
  const blurTransition = createTransitionFixture('transition-blur', 'BLUR_REVEAL', {
    intensity: 'SOFT',
  });
  const project = {
    ...createBaseProject(),
    transitions: [crossfadeTransition, cardFlipTransition, blurTransition],
  };
  const leadingClip = project.clips[0]!;
  const trailingClip = project.clips[1]!;

  verifyCrossfadeAndLightFadeFamilies(
    project as never,
    leadingClip as never,
    trailingClip as never,
    crossfadeTransition,
    lightFadeTransition
  );
  verifyCardFlipAndBlurFamilies(
    project as never,
    leadingClip as never,
    trailingClip as never,
    cardFlipTransition,
    blurTransition
  );
}

function verifyCrossfadeAndLightFadeFamilies(
  project: VideoProject,
  leadingClip: VideoProjectVideoClip,
  trailingClip: VideoProjectVideoClip,
  crossfadeTransition: VideoProjectTransition,
  lightFadeTransition: VideoProjectTransition
) {
  project.transitions = [crossfadeTransition];
  expect(resolveTransitionOverlays(project as never, 3.5)).toEqual([]);
  expect(resolveClipTransitionVisualState(project as never, leadingClip as never, 3.5)).toEqual(
    expect.objectContaining({ opacityMultiplier: 0.5 })
  );
  expect(getClipCompositeAudioGain(project as never, trailingClip as never, 3.5)).toBeCloseTo(0.5);

  project.transitions = [lightFadeTransition];
  expect(resolveTransitionOverlays(project as never, 3.5)).toEqual(
    expect.arrayContaining([expect.objectContaining({ color: '#f8fafc', kind: 'fill' })])
  );
  expect(resolveClipTransitionVisualState(project as never, leadingClip as never, 3.5)).toEqual(
    expect.objectContaining({ blurAmount: expect.any(Number), opacityMultiplier: 0.54 })
  );
}

function verifyCardFlipAndBlurFamilies(
  project: VideoProject,
  leadingClip: VideoProjectVideoClip,
  trailingClip: VideoProjectVideoClip,
  cardFlipTransition: VideoProjectTransition,
  blurTransition: VideoProjectTransition
) {
  project.transitions = [cardFlipTransition];
  expect(resolveClipTransitionVisualState(project as never, trailingClip as never, 3.5)).toEqual(
    expect.objectContaining({
      opacityMultiplier: 0.5,
      scaleY: expect.any(Number),
      translateY: expect.any(Number),
    })
  );

  project.transitions = [blurTransition];
  expect(resolveClipTransitionVisualState(project as never, leadingClip as never, 3.5)).toEqual(
    expect.objectContaining({ blurAmount: expect.any(Number), opacityMultiplier: 0.55 })
  );
  expect(getClipCompositeVisualOpacity(project as never, leadingClip as never, 3.5)).toBeLessThan(
    1
  );
  expect(resolveClipTransitionAudioMultiplier(project as never, leadingClip as never, 5)).toBe(1);
}

function verifyStateBranchCoverage() {
  const slideTransition = createTransitionFixture('transition-slide', 'SLIDE', {
    direction: 'DOWN',
    intensity: 'BALANCED',
  });
  const dipTransition = createTransitionFixture('transition-dip', 'DIP_TO_COLOR');
  const zoomTransition = createTransitionFixture('transition-zoom', 'ZOOM_DISSOLVE', {
    intensity: 'BOLD',
  });
  const cardFlipTransition = createTransitionFixture('transition-card-flip', 'CARD_FLIP_REVEAL', {
    direction: 'RIGHT',
  });
  const project = createBaseProject();
  const leadingClip = project.clips[0]!;
  const trailingClip = project.clips[1]!;

  project.transitions = [slideTransition];
  expect(resolveClipTransitionVisualState(project as never, leadingClip as never, 3.5)).toEqual(
    expect.objectContaining({ opacityMultiplier: 0.88, translateY: expect.any(Number) })
  );

  project.transitions = [dipTransition];
  expect(resolveClipTransitionVisualState(project as never, trailingClip as never, 3.75)).toEqual(
    expect.objectContaining({ opacityMultiplier: 0.5 })
  );

  project.transitions = [zoomTransition];
  const zoomState = resolveClipTransitionVisualState(project as never, trailingClip as never, 3.5);
  expect(zoomState.opacityMultiplier).toBeCloseTo(0.5);
  expect(zoomState.scaleX).toBeGreaterThan(1);
  expect(zoomState.scaleY).toBeGreaterThan(1);

  project.transitions = [cardFlipTransition];
  const cardFlipState = resolveClipTransitionVisualState(
    project as never,
    leadingClip as never,
    3.5
  );
  expect(cardFlipState.opacityMultiplier).toBeLessThan(1);
  expect(cardFlipState.scaleX).toBeLessThan(1);

  project.transitions = [];
  expect(resolveClipTransitionVisualState(project as never, leadingClip as never, 2)).toEqual(
    IDENTITY_TRANSITION_VISUAL_STATE
  );
  expect(resolveClipTransitionAudioMultiplier(project as never, leadingClip as never, 2)).toBe(1);
}

function createTransitionFixture(
  id: string,
  kind: VideoProjectTransition['kind'],
  overrides: Partial<VideoProjectTransition> = {}
): VideoProjectTransition {
  return {
    duration: 1,
    easing: 'LINEAR',
    id,
    kind,
    leadingClipId: 'clip-a',
    renderKind: 'COMPOSITE',
    templateKind: kind,
    trailingClipId: 'clip-b',
    ...overrides,
  };
}
