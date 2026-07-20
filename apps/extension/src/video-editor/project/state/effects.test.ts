import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoCursorAnimationPreset,
  VideoMotionFocusMode,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  type VideoProjectTransition,
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoTemporalEasing,
  VideoTimelinePlacementMode,
  VideoTransitionEasing,
  VideoTransitionKind,
} from '../../../features/video/project/types';
import { createVideoEditorProjectTestStore } from './test-store.test-support';
import type { VideoEditorProjectState } from './contracts';

function createStoreState() {
  return createVideoEditorProjectTestStore();
}

function createImageClip(id: string, trackId: string, startTime: number, assetId: string) {
  return {
    id,
    trackId,
    type: 'IMAGE',
    name: id,
    groupId: null,
    linkMode: 'DETACHED',
    startTime,
    duration: 3,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId,
    fitMode: 'CONTAIN',
  } as never;
}

function createEffectActionEvent() {
  return {
    data: {},
    duration: 0.4,
    id: 'action-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 10, y: 20 },
    preset: VideoProjectActionPreset.CLICK_RIPPLE,
    time: 0.1,
  };
}

function createEffectCursorTrack(): NonNullable<
  ReturnType<typeof createEmptyVideoProject>['cursorTrack']
> {
  return {
    captureMode: VideoCursorCaptureMode.SEPARATE,
    samples: [{ id: 'sample-1', time: 0.1, visible: true, x: 10, y: 20 }],
    skin: {
      animationPreset: VideoCursorAnimationPreset.NONE,
      color: '#fff',
      hidden: false,
      preset: VideoCursorVisualPreset.ARROW,
      scale: 1,
      shadow: true,
    },
  };
}

function createEffectMotionRegion() {
  return {
    duration: 1.5,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 50, y: 60 },
    id: 'motion-1',
    scale: 1.4,
    startTime: 0,
    targetActionEventId: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.2,
  };
}

function createEffectTransition(): VideoProjectTransition {
  return {
    direction: 'LEFT',
    duration: 1,
    easing: VideoTransitionEasing.LINEAR,
    highlightColor: '#f97316',
    id: 'transition-1',
    kind: VideoTransitionKind.CROSSFADE,
    intensity: 'BALANCED',
    leadingClipId: 'clip-a',
    renderKind: 'COMPOSITE',
    templateKind: 'CROSSFADE',
    trailingClipId: 'clip-b',
  };
}

function createEffectTemporalOwners() {
  return {
    actionEvents: [createEffectActionEvent()],
    cursorTrack: createEffectCursorTrack(),
    motionRegions: [createEffectMotionRegion()],
    transitions: [createEffectTransition()],
  };
}

function createEffectProject() {
  const project = createEmptyVideoProject('Effects');
  const [primaryTrack] = project.tracks;
  const temporalOwners = createEffectTemporalOwners();

  project.timelinePlacementMode = VideoTimelinePlacementMode.ALLOW_OVERLAP;
  project.clips = [
    createImageClip('clip-a', primaryTrack!.id, 0, 'asset-a'),
    createImageClip('clip-b', primaryTrack!.id, 2, 'asset-b'),
  ];
  project.transitions = temporalOwners.transitions;
  project.cursorTrack = temporalOwners.cursorTrack;
  project.actionEvents = temporalOwners.actionEvents;
  project.motionRegions = temporalOwners.motionRegions;

  return project;
}

function applyEffectMutations(store: ReturnType<typeof createStoreState>) {
  store.getState().updateTransitionEasing('transition-1', VideoTransitionEasing.EASE_IN_OUT);
  store.getState().updateTransitionDuration('transition-1', 0.5);
  store.getState().updateTransitionTemplate('transition-1', {
    direction: 'RIGHT',
    intensity: 'BOLD',
    templateKind: 'LIGHT_SWEEP',
  });
  store.getState().updateCursorSampleVisibility('sample-1', false);
  store.getState().updateCursorSampleInterpolation('sample-1', VideoTemporalEasing.EASE_OUT);
  store.getState().updateCursorSampleSkinOverride('sample-1', {
    color: '#22cc88',
    scale: 1.6,
    shadow: false,
  });
  store.getState().updateActionEventDetails('action-1', {
    duration: 0.8,
    label: 'Spotlight',
    point: { x: 2500, y: -10 },
    preset: VideoProjectActionPreset.SPOTLIGHT,
  });
  store.getState().updateMotionRegion('motion-1', {
    duration: 4,
    scale: 10,
    targetActionEventId: 'action-1',
    zoomOutDuration: 8,
  });
  store.getState().deleteMotionRegion('missing-motion');
}

