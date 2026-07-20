import { expect, it } from 'vitest';
import { createAnnotationClip } from '../factories/overlay-clip';
import { hydrateVideoProject } from './index';
import {
  getLegacyAnnotationTemplateRef,
  resolveVideoAnnotationTemplate,
} from '../annotation-engine';
import { createProject, createTextClip } from '../timeline/project-meta.test.helpers.ts';
import { VideoClipTransitionKind, VideoTransitionKind } from '../types/index';

function createInvalidAnnotationProject() {
  const project = createProject([createTextClip()]);
  const annotationClip = createAnnotationClip(
    project.tracks[0]!.id,
    project.width,
    project.height,
    1
  );
  const trailingClip = createTextClip({
    id: 'text-overlap',
    startTime: 1.5,
    trackId: project.tracks[0]!.id,
  });

  annotationClip.introAnimation = 'invalid' as never;
  annotationClip.outroAnimation = 'invalid' as never;
  annotationClip.templateKind = 'invalid' as never;
  annotationClip.direction = 'invalid' as never;
  annotationClip.intensity = 'invalid' as never;
  annotationClip.introDurationMs = -10;
  annotationClip.outroDurationMs = -20;
  annotationClip.content = { badge: 4 as never, headline: 1 as never, subline: null as never };
  annotationClip.style = { accentColor: '#123456' } as never;
  trailingClip.transitionIn = VideoClipTransitionKind.CROSSFADE;
  annotationClip.transitionOut = VideoClipTransitionKind.CROSSFADE;
  project.clips = [annotationClip, trailingClip];
  project.transitions = [
    {
      duration: 0.5,
      easing: 'LINEAR',
      id: 'transition-annotation',
      kind: VideoTransitionKind.CROSSFADE,
      leadingClipId: annotationClip.id,
      trailingClipId: trailingClip.id,
    } as never,
  ];

  return project;
}

function expectHydratedAnnotationNormalization(
  hydrated: ReturnType<typeof hydrateVideoProject>
): void {
  const hydratedClip = hydrated.clips[0];
  const hydratedTransition = hydrated.transitions?.find(
    (transition) => transition.id === 'transition-annotation'
  );

  expect(hydratedClip).toEqual(
    expect.objectContaining({
      annotationFamily: 'LOWER_THIRD',
      direction: 'LEFT',
      intensity: 'BALANCED',
      introAnimation: 'SLIDE_UP_FADE',
      introDurationMs: 0,
      motionFamily: 'SLIDE_CARD',
      outroAnimation: 'REVEAL_MASK',
      outroDurationMs: 0,
      renderFamily: 'PLATE',
      target: 'NONE',
      templateKind: 'LOWER_THIRD_BASIC',
      templateRef: getLegacyAnnotationTemplateRef('LOWER_THIRD_BASIC'),
    })
  );
  expect(hydratedClip && 'content' in hydratedClip ? hydratedClip.content : null).toEqual({
    badge: null,
    headline: '',
    subline: '',
  });
  expect(hydratedTransition).toBeUndefined();
}

function createInvalidTargetAwareAnnotationProject() {
  const project = createProject([createTextClip()]);
  const clip = createAnnotationClip(
    project.tracks[0]!.id,
    project.width,
    project.height,
    0,
    'CALLOUT_CONNECTOR'
  );

  clip.annotationFamily = 'invalid' as never;
  clip.calloutDecor = {
    arrowKind: 'invalid',
    frameKind: 'invalid',
    markerKind: 'invalid',
    pulseKind: 'invalid',
  } as never;
  clip.leaderLine = {
    direction: 'invalid',
    enabled: true,
    length: -20,
    style: 'invalid',
    thickness: 0,
  } as never;
  clip.motionFamily = 'invalid' as never;
  clip.renderFamily = 'invalid' as never;
  clip.target = 'invalid' as never;
  clip.targetPoint = { x: 18, y: 24 };
  clip.targetRect = { height: -5, width: -10, x: 12, y: 16 } as never;
  project.clips = [clip];

  return project;
}

function expectHydratedTargetAwareNormalization(hydrated: ReturnType<typeof hydrateVideoProject>) {
  const hydratedClip = hydrated.clips[0];

  expect(hydratedClip).toEqual(
    expect.objectContaining({
      annotationFamily: 'LOWER_THIRD',
      motionFamily: 'SLIDE_CARD',
      renderFamily: 'PLATE',
      target: 'NONE',
    })
  );
  expect(hydratedClip && 'leaderLine' in hydratedClip ? hydratedClip.leaderLine : null).toEqual({
    direction: 'LEFT',
    enabled: true,
    length: 0,
    style: 'STRAIGHT',
    thickness: 1,
  });
  expect(hydratedClip && 'calloutDecor' in hydratedClip ? hydratedClip.calloutDecor : null).toEqual(
    {
      arrowKind: 'NONE',
      frameKind: 'NONE',
      markerKind: 'NONE',
      pulseKind: 'NONE',
    }
  );
  expect(hydratedClip && 'targetRect' in hydratedClip ? hydratedClip.targetRect : null).toEqual({
    height: 0,
    width: 0,
    x: 12,
    y: 16,
  });
}

it('normalizes annotation template clips and removes invalid annotation transitions', () => {
  expectHydratedAnnotationNormalization(hydrateVideoProject(createInvalidAnnotationProject()));
});

it('normalizes target-aware annotation fields during hydration', () => {
  expectHydratedTargetAwareNormalization(
    hydrateVideoProject(createInvalidTargetAwareAnnotationProject())
  );
});

it('preserves old annotation clips with enough template data for engine resolution', () => {
  const project = createProject([createTextClip()]);
  const annotationClip = createAnnotationClip(
    project.tracks[0]!.id,
    project.width,
    project.height,
    0,
    'CALLOUT_CONNECTOR'
  );
  delete annotationClip.templateRef;
  delete annotationClip.templateControlValues;
  delete annotationClip.templateSnapshot;
  project.clips = [annotationClip];

  const hydrated = hydrateVideoProject(project);
  const clip = hydrated.clips[0];

  expect(clip && 'templateRef' in clip ? clip.templateRef : null).toEqual(
    getLegacyAnnotationTemplateRef('CALLOUT_CONNECTOR')
  );
  expect(clip && 'templateSnapshot' in clip ? clip.templateSnapshot : null).toBeNull();
  expect(clip && 'templateKind' in clip ? resolveVideoAnnotationTemplate(clip).status : null).toBe(
    'resolved'
  );
});
