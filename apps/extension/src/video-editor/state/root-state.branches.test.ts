import { expect, it } from 'vitest';
import { createEmptyVideoProject } from '../../features/video/project/factories/creation';
import { createVideoEditorTimelineState } from './root-state';
import type { VideoEditorState } from './types';

function createRecordedTimelineState() {
  let state = {} as VideoEditorState;
  const set: Parameters<typeof createVideoEditorTimelineState>[0] = (partial) => {
    const nextState = typeof partial === 'function' ? partial(state as never) : partial;
    state = { ...state, ...nextState };
  };

  state = createVideoEditorTimelineState(set) as VideoEditorState;
  return { getState: () => state };
}

it('covers direct track and clip selection branches including null fallbacks', () => {
  const timeline = createRecordedTimelineState();
  const project = createEmptyVideoProject('Demo');
  const [primaryTrack] = project.tracks;
  project.clips = [
    {
      id: 'clip-1',
      trackId: primaryTrack!.id,
      type: 'IMAGE',
      name: 'Clip 1',
      groupId: null,
      linkMode: 'DETACHED',
      startTime: 0,
      duration: 3,
      muted: false,
      volume: 1,
      fadeInMs: 0,
      fadeOutMs: 0,
      transitionIn: 'NONE',
      transitionOut: 'NONE',
      transform: { x: 0, y: 0, width: 100, height: 100, rotation: 0, opacity: 1 },
      assetId: 'asset-1',
      fitMode: 'CONTAIN',
    } as never,
  ];

  timeline.getState().setProject(project);
  timeline.getState().selectTrack(primaryTrack!.id);
  expect(timeline.getState().selection).toEqual({
    kind: 'track',
    trackId: primaryTrack!.id,
  });

  timeline.getState().selectClip('clip-1');
  expect(timeline.getState().selection).toEqual({
    clipId: 'clip-1',
    kind: 'clip',
  });

  timeline.getState().selectClip(null);
  expect(timeline.getState().selection).toEqual({ kind: 'scene' });
  timeline.getState().selectTrack(null);
  expect(timeline.getState().selection).toEqual({ kind: 'scene' });
});

it('covers selection fallbacks for scene and transition branches', () => {
  const timeline = createRecordedTimelineState();
  const project = createEmptyVideoProject('Demo');
  const [primaryTrack] = project.tracks;
  project.transitions = [
    {
      duration: 1,
      easing: 'LINEAR',
      id: 'transition-1',
      kind: 'CROSSFADE',
      leadingClipId: 'missing-clip-a',
      trailingClipId: 'missing-clip-b',
    } as never,
  ];

  timeline.getState().setProject(project);
  timeline.getState().selectTrack(primaryTrack!.id);
  timeline.getState().selectTransition('transition-1');
  expect(timeline.getState().selectedTrackId).toBe(primaryTrack!.id);

  timeline.getState().selectTrack(null);
  timeline.getState().selectScene();
  expect(timeline.getState().selectedTrackId).toBe(primaryTrack!.id);
});

it('preserves current track selection for cursor and action segments', () => {
  const timeline = createRecordedTimelineState();
  const project = createEmptyVideoProject('Demo');
  const [primaryTrack] = project.tracks;

  timeline.getState().setProject(project);
  timeline.getState().selectTrack(primaryTrack!.id);
  timeline.getState().selectCursorSegment('sample-1');
  expect(timeline.getState().selectedTrackId).toBe(primaryTrack!.id);

  timeline.getState().selectActionSegment('action-1');
  expect(timeline.getState().selectedTrackId).toBe(primaryTrack!.id);
});

it('covers playback and project action helpers in the timeline state owner', () => {
  const timeline = createRecordedTimelineState();
  const project = createEmptyVideoProject('Demo');
  project.duration = 10;

  timeline.getState().setProject(project);
  timeline.getState().updateProject((currentProject) => ({
    ...currentProject,
    name: 'Updated demo',
  }));
  timeline.getState().setCurrentTime(12);
  timeline.getState().setPlaying(true);
  timeline.getState().setPixelsPerSecond(10);
  timeline.getState().setDiagnosticsOpen(true);
  timeline.getState().setReady(false);
  timeline.getState().setError('timeline-error');
  timeline.getState().setSaveState('saved');

  expect(timeline.getState()).toMatchObject({
    currentTime: 0,
    diagnosticsOpen: true,
    error: 'timeline-error',
    isPlaying: true,
    isReady: false,
    pixelsPerSecond: 12,
    saveState: 'saved',
  });
  expect(timeline.getState().project?.name).toBe('Updated demo');
});