function expectEffectMutationResults(nextProject: NonNullable<VideoEditorProjectState['project']>) {
  expect(nextProject.transitions).toEqual([
    expect.objectContaining({
      direction: 'RIGHT',
      easing: VideoTransitionEasing.EASE_IN_OUT,
      intensity: 'BOLD',
      kind: 'LIGHT_SWEEP',
      renderKind: 'CSS_LIKE',
      templateKind: 'LIGHT_SWEEP',
    }),
  ]);
  expect(nextProject.clips.find((clip) => clip.id === 'clip-b')?.startTime).toBe(2.5);
  expect(nextProject.cursorTrack?.samples[0]).toEqual(
    expect.objectContaining({
      interpolation: VideoTemporalEasing.EASE_OUT,
      skinOverride: {
        animationPreset: VideoCursorAnimationPreset.NONE,
        color: '#22cc88',
        hidden: false,
        preset: VideoCursorVisualPreset.ARROW,
        scale: 1.6,
        shadow: false,
      },
      visible: false,
    })
  );
  expect(nextProject.actionEvents[0]).toEqual(
    expect.objectContaining({
      duration: 0.8,
      kind: VideoProjectActionEventKind.CALLOUT,
      label: 'Spotlight',
      point: { x: 1920, y: 0 },
      preset: VideoProjectActionPreset.SPOTLIGHT,
    })
  );
  expect(nextProject.motionRegions).toEqual([
    expect.objectContaining({
      duration: 4,
      scale: 4,
      targetActionEventId: 'action-1',
      zoomOutDuration: 4,
    }),
  ]);
}

describe('video editor project effects', () => {
  it(
    'updates transition easing and duration, cursor visibility, and action preset details',
    verifyEffectMutations
  );
  it('covers no-op and preset-kind branches for effect updaters', verifyEffectNoOpBranches);
  it('deletes motion regions through the effect action surface', verifyMotionRegionDelete);
  it(
    'supports cursor sample insertion and deletion plus action deletion through effect owners',
    verifyCursorAndActionCrud
  );
});

function verifyEffectMutations() {
  const store = createStoreState();
  store.getState().setProject(createEffectProject());

  applyEffectMutations(store);

  expectEffectMutationResults(store.getState().project!);
}

function verifyEffectNoOpBranches() {
  const store = createStoreState();
  store.getState().setProject(createEffectProject());

  store.getState().updateTransitionDuration('missing', 1);
  store.getState().updateTransitionTemplate('missing', { templateKind: 'PUSH' });
  store.getState().updateCursorSampleVisibility('missing', false);
  store.getState().updateCursorSampleSkinOverride('missing', { color: '#ff00aa' });
  store.getState().clearCursorSampleSkinOverride('missing');
  store.getState().updateActionEventDetails('action-1', {
    preset: VideoProjectActionPreset.DWELL_ZOOM,
  });
  expect(store.getState().project?.actionEvents[0]?.kind).toBe(VideoProjectActionEventKind.PAUSE);
  store.getState().updateActionEventDetails('action-1', {
    preset: VideoProjectActionPreset.SCROLL_EMPHASIS,
  });
  expect(store.getState().project?.actionEvents[0]?.kind).toBe(VideoProjectActionEventKind.SCROLL);
  store.getState().updateActionEventDetails('action-1', { preset: VideoProjectActionPreset.NONE });
  expect(store.getState().project?.actionEvents[0]?.kind).toBe(VideoProjectActionEventKind.CLICK);
}

function verifyMotionRegionDelete() {
  const store = createStoreState();
  store.getState().setProject(createEffectProject());

  store.getState().deleteMotionRegion('motion-1');

  expect(store.getState().project?.motionRegions).toEqual([]);
}

function verifyCursorAndActionCrud() {
  const store = createStoreState();
  const project = createEffectProject();
  store.getState().setProject(project);
  store.getState().selectActionSegment('action-1');
  store.getState().startActionPointPlacement('action-1');
  store.getState().deleteActionEvent('action-1');
  store.getState().insertCursorSample(0.2);

  const insertedSample = store
    .getState()
    .project?.cursorTrack?.samples.find((sample) => sample.time === 0.2);
  expect(insertedSample).toEqual(
    expect.objectContaining({
      interpolation: VideoTemporalEasing.LINEAR,
      visible: true,
    })
  );

  store.getState().selectCursorSegment('sample-1');
  store.getState().clearCursorSampleSkinOverride('sample-1');
  store.getState().deleteCursorSample('sample-1');

  expect(store.getState().project?.actionEvents).toEqual([]);
  expect(store.getState().placementMode).toBeNull();
  expect(store.getState().selection).toEqual({ kind: 'scene' });
  expect(
    store.getState().project?.cursorTrack?.samples.some((sample) => sample.id === 'sample-1')
  ).toBe(false);
}
