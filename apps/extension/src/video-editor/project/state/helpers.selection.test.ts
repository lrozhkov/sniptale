import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../../features/video/project/factories/creation';
import {
  VideoProjectActionEventKind,
  VideoProjectActionPreset,
  VideoMotionFocusMode,
  VideoCursorAnimationPreset,
  VideoCursorCaptureMode,
  VideoCursorVisualPreset,
  VideoTemporalEasing,
  VideoTransitionEasing,
  VideoTransitionKind,
} from '../../../features/video/project/types';
import { applyProjectUpdate } from './helpers';
import type { VideoEditorProjectState } from './contracts';

function createVideoSelectionClip(trackId: string) {
  return {
    id: 'video-1',
    trackId,
    type: 'VIDEO',
    name: 'Video 1',
    groupId: null,
    linkMode: 'DETACHED',
    startTime: 0,
    duration: 4,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
    assetId: 'asset-1',
    fitMode: 'CONTAIN',
    sourceStart: 0,
    sourceDuration: 4,
  } as never;
}

function createAudioSelectionClip(trackId: string) {
  return {
    id: 'audio-1',
    trackId,
    type: 'AUDIO',
    name: 'Audio 1',
    groupId: null,
    linkMode: 'DETACHED',
    startTime: 0,
    duration: 4,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: 'NONE',
    transitionOut: 'NONE',
    transform: { x: 0, y: 0, width: 0, height: 0, rotation: 0, opacity: 1 },
    assetId: 'asset-1',
    sourceStart: 0,
    sourceDuration: 4,
  } as never;
}

function attachSelectionTemporalOwners(project: ReturnType<typeof createEmptyVideoProject>) {
  project.transitions = [createSelectionTransition()];
  project.cursorTrack = createSelectionCursorTrack();
  project.actionEvents = [createSelectionActionEvent()];
  project.motionRegions = [createSelectionMotionRegion()];
}

function createSelectionTransition() {
  return {
    duration: 1,
    easing: VideoTransitionEasing.LINEAR,
    id: 'transition-1',
    kind: VideoTransitionKind.CROSSFADE,
    leadingClipId: 'video-1',
    trailingClipId: 'audio-1',
  };
}

function createSelectionCursorTrack(): NonNullable<
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

function createSelectionActionEvent() {
  return {
    data: {},
    duration: 0.4,
    id: 'action-1',
    kind: VideoProjectActionEventKind.CLICK,
    label: 'Click',
    point: { x: 10, y: 20 },
    preset: VideoProjectActionPreset.CLICK_RIPPLE,
    time: 0.2,
  };
}

function createSelectionMotionRegion() {
  return {
    duration: 1.4,
    easing: VideoTemporalEasing.EASE_IN_OUT,
    focusMode: VideoMotionFocusMode.MANUAL,
    focusPoint: { x: 120, y: 140 },
    id: 'motion-1',
    scale: 1.5,
    startTime: 0.1,
    targetActionEventId: null,
    zoomInDuration: 0.2,
    zoomOutDuration: 0.2,
  };
}

function createSelectionProject() {
  const project = createEmptyVideoProject('Selections');
  const [primaryTrack, audioTrack] = project.tracks;
  project.clips = [
    createVideoSelectionClip(primaryTrack!.id),
    createAudioSelectionClip(audioTrack!.id),
  ];
  attachSelectionTemporalOwners(project);

  return project;
}

describe('video editor project helper selection cleanup', () => {
  it('falls back to scene selection when transition, cursor, action, or motion targets disappear', () => {
    const project = createSelectionProject();
    const selectedTrackId = project.tracks[0]!.id;

    expectSceneSelectionAfterProjectUpdate(
      project,
      selectedTrackId,
      {
        kind: 'transition-junction',
        transitionId: 'transition-1',
      },
      (currentProject) => ({ ...currentProject, transitions: [] })
    );
    expectSceneSelectionAfterProjectUpdate(
      project,
      selectedTrackId,
      { kind: 'cursor-segment', sampleId: 'sample-1' },
      (currentProject) => ({ ...currentProject, cursorTrack: null })
    );
    expectSceneSelectionAfterProjectUpdate(
      project,
      selectedTrackId,
      { actionEventId: 'action-1', kind: 'action-segment' },
      (currentProject) => ({ ...currentProject, actionEvents: [] })
    );
    expectSceneSelectionAfterProjectUpdate(
      project,
      selectedTrackId,
      { kind: 'motion-region', motionRegionId: 'motion-1' },
      (currentProject) => ({ ...currentProject, motionRegions: [] })
    );
  });
});

function expectSceneSelectionAfterProjectUpdate(
  project: ReturnType<typeof createSelectionProject>,
  selectedTrackId: string,
  selection: VideoEditorProjectState['selection'],
  updater: (
    project: ReturnType<typeof createSelectionProject>
  ) => ReturnType<typeof createSelectionProject>
) {
  expect(
    applyProjectUpdate(
      {
        currentTime: 0,
        project,
        selectedClipId: null,
        selectedTrackId,
        selection,
      } as VideoEditorProjectState,
      updater
    ).selection
  ).toEqual({ kind: 'scene' });
}
