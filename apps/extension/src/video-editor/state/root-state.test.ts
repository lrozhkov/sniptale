import { describe, expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import {
  type VideoProjectAudioClip,
  type VideoProjectVideoClip,
  VideoMotionFocusMode,
  VideoClipTransitionKind,
  VideoClipLinkMode,
  VideoMediaFitMode,
  VideoTemporalEasing,
  VideoProjectClipType,
} from '../../features/video/project/types';
import {
  createVideoEditorTimelineState,
  resolveInitialSelectedClipId,
  resolveSelectedTrackId,
} from './root-state';
import type { VideoEditorState } from './types';

function createBaseClip(options: { duration?: number; id: string; trackId: string }) {
  return {
    id: options.id,
    trackId: options.trackId,
    name: options.id,
    groupId: null,
    linkMode: VideoClipLinkMode.DETACHED,
    startTime: 0,
    duration: options.duration ?? 3,
    muted: false,
    volume: 1,
    fadeInMs: 0,
    fadeOutMs: 0,
    transitionIn: VideoClipTransitionKind.NONE,
    transitionOut: VideoClipTransitionKind.NONE,
    transform: {
      x: 0,
      y: 0,
      width: 100,
      height: 100,
      rotation: 0,
      opacity: 1,
    },
  };
}

function createAudioClip(options: {
  duration?: number;
  id: string;
  trackId: string;
}): VideoProjectAudioClip {
  return {
    ...createBaseClip(options),
    type: VideoProjectClipType.AUDIO,
    assetId: 'asset-audio',
    sourceStart: 0,
    sourceDuration: options.duration ?? 3,
  };
}

function createVideoClip(options: {
  duration?: number;
  id: string;
  trackId: string;
}): VideoProjectVideoClip {
  return {
    ...createBaseClip(options),
    type: VideoProjectClipType.VIDEO,
    assetId: 'asset-video',
    fitMode: VideoMediaFitMode.CONTAIN,
    sourceStart: 0,
    sourceDuration: options.duration ?? 3,
  };
}

function createRecordedTimelineState() {
  let state = {} as VideoEditorState;
  const set: Parameters<typeof createVideoEditorTimelineState>[0] = (partial) => {
    const nextState = typeof partial === 'function' ? partial(state as never) : partial;

    state = {
      ...state,
      ...nextState,
    };
  };

  state = createVideoEditorTimelineState(set) as VideoEditorState;

  return {
    getState: () => state,
  };
}

describe('video editor store timeline initial selection helpers', () => {
  it('prefers the first non-audio clip for the initial selection', () => {
    const project = createEmptyVideoProject('Demo');
    const [primaryTrack, audioTrack] = project.tracks;
    project.clips = [
      createAudioClip({
        id: 'audio-1',
        trackId: audioTrack!.id,
      }),
      createVideoClip({
        id: 'video-1',
        trackId: primaryTrack!.id,
      }),
    ];

    expect(resolveInitialSelectedClipId(project)).toBe('video-1');
  });

  it('falls back to the first clip when the project only has audio clips', () => {
    const project = createEmptyVideoProject('Demo');
    const [, audioTrack] = project.tracks;
    project.clips = [
      createAudioClip({
        id: 'audio-1',
        trackId: audioTrack!.id,
      }),
    ];

    expect(resolveInitialSelectedClipId(project)).toBe('audio-1');
  });
});

describe('video editor store timeline track selection helpers', () => {
  it('resolves the selected track from the selected clip id', () => {
    const project = createEmptyVideoProject('Demo');
    const [primaryTrack, audioTrack] = project.tracks;
    project.clips = [
      createVideoClip({
        id: 'video-1',
        trackId: primaryTrack!.id,
      }),
      createAudioClip({
        id: 'audio-1',
        trackId: audioTrack!.id,
      }),
    ];

    expect(
      resolveSelectedTrackId(
        {
          project,
          selectedTrackId: primaryTrack!.id,
        },
        'audio-1'
      )
    ).toBe(audioTrack!.id);
  });

  it('falls back to the current track when the clip is not found', () => {
    const project = createEmptyVideoProject('Demo');
    const [primaryTrack] = project.tracks;

    expect(
      resolveSelectedTrackId(
        {
          project,
          selectedTrackId: primaryTrack!.id,
        },
        'missing'
      )
    ).toBe(primaryTrack!.id);
  });
});

describe('video editor store timeline project state owner', () => {
  it('hydrates project state and export defaults when a project loads', verifyProjectHydration);
  it(
    'clamps time, resolves selected track, and toggles playback through state actions',
    verifyTimelineActions
  );
  it('updates the project through the canonical hydration path', verifyProjectUpdateHydration);
});

function verifyProjectHydration(): void {
  const timeline = createRecordedTimelineState();
  const project = createEmptyVideoProject('Demo', 1440, 900);

  timeline.getState().setProject(project, 'rec-1');

  expect(timeline.getState()).toMatchObject({
    error: null,
    exportState: {
      settings: expect.objectContaining({
        height: 900,
        width: 1440,
      }),
    },
    isReady: true,
    project: expect.objectContaining({ name: 'Demo' }),
    recordingId: 'rec-1',
  });
}

function verifyTimelineActions(): void {
  const timeline = createRecordedTimelineState();
  const project = createEmptyVideoProject('Demo');
  const [primaryTrack, audioTrack] = project.tracks;
  project.duration = 12;
  project.clips = [
    createVideoClip({ id: 'video-1', trackId: primaryTrack!.id }),
    createAudioClip({ id: 'audio-1', trackId: audioTrack!.id }),
  ];

  timeline.getState().setProject(project);
  timeline.getState().setCurrentTime(100);
  timeline.getState().selectClip('audio-1');
  timeline.getState().togglePlaying();

  expect(timeline.getState()).toMatchObject({
    currentTime: 12,
    isPlaying: true,
    selectedClipId: 'audio-1',
    selectedTrackId: audioTrack!.id,
  });
}

function verifyProjectUpdateHydration(): void {
  const timeline = createRecordedTimelineState();
  const project = createEmptyVideoProject('Before');

  timeline.getState().setProject(project);
  timeline.getState().updateProject((currentProject) => ({
    ...currentProject,
    name: 'After',
  }));

  expect(timeline.getState().project?.name).toBe('After');
}

describe('video editor store timeline control state owner', () => {
  it('updates readiness, diagnostics, and simple selection controls through state actions', () => {
    const timeline = createRecordedTimelineState();
    const project = createEmptyVideoProject('Scene');
    project.motionRegions = [
      {
        duration: 1,
        easing: VideoTemporalEasing.LINEAR,
        focusMode: VideoMotionFocusMode.MANUAL,
        focusPoint: { x: 10, y: 20 },
        id: 'motion-1',
        scale: 1.2,
        startTime: 0,
        targetActionEventId: null,
        zoomInDuration: 0.1,
        zoomOutDuration: 0.1,
      },
    ];

    timeline.getState().setProject(project);
    timeline.getState().setReady(true);
    timeline.getState().setError('broken');
    timeline.getState().setSaveState('saving');
    timeline.getState().setPixelsPerSecond(999);
    timeline.getState().selectTrack('track-1');
    timeline.getState().selectMotionRegion('motion-1');
    timeline.getState().setDiagnosticsOpen(true);

    expect(timeline.getState()).toMatchObject({
      diagnosticsOpen: true,
      error: 'broken',
      isReady: true,
      pixelsPerSecond: 320,
      saveState: 'saving',
      selectedTrackId: 'track-1',
      selection: { kind: 'motion-region', motionRegionId: 'motion-1' },
    });
  });
});
